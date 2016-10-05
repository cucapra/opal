/**
 * Create a JavaScript ordering function given a function that looks up an
 * element's key. For example, use:
 *
 *     array.sort(orderBy((o) => o.f));
 *
 * to sort by an object's `f` field.
 */
export function orderBy<S, T>(f: (v: S) => T) {
  return (a: S, b: S) => {
    let aKey = f(a);
    let bKey = f(b);
    if (aKey < bKey) {
      return -1;
    } else if (aKey > bKey) {
      return 1;
    } else {
      return 0;
    }
  }
}


/**
 * Dynamic null check for TypeScript 2.0. (A dynamic version of the new
 * built-in ! operator.)
 */
export function nchk<T>(x: T | null, msg?: string): T {
  if (x === null) {
    throw msg || "null check failed";
  }
  return x;
}
