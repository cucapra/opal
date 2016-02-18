/// <reference path="../src/opal.ts" />
/// <reference path="../src/calendar.ts" />
'use strict';

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Async interface to Node's console input.
function input(prompt: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    rl.question(prompt, resolve);
  });
}

opal(async function (ctx) {
  let cal: Calendar.Calendar = await Calendar.events(ctx);

  let allEvents = Array.from(ctx.view(cal));
  let i = 0;
  for (let e of allEvents) {
    console.log(i, e.subject);
    i++;
  }

  // Chose an event to change.
  let response = await input('Edit which event? ');
  let index = parseInt(response);
  let event = allEvents[index];

  // Modify the event.
  let hyp = ctx.hypothetical(async function (ctx) {
    Calendar.modify(ctx, cal, event,
      { subject: event.subject + " (modified by OPAL)" }
    );
  });
  await ctx.commit(hyp);
});
