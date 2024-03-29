import * as PSet from './pset';
import {Context} from './opal';
import {ExternalCollection} from './world';
import * as office from './office';
import {dateToOfficeLocal} from './office';

// The Windows time zone names.
import timezones from './timezones';

function toDate(d: string | Date): Date {
  if (d instanceof Date) {
    return d;
  } else {
    return new Date(d as string);
  }
}

function parseOfficeDate(d: { DateTime: string, TimeZone: string }): Date {
  // The API's date format appears to be *almost* ISO 8601. Or rather, the
  // zone-independent part is ISO 8601, but the time zone is never specified
  // here. Instead, we need to append the time-zone offset as indicated in the
  // other part of the structure.
  let iso8601date = d.DateTime;

  // This uses our precomputed lookup table of Windows time zone names.
  iso8601date += timezones[d.TimeZone];

  return new Date(iso8601date);
}

/**
 * A single event in a user's calendar.
 */
export class Event {
  id: string | null;

  /**
   * Create a new `Event`.
   *
   * @param subject   The title.
   * @param start     The time when the event starts.
   * @param end       The end time.
   * @param attendees Optionally, a list of email address of participants in
   *                  the event.
   * @param id        Optionally, the event's unique server-side id. For new
   *                  events that haven't been published to the server yet,
   *                  this will be empty.
   */
  constructor(
    public subject: string,
    public start: Date,
    public end: Date,
    public attendees?: string[],
    id?: string
  ) {
    this.start = toDate(start);
    this.end = toDate(end);
    this.attendees = attendees || [];
    // An ID is not required. This lets us construct Event objects before
    // they are sent to the server.
    if (id) {
      this.id = id;
    } else {
      this.id = null;
    }
  };

  /**
   * Convert an event to the Office API's JSON representation.
   */
  toOffice() {
    return {
      'Subject': this.subject,
      'Body': {
        'ContentType': 'HTML',
        'Content': '',  // TODO
      },
      'Start': dateToOfficeLocal(this.start),
      'End': dateToOfficeLocal(this.end),
      // i am a bad person -- should distinguish required from optional attendees
      'Attendees': this.attendees
    };
  }

  /**
   * Unpack an `Event` from the Office API's JSON representation.
   */
  static fromOffice(obj: any): Event {
    let attendees: string[] = [];
    for (let attendee of obj.Attendees) {
      attendees.push(attendee.EmailAddress.Address);
    }
    return new Event(obj.Subject,
                     parseOfficeDate(obj.Start),
                     parseOfficeDate(obj.End),
                     obj.Id);
  }
}

// Represents a single calendar event.
export class MeetingTimeSlot {
  constructor(
    public email: string,
    public start: Date,
    public end: Date) {
  }
}

// A structure for holding *updates* to an event object.
export interface EventChange {
  subject?: string;
  start?: Date;
  end?: Date;
}

// Convert an EventChange to JSON for the Office API.
function changeToOffice(change: EventChange): { [key: string]: any } {
  let out: { [key: string]: any } = {};
  if (change.subject) {
    out['Subject'] = change.subject;
  }
  if (change.start) {
    out['Start'] = dateToOfficeLocal(change.start);
  }
  if (change.end) {
    out['End'] = dateToOfficeLocal(change.end);
  }
  return out;
}

// Copy an object.
function clone<T>(obj: T): T {
  return Object.assign({}, obj);
}

// An operation that updates events in place.
class Modify extends PSet.Operation<Event> {
  constructor(
    public id: string,
    public changes: EventChange
  ) {
    super();
  }

  // Applying works by deleting the old object and inserting an updated
  // one. This keeps the data structure functional (i.e., other aliases tot
  // he event are unaffected).
  apply(set: Set<Event>) {
    // Look for the old event.
    let old: Event | null = null;
    for (let obj of set) {
      if (obj.id === this.id) {
        old = obj;
        break;
      }
    }
    if (old === null) {
      throw "event not found by id";
    }

    // Update and replace the object.
    let modified = clone(old);
    Object.assign(modified, this.changes);
    set.delete(old);
    set.add(modified);
  }
}

/**
 * An OPAL collection representing a user's calendar: i.e., a set of `Event`
 * objects.
 */
export class Calendar extends ExternalCollection<Event> {
  user: office.User;

