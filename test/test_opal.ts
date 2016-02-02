/// <reference path="common.ts" />
/// <reference path="../src/opal.ts" />

test('weights', function (t: any) {
  opal(function* (ctx) {
    // A communication channel between us an subworlds.
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

    t.assert(v1 === 2);
    t.assert(v2 === 8);

    t.end();
  });
});
