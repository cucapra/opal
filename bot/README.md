# OPAL Chat Bot

## Using the Bot

You can say:

* "add (something with a day in it)" to schedule a meeting
* "show (day)" to see events from your calendar

The bot should help you log into your Outlook account automatically when you send your first command.

## Running the Bot

Build OPAL:

```sh
npm install
npm run typings
npm run build
```

Build the bot in the same way, which is kind of dumb:

```sh
cd bot
npm install
npm run typings
npm run build
```

Run the server, which uses Bot Connector to interface with services:

```sh
npm run serve
# or:
node build/bot/bot.js
```

Or run the terminal version for testing:

```sh
npm run run
# or:
node build/bot/bot.js -t
```
