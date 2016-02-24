'use strict';

import {opal} from '../src/opal';
import {Event, Calendar, getEvents} from '../src/calendar';

// http://stackoverflow.com/a/1090817
function copyDate(d: Date) {
  return new Date(d.getTime());
}

// Generate candidate times from a range.
function* slots(start: Date, end: Date, incrementMinutes: number) {
  // Clone the start date for our iterator.
  let current = copyDate(start);

  // Increment the date repeatedly.
  while (current < end) {
    yield current;
    current.setMinutes(current.getMinutes() + incrementMinutes);
  }
}

opal(async function (ctx) {
  // The search: find a meeting slot.
  async function schedule(cal: Calendar, range: Iterable<Date>,
                          title: string, minutes: number)
  {
    let conflicts = ctx.weight<number>();

    let worlds = ctx.explore(range, start => async function (ctx) {
      // Try adding the event to the calendar.
      let end = copyDate(start);
      end.setMinutes(start.getMinutes() + minutes);
      let evt = new Event(title, start, end);
      ctx.add(events, evt);

      // Check for conflicts.
      ctx.set(conflicts, 1);  // TODO
    });

    // Find the best time.
    return await ctx.minimize(worlds, conflicts, 100);
  }

  // Get my calendar.
  let events: Calendar = await getEvents(ctx);

  // Schedule a meeting.
  let world = await schedule(
    events,
    slots(
      new Date("February 3, 2014 08:00:00"),
      new Date("February 3, 2014 17:00:00"),
      30
    ),
    "Exciting Meeting!",
    60
  );

  // Affect the real world.
  await ctx.commit(world);
});
