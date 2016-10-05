/**
 * For now, scores are just plain numbers between 0 and 1.
 */
type Score = number;

interface Feature<T> {
  score(v: T): Score;
}

/**
 * A basic feature that extracts a score from a concrete value using
 * a user-defined function.
 */
class ElementaryFeature<T> implements Feature<T> {
  constructor(public func: (v: T) => Score) {
  }

  score(v: T): Score {
    return this.func(v);
  }
}

/**
 * A liner combination of other features.
 */
class LinearCombination<T> implements Feature<T> {
  constructor(public feats: Feature<T>[], public weights: number[]) {
    console.assert(feats.length === weights.length);
  }

  score(v: T): Score {
    let total: Score = 0;
    for (let i = 0; i < this.feats.length; ++i) {
      total += this.feats[i].score(v) * this.weights[i];
    }
    return total;
  }
}
