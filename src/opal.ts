'use strict';

import * as PSet from './pset';

/**
 * Create a JavaScript ordering function given a function that looks up an
 * element's key. For example, use:
 *
 *     array.sort(orderBy((o) => o.f));
 *
 * to sort by an object's `f` field.
 */
export function orderBy<S, T>(f: (v: S) => T) {
  return (a: S, b: S) => {
    let aKey = f(a);
    let bKey = f(b);
    if (aKey < bKey) {
      return -1;
    } else if (aKey > bKey) {
      return 1;
    } else {
      return 0;
    }
  }
}


/**
 * A promise utility for delayed resolution.
 *
 * This is useful when you want to call `then` on a promise but you don't know
 * where the "upstream" part of the chain will come from yet. Later, when you
 * want to complete the chain, you can call `resolve()` or `reject()` or even
 * connect up another promise with `.then(jar.resolve, jar.reject)`.
 */
class PromiseJar<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: any) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}


//
/**
 * A communication channel between hypothetical worlds and their parents.
 *
 * A child world can write to a weight using `ctx.set` and its parent can
 * read that value using `ctx.get`.
 */
class Weight<T> {
  jars: Map<World, PromiseJar<T>>;

  /**
   * Create a new weight.
   *
   * @param world   The parent ("home") world.
   */
  constructor(public world: World) {
    this.jars = new Map();
  }

  private jar(world: World): PromiseJar<T> {
    if (this.jars.has(world)) {
      return this.jars.get(world);
    } else {
      let s = new PromiseJar<T>();
      this.jars.set(world, s);
      return s;
    }
  }

  /**
   * Set the weight's value for a given child world.
   */
  set(world: World, value: T) {
    this.jar(world).resolve(value);
  }

  /**
   * Get the weight's value for a given child world.
   */
  get(world: World): Promise<T> {
    return this.jar(world).promise;
  }
}


/**
 * A world-aware set data structure.
 *
 * Worlds have isolated views onto `Collection`s: the changes they make will
 * only be visible to themselves until they are committed.
 */
export class Collection<T> {
  /**
   * The underlying `PSet`s for each world that has an interest in this
   * `Collection`.
   */
  sets: Map<World, PSet.Node<T>>;

  /**
   * Create a new `Collection`.
   *
   * @param owner  The parent ("home") world for the collection.
   * @param init   Optionally, the initial set for the owner world. Otherwise,
   *               the set starts out empty.
   */
  constructor(public owner: World, init?: PSet.Node<T>) {
    if (!init) {
      init = PSet.set<T>();
    }

    this.sets = new Map();
    this.sets.set(owner, init);
  }

  /**
   * Get the underlying PSet for a given World.
   *
   * If the set does not exist yet, create it as a snapshot of the
   * world's parent's view.
   */
  lookup(world: World): PSet.Node<T> {
    if (this.sets.has(world)) {
      return this.sets.get(world);
    } else {
      console.assert(world.parent != null,
                     "collection not defined in any ancestor");
      let parent_set = this.lookup(world.parent);
      this.sets.set(world, parent_set);
      return parent_set;
    }
  }

  /**
   * Replace the current set for a given world.
   *
   * The world must have an old set associated with it.
   */
  update(world: World, set: PSet.Node<T>) {
    console.assert(this.sets.has(world),
        "updating set that does not exist: %j not in %j", world, this.sets);
    this.sets.set(world, set);
  }

  /**
   * Apply any updates in a child wolrd to its parent's view of the
   * collection.
   */
  merge(world: World) {
    if (this.sets.has(world)) {
      let child_set = this.sets.get(world);
      let parent_set = this.lookup(world.parent);
      this.update(world.parent, PSet.merge(parent_set, child_set));
    }
  }
}

/**
 * An *external collection* is a `Collection` where updates affect the
 * world outside of OPAL.
 *
 * Subclasses override the `send` method to implement their semantics.
 */
export abstract class ExternalCollection<T> extends Collection<T> {
  /**
   * Apply a new sequence of operations to the "real world."
   *
   * This is called whenever operations are applied in the top-level OPAL
   * world or committed to the top-level world from some child world.
   */
  abstract send(old: PSet.Node<T>, ops: PSet.Operation<T>[]): PSet.Node<T>;

  update(world: World, set: PSet.Node<T>) {
    if (world instanceof TopWorld) {
      // Assume for now that the new set is a *descendant* of the old set, so
      // we just need to replay the operations "in between" the old and new
      // sets.
      let old = this.lookup(world);
      let log = set.log(old);
      let newset = this.send(old, log);
      super.update(world, newset);
    } else {
      super.update(world, set);
    }
  }
}

/**
 * An *edit* contains a set of hypothetical changes to a collection.
 */
export class Edit<T> {
  constructor(private ops: PSet.Operation<T>[]) {}

  /**
   * Compute a score for this diff.
   *
   * @param scoring  A function that assigns a score to any value. This is
   *                 used as a positive weight for newly added items and a
   *                 negative weight for newly removed items.
   * @returns        The total score.
   */
  score(scoring: (value: T) => number): number {
    let total = 0;
    this.foreach({
      add(value) {
        total += scoring(value);
      },
      delete(value) {
        total -= scoring(value);
      },
    });
    return total;
  }

