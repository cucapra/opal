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

test('partially force a thread but then release it', function (t: any) {
  let log: number[] = [];
  log.push(0);
  let thread = new Lazy();
  thread.run(async function () {
    log.push(1);
    thread.release();  // Balance the acquire, below.
    log.push(2);
    await thread.suspend();
    log.push(3);  // Should never execute.
  });
  log.push(4);
  thread.acquire();  // Start running.
  log.push(5);

  t.deepEqual(log, [0, 4, 1, 2, 5]);
  t.end();
});

test('force entirely, in which suspend becomes a no-op', function (t: any) {
  let log: number[] = [];
  log.push(0);
  let thread = new Lazy();
  thread.run(async function () {
    log.push(1);
    await thread.suspend();  // Fall through this suspend.
    log.push(2);  // *Should* execute.
  });
  log.push(3);
  thread.acquire();  // Start running.
  log.push(4);

  t.deepEqual(log, [0, 3, 1, 2, 4]);
  t.end();
});
