title: OPAL Language

pre, code {
  language: TypeScript;
}

<style>
.madoko p, .madoko li {
  -webkit-hyphens: auto;
  -moz-hyphens: auto;
  -ms-hyphens: auto;
  hyphens: auto;
}
</style>

[TITLE]

This document explains the OPAL language and APIs. They are currently implemented as a prototype embedded in [TypeScript][].

[TypeScript]: http://www.typescriptlang.org/


# Entry and the Context

An OPAL program is a TypeScript program.
To use OPAL, wrap your code in a top-level call to the `opal` entry-point function:

    opal(async function (ctx) {
      // Your code here...
    });

Your code appears inside an [async function][async] that gets a context object as an argument.
To invoke OPAL's magic, you'll typically make asynchronous calls through the context using JavaScript's `await` operator.
So OPAL-specific operations will usually look like:

    await ctx.something_or_other();

Eventually, we'd like to provide syntactic sugar to make these calls less verbose.

[async]: https://tc39.github.io/ecmascript-asyncawait/


# Hypothetical Worlds

OPAL lets you enter *hypothetical worlds* to make tentative changes without immediately committing to them.
Use the `ctx.hypothetical` function to enter one:

    let world = ctx.hypothetical(async function (ctx) {
      // More code here...
    });

The code inside, which is also wrapped in an [async function][], doesn't run immediately.
And when it does run, its changes are isolated from the rest of the system.
So it's free to explore possibilities that we'll later abandon and to generally mess up global state with impunity.
The function returns a *world object*, which we'll use later to access weights and commit data-structure updates.


# Weights

OPAL programs use *weights* to communicate between worlds.
You can think of a weight as an [IVar][] cell that a *child world* can write into and its *parent world* can read out of.
First, create a weight by calling `ctx.weight()`:

    let weight = ctx.weight();

Then, in a hypothetical world, you can assign the weight's value using `await ctx.set`:

    let world = ctx.hypothetical(function* (ctx) {
      // ...
      await ctx.set(weight, 42);
      // ...
    });

Finally, back in the parent (non-hypothetical) world, you can retrieve this value using `await ctx.get`:

    console.log(await ctx.get(weight, world));

You have to tell the `get` function *which world* you want to read a value from.
This reveals the real magic of weights that separates them from garden-variety variables: different worlds can `set` different values for the same weight without interfering.
Then, their mutual parent world can observe all of these values.

Calling `get` also ensures that there is actually something to read from the given hypothetical world by *executing it* at least until it calls `set` on the weight.
Think of this as lazy evaluation: hypothetical worlds only execute up to the point where their parent world needs them.

[ivar]: http://dl.acm.org/citation.cfm?id=69562


# Collections and Committing { #collections }

OPAL includes a data structure called a *collection*, which is just an ordinary set imbued with magical OPAL powers.
Hypothetical updates (i.e., element addition and deletion) can be hidden until the parent world specifically decides to *commit* them.

First, create a set with `ctx.collection`:

    let coll = ctx.collection<number>();

Then, unsurprisingly, you can use `ctx.add` and `ctx.del` to add and delete elements from the set:

    ctx.add(coll, 1989);
    ctx.del(coll, 1989);

To get the contents of a collection, use `ctx.view`:

    for (let v of ctx.view(events)) {
      console.log(v);
    }

The magic comes in when you make updates in hypothetical code:

    let world = ctx.hypothetical(async function (ctx) {
      // ...
      ctx.add(coll, 1337);
      // ...
    });

This addition will appear as usual if you call `ctx.view(coll)` in the hypothetical world.
But if you view it from the *parent* world, outside of the hypothetical block, it won't have the value 1337.
This isn't just because of OPAL's lazy evaluation: OPAL also *isolates* updates in hypothetical worlds so the parent world doesn't see them.
(That's why they're called hypothetical.)

The parent can also decide that a hypothetical world's updates are worthy of applying to the *real* world.
Call `await ctx.commit` to finish executing a child world and merge its changes into the current world:

    await ctx.commit(world);

After this commit, `ctx.view(coll)` will now show the addition of 1337 performed in the hypothetical world.


# Exploring and Ranking { #explore }

