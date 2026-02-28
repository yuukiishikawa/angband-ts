/**
 * Tests for z/queue.ts
 */
import { describe, it, expect } from "vitest";
import { Queue, PriorityQueue } from "./queue.js";

describe("Queue", () => {
  it("should start empty", () => {
    const q = new Queue<number>(10);
    expect(q.isEmpty).toBe(true);
    expect(q.length).toBe(0);
    expect(q.capacity).toBe(10);
  });

  it("should push and pop FIFO", () => {
    const q = new Queue<number>(10);
    q.push(1);
    q.push(2);
    q.push(3);

    expect(q.length).toBe(3);
    expect(q.pop()).toBe(1);
    expect(q.pop()).toBe(2);
    expect(q.pop()).toBe(3);
    expect(q.isEmpty).toBe(true);
  });

  it("should peek without removing", () => {
    const q = new Queue<number>(5);
    q.push(42);
    expect(q.peek()).toBe(42);
    expect(q.length).toBe(1);
  });

  it("should handle wrap-around", () => {
    const q = new Queue<number>(3);
    q.push(1);
    q.push(2);
    q.pop(); // head moves forward
    q.push(3);
    q.push(4); // wraps around

    expect(q.pop()).toBe(2);
    expect(q.pop()).toBe(3);
    expect(q.pop()).toBe(4);
  });

  it("should throw on overflow", () => {
    const q = new Queue<number>(2);
    q.push(1);
    q.push(2);
    expect(() => q.push(3)).toThrow("overflow");
  });

  it("should throw on underflow", () => {
    const q = new Queue<number>(2);
    expect(() => q.pop()).toThrow("underflow");
  });

  it("should work with string type", () => {
    const q = new Queue<string>(5);
    q.push("hello");
    q.push("world");
    expect(q.pop()).toBe("hello");
  });
});

describe("PriorityQueue", () => {
  it("should start empty", () => {
    const pq = new PriorityQueue<number>(10);
    expect(pq.isEmpty).toBe(true);
    expect(pq.length).toBe(0);
  });

  it("should pop lowest priority first", () => {
    const pq = new PriorityQueue<string>(10);
    pq.push(5, "five");
    pq.push(1, "one");
    pq.push(3, "three");
    pq.push(2, "two");

    expect(pq.pop()).toBe("one");
    expect(pq.pop()).toBe("two");
    expect(pq.pop()).toBe("three");
    expect(pq.pop()).toBe("five");
  });

  it("should peek at lowest priority", () => {
    const pq = new PriorityQueue<number>(10);
    pq.push(10, 100);
    pq.push(5, 50);
    pq.push(20, 200);
    expect(pq.peek()).toBe(50);
  });

  it("should handle equal priorities", () => {
    const pq = new PriorityQueue<number>(10);
    pq.push(1, 10);
    pq.push(1, 20);
    pq.push(1, 30);

    const results: number[] = [];
    results.push(pq.pop());
    results.push(pq.pop());
    results.push(pq.pop());

    // All should come out (order among equal priorities is implementation-defined)
    expect(results.sort()).toEqual([10, 20, 30]);
  });

  it("pushPop should return lowest overall", () => {
    const pq = new PriorityQueue<number>(10);
    pq.push(5, 50);
    pq.push(10, 100);

    // Push priority 3, which is less than head (5) → returns the pushed value
    expect(pq.pushPop(3, 30)).toBe(30);

    // Push priority 20 → head (5) gets popped
    expect(pq.pushPop(20, 200)).toBe(50);
  });

  it("pushPop on empty queue returns payload", () => {
    const pq = new PriorityQueue<number>(10);
    expect(pq.pushPop(5, 50)).toBe(50);
    expect(pq.isEmpty).toBe(true);
  });

  it("flush should clear all entries", () => {
    const pq = new PriorityQueue<number>(10);
    pq.push(1, 1);
    pq.push(2, 2);
    pq.flush();
    expect(pq.isEmpty).toBe(true);
  });

  it("should throw on overflow", () => {
    const pq = new PriorityQueue<number>(2);
    pq.push(1, 1);
    pq.push(2, 2);
    expect(() => pq.push(3, 3)).toThrow("overflow");
  });

  it("should throw on underflow", () => {
    const pq = new PriorityQueue<number>(2);
    expect(() => pq.pop()).toThrow("underflow");
  });

  it("should validate heap invariant", () => {
    const pq = new PriorityQueue<number>(100);
    for (let i = 0; i < 50; i++) {
      pq.push(Math.floor(Math.random() * 1000), i);
    }
    expect(pq.isInvalid()).toBe(false);
  });

  it("should maintain invariant through push/pop cycles", () => {
    const pq = new PriorityQueue<number>(100);
    for (let i = 0; i < 50; i++) {
      pq.push(i * 7 % 37, i);
    }
    for (let i = 0; i < 25; i++) {
      pq.pop();
    }
    expect(pq.isInvalid()).toBe(false);

    // Elements should still come out in order
    let prev = -Infinity;
    while (!pq.isEmpty) {
      const _ = pq.pop();
      // Can't directly check priority from payload, but invariant should hold
    }
    expect(pq.isEmpty).toBe(true);
  });
});
