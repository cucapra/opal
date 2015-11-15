OPAL
====

These are some initial notes on OPAL, a hypothetical Office Productivity Assistant Language.

Goals
-----

The idea is to design a programming language that can express the commands we give to a Cortana-like intelligent assistant. Here are some reasons this language could be better than the current ad-hoc approach to defining these actions:

* The language could serve as the right target for NLP and other interfaces that try to translate user intent into actions.
* Having a well-defined language would make it easy for programmers to write custom workflows.
* Abstractions would make it easier to integrate new components: sources of data, inference strategies, etc. For example, when a new mechanism for *notifying the user* or *determining the relationship between two people* is invented, existing scenarios could take advantage of it transparently without specific tuning.
* It would enable program analysis over these actions to optimize them (e.g., for a performance/utility trade-off) or to schedule them on a distributed system.

Design
------

Here are a few half-baked ideas for language features that might add up to the system we want.


### Basic Data Model

Let's start with data. Since we often want to deal with database-like collections of user data, let's represent that in the type system. The language has records:

    type Event = { title: String, when: Date, where: Location }

And it should probably have lists, written `[T]`:

    type Email = { from: Person, to: [Person], subject: String, body: String }

It also has a kind of type for *collections* of data, where `T*` is a collection of `T`s. Unlike lists, which should be reasonably small, collections can be of unbounded size---perhaps too big to fit into memory. It's not too different from [`IEnumerable` in LINQ land][list-vs-ienumerable]. For example:

    type Mailbox = { owner: Person, messages: Email* }
    type Calendar = Event*

Sources of data are represented as functions that produce collections:

    function get_user_mail() -> Mailbox

Similarly, machine learning models and other inference tasks are functions that take collections as arguments:

    type Topic = { name: String, keywords: [String] }
    function mine_expertise(Email*) -> Topic*

So far, this looks like a data-oriented API implemented in an everyday programming language, but it should already be useful for writing some simple tasks. We'll make things more complicated in a moment.

[list-vs-ienumerable]: http://stackoverflow.com/questions/3628425/ienumerable-vs-list-what-to-use-how-do-they-work


### Structural Subtyping

Our language needs to be *open:* it should be as easy as possible to use new components as they're added to the system. To that end, programs in the language can use values according to their "shape." (This will be especially important for *sketching,* in the next section.)

Our language uses [structural subtyping][structural]. As in [Go][] or [TypeScript][], the `Email` type definition above just indicates the *minimum requirements* for something to be considered an email. Any other type with the same fields---or even extra fields---is a subtype of `Email`. So if a separate component defines another record type for emails that has some extra bookkeeping information, anything that works with `Email`s can happily use that type too.

More radically, we extend structural typing to *functions* in addition to records. This would mean that you're free to provide extra arguments to a function that just ignores them. (And, complementarily, functions are free to return extra data that you ignore.) Say you have a function that recognizes people in a photograph. It might have the function type:

    type Recognize = { photo: Image } -> { subjects: [Person] }

(Here, I'm "naming" the values by using records as the argument and return types.) Maybe you have an alternative face recognition engine that needs to know how many faces to look for:

    type MyRecognize = { photo: Image, n: Int } -> { subjects: [Person] }

With structural typing, `MyRecognize` is a *supertype* of `Recognize`. So any implementation of the former type can be used in a context that's expecting to use the latter---in that case, `n` will just be ignored.

**TK:** We'll probably want something like [Unity's "brands"][unity] to help express more information about functions' intent.

[structural]: https://en.wikipedia.org/wiki/Structural_type_system
[go]: https://golang.org/
[typescript]: http://www.typescriptlang.org/
[unity]: http://www.cs.cmu.edu/~donna/public/ecoop08.pdf


### Open Composition via Sketching

One of the goals of this project is to compose components that don't know anything about each other. That is, the user might dictate a "program" that says *cancel the meeting with Alice*. The command composes several kinds of tasks:

* Find out who "Alice" is.
* Find the most likely upcoming event involving that person.
* Contact "Alice" on channel to tell them about the cancelation.

