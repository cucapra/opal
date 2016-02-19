'use strict';

import {assert_set_equal} from './common';
import * as PSet from '../src/pset';

let test = require('tape');

test('empty set', function (t: any) {
  let c = PSet.set<number>();
  assert_set_equal(t, c.view(), []);
  t.end();
});

test('add', function (t: any) {
  let c = PSet.set<number>();
  c = PSet.add(c, 1);
  assert_set_equal(t, c.view(), [1]);
  t.end();
});

test('add and then remove', function (t: any) {
  let c = PSet.set<number>();
  c = PSet.add(c, 1);
  c = PSet.del(c, 1);
  assert_set_equal(t, c.view(), []);
  t.end();
});

test('merge with addition on base', function (t: any) {
  let c = PSet.set<number>();
  c = PSet.add(c, 1);

  let base = PSet.add(c, 2);

  let merged = PSet.merge(base, c);
  assert_set_equal(t, merged.view(), [1, 2]);
  t.end();
});

test('merge with addition on overlay', function (t: any) {
  let c = PSet.set<number>();
  c = PSet.add(c, 1);

  let overlay = PSet.add(c, 2);

  let merged = PSet.merge(c, overlay);
  assert_set_equal(t, merged.view(), [1, 2]);
  t.end();
});

test('merge with deletion on base', function (t: any) {
  let c = PSet.set<number>();
  c = PSet.add(c, 1);

  let base = PSet.del(c, 1);

  let merged = PSet.merge(base, c);
  assert_set_equal(t, merged.view(), []);
  t.end();
});

test('merge with deletion on overlay', function (t: any) {
  let c = PSet.set<number>();
  c = PSet.add(c, 1);

  let overlay = PSet.del(c, 1);

  let merged = PSet.merge(c, overlay);
  assert_set_equal(t, merged.view(), []);
  t.end();
});
