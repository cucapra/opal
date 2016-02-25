'use strict';

import {opal} from '../src/opal';
import {Event, Calendar, MeetingTimeSlot, getEvents, getFreeTimes} from '../src/calendar';

opal(async function (ctx) {
  // Experimenting with the calendar API.
  let events: Calendar = await getEvents(ctx);
  console.log("calendar events:");
  for (let e of ctx.view(events)) {
    console.log(e.subject);
  }

  let mts: MeetingTimeSlot[] = await getFreeTimes(ctx, "slbird@microsoft.com", new Date("2016-02-01 09:00:00"), new Date("2016-02-01 17:00:00"));
  for (let slot of mts) {
    console.log(slot.start + " -> " + slot.end);
  }

    /*

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
  }*/
});
