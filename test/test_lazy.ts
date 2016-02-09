/// <reference path="common.ts" />
/// <reference path="../src/opal.ts" />

test('force one lazy thread', function (t: any) {
  let log: number[] = [];
  log.push(0);
  let thread = new Lazy();
  thread.run(async function () {
    log.push(1);
  });
  log.push(2);
  thread.acquire();  // Keep running.
  log.push(3);

  t.deepEqual(log, [0, 2, 1, 3]);
  t.end();
});
