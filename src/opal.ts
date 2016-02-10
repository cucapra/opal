'use strict';

// A simple "holder" for a promise that keeps its callbacks for later use.
// This is useful when you want to call `then` on a promise but you don't know
// where the "upstream" part of the chain will come from yet. Later, when you
// want to complete the chain, you can call `resolve()` or `reject()` or even
// connect up another promise with `.then(jar.resolve, jar.reject)`.
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


// A communication channel between hypothetical worlds and their parents.
class Weight<T> {
  jars: Map<World, PromiseJar<T>>;

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

  set(world: World, value: T) {
    this.jar(world).resolve(value);
  }

  get(world: World): Promise<T> {
    return this.jar(world).promise;
  }
}


// A fundamental world-aware data structure. This wraps a PSet per world where
// it is used. Each world's PSet is updated in-place, imperatively.
class Collection<T> {
  sets: Map<World, PSet.Node<T>>;

  constructor(public owner: World, init?: PSet.Node<T>) {
    if (!init) {
      init = PSet.set<T>();
    }

    this.sets = new Map();
    this.sets.set(owner, init);
  }

  // Get the underlying PSet for a given World. If it does not exist yet,
  // create it (as a snapshot of its parent world's set).
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

  // Replace the current set for a given world. The world must have an old
  // set associated with it.
  update(world: World, set: PSet.Node<T>) {
    console.assert(this.sets.has(world), "updating set that does not exist");
    this.sets.set(world, set);
  }

  // If the collection has any updates for this world, merge them into the
  // parent's collection.
  merge(world: World) {
    if (this.sets.has(world)) {
      let child_set = this.sets.get(world);
      let parent_set = this.lookup(world.parent);
      this.update(world.parent, PSet.merge(parent_set, child_set));
    }
  }
}

// An *external* collection is one where updates affect the world outside of
// OPAL.
abstract class ExternalCollection<T> extends Collection<T> {
  // Subclasses should implement `send`, which defines what happens when
  // modifications need to affect the outside world.
  abstract send(old: PSet.Node<T>, ops: PSet.Operation<T>[]): PSet.Node<T>;

  update(world: World, set: PSet.Node<T>) {
    if (world instanceof TopWorld) {
      // Assume for now that the new set is a *descendant* of the old set, so
      // we just need to replay the operations "in between" the old and new
      // sets.
      let old = this.lookup(world);
      let log = set.log(new Set([old]));
      let newset = this.send(old, log);
      super.update(world, newset);
    } else {
      super.update(world, set);
    }
  }
}


// The World components concerned with lazy evaluation. This lets worlds
// suspend themselves (voluntarily) and *only* run when demanded to.
class Lazy {
  // The next step to take, when this thread is suspended.
  private next: () => void;

  // The number of times this thread has been acquired.
  private waiters: number;

  private finish_jar: PromiseJar<void>;

  constructor() {
    this.waiters = 0;
    this.next = null;
    this.finish_jar = new PromiseJar<void>();
  }

  // Load the function to execute. Threads start in a suspended state, so you
  // have to call `acquire` after this to get the thread to actually start
  // executing.
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

  // A promise you can await to know when this function has finished
  // executing.
  finish(): Promise<void> {
    return this.finish_jar.promise;
  }

  acquire() {
    this.waiters++;
    if (this.next) {
      console.assert(this.waiters === 1);
      let next = this.next;
      this.next = null;
      next();
    }
  }

  release() {
    this.waiters--;
    console.assert(this.waiters >= 0);
    console.assert(this.next === null);
  }

  active() {
    return this.waiters > 0;
  }

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


// Type aliases for the coroutines that form the basis of hypothetical worlds.
type AsyncFunc = (ctx: Context) => Promise<void>;


// A World is a dynamic instance of a hypothetical block. It wraps a coroutine
// with additional state and utilities for managing the world's context.
class World extends Lazy {
  subworlds: Set<World>;

  // Collections used (or created) in this world.
  collections: Set<Collection<any>>;

  constructor(public parent: World, func: AsyncFunc) {
    super();
    this.subworlds = new Set();
    this.collections = new Set();
    this.run(() => func(new Context(this)));
  }
}


// A container for functionality available within the context of a world.
class Context {
  constructor(public world: World) {}

  // Create a new child world of this one.
  hypothetical(func: AsyncFunc): World {
    let world = new World(this.world, func);
    this.world.subworlds.add(world);
    return world;
  }

  // Create a new weight for communication between this world and a subworld.
  weight<T>(): Weight<T> {
    return new Weight<T>(this.world);
  }

  // Set a weight.
  async set<T>(weight: Weight<T>, value: T) {
    weight.set(this.world, value);
    await this.world.suspend();
  }

  // Get a weight.
  async get<T>(weight: Weight<T>, subworld: World) {
    let promise = (async function () {
      let result = await weight.get(subworld);
      subworld.release();
      return result;
    })();
    subworld.acquire();
    return await promise;
  }

  // Create a new collection.
  collection<T>(): Collection<T> {
    let c = new Collection<T>(this.world);
    this.world.collections.add(c);
    return c;
  }

  // Add to a collection.
  add<T>(collection: Collection<T>, value: T) {
    let s = PSet.add(collection.lookup(this.world), value);
    collection.update(this.world, s);
    this.world.collections.add(collection);
  }

  // Remove from a collection.
  del<T>(collection: Collection<T>, value: T) {
    let s = PSet.del(collection.lookup(this.world), value);
    collection.update(this.world, s);
    this.world.collections.add(collection);
  }

  // Get the contents of a collection.
  view<T>(collection: Collection<T>) {
    return collection.lookup(this.world).view();
  }

  // Commit the collection modifications of a sub-world.
  async commit(subworld: World) {
    // Complete executing the world in question.
    subworld.acquire();
    await subworld.finish();

    // Merge all of its modified Collections.
    for (let coll of subworld.collections) {
      coll.merge(subworld);
    }
  }

  // Explore many hypothetical worlds.
  *explore<T>(domain: Iterable<T>,
      func: (choice: T) => AsyncFunc): Iterable<World>
  {
    for (let value of domain) {
      yield this.hypothetical(func(value));
    }
  }

  // Find the world that minimizes a given weight.
  async minimize(worlds: Iterable<World>, weight: Weight<number>, limit?: number) {
    let count = 0;
    let min_weight: number = null;
    let min_world: World = null;
    for (let world of worlds) {
      let w = await this.get(weight, world);
      if (min_weight === null || w < min_weight) {
        min_weight = w;
        min_world = world;
      }

      ++count;
      if (limit && count >= limit) {
        break;
      }
    }

    return min_world;
  }
}


// The topmost world has no parent and gets a special designation.
class TopWorld extends World {
  constructor(public func: AsyncFunc) {
    super(null, func);
  }
}


// A top-level entry point that constructs the initial, top-level world.
function opal(func: AsyncFunc) {
  let world = new TopWorld(func);
  world.acquire();  // Run to completion.
}
