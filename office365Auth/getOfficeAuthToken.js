var server = require("./server");
var router = require("./router");
var authHelper = require("./authHelper");
var outlook = require("node-outlook");
var opener = require("opener");
var fs = require("fs");
var path = require("path");

var handle = {};
handle["/"] = home;
handle["/authorize"] = authorize;
handle["/mail"] = mail;
handle["/calendar"] = calendar;
handle["/quit"] = quit;

server.start(router.route, handle);

opener("http://localhost:8191/", function (err) {
    if (err) throw err;
    console.log("opener returned...");
});

function quit() {
    console.log("goodbye.");
    process.exit(0);
}

function getUserHome() {
    return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

function authorized(email, token) {
    var home = getUserHome();
    fs.writeFileSync(path.join(home, ".opal.email.txt"), email);
    fs.writeFileSync(path.join(home, ".opal.token.txt"), token);
}

function home(response, request) {
    console.log("Request handler 'home' was called");
    response.writeHead(200, { "Content-Type": "text/html" });
    response.write("<p>sign in <a href=\"" + authHelper.getAuthUrl() + "\">here</a>, please</p>");
    response.write("<p><a href='quit'>Shut down</a></p>");
    response.end();
}

var url = require("url");
function authorize(response, request) {
    console.log("Request handler 'authorize' was called.");
    
    // The authorization code is passed as a query parameter
    var url_parts = url.parse(request.url, true);
    var code = url_parts.query.code;
    console.log("Code: " + code);
    authHelper.getTokenFromCode(code, tokenReceived, response);
}

function tokenReceived(response, error, token) {
    if (error) {
        console.log("Access token error: ", error.message);
        response.writeHead(200, { "Content-Type": "text/html" });
        response.write('<p>ERROR: ' + error + '</p>');
        response.end();
    }
    else {
        var t = token.token.access_token;
        var em = authHelper.getEmailFromIdToken(token.token.id_token);
        var cookies = ['node-tutorial-token=' + token.token.access_token + ';Max-Age=3600',
            'node-tutorial-email=' + authHelper.getEmailFromIdToken(token.token.id_token) + ';Max-Age=3600'];
        response.setHeader('Set-Cookie', cookies);
        response.writeHead(200, { "Content-Type": "text/html" });
        response.write('<p>Access token saved in cookie.</p>');
        response.write("<p><a href='mail'>View a few emails</a></p>");
        response.write("<p><a href='calendar'>View a few calendar appointments</a></p>");
        response.write("<p><a href='quit'>Shut down</a></p>");
        response.end();
        authorized(em, t);
    }
}

function getValueFromCookie(valueName, cookie) {
    if (cookie.indexOf(valueName) !== -1) {
        var start = cookie.indexOf(valueName) + valueName.length + 1;
        var end = cookie.indexOf(';', start);
        end = end === -1 ? cookie.length : end;
        return cookie.substring(start, end);
    }
}


function mail(response, request) {
    var token = getValueFromCookie('node-tutorial-token', request.headers.cookie);
    console.log("Token found in cookie: ", token);
    var email = getValueFromCookie('node-tutorial-email', request.headers.cookie);
    console.log("Email found in cookie: ", email);
    if (token) {
        response.writeHead(200, { "Content-Type": "text/html" });
        response.write("<p><a href='mail'>View a few emails</a></p>");
        response.write("<p><a href='calendar'>View a few calendar appointments</a></p>");
        response.write("<p><a href='quit'>Shut down</a></p>");
        response.write('<div><h1>Your inbox</h1></div>');
        
        var queryParams = {
            '$select': 'Subject,ReceivedDateTime,From',
            '$orderby': 'ReceivedDateTime desc',
            '$top': 10
        };
        
        // Set the API endpoint to use the v2.0 endpoint
        outlook.base.setApiEndpoint('https://outlook.office.com/api/v2.0');
        // Set the anchor mailbox to the user's SMTP address
        outlook.base.setAnchorMailbox(email);
        
        outlook.mail.getMessages({ token: token, odataParams: queryParams },
      function (error, result) {
            if (error) {
                console.log('getMessages returned an error: ' + error);
                response.write("<p>ERROR: " + error + "</p>");
                response.end();
            }
            else if (result) {
                console.log('getMessages returned ' + result.value.length + ' messages.');
                response.write('<table><tr><th>From</th><th>Subject</th><th>Received</th></tr>');
                result.value.forEach(function (message) {
                    console.log('  Subject: ' + message.Subject);
                    var from = message.From ? message.From.EmailAddress.Name : "NONE";
                    response.write('<tr><td>' + from + 
              '</td><td>' + message.Subject +
              '</td><td>' + message.ReceivedDateTime.toString() + '</td></tr>');
                });
                
                response.write('</table>');
                response.end();
            }
        });
    } else {
        response.writeHead(200, { "Content-Type": "text/html" });
        response.write('<p> No token found in cookie!</p>');
        response.end();
    }
}

function calendar(response, request) {
    var token = getValueFromCookie('node-tutorial-token', request.headers.cookie);
    var email = getValueFromCookie('node-tutorial-email', request.headers.cookie);
    if (token) {
        response.writeHead(200, { "Content-Type": "text/html" });
        response.write("<p><a href='mail'>View a few emails</a></p>");
        response.write("<p><a href='calendar'>View a few calendar appointments</a></p>");
        response.write("<p><a href='quit'>Shut down</a></p>");
        response.write('<div><h1>Your calendar</h1></div>');
        
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
        
        outlook.calendar.getEvents({ token: token, odataParams: queryParams },
      function (error, result) {
            if (error) {
                console.log('getEvents returned an error: ' + error);
                response.write("<p>ERROR: " + error + "</p>");
                response.end();
            }
            else if (result) {
                console.log('getEvents returned ' + result.value.length + ' events.');
                response.write('<table><tr><th>Subject</th><th>Start</th><th>End</th></tr>');
                result.value.forEach(function (ev) {
                    console.log('  Subject: ' + ev.Subject);
                    response.write('<tr><td>' + ev.Subject + 
              '</td><td>' + ev.Start.DateTime.toString() +
              '</td><td>' + ev.End.DateTime.toString() + '</td></tr>');
                });
                
                response.write('</table>');
                response.end();
            }
        });
    } else {
        response.writeHead(200, { "Content-Type": "text/html" });
        response.write('<p> No token found in cookie!</p>');
        response.end();
    }
}
