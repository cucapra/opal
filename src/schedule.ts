opal(function* (world) {
  let w = world.weight();
  let hyp = world.hypothetical(function* (world) {
    yield world.set(w, 2);
  });
  let v = yield world.get(w, hyp);
  console.log("got", v, "from subworld");
});
