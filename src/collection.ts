abstract class CollectionOperation<T> {}

class CollectionAdd<T> extends CollectionOperation<T> {
  constructor(public value: T) {
    super();
  };
}

class CollectionDelete<T> extends CollectionOperation<T> {
  constructor(public value: T) {
    super();
  };
}

class CollectionNode<T> {
  operations: Set<CollectionOperation<T>>;

  constructor(public parent: CollectionNode<T>) {
    this.operations = new Set();
  }

  view(): Set<T> {
    let out: Set<T> = new Set();

    // Start with the values from parent.
    for (let v of this.parent.view()) {
      out.add(v);
    }

    // Apply the local operations.
    for (let op of this.operations) {
      if (op instanceof CollectionAdd) {
        out.add(op.value);
      } else if (op instanceof CollectionDelete) {
        out.delete(op.value);
      }
    }

    return out;
  }

  add(value: T) {
    this.operations.add(new CollectionAdd(value));
  }

  delete(value: T) {
    this.operations.add(new CollectionDelete(value));
  }
}
