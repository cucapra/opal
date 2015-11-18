'use strict';

class Message {
}

class Weight<T> {
  values: Map<number, T>;
  constructor(public ctx: Context) {
    this.values = new Map();
  }
  
  set(value: T) {
    // ...
  }
}

class World {
  constructor(public ctx: Context,
              public id: number,
              public coroutine: Iterable<Message>) {}
}

class Context {
  worlds: Map<number, World>;
  next_world_id: number;
  
  constructor() {
    this.worlds = new Map();
  }

  // Create a new world.
  hypothetical(f: GeneratorFunction) {
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
