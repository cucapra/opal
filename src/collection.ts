abstract class CollectionNode<T> {
  constructor(
    public parent: CollectionNode<T>
  ) {}
  abstract view(): Set<T>;
}

class EmptyNode<T> extends CollectionNode<T> {
  constructor() {
    super(null);
  }

  view(): Set<T> {
    return new Set();
  }
}

class AddNode<T> extends CollectionNode<T> {
  constructor(
    parent: CollectionNode<T>,
    public value: T)
  {
    super(parent);
  };

  view(): Set<T> {
    let out = this.parent.view();
    out.add(this.value);
    return out;
  }
}

class DeleteNode<T> extends CollectionNode<T> {
  constructor(
    parent: CollectionNode<T>,
    public value: T
  ) {
    super(parent);
  };

  view(): Set<T> {
    let out = this.parent.view();
    out.delete(this.value);
    return out;
  }
}

class MergeNode<T> extends CollectionNode<T> {
  constructor(
    parent: CollectionNode<T>,
    public overlay: CollectionNode<T>
  ) {
    super(parent);
  }

  view(): Set<T> {
    // TODO
    return null;
  }
}
