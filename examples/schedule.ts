'use strict';

import {opal, Context} from '../src/opal';
import {Event, Calendar, getEvents} from '../src/calendar';

// TODO Don't depend on this directly.
import * as pset from '../src/pset';

// Copy a JavaScript Date object. (It's a shame this isn't as easy as
// `d.clone()`.)
// http://stackoverflow.com/a/1090817
function copyDate(d: Date) {
  return new Date(d.getTime());
}

// Generate candidate times from a range.
function* slots(start: Date, end: Date, incrementMinutes: number) {
  // Clone the start date for our iterator.

  // Increment the start date repeatedly.
  let current = copyDate(start);
  while (current < end) {
    // Produce the current slot.
    yield current;

    // Move to the next slot by copying the current one.
    current = copyDate(current);
    current.setMinutes(current.getMinutes() + incrementMinutes);
  }
}

// Check whether two events overlap in time.
function eventsConflict(e1: Event, e2: Event): boolean {
  return (e1.start >= e2.start && e1.start < e2.end) ||
    (e1.end <= e2.end && e1.end > e2.start);
}

// Find events in `oldEvents` that overlap with `newEvent`.
function* findConflicts(oldEvents: Iterable<Event>, newEvent: Event) {
  for (let oldEvent of oldEvents) {
    if (eventsConflict(oldEvent, newEvent)) {
      yield oldEvent;
    }
  }
}

// Count the elements in a JavaScript iterable.
function iterCount(it: Iterable<any>) {
  let n = 0;
  for (let v of it) {
    ++n;
  }
  return n;
}

// Count the number of conflicts created or removed in a hypothetical world.
function conflictDelta(ctx: Context, cal: Calendar): number {
  let diff = ctx.diff(cal);
  let score = 0;
  let old_events = ctx.clean_view(cal);  // Unmodified set of events.
  for (let op of diff.ops) {
    if (op instanceof pset.Add) {
      score += iterCount(findConflicts(old_events, op.value));
    }
  }
  console.log(score);
  return score;
}

// The main scheduling program.
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

      // TODO Playing with the new `diff` operation.
      ctx.set(conflicts, conflictDelta(ctx, cal));
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
      /* from */ new Date("February 3, 2014 08:00:00"),
      /* to */   new Date("February 3, 2014 17:00:00"),
      /* in increments of N minutes */ 30
    ),
    "Exciting Meeting!",
    60
  );

  // TODO Here would be a great place to be able to say, "This is what I want
  // to add to your calendar!" But since we just have a flat view of the
  // *current state* of the calendar, this requires some kind of a "diff." We
  // could do this either using the information available in the branchable
  // set data structure or just by getting a difference "from scratch."

  // Affect the real world.
  await ctx.commit(world);
});