  // The `send` method implements the "real" operations that affect the
  // outside world.
  send(old: PSet.Node<Event>, ops: PSet.Operation<Event>[]): PSet.Node<Event> {
    // Get the *old* set of events. We'll update this local copy according
    // to all the operations in the log.
    let events: Set<Event> = old.view();

    // Apply each operation both by issuing an API call and modifying our
    // local `events` set.
    for (let op of ops) {
      // Add an event.
      if (op instanceof PSet.Add) {
        let add = op;
        let data = add.value.toOffice();
        this.user.addEvent(data, (error, result) => {
          if (error) {
            console.log("error adding event:", error);
          } else {
            // TODO Await the completion of the request before returning.
            // (This requires `send` to be an async call.)
            add.value.id = result.Id;
          }
        });

      // Delete an event.
      } else if (op instanceof PSet.Delete) {
        console.log("TODO: delete", op.value);

      // Modify an event.
      } else if (op instanceof Modify) {
        this.user.modifyEvent(op.id, changeToOffice(op.changes), (error, result) => {
          if (error) {
            console.log("error modifying event:", error);
          }
        });
      }

      // Apply the operation to the local event set.
      op.apply(events);
    }

    // Return a flattened set of events reflecting the current state.
    return PSet.set(events);
  }
}
// An OPAL API function to get free times for a person.
export async function getFreeTimes(ctx: Context, user: office.User, email: string, start: Date, end: Date) {
  return new Promise<MeetingTimeSlot[]>((resolve, reject) => {
    user.getFreeTimes(email, start, end, function (error, result) {
      if (error) {
        reject(error);
        return;
      }

      let freeTimes: MeetingTimeSlot[] = [];
      console.log("ERROR");
      console.log(error);
      console.log("RESULT");
      console.log(result);
      for (let obj of result.body.value) {
        let mts = obj.MeetingTimeSlot;
        let start = mts.Start;
        let end = mts.End;
        let utc = (start.TimeZone == 'tzone://Microsoft/Utc');
        freeTimes.push(new MeetingTimeSlot(email,
          new Date(start.Date + ' ' + start.Time + (utc ? 'Z' : '')),
          new Date(end.Date + ' ' + end.Time + (utc ? 'Z' : ''))));
      }
      resolve(freeTimes);
    });
  });
}

/**
 * Get a few events from the user's calendar.
 *
 * For the moment, this gets a few of the *oldest* events. This
 * is a good match for our tests, which take pace far in the past.
 * Eventually, we'll want to let it get events around an arbitrary point
 * in time.
 *
 * @param ctx  The current OPAL context.
 * @param user The Office 365 API user.
 * @returns    A new `Calendar` collection.
 */
export async function getEvents(ctx: Context, user: office.User) {
  return new Promise<Calendar>((resolve, reject) => {
    user.getSomeEvents(function (error, result) {
      if (error) {
        reject(error);
        return;
      }

      let events: Event[] = [];
      for (let obj of result.value) {
        events.push(Event.fromOffice(obj));
      }
      let coll = new Calendar(ctx.world, PSet.set(events));
      coll.user = user;
      resolve(coll);
    });
  });
}

/**
 * Get events from a user's calendar in a given date range.
 *
 * @param ctx   The current OPAL context.
 * @param user  The Office 365 API user.
 * @param start The start of the range to get events from.
 * @param end   The end of the range.
 * @returns     A new `Calendar` collection.
 */
export async function getEventRange(ctx: Context, user: office.User, start: Date, end: Date) {
  let result = await user.calendarView(start, end);

  let events: Event[] = [];
  for (let obj of result.value) {
    events.push(Event.fromOffice(obj));
  }

  let coll = new Calendar(ctx.world, PSet.set(events));
  coll.user = user;
  return coll;
}

/**
 * Modify a `Calendar` collection.
 *
 * @param ctx         The current OPAL context.
 * @param collection  The calendar to modify.
 * @param event       The event to change (should be in the calendar already).
 * @param changes     Field updates for the event.
 */
export function modifyEvent(ctx: Context, collection: Calendar,
                            event: Event, changes: EventChange) {
  if (event.id === null) {
    throw "modifying an event without an id";
  }
  let op = new Modify(event.id, changes);
  let s = PSet.op(collection.lookup(ctx.world), op);
  collection.update(ctx.world, s);
  ctx.world.collections.add(collection);
}
