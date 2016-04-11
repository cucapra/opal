import * as botbuilder from 'botbuilder';
import {Client} from '../src/office';
let restify = require('restify');
import * as crypto from 'crypto';
import * as minimist from 'minimist';


/**
 * Generate a random, URL-safe string.
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
      this.bot = new botbuilder.TextBot();
    } else {
      this.bot = new botbuilder.BotConnectorBot({
        appId: opts.bcAppId,
        appSecret: opts.bcAppSecret,
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
   * Create the Bot Framework bot object.
   */
  private setupBot(bot: AnyBot, baseURL: string) {
    // The default dialog (the entry point).
    bot.add('/', (session) => {
      if (!session.userData.token) {
        session.beginDialog('/login');
      } else {
        session.send("You're signed in!");
      }
    });

    // A dialog for requesting authorization.
    bot.add('/login', (session) => {
      session.send("Let's get you signed in.");
      let authKey = randomString();
      this.authRequests[authKey] = session;
      let loginUrl = baseURL + "/login/" + authKey;
      session.send("Please follow this URL: " + loginUrl);
    });

    // When authorization succeeds.
    bot.add('/loggedin', (session) => {
      session.send("That worked! You're now signed in as " +
        session.userData['email'] + ".");
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
    function authenticated(token: string, email: string, state: string) {
      let session = this.authRequests[state];
      if (session) {
        this.sessionAuthenticated(session, token, email);
        return true;
      } else {
        return false;
      }
    }

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
          if (authenticated(pair[0], pair[1], state)) {
            res.send("Thanks! You're all signed in. You can close this tab.");
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
  if (args['h'] || args['help'] || args['?']) {
    console.error("usage: " + process.argv[1] + " [-t]");
    console.error("  -t: terminal interaction (for testing)");
    process.exit(1);
  }

  let opalbot = new OPALBot({
    bcAppId: "opal",
    bcAppSecret: "60aadc8c1092469a9b11537d2ac6835f",
    officeAppId: "7faa69f2-359b-49fc-aba4-38bb7fe7d7ba",
    officeAppSecret: "CkcqfFRAAFejeyBcZbdc0Xr",
    baseURL: "https://jasmine.radbox.org/opal",
    terminal,
  });
  opalbot.run();

  // #CLI
  // "http://localhost:8191";
}

main();
