'use strict';

// The base class for events emitted inside hypothetical worlds to be consumed
// by the OPAL runtime.
abstract class Message {
  // Execute the command in the context of a given world.
  abstract dispatch(world: World): any;
}

class SetMessage <T> extends Message {
  constructor(public weight: Weight<T>, public value: T) {
    super();
  }

  dispatch(world: World) {
    this.weight.values.set(world, this.value);
  }
}

class GetMessage <T> extends Message {
  constructor(public weight: Weight<T>, public subworld: World) {
    super();
  }

  dispatch(world: World) {
    // TODO check that it's actually a subworld
    // TODO wait for the value to be available
    return this.weight.values.get(this.subworld);
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

  active: boolean;
  next_value: any;

  constructor(public parent: World, func: WorldCoroutineFunc) {
    this.subworlds = new Set();
    this.coroutine = func(new Context(this));

    this.active = true;
    this.next_value = null;
  }

  // Iterate the world to completion.
  run() {
    while (this.active) {
      this.advance();
    }
  }

  // Execute the world for a single step. If the world emits a message (i.e.
  // it's not finished yet), the message is executed. If the world is finished,
  // set `active` to false.
  advance() {
    console.assert(this.active, "world must be active to advance");
    let n = this.coroutine.next(this.next_value);
    if (n.done) {
      this.active = false;
      this.next_value = null;
    } else {
      this.next_value = n.value.dispatch(this);
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
