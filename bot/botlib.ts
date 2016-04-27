/**
 * A composable alternative to Bot Builder.
 */

const restify = require('restify');
const msrest = require('ms-rest');
const botconnector = require('botconnector');
const basicauth = require('basic-auth');
import http = require('http');

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
   * @param secure     Whether this bot is running on an HTTPS server. If it
   *                   is, we can verify that requests actually come from Bot
   *                   Connector. Otherwise, BC does not include credentials
   *                   in its requests.
   */
  constructor(appId: string, appSecret: string, secure?: boolean) {
    this.secure = !!secure;

    // Set up the Bot Connector client.
    this.credentials = new msrest.BasicAuthenticationCredentials(appId, appSecret);
    this.client = new botconnector(this.credentials);
  }

  /**
   * "Middleware" function that verifies that requests come from Bot
   * Connector.
   */
  private checkAuth(req: http.IncomingMessage, res: http.ServerResponse) {
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
   * Handle incoming requests from Bot Connector.
   */
  handle(req: http.IncomingMessage, res: http.ServerResponse, next) {
    // If we're on a secure connection, verify the request's credentials.
    if (this.secure && !this.checkAuth(req, res)) {
      return next();
    }

    // Read the request body.
    let bodyChunks = [];
    req.on('data', (chunk) => bodyChunks.push(chunk));
    req.on('end', () => {
      let body = Buffer.concat(bodyChunks).toString();

      // Parse the JSON request body.
      let msg: Message;
      try {
        msg = JSON.parse(body);
      } catch (e) {
        console.error("Invalid request body:", e);
        res.statusCode = 400;
        res.end("Invalid body.");
        return next();
      }

      // Dispatch the message.
      let reply: Response;
      try {
        reply = this.message(msg);
      } catch (e) {
        console.error(e.stack);
        res.statusCode = 500;
        res.end("Internal bot error.");
        return next();
      }

      // Send a response.
      res.setHeader('Content-Type', 'application/json');
      res.write(JSON.stringify(reply));
      res.end();
      next();
    });
  }

  /**
   * A new message was received.
   */
  message(msg: Message): Response {
    console.log(msg);
    return { text: "This is a test!" };
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
let server = restify.createServer();
server.post('/api/messages', bot.handle);
server.listen(4700, () => {
  console.log("listening on %s", server.url);
});
