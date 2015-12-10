abstract class CollectionNode<T> {
  constructor(
    public parent: CollectionNode<T>
  ) {}

  abstract log(): CollectionOperation<T>[];

  view(): Set<T> {
    var out: Set<T> = new Set();
    for (let op of this.log()) {
      op.apply(out);
    }
    return out;
  }
}

abstract class CollectionOperation<T> {
  abstract apply(set: Set<T>): void;
}

class AddOperation<T> extends CollectionOperation<T> {
  constructor(
    public value: T
  ) {
    super();
  }

  apply(set: Set<T>) {
    set.add(this.value);
  }
}

class DeleteOperation<T> extends CollectionOperation<T> {
  constructor(
    public value: T
  ) {
    super();
  }

  apply(set: Set<T>) {
    set.delete(this.value);
  }
}

class OperationNode<T> extends CollectionNode<T> {
  constructor(
    public parent: CollectionNode<T>,
    public operation: CollectionOperation<T>
  ) {
    super(parent);
  }

  log(): CollectionOperation<T>[] {
    return this.parent.log().concat(this.operation);
  }
}

class EmptyNode<T> extends CollectionNode<T> {
  constructor() {
    super(null);
  }

  log(): CollectionOperation<T>[] {
    return [];
  }
}

function merge<T>(base: CollectionNode<T>, overlay: CollectionNode<T>) {
    // The first step is to accumulate the *entire* set of ancestors of the
    // base so we can check membership when traversing the overlay's ancestry.
    let base_ancestors: Set<CollectionNode<T>> = new Set();
    let base_ancestor = this.base;
    do {
      base_ancestors.add(base_ancestor);
      base_ancestor = base_ancestor.parent;
    } while (base_ancestor !== null && base_ancestor !== this.parent);

    // Next, get the overlay's log *up to but not including* the closest
    // common ancestor.
    let log_suffix = overlay.log(base_ancestors);

    // TODO Check safety: the two nodes need to be related (have some common
    // ancestor). We also need to check for conflicting concurrent operations.

    // TODO
}
