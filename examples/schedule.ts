/**
 * A basic scheduling example that just finds a free slot in a single user's
 * calendar for a new meeting.
 */

import {opal, Context} from '../src/opal';
import {Event, Calendar, getEvents} from '../src/calendar';
import {dateAdd, slots, showChanges, countConflicts} from './schedutil';

/**
 * Find an open slot for a new meeting.
 *
 * @param ctx     The OPAL context.
 * @param cal     An OPAL collection representing the user's calendar.
 * @param range   The set of possible start times for the new event.
 * @param title   The name of the event to schedule.
 * @param minutes The duration of the new event in minutes.
 * @returns       An OPAL `World` where the event has been scheduled.
 */
async function schedule(ctx: Context, cal: Calendar, range: Iterable<Date>,
                        title: string, minutes: number)
{
  let conflicts = ctx.weight<number>();

  let worlds = ctx.explore(range, start => async function (ctx) {
    // Try adding the event to the calendar.
    let evt = new Event(title, start, dateAdd(start, minutes));
    ctx.add(cal, evt);

    // Weight this world by the number of conflicts it would create.
    let oldCal = ctx.clean_view(cal);  // Unmodified set of events.
    let edit = ctx.diff(cal);  // The modifications to make.
    let conflictCount = edit.score( ev => countConflicts(oldCal, ev) );
    ctx.set(conflicts, conflictCount);
  });

  // Find the best time.
  return await ctx.minimize(worlds, conflicts, 100);
}

/**
 * The main program for this scheduling example.
 */
opal(async function (ctx) {
  // Get my calendar.
  let events: Calendar = await getEvents(ctx);

  // Schedule a meeting.
  let world = await schedule(
    ctx,
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