  /**
   * Loop over the actions in a diff.
   *
   * @param actions  A struct containing functions indicating what to do with
   *                 each operation type.
   */
  foreach(actions: EditActions<T>) {
    for (let op of this.ops) {
      if (op instanceof PSet.Add && actions.add) {
        actions.add(op.value);
      } else if (op instanceof PSet.Delete && actions.delete) {
        actions.delete(op.value);
      }
    }
  }
}

/**
 * A struct containing actions for `Edit.foreach`.
 */
interface EditActions<T> {
  add?: (value: T) => void;
  delete?: (value: T) => void;
}


/**
 * An abstract mechanism for coordinating lazy evaluation via promises.
 *
 * This provides the functionality for Worlds that lets them suspend
 * themselves (voluntarily) and *only* run when demanded to. Specifically,
 * the computation only advances when `acquire` has been called more times
 * than `release`.
 */
export class Lazy {
  /**
   * The next step to take, when this thread is suspended.
   */
  private next: () => void;

  /**
   * The number of times this thread has been acquired.
   */
  private waiters: number;

  /**
   * A promise that is triggered when the thread completes.
   */
  private finish_jar: PromiseJar<void>;

  constructor() {
    this.waiters = 0;
    this.next = null;
    this.finish_jar = new PromiseJar<void>();
  }

  /**
   * Load the function to execute.
   *
   * Threads start in a suspended state, so you have to call `acquire`
   * after this to get the thread to actually start executing.
   */
  run(func: () => Promise<void>) {
    this.next = () => {
      let p = func();

      // When the function succeeds, notify anyone who called `finish()`.
      p.then(this.finish_jar.resolve);

      // Handle and log errors in user code.
      p.catch((err) => {
        if (err.stack) {
          console.error(err.stack);
        } else {
          console.error(err);
        }
      });
    };
  }

  /**
   * Get a promise that you can `await` to get called when this thread
   * has finished executing.
   */
  finish(): Promise<void> {
    return this.finish_jar.promise;
  }

  /**
   * Instruct the thread to start executing eagerly. It will keep
   * executing until you call `release`.
   */
  acquire() {
    this.waiters++;
    if (this.next) {
      console.assert(this.waiters === 1);
      let next = this.next;
      this.next = null;
      next();
    }
  }

  /**
   * Tell the thread that you no longer need it to execute eagerly,
   * balancing an earlier `acquire` call.
   */
  release() {
    this.waiters--;
    console.assert(this.waiters >= 0);
    console.assert(this.next === null);
  }

  /**
   * Check whether anyone has called `acquire` but not `release`; i.e.,
   * anyone wants us to execute eagerly at the moment.
   */
  active() {
    return this.waiters > 0;
  }

  /**
   * Suspend execution *unless the thread is active*.
   */
  suspend(): Promise<void> {
    if (this.active()) {
      // We're active, so just continue executing.
      return Promise.resolve(null);
    } else {
      // Inactive, so actually suspend operation by saving the continuation.
      return new Promise<void>((resolve, reject) => {
        this.next = resolve;
      });
    }
  }
}


/**
 * The type of async functions used as the "body" of OPAL worlds.
 */
type AsyncFunc = (ctx: Context) => Promise<void>;


/**
 * An isolated thread of execution. In other words, a dynamic instance of an
 * OPAL `hypothetical` block.
 */
export class World extends Lazy {
  subworlds: Set<World>;

  /**
   * Collections used (or created) in this world.
   */
  collections: Set<Collection<any>>;

  constructor(public parent: World, func: AsyncFunc) {
    super();
    this.subworlds = new Set();
    this.collections = new Set();
    this.run(() => func(new Context(this)));
  }
}


/**
 * A wrapper for all the API calls available to OPAL code.
 *
 * A Context keeps track of the code's current OPAL world and provides
 * convenient ways to access it.
 */
export class Context {
  constructor(public world: World) {}

  /**
   * Create a new child world.
   *
   * @param func  The body code to execute in the new `World`.
   * @returns     A new `World` object.
   */
  hypothetical(func: AsyncFunc): World {
    let world = new World(this.world, func);
    this.world.subworlds.add(world);
    return world;
  }

  /**
   * Create a new `Weight` for communication between this world and a subworld.
   */
  weight<T>(): Weight<T> {
    return new Weight<T>(this.world);
  }

  /**
   * Set the value of a `Weight`.
   */
  async set<T>(weight: Weight<T>, value: T) {
    weight.set(this.world, value);
    await this.world.suspend();
  }

  /**
   * Get the value of a `Weight`.
   */
  async get<T>(weight: Weight<T>, subworld: World) {
    let promise = (async function () {
      let result = await weight.get(subworld);
      subworld.release();
      return result;
    })();
    subworld.acquire();
    return await promise;
  }

