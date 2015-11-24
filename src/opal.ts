'use strict';

// The base class for events emitted inside hypothetical worlds to be consumed
// by the OPAL runtime.
class Message {
}

// A communication channel between hypothetical worlds and their parents.
class Weight<T> {
  values: Map<number, T>;
  constructor(public world: World) {
    this.values = new Map();
  }
  
  set(value: T) {
    // ...
  }
}

// Type aliases for the coroutines that form the basis of hypothetical worlds.
type WorldCoroutine = IterableIterator<Message>;
type WorldCoroutineFunc = (w: World) => WorldCoroutine;

// A World is a dynamic instance of a hypothetical block. It wraps a coroutine
// with additional state and utilities for managing the world's context.
class World {
  coroutine: WorldCoroutine;
  subworlds: Set<World>;
  
  constructor(public parent: World, func: WorldCoroutineFunc) {
    this.subworlds = new Set();
    this.coroutine = func(this);
  }
  
  // Create a new child world of this one.
  hypothetical(func: WorldCoroutineFunc) {
    let world = new World(this, func);
    this.subworlds.add(world);
  }
  
  // Create a new weight for communication between this world and a subworld.
  weight<T>(): Weight<T> {
    return new Weight<T>(this);
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
}
