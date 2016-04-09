import * as botbuilder from 'botbuilder';
let restify = require('restify');

// The bot interaction (CLI for now).
let bot = new botbuilder.TextBot();
bot.add('/', function (session) {
  session.send("yo");
});
bot.listenStdin();

// The Web server.
let server = restify.createServer();
server.get('/authorize', function (req, res, next) {
  return next();
});
server.listen(8191, function () {
  console.log('server listening at %s', server.url);
});