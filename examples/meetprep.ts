import {opal, Context} from '../src/opal';
import {Event} from '../src/calendar';
import {User} from '../src/office';

// A class for documents that might be relevant. They are currently identified
// by a general URL.
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

function get_docs(): Document[] {
  return [];
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
  let all_docs = get_docs();
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
