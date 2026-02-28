/**
 * Tests for z/bitflag.ts
 */
import { describe, it, expect } from "vitest";
import { BitFlag, FLAG_END, flagSize } from "./bitflag.js";

describe("flagSize", () => {
  it("should compute correct array sizes", () => {
    expect(flagSize(1)).toBe(1);
    expect(flagSize(8)).toBe(1);
    expect(flagSize(9)).toBe(2);
    expect(flagSize(16)).toBe(2);
    expect(flagSize(17)).toBe(3);
    expect(flagSize(32)).toBe(4);
  });
});

describe("BitFlag", () => {
  it("should start empty", () => {
    const bf = new BitFlag(16);
    expect(bf.isEmpty()).toBe(true);
    expect(bf.count()).toBe(0);
  });

  it("should set and test individual flags", () => {
    const bf = new BitFlag(16);
    expect(bf.has(1)).toBe(false);

    bf.on(1);
    expect(bf.has(1)).toBe(true);
    expect(bf.has(2)).toBe(false);

    bf.on(5);
    expect(bf.has(5)).toBe(true);
    expect(bf.count()).toBe(2);
  });

  it("on() should return true only when flag changed", () => {
    const bf = new BitFlag(8);
    expect(bf.on(1)).toBe(true);
    expect(bf.on(1)).toBe(false); // already set
  });

  it("off() should clear a flag", () => {
    const bf = new BitFlag(8);
    bf.on(3);
    expect(bf.off(3)).toBe(true);
    expect(bf.has(3)).toBe(false);
    expect(bf.off(3)).toBe(false); // already clear
  });

  it("should handle FLAG_END correctly", () => {
    const bf = new BitFlag(8);
    expect(bf.has(FLAG_END)).toBe(false);
  });

  it("next() should iterate set flags", () => {
    const bf = new BitFlag(16);
    bf.on(2);
    bf.on(5);
    bf.on(9);

    expect(bf.next(1)).toBe(2);
    expect(bf.next(3)).toBe(5);
    expect(bf.next(6)).toBe(9);
    expect(bf.next(10)).toBe(FLAG_END);
  });

  it("setAll / isFull", () => {
    const bf = new BitFlag(8);
    bf.setAll();
    expect(bf.isFull()).toBe(true);
    expect(bf.isEmpty()).toBe(false);
  });

  it("wipe should clear all", () => {
    const bf = new BitFlag(8);
    bf.on(1);
    bf.on(3);
    bf.wipe();
    expect(bf.isEmpty()).toBe(true);
  });

  it("negate should toggle all bits", () => {
    const bf = new BitFlag(8);
    bf.on(1);
    bf.negate();
    expect(bf.has(1)).toBe(false);
    // all others should be set now
    expect(bf.has(2)).toBe(true);
  });

  it("copy should duplicate state", () => {
    const bf1 = new BitFlag(16);
    bf1.on(3);
    bf1.on(7);

    const bf2 = new BitFlag(16);
    bf2.copy(bf1);
    expect(bf2.has(3)).toBe(true);
    expect(bf2.has(7)).toBe(true);
    expect(bf2.count()).toBe(2);
  });

  it("clone should create independent copy", () => {
    const bf1 = new BitFlag(8);
    bf1.on(2);
    const bf2 = bf1.clone();

    bf2.on(4);
    expect(bf1.has(4)).toBe(false);
    expect(bf2.has(4)).toBe(true);
  });

  describe("set operations", () => {
    it("union", () => {
      const a = new BitFlag(8);
      a.on(1);
      a.on(3);

      const b = new BitFlag(8);
      b.on(3);
      b.on(5);

      const changed = a.union(b);
      expect(changed).toBe(true);
      expect(a.has(1)).toBe(true);
      expect(a.has(3)).toBe(true);
      expect(a.has(5)).toBe(true);
    });

    it("inter", () => {
      const a = new BitFlag(8);
      a.on(1);
      a.on(3);

      const b = new BitFlag(8);
      b.on(3);
      b.on(5);

      a.inter(b);
      expect(a.has(1)).toBe(false);
      expect(a.has(3)).toBe(true);
      expect(a.has(5)).toBe(false);
    });

    it("diff", () => {
      const a = new BitFlag(8);
      a.on(1);
      a.on(3);
      a.on(5);

      const b = new BitFlag(8);
      b.on(3);
      b.on(5);

      a.diff(b);
      expect(a.has(1)).toBe(true);
      expect(a.has(3)).toBe(false);
      expect(a.has(5)).toBe(false);
    });

    it("isInter detects common flags", () => {
      const a = new BitFlag(8);
      a.on(1);
      const b = new BitFlag(8);
      b.on(2);
      expect(a.isInter(b)).toBe(false);

      b.on(1);
      expect(a.isInter(b)).toBe(true);
    });

    it("isSubset", () => {
      const a = new BitFlag(8);
      a.on(1);
      a.on(3);
      a.on(5);

      const b = new BitFlag(8);
      b.on(1);
      b.on(3);
      expect(a.isSubset(b)).toBe(true);

      b.on(7);
      expect(a.isSubset(b)).toBe(false);
    });

    it("isEqual", () => {
      const a = new BitFlag(8);
      a.on(1);
      a.on(5);
      const b = a.clone();
      expect(a.isEqual(b)).toBe(true);

      b.on(3);
      expect(a.isEqual(b)).toBe(false);
    });
  });

  describe("multi-flag operations", () => {
    it("testAny", () => {
      const bf = new BitFlag(16);
      bf.on(3);
      expect(bf.testAny(1, 2, 3)).toBe(true);
      expect(bf.testAny(1, 2)).toBe(false);
    });

    it("testAll", () => {
      const bf = new BitFlag(16);
      bf.on(1);
      bf.on(3);
      expect(bf.testAll(1, 3)).toBe(true);
      expect(bf.testAll(1, 2, 3)).toBe(false);
    });

    it("setFlags / clearFlags", () => {
      const bf = new BitFlag(16);
      bf.setFlags(1, 3, 5);
      expect(bf.count()).toBe(3);
      bf.clearFlags(3, 5);
      expect(bf.count()).toBe(1);
      expect(bf.has(1)).toBe(true);
    });

    it("init", () => {
      const bf = new BitFlag(16);
      bf.on(1); // will be wiped
      bf.init(3, 7);
      expect(bf.has(1)).toBe(false);
      expect(bf.has(3)).toBe(true);
      expect(bf.has(7)).toBe(true);
      expect(bf.count()).toBe(2);
    });
  });

  describe("iterator", () => {
    it("should iterate over all set flags", () => {
      const bf = new BitFlag(16);
      bf.on(2);
      bf.on(5);
      bf.on(9);

      const flags = [...bf];
      expect(flags).toEqual([2, 5, 9]);
    });
  });
});
