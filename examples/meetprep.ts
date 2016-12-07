import {opal, Context} from '../src/opal';
import {Event} from '../src/calendar';
import {User} from '../src/office';

const Mbox = require('node-mbox');
const MailParser = require('mailparser').MailParser;

// A document considered for relevance scoring.
class Document {
  constructor(
    public url: string,
    public title: string,
    public text: string,
    public author: string,
    public people: string[],
  ) {}
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
async function get_docs(filename: string): Promise<Document[]> {
  return new Promise<Document[]>((resolve, reject) => {
    let out: Document[] = [];
    let mbox = new Mbox(filename);
    mbox.on('message', (msg: any) => {
      let parser = new MailParser();
      parser.on('end', (mail: any) => {
        out.push(maildoc(mail));
      });
      parser.write(msg);
      parser.end();
    });
    mbox.on('end', () => {
      resolve(out);
    });
  });
}

// Given a mail object from the `mailparser` library, construct a Document.
function maildoc(mail: any) {
  let recip = mail.to.concat(mail.cc);
  let mid = mail.headers['message-id'];
  return new Document(
    mid,  // TODO Eventually, the URL should use RFC 2392.
    mail.subject,
    mail.text,
    mail.from,
    recip,
  );
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
  let all_docs = await get_docs('mail.mbox');  // TODO Hardcoded path.
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
