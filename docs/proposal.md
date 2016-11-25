doc class: [10pt]article
bibliography: proposal
package: [margin=1in]geometry
title: SHF: Small: Resolving Ambiguity in a Language for Intelligent Assistants
title note: Adrian Sampson, Cornell University
lang: Opal

[TITLE]


# Introduction

Rapid progress in machine learning has sparked a stampede toward new kinds of systems based on natural interaction.
Voice-directed assistants from Apple, Microsoft, Amazon, and Google combine speech recognition, natural language processing, and a vast array of backend capabilities to create the illusion of an intelligent human assistant.
These assistants' emergence coincides with a ballooning interest in chatbots and conversational user interfaces for tasks from customer support to IT system administration and medical diagnostics [@pribots; @botframework; @watsonhealth].

Interest in intelligent assistants, however, has run ahead of the engineering tools that we need to implement them.
The design of intelligent assistant systems presents a unique challenge to traditional software engineering practice: statistics, uncertainty, and ambiguity affect all components in a system.
Machine learning is not an auxiliary feature in these systems; it defines the way the systems work.
There is mounting concern in the software industry that systems relying on machine learning exhibit new categories of subtle, vexing flaws not addressed by current engineering methodologies [@mldebt; @mldebt-nips].

This proposal seeks to address the pitfalls of intelligent assistant design as programming languages problems.
Using new language designs and existing ideas from the PL literature, we will design abstractions for learning-based systems that avoid these pitfalls and reduce the cost to develop them.
The idea is not to design new machine learning models or natural language processing capabilities; instead, we aim to make ML and AI techniques easier to apply in real systems.

This proposal defines an *intelligent assistant* as any system whose primary user interface is based on conversational, natural language.
We focus on intelligent assistants as a particularly important instance of a general problem: the design of abstractions for machine learning.
Intelligent assistants demonstrate the breadth of capabilities and pitfalls in learning-based systems, and they focus our work on use cases that can have immediate impact.

#### Scope.

We propose a set of programming language constructs that simplify the engineering of intelligent assistants.
The goal is to make it easy to write well-behaved software that uses machine learning to present a capable and convincing language-based interface.
The proposed constructs should *not* require deep expertise in machine learning or natural-language processing, but they should let developers expose domain-specific knowledge to the ML algorithms.

In contrast, current engineering strategies tend toward two extremes. First, there are bespoke, monolithic efforts by machine-learning experts to integrate a vast breadth of functionality into a single assistant: Apple's Siri, Microsoft's Cortana, Amazon's Echo, and Google's Assistant.
Second, there are "black-box" chatbot layers that seek to add natural-language functionality to existing systems without deep interaction with the domain: examples include LUIS [@luis], API.AI [@apiai], and Wit [@wit].
Our proposals reside between these extremes: they offer abstraction boundaries that hide ML details from system designers while exposing enough "surface area" that the conversational interface can interact deeply with the domain.

Specifically, we focus on these desired characteristics in intelligent assistants:

1. **Integration.**
   It should be possible to integrate a new conversational user interface with an existing, legacy system.
2. **Resolving ambiguity.**
   The central challenge in language-based interfaces is ambiguity. Intelligent assistants need to accept ambiguous, underspecified commands and take concrete actions.
3. **Iterative refinement.**
   Assistants should let users provide more ambiguous instructions at first and, based on initial evidence, refine their commands. This capability is especially important when it is impractical to ask users for complete information ahead of time. For example, an assistant that makes restaurant reservations might offer a range of cuisine choices to assess the user's current mood without requiring an *a priori* preference.
4. **Adaptation.**
   Assistants should improve their guesses based on feedback. Specifically, it should be possible to use reinforcement learning [@reinforcement] to gradually improve a system's resolution of ambiguity.
5. **Personalization.**
   While adapting to user preferences in general, assistants need to simultaneously learn about each specific user's preferences.
6. **Explanation.**
   When an assistant takes an action, it should be able to explain why. For example, a travel assistant might explain that it chose to book a flight at 10am instead of 4pm because the user had previously preferred daytime arrivals.
7. **Collaboration and privacy.**
   Assistants should be able to interact directly with other assistants: for example, two users could decide on a meeting time that satisfies the constraints for both parties. At the same time, agent--agent interactions should respect user privacy: users should be able to decide whether they want to share scheduling details outside of their company.

These desiderata form the basis for our proposed language features.

#### Overview.

This proposal describes a new programming language, called &lang;, that encapsulates four interlocking language features that address the seven desiderata above.
While the proposal describes a novel language, we envision embedding each feature as an extension or library for any mainstream programming language.
&lang;'s constructs are:

