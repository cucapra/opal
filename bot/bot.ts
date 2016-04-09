import * as botbuilder from 'botbuilder';
import {Auth} from '../src/office';
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
    let authurl = Auth.getAuthUrl();
    session.send("Please follow this URL: " + authurl);
  }
]);

bot.listenStdin();

// The Web server.
let server = restify.createServer();
server.use(restify.queryParser());
server.get('/authorize', function (req, res, next) {
  let code = req.params['code'];
  Auth.getTokenFromCode(code, (error, token) => {
    if (error) {
      res.send("Sorry! We couldn't sign you in. " + error.message);
    } else {
      console.log(token);
      res.send("Thanks! You're all signed in. You can close this tab.");
    }
  });
  return next();
});
server.listen(8191, function () {
  console.log('server listening at %s', server.url);
});
