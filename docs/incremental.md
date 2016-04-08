title: Options for Incrementalism in OPAL

These are some notes on how we might add incremental refinement to OPAL.

# The Scenario & Status Quo

Imagine a meeting-scheduling algorithm that both detects conflicts and uses a notion of when the user prefers to meet (i.e., their typical workday; a tiny version of the "shadow calendar" idea we've been talking about).
The OPAL program needs to compute both factors for each hypothetical schedule and rank options by their combination.

Here's what this looks like in today's OPAL.
(This actually works; it's in the repository as `examples/schedule_workday.ts`.)

```typescript
async function schedule(ctx: Context, cal: Calendar, range: Iterable<Date>,
                        prefStart: number, prefEnd: number,
                        title: string, minutes: number)
{
  let score = ctx.weight<number>();

  // Constants used to weight the two ranking factors.
  const conflictCost = 2.0;  // Cost per conflict.
  const prefCost = 1.0;  // Cost per hour outside of preferred range.

  let worlds = ctx.explore(range, start => async function (ctx) {
    // Try adding the event to the calendar.
    let evt = new Event(title, start, dateAdd(start, minutes));
    ctx.add(cal, evt);

    // To compute the weighting factors, we need the unmodified calendar and
    // the modifications we want to make to it.
    let oldCal = ctx.clean_view(cal);
    let edit = ctx.diff(cal);

    // Compute the weighting factors.
    let conflictCount = edit.score( e => countConflicts(oldCal, e) );
    let distFromPref = edit.score( e => getSadness(prefStart, prefEnd, e) );

    // Combine the two factors into a cost.
    ctx.set(score, conflictCount * conflictCost +
                   distFromPref * prefCost);
  });

  // Find the best time.
  return await ctx.minimize(worlds, score);
}
```

As a summary, this is how it works:

1. The `explore` function creates a bunch of hypothetical worlds, one for each potential start time.
2. In the hypothetical world, we add the proposed new event to the calendar.
3. Then we get an "edit" value indicating the changes to the calendar. The `clean_view` function gets the old, unmodified state of the calendar.
4. Using the edit, we compute our two ranking features: the number of conflicts, and the distance that the new event lies outside the preferred range of hours. The language guide has more information on [how that magic-looking `edit.score` function works][diffdoc].
5. We combine the two factors into a `score` that indicates the world's rank.
6. The `minimize` utility finds the world that minimizes `score`.

In effect, this will try to fill in gaps in my schedule.
When there are no more slots left, it will start encroaching into my personal time at the beginning and the end of the day, from the inside out.

[diffdoc]: http://adriansampson.net/opal/lang.html#diff

# Goal

In this example, adding incrementalism should let us cheaply update:

* The original calendar `cal`, if the user wants to add or remove previous commitments on the fly.
* The preferred time range (i.e., `prefStart` and `prefEnd` above).
* The relative importance of the weighting factors (i.e., the `conflictCost` and `prefCost` constants above).

We should then be able to re-rank the results in `minimize` without recomputing everything.

The problem with the current language is that it doesn't "carve up" the computation enough: there are no delineations between the chunks of code that would need to be re-executed separately.
This disaggregation, along with conflict detection, is a pre-requisite for incrementalism.

# Weight Trees

Here's an idea that lets hypothetical worlds decompose weight computations into parts.
The weight output is then computed lazily.

```typescript
// Set up three *separate* weights for the world.
let conflicts = ctx.weight<number>();
let sadness = ctx.weight<number>();
let score = ctx.weight<number>();

let worlds = ctx.explore(range, start => async function (ctx) {
  // Create the hypothetical event.
  ctx.add(cal, ...);

  // Now compute the two parts of the weight separately. The left-hand side of
  // the arrow functions here describe what the computations depend on. This is
  // a bit idealized (we'd need more information to get the dependencies), but
  // you get the idea.
  ctx.set(conflicts, (edit, oldCal) =>
    edit.score( e => countConflicts(oldCal, e) )
  );
  ctx.set(sadness, (edit, prefStart, prefEnd) =>
    edit.score( e => getSadness(prefStart, prefEnd, e) )
  );

  // Now we use the output of those two computations to compute an overall
  // score. A real version of this function would also need to declare its
  // dependence on `conflictCost` and `prefCost`.
  ctx.set(score, (conflicts, sadness) =>
    conflicts * conflictCost +
    sadness * prefCost
  );
});

// Now the parent can choose to look at any of the three weights: `conflicts`,
// `sadness`, or the combined value `score`.
ctx.minimize(worlds, score);
```

The idea is to redefine a "weight" to be a recorded computation instead of fixed value.
You set a weight by giving it a function so the system can re-run that code if necessary.

# Parents Compute Weights

Another alternative would be to move the responsibility for computing weights entirely onto the parent---i.e., into the ranking call, `minimize`.
This way, the world would *just* modify its state.
Then, `minimize` would take a function for computing a score. This function would still need to be decomposed somehow into three separate components.
Here's what that might look like:

```typescript
let worlds = ctx.explore(range, start => async function (ctx) {
  ctx.add(cal, ...);
});

// A "weight" here now just means a computation that uses information about the
// hypothetical world and produces a number.
ctx.minimize(worlds, (world) => {
  let conflicts = weight((edit, oldCal) => ...);
  let sadness = weight((prefStart, prefEnd) => ...);
  let score = weight((conflicts, sadness) => ...);
  return score;
});
```

# Hybrid Responsibility
