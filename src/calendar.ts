'use strict';

import * as PSet from './pset';
import {ExternalCollection, Context} from './opal';

let outlook = require("node-outlook");
let fs = require("fs");
let path = require("path");

// Use the 2.0 version of the Office 365 API.
outlook.base.setApiEndpoint('https://outlook.office.com/api/v2.0');

// Simple wrappers for the `node-outlook` library.
namespace Office {
  function getUserHome(): string {
      return process.env[(process.platform == 'win32') ?
        'USERPROFILE' : 'HOME'];
  }

  // Load the user object and token string to pass to the Outlook library.
  function getConfig() {
    let home = getUserHome();
    let email = fs.readFileSync(path.join(home, ".opal.email.txt")).toString();
    let token = fs.readFileSync(path.join(home, ".opal.token.txt")).toString();

    return {
      user: {
        email: email,
        timezone: 'Pacific Standard Time',
      },
      token: token,
    };
  }

  export function getSomeEvents(cbk: (error: any, result: any) => void) {
    let queryParams = {
      '$select': 'Subject,Start,end',
      '$orderby': 'Start/DateTime desc',
      '$top': 10
    };

    let config = getConfig();
    outlook.calendar.getEvents(
      {token: config.token, user: config.user, odataParams: queryParams},
      cbk
    );
  }

  export function addEvent(event: any,
                           cbk: (error: any, result: any) => void)
  {
    let config = getConfig();
    outlook.calendar.createEvent(
      {token: config.token, user: config.user, event: event},
      cbk
    );
  }
  export function modifyEvent(id: string, changes: any,
                              cbk: (error: any, result: any) => void)
  {
    let config = getConfig();
    outlook.calendar.updateEvent(
      {token: config.token, user: config.user, eventId: id,
        update: changes},
      cbk
    );
  }
}

function toDate(d: string | Date): Date {
  if (d instanceof Date) {
    return d;
  } else {
    return new Date(d as string);
  }
}

function pad0(n: number): string {
  if (n < 10) {
    return '0' + n;
  } else {
    return n.toString();
  }
}

function dateToOffice(d: Date): string {
  return d.getFullYear() +
    '-' + pad0(d.getMonth() + 1) +
    '-' + pad0(d.getDate()) +
    'T' + pad0(d.getHours()) +
    ':' + pad0(d.getMinutes());
}

// Represents a single calendar event.
export class Event {
  id: string;

  constructor(
    public subject: string,
    public start: Date,
    public end: Date,
    id?: string
  ) {
    this.start = toDate(start);
    this.end = toDate(end);

    // An ID is not required. This lets us construct Event objects before
    // they are sent to the server.
    if (id) {
      this.id = id;
    } else {
      this.id = null;
    }
  };

  // Convert to the Office API's JSON representation.
  toOffice() {
    return {
      'Subject': this.subject,
      'Body': {
        'ContentType': 'HTML',
        'Content': '',  // TODO
      },
      'Start': {
        'DateTime': dateToOffice(this.start),
        'TimeZone': 'Pacific Standard Time', // TODO
      },
      'End': {
        'DateTime': dateToOffice(this.end),
        'TimeZone': 'Pacific Standard Time', // TODO
      },
      'Attendees': [] as any[],
    };
  }

  // Load an Event from the Office API's JSON representation.
  static fromOffice(obj: any): Event {
    return new Event(obj.Subject,
                     toDate(obj.Start.DateTime),
                     toDate(obj.End.DateTime),
                     obj.Id);
  }
}

// A structure for holding *updates* to an event object.
interface EventChange {
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
    out['Start'] = {
      'DateTime': dateToOffice(change.start),
      'TimeZone': 'Pacific Standard Time', // TODO
    };
  }
  if (change.end) {
    out['End'] = {
      'DateTime': dateToOffice(change.end),
      'TimeZone': 'Pacific Standard Time', // TODO
    };
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
    let old: Event = null;
    for (let obj of set) {
      if (obj.id === this.id) {
        old = obj;
        break;
      }
    }
    console.assert(old !== null, "event not found by id");

    // Update and replace the object.
    let modified = clone(old);
    Object.assign(modified, this.changes);
    set.delete(old);
    set.add(modified);
  }
}

// A Calendar looks like a collection of events.
export class Calendar extends ExternalCollection<Event> {
  // The `send` method implements the "real" operations that affect the
  // outside world.
  send(old: PSet.Node<Event>, ops: PSet.Operation<Event>[]) {
    // Get the *old* set of events. We'll update this local copy according
    // to all the operations in the log.
    let events: Set<Event> = old.view();

    // Apply each operation both by issuing an API call and modifying our
    // local `events` set.
    for (let op of ops) {
      // Add an event.
      if (op instanceof PSet.Add) {
        let data = op.value.toOffice();
        Office.addEvent(data, (error, result) => {
          if (error) {
            console.log("error adding event:", error);
          } else {
            // TODO Await the completion of the request before returning.
            // (This requires `send` to be an async call.)
            op.value.id = result.Id;
          }
        });

      // Delete an event.
      } else if (op instanceof PSet.Delete) {
        console.log("TODO: delete", op.value);

      // Modify an event.
      } else if (op instanceof Modify) {
        Office.modifyEvent(op.id, changeToOffice(op.changes), (error, result) => {
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

// An OPAL API function to get a few events from the user's calendar.
export async function getEvents(ctx: Context) {
  return new Promise<Calendar>((resolve, reject) => {
    Office.getSomeEvents(function (error, result) {
      if (error) {
        reject(error);
        return;
      }

      let events: Event[] = [];
      for (let obj of result.value) {
        events.push(Event.fromOffice(obj));
      }
      let coll = new Calendar(ctx.world, PSet.set(events));
      resolve(coll);
    });
  });
}

// An OPAL API function to *modify* a Calendar collection (which is not
// part of the ordinary collection API).
export function modifyEvent(ctx: Context, collection: Calendar,
                            event: Event, changes: EventChange) {
  let op = new Modify(event.id, changes);
  let s = PSet.op(collection.lookup(ctx.world), op);
  collection.update(ctx.world, s);
  ctx.world.collections.add(collection);
}
