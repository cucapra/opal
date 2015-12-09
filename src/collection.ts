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

class Collection<T> {
  operations: Set<CollectionOperation<T>>;

  constructor(public parent: Collection<T>) {
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
}
