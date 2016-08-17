Meeting Materials Discovery
===========================

The goal in this case study is to automatically surface information relevant to an upcoming meeting.

Data Collection
---------------

Part of the case study will involve conduits for collecting the various kinds of information we might want to surface. The raw information might include documents, emails, other meetings, and contacts.

I also imagine that we might want to use NLP magic to pre-process the raw documents and extract more discrete units of knowledge.


Interface
---------


OPAL Structure
--------------

The overall structure of the problem has the feel of traditional search: the event is a query; we need to compute the relevant of every potential document to the query; and we need to choose a small subset of the most relevant documents to avoid overwhelming them with too much information.

A *feature* here should be a factor in the overall relevance score. That is, every feature is a function of the event--document pair. Then, our `LinearCombiantion` feature combinator should gather all of them together into the bottom-line relevance.

    let referencesAttendees = new Feature(...);
    let similarTopic = new Feature(...);
    ...
    let relevance = new LinearCombination([
        referencesAttendees,
        similarTopic,
    ]);
