export class TreeNode<T> {
  children: LinkedList<TreeNode<T>> = new LinkedList();

  parent: TreeNode<T> | null = null;

  adoptedChildren: LinkedList<TreeNode<T>> = new LinkedList();

  adoptiveParent: TreeNode<T> | null = null;

  constructor(public value: T) {}

  addChildNodeGenerally(
    childNode: TreeNode<T>,
    isAdoptedChild: boolean = false
  ) {
    if (isAdoptedChild) {
      this.adoptedChildren.push(childNode);
      childNode.adoptiveParent = this;
    } else {
      this.children.push(childNode);
      childNode.parent = this;
    }
    return childNode;
  }

  addChildNode(childNode: TreeNode<T>) {
    return this.addChildNodeGenerally(childNode);
  }

  addAdoptedChildNode(adoptedChildNode: TreeNode<T>) {
    return this.addChildNodeGenerally(adoptedChildNode, true);
  }

  private addChildGenerally(value: T, isAdoptedChild: boolean = false) {
    return this.addChildNodeGenerally(new TreeNode(value), isAdoptedChild);
  }

  addChild(value: T) {
    return this.addChildGenerally(value);
  }

  addAdoptedChild(value: T) {
    return this.addChildGenerally(value, true);
  }

  private addChildrenGenerally(values: T[], isAdoptedChild: boolean = false) {
    const childNodes: TreeNode<T>[] = [];
    values.forEach((value) => {
      childNodes.push(this.addChildGenerally(value, isAdoptedChild));
    });
    return childNodes;
  }

  addChildren(values: T[]) {
    return this.addChildrenGenerally(values);
  }

  addAdoptedChildren(values: T[]) {
    return this.addChildrenGenerally(values, true);
  }

  private removeChildGenerally(
    removedChildValue: T,
    isAdoptedChild: boolean = false
  ) {
    if (isAdoptedChild) {
      for (const childNode of this.adoptedChildren) {
        if (childNode.value.value === removedChildValue) {
          return this.adoptedChildren.remove(childNode.value);
        }
      }
    } else {
      for (const childNode of this.children) {
        if (childNode.value.value === removedChildValue) {
          return this.children.remove(childNode.value);
        }
      }
    }
  }

  removeChild(removedChildValue: T) {
    return this.removeChildGenerally(removedChildValue);
  }

  removeAdoptedChild(removedChildValue: T) {
    return this.removeChildGenerally(removedChildValue, true);
  }

  get root() {
    const getRootValue = (treeNode: TreeNode<T>): TreeNode<T> =>
      treeNode.parent ? getRootValue(treeNode.parent!) : treeNode;
    return getRootValue(this);
  }

  private getIteratorOfChildrenGenerally(all: boolean = false) {
    const listQueue = new LinkedList<TreeNode<T>>();

    function queue(treeNode: TreeNode<T>) {
      listQueue.push(treeNode);
      for (const listNode of treeNode.children) {
        queue(listNode.value);
      }
      if (all) {
        for (const listNode of treeNode.adoptedChildren) {
          queue(listNode.value);
        }
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

  // 生成一个可以用来递归迭代所有 children 以及 adoptedChildren 的对象
  allChildren() {
    const _this = this;
    return {
      [Symbol.iterator]() {
        return _this.getIteratorOfChildrenGenerally(true);
      },
    };
  }

  //  [Symbol.iterator] 生成的迭代器只会迭代所有的 children
  [Symbol.iterator]() {
    return this.getIteratorOfChildrenGenerally();
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
