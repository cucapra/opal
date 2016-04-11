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

const simple_oauth2 = require("simple-oauth2");

/**
 * Office authentication tools.
 */
export class Client {
  oauth2: any;
  scopes: string[];

  /**
   * Create a new client using these OAuth application credentials. Also
   * provide an OAuth callback URL.
   */
  constructor(clientID: string,
              clientSecret: string,
              public authCallbackURL: string) {
    this.oauth2 = simple_oauth2({
      clientID,
      clientSecret,
      site: "https://login.microsoftonline.com/common",
      authorizationPath: "/oauth2/v2.0/authorize",
      tokenPath: "/oauth2/v2.0/token"
    });

    this.scopes = [
      "openid",
      "profile",  // Required to get user's email address.
      "https://outlook.office.com/mail.read",
      "https://outlook.office.com/calendars.readwrite",
    ];
  }

  /**
   * Get a URL that a user should follow to authenticate with the
   * Office service.
   *
   * @param callbackUrl  Where the user is redirected after authenticating.
   *                     You need to get the token from this request.
   * @param state        A secret string that will be passed back so you
   *                     can identify this specific auth request.
   */
  getAuthUrl(state: string) {
    return this.oauth2.authCode.authorizeURL({
        redirect_uri: this.authCallbackURL,
        scope: this.scopes.join(" "),
        state: state
    });
  }

  getTokenFromCode(auth_code: string, callback: (error: any, token: string) => void) {
      var token: any;
      this.oauth2.authCode.getToken({
          code: auth_code,
          redirect_uri: this.authCallbackURL,
          scope: this.scopes.join(" ")
      }, function (error: any, result: string) {
          if (error) {
              callback(error, null);
          }
          else {
              token = this.oauth2.accessToken.create(result);
              callback(null, token);
          }
      });
  }

  getEmailFromIdToken(id_token: string) {
      // JWT is in three parts, separated by a '.'
      var token_parts = id_token.split('.');

      // Token content is in the second part, in urlsafe base64
      var encoded_token = new Buffer(token_parts[1].replace("-", "_").replace("+", "/"), 'base64');

      var decoded_token = encoded_token.toString();

      var jwt = JSON.parse(decoded_token);

      // Email is in the preferred_username field
      return jwt.preferred_username
  }

  /**
   * Given an OAuth token object, return the token string and the user's
   * email address. Together, these can be used for future API requests.
   */
  parseToken(token: any): [string, string] {
    var t = token.token.access_token;
    var em = this.getEmailFromIdToken(token.token.id_token);
    return [t, em];
  }
}
