/**
 * An example bot using botlib.
 */
import * as botlib from './botlib';
const restify = require('restify');

let bot = new botlib.BCBot("botlib", "b60b01fab9424fccaed5072a995055da");

bot.on('message', (message: botlib.ReceivedMessage, reply) => {
  console.log(message.text);
  bot.send(botlib.makeReply(message, "Something!"));
  reply({ text: "Another test!" });
});

bot.on('error', (err: any) => {
  if (err.stack) {
    console.error(err.stack);
  } else {
    console.error(err);
  }
});

bot.on('send', (msg: botlib.Message) => {
  console.log('-> %s', msg.text);
});

// Set up an HTTP server.
let server = restify.createServer();
server.post('/api/messages', bot.handler());
server.listen(4700, () => {
  console.log("listening on %s", server.url);
});
