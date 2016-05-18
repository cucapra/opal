import {opal, Context} from '../src/opal';

interface PartialDate {
  dayOfWeek?: number;
  dayOfMonth?: number;
  month?: number;
  relativeDays?: number;
}

function dateMatch(date: Date, constraints: PartialDate) {
  if (constraints.dayOfWeek !== undefined) {
  }
}

async function resolveDate(base: Date, evidence: PartialDate) {
}

opal(async function (ctx) {
  let date = await resolveDate(
    new Date(),
    { dayOfWeek: 2 }
  );
});
