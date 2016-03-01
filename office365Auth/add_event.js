var outlook = require("node-outlook");
var fs = require("fs");
var path = require("path");

function getUserHome() {
    return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

function addEvent() {
  var home = getUserHome();
  var email = fs.readFileSync(path.join(home, ".opal.email.txt"));
  var token = fs.readFileSync(path.join(home, ".opal.token.txt"));
  var timezone = 'Pacific Standard Time';

  // Set the API endpoint to use the v2.0 endpoint
  outlook.base.setApiEndpoint('https://outlook.office.com/api/v2.0');
  // Set the anchor mailbox to the user's SMTP address
  outlook.base.setAnchorMailbox(email);
  outlook.base.setPreferredTimeZone(timezone);

  var user = {
    email: email,
    timezone: timezone,
  };
  var newEvent = {
    'Subject': 'a test event',
    'Body': {
      'ContentType': 'HTML',
      'Content': 'description body',
    },
    'Start': {
      'DateTime': '2014-02-02T18:00:00',
      'TimeZone': timezone,
    },
    'End': {
      'DateTime': '2014-02-02T18:00:00',
      'TimeZone': timezone,
    },
    'Attendees': [],
  };

  outlook.calendar.createEvent({token: token, user: user, event: newEvent},
    function(error, result){
      if (error) {
        console.log('createEvent returned an error: ' + error);
      }
      else if (result) {
        console.log('createEvent returned:', result);
      }
    });
}

addEvent();
