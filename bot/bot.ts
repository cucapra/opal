import * as botbuilder from 'botbuilder';
import {Client, User} from '../src/office';
const restify = require('restify');
import * as crypto from 'crypto';
import * as minimist from 'minimist';
const chrono = require('chrono-node');
import {scheduleMeeting, viewEvents} from './actions';
import * as fs from 'fs';
import * as botlib from './botlib';

/**
 * Generate a random, URL-safe slug.
 */
function randomString() {
  // I'd use base64 here if there were an option for a URL-safe version (or
  // even base32).
  return crypto.randomBytes(8).toString('hex').slice(0, 10);
}

/**
 * HTML page template for the login redirect, which also determines the user's
 * time zone.
 *
 * The server replaces the tokens `DEST_URL` and `TZ_URL` with
 * JavaScript-encoded strings.
 */
const LOGIN_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>OPAL Log In</title>
    <script>
var dest_url = DEST_URL;
var tz_url = TZ_URL;

var offset = (new Date()).getTimezoneOffset();

var xhr = new XMLHttpRequest();
xhr.onreadystatechange = function () {
    // Redirect.
    window.location = dest_url;
};
xhr.open("POST", tz_url);
xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
xhr.send('offset=' + offset);
    </script>
</head>
<body>
    Logging in&hellip;
</body>
</html>
`;


/**
 * Get a date from a LUIS response.
 */
function dateFromLUIS(luis: any): Date {
  // Get the date from the LUIS response.
  let dateEntities = botbuilder.EntityRecognizer.findAllEntities(
    luis.entities, "builtin.datetime.date"
  );
  if (dateEntities.length >= 1) {
    return botbuilder.EntityRecognizer.resolveTime(dateEntities);
  } else {
    return new Date();
  }
}


/**
 * The configuration for `OPALBot`, which is passed to its constructor.
 */
interface Options {
  /**
   * Bot Connector application ID.
   */
  bcAppId: string,

  /**
   * Bot Connector secret.
   */
  bcAppSecret: string,

  /**
   * Office 365 API application ID.
   */
  officeAppId: string,

  /**
   * Office API secret.
   */
  officeAppSecret: string,

  /**
   * The Web URL where the application is hosted.
   */
  baseURL: string,

  /**
   * Run the bot on stdin/stdout for test interaction *instead of* a Bot
   * Connector bot?
   */
  terminal?: boolean,

  /**
   * The LUIS endpoint URL, if this bot should use natural language.
   */
  luisURL?: string,
}

/**
 * A supertype of botlib bot types.
 */
type AnyBot = botlib.BCBot | botlib.TextBot;

type HandleMessage = (msg: botlib.ReceivedMessage, reply: (m?: botlib.Message) => void) => void;

/**
 * All the machinery for an OPAL chat bot instance.
 */
class OPALBot {
  bot: AnyBot;
  authRequests: { [key: string]: any };
  client: Client;
  server: any;  // A Restify server.

  userContinuations: { [id: string]: HandleMessage };

  constructor(opts: Options) {
    if (opts.terminal) {
      this.bot = new botlib.TextBot();
    } else {
      this.bot = new botlib.BCBot(opts.bcAppId, opts.bcAppSecret);
    }

    this.bot.on('message', (msg: botlib.ReceivedMessage, reply: (m?: botlib.Message) => void) => {
      if (!opts.terminal) {
        console.log(msg.text);
      }

      // Find and execute the continuation for this user.
      let k = this.userContinuations[msg.from.id] || this.defaultContinuation;
      k(msg, reply);
    });

    this.bot.on('send', (msg: botlib.Message) => {
      console.log('-> %s', msg.text);
    });

    // Create the Office API client.
    this.client = new Client(
      opts.officeAppId,
      opts.officeAppSecret,
      opts.baseURL + "/authorize"
    );

    // Start the Web server.
    this.server = this.setupServer();
    this.authRequests = {};

    this.userContinuations = {};
  }

  /**
   * Get the currently logged-in Office user, if any.
   */
  getUser(session: botbuilder.Session): User {
    let token = session.userData['token'];
    let email = session.userData['email'];
    if (token) {
      return new User(token, email);
    } else {
      return null;
    }
  }

  /**
   * Ensure we have a logged-in user.
   */
  ensureUser(session: botbuilder.Session): Promise<User> {
    return new Promise<User>((resolve, reject) => {
      let user = this.getUser(session);
      if (user) {
        user.checkCredentials().then((valid) => {
          if (valid) {
            resolve(user);
          } else {
            session.send("Welcome back! Your login seems to have expired.");
            session.beginDialog('/login');
          }
        });
      } else {
        session.send("Let's get you signed in.");
        session.beginDialog('/login');
      }
    });
  }

  defaultContinuation = (msg: botlib.ReceivedMessage, reply: (m?: botlib.Message) => void) => {
    reply({ text: "Hello!" });
  };

  /**
   * Create the web server.
   */
  private setupServer() {
    // The Web server.
    let server = restify.createServer();
    server.use(restify.queryParser());
    server.use(restify.bodyParser());

    // The OAuth2 callback.
    server.get('/authorize', (req, res, next) => {
      let code = req.params['code'];
      let state = req.params['state'];
      console.log("authorization request: state", state);
      this.client.getTokenFromCode(code, (error, token) => {
        if (error) {
          res.send("Sorry! We couldn't sign you in. " + error.message);
          console.log("oauth error:", error);
        } else {
          let pair = this.client.parseToken(token);
          if (this.authenticated(pair[0], pair[1], state)) {
            res.contentType = 'text/html';
            res.end(`<html><head><title>Signed In</title></head><body>` +
                    `<script>window.close();</script>` +
                    `<p>Thanks! You're all signed in. ` +
                    `You can close this tab.</p></body>`);
          } else {
            res.send("We don't have a record of this authentication request.");
          }
        }
      });
      return next();
    });

    // Authentication redirect.
    server.get('/login/:state', (req, res, next) => {
      let state = req.params['state'];
      console.log("redirecting for login: state", state);

      // Format the HTML redirect page.
      let authurl = this.client.getAuthUrl(state);
      let tzurl = "/tz/" + state;
      let out = LOGIN_HTML.replace('DEST_URL', JSON.stringify(authurl));
      out = out.replace('TZ_URL', JSON.stringify(tzurl));

      res.contentType = 'text/html';
      res.end(out);
      return next();
    });

    // Receive time zone callback.
    server.post('/tz/:state', (req, res, next) => {
      let state = req.params['state'];
      let offset = parseInt(req.params['offset']);
      this.gotTimezone(state, offset);
      res.send("Got it.");
      return next();
    });

    // If we're using the Bot Connector, set up its API endpoint.
    let bot = this.bot;
    if (bot instanceof botlib.BCBot) {
      server.post('/api/messages', bot.handler());
    }

    // Log requests.
    server.on('after', (req, resp, route, error) => {
      console.log(resp.statusCode, req.method, req.url);
      if (error) {
        console.log(error);
      }
    });

    // Log exceptions.
    server.on('uncaughtException', (req, res, route, err) => {
      console.error(err.stack);
      res.send("Server error.");
    });

    return server;
  }

  /**
   * Called when a chat session becomes authenticated with the Office API.
   */
  private sessionAuthenticated(session: botbuilder.Session,
    token: string, email: string)
  {
    session.userData['token'] = token;
    session.userData['email'] = email;
    session.beginDialog('/loggedin');
  }

  /**
   * Called with every authentication callback. Return a Boolean indicating
   * whether the request should succeed.
   */
  private authenticated(token: string, email: string, state: string) {
    // TODO Eventually, we should time out entries in this `authRequests`
    // thing to avoid exposing very old, unused requests.
    let session = this.authRequests[state];
    if (session) {
      delete this.authRequests[state];
      this.sessionAuthenticated(session, token, email);
      return true;
    } else {
      return false;
    }
  }

  /**
   * Called when the client reports its time zone
   */
  private gotTimezone(state: string, offset: number) {
    let session = this.authRequests[state];
    if (session) {
      console.log("recording user's time zone:", offset);
      session.userData['tzoffset'] = offset;
    }
  }

  /**
   * Start the bot. It listens for input via its web server and, if configured
   * to, messages on stdin.
   */
  run() {
    // If we're running a terminal bot, connect it to stdin/stdout.
    let bot = this.bot;
    if (bot instanceof botlib.TextBot) {
      bot.run();
    }

    this.server.listen(8191, () => {
      console.log('server listening at %s', this.server.url);
    });
  }

  /**
   * Schedule a meeting based on a user request.
   */
  async schedule(session: BotSession, user: User, date: Date, title: string) {

    console.log("scheduling", title, "on", date);

    return await scheduleMeeting(session, user, date, title);
  }

  /**
   * Get events from a user's calendar.
   */
  async view(user: User, date: Date) {
    let reply = await viewEvents(user, date);
    if (reply.length) {
      return "Here's what's on your calendar: " + reply;
    } else {
      return "There's nothing on your calendar.";
    }
  }
}

