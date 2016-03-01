var outlook = require("node-outlook");
var fs = require("fs");
var path = require("path");

function getUserHome() {
    return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

function readCal() {
  var home = getUserHome();
  var email = fs.readFileSync(path.join(home, ".opal.email.txt"));
  var token = fs.readFileSync(path.join(home, ".opal.token.txt"));

  var queryParams = {
    '$select': 'Subject,Start,end',
    '$orderby': 'Start/DateTime desc',
    '$top': 10
  };

  // Set the API endpoint to use the v2.0 endpoint
  outlook.base.setApiEndpoint('https://outlook.office.com/api/v2.0');
  // Set the anchor mailbox to the user's SMTP address
  outlook.base.setAnchorMailbox(email);
  outlook.base.setPreferredTimeZone('Pacific Standard Time');

  outlook.calendar.getEvents({token: token, odataParams: queryParams},
    function(error, result){
      if (error) {
        console.log('getEvents returned an error: ' + error);
      }
      else if (result) {
        console.log('getEvents returned ' + result.value.length + ' events.');
        result.value.forEach(function(ev) {
          console.log('  Subject: ' + ev.Subject);
        });
      }
    });
}

readCal();
