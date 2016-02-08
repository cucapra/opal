'use strict';

// A communication channel between hypothetical worlds and their parents.
class Weight<T> {
  values: Map<World, T>;
  waiting: Map<World, ((v: T) => void)[]>; // TODO
  constructor(public world: World) {
    this.values = new Map();
  }

  async set(world: World, value: T) {
    this.values.set(world, value);
    if (this.waiting.has(world)) {
      for (let cbk of this.waiting.get(world)) {
        cbk(value);
      }
    }
  }

  get(world: World): Promise<T> {
    return new Promise(function(resolve, reject) {
      if (this.values.has(world)) {
        // Value available; resolve immediately.
        resolve(this.values.get(world));
      } else {
        // Not yet; add ourselves to the waiting list for the given world.
        if (this.waiting.get(world)) {
          this.waiting.set(world, [resolve]);
        } else {
          this.waiting.get(world).push(resolve);
        }
      }
    });
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
type WorldFunc = (ctx: Context) => Promise<void>;


// A World is a dynamic instance of a hypothetical block. It wraps a coroutine
// with additional state and utilities for managing the world's context.
class World {
  promise: Promise<Set<Collection<any>>>;

  subworlds: Set<World>;

  // Collections used (or created) in this world.
  collections: Set<Collection<any>>;

  constructor(public parent: World, public func: WorldFunc) {
    this.subworlds = new Set();
    this.collections = new Set();
    this.promise = this.run();
  }
  
  private async run() {
    await this.func(new Context(this));
    return this.collections;
  }
}


// A container for functionality available within the context of a world.
class Context {
  constructor(public world: World) {}

  // Create a new child world of this one.
  hypothetical(func: WorldFunc): World {
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
    await weight.set(this.world, value);
  }

  // Get a weight.
  async get<T>(weight: Weight<T>, subworld: World) {
    return await weight.get(subworld);
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
    // TODO
    let collections = await subworld.promise;

    // Merge all of its modified Collections.
    for (let coll of collections) {
      coll.merge(subworld);
    }
  }

  // Explore many hypothetical worlds.
  async explore<T>(domain: Iterable<T>, func: (choice: T) => WorldFunc)
  {
    for (let value of domain) {
      this.hypothetical(func(value));
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
  constructor(public func: WorldFunc) {
    super(null, func);
  }
}


// A top-level entry point that constructs the initial, top-level world.
function opal(func: WorldFunc) {
  new TopWorld(func);
}
