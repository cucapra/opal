module Collection {

  abstract class Node<T> {
    constructor(
      public parent: Node<T>
    ) {}

    abstract log(): Operation<T>[];

    view(): Set<T> {
      var out: Set<T> = new Set();
      for (let op of this.log()) {
        op.apply(out);
      }
      return out;
    }
  }

  abstract class Operation<T> {
    abstract apply(set: Set<T>): void;
  }

  class Add<T> extends Operation<T> {
    constructor(
      public value: T
    ) {
      super();
    }

    apply(set: Set<T>) {
      set.add(this.value);
    }
  }

  class Delete<T> extends Operation<T> {
    constructor(
      public value: T
    ) {
      super();
    }

    apply(set: Set<T>) {
      set.delete(this.value);
    }
  }

  class OperationNode<T> extends Node<T> {
    constructor(
      public parent: Node<T>,
      public operation: Operation<T>
    ) {
      super(parent);
    }

    log(): Operation<T>[] {
      return this.parent.log().concat(this.operation);
    }
  }

  class EmptyNode<T> extends Node<T> {
    constructor() {
      super(null);
    }

    log(): Operation<T>[] {
      return [];
    }
  }

  function merge<T>(base: Node<T>, overlay: Node<T>) {
      // The first step is to accumulate the *entire* set of ancestors of the
      // base so we can check membership when traversing the overlay's ancestry.
      let base_ancestors: Set<Node<T>> = new Set();
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

}
