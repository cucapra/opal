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
