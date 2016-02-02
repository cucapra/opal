/// <reference path="common.ts" />
/// <reference path="../src/pset.ts" />

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

test('empty set', function (t: any) {
  let c = PSet.set<number>();
  t.assert(contents_equal(c.view(), []));
  t.end();
});

test('add', function (t: any) {
  let c = PSet.set<number>();
  c = PSet.add(c, 1);
  t.assert(contents_equal(c.view(), [1]));
  t.end();
});

test('add and then remove', function (t: any) {
  let c = PSet.set<number>();
  c = PSet.add(c, 1);
  c = PSet.del(c, 1);
  t.assert(contents_equal(c.view(), []));
  t.end();
});

test('merge with addition on base', function (t: any) {
  let c = PSet.set<number>();
  c = PSet.add(c, 1);

  let base = PSet.add(c, 2);

  let merged = PSet.merge(base, c);
  t.assert(contents_equal(merged.view(), [1, 2]));
  t.end();
});

test('merge with addition on overlay', function (t: any) {
  let c = PSet.set<number>();
  c = PSet.add(c, 1);

  let overlay = PSet.add(c, 2);

  let merged = PSet.merge(c, overlay);
  t.assert(contents_equal(merged.view(), [1, 2]));
  t.end();
});

test('merge with deletion on base', function (t: any) {
  let c = PSet.set<number>();
  c = PSet.add(c, 1);

  let base = PSet.del(c, 1);

  let merged = PSet.merge(base, c);
  t.assert(contents_equal(merged.view(), []));
  t.end();
});

test('merge with deletion on overlay', function (t: any) {
  let c = PSet.set<number>();
  c = PSet.add(c, 1);

  let overlay = PSet.del(c, 1);

  let merged = PSet.merge(c, overlay);
  t.assert(contents_equal(merged.view(), []));
  t.end();
});
