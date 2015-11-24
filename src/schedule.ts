opal(function* (ctx) {
  let w = ctx.weight();
  let hyp = ctx.hypothetical(function* (ctx) {
    yield ctx.set(w, 2);
  });
  let v = yield ctx.get(w, hyp);
  console.log("got", v, "from subworld");
});
