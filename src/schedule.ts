let ctx = new Context();

let w = ctx.weight<number>();
ctx.hypothetical(function* () {
  yield new Message();
});
