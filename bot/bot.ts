import * as botbuilder from 'botbuilder';
import {Client, User} from '../src/office';
const restify = require('restify');
import * as crypto from 'crypto';
import * as minimist from 'minimist';
const chrono = require('chrono-node');
import {scheduleMeeting} from './actions';

/**
 * Generate a random, URL-safe slug.
 */
function randomString() {
  // I'd use base64 here if there were an option for a URL-safe version (or
  // even base32).
  return crypto.randomBytes(8).toString('hex').slice(0, 10);
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
}

/**
 * A supertype of Bot Builder bot types.
 */
type AnyBot = botbuilder.BotConnectorBot | botbuilder.TextBot;

/**
 * All the machinery for an OPAL chat bot instance.
 */
class OPALBot {
  bot: AnyBot;
  authRequests: { [key: string]: any };
  client: Client;
  server: any;  // A Restify server.

  constructor(opts: Options) {
    // The Bot Builder bot object.
    if (opts.terminal) {
      this.bot = new botbuilder.TextBot({
        minSendDelay: 100,
      });
    } else {
      this.bot = new botbuilder.BotConnectorBot({
        appId: opts.bcAppId,
        appSecret: opts.bcAppSecret,
        minSendDelay: 100,
      });
    }
    this.setupBot(this.bot, opts.baseURL);

    this.client = new Client(
      opts.officeAppId,
      opts.officeAppSecret,
      opts.baseURL + "/authorize"
    );
    this.server = this.setupServer();
    this.authRequests = {};
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
   * Create the Bot Framework bot object.
   */
  private setupBot(bot: AnyBot, baseURL: string) {
    // The default dialog (the entry point). Makes sure the user is
    // authenticated before doing anything.
    bot.add('/', (session) => {
      let user = this.getUser(session);
      if (user) {
        session.send("Let's get you signed in.");
        session.beginDialog('/login');
      } else {
        session.beginDialog('/command');
      }
    });

    // Main command menu.
    let cmdDialog = new botbuilder.CommandDialog();
    bot.add('/command', cmdDialog);
    
    cmdDialog.matches('^hi', (session) => {
      session.send('Hello there! Let me know if you want to schedule a meeting.');
    });
    
    cmdDialog.matches('^(schedule|add|meet) (.*)', (session, args) => {
      let user = this.getUser(session);
      if (!user || !user.checkCredentials()) {
        session.send("Welcome back! Your login seems to have expired.");
        session.beginDialog('/login');
        return;
      }
      
      let arg = args.matches[2];
      let reply = this.schedule(user, arg);
      session.send(reply);
    });
    
    cmdDialog.onDefault(
      botbuilder.DialogAction.send("Let me know if you need anything.")
    );

    // A dialog for requesting authorization.
    bot.add('/login', (session) => {
      let authKey = randomString();
      this.authRequests[authKey] = session;
      let loginUrl = baseURL + "/login/" + authKey;
      session.send("Please follow this URL: " + loginUrl);
    });

    // When authorization succeeds.
    bot.add('/loggedin', (session) => {
      session.send("That worked! You're now signed in as " +
        session.userData['email'] + ".");
      session.beginDialog('/command');
    });

    // Log some events.
    bot.on('error', (evt) => {
      console.log('bot error:', evt);
    });
    bot.on('Message', (evt) => {
      console.log('received:', evt.text);
    });

    return bot;
  }

  /**
   * Create the web server.
   */
  private setupServer() {
    // The Web server.
    let server = restify.createServer();
    server.use(restify.queryParser());

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
            res.end(`<html><head><title>Signed In</title><head><body>` +
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

    // Authentication redirect. This lets us put cleaner URLs into chat
    // messages.
    server.get('/login/:state', (req, res, next) => {
      let state = req.params['state'];
      console.log("redirecting for login: state", state);
      let authurl = this.client.getAuthUrl(state);
      res.redirect(authurl, next);
    });

    // If we're using the Bot Connector, set up its API endpoint.
    let bot = this.bot;
    if (bot instanceof botbuilder.BotConnectorBot) {
      server.post('/api/messages', bot.verifyBotFramework(), bot.listen());
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
   * Start the bot. It listens for input via its web server and, if configured
   * to, messages on stdin.
   */
  run() {
    // If we're running a terminal bot, connect it to stdin/stdout.
    let bot = this.bot;
    if (bot instanceof botbuilder.TextBot) {
      bot.listenStdin();
    }

    this.server.listen(8191, () => {
      console.log('server listening at %s', this.server.url);
    });
  }
  
  /**
   * Schedule a meeting based on a user request.
   */
  schedule(user: User, request: string): string {
    let parsed = chrono.parse(request)[0];
    if (parsed === undefined) {
      return "Please tell me when you want the meeting.";
    }
    
    let date: Date = parsed.start.date();
    console.log("scheduling a meeting on", date);
    
    return scheduleMeeting(user, date);
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
  });
  opalbot.run();
}

main();
