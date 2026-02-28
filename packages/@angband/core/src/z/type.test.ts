/**
 * Tests for z/type.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  loc,
  locEq,
  locIsZero,
  locSum,
  locDiff,
  locOffset,
  randLoc,
  PointSet,
} from "./type.js";
import { RNG } from "./rand.js";

describe("Loc", () => {
  it("loc() creates a location", () => {
    const l = loc(3, 5);
    expect(l.x).toBe(3);
    expect(l.y).toBe(5);
  });

  it("locEq() tests equality", () => {
    expect(locEq(loc(1, 2), loc(1, 2))).toBe(true);
    expect(locEq(loc(1, 2), loc(1, 3))).toBe(false);
    expect(locEq(loc(1, 2), loc(2, 2))).toBe(false);
  });

  it("locIsZero() tests origin", () => {
    expect(locIsZero(loc(0, 0))).toBe(true);
    expect(locIsZero(loc(1, 0))).toBe(false);
    expect(locIsZero(loc(0, 1))).toBe(false);
  });

  it("locSum() adds vectors", () => {
    const s = locSum(loc(1, 2), loc(3, 4));
    expect(s.x).toBe(4);
    expect(s.y).toBe(6);
  });

  it("locDiff() subtracts vectors", () => {
    const d = locDiff(loc(5, 7), loc(2, 3));
    expect(d.x).toBe(3);
    expect(d.y).toBe(4);
  });

  it("locOffset() adds dx/dy", () => {
    const o = locOffset(loc(10, 20), -3, 5);
    expect(o.x).toBe(7);
    expect(o.y).toBe(25);
  });

  it("randLoc() produces locations within spread", () => {
    const rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);

    const center = loc(50, 50);
    for (let i = 0; i < 100; i++) {
      const r = randLoc(rng, center, 5, 5);
      expect(r.x).toBeGreaterThanOrEqual(45);
      expect(r.x).toBeLessThanOrEqual(55);
      expect(r.y).toBeGreaterThanOrEqual(45);
      expect(r.y).toBeLessThanOrEqual(55);
    }
  });
});

describe("PointSet", () => {
  let ps: PointSet;

  beforeEach(() => {
    ps = new PointSet();
  });

  it("starts empty", () => {
    expect(ps.length).toBe(0);
  });

  it("add and contains", () => {
    ps.add(loc(3, 5));
    expect(ps.length).toBe(1);
    expect(ps.contains(loc(3, 5))).toBe(true);
    expect(ps.contains(loc(3, 6))).toBe(false);
  });

  it("handles growth", () => {
    const small = new PointSet(2);
    small.add(loc(1, 1));
    small.add(loc(2, 2));
    small.add(loc(3, 3)); // triggers growth
    expect(small.length).toBe(3);
    expect(small.contains(loc(3, 3))).toBe(true);
  });

  it("get() retrieves by index", () => {
    ps.add(loc(10, 20));
    ps.add(loc(30, 40));
    const p = ps.get(1);
    expect(p.x).toBe(30);
    expect(p.y).toBe(40);
  });

  it("iterates all points", () => {
    ps.add(loc(1, 1));
    ps.add(loc(2, 2));
    ps.add(loc(3, 3));

    const pts = [...ps];
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ x: 1, y: 1 });
    expect(pts[2]).toEqual({ x: 3, y: 3 });
  });
});
