/// <reference path="../src/opal.ts" />
/// <reference path="../src/calendar.ts" />
'use strict';

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function input(prompt: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    rl.question(prompt, resolve);
  });
}

opal(async function (ctx) {
  let events: Calendar.Calendar = await Calendar.events(ctx);

  let allEvents = Array.from(ctx.view(events));
  let i = 0;
  for (let e of allEvents) {
    console.log(i, e.subject);
    i++;
  }

  let response = await input('Edit which event? ');
  console.log(response);
});
