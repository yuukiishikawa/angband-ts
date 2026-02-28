/**
 * Tests for object/make.ts — Object generation and creation.
 */
import { describe, it, expect } from "vitest";
import { BitFlag, RNG, randomValue, Aspect, randcalc } from "../z/index.js";
import {
  TVal,
  ObjectFlag,
  ObjectModifier,
  Element,
  KindFlag,
  ObjectOrigin,
} from "../types/index.js";
import type {
  ObjectType,
  ObjectKind,
  ObjectBase,
  EgoItem,
  ElementInfo,
  PossItem,
} from "../types/index.js";
import {
  kindIsGood,
  pickObjectKind,
  createObjectFromKind,
  applyMagic,
  makeGold,
} from "./make.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeElementInfo(resLevel = 0): ElementInfo {
  return { resLevel, flags: new BitFlag(8) };
}

function makeObjectBase(tval: TVal, overrides: Partial<ObjectBase> = {}): ObjectBase {
  return {
    name: "test base",
    tval,
    attr: 0,
    flags: new BitFlag(ObjectFlag.MAX),
    kindFlags: new BitFlag(KindFlag.MAX),
    elInfo: Array.from({ length: Element.MAX }, () => makeElementInfo()),
    breakPerc: 0,
    maxStack: 40,
    numSvals: 1,
    ...overrides,
  };
}

