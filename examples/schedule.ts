'use strict';

import {opal} from '../src/opal';
import {Event, Calendar, getEvents} from '../src/calendar';

opal(async function (ctx) {
  // Experimenting with the calendar API.
  let events: Calendar = await getEvents(ctx);
  console.log("calendar events:");
  for (let e of ctx.view(events)) {
    console.log(e.subject);
  }

  // Add an event.
  let hyp4 = ctx.hypothetical(async function (ctx) {
    let e = new Event(
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
  }
});
