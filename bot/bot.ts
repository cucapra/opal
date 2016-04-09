import * as botbuilder from 'botbuilder';
import {Auth} from '../src/office';
let restify = require('restify');

const AUTH_CBK = "http://localhost:8191/authorize";

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
    let authurl = Auth.getAuthUrl(AUTH_CBK, "SEEKRIT");
    session.send("Please follow this URL: " + authurl);
  }
]);

bot.listenStdin();

// Handle an authentication.
function authenticated(token: string, email: string, state: string) {
  console.log(token);
  console.log(email);
  console.log(state);
}

// The Web server.
let server = restify.createServer();
server.use(restify.queryParser());
server.get('/authorize', function (req, res, next) {
  let code = req.params['code'];
  let state = req.params['state'];
  Auth.getTokenFromCode(code, AUTH_CBK, (error, token) => {
    if (error) {
      res.send("Sorry! We couldn't sign you in. " + error.message);
    } else {
      res.send("Thanks! You're all signed in. You can close this tab.");
      let pair = Auth.parseToken(token);
      authenticated(pair[0], pair[1], state);
    }
  });
  return next();
});
server.listen(8191, function () {
  console.log('server listening at %s', server.url);
});
