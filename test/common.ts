// Set-equality for iterables.
export function contents_equal<T>(a: Iterable<T>, b: Iterable<T>) {
  let set: Set<T> = new Set();
  for (let bv of b) {
    set.add(bv);
  }

  let count = 0;
  for (let av of a) {
    if (!set.has(av)) {
      return false;
    }
    ++count;
  }
  return set.size === count;
}

// Tape assertion for set equality.
export function assert_set_equal<T>(tape: any, a: Iterable<T>, b: Iterable<T>) {
  tape.assert(contents_equal(a, b));
}
