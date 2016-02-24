/// <reference path="../src/opal.ts" />
/// <reference path="../src/calendar.ts" />
'use strict';

opal(async function (ctx) {
  // Experimenting with the calendar API.
  let events: Calendar.Calendar = await Calendar.events(ctx);
  console.log("calendar events:");
  for (let e of ctx.view(events)) {
    console.log(e.subject);
  }
    /*

  // Add an event.
  let hyp4 = ctx.hypothetical(async function (ctx) {
    let e = new Calendar.Event(
      "Exciting Meeting!",
      new Date("February 3, 2014 12:00:00"),
      new Date("February 3, 2014 13:00:00")
    );
    ctx.add(events, e);
  });
  await ctx.commit(hyp4);
  console.log("events now:");
  for (let e of ctx.view(events)) {
    console.log(e.subject, e.start, e.end);
  }*/
});
