/// <reference path="../src/collection.ts" />
/// <reference path="../typings/node/node.d.ts" />
/// <reference path="../typings/tape/tape.d.ts" />
'use strict';

let assert = require('assert');
let test = require('tape');

function contents_equal<T>(a: Iterable<T>, b: Iterable<T>) {
  let set: Set<T> = new Set();
  for (let bv of b) {
    set.add(bv);
  }

  let count = 0;
  for (let av of a) {
    if (!set.has(av)) {
      return false;
    }
    ++count;
  }
  return set.size === count;
}

test('add', function (t: any) {
  let c = Collection.collection<number>();
  c = Collection.add(c, 1);
  t.assert(contents_equal(c.view(), [1]));
  t.end();
});