/**
 * A wrapper for Session that lets OPAL programs interact with the user.
 */
export class BotSession {
  constructor(public session: botbuilder.Session) {}

  prompt(text: String): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.session.beginDialog('/prompt', [resolve, text]);
    });
  }

  choose(options: String[]): Promise<number> {
    let prompt_parts = [];
    for (let i = 0; i < options.length; ++i) {
      prompt_parts.push(`(${i + 1}) ${options[i]}`);
    }
    let prompt = "Please choose one of: " + prompt_parts.join(", ");

    return new Promise<string>((resolve, reject) => {
      this.session.beginDialog('/prompt', [resolve, prompt]);
    }).then((response) => {
      let index = parseInt(response.trim());
      if (isNaN(index)) {
        // Just choose the first by default if this was a non-number.
        return 0;
      } else if (index <= 0 || index >= options.length) {
        // Out of range. Again, choose a default.
        return 0;
      } else {
        // A valid selection.
        return index - 1;
      }
    });
  }
}

/**
 * Create and run a bot server.
 */
function main() {
  // Parse the command-line options.
  let args = minimist(process.argv.slice(2), {
    boolean: ['t'],
  });
  let terminal: boolean = args['t'];

  // Command-line help.
  if (args['h'] || args['help'] || args['?']) {
    console.error("usage: " + process.argv[1] + " [-t]");
    console.error("  -t: terminal interaction (for testing)");
    process.exit(1);
  }

  // In terminal mode, use a localhost sever.
  let baseURL: string;
  if (terminal) {
    baseURL = "http://localhost:8191";
  } else {
    baseURL = "https://jasmine.radbox.org/opal";
  }

  let opalbot = new OPALBot({
    bcAppId: "opal",
    bcAppSecret: "60aadc8c1092469a9b11537d2ac6835f",
    officeAppId: "7faa69f2-359b-49fc-aba4-38bb7fe7d7ba",
    officeAppSecret: "CkcqfFRAAFejeyBcZbdc0Xr",
    baseURL,
    terminal,
    luisURL: "https://api.projectoxford.ai/luis/v1/application?id=a6aa3cf6-8166-48f7-820c-f4a4e3aa7909&subscription-key=0f76f69291cc4b3783a8689b83622d27",
  });
  opalbot.run();
}

main();
