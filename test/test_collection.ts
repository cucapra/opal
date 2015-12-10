/// <reference path="../src/collection.ts" />
/// <reference path="../typings/node/node.d.ts" />
'use strict';

let assert = require('assert');

function assert_equal<T>(a: Iterable<T>, b: Iterable<T>) {
  let set: Set<T> = new Set();
  for (let bv of b) {
    set.add(bv);
  }

  let count = 0;
  for (let av of a) {
    assert.assert(set.has(av));
    ++count;
  }
  assert.equal(set.size(), count);
}

(function () {
  let c = Collection.collection<number>();
  c = Collection.add(c, 1);
  assert_equal(c.view(), [1]);
})();
