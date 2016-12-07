import {opal, Context} from '../src/opal';
import {Event} from '../src/calendar';
import {User} from '../src/office';

const Mbox = require('node-mbox');
const MailParser = require('mailparser').MailParser;

// A document considered for relevance scoring.
class Document {
  constructor(public url: string) {}
}


// Some dummy functions that will eventually get data from the outside world.

function query_event(): Event {
  return new Event(
    "test",
    new Date(),
    new Date(),
    ["adrian@example.com", "chris@example.com", "sarah@example.com"]
  );
}

// Load some email messages from an `mbox` archive.
// TODO: This is currently a hard-coded path, but you should of course be able
// to point this at a mailbox file.
async function get_docs(): Promise<Document[]> {
  return new Promise<Document[]>((resolve, reject) => {
    let out: Document[] = [];
    let mbox = new Mbox('mail.mbox');
    mbox.on('message', (msg: any) => {
      let parser = new MailParser();
      parser.on('headers', (headers: any) => {
        console.log(headers);
      });
      parser.write(msg);
      parser.end();
    });
    mbox.on('end', () => {
      resolve(out);
    });
  });
}


// Relevance features.

type Feature<T> = string;

type RelFeat = Feature<[Document, Event]>;

let referencesSameAttendees: RelFeat = "rst";

function relevance(event: Event, doc: Document) {
  return 0.99;
}


// The main function.

opal(async function (ctx) {
  // Start with a "key" event and the entire set of documents.
  let event = query_event();
  let all_docs = await get_docs();
  let threshold = 0.8;

  // A collection where we'll store the documents we found.
  let relevant_docs = ctx.collection();

  // Try one document at a time.
  let worlds = ctx.explore(all_docs, doc => async function (ctx) {
    let rel = relevance(event, doc);
    if (rel > threshold) {
      ctx.add(relevant_docs, doc);
    }
  });

  // Join all the worlds together?
  for (let world of worlds) {
    ctx.commit(world);
  }
});
