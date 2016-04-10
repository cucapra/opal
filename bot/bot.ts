import * as botbuilder from 'botbuilder';
import {Auth} from '../src/office';
let restify = require('restify');
import * as crypto from 'crypto';

// #CLI
// const AUTH_CBK = "http://localhost:8191/authorize";
const BASE_URL = "http://jasmine.radbox.org:8191";
const AUTH_CBK = BASE_URL + "/authorize";

function randomString() {
  // I'd use base64 here if there were an option for a URL-safe version (or
  // even base32).
  return crypto.randomBytes(8).toString('hex').slice(0, 10);
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
  let loginUrl = BASE_URL + "/login/" + authKey;
  session.send("Please follow this URL: " + loginUrl);
});

// When authorization succeeds.
bot.add('/loggedin', function (session) {
  session.send("That worked! You're now signed in as " +
    session.userData['email'] + ".");
});

// Log some events.
bot.on('error', function (evt) {
  console.log('bot error:', evt);
});
bot.on('Message', function (evt) {
  console.log('received:', evt.text);
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

// The OAuth2 callback.
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

// Authentication redirect. This lets us put cleaner URLs into chat
// messages.
server.get('/login/:state', function (req, res, next) {
  let state = req.params['state'];
  let authurl = Auth.getAuthUrl(AUTH_CBK, state);
  res.redirect(authurl, next);
});

// #CLI
server.post('/api/messages', bot.verifyBotFramework(), bot.listen());

server.listen(8191, function () {
  console.log('server listening at %s', server.url);
});
