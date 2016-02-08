title: Search Algorithms in OPAL

[TITLE]

# Local vs. Global Search Coordination

One important loose end in OPAL's design is whether it can easily express search algorithms both *local* and *global* coordination.
Local reasoning is when the algorithm makes decisions based on a single decision at a time, unaware of any prior decisions or even "sibling" or "cousin" decisions being made concurrently.

Here's a simple abstract example where global reasoning can be helpful.
Say you're exploring a search space where each potential (partial) solution has 5 "child" solutions to explore recursively.
At the top level, you generate 5 initial solutions, and each of those generate 5 refined solutions, and so on.
Of those first 5 solutions generated, say that solution 1 has five *excellent* children and solution 2 happens to have five *terrible* children.
Clearly, you'd want to prune the entirety of solution 2 and instead explore all of solution 1's children---but this requires global coordination.
A search algorithm with purely local reasoning is powerless to detect situations like this.

The "weights" concept we currently have is fine for expressing local reasoning, but we may need something more complex for global search procedures.


# By Example

As a refresher, here's how you currently write a simple, single-level exploration of a set of possible outcomes:

    let domain = /* ... the set of possibilities ... */;
    let weight = ctx.weight();  // Initialize a communication channel.
    let worlds = ctx.explore(domain, candidate => function* (ctx) {
      // ... act on `candidate` to build up the hypothetical world ...
      yield ctx.set(weight, fitness());  // Use some scoring mechanism.
    });
    let selected: World = yield* ctx.minimize(worlds, weight);
    ctx.commit(world);  // Apply the changes from the winning world.

For example, here's a simplistic version of our favorite application:

    function reschedule(calendar: Calendar, appointment: Event) {
      let domain = generateTimes(...);
      let conflicts = ctx.weight();

      let worlds = ctx.explore(domain, startTime => function* (ctx) {
        // Add the rescheduled event to the calendar and remove the old version.
        let newEvent = new Event(startTime, ...);
        ctx.add(calendar, newEvent);
        ctx.del(calendar, appointment);

        // Decide how much we like this new schedule.
        ctx.set(conflicts, countConflicts(calendar));
      });


      // Choose the world with the fewest conflicts.
      ctx.commit(yield* ctx.minimize(worlds, conflicts));
    }

Of course, a complete version of the algorithm should be recursive. Let's give it the power to reschedule the conflicts it discovers:

    function reschedule(calendar: Calendar, appointment: Event) {
      // ...
      let worlds = ctx.explore(domain, startTime => function* (ctx) {
        let newEvent = new Event(startTime, ...);
        ctx.add(calendar, newEvent);
        ctx.del(calendar, appointment);

        // If we've created a new conflict, try rescheduling recursively.
        let otherEvent = getConflict(calendar, newEvent);
        if (otherEvent) {
          reschedule(calendar, otherEvent);
        }

        // Probably some more nuanced fitness function here.
        ctx.set(happiness, evaluate(calendar));
      }
      // ...
    }

This recursive strategy is an example of *local reasoning* in the search algorithm. Each rescheduling is decided in isolation.
This is nice because it's simple to write down---it's not even that different from the non-recursive algorithm.
But the search is powerless to detect that it's going down a generally bad path: if, at one point in the recursion the solution quality is so bad that further recursion isn't likely to redeem it.

The language problem here is that any given weight in this version is only visible in two worlds: where it's defined (the parent) and where it's set (the child).
To make this kind of global coordination possible, we'd need some mechanism to make the weights at *all points* in the recursive tree visible at the top level.
