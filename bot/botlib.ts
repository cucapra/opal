/**
 * A composable alternative to Bot Builder.
 */

const basicauth = require('basic-auth');
import http = require('http');
import https = require('https');
import events = require('events');
import readline = require('readline');

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
 * Create a reply message for an original, incoming message.
 */
export function makeReply(original: ReceivedMessage,
                          text: string): OutgoingMessage
{
  return {
    text,
    from: original.to,
    to: original.from,
    replyToMessageId: original.id,
    channelConversationId: original.channelConversationId,
  };
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
    // Apparently, Restify *sometimes* gathers the body up and assigns it onto
    // the `IncomingMessage`. We don't get the ordinary Node events. This is
    // deeply uncomfortable, uncomposable, and unsafe. I almost can't believe
    // it's real. But we'll deal with it.
    if ((msg as any).body) {
      resolve((msg as any).body);
      return;
    }

    let chunks = [];
    msg.on('data', (chunk) => chunks.push(chunk));
    msg.on('end', () => {
      let body = Buffer.concat(chunks).toString();
      resolve(body);
    });
    msg.on('error', reject);
  });
}

export type Bot = BCBot | TextBot;

const API_DEFAULT_HOST = 'api.botframework.com';
const API_BASE = '/bot/v1.0';

/**
 * A controller that interacts with the Bot Connector API.
 */
export class BCBot extends events.EventEmitter {
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
   * The Bot Connector API hostname.
   */
  bchost: string;

  /**
   * @param appId      The Bot Connector application ID.
   * @param appSecret  The Bot Connector secret.
   * @param secure     Whether this bot is running on an HTTPS server. If it
   *                   is, we can verify that requests actually come from Bot
   *                   Connector. Otherwise, BC does not include credentials
   *                   in its requests.
   * @param bchost     The hostname to use for BC API requests instead of the
   *                   default, public server.
   */
  constructor(public appId: string, public appSecret: string,
              secure?: boolean, bhost?: string) {
    super();
    this.secure = !!secure;
    this.bchost = bhost || API_DEFAULT_HOST;
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
      let cbk = (reply?: Message) => {
        if (!replied) {
          // Send the response, if any.
          if (reply) {
            this.emit('send', reply);
            send(res, reply);
          } else {
            send(res, {});
          }

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
  send(msg: OutgoingMessage): Promise<string> {
    this.emit('send', msg);
    return this.request('/messages', JSON.stringify(msg));
  }

  /**
   * Save a user's stored data.
   *
   * This seems to be broken---even following the documentation exactly, this
   * gets a "bad request" error every time.
   */
  setUserData(userId: string, data: any): Promise<string> {
    let path = `/bots/${this.appId}/users/${userId}`;
    let botdata = {
      data,
      eTag: "string",
    };
    return this.request(path, JSON.stringify(botdata)).catch((res) => {
      console.error("saving failed: %s", res);
    });
  }

  /**
   * Send an API request to Bot Connector.
   */
  private request(path: string, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Send the request.
      let req = https.request({
        hostname: this.bchost,
        path: API_BASE + path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
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

/**
 * A bot that you can type to in the console.
 */
export class TextBot extends events.EventEmitter {
  run() {
    let rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.on('line', (text: string) => {
      // Construct a message structure.
      let msg: ReceivedMessage = {
        text,
        id: "message",
        conversationId: "conversation",
        channelConversationId: "channelConversation",
        created: (new Date()).toISOString(),
        language: "en",
        from: {
          name: "name",
          channelId: "channel",
          address: "address",
          id: "user",
          isBot: false,
        },
        to: {
          name: "botname",
          channelId: "channel",
          address: "address",
          id: "bot",
          isBot: true,
        },
        participants: [],
        attachments: [],
        mentions: [],
        hashtags: [],
      };

      this.emit('message', msg, (reply?: Message) => {
        if (reply) {
          this.emit('send', reply);
        }
      });
    });
  }

  send(msg: OutgoingMessage) {
    this.emit('send', msg);
    console.log(msg.text);
  }
}

/**
 * A conversation between a bot and a human user.
 */
export class Conversation {
  constructor (
    public cist: Conversationalist,
    public user: User,
    public botUser: User,
    public id: string,  // i.e., conversationId
    public channelConversationId: string
  ) {}

  /**
   * Construct a conversation from an incoming message in the conversation.
   */
  static fromMessage(cist: Conversationalist, msg: ReceivedMessage) {
    return new Conversation(cist, msg.from, msg.to, msg.conversationId,
                            msg.channelConversationId);
  }

  /**
   * Send a message to the user.
   */
  send(text: string) {
    this.cist.bot.send({
      text,
      from: this.botUser,
      to: this.user,
      channelConversationId: this.channelConversationId,
    });
  }

  /**
   * Send a reply to a message from the user.
   */
  reply(msg: ReceivedMessage, text: string) {
    this.cist.bot.send(makeReply(msg, text));
  }

  /**
   * Wait for a message in the conversation.
   */
  receive(): Promise<ReceivedMessage> {
    return new Promise((resolve, reject) => {
      this.cist.continuations[this.id] = (msg) => {
        delete this.cist.continuations[this.id];
        resolve(msg);
      };
    });
  }

  /**
   * Wait for a message and get its text.
   */
  async read(): Promise<string> {
    return (await this.receive()).text;
  }

  /**
   * Ask a question and return the response.
   */
  async prompt(text: string): Promise<string> {
    this.send(text);
    return await this.read();
  }

  /**
   * Ask for a choice from a list of options. Return the selected index (or
   * zero if there's no valid choice).
   */
  async choose(options: string[]): Promise<number> {
    let prompt_parts = [];
    for (let i = 0; i < options.length; ++i) {
      prompt_parts.push(`(${i + 1}) ${options[i]}`);
    }
    let prompt = "Please choose one of: " + prompt_parts.join(", ");

    let response = await this.prompt(prompt);
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
  }
}

/**
 * The type for initial conversation handlers.
 */
type ConversationHandler = (conv: Conversation, msg: ReceivedMessage) => void;

/**
 * A Conversationalist holds the state for continuing conversations
 * asynchronously.
 */
interface Conversationalist {
  bot: Bot;
  continuations: { [convId: string]: (msg: ReceivedMessage) => void };
};

/**
 * An asynchronous conversation handler for a bot's `message` event.
 */
export function converse(bot: Bot, handler: ConversationHandler) {
  let cist: Conversationalist = { bot, continuations: {} };
  return (msg: ReceivedMessage, reply: (m?: OutgoingMessage) => void) => {
    // Don't reply immediately.
    reply();

    // Either resume a continuation or invoke the initial handler to get
    // things started.
    let k = cist.continuations[msg.conversationId];
    if (k) {
      k(msg);
    } else {
      let conv = Conversation.fromMessage(cist, msg);
      handler(conv, msg);
    }
  };
}