  /**
   * Create a new `Collection` based in this world.
   */
  collection<T>(): Collection<T> {
    let c = new Collection<T>(this.world);
    this.world.collections.add(c);
    return c;
  }

  /**
   * Add a value to a `Collection`.
   */
  add<T>(collection: Collection<T>, value: T) {
    let s = PSet.add(collection.lookup(this.world), value);
    collection.update(this.world, s);
    this.world.collections.add(collection);
  }

  /**
   * Remove a value from a `Collection`.
   */
  del<T>(collection: Collection<T>, value: T) {
    let s = PSet.del(collection.lookup(this.world), value);
    collection.update(this.world, s);
    this.world.collections.add(collection);
  }

  /**
   * Get the current contents of a collection as an `Iterable`.
   *
   * You can use `Array.from()` to get a JavaScript array from the iterable.
   */
  view<T>(collection: Collection<T>) {
    return collection.lookup(this.world).view();
  }

  /**
   * Get the contents of a collection *without* any local modifications.
   */
  clean_view<T>(collection: Collection<T>) {
    console.assert(this.world.parent !== null,
        "clean_view() not available in top-level world");
    let cur_set = collection.lookup(this.world);
    let parent_set = collection.lookup(this.world.parent);
    let ancestor = PSet.common(parent_set, cur_set);
    return ancestor.view();
  }

  /**
   * Get the set of changes that *would* be made to a collection if the
   * current world were committed into its parent.
   */
  diff<T>(collection: Collection<T>): Edit<T> {
    console.assert(this.world.parent !== null,
        "diff() not available in top-level world");
    let cur_set = collection.lookup(this.world);
    let parent_set = collection.lookup(this.world.parent);
    return new Edit(PSet.diff(parent_set, cur_set));
  }

  /**
   * Get the set of changes in a child world that would be made if we were to
   * commit it here.
   */
  diff_child<T>(world: World, collection: Collection<T>): Edit<T> {
    console.assert(world.parent === this.world,
        "diff_child() must be called on a child world");
    let child_set = collection.lookup(world);
    let parent_set = collection.lookup(this.world);
    return new Edit(PSet.diff(parent_set, child_set));
  }

  /**
   * Apply all the state updates from a subworld.
   *
   * This runs the subworld to completion and then merges all of its updates
   * to `Collection`s into the current world.
   */
  async commit(subworld: World) {
    // Complete executing the world in question.
    subworld.acquire();
    await subworld.finish();

    // Merge all of its modified Collections.
    for (let coll of subworld.collections) {
      coll.merge(subworld);
    }
  }

  /**
   * "Fork" several hypothetical worlds.
   *
   * @param domain  Create a new world for each value in the domain. The
   *                domain may be infinite.
   * @param func    The body of the new worlds, paramterized by a
   *                value selected from the domain.
   * @returns       An iterable of new `World`s (with the same cardinality
   *                as `domain`).
   */
  *explore<T>(domain: Iterable<T>,
      func: (choice: T) => AsyncFunc): Iterable<World>
  {
    for (let value of domain) {
      yield this.hypothetical(func(value));
    }
  }

  /**
   * Find the `World` that minimizes a given weight.
   *
   * @param worlds   The sequence of `World`s to search.
   * @param weight   The numerical weight to minimize.
   * @param limit    Optionally, the maximum number of worlds to consider.
   */
  async minimize(worlds: Iterable<World>, weight: Weight<number>, limit?: number) {
    return (await this.minimize_k(worlds, weight, 1, limit))[0];
  }

  /**
   * Find *k* worlds that minimize a weight.
   *
   * @param worlds   The sequence of `World`s to search. Could be produced
   *                 by `explore`, for example.
   * @param weight   The numerical weight to minimize.
   * @param count    Return at most `count` worlds.
   * @param limit    Optionally, the maximum number of worlds to consider.
   *                 Otherwise, all worlds are searched. If the `worlds`
   *                 sequence is infinite, you definitely want to provide
   *                 a limit.
   */
  async minimize_k(worlds: Iterable<World>, weight: Weight<number>,
                   count: number, limit?: number)
  {
    // Get the worlds and their weights.
    let worlds_flat: { world: World, value: number }[] = [];
    for (let world of worlds) {
      worlds_flat.push({
        world,
        value: await this.get(weight, world),
      });
      if (limit && worlds_flat.length >= limit) {
        break;
      }
    }

    // Sort by weight and return the prefix.
    worlds_flat.sort(orderBy((p: { world: World, value: number }) => p.value));
    return worlds_flat.slice(0, count).map((p) => p.world);
  }
}


/**
 * The top-level `World`.
 *
 * It is distinct from all other worlds because its actions can affect
 * the world outside of OPAL.
 */
class TopWorld extends World {
  constructor(public func: AsyncFunc) {
    super(null, func);
  }
}


/**
 * Create and invoke a top-level OPAL world.
 *
 * @returns A promise that resolves when OPAL execution finishes.
 */
export function opal(func: AsyncFunc): Promise<void> {
  let world = new TopWorld(func);
  world.acquire();  // Run to completion.
  return world.finish();
}
