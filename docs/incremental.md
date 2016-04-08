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

    // Get the number of conflicts the event would create.
    let oldCal = ctx.clean_view(cal);  // Unmodified set of events.
    let edit = ctx.diff(cal);  // The modifications to make.
    let conflictCount = edit.score( e => countConflicts(oldCal, e) );

    // Check whether the event is in the user's preferred range and, if not,
    // how far out-of-range it its.
    let distFromPref = 0;
    if (evt.start.getHours() <= prefStart) {
      distFromPref = prefStart - evt.start.getHours();
    }
    if (evt.end.getHours() >= prefEnd) {
      distFromPref = evt.end.getHours() - prefEnd;
    }

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
3. Then we get a "patch" indicating the changes to the calendar. The `clean_view` function gets the old, unmodified state of the calendar.
4. We compute our two ranking features: the number of conflicts, and the distance that the new event lies outside the preferred range of hours. The language guide has more information on [how that magic-looking `edit.score` function works][diffdoc].
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

# ???

The current approach places all of the weighting computation in the hypothetical world, which makes it difficult to incrementalize.
Here's one alternative that instead places all of the weighting in the parent world:

```typescript
let worlds = ctx.explore(range, start => async function (ctx) {
  ctx.add(cal, ...);
});

function conflictScore(cal: Calendar, edit: Edit<Event>) {
  // Count the conflicts introduced by `edit`.
}

function preferenceScore(prefStart: number, prefEnd: number, edit: Edit<event>) {
  // Determine how far outside of the preferred range
}

function score(world: World) {
  let edit = ctx.diff_child(world, cal);
}
```
