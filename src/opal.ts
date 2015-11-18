'use strict';

class Context {
  worlds: Iterable<any>[];

  hypothetical(f: GeneratorFunction) {
    this.worlds.push(f());
  }
}

let ctx = new Context();
ctx.hypothetical(function* () {
  yield 1;
});
