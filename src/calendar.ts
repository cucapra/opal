/// <reference path="opal.ts" />
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

  class EventsMessage extends Message {
    dispatch(world: World, then: (res: any) => void) {
      getSomeEvents(function (error, result) {
        if (error) {
          throw error;
        }

        let objs = result.value;
        let coll = new Collection(world, PSet.set(objs));
        then(coll);
      });
    }
  }

  export function events(): EventsMessage {
    return new EventsMessage();
  }

}