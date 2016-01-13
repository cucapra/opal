office365Auth
=============

To access your calendar information, you'll need a token, most easily downloaded using your web browser.
This project automates that process.

Try running:
```
node getOfficeAuthToken.js
```

This should open a new web browser window/tab.
Click on the sign in link, and enter your credentials.
The code will get a token and save it to `$HOME/.opal.token.txt`, and also store your email address in `$HOME/.opal.email.txt'.
This is not very secure, but is convenient.

## using the token

Tae a look at `dump_cal.js` for sample code demonstrating how to dump a few calendar events.

## attribution

This is hacked together mostly from here:

https://dev.outlook.com/RestGettingStarted/Tutorial/node

