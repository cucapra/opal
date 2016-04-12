/**
 * OPAL actions for the bot.
 */

import {opal, Context} from '../src/opal';
import {Event, Calendar, getEvents} from '../src/calendar';
import {dateAdd, slots, showChanges, copyDate,
  countConflicts} from '../examples/schedutil';
import {User} from '../src/office';

/**
 * Check whether the event is in the user's preferred range and, if not, how
 * far out-of-range it its.
 */
function getSadness(prefStart: number, prefEnd: number, evt: Event): number {
  if (evt.start.getHours() <= prefStart) {
    // Too early.
    return prefStart - evt.start.getHours();
  } else if (evt.end.getHours() >= prefEnd) {
    // Too late.
    return evt.end.getHours() - prefEnd;
  } else {
    // In range.
    return 0.0;
  }
}

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
  const conflictCost = 2.0;  // Cost per conflict.
  const prefCost = 1.0;  // Cost per hour outside of preferred range.

  let worlds = ctx.explore(range, start => async function (ctx) {
    // Try adding the event to the calendar.
    let evt = new Event(title, start, dateAdd(start, minutes));
    ctx.add(cal, evt);

    // To compute the weighting factors, we need the unmodified calendar and
    // the modifications we want to make to it.
    let oldCal = ctx.clean_view(cal);
    let edit = ctx.diff(cal);

    // Compute the weighting factors.
    let conflictCount = edit.score( e => countConflicts(oldCal, e) );
    let distFromPref = edit.score( e => getSadness(prefStart, prefEnd, e) );

    // Combine the two factors into a cost.
    ctx.set(score, conflictCount * conflictCost +
                   distFromPref * prefCost);
  });

  // Find the best time.
  return await ctx.minimize(worlds, score);
}

function clearTime(date: Date): Date {
  date.setHours(0);
  date.setMinutes(0);
  date.setSeconds(0);
  date.setMilliseconds(0);
  return date;
}

/**
 * Schedule a new meeting for a user.
 */
export function scheduleMeeting(user: User, date: Date) {
  // Turn the single moment into an all-day range.
  let rangeStart = clearTime(copyDate(date));
  let rangeEnd = clearTime(copyDate(date));
  rangeEnd.setHours(23);
  
  opal(async function (ctx) {
    // Get my calendar.
    let events: Calendar = await getEvents(ctx, user);

    // Make up a preferred workday range (as hours).
    let workdayStart = 8;
    let workdayEnd = 16;

    // Schedule a meeting.
    let world = await schedule(
      ctx,
      events,
      slots(
        rangeStart,
        rangeEnd,
        30
      ),
      workdayStart,
      workdayEnd,
      "Exciting Meeting!",
      60
    );

    // Tell the user what we're about to do.
    let messages = [];
    ctx.diff_child(world, events).foreach({
      add(event) {
        messages.push(`scheduling ${event.subject} at ${event.start}`);
      },
      delete(event) {
        messages.push(`removing event ${event.subject}`);
      },
    });
    let out = messages.join("\n");
    console.log(out);
    // TODO Figure out how to return this message.

    // Affect the real world.
    await ctx.commit(world);
  });
  
  return "I probably did something!";
};