/**
 * Tests for object/pile.ts — Object pile management (stacking, floor piles).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { BitFlag } from "../z/index.js";
import type { ObjectType, ObjectKind, ObjectBase } from "../types/index.js";
import {
  TVal,
  KindFlag,
  ObjectFlag,
  ObjectModifier,
  Element,
} from "../types/index.js";
import {
  createPile,
  pileAdd,
  pileAddEnd,
  pileRemove,
  pileContains,
  pileCount,
  canStack,
  pileMerge,
  pileIterator,
  pileLastItem,
} from "./pile.js";
import type { ObjectPile } from "./pile.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let nextOidx = 1;

function makeBase(overrides: Partial<ObjectBase> = {}): ObjectBase {
  return {
    name: "sword",
    tval: TVal.SWORD,
    attr: 0,
    flags: new BitFlag(ObjectFlag.MAX),
    kindFlags: new BitFlag(KindFlag.MAX),
    elInfo: [],
    breakPerc: 0,
    maxStack: 40,
    numSvals: 1,
    ...overrides,
  };
}

function makeKind(overrides: Partial<ObjectKind> = {}): ObjectKind {
  return {
    name: "Test Sword",
    text: "",
    base: makeBase(),
    kidx: 1 as any,
    tval: TVal.SWORD,
    sval: 1 as any,
    pval: { base: 0, dice: 0, sides: 0, mBonus: 0 } as any,
    toH: { base: 0, dice: 0, sides: 0, mBonus: 0 } as any,
    toD: { base: 0, dice: 0, sides: 0, mBonus: 0 } as any,
    toA: { base: 0, dice: 0, sides: 0, mBonus: 0 } as any,
    ac: 0,
    dd: 2,
    ds: 5,
    weight: 110,
    cost: 350,
    flags: new BitFlag(ObjectFlag.MAX),
    kindFlags: new BitFlag(KindFlag.MAX),
    modifiers: [],
    elInfo: [],
    brands: null,
    slays: null,
    curses: null,
    dAttr: 0,
    dChar: "|",
    allocProb: 0,
    allocMin: 0,
    allocMax: 0,
    level: 0,
    activation: null,
    effect: null,
    power: 0,
    effectMsg: null,
    visMsg: null,
    time: { base: 0, dice: 0, sides: 0, mBonus: 0 } as any,
    charge: { base: 0, dice: 0, sides: 0, mBonus: 0 } as any,
    genMultProb: 0,
    stackSize: { base: 1, dice: 0, sides: 0, mBonus: 0 } as any,
    flavor: null,
    noteAware: 0,
    noteUnaware: 0,
    aware: true,
    tried: false,
    ignore: 0,
    everseen: false,
    ...overrides,
  } as ObjectKind;
}

/** Shared kind reference for stacking tests. */
const sharedKind = makeKind();

function makeObj(
  kind: ObjectKind = sharedKind,
  overrides: Partial<ObjectType> = {},
): ObjectType {
  return {
    kind,
    ego: null,
    artifact: null,
    prev: null,
    next: null,
    known: null,
    oidx: (nextOidx++) as any,
    grid: { x: 0, y: 0 },
    tval: kind.tval,
    sval: kind.sval,
    pval: 0,
    weight: kind.weight,
    dd: kind.dd,
    ds: kind.ds,
    ac: kind.ac,
    toA: 0,
    toH: 0,
    toD: 0,
    flags: new BitFlag(ObjectFlag.MAX),
    modifiers: new Array(ObjectModifier.MAX).fill(0),
    elInfo: [],
    brands: null,
    slays: null,
    curses: null,
    effect: null,
    effectMsg: null,
    activation: null,
    time: { base: 0, dice: 0, sides: 0, mBonus: 0 } as any,
    timeout: 0,
    number: 1,
    notice: 0,
    heldMIdx: 0,
    mimickingMIdx: 0,
    origin: 0 as any,
    originDepth: 0,
    originRace: null,
    note: 0,
    ...overrides,
  } as ObjectType;
}

