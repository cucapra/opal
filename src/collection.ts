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
    // Find the closest common ancestor.
    let ancestors: Set<CollectionNode<T>> = new Set();
    let overlay_ancestor = this.overlay;
    do {
      ancestors.add(overlay_ancestor);
      overlay_ancestor = overlay_ancestor.parent;
    } while (overlay_ancestor !== null && overlay_ancestor !== this.parent);

    let parent_ancestor = this.parent;
    while (parent_ancestor !== null && !ancestors.has(parent_ancestor)) {
      parent_ancestor = parent_ancestor.parent;
    }

    console.assert(parent_ancestor !== null, "parent and overlay are unrelated");

    // TODO
}
