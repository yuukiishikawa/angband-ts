/**
 * Tests for z/quark.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import { QuarkStore } from "./quark.js";

describe("QuarkStore", () => {
  let store: QuarkStore;

  beforeEach(() => {
    store = new QuarkStore();
  });

  it("should start empty (count=0)", () => {
    expect(store.count).toBe(0);
  });

  it("should add and retrieve strings", () => {
    const q = store.add("hello");
    expect(q).toBeGreaterThan(0);
    expect(store.str(q)).toBe("hello");
  });

  it("should return same id for same string", () => {
    const q1 = store.add("test");
    const q2 = store.add("test");
    expect(q1).toBe(q2);
  });

  it("should return different ids for different strings", () => {
    const q1 = store.add("alpha");
    const q2 = store.add("beta");
    expect(q1).not.toBe(q2);
  });

  it("should return null for invalid quark", () => {
    expect(store.str(999)).toBeNull();
  });

  it("should count correctly", () => {
    store.add("a");
    store.add("b");
    store.add("a"); // duplicate
    expect(store.count).toBe(2);
  });

  it("should reset correctly", () => {
    store.add("test");
    store.reset();
    expect(store.count).toBe(0);
    expect(store.str(1)).toBeNull();
  });

  it("should handle many quarks", () => {
    const ids: number[] = [];
    for (let i = 0; i < 100; i++) {
      ids.push(store.add(`quark_${i}`));
    }
    expect(store.count).toBe(100);
    for (let i = 0; i < 100; i++) {
      expect(store.str(ids[i]!)).toBe(`quark_${i}`);
    }
  });
});