OPAL provides some convenient utilities that use its basic machinery to do more sophisticated things. The `explore` and `minimize` functions together let you search a space of possibilities and choose the best one.

First, call `ctx.explore` to fork many different worlds, each with a different "candidate value":

    let worlds = ctx.explore(domain, candidate => async function (ctx) {
      // ... do something with `candidate` ...
    });

Pass the set of possibilities to search as the `domain` parameter. (The domain may be infinite, as long as you don't plan on exploring it exhaustively!) The `explore` function returns a set of worlds, one for each candidate.

Next, you'll want to choose the best world according to some criterion. This is where weights come in: in the hypothetical code, set a weight indicating the "quality" of the candidate. You can call `await ctx.minimize` to choose the world that minimizes that weight:

    let selected: World = await ctx.minimize(worlds, weight[, limit]);

Pass the set of worlds from an `explore` call, a weight, and (optionally) a maximum number of worlds to try before giving up. (You'll definitely want to use `limit` if your domain is infinite.) The function returns the world in which `weight` is smallest. You then might want to `commit` that "winning" world.


# External Collections

OPAL lets you interact with external services by representing their data as collections.
The idea is that you can represent a calendar, for instance, as a set of events.
You can add to and remove from this set hypothetically, just as you can with ordinary collections.
When you're ready to commit those hypothetical changes, they go out as concrete API requests to an external service.

Using an external collection looks exactly like using an ordinary collection.
To *implement* an external collection, subclass the `ExternalCollection` abstract base class from OPAL and implement its `send` method.
Here's an example of a `Calendar` class, which is an external collection of `Event` objects (the definition of `Event` is not shown):

    class Calendar extends ExternalCollection<Event> {
      send(old: PSet.Node<Event>, ops: PSet.Operation<Event>[]) {
        // Interact with your service here...
      }
    }

OPAL will call the `send` method when there are changes that need to be sent out to the external world.
The `ops` parameter is a list of *operation* objects indicating the updates to be sent.
There are two kinds of operations, `Add` and `Delete`, that you'll want to check for:

    for (let op of ops) {
      if (op instanceof PSet.Add) {
        // API call to add `op.value`...
      } else if (op instanceof PSet.Delete) {
        // API call to delete `op.value`...
      }
    }

You also need to return a new set value to the indicate the updated data that the OPAL program should see.
One easy option is to use `PSet.set(values)` to construct a new set from an array of `values`.

With all this in place, OPAL programs can use `ctx.add`, `ctx.del`, `ctx.view`, and commits to interact with your new external collection.
When those operations appear in hypothetical worlds, they are buffered internally as those "Operation" objects.
When updates appear (or are committed) in the top-level, non-hypothetical world, your `send` method gets called and the operations are unleashed.


# Calendars { #calendars }

OPAL includes a library for interacting with Outlook calendars on Office 365.
To use it, import the `calendar` module from OPAL.
For example:

    import { Event, Calendar, getEvents, modifyEvent } from '../src/calendar';

## Get Calendar Events

Inside your OPAL program, call the `getEvents` function to fetch calendar information for the current user:

    let cal = getEvents(ctx);

The only parameter is an OPAL context.
The function returns a `Calendar`, which is an OPAL collection of `Event` objects.
(That is, it's a subtype of `Collection<Event>`.)

## View, Add, and Delete Calendar Events

Because a calendar is just a kind of collection, you can use the ordinary [OPAL collection tools][#collections] to interact with it.
Specifically, use `ctx.view()` to get the `Event` objects out of a calendar:

    for (let event of ctx.view(cal)) {
      console.log(event.subject);
    }

Use `ctx.add()` to create a new event:

    ctx.add(cal, new Event(subject, start, end))

The three parameters to the `Event` class constructor are a subject string, a start [`Date`][jsdate], and an end `Date`.

Use `ctx.del()` to delete an event:

    ctx.del(cal, Array.from(ctx.view(cal))[0])

[jsdate]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date

## Modify Calendar Events

The generic OPAL collection APIs don't support mutation, so the calendar library provides its own `modifyEvent` function:

    modifyEvent(ctx, cal, event, { subject: "a new subject" });

The parameters are the OPAL context, the calendar collection, the `Event` object to modify, and an object containing the fields of the event that you want to change.
