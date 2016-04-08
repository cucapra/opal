import {opal } from '../src/opal';
import {Event, Calendar, getEvents} from '../src/calendar';
import {dateAdd, conflictDelta, slots, showChanges} from './schedutil';

// The main scheduling program.
opal(async function (ctx) {
  // The search: find a meeting slot.
  async function schedule(cal: Calendar, range: Iterable<Date>,
                          title: string, minutes: number)
  {
    let conflicts = ctx.weight<number>();

    let worlds = ctx.explore(range, start => async function (ctx) {
      // Try adding the event to the calendar.
      let evt = new Event(title, start, dateAdd(start, minutes));
      ctx.add(events, evt);

      // Our weight is the number of conflicts we've created.
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

  // Show the user what we're about to do.
  showChanges(ctx.diff_child(world, events));

  // Affect the real world.
  await ctx.commit(world);
});
