To start, imagine that each "feature" (for lack of a better name) has an id, a friendly name (for description), and a default value.
```
Feature ::= feature id, feature friendly name, default value 
```
Imagine that these participate in expression trees that represent weights.

We can start out with linear models:
```
FeatureTree ::= Number
  | Feature * Number + FeatureTree
```
By expanding the structure of a feature tree, we can construct complex features, complex models, etc.

Events can be weighted by these feature trees:
```
WeightedEvent<X>
{
 X data;
 FeatureTree weight;
}
```

We provide a set of operations for ranking sets of events, explaning preferences, and gathering end-user feebdack:
```
//
list<WeightedEvent<X>> rank(set<WeightedEvent<X>>, context)

string explainPreference(WeightedEvent<X> option, set<WeightedEvent<X>> allOptions, context)

void dislike(WeightedEvent<X>, penalty, context)
void like(WeightedEvent<X>, context)

void prefer(WeightedEvent<X> better, WeightedEvent<X> worse, context)
```

---

Some requirements:

- "Invent" a new feature inline in the code.
- Enumerate and inspect all the features: i.e., they're associated with some kind of pool/repository.
- Abstract computed features: a basic number and a computed expression should have the same type.

---

Maybe you just declare features at the module level.

    feature dayOfWeekMismatch;

---

Is the similarity computation itself a feature?

    function dateMatch(date: Date, evidence: PartialDate): Feature {
      let total: ExpFeature = 0;
      if (evidence.dayOfWeek !== date.dayOfWeek) {
        total += dayOfWeekMismatch;
      }
      ...
    }

The result of this thing is a quantity that depends on the feature pool and also something about the concrete data (the `date` argument).
We can make this trivially incremental, by just re-running the `dateMatch` function, or we could use symbolic execution to do something fancier.
