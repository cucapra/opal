import {Lazy} from '../src/world';

let test = require('tape');

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
    t.fail("code after suspension should never execute");
  });
  log.push(3);
  thread.acquire();  // Start running.
  log.push(4);

  t.deepEqual(log, [0, 3, 1, 2, 4]);
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

    // Because the `await` above resolves asynchronously, this is the last
    // chunk of code to execute.
    t.deepEqual(log, [0, 3, 1, 4, 2]);
    t.end();
  });
  log.push(3);
  thread.acquire();  // Start running.
  log.push(4);
});

// A simple synchronization mechanism.
class Signal {
  fired: boolean;
  waiters: (() => void)[] | null;

  constructor() {
    this.fired = false;
    this.waiters = [];
  }

  wait(f: () => void) {
    if (this.fired) {
      f();
    } else {
      this.waiters!.push(f);
    }
  }

  notify() {
    this.fired = true;
    for (let f of this.waiters!) {
      f();
    }
    this.waiters = null;
  }
}

test('combine suspension with other sync on the side', function (t: any) {
  let log: number[] = [];

  let signal = new Signal();
  let thread = new Lazy();
  log.push(0);
  thread.run(async function () {
    log.push(1);
    signal.notify();
    log.push(2);
    await thread.suspend();
    t.fail("code after suspension should never execute");
  });

  log.push(3);
  signal.wait(() => {
    log.push(4);
    thread.release();  // Balance the acquire below and stop at the suspension.
  });
  log.push(5);
  thread.acquire();
  log.push(6);

  t.deepEqual(log, [0, 3, 5, 1, 4, 2, 6]);
  t.end();
});

// A simple asynchronous utility.
function sleep(time: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    setTimeout(resolve, time);
  });
}

test('combine suspension with ordinary async operations', function (t: any) {
  let log: number[] = [];
  log.push(0);
  let thread = new Lazy();
  thread.run(async function () {
    log.push(1);
    await thread.suspend();  // Fall through.
    log.push(2);

    await sleep(1);
    await thread.suspend();  // Fall through again.
    log.push(3);

    // Because the `await` above resolves asynchronously, this is the last
    // chunk of code to execute.
    t.deepEqual(log, [0, 4, 1, 2, 3]);
    t.end();
  });
  log.push(4);
  thread.acquire();
});

test('use finish() to wait on the completion of a lazy thread', function (t: any) {
  let log: number[] = [];
  let thread = new Lazy();
  log.push(0);
  thread.run(async function () {
    log.push(1);
  });
  thread.finish().then(function () {
    log.push(2);
    t.deepEqual(log, [0, 3, 1, 4, 2]);
    t.end();
  });
  log.push(3);
  thread.acquire();
  log.push(4);
});

test('use finish() after the target thread has already completed', function (t: any) {
  let log: number[] = [];
  let thread = new Lazy();
  log.push(0);
  thread.run(async function () {
    log.push(1);
  });
  log.push(2);
  thread.acquire();
  log.push(3);
  thread.finish().then(function () {
    log.push(4);
    t.deepEqual(log, [0, 2, 1, 3, 5, 4]);
    t.end();
  });
  log.push(5);
});
