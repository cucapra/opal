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

  // Experimenting with the calendar API.
  let events: Collection<Calendar.Event> = yield Calendar.events();
  console.log("calendar events:");
  for (let e of ctx.view(events)) {
    console.log(e.subject);
  }

  // Add an event.
  let hyp4 = ctx.hypothetical(function* (ctx): IterableIterator<Message> {
    let e = new Calendar.Event("Exciting Meeting!", "12:00", "1:00");
    ctx.add(events, e);
  });
  yield ctx.commit(hyp4);
  console.log("events now:");
  for (let e of ctx.view(events)) {
    console.log(e.subject);
  }
});
