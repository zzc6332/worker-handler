export class TreeNode<T> {
  children: LinkedList<TreeNode<T>> = new LinkedList();

  parent: TreeNode<T> | null = null;

  constructor(public value: T) {}

  addChild(value: T) {
    const childNode = new TreeNode(value);
    this.children.push(childNode);
    childNode.parent = this;
    return childNode;
  }

  addChildren(values: T[]) {
    const childNodes: TreeNode<T>[] = [];
    values.forEach((value) => {
      childNodes.push(this.addChild(value));
    });
    return childNodes;
  }

  removeChild(removedChildValue: T) {
    for (const childNode of this.children) {
      if (childNode.value.value === removedChildValue) {
        return this.children.remove(childNode.value);
      }
    }
  }

  get root() {
    const getRootValue = (treeNode: TreeNode<T>): TreeNode<T> =>
      treeNode.parent ? getRootValue(treeNode.parent!) : treeNode;
    return getRootValue(this);
  }

  [Symbol.iterator]() {
    const listQueue = new LinkedList<TreeNode<T>>();

    function queue(treeNode: TreeNode<T>) {
      listQueue.push(treeNode);
      for (const listNode of treeNode.children) {
        queue(listNode.value);
      }
    }

    queue(this);

    const iterator = listQueue[Symbol.iterator]();

    return {
      next() {
        const { value, done } = iterator.next();
        return {
          value: value?.value,
          done,
        };
      },
    };
  }
}

class LinkedList<T> {
  private headNode: ListNode<T> | null = null;

  private tailNode: ListNode<T> | null = null;

  private _size = 0;

  constructor(values?: NonNullable<T>[]) {
    if (values) {
      let currentNode: ListNode<T> | null = null;
      values.forEach((value, index) => {
        this._size++;
        if (index === 0) {
          this.headNode = currentNode = new ListNode(value);
        }
        if (index === values.length - 1) {
          (currentNode as any)._next = this.tailNode = new ListNode(
            value,
            currentNode
          );
        } else if (index !== 0) {
          (currentNode as any)._next = currentNode = new ListNode(
            value,
            currentNode
          );
        }
      });
    }
  }

  get head() {
    return this.headNode || null;
  }

  get tail() {
    return this.tailNode || null;
  }

  get size() {
    return this._size;
  }

  remove(removedValue: T) {
    for (const listNode of this) {
      if (removedValue === listNode.value) {
        if (listNode.prev) {
          (listNode.prev as any)._next = listNode.next;
        } else {
          this.headNode = listNode.next;
        }
        if (listNode.next) {
          (listNode.next as any)._prev = listNode.prev;
        } else {
          this.tailNode = listNode.prev;
        }
        this._size--;
        return listNode;
      }
    }
    return null;
  }

  push(value: NonNullable<T>) {
    if (this.tailNode) {
      (this.tailNode as any)._next = this.tailNode = new ListNode(
        value,
        this.tailNode
      );
    } else {
      this.headNode = this.tailNode = new ListNode(value);
    }
    this._size++;
  }

  pushItems(values: NonNullable<T>[]) {
    values.forEach((value) => {
      this.push(value);
    });
  }

  pushLinkedList(linkedList: LinkedList<T>) {
    if (!linkedList.headNode) return;
    (linkedList.headNode as any)._prev = this.tailNode;
    if (this.tailNode) {
      (this.tailNode as any)._next = linkedList.headNode;
      this.tailNode = linkedList.tailNode;
    } else {
      this.headNode = this.tailNode = linkedList.headNode;
    }
    this._size += linkedList.size;
    linkedList.clear();
  }

  shift() {
    const shifted = this.headNode;
    if (shifted) {
      this.headNode = shifted.next;
      if (!this.headNode) this.tailNode = null;
      (shifted as any)._next = null;
      this._size--;
    }
    return shifted;
  }

  shiftItems(number: number) {
    const shifteds: ListNode<T>[] = [];
    for (let i = 0; i < number; i++) {
      const shifted = this.shift();
      if (shifted) shifteds.push(shifted);
    }
    return shifteds;
  }

  clear() {
    this.headNode = this.tailNode = null;
    this._size = 0;
  }

  [Symbol.iterator]() {
    let currentNode = this.head;
    return {
      next() {
        const result = { value: currentNode || undefined, done: !currentNode };
        if (currentNode) currentNode = currentNode.next;
        return result as {
          value: ListNode<T>;
          done: boolean;
        };
      },
    };
  }
}

class ListNode<T> {
  private _next: ListNode<T> | null = null;
  private _prev: ListNode<T> | null = null;

  constructor(
    public value: T,
    prev?: ListNode<T> | null
  ) {
    if (prev) this._prev = prev;
  }

  get next() {
    return this._next;
  }

  get prev() {
    return this._prev;
  }

  get successorSize() {
    let size = 0;
    function step(listNode: ListNode<T>) {
      const next = listNode._next;
      if (next) {
        size++;
        step(next);
      }
    }
    step(this);
    return size;
  }

  get predecessorSize() {
    let size = 0;
    function step(listNode: ListNode<T>) {
      const prev = listNode._prev;
      if (prev) {
        size++;
        step(prev);
      }
    }
    step(this);
    return size;
  }
}