There are different ways to accomplish each subtask, and the overall program that describes the request shouldn't have to worry about the choices.

In the language, then, we might write the scenario as something like:

    let person = find_contact("Alice")
    let event = event_with(person)
    remove_from_calendar(event)
    let message = EventChangeMessage{
      event: event,
      action: Cancel,
    }
    notify(person, message)

The calls to `find_contact`, `event_with`, and `notify` shouldn't refer to specific, concrete implementations. Instead, they should work as extension points, where they mean *find me something that can do this task*.

We can implement this "open composition" as a kind of [program sketching][sketch]. The basic idea in sketching is to add a "wildcard" language construct that means "find me some expression that fits in this context."

In our language, combining wildcards with structural typing makes this easy to write. Everywhere that you're not sure exactly which function you want, you instead just use the type of the function with a wildcard, written `??`. For example, the `FindContact` function type could be written:

    type FindContact = { name: String } -> { person: Person }

Then, to summon some available implementation of the type, write `FindContact??`. The invocation looks like this:

    let person = FindContact??("Alice")

This instructs the system to fill in the blank for the function and then invoke it with the argument `"Alice"`. These "typed wildcards" (which I haven't seen before in the sketching literature) help us constrain the search problem and lets us type-check programs before filling in the blanks.

**TK:** Unify this with search/optimization, below. Perhaps by using a "distribution over functions".

[sketch]: http://people.csail.mit.edu/asolar/papers/thesis.pdf


### Confidence, Uncertainty, and Distributions

In many scenarios we brainstormed, there are interdependent choices that need to be resolved. Even in our tiny "cancel the meeting with Alice" example, the resolutions of "Alice" and "the meeting" should not be completely separate: if the user knows multiple Alices, we should choose the one they have a meeting with soon.

At the risk of crossing over into the realm of [probabilistic programming languages][ppl] and generic machine learning problems, we should make this kind of uncertainty first-class in the language. For instance, we could introduce a *distribution type*, which is like a collection but is weighted by probability. If a distribution over `T`s is written `T~` (akin to [Uncertain&lt;T&gt;][uncertaint]), then we could define our contact lookup function to quantify its uncertainty:

    function find_contact(name: String) -> Person~

And the same for the `event_with` function, which might also find several options if there are multiple meetings with the person:

    function event_with(who: Person) -> Event~

Notice that although `event_with` takes a single person as an argument, we want to invoke it with the *distribution* over people returned by `find_contact`. We allow this in language by defining some way to compose the probability distributions.

**TK:** How, exactly? Does every `T~` imply a Bayesian network?

Eventually, we need a way to choose the most likely value from a distribution: that is, to go from a `T~` to a `T`. We can provide generic inference strategies that use sampling to find a likely value, but we can also allow for custom strategies. For example, you might write a resolution method that asks the user to choose from a ranked list of the 5 most likely `T`s above some probability threshold.

[ppl]: http://dippl.org/
[uncertaint]: http://research.microsoft.com/apps/pubs/default.aspx?id=208236


### Optimization Search

Another common pattern in our brainstorming is *optimization problems:* decision-making where there many different decisions and the user has many different preferences and constraints that define the space of possible actions.

A great example is travel planning: it could be that you can book a better hotel if you're willing to take a red-eye on the way home. We should be able to describe each of the individual options as data in the language, and then define a `preference` objective function that assigns a weight to an entire itinerary. A red-eye could incur a negative weight, for example, and the distance from the hotel to the conference center would incur another cost.

The language could support scenarios using something similar to the uncertainty type `T~`: optimizing according to an objective is not too different from sampling according to a probability distribution. The language might provide a `weight` operation:

    function <T> weight(collection: T*, objective: T -> float) -> T~

that converts from an unweighted collection `T*` to a probability distribution `T~` according to a specified scoring function.


### Privacy

We could consider making privacy a first-class concern. Especially in office scenarios, we often want to express tasks that use information from multiple people---and we should avoid exposing sensitive data while still enabling powerful coordination among teams.

One basic strategy is [type-based information flow tracking][iflow]. The language would optionally tag each type with the user who owns the data. The type system would, by default, prevent outputting information owned by user A to user B; you would need to use explicit constructs to disclose any data.

For our purposes, we might need something a little more complex: the safety of a disclosure can depend on dynamic state, like the "trainedness" of a machine-learning model. A model based on just two users' data is not anonymizing, but a model based on two thousand users might be.

Here's one way to model privacy concerns: tag every value with a set of users who are allowed to see the data. For example, the components that fetch mailboxes or calendars can define strict policies by tagging values only with their owners:

    function get_mailbox(user: Person) -> Mailbox:
      ...
      email.allowed = user
      ...

Correspondingly, components that display data would check these tags and either throw an error or apply some negative weight.

The language should use some built-in rules for propagating these `allowed` sets through information flow rules, but these can only make values *less* permissive. Helper components can use explicit endorsements to make values *more* permissive. A function that asks the user to confirm exposure, for example:

    public_data = confirm(private_data, to_whom)

can add new users to the `allowed` set.

In a learning case, the model could dynamically decide---based on internal state---whether to declassify information.

[iflow]: http://www.cs.cornell.edu/andru/papers/jsac/sm-jsac03.pdf


### Composing Systems

One of this project's goals is to integrate disparate systems to enable higher-level tools that build on top of them. We need to provide a way for services to expose their data to each other. This can work by writing an "API shim" that wraps a system's existing capabilities and makes it manifest as values in our language.

Each service writes an interface definition that describes what it can provide. This is something like a C header file: it contains only names and types; it doesn't have any implementations. For example, a calendar system might define an interface like the examples above:

    type Event = { title: String, when: Date, where: Location }
    type Calendar = Event*
    function get_calendar(user: Person) -> Calendar

There's no source code that implements `get_calendar`. Instead, our language defines a way to translate an interface like this to lower-level API calls. There are two ways we could do this:

* We describe a one-to-one correspondence between language-level constructs and a specific format of RPC service. Services need to implement this RPC interface and translate it internally to their API. This would make the system completely flexible but would require more work to integrate systems.
* We define a way to describe *existing* HTTP-based APIs and map them onto language-level constructs. This would be less flexible---you couldn't express arbitrary API styles---but would incur less boilerplate code.

To use an API, a program in our language uses a `use` directive with a URL that points to an interface description:

    use "http://example.com/calendar/api" as cal_server
    let my_calendar = cal_server.get_calendar(me)

The compiler then translates the `get_calendar` call into an API call. For example, it might become an HTTP `GET` request for `/calendar/api/get_calendar`.


### Remote Data: Events and Queries

Now that we have a way to publish and subscribe to APIs, how should clients interact with the remote data that they consume? There are two major ways you might want to use data:

* Streaming. This matches the IFTTT sort of scenario, where you want to trigger an action whenever something happens. In our world, we can model "something happening" as adding a new record to a collection. Remote systems need to call back with every new record that appears.
* Querying. If a client needs to analyze an entire data set or find a needle in a haystack, it's better to run a batch query. For example, training a machine learning model on an entire company's email could be implemented with a query.

Our language should provide different mechanisms for these two interaction modes. We could even consider letting services opt into one and out of the other---if, for example, it's not set up to efficiently support batch queries on a certain data set but is happy to notify clients on events.

#### Streaming

We can build an event-handling abstraction on top of records and collections.

Let `collection v -> expr` denote an event handler. The expression will be invoked whenever a new value appears in the collection, with the new value mapped to `v`. For example:

    mailbox msg -> notify(msg.subject)

where `mailbox` has type `Email*` indicates that we'll notify the user for every new email. In other words, we can treat *collections as streams*.

**TK:** Is it possible to compose these triggers? For example, would you want to write "when I get an email from Alice and a phone call from Alice, *then* notify me about the email"? An algebra for events as in Concurrent ML might help.

#### Querying

**TK:** Querying could work by sending a function to the remote server. Using `map`, `filter`, and `fold` primitives we can build up a reasonably expressive query language. Alternatively, we could build something closer to LINQ (i.e., a specific query sub-language that works like SQL).


## State and Hypotheticals

The language uses *transactions* to let programs explore hypothetical situations. The idea is that programs should be able to use and inspect state without actually affecting the outside world.

Here's a simple example in a calendaring scenario where the user wants to add an appointment. Say we want to confirm with the user if the day gets too busy with that addition. We can use a `try` block to *hypothetically* add the appointment and `abort` to roll back if it seems like a bad idea:

    let day = date_of(appt)
    try {
      add_event(calendar, appt)
      if hecticness(calendar, day) > threshold:
        let decision = confirm(calendar, day)
        if not decision:
          abort
    }

The idea is that any updates to collections---additions or removals---are buffered inside a `try` block until it reaches the end. The `abort` statement restores the original state and jumps to the end. Writing our threshold check this way makes the `hecticness` function simpler: it doesn't need to know that the calendar is hypothetical.

When a transaction commits, the system sends the buffered collection updates out to the services that own them. System interfaces can also mark some functions as "effectful," meaning that they can't be used in transactions.

**TK:** It should also be possible to explore a collection of many different hypotheticals and then weight them using our search/optimization feature. A good example is travel planning: each itinerary could be a hypothetical transaction.


## Choices

This section is on a language construct that attempts to unify three of the above concepts: probability, optimization, and hypotheticals.

The idea is to add a construct, `choose`, that expresses many *possible executions* and how to choose between them. The statements look something like this:

    CHOICE = choose VARIABLE in DOMAIN {
      ...
      weight NAME = SCORE
      ...
    }

The `choose` statement, intuitively, forks execution many times. In each one, `VARIABLE` has a different value selected from the collection `DOMAIN`. (The *number* of forks is up to the search strategy, which we'll work out later: for now, imagine that we exhaustively try every value in `DOMAIN`.)

The result of a `choose` is a special *choice* value that encapsulates all the parallel universes that it explored. That is, all the updates inside the `choice` block are buffered and not observable after it completes. In this example:

    x = 1
    choice = choose y in [1, 2, 3] {
      x = y * 2
    }
    print x

the `choose` body updates the `x` variable, but those updates are local---so the program prints 1, not any of the hypothetical values 2, 4, or 6.

The returned choice value contains pairs consisting of each hypothetical world and together with the `weight`s defined in that world. Ranking strategies can read these weights to find the "best" world from a choice set. Let's change the above example slightly:

    x = 1
    choice = choose y in [1, 2, 3] {
      weight z = y * 2
    }
    world = rank(choice)
    apply world

This produces a list of choices that looks like this:

    [
      (world1, { z: 2 }),
      (world2, { z: 4 }),
      (world3, { z: 6 }),
    ]

(I'm writing the world values as opaque tokens because I don't know exactly how they'll be represented---perhaps continuations.) The `rank` function uses some strategy to choose the best world according to the weights.

The final piece of the puzzle is `apply`, which takes a world value and *commits* it, applying any mutations in the world to the current, physical state.

### An Example

In a previous section, I had a tiny example of using `try` to avoid adding an appointment if the day looked too busy. Here's an example of rewriting it to use `choose` instead with a boolean domain:

    day = date_of(appt)
    choice = choose addit in [true, false] {
      if addit:
        add_event(calendar, appt)
      weight hectic = hecticness(calendar, day)
    }
    apply ask_user(choice)

Here, `ask_user` is a ranking function that should always explicitly ask the user's opinion.


## Loose Ends

Here are a few design aspects that we have not yet fully addressed:

- Describing where to run code. As in HPC languages like X10 and Chapel, we could use a construct that says *execute this query on the machine of person P* or *execute this query on server that has the relevant data*.
- Transitioning to a learning model. Is there language support we can add to help transparently swap out some explicit "seed" logic with a trained model when it is ready?
