Choices in OPAL
===============

Choices and optimization are a central concept in OPAL.

This iteration tries to borrow as much as possible from the world of parallel programming. Specifically, the work on [concurrent revisions][cr oopsla] from MSR is a variant of asynchronous and [fork--join][fj] programming that is close to the semantics we want.

[fj]: https://en.wikipedia.org/wiki/Fork%E2%80%93join_model
[cr oopsla]: http://research.microsoft.com/pubs/132619/revisions-oopsla2010.pdf


Concurrent Revisions
--------------------

The example from Figure 1 in [the concurrent revisions paper][cr oopsla] is a good illustration of classic fork--join programming:

    int x = 0;
    task t = fork {
      x = 1;
    }
    // Here, x is either 0 or 1 (it's a race).
    join t;
    // Now, x == 1 is guaranteed.

The idea in concurrent revisions is that tasks are *isolated by default*. Effects in forked tasks do not appear in the main thread before it `join`s the tasks. Again, from the paper:

    versioned<int> x = 0;
    revision r = rfork {
      x = 1;
    }
    // Here, x == 0 is guaranteed.
    rjoin r;
    // Here, x == 1 is guaranteed.

So `rjoin` does two things: it waits for the joined task to complete, and it merged its versioned data into the joining task's state. That `versioned<int>` type decides how to merge updates from two different tasks (i.e., it decides who "wins").


What OPAL Needs
---------------

Borrowing from the CR work gives us a few useful features:

