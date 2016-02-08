/// <reference path="common.ts" />
/// <reference path="../src/opal.ts" />

test('weight updated in two worlds', function (t: any) {
  opal(async function (ctx) {
    // A communication channel between us and subworlds.
    let w = ctx.weight();

    // Spawn some hypothetical worlds.
    let hyp1 = ctx.hypothetical(async function (ctx) {
      await ctx.set(w, 2);  // ideal syntax: `w = 2`
    });
    let hyp2 = ctx.hypothetical(async function (ctx) {
      await ctx.set(w, 8);
    });

    // Collect the weights from the subworlds.
    let v1 = await ctx.get(w, hyp1);  // ideal syntax: w[hyp1]
    let v2 = await ctx.get(w, hyp2);

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
    assert_set_equal(t, ctx.view(c), [2]);

    // Try modifying the collection in a hypothetical world.
    let hyp3 = ctx.hypothetical(function* (ctx): IterableIterator<Message> {
      ctx.add(c, 4);
    });
    assert_set_equal(t, ctx.view(c), [2]);

    // Merge the hypothetical world to see its changes.
    yield ctx.commit(hyp3);
    assert_set_equal(t, ctx.view(c), [2, 4]);

    t.end();
  });
});


test('explore and rank', function (t: any) {
  opal(function* (ctx) {
    // Create a collection and a weight.
    let c = ctx.collection<number>();
    let w = ctx.weight<number>();

    // Explore several "options" in a domain.
    let domain = [1, 2, 3, 4, 5];
    let worlds = ctx.explore(domain, value => function* (ctx) {
      ctx.add(c, value);

      let dist_from_pi = Math.abs(Math.PI - value);
      yield ctx.set(w, dist_from_pi);
    });

    // Choose the best world and commit it.
    let selected: World = yield* ctx.minimize(worlds, w);
    yield ctx.commit(selected);

    // Check that the right value is now in the collection.
    assert_set_equal(t, ctx.view(c), [3]);

    t.end();
  });
});

test('explore an infinite sequence', function(t: any) {
  // An infinite sequence of numbers.
  function* exponential(factor: number) {
    let i = 1;
    while (true) {
      yield i;
      i *= factor;
    }
  }

  opal(function* (ctx) {
    // Look for numbers that start with the digit 7 (for some reason).
    let w = ctx.weight<number>();
    let c = ctx.collection<number>();
    let worlds = ctx.explore(exponential(2), value => function* (ctx) {
      if (value.toString()[0] === '7') {
        yield ctx.set(w, 0);
      } else {
        yield ctx.set(w, 1);
      }
      ctx.add(c, value);
    });

    // Limit the search to 100 worlds.
    let selected: World = yield* ctx.minimize(worlds, w, 100);
    yield ctx.commit(selected);

    // The first power of 2 that starts with a 7 is 2^46.
    assert_set_equal(t, ctx.view(c), [Math.pow(2, 46)]);
    t.end();
  });
});
