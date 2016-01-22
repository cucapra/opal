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
  console.log("values from subworlds:", v1, v2);

  // Create a collection and try adding and removing values.
  let c = ctx.collection<number>();
  ctx.add(c, 2);  // ideal syntax: c.add(2)
  ctx.add(c, 3);
  ctx.del(c, 3);
  console.log("collection contents:", Array.from(ctx.view(c)));

  // Try modifying the collection in a hypothetical world.
  let hyp3 = ctx.hypothetical(function* (ctx): IterableIterator<Message> {
    ctx.add(c, 4);
  });
  console.log("collection contents:", Array.from(ctx.view(c)));

  // Merge the hypothetical world to see its changes.
  yield ctx.commit(hyp3);
  console.log("collection contents:", Array.from(ctx.view(c)));

  // TODO: Experimenting with the calendar API.
  Calendar.getSomeEvents(function (error: any, result: any) {
    for (let item of result.value) {
      console.log(item.Subject);
    }
  });
});
