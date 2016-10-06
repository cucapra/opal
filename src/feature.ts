/**
 * A score is (currently) a sum of values attributed to features.
 */
export class Score {
  // TODO: Perhaps this should associate only feature IDs, not full objects.
  // We don't need to actually execute the feature, for example. But we would
  // eventually like to use them for provenance information.
  constructor(public feats: Feature<any>[], public amounts: number[]) {
  }

  /**
   * Get the total value of this score.
   */
  total() {
    let out = 0;
    for (let amount of this.amounts) {
      out += amount;
    }
    return out;
  }

  /**
   * Create a Score that consists of all of the components of a collection
   * of smaller Scores.
   */
  static union<T>(scores: Iterable<Score>) {
    let feats: Feature<T>[] = [];
    let amounts: number[] = [];
    for (let score of scores) {
      feats = feats.concat(score.feats);
      amounts = amounts.concat(score.amounts);
    }
    return new Score(feats, amounts);
  }

  /**
   * An alternative constructor that takes a list of pairs instead of a pair
   * of lists.
   */
  static from_pairs<T>(pairs: [Feature<T>, number][]) {
    let feats: Feature<T>[] = [];
    let amounts: number[] = [];
    for (let [f, n] of pairs) {
      feats.push(f);
      amounts.push(n);
    }
    return new Score(feats, amounts);
  }
}

/**
 * The inner product of two Scores.
 */
function dot<T>(a: Score, b: Score) {
  // This actually requires that the two lists of features be the same set,
  // in the same order.
  console.assert(a.feats.length === b.feats.length);

  let amounts: number[] = [];
  for (let i = 0; i < a.feats.length; ++i) {
    amounts.push(a.amounts[i] * b.amounts[i]);
  }
  return new Score(a.feats, amounts);
}


/**
 * A common type for all features.
 */
export interface Feature<T> {
  score(v: T): Score;
}


/**
 * A basic feature that extracts a score from a concrete value using
 * a user-defined function.
 */
export class ElementaryFeature<T> implements Feature<T> {
  constructor(public func: (v: T) => number) {
  }

  score(v: T): Score {
    return new Score([this], [this.func(v)]);
  }
}


/**
 * Like an `ElementaryFeature` but produces a Score instead of a plain number.
 * (Just a plain wrapper around a function.)
 */
class ScoreFeature<T> implements Feature<T> {
  constructor(public func: (v: T) => Score) {
  }

  score(v: T): Score {
    return this.func(v);
  }
}


/**
 * A linear combination of other features.
 */
export class LinearCombination<T> implements Feature<T> {
  constructor(public weights: Score) {
  }

  /**
   * Get the feature vector for a value: i.e., run each of the features on
   * the value.
   */
  fvec(v: T): Score {
    let this_ = this;  // JavaScript makes me sad sometimes.
    let gen = function*(): Iterable<Score> {
      for (let feat of this_.weights.feats) {
        yield feat.score(v);
      }
    };
    return Score.union(gen());
  }

  score(v: T): Score {
    return dot(this.fvec(v), this.weights);
  }
}


/**
 * Domain adaptation for a single feature.
 *
 * Given a feature for A objects and a specific B (or null to indicate *no*
 * specific B), return a new feature for A/B pairs. The feature is zero on
 * a mismatch with the concrete B and the same as the original feature on a
 * match.
 */
function adapt<A, B>(feat: Feature<A>, the_b: B | null):
    Feature<[A, B]>
{
  if (the_b === null) {
      // This is a general feature: ignore the B and just return the
      // original feature.
      return new ScoreFeature<[A, B]>(([a, b]) => {
        return feat.score(a);
      });
  } else {
    // This is a specific feature: the original feature for the given B
    // and zero otherwise.
    return new ScoreFeature<[A, B]>(([a, b]) => {
      if (b == the_b) {
        return feat.score(a);
      } else {
        return new Score([], []);  // Zero.
      }
    });
  }
}

/**
 * Adapt a set of features according to a cross product with a second
 * domain.
 */
function adaptall<A, B>(feats: Feature<A>[], bs: B[]): Feature<[A, B]>[] {
  let out: Feature<[A, B]>[] = [];
  for (let feat of feats) {
    for (let b of bs) {
      let ab_feat = adapt(feat, b);
      out.push(ab_feat);
    }
  }
  return out;
}
