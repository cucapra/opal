'use strict';

// The base class for events emitted inside hypothetical worlds to be consumed
// by the OPAL runtime.
abstract class Message {
  // Execute the command in the context of a given world.
  abstract dispatch(world: World, then: (res: any) => void): any;
}

class SetMessage <T> extends Message {
  constructor(public weight: Weight<T>, public value: T) {
    super();
  }

  dispatch(world: World, then: (res: any) => void) {
    this.weight.values.set(world, this.value);
    then(null);
  }
}

class GetMessage <T> extends Message {
  constructor(public weight: Weight<T>, public subworld: World) {
    super();
  }

  dispatch(world: World, then: (res: any) => void) {
    // TODO check that it's actually a subworld

    // Wait for the value to be available (or for the world to exit).
    this.subworld.run(() => !this.weight.values.has(this.subworld));

    console.assert(this.weight.values.has(this.subworld),
        "world exited without setting value");

    then(this.weight.values.get(this.subworld));
  }
}

class CommitMessage extends Message {
  constructor(public subworld: World) {
    super();
  }

  dispatch(world: World, then: (res: any) => void) {
    // Run the world to completion.
    this.subworld.run(() => {
      // Merge all of its modified Collections.
      for (let coll of this.subworld.collections) {
        coll.merge(this.subworld);
      }
      then(null);
    });
  }
}


// A communication channel between hypothetical worlds and their parents.
class Weight<T> {
  values: Map<World, T>;
  constructor(public world: World) {
    this.values = new Map();
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


// Type aliases for the coroutines that form the basis of hypothetical worlds.
type WorldCoroutine = IterableIterator<Message>;
type WorldCoroutineFunc = (ctx: Context) => WorldCoroutine;


// A World is a dynamic instance of a hypothetical block. It wraps a coroutine
// with additional state and utilities for managing the world's context.
class World {
  coroutine: WorldCoroutine;
  subworlds: Set<World>;

  active: boolean;
  next_value: any;

  // Collections used (or created) in this world.
  collections: Set<Collection<any>>;

  constructor(public parent: World, func: WorldCoroutineFunc) {
    this.subworlds = new Set();
    this.coroutine = func(new Context(this));

    this.active = true;
    this.next_value = null;
    this.collections = new Set();
  }

  // Iterate the world to completion (asynchronously) while an optional
  // condition remains true.
  run_while(cond: () => boolean, then: () => void) {
    this.advance(() => {
      if (!this.active || (cond && !cond())) {
        // Finished.
        then();
        return;
      }

      // Keep going.
      this.run_while(cond, then);
    });
  }

  // As above but with no condition.
  run(then: () => void) {
    this.run_while(() => true, then);
  }

  // Execute the world for a single step and then invoke a callback. If the
  // world emits a message (i.e. it's not finished yet), the message is
  // executed. If the world is finished, set `active` to false.
  advance(then: () => void) {
    console.assert(this.active, "world must be active to advance");
    let n = this.coroutine.next(this.next_value);
    if (n.done) {
      this.active = false;
      this.next_value = null;
      then();
    } else {
      n.value.dispatch(this, (res: any) => {
        this.next_value = res;
        then();
      });
    }
  }
}


// A container for functionality available within the context of a world.
class Context {
  constructor(public world: World) {}

  // Create a new child world of this one.
  hypothetical(func: WorldCoroutineFunc): World {
    let world = new World(this.world, func);
    this.world.subworlds.add(world);
    return world;
  }

  // Create a new weight for communication between this world and a subworld.
  weight<T>(): Weight<T> {
    return new Weight<T>(this.world);
  }

  // Set a weight.
  set<T>(weight: Weight<T>, value: T): SetMessage<T> {
    return new SetMessage(weight, value);
  }

  // Get a weight.
  get<T>(weight: Weight<T>, subworld: World): GetMessage<T> {
    return new GetMessage(weight, subworld);
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
  commit(subworld: World): CommitMessage {
    return new CommitMessage(subworld);
  }
}


// The topmost world has no parent and gets a special designation.
class TopWorld extends World {
  constructor(public func: WorldCoroutineFunc) {
    super(null, func);
  }
}


// A top-level entry point that constructs the initial, top-level world.
function opal(func: WorldCoroutineFunc) {
  let world = new TopWorld(func);
  world.run(() => {});
}
