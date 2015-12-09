abstract class CollectionNode<T> {
  abstract view(): Set<T>;
}

class EmptyNode<T> extends CollectionNode<T> {
  view(): Set<T> {
    return new Set();
  }
}

class AddNode<T> extends CollectionNode<T> {
  constructor(public parent: CollectionNode<T>, public value: T) {
    super();
  };

  view(): Set<T> {
    let out = this.parent.view();
    out.add(this.value);
    return out;
  }
}

class DeleteNode<T> extends CollectionNode<T> {
  constructor(public parent: CollectionNode<T>, public value: T) {
    super();
  };

  view(): Set<T> {
    let out = this.parent.view();
    out.delete(this.value);
    return out;
  }
}
