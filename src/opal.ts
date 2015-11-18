'use strict';

class Message {
}

class Weight<T> {
  values: { [world: string]: T};
}

class Context {
  worlds: Iterable<Event>[];

  hypothetical(f: GeneratorFunction) {
    this.worlds.push(f());
  }
}

let ctx = new Context();
ctx.hypothetical(function* () {
  yield new Message();
});
