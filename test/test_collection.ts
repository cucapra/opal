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

test('empty collection', function (t: any) {
  let c = Collection.collection<number>();
  t.assert(contents_equal(c.view(), []));
  t.end();
});

test('add', function (t: any) {
  let c = Collection.collection<number>();
  c = Collection.add(c, 1);
  t.assert(contents_equal(c.view(), [1]));
  t.end();
});

test('add and then remove', function (t: any) {
  let c = Collection.collection<number>();
  c = Collection.add(c, 1);
  c = Collection.del(c, 1);
  t.assert(contents_equal(c.view(), []));
  t.end();
});

test('merge with addition on base', function (t: any) {
  let c = Collection.collection<number>();
  c = Collection.add(c, 1);
  let d = Collection.add(c, 2);
  let e = Collection.merge(d, c);
  t.assert(contents_equal(e.view(), [1, 2]));
  t.end();
});
