import {Client, User} from '../src/office';
const restify = require('restify');
import * as crypto from 'crypto';
import * as minimist from 'minimist';
const chrono = require('chrono-node');
import {scheduleMeeting, viewEvents} from './actions';
import * as fs from 'fs';
import * as botlib from './botlib';
import * as luis from './luis';
import util = require('util');

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
  client: Client;
  server: any;  // A Restify server.
  luisURL: string;  // Or null to disable LUIS.
  baseURL: string;

  authRequests: { [key: string]: (token: string, email: string) => void };
  officeUsers: { [convId: string]: User };

  constructor(opts: Options) {
    if (opts.terminal) {
      this.bot = new botlib.TextBot();
    } else {
      this.bot = new botlib.BCBot(opts.bcAppId, opts.bcAppSecret);
    }

    // Set up our main interaction.
    this.bot.on('message', botlib.converse(this.bot, this.converse));

    // Unless we're running in the terminal, log incoming and outgoing
    // messages.
    if (!opts.terminal) {
      this.bot.on('message', (msg, reply) => {
        console.log('<- %s', msg.text);
      });
      this.bot.on('send', (msg: botlib.Message) => {
        console.log('-> %s', msg.text);
      });
    }

    // Create the Office API client.
    this.client = new Client(
      opts.officeAppId,
      opts.officeAppSecret,
      opts.baseURL + "/authorize"
    );

    // Start the Web server.
    this.server = this.setupServer();
    this.authRequests = {};

    this.luisURL = opts.luisURL;
    this.baseURL = opts.baseURL;
    this.officeUsers = {};
  }

  /**
   * Get the currently logged-in Office user, if any.
   */
  getUser(conv: botlib.Conversation): User {
    return this.officeUsers[conv.id];
  }

  /**
   * Ensure we have a logged-in user.
   */
  async ensureUser(conv: botlib.Conversation): Promise<User> {
    let user = this.getUser(conv);
    if (user) {
      let valid = await user.checkCredentials();
      if (valid) {
        return user;
      } else {
        conv.send("Welcome back! Your login seems to have expired.");
        return await this.logIn(conv);
      }
    } else {
      conv.send("Let's get you signed in.");
      return await this.logIn(conv);
    }
  }

  logIn(conv: botlib.Conversation): Promise<User> {
    return new Promise((resolve, reject) => {
      let authKey = randomString();
      this.authRequests[authKey] = (token, email) => {
        conv.send(`That worked! You're now signed in as ${email}.`);
        let user = new User(token, email);
        this.officeUsers[conv.id] = user;
        resolve(user);
      };

      let loginUrl = this.baseURL + "/login/" + authKey;
      conv.send("Please follow this URL: " + loginUrl);
    });
  }

  /**
   * The handler for each newly initiated interaction. This gets called every
   * time a new conversation starts, or when we receive a new message after
   * this handler as completely finished. It is asynchronous, so it can be
   * long-running (or loop infinitely).
   */
  converse = async (conv: botlib.Conversation, msg: botlib.ReceivedMessage) => {
    // Parse the message with LUIS.
    let luisres = await luis.query(this.luisURL, msg.text);
    let max_intent = luis.likelyIntent(luisres);
    if (!max_intent) {
      conv.reply(msg, "I'm sorry; I didn't understand.");
      return;
    }
    console.log("intent:",
                util.inspect(max_intent, { depth: null, colors: true }));

    // Dispatch to the right intent handler.
    let name = max_intent.intent;
    let handler = Interactions[name];
    if (handler) {
      await handler(this, conv, msg, max_intent, luisres.entities);
    } else {
      conv.reply(msg, `I don't handle the ${name} intent yet.`);
    }
  };

  /**
   * Create the web server.
   */
  private setupServer() {
    // The Web server.
    let server = restify.createServer();

    // The OAuth2 callback.
    server.get('/authorize', restify.queryParser(), restify.bodyParser(),
               (req, res, next) => {
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
    server.get('/login/:state', restify.queryParser(), restify.bodyParser(),
               (req, res, next) => {
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
    server.post('/tz/:state',  restify.queryParser(), restify.bodyParser(),
                (req, res, next) => {
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
   * Called with every authentication callback. Return a Boolean indicating
   * whether the request should succeed.
   */
  private authenticated(token: string, email: string, state: string) {
    // TODO Eventually, we should time out entries in this `authRequests`
    // thing to avoid exposing very old, unused requests.
    let cbk = this.authRequests[state];
    if (cbk) {
      delete this.authRequests[state];
      cbk(token, email);
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
      console.log("got user's time zone:", offset);
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
}

/**
 * The type for action handlers.
 */
type IntentHandler =
  (bot: OPALBot, conv: botlib.Conversation, msg: botlib.ReceivedMessage,
   intent: luis.Intent, entities: luis.Entity[]) => Promise<void>;

/**
 * The async handlers for each LUIS intent.
 */
let Interactions: { [key: string]: IntentHandler } = {
  async greeting(bot: OPALBot, conv: botlib.Conversation,
    msg: botlib.ReceivedMessage, intent: luis.Intent,
    entities: luis.Entity[])
  {
    conv.reply(msg, 'Hello there! Let me know if you want ' +
                    'to schedule a meeting.');
  },

  async new_meeting(bot: OPALBot, conv: botlib.Conversation,
    msg: botlib.ReceivedMessage, intent: luis.Intent,
    entities: luis.Entity[])
  {
    // Get the parameters from LUIS.
    let action = luis.triggered(intent, "new_meeting");
    if (!action) {
      console.log("new_meeting action not triggered");
      conv.reply(msg, "I'm sorry; I couldn't schedule your meeting.");
      return;
    }
    let params = luis.likelyParams(action);
    let title = params['meeting_name'] || "Appointment";
    let date = new Date();  // TODO

    // Schedule the meeting.
    let user = await bot.ensureUser(conv);
    console.log("scheduling", title, "on", date);
    let reply = await scheduleMeeting(conv, user, date, title);
    conv.reply(msg, reply);
  },

  async show_calendar(bot: OPALBot, conv: botlib.Conversation,
    msg: botlib.ReceivedMessage, intent: luis.Intent,
    entities: luis.Entity[])
  {
    let date = new Date();  // TODO
    let user = await this.ensureUser(conv);
    let reply = await viewEvents(user, date);
    if (reply.length) {
      reply = "Here's what's on your calendar: " + reply;
    } else {
      reply = "There's nothing on your calendar.";
    }
    conv.reply(msg, reply);
  },
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

// Show sensible errors in promise/async code.
process.on('unhandledRejection', (err, p) => {
  if (err.stack) {
    console.error(err.stack);
  } else {
    console.error(err);
  }
});

main();
