/**
 * @file z/queue.ts
 * @brief Circular queue and min-heap priority queue
 *
 * Port of z-queue.c.
 *
 * Copyright (c) 2011 Erik Osheim
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

/**
 * Simple circular queue of numbers (or typed items via generics).
 */
export class Queue<T = number> {
  private data: T[];
  private _size: number; // internal capacity (size + 1)
  private head = 0;
  private tail = 0;

  constructor(size: number) {
    this._size = size + 1;
    this.data = new Array<T>(this._size);
  }

  /** Maximum capacity. */
  get capacity(): number {
    return this._size - 1;
  }

  /** Current number of items. */
  get length(): number {
    return this.tail >= this.head
      ? this.tail - this.head
      : this._size - this.head + this.tail;
  }

  /** Whether the queue is empty. */
  get isEmpty(): boolean {
    return this.head === this.tail;
  }

  /** Push an item. Throws if full. */
  push(item: T): void {
    this.data[this.tail] = item;
    this.tail = (this.tail + 1) % this._size;
    if (this.tail === this.head) {
      throw new Error("Queue overflow");
    }
  }

  /** Pop an item from the front. Throws if empty. */
  pop(): T {
    if (this.head === this.tail) {
      throw new Error("Queue underflow");
    }
    const item = this.data[this.head]!;
    this.head = (this.head + 1) % this._size;
    return item;
  }

  /** Peek at the front item without removing. */
  peek(): T {
    if (this.head === this.tail) {
      throw new Error("Queue empty");
    }
    return this.data[this.head]!;
  }
}

// ── Priority Queue (min-heap) ──

interface PQElement<T> {
  priority: number;
  payload: T;
}

/**
 * Min-heap priority queue. Lower priority values are dequeued first.
 */
export class PriorityQueue<T = number> {
  private data: PQElement<T>[];
  private _size: number;
  private _count = 0;

  constructor(size: number) {
    this._size = size;
    this.data = new Array<PQElement<T>>(size);
  }

  get capacity(): number {
    return this._size;
  }

  get length(): number {
    return this._count;
  }

  get isEmpty(): boolean {
    return this._count === 0;
  }

  private upHeap(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[i]!.priority >= this.data[parent]!.priority) break;
      const tmp = this.data[parent]!;
      this.data[parent] = this.data[i]!;
      this.data[i] = tmp;
      i = parent;
    }
  }

  private downHeap(i: number): void {
    while (true) {
      const child1 = (i << 1) + 1;
      if (child1 >= this._count) break;

      if (child1 === this._count - 1) {
        // Only one child
        if (this.data[i]!.priority <= this.data[child1]!.priority) break;
        const tmp = this.data[i]!;
        this.data[i] = this.data[child1]!;
        this.data[child1] = tmp;
        break;
      }

      const child2 = child1 + 1;
      if (this.data[i]!.priority > this.data[child1]!.priority) {
        if (
          this.data[i]!.priority <= this.data[child2]!.priority ||
          this.data[child1]!.priority < this.data[child2]!.priority
        ) {
          const tmp = this.data[i]!;
          this.data[i] = this.data[child1]!;
          this.data[child1] = tmp;
          i = child1;
        } else {
          const tmp = this.data[i]!;
          this.data[i] = this.data[child2]!;
          this.data[child2] = tmp;
          i = child2;
        }
      } else if (this.data[i]!.priority > this.data[child2]!.priority) {
        const tmp = this.data[i]!;
        this.data[i] = this.data[child2]!;
        this.data[child2] = tmp;
        i = child2;
      } else {
        break;
      }
    }
  }

  /** Push an item with the given priority. */
  push(priority: number, payload: T): void {
    if (this._count >= this._size) {
      throw new Error("Priority queue overflow");
    }
    this.data[this._count] = { priority, payload };
    this.upHeap(this._count);
    this._count++;
  }

  /** Pop the lowest-priority item. */
  pop(): T {
    if (this._count === 0) {
      throw new Error("Priority queue underflow");
    }
    const result = this.data[0]!.payload;
    this._count--;
    this.data[0] = this.data[this._count]!;
    this.downHeap(0);
    return result;
  }

  /** Peek at the lowest-priority item. */
  peek(): T {
    if (this._count === 0) {
      throw new Error("Priority queue empty");
    }
    return this.data[0]!.payload;
  }

  /** Combined push+pop (more efficient than separate calls). */
  pushPop(priority: number, payload: T): T {
    if (this._count === 0 || priority <= this.data[0]!.priority) {
      return payload;
    }

    const result = this.data[0]!.payload;
    if (priority <= this.data[this._count - 1]!.priority) {
      this.data[0] = { priority, payload };
    } else {
      this.data[0] = this.data[this._count - 1]!;
      this.data[this._count - 1] = { priority, payload };
    }
    this.downHeap(0);
    return result;
  }

  /** Remove all elements. */
  flush(): void {
    this._count = 0;
  }

  /** Validate the heap invariant. Returns true if invalid. */
  isInvalid(): boolean {
    if (this._count < 2) return false;

    let start: number;
    if ((this._count & 1) === 0) {
      const parent = (this._count - 2) >> 1;
      if (this.data[this._count - 1]!.priority < this.data[parent]!.priority) {
        return true;
      }
      start = this._count - 2;
    } else {
      start = this._count - 1;
    }

    while (start > 1) {
      const parent = (start - 1) >> 1;
      if (
        this.data[start]!.priority < this.data[parent]!.priority ||
        this.data[start - 1]!.priority < this.data[parent]!.priority
      ) {
        return true;
      }
      start -= 2;
    }
    return false;
  }
}
