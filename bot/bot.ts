import * as botbuilder from 'botbuilder';
import {Auth} from '../src/office';
let restify = require('restify');
import * as crypto from 'crypto';

// #CLI
// const AUTH_CBK = "http://localhost:8191/authorize";
const AUTH_CBK = "http://jasmine.radbox.org:8191/authorize";

function randomString() {
  return crypto.randomBytes(64).toString('hex');
}

// The bot interaction (CLI for now).
// #CLI
// let bot = new botbuilder.TextBot();
let bot = new botbuilder.BotConnectorBot({
  appId: "opal",
  appSecret: "60aadc8c1092469a9b11537d2ac6835f",
});

// The default dialog (the entry point).
bot.add('/', function (session) {
  if (!session.userData.token) {
    session.beginDialog('/login');
  } else {
    session.send("You're signed in!");
  }
});

// This shouldn't be a global. :(
let authRequests = {};

// A dialog for requesting authorization.
bot.add('/login', function (session) {
  session.send("Let's get you signed in.");
  let authKey = randomString();
  authRequests[authKey] = session;
  let authurl = Auth.getAuthUrl(AUTH_CBK, authKey);
  session.send("Please follow this URL: " + authurl);
});

// When authorization succeeds.
bot.add('/loggedin', function (session) {
  session.send("That worked! You're now signed in as " +
    session.userData['email'] + ".");
});

// #CLI
// bot.listenStdin();

// Handle an authentication.
function sessionAuthenticated(session: botbuilder.Session,
  token: string, email: string)
{
  session.userData['token'] = token;
  session.userData['email'] = email;
  session.beginDialog('/loggedin');
}

function authenticated(token: string, email: string, state: string) {
  let session = authRequests[state];
  if (session) {
    sessionAuthenticated(session, token, email);
    return true;
  } else {
    return false;
  }
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
      let pair = Auth.parseToken(token);
      if (authenticated(pair[0], pair[1], state)) {
        res.send("Thanks! You're all signed in. You can close this tab.");
      } else {
        res.send("We don't have a record of this authentication request.");
      }
    }
  });
  return next();
});

// #CLI
server.post('/api/messages', bot.verifyBotFramework(), bot.listen());

server.listen(8191, function () {
  console.log('server listening at %s', server.url);
});
