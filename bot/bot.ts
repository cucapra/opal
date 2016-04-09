import * as botbuilder from 'botbuilder';
import * as office from '../src/office';
let restify = require('restify');

// The bot interaction (CLI for now).
let bot = new botbuilder.TextBot();

// The default dialog (the entry point).
bot.add('/', function (session) {
  if (!session.userData.token) {
    session.beginDialog('/login');
  } else {
    session.send("You're signed in!");
  }
});

// A "waterfall" dialog for getting authorized.
bot.add('/login', [
  function (session) {
    session.send("Let's get you signed in.");
    let authurl = office.Auth.getAuthUrl();
    session.send("Please follow this URL: " + authurl);
  }
]);

bot.listenStdin();

// The Web server.
let server = restify.createServer();
server.get('/authorize', function (req, res, next) {
  return next();
});
server.listen(8191, function () {
  console.log('server listening at %s', server.url);
});