function makeObjectKind(tval: TVal, overrides: Partial<ObjectKind> = {}): ObjectKind {
  const base = makeObjectBase(tval);
  return {
    name: "test item",
    text: "",
    base,
    kidx: 0 as any,
    tval,
    sval: 0 as any,
    pval: randomValue(),
    toH: randomValue(),
    toD: randomValue(),
    toA: randomValue(),
    ac: 0,
    dd: 1,
    ds: 4,
    weight: 50,
    cost: 100,
    flags: new BitFlag(ObjectFlag.MAX),
    kindFlags: new BitFlag(KindFlag.MAX),
    modifiers: Array.from({ length: ObjectModifier.MAX }, () => randomValue()),
    elInfo: Array.from({ length: Element.MAX }, () => makeElementInfo()),
    brands: null,
    slays: null,
    curses: null,
    dAttr: 0,
    dChar: "|",
    allocProb: 20,
    allocMin: 0,
    allocMax: 100,
    level: 5,
    activation: null,
    effect: null,
    power: 0,
    effectMsg: null,
    visMsg: null,
    time: randomValue(),
    charge: randomValue(),
    genMultProb: 0,
    stackSize: randomValue(1),
    flavor: null,
    noteAware: 0 as any,
    noteUnaware: 0 as any,
    aware: false,
    tried: false,
    ignore: 0,
    everseen: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: kindIsGood
// ---------------------------------------------------------------------------

describe("kindIsGood", () => {
  it("should return true for undamaged armor", () => {
    const kind = makeObjectKind(TVal.HARD_ARMOR, { toA: randomValue(3) });
    expect(kindIsGood(kind)).toBe(true);
  });

  it("should return false for damaged armor (negative toA base)", () => {
    const kind = makeObjectKind(TVal.SOFT_ARMOR, { toA: randomValue(-2) });
    expect(kindIsGood(kind)).toBe(false);
  });

  it("should return true for undamaged weapon", () => {
    const kind = makeObjectKind(TVal.SWORD, {
      toH: randomValue(0),
      toD: randomValue(0),
    });
    expect(kindIsGood(kind)).toBe(true);
  });

  it("should return false for damaged weapon (negative toH)", () => {
    const kind = makeObjectKind(TVal.SWORD, {
      toH: randomValue(-1),
      toD: randomValue(0),
    });
    expect(kindIsGood(kind)).toBe(false);
  });

  it("should return true for arrows and bolts", () => {
    expect(kindIsGood(makeObjectKind(TVal.ARROW))).toBe(true);
    expect(kindIsGood(makeObjectKind(TVal.BOLT))).toBe(true);
  });

  it("should return true for kinds with GOOD kind flag", () => {
    const kindFlags = new BitFlag(KindFlag.MAX);
    kindFlags.on(KindFlag.GOOD);
    const kind = makeObjectKind(TVal.POTION, { kindFlags });
    expect(kindIsGood(kind)).toBe(true);
  });

  it("should return false for generic potions without GOOD flag", () => {
    const kind = makeObjectKind(TVal.POTION);
    expect(kindIsGood(kind)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: pickObjectKind
// ---------------------------------------------------------------------------

describe("pickObjectKind", () => {
  it("should pick a kind when there are valid candidates", () => {
    const rng = new RNG();
    rng.stateInit(12345);
    rng.quick = false;

    const kinds = [
      makeObjectKind(TVal.SWORD, { allocProb: 50, allocMin: 0, allocMax: 100 }),
      makeObjectKind(TVal.POTION, { allocProb: 50, allocMin: 0, allocMax: 100 }),
    ];

    const result = pickObjectKind(kinds, 10, null, rng);
    expect(result).not.toBeNull();
    expect(kinds).toContain(result);
  });

  it("should filter by tval when specified", () => {
    const rng = new RNG();
    rng.stateInit(12345);
    rng.quick = false;

    const kinds = [
      makeObjectKind(TVal.SWORD, { allocProb: 50, allocMin: 0, allocMax: 100 }),
      makeObjectKind(TVal.POTION, { allocProb: 50, allocMin: 0, allocMax: 100 }),
    ];

    // Run multiple times to verify we always get potions
    for (let i = 0; i < 10; i++) {
      const result = pickObjectKind(kinds, 10, TVal.POTION, rng);
      expect(result).not.toBeNull();
      expect(result!.tval).toBe(TVal.POTION);
    }
  });

  it("should return null when no kinds match", () => {
    const rng = new RNG();
    rng.stateInit(12345);
    rng.quick = false;

    const kinds = [
      makeObjectKind(TVal.SWORD, { allocProb: 0 }),
    ];

    const result = pickObjectKind(kinds, 10, null, rng);
    expect(result).toBeNull();
  });

  it("should respect depth limits", () => {
    const rng = new RNG();
    rng.stateInit(12345);
    rng.quick = false;

    const kinds = [
      makeObjectKind(TVal.SWORD, { allocProb: 100, allocMin: 50, allocMax: 100 }),
    ];

    // At depth 5, this should usually not be available (min=50)
    // But the level boost might kick in; let's test with depth 0
    const result = pickObjectKind(kinds, 0, null, rng);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: createObjectFromKind
// ---------------------------------------------------------------------------

describe("createObjectFromKind", () => {
  it("should create an object matching the kind template", () => {
    const rng = new RNG();
    rng.stateInit(42);
    rng.quick = false;

    const kind = makeObjectKind(TVal.SWORD, {
      name: "Test Sword",
      dd: 2,
      ds: 6,
      weight: 80,
      ac: 0,
    });

    const obj = createObjectFromKind(kind, rng);

    expect(obj.kind).toBe(kind);
    expect(obj.tval).toBe(TVal.SWORD);
    expect(obj.sval).toBe(kind.sval);
    expect(obj.dd).toBe(2);
    expect(obj.ds).toBe(6);
    expect(obj.weight).toBe(80);
    expect(obj.number).toBe(1);
    expect(obj.ego).toBeNull();
    expect(obj.artifact).toBeNull();
  });

  it("should copy base flags to the object", () => {
    const rng = new RNG();
    rng.stateInit(42);
    rng.quick = false;

    const baseFlags = new BitFlag(ObjectFlag.MAX);
    baseFlags.on(ObjectFlag.SEE_INVIS);
    const base = makeObjectBase(TVal.HELM, { flags: baseFlags });

    const kindFlags = new BitFlag(ObjectFlag.MAX);
    kindFlags.on(ObjectFlag.REGEN);
    const kind = makeObjectKind(TVal.HELM, { base, flags: kindFlags });

    const obj = createObjectFromKind(kind, rng);

    expect(obj.flags.has(ObjectFlag.SEE_INVIS)).toBe(true);
    expect(obj.flags.has(ObjectFlag.REGEN)).toBe(true);
  });

  it("should copy element info from kind", () => {
    const rng = new RNG();
    rng.stateInit(42);
    rng.quick = false;

    const elInfo = Array.from({ length: Element.MAX }, () => makeElementInfo());
    elInfo[Element.FIRE] = makeElementInfo(1);

    const kind = makeObjectKind(TVal.SOFT_ARMOR, { elInfo });
    const obj = createObjectFromKind(kind, rng);

    expect(obj.elInfo[Element.FIRE]!.resLevel).toBe(1);
    expect(obj.elInfo[Element.COLD]!.resLevel).toBe(0);
  });

  it("should set fuel timeout for BURNS_OUT light", () => {
    const rng = new RNG();
    rng.stateInit(42);
    rng.quick = false;

    const flags = new BitFlag(ObjectFlag.MAX);
    flags.on(ObjectFlag.BURNS_OUT);
    const kind = makeObjectKind(TVal.LIGHT, { flags });

    const obj = createObjectFromKind(kind, rng);
    expect(obj.timeout).toBe(5000); // FUEL_TORCH
  });

  it("should set fuel timeout for TAKES_FUEL light", () => {
    const rng = new RNG();
    rng.stateInit(42);
    rng.quick = false;

    const flags = new BitFlag(ObjectFlag.MAX);
    flags.on(ObjectFlag.TAKES_FUEL);
    const kind = makeObjectKind(TVal.LIGHT, { flags });

    const obj = createObjectFromKind(kind, rng);
    expect(obj.timeout).toBe(15000); // DEFAULT_LAMP
  });
});

// ---------------------------------------------------------------------------
// Tests: applyMagic
// ---------------------------------------------------------------------------

describe("applyMagic", () => {
  it("should enhance weapon to-hit and to-damage for good items", () => {
    const rng = new RNG();
    rng.stateInit(12345);
    rng.quick = false;

    const kind = makeObjectKind(TVal.SWORD, {
      dd: 2,
      ds: 6,
      toH: randomValue(0),
      toD: randomValue(0),
    });
    const obj = createObjectFromKind(kind, rng);

    const origToH = obj.toH;
    const origToD = obj.toD;

    applyMagic(obj, 30, true, false, rng);

    // Good weapons should get bonuses
    expect(obj.toH).toBeGreaterThanOrEqual(origToH);
    expect(obj.toD).toBeGreaterThanOrEqual(origToD);
  });

  it("should enhance armor to-ac for good items", () => {
    const rng = new RNG();
    rng.stateInit(12345);
    rng.quick = false;

    const kind = makeObjectKind(TVal.HARD_ARMOR, {
      ac: 10,
      toA: randomValue(0),
    });
    const obj = createObjectFromKind(kind, rng);

    const origToA = obj.toA;

    applyMagic(obj, 30, true, false, rng);

    expect(obj.toA).toBeGreaterThanOrEqual(origToA);
  });

  it("should not enhance potions", () => {
    const rng = new RNG();
    rng.stateInit(12345);
    rng.quick = false;

    const kind = makeObjectKind(TVal.POTION);
    const obj = createObjectFromKind(kind, rng);

    const origToH = obj.toH;
    const origToD = obj.toD;
    const origToA = obj.toA;

    applyMagic(obj, 30, true, false, rng);

    expect(obj.toH).toBe(origToH);
    expect(obj.toD).toBe(origToD);
    expect(obj.toA).toBe(origToA);
  });
});

// ---------------------------------------------------------------------------
// Tests: makeGold
// ---------------------------------------------------------------------------

describe("makeGold", () => {
  it("should create a gold object with positive pval", () => {
    const rng = new RNG();
    rng.stateInit(42);
    rng.quick = false;

    const goldKind = makeObjectKind(TVal.GOLD, {
      name: "gold",
    });

    const gold = makeGold(10, rng, goldKind);

    expect(gold.tval).toBe(TVal.GOLD);
    expect(gold.pval).toBeGreaterThan(0);
  });

  it("should produce higher values at deeper levels", () => {
    const rng = new RNG();
    rng.stateInit(100);
    rng.quick = false;

    const goldKind = makeObjectKind(TVal.GOLD);

    // Run several trials and compare averages
    let avgShallow = 0;
    let avgDeep = 0;
    const trials = 50;

    for (let i = 0; i < trials; i++) {
      avgShallow += makeGold(1, rng, goldKind).pval;
      avgDeep += makeGold(50, rng, goldKind).pval;
    }

    avgShallow /= trials;
    avgDeep /= trials;

    expect(avgDeep).toBeGreaterThan(avgShallow);
  });
});
