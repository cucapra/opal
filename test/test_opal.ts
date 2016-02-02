/// <reference path="common.ts" />
/// <reference path="../src/opal.ts" />

test('weight updated in two worlds', function (t: any) {
  opal(function* (ctx) {
    // A communication channel between us and subworlds.
    let w = ctx.weight();

    // Spawn some hypothetical worlds.
    let hyp1 = ctx.hypothetical(function* (ctx) {
      yield ctx.set(w, 2);  // ideal syntax: `w = 2`
    });
    let hyp2 = ctx.hypothetical(function* (ctx) {
      yield ctx.set(w, 8);
    });

    // Collect the weights from the subworlds.
    let v1 = yield ctx.get(w, hyp1);  // ideal syntax: w[hyp1]
    let v2 = yield ctx.get(w, hyp2);

    t.equal(v1, 2);
    t.equal(v2, 8);

    t.end();
  });
});

test('collection manipulation', function (t: any) {
  opal(function* (ctx) {
    // Create a collection and try adding and removing values.
    let c = ctx.collection<number>();
    ctx.add(c, 2);  // ideal syntax: c.add(2)
    ctx.add(c, 3);
    ctx.del(c, 3);
    t.assert(contents_equal(ctx.view(c), [2]));

    // Try modifying the collection in a hypothetical world.
    let hyp3 = ctx.hypothetical(function* (ctx): IterableIterator<Message> {
      ctx.add(c, 4);
    });
    t.assert(contents_equal(ctx.view(c), [2]));

    // Merge the hypothetical world to see its changes.
    yield ctx.commit(hyp3);
    t.assert(contents_equal(ctx.view(c), [2, 4]));

    t.end();
  });
});


test('explore and rank', function (t: any) {
  opal(function* (ctx) {
    // Create a collection and a weight.
    let c = ctx.collection<number>();
    let w = ctx.weight();

    // Explore several "options" in a domain.
    let domain = [1, 2, 3, 4, 5];
    let worlds = ctx.explore(domain, (value) => function* (ctx) {
      ctx.add(c, value);
      yield ctx.set(w, value);
    });

    for (let world of worlds) {
      yield ctx.get(w, world);
    }

    t.end();
  });
});
