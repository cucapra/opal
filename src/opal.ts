'use strict';

// The base class for events emitted inside hypothetical worlds to be consumed
// by the OPAL runtime.
class Message {
}

class SetMessage <T> extends Message {
  constructor(public weight: Weight<T>, public value: T) {
    super();
  }
}

class GetMessage <T> extends Message {
  constructor(public weight: Weight<T>, public subworld: World) {
    super();
  }
}

// A communication channel between hypothetical worlds and their parents.
class Weight<T> {
  values: Map<World, T>;
  constructor(public world: World) {
    this.values = new Map();
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
  
  constructor(public parent: World, func: WorldCoroutineFunc) {
    this.subworlds = new Set();
    this.coroutine = func(new Context(this));
  }
  
  // Iterate the world to completion.
  run() {
    let res: any = null;
    while (1) {
      let n = this.coroutine.next(res);
      if (n.done) {
        break;
      }
      res = this.handle(n.value);
    }
  }
  
  // Execute a single message on behalf of the world.
  handle(msg: Message): any {
    if (msg instanceof SetMessage) {
      msg.weight.values.set(this, msg.value);
      
    } else if (msg instanceof GetMessage) {
      // TODO check that it's actually a subworld
      // TODO wait for the value to be available
      return msg.weight.values.get(msg.subworld);
      
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
    world.run();  // TODO lazily
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
  world.run();
}
