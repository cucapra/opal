/**
 * A composable alternative to Bot Builder.
 */

const restify = require('restify');
const msrest = require('ms-rest');
const botconnector = require('botconnector');
const basicauth = require('basic-auth');

interface Response {
  text: string;
}

interface Message {
  replyToMessageId?: string;
  to: string;
  from: string;
  text: string;
}

/**
 * A controller that interacts with the Bot Connector API.
 */
export class Bot {
  /**
   * A Restify server.
   */
  server: any;

  /**
   * Microsoft API REST credentials.
   */
  credentials: { userName: string, password: string };

  /**
   * The Bot Connector client object.
   */
  client: any;

  /**
   * Indicates whether the server is reached via an HTTPS endpoint. If so, we
   * can verify that requests come from Bot Connector. Otherwise, BC doesn't
   * include credentials.
   */
  secure: boolean;

  /**
   * @param appId      The Bot Connector application ID.
   * @param appSecret  The Bot Connector secret.
   * @param secure     Whether this bot is running on an HTTPS sever. If it
   *                   is, we can verify that requests actually come from Bot
   *                   Connector. Otherwise, BC does not include credentials
   *                   in its requests.
   */
  constructor(appId: string, appSecret: string, secure?: boolean) {
    // Set up the HTTP server.
    this.server = restify.createServer();

    // Set up the Bot Connector client.
    this.credentials = new msrest.BasicAuthenticationCredentials(appId, appSecret);
    this.client = new botconnector(this.credentials);

    this.secure = !!secure;

    // Handle requests from Bot Connector.
    // TODO Don't hard-wire this to an endpoint so we can integrate with
    // larger application.
    this.server.post('/api/messages', this.handle);
  }

  /**
   * "Middleware" function that verifies that requests come from Bot
   * Connector.
   */
  private checkAuth(req, res) {
    let auth = basicauth(req);
    if (auth &&
        auth.username === this.credentials.userName &&
        auth.password === this.credentials.password) {
      return true;
    } else {
      // Failure.
      console.error("Authorization failed.");
      res.statusCode = 401;
      res.end('Missing authorization.');
      return false;
    }
  }

  /**
   * Handle incoming messages from Bot Connector.
   */
  private handle(req, res, next) {
    // If we're on a secure connection, verify the request's credentials.
    if (this.secure && !this.checkAuth(req, res)) {
      return next();
    }

    // Parse the JSON request body.
    if (!req.body) {
      console.error("Request missing body.");
      res.statusCode = 400;
      res.end("Missing body.");
      return next();
    }
    let msg: Message;
    try {
      msg = JSON.parse(req.body);
    } catch (e) {
      console.error("Invalid request body:", e);
      res.statusCode = 400;
      res.end("Invalid body.");
      return next();
    }

    console.log(msg);
    res.send({ text: "This is a test!" });
    next();
  }

  /**
   * Unilaterally send a message to a user.
   */
  send(msg: Message): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.messages.sendMessage(
        msg,
        {
          customHeaders: {
            'Ocp-Apim-Subscription-Key': this.credentials.password
          }
        },
        (err, result, request, response) => {
          if (err) {
            reject(err);
          } else {
            resolve(response);
          }
        }
      );
    });
  }
}

// TODO Just a test.
let bot = new Bot("botlib", "b60b01fab9424fccaed5072a995055da");
bot.server.listen(4700, () => {
  console.log("listening on %s", bot.server.url);
});
