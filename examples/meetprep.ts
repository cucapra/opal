import {opal, Context} from '../src/opal';
import {Event} from '../src/calendar';
import {User} from '../src/office';

function query_event(): Event {
  return new Event(
    "test",
    new Date(),
    new Date(),
    ["adrian@example.com", "chris@example.com", "sarah@example.com"]
  );
}

opal(async function (ctx) {
  let e = query_event();
});
