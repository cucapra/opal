import * as botbuilder from 'botbuilder';

let bot = new botbuilder.TextBot();
bot.add('/', function (session) {
  session.send("yo");
});

bot.listenStdin();
