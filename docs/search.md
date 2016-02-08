title: Search Algorithms in OPAL

# Local vs. Global Search Coordination

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
