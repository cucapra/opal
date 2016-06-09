import {opal, Context} from '../src/opal';
import {slots, copyDate} from './schedutil';

const enum Weekday {
  Sunday = 0,
  Monday = 1,
  Tuesday = 2,
  Wednesday = 3,
  Thursday = 4,
  Friday = 5,
  Saturday = 6,
}

/**
 * The number of milliseconds in a day.
 */
const DAY = 1000 * 60 * 60 * 24;

/**
 * Partial evidence about a date.
 */
interface PartialDate {
  /**
   * The base for relative statements (i.e., the date on which the evidence
   * was uttered).
   */
  base: Date;

  dayOfWeek?: Weekday;
  dayOfMonth?: number;
  month?: number;

  /**
   * The number of days in the future or the past. Positive is the future,
   * relative to `base`.
   */
  relativeDays?: number;
}

/**
 * Score a date against some evidence. Return a score, which is an unbounded
 * number where lower means a better match (and 0.0 is a perfect match).
 */
function dateMatch(date: Date, evidence: PartialDate): number {
  let distance = 0;
  if (evidence.dayOfWeek !== undefined) {
    distance += date.getDay() === evidence.dayOfWeek ? 0 : 1;
  }
  if (evidence.dayOfMonth !== undefined) {
    distance += date.getDate() === evidence.dayOfMonth ? 0 : 1;
  }
  if (evidence.relativeDays !== undefined) {
    let delta = date.valueOf() - evidence.base.valueOf();  // ms
    let deltaDays = Math.round(delta / DAY);
    distance += Math.abs(deltaDays - evidence.relativeDays);
  }
  return distance;
}

/**
 * Resolve the date evidence to its most likely date.
 * 
 * @param ctx      The OPAL context.
 * @param evidence The specification from the user.
 * @param window   The number of days to look ahead an behind of the 
 *                 current date.
 */
async function resolveDate(ctx: Context, evidence: PartialDate, window = 7) {
  // The search window.
  let start = new Date(evidence.base.valueOf() - window * DAY);
  let end = new Date(evidence.base.valueOf() + window * DAY);
  let dates = slots(start, end, 24 * 60);

  // Find the best date. (This seems like a lot of code to accomplish
  // something pretty simple, alas.)
  let score = ctx.weight<number>();
  let date_w = ctx.weight<Date>();
  let worlds = ctx.explore(dates, date => async (ctx) => {
    ctx.set(score, dateMatch(date, evidence));
    ctx.set(date_w, date);
  });
  let world = await ctx.minimize(worlds, score);
  return ctx.get(date_w, world);
}

opal(async function (ctx) {
  let date = await resolveDate(
    ctx,
    { dayOfWeek: 2, base: new Date() }
  );
  console.log(date);
});
