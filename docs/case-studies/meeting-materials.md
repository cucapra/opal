Meeting Materials Discovery
===========================

The goal in this case study is to automatically surface information relevant to an upcoming meeting.


Data Collection
---------------

Part of the case study will involve conduits for collecting the various kinds of information we might want to surface. The raw information might include documents, emails, other meetings, and contacts.

I also imagine that we might want to use NLP magic to pre-process the raw documents and extract more discrete units of knowledge.


Interface
---------

The overall structure of the problem has the feel of traditional search: the event is a query; we need to compute the relevant of every potential document to the query; and we need to choose a small subset of the most relevant documents to avoid overwhelming them with too much information.

### Reinforcement Learning

To train the relevance function, we can ask the user two kinds of reinforcement questions:

* Was this document *actually* useful for the meeting? (We might also collect this passively by detecting whether it was opened while the user was on the corresponding call or in the appropriate conference room.)
* Were there any other documents we *didn't* surface that we should have? (Again, there's a passive option here: detect which other documents were opened.)

Here's an **unresolved question**: When a user says a document $D$ is relevant to an event $E$, how do we decide that's indicative of the user's general preferences or specific to that event? That is, the system might either learn:

> This user, or users in general, really want to see documents that mention the attendees of the event!

Or it might conclude:

> For events with person $P$ in attendance, users really want to see documents that mention $P$!

### Results Display

* How do we decide whether we cut off the "top $k$" search results at the right point?
* This is a good opportunity to explain the *reasons* for choosing documents. For example, "this document mentions the topic $T$, which person $P$ recently emailed about."


OPAL Structure
--------------

A *feature* here should be a factor in the overall relevance score. That is, every feature is a function of the event--document pair. Then, our `LinearCombiantion` feature combinator should gather all of them together into the bottom-line relevance.

    let referencesAttendees = new Feature(...);
    let similarTopic = new Feature(...);
    ...
    let relevance = new LinearCombination([
        referencesAttendees,
        similarTopic,
    ]);

We need a top-$k$ primitive to search for the set of documents that maximize `relevance`.
