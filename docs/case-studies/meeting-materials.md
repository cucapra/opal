Meeting Prep Assistant
======================

The goal in this case study is to automatically surface information relevant to an upcoming meeting.


Data Collection
---------------

Part of the case study will involve conduits for collecting the various kinds of information we might want to surface. The raw information might include documents, emails, other meetings, and contacts.
Specifically, let's say the prototype will deal with these categories of documents:

* Email messages, indexed by their `Message-ID` header. Messages are considered visible to the sender and all recipients.
* Files on GitHub, indexed by their URL (like [this](https://github.com/sampsyo/opal/blob/master/docs/case-studies/meeting-materials.md)). These are visible to everyone with read access to the repository.
* Text and word processing files in OneDrive (i.e., Word) or Google Drive (i.e., Docs), also indexed by their URL. I'm not 100% sure how you'd determine access permissions for those.

Each document will consist of:

* A unique ID that also serves as a way for everyone to access the document.
* A title.
* Content: a blob of text.
* The set of people who have access.
* Perhaps a trace of access times: when did each person look at/work on the document?

I also imagine that we might want to use NLP magic to pre-process the raw documents and extract more discrete units of knowledge.


Features
--------

The core of this application are features that signal the relevance of a document to a particular meeting.
Here are some specific features I can imagine using:

* Textual similarity between the title/text of the document and the name of the meeting.
* "Hotness": documents that people worked on more recently are more likely to be relevant.
* Overlap between the set of people involved in the meeting and the set of people with access to the document (or the set of people who authored the document).
* Whether the document was accessed during previous iterations of the same meeting (or other meetings with similar titles).
* The text of a document refers to the people involved in the meeting.


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

A *feature* here should be a factor in the overall relevance score. That is, every feature is a function of the event--document pair. Specifically, every individual feature will have the same type, like this:

    // A type for relevance features.
    type RelFeat = Feature<[Event, Document]>;

    // Our hodgepodge of individual relevance features.
    let referencesAttendees: RelFeat = new Feature([e, d] => {
      // ...
    });
    let similarTopic: RelFeat = new Feature([e, d] => {
      // ...
    });

The "body" of each feature function takes an `[Event, Document]` pair and produces a score.

Then, our `LinearCombination` feature combinator should gather all of them together into the bottom-line relevance.
The constructor for `LinearCombination` takes a list of features with identical types and produces a new feature with the same type: here, a `RelFeat`.

    let relevance: RelFeat = new LinearCombination([
        referencesAttendees,
        similarTopic,
    ]);

The idea is that you can now apply the overall `relevance` feature to a meeting/document pair to get a total score.

We need a top-$k$ primitive to search for the set of documents that maximize `relevance`.
