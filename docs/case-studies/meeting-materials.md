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

From the user's perspective, every `RelFeat` might feel like a 2D matrix: given a document and a meeting, you can look up the relevance score for that feature. This applies equally well to the individual features as to our linear combination.
To emphasize this, we can make features callable, so if you're interested in the score for a particular document in a particular meeting, you can look it up directly:

    print(relevance([someEvent, myDoc]));

Internally, `LinearCombination` will probably want to maintain a *3D* mapping: it can reify the feature value for every individual feature on every event--document pair.
In other words, `relevance` should support a way to look up a specific feature for a specific input, like this:

    let fvec = relevance.components([someEvent, myDoc]);
    print(fvec(similarTopic));

The `fvec` value is like a feature vector; it contains the score for each individual feature when applied to each input pair.

### Personalization

This application is a perfect case study to examine per-user personalization. The idea is to supplement our `LinearCombination` feature combinator with per-user features in a ["frustratingly easy domain adaptation"][feda] style.

Intuitively, the technique exploits *general* and *per-user* weights for the same features.
In our example so far, the basic features are called `referencesAttendees` and `similarTopic`.
Without personalization, our `LinearCombination` has two weights, one for each feature.
The idea here is that, if we have $n$ users, the combination will now have $n+1$ weights per feature (i.e., $2n+2$ total)---a general weight and one for each user.

In OPAL, we'll do this by creating special copies of our features.
We'll need a basic combinator:

    // Adapt a single feature. Given a feature for "A"s and a single "B", make
    // a feature that works for "A/B pairs." The second argument can either
    // be a specific B or null to generate a general feature.
    function adaptFeature<A, B>(feat: Feature<A>, the_b: B | null):
        Feature<[A, B]>
    {
      if (b === null) {
          // This is a general feature: ignore the B and just return the
          // original feature.
          return new Feature<[A, B]>(([a, b]) => {
            return feat(a);
          });
      } else {
        // This is a specific feature: the original feature for the given B
        // and zero otherwise.
        return new Feature<[A, B]>(([a, b]) => {
          if (b == the_b) {
            return feat(a);
          } else {
            return 0;
          }
        });
      }
    }

Next, we'll use this adaptor for single features to build something that can augment entire *lists* of features for domain adaptation:

    // Given a list of "A" features and a list of "B"s, create a cross-product
    // list of features for domain adaptation.
    function adaptFeatures(feats: Feature<A>[], bs: B[]): Feature<A, B>[] {
      let out = [];
      for (let feat of feats) {
        for (let b of bs) {
          let ab_feat = adaptFeature(feat, b);
          out.push(ab_feat);
        }
      }
      return out;
    }

Now, we can construct our linear classifier over the expanded list of features:

    let relevance: Feature<[[Event, Document], User]> =
      new LinearCombination(adaptFeatures([
          referencesAttendees,
          similarTopic,
      ], users));

This new `relevance` feature now works on complete triples of events, documents, and users.

#### Loose Ends

This approach bears a little criticism:

> It introduces a bunch of zeroes that don't seem strictly necessary. This reflects the [original paper][feda] I'm using to guide the design but it seems a little wasteful.

On the other hand, the nice thing about the current approach is that `LinearCombination` is blissfully unaware of the domain adaptation---it doesn't need to care that there are multiple "copies" of each feature!
We could sacrifice that by creating a special `AdaptedLinearCombination` thing, which would avoid zeroing and instead just maintain exactly $|A| * (|B| + 1)$ weights.
Given an `A` and a `B`, the new classifier would use only the relevant set of weights.

> How do you look up a particular score component? You need the identify of the augmented `[A, B]` feature for a particular feature/`B` pair.

We could maintain a map that would let you look up the appropriate feature before using it as index into the `LinearCombination`.

The special `AdaptedLinearCombination` could solve this problem easily too.

[feda]: http://www.umiacs.umd.edu/~hal/docs/daume07easyadapt.pdf

### Search

We need a top-$k$ primitive to search for the set of documents that maximize `relevance`.
