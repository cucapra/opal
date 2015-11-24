opal(function* (world) {
  let w = world.weight();
  let hyp = world.hypothetical(function* (world) {
    yield world.set(w, 2);
  });
  yield world.get(w, hyp);
});
