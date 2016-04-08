/**
 * A slightly expanded version of the `schedule.ts` example that also has a
 * separate notion of the user's "preferred workday." (You can think of this as
 * a vastly simplified version of a shadow calendar that would track
 * preferences more carefully.) It's meant to demonstrate a search with
 * multiple, weighted factors.
 */

import {opal, Context} from '../src/opal';
import {Event, Calendar, getEvents} from '../src/calendar';
import {dateAdd, slots, showChanges, countConflicts} from './schedutil';

/**
 * Find an open slot for a new meeting.
 *
 * @param ctx       The OPAL context.
 * @param cal       An OPAL collection representing the user's calendar.
 * @param range     The set of possible start times for the new event.
 * @param prefStart The first hour in the user's preferred time range.
 * @param prefEnd   The first last in the user's preferred time range.
 * @param title     The name of the event to schedule.
 * @param minutes   The duration of the new event in minutes.
 * @returns         An OPAL `World` where the event has been scheduled.
 */
async function schedule(ctx: Context, cal: Calendar, range: Iterable<Date>,
                        prefStart: number, prefEnd: number,
                        title: string, minutes: number)
{
  let score = ctx.weight<number>();

  // Constants used to weight the two ranking factors.
  let conflictCost = 2.0;  // Cost per conflict.
  let prefCost = 1.0;  // Cost per hour outside of preferred range.

  let worlds = ctx.explore(range, start => async function (ctx) {
    // Try adding the event to the calendar.
    let evt = new Event(title, start, dateAdd(start, minutes));
    ctx.add(cal, evt);

    // Get the number of conflicts the event would create.
    let oldCal = ctx.clean_view(cal);  // Unmodified set of events.
    let edit = ctx.diff(cal);  // The modifications to make.
    let conflictCount = edit.score( e => countConflicts(oldCal, e) );

    // Check whether the event is in the user's preferred range and, if not,
    // how far out-of-range it its.
    let distFromPref = 0;
    if (evt.start.getHours() <= prefStart) {
      distFromPref = prefStart - evt.start.getHours();
    }
    if (evt.end.getHours() >= prefEnd) {
      distFromPref = evt.end.getHours() - prefEnd;
    }
    console.log(distFromPref);

    // Combine the two factors into a cost.
    ctx.set(score, conflictCount * conflictCost +
                   distFromPref * prefCost);
  });

  // Find the best time.
  return await ctx.minimize(worlds, score, 100);
}

/**
 * The main program for this scheduling example.
 */
opal(async function (ctx) {
  // Get my calendar.
  let events: Calendar = await getEvents(ctx);

  // Make up a preferred workday range (as hours).
  let workdayStart = 8;
  let workdayEnd = 16;

  // Schedule a meeting.
  let world = await schedule(
    ctx,
    events,
    slots(
      new Date("February 3, 2014 00:00:00"),
      new Date("February 3, 2014 23:00:00"),
      30
    ),
    workdayStart,
    workdayEnd,
    "Exciting Meeting!",
    60
  );

  // Show the user what we're about to do.
  showChanges(ctx.diff_child(world, events));

  // Affect the real world.
  await ctx.commit(world);
});
