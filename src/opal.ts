'use strict';

// The base class for events emitted inside hypothetical worlds to be consumed
// by the OPAL runtime.
class Message {
}

// A communication channel between hypothetical worlds and their parents.
class Weight<T> {
  values: Map<number, T>;
  constructor(public ctx: Context) {
    this.values = new Map();
  }
  
  set(value: T) {
    // ...
  }
}

// Type aliases for the coroutines that form the basis of hypothetical worlds.
type WorldCoroutine = IterableIterator<Message>;
type WorldCoroutineFunc = () => WorldCoroutine;

// A World is a dynamic instance of a hypothetical block. It mainly consists of
// a generator (coroutine) object.
class World {
  constructor(public ctx: Context,
              public id: number,
              public coroutine: WorldCoroutine) {}
}

class Context {
  worlds: Map<number, World>;
  next_world_id: number;
  
  constructor() {
    this.worlds = new Map();
  }

  // Create a new world.
  hypothetical(f: WorldCoroutineFunc) {
    let id = this.next_world_id;
    ++this.next_world_id;
    let world = new World(this, id, f());
    this.worlds.set(id, world);
  }
  
  // Create a new weight.
  weight<T>(): Weight<T> {
    return new Weight<T>(this);
  }
}
