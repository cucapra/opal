/// <reference path="opal.ts" />
/// <reference path="pset.ts" />
'use strict';

let outlook = require("node-outlook");
let fs = require("fs");
let path = require("path");

module Calendar {

  function getUserHome(): string {
      return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
  }

  function getSomeEvents(cbk: (error: any, result: any) => void) {
    let home = getUserHome();
    let email = fs.readFileSync(path.join(home, ".opal.email.txt"));
    let token = fs.readFileSync(path.join(home, ".opal.token.txt"));

    let queryParams = {
      '$select': 'Subject,Start,end',
      '$orderby': 'Start/DateTime desc',
      '$top': 10
    };

    // Set the API endpoint to use the v2.0 endpoint
    outlook.base.setApiEndpoint('https://outlook.office.com/api/v2.0');
    // Set the anchor mailbox to the user's SMTP address
    outlook.base.setAnchorMailbox(email);
    outlook.base.setPreferredTimeZone('Pacific Standard Time');

    outlook.calendar.getEvents(
      {token: token, odataParams: queryParams},
      cbk
    );
  }

  export class Event {
    constructor(
      public subject: string,
      public start: string,
      public end: string
    ) {};
  }

  function array_remove<T>(a: T[], x: T) {
    let i = a.indexOf(x);
    if (i !== -1) {
      a.splice(i, 1);
    }
  }

  // A Calendar looks like a collection of events.
  export class Calendar extends ExternalCollection<Event> {
    send(old: PSet.Node<Event>, ops: PSet.Operation<Event>[]) {
      let events: Event[] = Array.from(old.view());
      for (let op of ops) {
        if (op instanceof PSet.Add) {
          console.log("TODO: add", op.value);
          events.push(op.value);
        } else if (op instanceof PSet.Delete) {
          console.log("TODO: delete", op.value);
          array_remove(events, op.value);
        }
      }
      return PSet.set(events);
    }
  }

  class EventsMessage extends Message {
    dispatch(world: World, then: (res: any) => void) {
      getSomeEvents(function (error, result) {
        if (error) {
          throw error;
        }

        let events: Event[] = [];
        for (let obj of result.value) {
          events.push(
            new Event(obj.Subject, obj.Start.DateTime, obj.End.DateTime)
          );
        }
        let coll = new Calendar(world, PSet.set(events));
        then(coll);
      });
    }
  }

  export function events(): EventsMessage {
    return new EventsMessage();
  }

}