1. **Hypothetical worlds,** which let programmers explore many alternative interpretations of ambiguous input. The design is based on existing work on safe parallel programming. Hypothetical worlds address the need for integration with legacy systems and form the basis for ambiguity resolution. (See Section [#sec-hyp].)
2. **Incremental exploration,** which lets systems efficiently respond to refined user instructions. Each round in a conversation can trigger refined results without requiring expensive recomputation from scratch. This construct extends a rich body of work on languages for incremental computation [@acar]. (See Section [#sec-refine].)
3. A **feature algebra,** where programmers define domain-specific features and combine them using generic combinators. The design uses a generalized algebraic data type (GADT) [@gadt-xi; @gadt-cheney] to avoid the safety pitfalls of current *ad hoc* approaches. Feature combinators address the needs for adaptation, personalization, and explanation. (See Section [#sec-featalg].)
4. **Place abstractions,** which let programmers write assistant strategies that compose independent agents. Together with incremental exploration, this tool addresses the need for privacy-preserving collaboration. (See Section [#sec-collab].)

To demonstrate how these features work together, we plan to develop a prototype of &lang; embedded into JavaScript.
We will motivate the language's design and implementation using four domain-specific chatbots as case studies, which we outline in Section [#sec-apps].

We also see an opportunity to motivate and contextualize learning about AI techniques as they become central to real-world software engineering.
We plan to use the prototype and case studies to design an educational toolkit for creating chatbots oriented toward second-year undergraduate computer science students.
The toolkit will consist of a self-guided curriculum that helps students build custom, NLP-based chatbots and deploy them on popular platforms such as Skype, Slack, and Telegram.
The self-guided project will introduce students to artificial intelligence and machine learning before they take their first class on the topic.
Section [#sec-broader] details our education plans.

# Proposed Work: Hypothetical Worlds { #sec-hyp }

In intelligent assistants,
a common goal is to choose a best action to take among a set of alternatives.
The action could be scheduling a meeting, booking a flight, or sending a message.
The common thread is that the best alternative depends on how the world *would* look if the action were taken: in other words, the fitness of a potential action depends on its effect on the world.

&lang; introduces *hypothetical worlds* as its core construct for coping with ambiguous input.
The idea is to let programs experiment with multiple possible interpretations of ambiguous evidence before deciding which interpretation is most likely correct.
Programmers can write code to try different hypotheses using a natural style, as if the code were interacting with the real world, but only commit to changes based on the outcome of the potential changes.

Throughout this proposal, we will use a calendar scheduling assistant as a running example.
Consider a simple task where the assistant needs to check whether a new event will fit into the user's schedule without making any given day too busy.
Without &lang;, a traditional implementation would need to consider the proposed event's potential impact on free time and travel time between meetings by comparing it to the current state of the calendar.
With hypothetical worlds in &lang;, the program can make a *hypothetical* modification to the calendar.
It can then inspect the new state of the calendar to score it *post facto*.
The code uses &lang;'s `hyp` and `commit` constructs:

    // Schedule a new meeting on the user's calendar if it fits.
    // Otherwise, warn the user.
    function schedule_maybe(calendar, event) {
      // Try adding the event to the calendar.
      out fitness;
      let world = hyp {
        calendar.add(event);
        fitness = quality(calendar);
      };

      // If the new calendar state is good, commit its change.
      if (world[fitness] > threshold) {
        world.commit();
      } else {
        warn();
      }
    }

The code "forks" a hypothetical world, where it tentatively adds an event to the calendar and then assesses the quality of this potential schedule.
The `calendar.add(event)` statement has no effect on the outside world---effects are *buffered* in the &lang; runtime.
Then, the code outside the hypothetical world checks whether the world resulted in a good schedule.
If so, the `world.commit()` operation releases the buffered effects and updates the user's calendar.

## Isolated Effects { #sec-effects }

&lang;'s `hyp` construct isolates the operations it contains so they do not affect code outside the hypothetical world.
A world's parent context can eventually call `commit` to publish its updates.
The idea is similar to parallel programming with threads: launching a new hypothetical world is analogous to creating a new thread with POSIX's `fork`, and committing an &lang; world is analogous to calling `join` to wait for a thread to exit.
As in some models for safe multithreading [@conrev] or distributed databases [@tardis], a thread's updates are hidden from other threads until it joins with its parent.

When code enters a `hyp` block, it sets a flag indicating that the world is currently hypothetical and data structure updates should be buffered.
Code that executes in a hypothetical state is allowed to access and update data structures that support hypothetical operation.
Specifically, &lang;'s standard library offers persistent data structures [@persistent] that support efficient "fork" and "merge" operations.
The `calendar` value in the above example, for instance, is a persistent set data structure.
Calling `calendar.add(event)` inside a `hyp` block creates a new, isolated copy of the `calendar` set that is only visible within the `hyp` block.
Subsequent code *inside* the `hyp` block will see the new event, but code *outside* the block will see the original data.
When the parent world invokes `world.commit()`, the hypothetical update is merged back into the main copy of the `calendar` set and the new event becomes visible.

In &lang;, parent worlds often need to communicate with their child hypothetical worlds.
&lang; provides `out` variables that serve as communication channels.
A parent world creates an `out` variable and any descendant hypothetical world can assign into it.
Updates to `out` variables are isolated like any other, but the parent world can choose to access them on demand using the syntax `world[name]`.
The example above declares a variable `out fitness` to selectively expose a score to the parent world.
The top-level code uses this value to choose whether or not to commit the world's changes to `calendar`.
These `out` variables provide a way for parent worlds to inspect the state inside child worlds before committing them.

## Searching Among Alternatives

The `hyp` primitive by itself only considers one possible action.
&lang;'s standard library builds on `hyp` to let programs search large spaces of possible interpretations of ambiguity.
A `search` construct forks many hypothetical worlds, each of which assigns a different value to a variable.
For example, a meeting scheduling assistant can `search` to consider many candidate times:

    // Schedule a new event at the best time of day
    // in the current day.
    function schedule_any(calendar, title, duration) {
      // Try scheduling the meeting at many different times.
      out fitness;
      let worlds = search start in timerange(today.begin, today.end) {
        let event = new Event(start, duration, title);
        calendar.add(event);
        fitness = quality(calendar);
      }

      // Choose the highest-scoring hypothetical world
      // and commit it.
      let best_world = maximize(worlds, fitness);
      best_world.commit();
    }

The syntax `search name in range` works like a *foreach* loop but forks a new hypothetical world for each value in `range`.
In each world, the variable `name` takes on a different value from `range`.
In &lang; programs, each hypothetical world represents a different possible resolution of ambiguity.
Here, the ambiguity lies in the desired start time of the new event.
The user has provided *partial* information about the desired outcome---the title and duration---but the assistant needs to infer the correct time of day.

The `search` statement produces a lazy stream of world values.
This lets programmers search over large or even infinite ranges---it is the responsibility of a subsequent search strategy to ensure termination.
This example uses a `maximize` search strategy from &lang;'s standard library. The `maximize` function may be implemented using exhaustive search or using more sophisticated strategies such as sampling to make exploration more efficient.

## Composition and Recursive Search

Hypothetical worlds also provide an abstraction mechanism to let programmers compose multiple searches.
In &lang;, `hyp` blocks can be *nested:* hypothetical worlds can fork and commit their own sub-worlds.
For example, a `reschedule` function can call the above `schedule_any` function to find a new slot for a canceled meeting:

    // Find a better time for an existing event, if possible.
    function reshedule(calendar, event) {
      out fitness;
      let world = hyp {
        calendar.delete(event);
        schedule_any(calendar, event.title, event.duration);
        fitness = quality(calendar);
      }

      // Use the changes if they result in a better calendar
      // than the current one.
      if (world[fitness] > quality(calendar)) {
        world.commit();
      }
    }

The `hyp` in this new `reschedule` program composes with the hypothetical worlds created inside the call to `schedule_any`.
When the `schedule_any` call commits its changes, they are still not exposed to the outside world---they only affect the *parent* hypothetical world in `reschedule`.
The `schedule_any` function need not expose the fact that it uses hypothetical worlds internally for its search---the use of hypothetical worlds remains an implementation detail.

Composable hypothetical worlds also enable recursive search.
For example, a more sophisticated rescheduling algorithm might trigger a cascade of further rescheduling to other events.
It can do so by recursively rescheduling conflicting events:

    function reschedule_rec(calendar, event) {
      out fitness;
      let worlds = search start in timerange(...) {
        // Try moving the event to a new time.
        calendar.move(event, start);

        // If there's a conflict, try rescheduling again.
        let other_event = get_conflict(calendar, event);
        if (other_event) {
          reschedule(calendar, other_event);
        }

        fitness = quality(calendar);
      }

      let best_world = maximize(worlds, fitness);
      best_world.commit();
    }

The recursive call to `reschedule` in this example creates a deep search space: the assistant can consider rearrangements that may involve moving several appointments to obtain the best schedule.

## Integrating with Legacy Systems { #sec-shim }

&lang; is a system integration language: it needs to interface safely with existing systems that take concrete actions on behalf of assistants.
For example, we do not expect developers to rewrite an entire calendaring system using &lang;.
Instead, &lang; provides tools to interface with external services such as calendar servers.

External services interoperate with &lang; code by exposing an *&lang; shim*.
A shim consists of data structure definitions that extend &lang;'s built-in persistent data structures.
For each possible operation on a persistent data structure, the shim describes how to publish that operation to the external service.

For example, a calendar server can expose each calendar as a set of events.
&lang; provides a persistent set data structure in its standard library, so the calendar server's shim can extend that base type.
Sets support two operations, `add` and `remove`.
To implement these two operations,
the calendar server's shim provides code to call API endpoints to add and remove events.

To use external services, &lang; programs update data structures in the top-level world.
In other words, calling `add()` or `remove()` on a set inside a hypothetical world has no externally visible side effects.
But when that hypothetical world is eventually *committed*, the &lang; runtime "unspools" the operations and invokes the corresponding shim code to send messages to each external service.

This design means that hypothetical worlds also work as a form of concurrency control: they provide atomic interactions with external services. As with a transaction, a hypothetical world is isolated from any other code---including external systems---until the program commits it. The data it observes cannot change during the course of the world’s execution. For example, a scheduling program in &lang; can observe that a meeting slot is free and schedule a new meeting in that slot without worrying that someone else will fill that slot in between the check and the update.


# Proposed Work: Iterative Refinement { #sec-refine }

&lang;'s hypothetical worlds let programs resolve ambiguity in individual commands.
In real intelligent assistants, however, interactions can use a multi-turn, conversational structure where the user iteratively refines their intent to guide the assistant to a desired outcome.
&lang; needs to efficiently support interactions with this general structure:

* *User:* Please take an action with parameters $P$.
* *Assistant:* OK, I found a few alternatives: actions $A_1$ and $A_2$ both satisfy $P$.
* *User:* None of those work. How about with parameters $P'$, which slightly refine $P$?
* *Assistant:* I found a new potential action $A_3$ that satisfies $P'$.
* *User:* OK! Take action $A_3$.

In our scheduling example, the user might request a meeting on a certain day.
If the user has unstated preference for meetings earlier in the day, the user might reject all of the assistant's initial proposals and instead ask, "Can we schedule this in the morning?"
A naive implementation would re-run the query from scratch with the additional scheduling constraint.
In &lang;, we design ambiguity resolution to be *incremental* so that the system can efficiently respond to slightly modified queries.

## Patch Processing

The core construct in &lang;'s support for iterative refinement is a *patch* construct.
A patch resembles a set of changes in a version control system like Git or Subversion: it encapsulates the set of uncommitted changes that a hypothetical world has made relative to its parent world.
&lang; programs can inspect patches by iterating over the *operations* it contains.
For example, this hypothetical world uses `diff`, a &lang; construct that retrieves a patch for the current world:

    hyp {
      calendar.add(event1);
      calendar.delete(event2);
      for operation in diff(calendar) {
        if (operation.kind == ADD) {
          // Process an addition.
        } else if (operation.kind == DELETE) {
          // Process a deletion.
        }
      }
    }

The `for` loop iterates over one `add` and one `delete` operation in the patch, which reflect the operations that the world has performed on `calendar` so far.
Patches and the `diff` operation are crucial to specifying computations that change incrementally when the underlying data changes.

## Incremental Score Adjustment

&lang; programs use patches to efficiently compute adjustable preference scores for hypothetical worlds.
A *score* is any numerical summary of a potential action's likelihood: for example, the system's estimate of a user's preference for a given action.
For example, the `quality` function in our scheduling examples is a scoring function: it estimates the user's happiness with the current state of the calendar.
In &lang;, scores can be computed based on the changes relative to a base state.
This simple scoring function computes a state's quality based on the number of conflicts it contains:

    function quality(calendar) {
      return patch_sum(for operation in diff(calendar) {
        // Count the number of conflicts with the event added or deleted.
        let num_conflicts = len(find_conflicts(operation.event, calendar));

        // Increase or decrease the score by that amount.
        if (operation.kind == ADD) {
          return -num_conflicts;
        } else if (operation.kind == DELETE) {
          return num_conflicts;
        }
      });
    }

The `patch_sum` operation lets programs compute a score delta for every operation in a patch and sums the results.
This design makes it possible to re-run scoring code efficiently for patches that differ only slightly.
Running `patch_sum` a second time only requires computations on the set difference between the operations in the original patch and the operations in the new patch.

For example, if a program invokes the `quality` function once when the patch `diff(calendar)` is consists of a set of operations $p = \{ o_1, o_2, \dots, o_i \}$, the `patch_sum` library call memoizes its result.
When the program runs `quality` again after changing one more calendar event, `diff(calendar)` produces a new patch $p' = p \cup \{o_{i + 1}\}$ consisting of one more operation.
The result of the second `patch_sum` call is equal to the memoized result adjusted by the delta for the new operation $o_{i + 1}$.
The program does not need to recompute the score components that were included in the old patch.

## Query Adjustment and Re-Ranking

Patches in &lang; can help adjust computations when the state of the world changes, but assistants also need to efficiently adjust when users' *preferences* change.
For example, a user might request to schedule a meeting but, after considering a few candidate times in the afternoon, remember that the meeting needs to be scheduled in the morning.
The &lang; program then needs to *re-rank* the set of alternative schedules according to this new criterion.

To support re-ranking efficiently, &lang; uses techniques from *incremental computation* to avoid wasting work.
In &lang;, score values keep track of a tree describing their provenance, as in self-adjusting computation models [@acar].
The &lang; runtime system can check whether and how a given score value will need to change in response to changes in its component scores.

For example, our scheduling assistant example can compute a score that combines two factors: a general component that captures the overall preference for the current calendar state, and a specific component that describes whether a new event fits the user's specified time range:

    let fitness = quality(calendar) +
      in_range(new_event, time_range);

The addition to compute the `fitness` score produces a concrete floating-point value along with a tree that records the value's provenance.
Specifically, the `fitness` value records that it depends both on `quality`, which in turn depends on the current calendar state, as well as on `in_range`, which depends on the candidate event and the specified time range.
If the user specifies a new `time_range`, the &lang; standard library only needs to recompute that part of the score.

&lang;'s library of search strategies---such as the `maximize` strategy we used above---are designed to be aware of incremental scores.
When a search strategy runs on a given set of hypothetical worlds and associated scores, it records the score provenance for each world it considers.
When it runs again after some criteria change, they use the memoized values to cheaply adjust scores without recomputing them from scratch.

Search strategies that deal with a large or infinite number of hypothetical worlds, such as sampling strategies, can further reduce wasted work by discarding small changes that are unlikely to change overall results.
For example, when a given hypothetical world has a very low score---substantially lower than the current best world---and it consists of a linear combination of components, small changes to those components are unlikely to move the world to the top of the list.
So an *approximate* search strategy can avoid reconsidering this world even without fully recomputing its score.


# Proposed Work: Feature Algebra { #sec-featalg }

Intelligent assistants and other consumers of machine learning need to manage sets of domain-specific *features:* numeric values that describe aspects of data in the domain model.
Programs extract collections of feature values from their internal data representation and provide *feature vectors* to machine learning algorithms for classification.
While deriving and managing features can seem like a peripheral concern---all the "real work" happens in the machine learning algorithm itself---applications spend significant complexity on this part of their operation.

## Type-Safe Feature IDs

A traditional approach to managing features associates an ID with every feature value extracted from the data.
For example, a system that extracts word-level features from text might use produce a string label for each word frequency value:

    // Featurize a document (i.e., a string) by counting the frequency of
    // each word in the document. Return a list of ID/value pairs.
    function bag_of_words(doc) {
      let out = [];
      for word in tokenize(doc) {
        // Count the number of times `word` appears in `doc`.
        let freq = count(word, doc);

        // Tag each frequency value with an ID.
        out.push("freq_" + word, freq);
      }
      return out;
    }

The string `"freq_foo"` identifies the frequency feature for the word *foo*.
Applications use feature IDs to distinguish the entries in a feature vector: for example, a document classifier might compute cosine similarity between two documents by comparing the frequency features they have in common.
Many applications use free-form strings as IDs so they can represent any kind of data that distinguishes one feature from another.

Using strings as feature IDs is convenient, but it is both inefficient and error-prone.
To construct each new feature, a system needs to use string concatenation and conversion operations to build up IDs.
Subtle bugs can occur when the strings involved are mistyped even slightly: for example, searching for a feature with ID `"freq-foo"` instead of `"freq_foo"` will silently fail under this model.

&lang; introduces a *feature type* that makes ID management more efficient and safer.
The feature type is an instance of a generalized algebraic data types (GADTs) [@gadt-xi; @gadt-cheney], a type system feature typically associated with functional programming.
The idea is that each kind of feature should define a new opaque tag together with the parameters that uniquely identify it.
For example, the frequency feature above has one parameter: the string containing the word whose frequency is being measured.
Given a type `Document` describing the underlying data, we can define the `Freq` feature in &lang; this way:

    feature Freq : String -> Feature<Document>;

This declaration says that the type constructor `Freq`, when provided with a string, produces a `Feature` that describes `Document` values.
The `->` syntax in the `Freq` definition is meant to resemble a function type:
&lang; code call call `Freq("foo")` to construct a value of type `Feature<Document>`. The value consists of an opaque tag identifying `Freq` and a reference to the string `"foo"`.
No string manipulation is necessary and no typos are possible---the type system can catch any mistakes at compile time.

## Feature Combinators

&lang;'s GADT-based type structure for features
generalizes to simpler and more complex forms of features.
For example, feature IDs that take no parameters are easy to define:

    feature Busy : Feature<Calendar>;

The single `Busy` feature identifies a property of calendars; the absence of a `->` in the declaration indicates that no parameters are necessary.
&lang; programs can also define feature *combinators*, which build more complex features out of smaller components.
For example, a thresholding combinator might convert continuous features to 0/1 values:

    // A feature ID for tagging thresholded features.
    feature<A> Threshold : Feature<A>, float -> Feature<A>;

    // Given a current feature value and its ID, produce a thresholded
    // feature and assoicated ID.
    function threshold(feat, value, thresh) {
      let id = Threshold(feat, thresh);
      if (value > thresh) {
        return (id, 1.0);
      } else {
        return (id, 0.0);
      }
    }

The polymorphic type variable `A` lets thresholding work generically for any underlying data type.
For example, `Threshold(Freq("foo"), 0.5)` constructs a feature ID of type `Feature<Document>`.
Similarly, a `Sum` combinator can define a simple linear combination of smaller features:

    feature<A> Sum : Feature<A>[] -> Feature<A>;

The algebraic underpinning of &lang;'s feature IDs lets the standard library provide generic, reusable strategies for feature management while preserving type safety.

## Personalization with a Domain Adaptation Combinator

A particularly important application of &lang;'s feature combinators enables generic personalization for universal features.
The idea is based on the technique by @easyadapt for adding *domain adaptation* to a generic learning algorithm.
Intuitively, the technique works by duplicating a set of base features to create $n+1$ versions where $n$ is the number of users.
There is a single global version of each feature and $n$ user-specific versions.
The user-specific feature value is identical to the original feature value;
each user-specific feature takes on its original value when it matches the user in question and zero otherwise.
The design makes it possible for an ML algorithm to learn separate weights for each user while still retaining global information that applies to all users.

Without any support from the language, duplicating and manipulating features according to this recipe can be tedious and error-prone.
In &lang;, feature combinators make the domain adaptation technique easy to express.
Given a type `A` for the original data and a type `B` for users, the domain adaptation feature ID can be written:

    // A feature ID for domain adaptation. Given any generic feature for
    // values of type A and a concrete value of type B, produce a feature
    // for A/B pairs.
    feature<A, B> Adapted : Feature<A>, B -> Feature<A, B>

Then, a function to produce these features can use a standard optional type to encode a case for specific users, with `Some(user)`, and for all users, with `None`:

    // Adapt a feature for a specific user. Returns two feature ID/value
    // pairs: a general and a specific feature variant.
    function adapt(value, feat, user) {
      let general = Adapted(feat, None);
      let specific = Adapted(feat, Some(user));
      return [
        (general, value),
        (specific, value)
      ];
    }

This simple implementation of domain adaptation for personalization emphasizes the flexibility of &lang;'s feature combinators:
reusable libraries can expose generic feature management strategies.
Domain adaptation is a subtle machine learning technique, and &lang; programs can use its implementation without concocting it from scratch.
The type system protects client applications from bookkeeping errors that would arise with traditional approaches where features are indexed by plain strings or integers.

## Explainable Results

&lang;'s algebra for feature IDs can let programs produce explanations for the decisions they take.
For example, a scheduling assistant might use a broad range of factors to decide which times to propose for a new meeting.
The assistant should be able to explain what the primary factors were in choosing a particular time:
it would be helpful to know, for example, whether an afternoon time was proposed because the morning was completely booked or because the assistant has inferred that the user generally prefers afternoon meetings.

In &lang;, programs can associate explanations with each feature ID.
A basic feature reflecting conflicts on the user's calendar, for example, can include an explanation that states, "this action avoids creating conflicts on your calendar."
Feature combinators can also include explanations generated using their underlying features.
For example, the `Sum` combinator listed above might generate an explanation that recursively includes the explanation for its highest-ranked sub-features.

To define an explanation for a feature, &lang; programs use a `match` expression to branch on each kind of feature:

    match feat with {
      Busy -> "this action would make your day busy",
      InRange(r) -> "the new event is in the specified time range " + r,
    }

This example uses strings as explanations, which is appropriate for text-based interfaces such as chatbots.
Other applications might display explanations visually, for example.


# Proposed Work: Collaborative Assistants { #sec-collab }

&lang;'s final goal is to enable systems that can run collaboratively among multiple users while respecting their privacy.
Many tasks for intelligent assistants intrinsically involve multiple people: sending messages, planning events, or disseminating share documents.
A naive approach would centralize all data for all the participants in a given task and process it all locally.
But a centralized approach to collaboration has two important drawbacks:
it can be inefficient, especially when each user has a large amount of data to share,
and it requires users to trust the centralized service not to expose their personal data.

To address both problems, &lang; introduces a *place abstraction* that lets programs address data that resides with many different users.
Private data controlled by each user forms a *place*, which may be a physical machine or a logical separation on a server.
By default, &lang; programs cannot access data in each place.
Instead, programmers can direct each hypothetical world to run in a different place. These worlds gain access to the associated data.
Users can express privacy policies by controlling the kinds of data that are allowed to *leave* each place and flow to the parent world running on a centralized service.
The privacy mechanism is based on existing work on language-level information flow tracking [@jif].

## Declaring and Accessing Private Data

&lang; relies on integration shims (Section [#sec-shim]) to annotate private data.
Shims contain *place declarations*, which can define singleton places or lists of places associated with other values.
Each place contains a list of declarations for data that resides in the place:

    // Singleton places.
    place home {
      let calendar;
    }
    place work {
      let calendar;
      let documents;
    }

    // An unbounded number of places, one associated with each User.
    place home[User] {
      let calendar;
    }

By default, &lang; code cannot access the data inside each place.
Instead, the program must designate a hypothetical world to run *at* a given place.
&lang; extends the `hyp` construct with syntax `@ place` to indicate where the hypothetical world should run:

    // Add an event to a user's private calendar.
    function schedule_private(attendee, event) {
      let world = hyp @ home[attendee] {
        home[attendee].calendar.add(event);
      }
      world.commit()
    }

The access to `home[attendee].calendar` would be illegal outside the `hyp` block, but it succeeds inside code that runs at the appropriate place.
Because hypothetical worlds isolate their effects from the rest of the system, they ensure that accesses remain private: the code outside the `hyp` block only has access to an opaque `world` value that does not reveal any internal state.
The code in the parent world can still choose to call `commit()` on the world value, which triggers effects on the user's calendar, but the encapsulated data does not "leak."

## Privacy Endorsement

Privacy-preserving systems need mechanisms to divulge the results of computations on private data in controlled ways.
For example, the `schedule_private` function above may need to communicate the user's preference score for the new event to the central service to let it make a decision.
&lang;'s `out` variables (Section [#sec-effects]) provide a natural avenue for controlled disclosure.
For example, a coordinated scheduling assistant might collect scores from all of the users involved in an event:

    // Add an event to *all* attendees' calendars, if it
    // seems acceptable to everyone.
    function schedule_private_multi(attendees, event) {
      // Try adding the event to everyone's calendars. Produce
      // one hypothetical world per user.
      out fitness;
      let worlds = [];
      for user in attendees {
        worlds.push(hyp @ home[attendee] {
          let cal = home[attendee].calendar;
          cal.add(event);
          fitness = quality(cal);
        });
      }

      // If all scores are high enough, commit the addition.
      // Otherwise, warn the requester.
      if all(fitness[w] > threshold for w in worlds) {
        for world in worlds {
          world.commit();
        }
      } else {
        warn();
      }
    }

This example relies on the ability to divulge some information about each user's calendar to the central service.
In &lang;, users or other place owners choose whether to approve each `out` variable.
The first time an application runs on a user's private data, it displays all the data it needs to communicate over `out` variables to demonstrate its contents.
The user can approve individual executions or choose to trust all future executions that use the same set of `out` variables.

## Atomic Multi-User Coordination

Assistant tasks that involve multiple users need to coordinate those users' data *atomically:*
all users should appear to agree on and commit to a given action at the same time.

As Section [#sec-shim] describes, hypothetical worlds in &lang; can help provide atomicity when interacting with the outside world.
Specifically, top-level `commit()` operations send buffered updates to external services in an atomic update.
&lang; provides a similar mechanism when coordinating between multiple places.
When the system commits a hypothetical world that has updated data in multiple places, it executes a distributed commit protocol, such as two-phase commit, among all involved places.
Each place agrees whether to apply the world's updates or to abort; if the commit aborts, the application can try running the hypothetical world again from the beginning.

In the `schedule_private_mutli` example above, the programmer can wrap the entire function in an outer `hyp` block to require that all users see simultaneous changes to their calendars.


# Prototype and Case Studies { #sec-apps }

To assess &lang;'s breadth and applicability, we plan to develop a prototype, open-source implementation embedded in JavaScript.
As a JavaScript library, the &lang; prototype will be accessible to a broad range of programmers and will integrate with existing APIs for chat services.
JavaScript, together with syntax extension mechanisms such as Sweet [@sweet], provides all the tools necessary to implement &lang;'s hypothetical worlds, incremental computation, and collaboration features.
For the type safety features in &lang;'s feature algebra (Section [#sec-featalg]), we are exploring typed overlays to JavaScript including TypeScript [@typescript] and Flow [@flow].

During the project, we will develop four medium-scale intelligent assistants as case studies using the &lang; prototype to exercise its features.
While all of the case studies will exercise all of &lang;'s features, each
emphasizes a different subset of the language's capabilities.

#### Meeting scheduling.

Calendaring tasks form the running example in this proposal.
Our prototype will accept natural-language commands such as *cancel my meeting with Alice tomorrow* or *add a project meeting to my calendar on Thursday*.
We plan to use an off-the-shelf NLP service [@wit; @luis; @apiai] to extract the partial user intent from each utterance.
The unspecified parameters will inform &lang;'s ambiguity resolution.

#### Restaurant recommendation.

A second case study will help users choose a nearby restaurant from a database.
The core concern in this domain is constraints that can *only* be discovered through iterative refinement and personalization.
It would be too onerous to ask the user up front even for general preferences---for vegetarian food, for example, or for a particular cuisine on a given day.
Instead, the assistant will incrementally refine results based on positive or negative user feedback when the user selects or dismisses a proposed option.
These signals will also serve to train and personalize the assistant's behavior via reinforcement learning.

#### Preparation assistant.

An additional case study will automatically surface documents for a user that are likely to be relevant to an upcoming meeting.
This intelligent assistant is distinct in its lack of an explicit interface: the tool will proactively identify relevant documents without explicit prompting from the user.
The design will rely heavily on &lang;'s feature algebra to manage textual and topic features extracted from document bodies.
The case study will also showcase &lang;'s integration with external services to surface documents from a variety of different storage providers.

#### Travel booking.

A final assistant prototype will search for travel itineraries, including flights and hotels.
This case study focuses on deep, complex search spaces: for example, booking travel one day later might lead to more expensive flights but a less expensive hotel booking.
The system should use personalization to learn the user's preferences among common flight schedules and hotel chains.


# Broader Impacts: Introduction to Learning-Based Systems { #sec-broader }

As machine learning becomes an integral part of everyday systems, computer science students will need to learn how to integrate it into software projects.
We see an opportunity to use &lang; to introduce students to designing and programming ML-based systems.
In the second and third years of this project, we plan to use our open-source &lang; implementation to develop a self-guided curriculum around building single-purpose chatbots.

#### Curriculum.

The self-guided curriculum will introduce students to core concepts in applying machine learning to real-world problems through programming with &lang;.
It will proceed in two parts: first, students will work step-by-step through the implementation of a simple calendar scheduling chatbot.
In the second phase, students will choose a new domain in the context of a free-form project.

* *Phase 1:* Step-by-step introduction.
  * Invoke a pre-trained NLP model to extract intents and entities from written language.
  * Use &lang;'s hypothetical worlds (Section [#sec-hyp]) to search the possible interpretations of each utterance.
  * Define a set features using &lang;'s feature algebra (Section [#sec-featalg]) to capture how effectively a given calendar action fits the user's intent. This step will use a pre-written shim library for interacting with popular calendaring services.
  * Use &lang;'s search strategies to identify the best action and commit it to the calendar server. At this point, the student will have a working, end-to-end system that uses natural language to take concrete actions.
* *Phase 2:* Free-form project.
  * Choose a new domain and an associated external service. Write and test an &lang; integration shim for the external system.
  * Train an NLP model to recognize intents and entities for the new domain. For this step, the curriculum will guide students through using an external NLP service such as LUIS [@luis] or Wit [@wit].
  * Use features and hypothetical worlds to connect the natural language model to the external service.
  * Students can choose to attempt additional advanced topics if they make sense for their chosen domain: iterative refinement and agent--agent communication.
  * Share the project: we plan to create a bulletin board community where students can share their work and discuss next steps.

#### Dissemination and evaluation.

We plan to publicize the self-guided course via GitHub and social media.
Using an open-source approach, we will solicit contributions from the community to improve the prototype and documentation.

At the same time, we plan to run an extracurricular workshop at Cornell for second-year undergraduates to experiment with the curriculum.
Over 3--5 two-hour evening sessions, students will work through the curriculum with guidance from the research team.
We plan to use evaluation surveys from these workshops to assess its effectiveness and improve the published material.

In the long term, we may consider exporting a structured, in-person workshop based on these Cornell workshops to other universities.
Our primary focus, however, is on the self-guided, online materials that will form the basis for both forms of instruction.


# Execution Plan

The proposed work spans three years.
The project will be driven by a graduate student beginning in the first or second year of their PhD.
In the third year, we plan to add a second graduate student as the design and applications scale up.
We anticipate this timeline:

* *Year 1:* Core abstractions; prototyping.
  * Design the two central language constructs in &lang;: hypothetical worlds (Section [#sec-hyp]) and features (Section [#sec-featalg]).
  * Formalize the operational semantics of hypothetical worlds.
  * Prototype both features in a JavaScript library.
  * Develop an initial case study: an intelligent assistant focused on calendaring tasks (Section [#sec-apps]).
  * Publish a paper on the basic language design, formalism, and implementation in a programming languages venue (e.g., PLDI, OOPSLA, POPL, or ICFP).
* *Year 2:* Conversational refinement; open-source release.
  * Design the incremental language semantics necessary for iterative refinement in dialog (Section [#sec-refine]).
  * Expand the JavaScript library prototype and release it as an open-source project on GitHub.
  * Develop a second case study using &lang;: a travel booking assistant (Section [#sec-apps]).
  * Begin designing a self-guided curriculum on intelligent assistant design (Section [#sec-broader]).
  * Publish a paper on &lang;'s advantages as a grounding tool for natural language understanding in a machine learning or NLP venue (e.g., EMNLP, ACL, ICML, or NIPS).
* *Year 3:* Agent--agent collaboration; education.
  * Design and implement place abstractions for inter-agent communication (Section [#sec-collab]).
  * Develop two new case studies: assistants for restaurant recommendation and contextual document discovery (Section [#sec-apps]).
  * Release and publicize the self-guided intelligent assistant design curriculum (Section [#sec-broader]). Run elective workshops at Cornell to assess the toolkit's effectiveness at introducing students to concepts in system design with machine learning.
  * Publish a follow-on paper about &lang;'s inter-agent collaboration features in a programming languages venue.

PI Sampson brings expertise in programming language design and implementation.
His foundational work on approximate computing and probabilistic language semantics [@enerj; @decaf; @passert] established abstractions that let programmers cope safely with uncertainty.
This work forms the basis for &lang;'s language-level abstractions for ambiguity.

#### Unfunded collaborators at Microsoft.

Throughout the project, the group will collaborate with two external experts in natural language understanding and systems at Microsoft.
Dr. Sarah Bird, a technical advisor in Microsoft's Data Group, brings a background in designing real-world systems based on machine learning.
Her work on multiworld testing [@mwt] provides on-line, interactive learning as a service and is deployed in user-facing Microsoft services.
Dr. Christopher Quirk, a principal researcher at Microsoft Research, brings deep expertise in natural language processing and its application to programming [@ifttt].
Both Dr. Bird and Dr. Quirk will advise the team on interactions between the core &lang; programming model and the machine learning systems it abstracts.


# Results from Prior NSF Support

I am beginning my first academic appointment in autumn 2016. I have had no previous NSF funding.


&pagebreak;
[BIB]
