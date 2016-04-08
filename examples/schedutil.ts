/**
 * Utilities for scheduling-related examples.
 */

import {Context, Edit} from '../src/opal';
import {Event, Calendar} from '../src/calendar';

/**
 * Copy a JavaScript Date object. (It's a shame this isn't as easy as
 * `d.clone()`.)
 * http://stackoverflow.com/a/1090817
 */
export function copyDate(d: Date) {
  return new Date(d.getTime());
}

/**
 * Generate candidate times from a range.
 */
export function* slots(start: Date, end: Date, incrementMinutes: number) {
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

/**
 * Check whether two events overlap in time.
 */
export function eventsConflict(e1: Event, e2: Event): boolean {
  return (e1.start >= e2.start && e1.start < e2.end) ||
    (e1.end <= e2.end && e1.end > e2.start);
}

/**
 * Find events in `oldEvents` that overlap with `newEvent`.
 */
function* findConflicts(oldEvents: Iterable<Event>, newEvent: Event) {
  for (let oldEvent of oldEvents) {
    if (eventsConflict(oldEvent, newEvent)) {
      yield oldEvent;
    }
  }
}

/**
 * Count the elements in a JavaScript iterable.
 */
function iterCount(it: Iterable<any>) {
  let n = 0;
  for (let v of it) {
    ++n;
  }
  return n;
}

/**
 * Count the number of conflicts between a specific event and existing events
 * on a calendar.
 */
export function countConflicts(oldEvents: Iterable<Event>, newEvent: Event): number {
  return iterCount(findConflicts(oldEvents, newEvent));
}


/**
 * Print the changes in a calendar.
 */
export function showChanges(edit: Edit<Event>) {
  edit.foreach({
    add(event) {
      console.log(`scheduling ${event.subject} at ${event.start}`);
    },
    delete(event) {
      console.log(`removing event ${event.subject}`);
    },
  });
}

/**
 * Date math: advance a date by a number of minutes. Return a new `Date`.
 */
export function dateAdd(date: Date, minutes: number) {
  let out = copyDate(date);
  out.setMinutes(date.getMinutes() + minutes);
  return out;
}

