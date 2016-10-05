/**
 * For now, scores are just plain numbers between 0 and 1.
 */
type Score = number;

/**
 * The inner product of two dense vectors represented as JavaScript lists.
 */
function dot(a: number[], b: number[]) {
  console.assert(a.length === b.length);
  let total = 0;
  for (let i = 0; i < a.length; ++i) {
    total += a[i] * b[i];
  }
  return total;
}


/**
 * A common type for all features.
 */
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

  /**
   * Get the feature vector for a value: i.e., run each of the features on
   * the value.
   */
  fvec(v: T): Score[] {
    let out: Score[] = [];
    for (let i = 0; i < this.feats.length; ++i) {
      out.push(this.feats[i].score(v) * this.weights[i]);
    }
    return out;
  }

  score(v: T): Score {
    return dot(this.fvec(v), this.weights);
  }
}
