'use strict';

/**
 * An immutable, unit in a persistent set structure.
 *
 * Each Node points to its parent (except the root EmptyNode, below). The
 * log of operations on a data structure can be found by tracing the chain of
 * parents.
 */
export abstract class Node<T> {
  constructor(
    public parent: Node<T> | null
  ) {}

  /**
   * Trace the chain of Nodes to build up a list of `Operation`s that have
   * been recorded for the data structure.
   *
   * The log begins either at the beginning of time or, if `until` is
   * provided, up to (but not including) that `Node`.
   */
  abstract log(until?: Node<T>): Operation<T>[];

  /**
   * Get the flat set of values represented by the data structure.
   */
  view(): Set<T> {
    var out: Set<T> = new Set();
    for (let op of this.log()) {
      op.apply(out);
    }
    return out;
  }
}

/**
 * Any change to the set data structure.
 */
export abstract class Operation<T> {
  abstract apply(set: Set<T>): void;
}

/**
 * An operation that adds a value to the set.
 */
export class Add<T> extends Operation<T> {
  constructor(
    public value: T
  ) {
    super();
  }

  apply(set: Set<T>) {
    set.add(this.value);
  }
}

/**
 * An operation that removes a value from the set.
 */
export class Delete<T> extends Operation<T> {
  constructor(
    public value: T
  ) {
    super();
  }

  apply(set: Set<T>) {
    set.delete(this.value);
  }
}

/**
 * A PSet node that contains a single `Operation`.
 */
class OperationNode<T> extends Node<T> {
  constructor(
    public parent: Node<T>,
    public operation: Operation<T>
  ) {
    super(parent);
  }

  log(until?: Node<T>): Operation<T>[] {
    // The log here is just the parent's log, extended with this node's
    // operation.
    if (this === until) {
      return [];
    }
    return this.parent.log(until).concat(this.operation);
  }
}

/**
 * A root PSet node with no contents.
 */
class EmptyNode<T> extends Node<T> {
  constructor() {
    super(null);
  }

  log(until?: Node<T>): Operation<T>[] {
    return [];
  }
}

/**
 * A root PSet node containing a concrete list for the set's contents.
 */
class FlatNode<T> extends Node<T> {
  constructor(public contents: T[]) {
    super(null);
  }

  log(until?: Node<T>): Operation<T>[] {
    if (this === until) {
      return [];
    }
    let out: Operation<T>[] = [];
    for (let v of this.contents) {
      out.push(new Add(v));
    }
    return out;
  }
}

/**
 * Find the closest common ancestor among two sets. Specifically, this finds
 * the most recent ancestor of `overlay` that is also an ancestor of `base`.
 */
export function common<T>(base: Node<T>, overlay: Node<T>): Node<T> | null {
  // The first step is to accumulate the *entire* set of ancestors of the
  // base so we can check membership when traversing the overlay's ancestry.
  let base_ancestors: Set<Node<T>> = new Set();
  let base_ancestor: Node<T> | null = base;
  do {
    base_ancestors.add(base_ancestor);
    base_ancestor = base_ancestor.parent;
  } while (base_ancestor !== null);

  // Next, walk up the ancestors of `overlay` to find the closest common
  // ancestor.
  let overlay_ancestor: Node<T> | null = overlay;
  while (overlay_ancestor !== null && !base_ancestors.has(overlay_ancestor)) {
    overlay_ancestor = overlay_ancestor.parent;
  }

  return overlay_ancestor;
}

/**
 * Given two related sets, find the new operations on the second that need
 * to be applied to `base` to merge them.
 *
 * @param base     The "older" set that needs updating.
 * @param overlay  The "newer" set, which must share a common ancestor with
 *                 `base`, whose operations will be applied.
 * @returns        A new set containing all operations.
 */
export function diff<T>(base: Node<T>, overlay: Node<T>): Operation<T>[]
{
  // Get the closest common ancestor.
  let ancestor = common(base, overlay);
  if (ancestor === null) {
    throw("base and overlay sets must be related");
  }

  // Next, get the overlay's log *up to but not including* the closest
  // common ancestor.
  let log_suffix = overlay.log(ancestor);

  // TODO Check for conflicting concurrent operations.
  return log_suffix;
}

// The `export`ed functions below are the module's main external interface.
// The interface is uses a functional, immutable style, so to add a value to a
// set, you do something like this:
//
//     let coll1 = ...;
//     let coll2 = PSet.add(coll1, 42);
//
//  rather than mutating the set in place.

/**
 * Given two sets that share a common ancestor, merge the operations
 * that have occurred on either branch and return a new set.
 *
 * It is an error to:
 * - Pass unrelated nodes (i.e., sets with no common ancestor).
 * - Merge two sets with conflicting updates (e.g., where both
 *   branches remove the same item from the set).
 */
export function merge<T>(base: Node<T>, overlay: Node<T>) {
  // Get the operations to replay.
  let log = diff(base, overlay);

  // Replay the partial log on top of the base.
  let out = base;
  for (let op of log) {
    out = new OperationNode(out, op);
  }
  return out;
}

/**
 * Create a new set.
 */
export function set<T>(values?: Iterable<T>): Node<T> {
  if (values) {
    return new FlatNode<T>(Array.from(values));
  } else {
    return new EmptyNode<T>();
  }
}

/**
 * Apply any operation to a collection.
 */
export function op<T>(coll: Node<T>, op: Operation<T>): Node<T> {
  return new OperationNode(coll, op);
}

/**
 * Add a new value to a set.
 */
export function add<T>(coll: Node<T>, value: T): Node<T> {
  return op(coll, new Add(value));
}

/**
 * Remove a value from a set.
 */
export function del<T>(coll: Node<T>, value: T): Node<T> {
  return op(coll, new Delete(value));
}
