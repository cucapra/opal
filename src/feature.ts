/**
 * A score is (currently) a sum of values attributed to features.
 */
class Score<T> {
  constructor(public feats: Feature<T>[], public amounts: number[]) {
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
  static union<T>(scores: Iterable<Score<T>>) {
    let feats: Feature<T>[] = [];
    let amounts: number[] = [];
    for (let score of scores) {
      feats = feats.concat(score.feats);
      amounts = amounts.concat(score.amounts);
    }
    return new Score(feats, amounts);
  }
}

/**
 * The inner product of two Scores.
 */
function dot<T>(a: Score<T>, b: Score<T>) {
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
interface Feature<T> {
  score(v: T): Score<T>;
}


/**
 * A basic feature that extracts a score from a concrete value using
 * a user-defined function.
 */
class ElementaryFeature<T> implements Feature<T> {
  constructor(public func: (v: T) => number) {
  }

  score(v: T): Score<T> {
    return new Score([this], [this.func(v)]);
  }
}


/**
 * A liner combination of other features.
 */
class LinearCombination<T> implements Feature<T> {
  constructor(public weights: Score<T>) {
  }

  /**
   * Get the feature vector for a value: i.e., run each of the features on
   * the value.
   */
  fvec(v: T): Score<T> {
    let gen = function*(): Iterable<Score<T>> {
      for (let i = 0; i < this.feats.length; ++i) {
        yield this.feats[i].score(v);
      }
    };
    return Score.union(gen());
  }

  score(v: T): Score<T> {
    return dot(this.fvec(v), this.weights);
  }
}
