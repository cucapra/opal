/**
 * A composable alternative to Bot Builder.
 */

const restify = require('restify');
const msrest = require('ms-rest');
const botconnector = require('botconnector');

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
   * @param appId      The Bot Connector application ID.
   * @param appSecret  The Bot Connector secret.
   * @param secure     Whether this bot is runnong on an HTTPS sever. If it
   *                   is, we can verify that requests actually come from Bot
   *                   Connector. Otherwise, BC does not include credentials
   *                   in its requests.
   */
  constructor(appId: string, appSecret: string, secure?: boolean) {
    // Set up the HTTP server.
    this.server = restify.createServer();
    this.server.use(restify.authorizationParser());
    this.server.use(restify.bodyParser());

    // Set up the Bot Connector client.
    this.credentials = new msrest.BasicAuthenticationCredentials(appId, appSecret);
    this.client = new botconnector(this.credentials);

    // Handle requests from Bot Connector.
    // TODO Don't hard-wire this to an endpoint so we can integrate with
    // larger application.
    if (secure) {
      // Is this application running on HTTPS? If so, we'll check to make sure
      // requests actually come from Bot Connector.
      this.server.post('/api/messages', this.verifyRequest, this.handle);
    } else {
      this.server.post('/api/messages', this.handle);
    }
  }

  /**
   * "Middleware" function that verifies that requests come from Bot
   * Connector.
   */
  private verifyRequest(req, res, next) {
    if (req.authorization && req.authorization.basic &&
        req.authorization.basic.username === this.credentials.userName &&
        req.authorization.basic.password === this.credentials.password) {
      // Success.
      next();
    } else {
      // Failure.
      console.error("Authorization failed.");
      res.send(403);
    }
  }

  /**
   * Handle incoming messages from Bot Connector.
   */
  private handle(req, res, next) {
    var msg: Message = req.body;
    console.log(msg.text);
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
