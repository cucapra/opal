/// <reference path="opal.ts" />
/// <reference path="pset.ts" />
'use strict';

let outlook = require("node-outlook");
let fs = require("fs");
let path = require("path");

// Use the 2.0 version of the Office 365 API.
outlook.base.setApiEndpoint('https://outlook.office.com/api/v2.0');

// Simple wrappers for the `node-outlook` library.
module Office {
  function getUserHome(): string {
      return process.env[(process.platform == 'win32') ?
        'USERPROFILE' : 'HOME'];
  }

  // Load the user object and token string to pass to the Outlook library.
  function getConfig() {
    let home = getUserHome();
    let email = fs.readFileSync(path.join(home, ".opal.email.txt"));
    let token = fs.readFileSync(path.join(home, ".opal.token.txt"));

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
}

module Calendar {
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
      '-' + pad0(d.getMonth() + 1)
      '-' + pad0(d.getDate()) +
      'T' + pad0(d.getHours()) +
      ':' + pad0(d.getMinutes());
  }

  // Represents a single calendar event.
  export class Event {
    constructor(
      public subject: string,
      public start: Date,
      public end: Date
    ) {
      this.start = toDate(start);
      this.end = toDate(end);
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
                       toDate(obj.End.DateTime))
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
          Office.addEvent(op.value.toOffice(), (error, result) => {
            if (error) {
              console.log("error adding event:", error);
            }
          });

        // Delete an event.
        } else if (op instanceof PSet.Delete) {
          console.log("TODO: delete", op.value);
        }

        // Apply the operation to the local event set.
        op.apply(events);
      }

      // Return a flattened set of events reflecting the current state.
      return PSet.set(events);
    }
  }

  // An OPAL API function to get a few events from the user's calendar.
  export async function events(ctx: Context) {
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

}