1. Isolation. Hypothetical worlds (CR's "revisions") do not affect the world they were forked from until they are explicitly joined.
2. Programmable resolution. You get to decide how to join the effects of tasks. We need something similar when ranking choices.

Of course, OPAL's choices are also different:

1. Joining forked worlds should be an all-or-nothing affair. Rather than resolving each updated variable independently, we want to "apply" the whole hypothetical world or nothing at all.
2. We want to avoid needing to execute forked code "all the way." That is, if we can decide with limited information that one hypothetical world should win over another, we should be able to kill the second task before it completes.
3. The programming model should support forking lots of "tasks" simultaneously rather than doing it one at a time. (Although perhaps it will be possible to model one using the other.)


Weight Types
------------

We can represent OPAL's weights similarly to CR's versioned types. For example, consider a program that forks two hypothetical worlds:

    weight<float> x;
    world w1 = hypothetical {
      x = 1;
    };
    world w2 = hypothetical {
      x = 2;
    };
    if (x[w1] > x[w2])
      join w1;
    else
      join w2;

Here, I'm using a `hypothetical { ... }` block as an OPAL equivalent of a `fork`. It produces a task value, of type `world`, which the parent task can "apply" using a `join` statement.

The idea is that, while most updates inside of a `hypothetical` block are hidden from the parent until a `join`, there's an exception for `weight<T>` types. While `x` looks like a normal `float` inside the two hypotheticals, the code *outside* the hypotheticals sees it as a dictionary that maps worlds to values.

The `if` in this example is the simplest possible ranking logic: it just compares at the values of `x` from the two worlds to decide.


Weights as Communication Channels
---------------------------------

The above example suggests that all hypothetical blocks need to run to completion before we can decide which one "wins." But a realistic search procedure will need to be more efficient: it will need the ability to observe incremental evidence.

To this end, we define weights a *communication channels* from hypothetical worlds to their parent worlds. That is, in this tiny example with one parent world and one child hypothetical:

    weight<float> x;
    world w1 = hypothetical {
      x = 1;
    };
    print x[w1];

the assignment `x = 1` and the lookup `x[w1]` are, respectively, a write into and a read from a shared communication channel between the two worlds. The idea is the same as for inter-thread synchronization in concurrent programming.

And just as in parallel languages, we have our choice of communication channel constructs. There's no need for OPAL to invent anything new here---it should borrow some existing design from parallel programming:

* The simplest possible communication mechanism, which might be a good fit, is an [IVar][]. An IVar is a write-once shared variable: one task is allowed to assign to it exactly once, and the other task can do a blocking read. In OPAL, this means that a search procedure can wait for exactly as much information as it needs to decide whether to accept or discard a hypothetical world.
* An [LVar][] is a recently-proposed extension of IVars that allows multiple writes as long as they are "monotonic" by some definition. This could help OPAL in situations where hypothetical worlds want to yield an initial value and iteratively refine it.
* At the other end of the complexity spectrum is a full-fledged FIFO queue, like as in [Go][gochan] or [Concurrent ML][].

[Concurrent ML]: https://en.wikipedia.org/wiki/Concurrent_ML
[ivar]: http://dl.acm.org/citation.cfm?id=69562
[gochan]: https://gobyexample.com/channels
[lvar]: http://dl.acm.org/citation.cfm?id=2502326

### Early Termination

Here's an example of how treating weights as communication channels---here, IVars---can save wasted work. Consider this program with a single hypothetical:

    weight<float> x;
    weight<float> y;
    world w = hypothetical {
      x = f();
      y = g();
    }
    if (x[w] > 5)
      discard w;

The code inside the `hypothetical` block can execute *lazily*, avoiding actually doing anything until its parent requests weights from it. Here, the blocking IVar read of `x[w]` forces the block to execute `f()`, but it doesn't need to execute `g()`---the task is killed before any other data is requested.


Multi-Way Choose
----------------

Our old `choose` statement didn't just fork a single task, but we can think of it as syntactic sugar for a sequence of individual forks. That is, this statement:

    weight<float> hecticness;
    world[] ws = choose date {
      ...;
      hecticness = ...;
    }

creates a list of worlds `ws`, each of which executes with a different value for `date`.


Atomicity and the Outside World
-------------------------------

In some ways, our hypotheticals can feel like transactions: they execute in isolation from all other hypotheticals (the I in ACID), and their effects are applied to their parent's state atomically on `join` (A in ACID). We need a way to enforce these transactional properties correctly and efficiently.

OPAL uses two different mechanisms: one for *internal* atomicity, when dealing with data structures inside the OPAL runtime, and a second for *external* atomicity, when we have to deal with the outside world.

### Internal Atomicity

The problem is easiest when we only have to deal with data structures that OPAL owns. For example, imagine temporarily that there is no external calendaring system to deal with: a calendar is just an OPAL collection of `Event` objects. Here's a short example that explores several possible changes to a calendar:

    Event* calendar = get_calendar();

    // Try adding many different events to the calendar.
    weight<float> hecticness;
    world[] ws = choose date {
      Event e = new Event(date);
      calendar.add(e);
      hecticness = calc_hectic(calendar);
    }

    // Choose the least hectic resulting calendar.
    world best_world = argmin(hecticness);
    join best_world;

OPAL's responsibility here is to make sure that *only one* of the many hypothetical `calendar.add(e)` statements actually takes effect after the `join` executes.

Fortunately, this problem is the purview of existing work on fork--join parallelism generally and concurrent revisions specifically. Following the traditional recipe, we need:

* Efficient snapshots for all our data structures. When forking each new hypothetical world, OPAL needs to be able to quickly make a private, mutable copy of `calendar` for use in the world.
* Merge policies for data structure mutations. When the parent task `join`s a child task, we need to know how to update the parent's `calendar`. This is easy as long as only one of the two tasks actually made any changes: just choose the updated value. To keep thing simple, a basic strategy could even choose to throw an exception if there were any conflicting modifications to the same data structure.

It should be easy to choose a good collection data structure that supports fast snapshots with bufferable `add` and `remove` operations.

### External Atomicity

Things are harder when we have to deal with the external world. In a real implementation, `calendar` will be backed by some other service where `calendar.add(e)` translates into an API call we can't take back.

To isolate hypothetical tasks, OPAL uses *shadow collections*. The idea is that, inside hypothetical worlds, reads to external databases can make remote calls, but any mutations are buffered in local OPAL-controlled state. OPAL makes a special distinction for the top-level "main world," which is the only context where external mutations are allowed. When hypothetical updates are `join`ed back into the main world, their buffered updates are released.

Buffered updates, however, are not enough to enforce atomicity with respect to the outside world. The calendar server could interact with other users, adding and removing events, while OPAL is in the midst of hypothetical exploration. To make these situations sane, OPAL needs additional support from remote services. It provides a special `transaction` construct that is only available in the main world:

    // OK
    transaction {
      calendar.add(e);
    }

    // also OK; same effect
    transaction {
      w = hypothetical {
        calendar.add(e);
      }
      join w;
    }

    // error
    w = hypothetical {
      transaction {
        calendar.add(e);
      }
      join w;
    }

The `transaction` construct tries to provide atomic updates to the outside world. I say *tries* because its ability to do so depends on how much support it has from the external data provider.

For example, a calendar server could implement transactions using an opaque transaction token that OPAL requests and returns, or it could provide API calls to acquire and release server-side locks. But transactions that update multiple, independent services will likely only yield "best-effort" transaction semantics.