// ---------------------------------------------------------------------------
// createPile tests
// ---------------------------------------------------------------------------

describe("createPile", () => {
  it("should create an empty pile", () => {
    const pile = createPile();
    expect(pile.head).toBeNull();
    expect(pile.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// pileAdd / pileAddEnd tests
// ---------------------------------------------------------------------------

describe("pileAdd", () => {
  it("should add an object to the front of the pile", () => {
    const pile = createPile();
    const obj1 = makeObj();
    const obj2 = makeObj();

    pileAdd(pile, obj1);
    expect(pile.head).toBe(obj1);
    expect(pileCount(pile)).toBe(1);

    pileAdd(pile, obj2);
    expect(pile.head).toBe(obj2);
    expect(obj2.next).toBe(obj1);
    expect(obj1.prev).toBe(obj2);
    expect(pileCount(pile)).toBe(2);
  });

  it("should set prev/next links correctly", () => {
    const pile = createPile();
    const obj1 = makeObj();
    const obj2 = makeObj();
    const obj3 = makeObj();

    pileAdd(pile, obj1);
    pileAdd(pile, obj2);
    pileAdd(pile, obj3);

    // Order: obj3 -> obj2 -> obj1
    expect(pile.head).toBe(obj3);
    expect(obj3.prev).toBeNull();
    expect(obj3.next).toBe(obj2);
    expect(obj2.prev).toBe(obj3);
    expect(obj2.next).toBe(obj1);
    expect(obj1.prev).toBe(obj2);
    expect(obj1.next).toBeNull();
  });
});

describe("pileAddEnd", () => {
  it("should add an object to the end of the pile", () => {
    const pile = createPile();
    const obj1 = makeObj();
    const obj2 = makeObj();

    pileAddEnd(pile, obj1);
    expect(pile.head).toBe(obj1);

    pileAddEnd(pile, obj2);
    expect(pile.head).toBe(obj1);
    expect(obj1.next).toBe(obj2);
    expect(obj2.prev).toBe(obj1);
  });
});

// ---------------------------------------------------------------------------
// pileRemove tests
// ---------------------------------------------------------------------------

describe("pileRemove", () => {
  it("should remove an object from the pile", () => {
    const pile = createPile();
    const obj = makeObj();
    pileAdd(pile, obj);

    expect(pileRemove(pile, obj)).toBe(true);
    expect(pile.head).toBeNull();
    expect(pileCount(pile)).toBe(0);
  });

  it("should return false for object not in pile", () => {
    const pile = createPile();
    const obj = makeObj();
    expect(pileRemove(pile, obj)).toBe(false);
  });

  it("should remove from middle of pile", () => {
    const pile = createPile();
    const obj1 = makeObj();
    const obj2 = makeObj();
    const obj3 = makeObj();

    pileAdd(pile, obj1);
    pileAdd(pile, obj2);
    pileAdd(pile, obj3);

    // Order: obj3 -> obj2 -> obj1
    pileRemove(pile, obj2);

    expect(obj3.next).toBe(obj1);
    expect(obj1.prev).toBe(obj3);
    expect(pileCount(pile)).toBe(2);
  });

  it("should remove head of pile", () => {
    const pile = createPile();
    const obj1 = makeObj();
    const obj2 = makeObj();

    pileAdd(pile, obj1);
    pileAdd(pile, obj2);

    // Order: obj2 -> obj1
    pileRemove(pile, obj2);
    expect(pile.head).toBe(obj1);
    expect(obj1.prev).toBeNull();
  });

  it("should remove tail of pile", () => {
    const pile = createPile();
    const obj1 = makeObj();
    const obj2 = makeObj();

    pileAdd(pile, obj1);
    pileAdd(pile, obj2);

    // Order: obj2 -> obj1
    pileRemove(pile, obj1);
    expect(obj2.next).toBeNull();
    expect(pileCount(pile)).toBe(1);
  });

  it("should clear prev/next on removed object", () => {
    const pile = createPile();
    const obj1 = makeObj();
    const obj2 = makeObj();
    const obj3 = makeObj();

    pileAdd(pile, obj1);
    pileAdd(pile, obj2);
    pileAdd(pile, obj3);

    pileRemove(pile, obj2);
    expect(obj2.prev).toBeNull();
    expect(obj2.next).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// pileContains tests
// ---------------------------------------------------------------------------

describe("pileContains", () => {
  it("should find objects in pile", () => {
    const pile = createPile();
    const obj1 = makeObj();
    const obj2 = makeObj();

    pileAdd(pile, obj1);
    pileAdd(pile, obj2);

    expect(pileContains(pile, obj1)).toBe(true);
    expect(pileContains(pile, obj2)).toBe(true);
  });

  it("should not find objects not in pile", () => {
    const pile = createPile();
    const obj = makeObj();
    expect(pileContains(pile, obj)).toBe(false);
  });

  it("should not find removed objects", () => {
    const pile = createPile();
    const obj = makeObj();
    pileAdd(pile, obj);
    pileRemove(pile, obj);
    expect(pileContains(pile, obj)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pileCount tests
// ---------------------------------------------------------------------------

describe("pileCount", () => {
  it("should be 0 for empty pile", () => {
    expect(pileCount(createPile())).toBe(0);
  });

  it("should track additions and removals", () => {
    const pile = createPile();
    const obj1 = makeObj();
    const obj2 = makeObj();

    pileAdd(pile, obj1);
    expect(pileCount(pile)).toBe(1);

    pileAdd(pile, obj2);
    expect(pileCount(pile)).toBe(2);

    pileRemove(pile, obj1);
    expect(pileCount(pile)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// canStack tests
// ---------------------------------------------------------------------------

describe("canStack", () => {
  it("should allow stacking identical non-artifact items with same kind", () => {
    const kind = makeKind({ tval: TVal.POTION, name: "Healing" });
    const a = makeObj(kind);
    const b = makeObj(kind);
    expect(canStack(a, b)).toBe(true);
  });

  it("should not stack different kinds", () => {
    const kindA = makeKind({ tval: TVal.POTION, name: "Healing", kidx: 1 as any });
    const kindB = makeKind({ tval: TVal.POTION, name: "Speed", kidx: 2 as any });
    const a = makeObj(kindA);
    const b = makeObj(kindB);
    expect(canStack(a, b)).toBe(false);
  });

  it("should not stack artifacts", () => {
    const kind = makeKind();
    const a = makeObj(kind, { artifact: { name: "Ringil" } as any });
    const b = makeObj(kind);
    expect(canStack(a, b)).toBe(false);
  });

  it("should not stack object with itself", () => {
    const kind = makeKind();
    const a = makeObj(kind);
    expect(canStack(a, a)).toBe(false);
  });

  it("should not stack chests", () => {
    const kind = makeKind({ tval: TVal.CHEST, name: "Chest" });
    const a = makeObj(kind);
    const b = makeObj(kind);
    expect(canStack(a, b)).toBe(false);
  });

  it("should not stack weapons with different bonuses", () => {
    const kind = makeKind({ tval: TVal.SWORD });
    const a = makeObj(kind, { toH: 3, toD: 5 });
    const b = makeObj(kind, { toH: 3, toD: 6 });
    expect(canStack(a, b)).toBe(false);
  });

  it("should stack weapons with identical bonuses", () => {
    const kind = makeKind({ tval: TVal.SWORD });
    const a = makeObj(kind, { toH: 3, toD: 5 });
    const b = makeObj(kind, { toH: 3, toD: 5 });
    expect(canStack(a, b)).toBe(true);
  });

  it("should not stack items with different flags", () => {
    const kind = makeKind({ tval: TVal.POTION });
    const flagsA = new BitFlag(ObjectFlag.MAX);
    flagsA.on(ObjectFlag.REGEN);
    const flagsB = new BitFlag(ObjectFlag.MAX);
    const a = makeObj(kind, { flags: flagsA });
    const b = makeObj(kind, { flags: flagsB });
    expect(canStack(a, b)).toBe(false);
  });

  it("should not stack items with different inscriptions", () => {
    const kind = makeKind({ tval: TVal.POTION });
    const a = makeObj(kind, { note: 1 as any });
    const b = makeObj(kind, { note: 2 as any });
    expect(canStack(a, b)).toBe(false);
  });

  it("should stack items when one has no inscription", () => {
    const kind = makeKind({ tval: TVal.POTION });
    const a = makeObj(kind, { note: 1 as any });
    const b = makeObj(kind, { note: 0 as any });
    expect(canStack(a, b)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// pileMerge tests
// ---------------------------------------------------------------------------

describe("pileMerge", () => {
  it("should merge stackable items", () => {
    const kind = makeKind({ tval: TVal.POTION, name: "Healing" });
    const pile = createPile();
    const existing = makeObj(kind, { number: 3 });
    pileAdd(pile, existing);

    const incoming = makeObj(kind, { number: 2 });
    expect(pileMerge(pile, incoming)).toBe(true);
    expect(existing.number).toBe(5);
  });

  it("should respect max stack size", () => {
    const base = makeBase({ maxStack: 5 });
    const kind = makeKind({ tval: TVal.POTION, name: "Healing", base });
    const pile = createPile();
    const existing = makeObj(kind, { number: 4 });
    pileAdd(pile, existing);

    const incoming = makeObj(kind, { number: 3 });
    expect(pileMerge(pile, incoming)).toBe(true);
    expect(existing.number).toBe(5); // capped at maxStack
  });

  it("should not merge non-stackable items", () => {
    const kindA = makeKind({ tval: TVal.POTION, name: "Healing", kidx: 1 as any });
    const kindB = makeKind({ tval: TVal.POTION, name: "Speed", kidx: 2 as any });
    const pile = createPile();
    pileAdd(pile, makeObj(kindA));

    const incoming = makeObj(kindB);
    expect(pileMerge(pile, incoming)).toBe(false);
  });

  it("should return false on empty pile", () => {
    const pile = createPile();
    const kind = makeKind({ tval: TVal.POTION });
    expect(pileMerge(pile, makeObj(kind))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pileIterator tests
// ---------------------------------------------------------------------------

describe("pileIterator", () => {
  it("should iterate over all items in order", () => {
    const pile = createPile();
    const obj1 = makeObj();
    const obj2 = makeObj();
    const obj3 = makeObj();

    // Add in order: obj1 first, then obj2 at end, then obj3 at end
    pileAdd(pile, obj1);
    pileAddEnd(pile, obj2);
    pileAddEnd(pile, obj3);

    const items = [...pileIterator(pile)];
    expect(items).toHaveLength(3);
    expect(items[0]).toBe(obj1);
    expect(items[1]).toBe(obj2);
    expect(items[2]).toBe(obj3);
  });

  it("should yield nothing for empty pile", () => {
    const pile = createPile();
    const items = [...pileIterator(pile)];
    expect(items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// pileLastItem tests
// ---------------------------------------------------------------------------

describe("pileLastItem", () => {
  it("should return null for empty pile", () => {
    expect(pileLastItem(createPile())).toBeNull();
  });

  it("should return last item", () => {
    const pile = createPile();
    const obj1 = makeObj();
    const obj2 = makeObj();
    const obj3 = makeObj();

    pileAddEnd(pile, obj1);
    pileAddEnd(pile, obj2);
    pileAddEnd(pile, obj3);

    expect(pileLastItem(pile)).toBe(obj3);
  });

  it("should return sole item when pile has one element", () => {
    const pile = createPile();
    const obj = makeObj();
    pileAdd(pile, obj);
    expect(pileLastItem(pile)).toBe(obj);
  });
});
