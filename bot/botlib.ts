/**
 * A composable alternative to Bot Builder.
 */

const basicauth = require('basic-auth');
import http = require('http');
import https = require('https');
import events = require('events');
import url = require('url');

export interface Message {
  text: string;
}

export interface User {
  name: string;
  channelId: string;
  address: string;
  id: string;
  isBot: boolean;
}

export interface ReceivedMessage extends Message {
  id: string;
  conversationId: string;
  created: string;  // An ISO 8601 date string.
  language: string;  // A two-letter language code.
  from: User;
  to: User;
  participants: User[];
  totalParticipants: number;
  channelConversationId: string;

  // I'm not yet sure what these are used for.
  attachments: any[];
  mentions: any[];
  hashtags: any[];
}

export interface OutgoingMessage extends Message {
  from: User;
  to: User;
  replyToMessageId?: string;
  channelConversationId?: string;
}

/**
 * Send JSON data in a response and close the connection.
 */
function send(res: http.ServerResponse, json: any) {
  res.setHeader('Content-Type', 'application/json');
  res.write(JSON.stringify(json));
  res.end();
}

/**
 * Wait for the entire body of an incoming HTTP message to be received and
 * invoke a callback.
 */
function read(msg: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let chunks = [];
    msg.on('data', (chunk) => chunks.push(chunk));
    msg.on('end', () => {
      let body = Buffer.concat(chunks).toString();
      resolve(body);
    });
    msg.on('error', reject);
  });
}

/**
 * A controller that interacts with the Bot Connector API.
 */
export class Bot extends events.EventEmitter {
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
  constructor(public appId: string, public appSecret: string, secure?: boolean) {
    super();
    this.secure = !!secure;
  }

  /**
   * Verify that requests come from Bot Connector. Send a rejection if not.
   * Return a Boolean indicating whether authorization succeeded.
   */
  private checkAuth(req: http.IncomingMessage, res: http.ServerResponse) {
    let auth = basicauth(req);
    if (auth &&
        auth.username === this.appId &&
        auth.password === this.appSecret) {
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
   * Handle incoming requests from Bot Connector. Issue a `message` event with
   * each incoming message.
   */
  handle(req: http.IncomingMessage, res: http.ServerResponse) {
    // If we're on a secure connection, verify the request's credentials.
    if (this.secure && !this.checkAuth(req, res)) {
      return;
    }

    // Read the request body.
    read(req).then((body) => {
      // Parse the JSON request body.
      let msg: ReceivedMessage;
      try {
        msg = JSON.parse(body);
      } catch (e) {
        console.error("Invalid request body:", e);
        res.statusCode = 400;
        res.end("Invalid body.");
        return;
      }

      // Set up the reply callback. *One* handler is allowed to use a callback
      // to issue an immediate reply.
      let replied = false;
      let cbk = (reply: Message) => {
        if (!replied) {
          // Send the response.
          send(res, reply);

          // Prevent further replies;
          replied = true;
          return true;
        } else {
          return false;
        }
      };

      // Dispatch the message.
      let handled = false;
      try {
        handled = this.emit('message', msg, cbk);
      } catch (e) {
        this.emit('error', e);
      }

      // If no one replied, send a null response.
      send(res, {});
    });
  }

  /**
   * Get a bound handler method. This exists because ES6 class semantics are
   * broken. :cry:
   */
  handler = () => this.handle.bind(this);

  /**
   * Unilaterally send a message to a user.
   */
  send(msg: OutgoingMessage): Promise<any> {
    let parts = url.parse('https://api.botframework.com/bot/v1.0/messages');
    let body = JSON.stringify(msg);

    return new Promise((resolve, reject) => {
      // Send the request.
      let req = https.request({
        hostname: parts.hostname,
        path: parts.path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body.length,  // TODO Check for Unicode safety.
          'Ocp-Apim-Subscription-Key': this.appSecret,
        },
        auth: `${this.appId}:${this.appSecret}`,
      });
      req.write(body);
      req.end();

      // Handle the response.
      req.on('response', (res: http.IncomingMessage) => {
        read(res).then((data) => {
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            reject(data);
          }
        });
      });
    });
  }
}

// TODO Just a test.
let bot = new Bot("botlib", "b60b01fab9424fccaed5072a995055da");
bot.on('message', (message: ReceivedMessage, reply) => {
  console.log(message.text);
  bot.send({
    text: "Something!",
    from: message.to,
    to: message.from,
    replyToMessageId: message.id,
    channelConversationId: message.channelConversationId,
  });
  reply({ text: "Another test!" });
});
bot.on('error', (err: any) => {
  if (err.stack) {
    console.error(err.stack);
  } else {
    console.error(err);
  }
});

const restify = require('restify');
let server = restify.createServer();
server.post('/api/messages', bot.handler());
server.listen(4700, () => {
  console.log("listening on %s", server.url);
});
