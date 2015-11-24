opal(function* (world) {
  world.hypothetical(function* (world) {
    yield new Message();
  });
  yield new Message();
});
