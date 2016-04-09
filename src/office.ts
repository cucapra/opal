/**
 * Basic wrappers around the Office 365 API.
 */

const outlook = require("node-outlook");
const fs = require("fs");
const path = require("path");

// Use the 2.0 version of the Office 365 API.
outlook.base.setApiEndpoint('https://outlook.office.com/api/v2.0');

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
    '$select': 'Subject,Start,End,Attendees',
    '$orderby': 'Start/DateTime asc',
    '$top': 10
  };

  let config = getConfig();
  outlook.calendar.getEvents(
    {token: config.token, user: config.user, odataParams: queryParams},
    cbk
  );
}

export function getFreeTimes(email: string, start: Date, end: Date, cbk: (error: any, result: any) => void) {
  let config = getConfig();
  var requestUrl = 'https://outlook.office.com/api/beta/me/findmeetingtimes';
  var apiOptions = {
      url: requestUrl,
      token: config.token,
      email: config.user,
      payload: {
          "Attendees": [
              { "Type": "Required", "EmailAddress": { "Address": email } },
          ],
          "LocationConstraint": {
              "IsRequired": "false",
              "SuggestLocation": "false",
              "Locations": [{ "DisplayName": "unspecified" }]
          },
          "TimeConstraint": {
              "Timeslots" : [{
                "Start" : dateToOfficeDateTimeTimezone(start),
                "End" : dateToOfficeDateTimeTimezone(end),
              } ]
        },
          "MeetingDuration": "PT30M" ,
          "MaxCandidates" : 50
      },
      method: 'POST'
  };
  outlook.base.makeApiCall(apiOptions, cbk);
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

function pad0(n: number): string {
  if (n < 10) {
    return '0' + n;
  } else {
    return n.toString();
  }
}

export function dateToOffice(d: Date): string {
  return d.getFullYear() +
    '-' + pad0(d.getMonth() + 1) +
    '-' + pad0(d.getDate()) +
    'T' + pad0(d.getHours()) +
    ':' + pad0(d.getMinutes()) +
    ':' + pad0(d.getSeconds());
}

function dateToOfficeDateTimeTimezone(d: Date): any {
  return {
    "Date" : d.getFullYear() + '-' + pad0(d.getMonth() + 1) + '-' + pad0(d.getDate()),
    "Time" : pad0(d.getHours()) + ':' + pad0(d.getMinutes()) + ':' + pad0(d.getSeconds()),
    "TimeZone" : "Pacific Standard Time"
  };
}
