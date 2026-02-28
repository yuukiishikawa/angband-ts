/**
 * Tests for object/desc.ts — Object description generation.
 */
import { describe, it, expect } from "vitest";
import { BitFlag } from "../z/index.js";
import type { ObjectType, ObjectKind, ObjectBase, Flavor } from "../types/index.js";
import {
  TVal,
  KindFlag,
  ObjectFlag,
  ObjectModifier,
  ObjectNotice,
  Element,
} from "../types/index.js";
import {
  nameFormat,
  objectDescName,
  objectDescBase,
  objectDescModifiers,
  objectDescInscrip,
  DescMode,
} from "./desc.js";

// ---------------------------------------------------------------------------
// Test helpers — build minimal mock objects matching the interfaces
// ---------------------------------------------------------------------------

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
  const kf = new BitFlag(KindFlag.MAX);
  if (overrides.kindFlags) {
    kf.copy(overrides.kindFlags as BitFlag);
  }
  return {
    name: "Test Longsword",
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
    kindFlags: kf,
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

function makeObj(
  kind: ObjectKind,
  overrides: Partial<ObjectType> = {},
): ObjectType {
  return {
    kind,
    ego: null,
    artifact: null,
    prev: null,
    next: null,
    known: null,
    oidx: 0 as any,
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
// nameFormat tests
// ---------------------------------------------------------------------------

describe("nameFormat", () => {
  it("should strip '&' and leading spaces", () => {
    expect(nameFormat("& Sword~", null, false)).toBe("Sword");
  });

  it("should pluralise with ~", () => {
    expect(nameFormat("& Ring~", null, true)).toBe("Rings");
  });

  it("should pluralise s/h/x words with ~es", () => {
    expect(nameFormat("& Torch~", null, true)).toBe("Torches");
    expect(nameFormat("& Box~", null, true)).toBe("Boxes");
    expect(nameFormat("& Cutlass~", null, true)).toBe("Cutlasses");
  });

  it("should handle |singular|plural| forms", () => {
    expect(nameFormat("Sta|ff|ves|", null, false)).toBe("Staff");
    expect(nameFormat("Sta|ff|ves|", null, true)).toBe("Staves");
  });

  it("should substitute # with modstr", () => {
    expect(nameFormat("& # Ring~", "Copper", false)).toBe("Copper Ring");
  });

  it("should substitute # and pluralise", () => {
    expect(nameFormat("& # Ring~", "Copper", true)).toBe("Copper Rings");
  });

  it("should handle no special characters", () => {
    expect(nameFormat("Iron Shot", null, false)).toBe("Iron Shot");
  });
});

// ---------------------------------------------------------------------------
// objectDescBase tests
// ---------------------------------------------------------------------------

describe("objectDescBase", () => {
  it("should return the kind name without formatting characters", () => {
    const kind = makeKind({ name: "& Broad Sword~" });
    expect(objectDescBase(kind)).toBe("Broad Sword");
  });

  it("should handle plain names", () => {
    const kind = makeKind({ name: "Iron Shot" });
    expect(objectDescBase(kind)).toBe("Iron Shot");
  });
});

// ---------------------------------------------------------------------------
// objectDescModifiers tests
// ---------------------------------------------------------------------------

describe("objectDescModifiers", () => {
  it("should show weapon to-hit and to-dam", () => {
    const kind = makeKind();
    const obj = makeObj(kind, { toH: 3, toD: 5 });
    const result = objectDescModifiers(obj);
    expect(result).toContain("(+3,+5)");
  });

  it("should show armor class", () => {
    const kind = makeKind({ tval: TVal.HARD_ARMOR, ac: 15 });
    const obj = makeObj(kind, { ac: 15, toA: 3 });
    const result = objectDescModifiers(obj);
    expect(result).toContain("[15,+3]");
  });

  it("should show damage dice when kind flags say so", () => {
    const kf = new BitFlag(KindFlag.MAX);
    kf.on(KindFlag.SHOW_DICE);
    const kind = makeKind({ kindFlags: kf });
    const obj = makeObj(kind, { dd: 2, ds: 5 });
    const result = objectDescModifiers(obj);
    expect(result).toContain("(2d5)");
  });

  it("should show multiplier for bows", () => {
    const kf = new BitFlag(KindFlag.MAX);
    kf.on(KindFlag.SHOW_MULT);
    const kind = makeKind({ tval: TVal.BOW, kindFlags: kf });
    const mods = new Array(ObjectModifier.MAX).fill(0);
    mods[ObjectModifier.MIGHT] = 1;
    const obj = makeObj(kind, { pval: 2, modifiers: mods });
    const result = objectDescModifiers(obj);
    expect(result).toContain("(x3)");
  });

  it("should return empty string for plain item with no bonuses", () => {
    const kind = makeKind({ tval: TVal.FOOD });
    const obj = makeObj(kind);
    expect(objectDescModifiers(obj)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// objectDescInscrip tests
// ---------------------------------------------------------------------------

describe("objectDescInscrip", () => {
  it("should return empty string for no inscription", () => {
    const kind = makeKind();
    const obj = makeObj(kind);
    expect(objectDescInscrip(obj)).toBe("");
  });

  it("should include note when present", () => {
    const kind = makeKind();
    const obj = makeObj(kind, { note: 42 as any });
    expect(objectDescInscrip(obj)).toBe("{42}");
  });

  it("should include cursed annotation", () => {
    const kind = makeKind();
    const obj = makeObj(kind, {
      curses: [{ power: 10, timeout: 0 }] as any,
    });
    expect(objectDescInscrip(obj)).toContain("cursed");
  });
});

// ---------------------------------------------------------------------------
// objectDescName tests (integration)
// ---------------------------------------------------------------------------

describe("objectDescName", () => {
  it("should produce a basic sword name with prefix", () => {
    const kind = makeKind({ name: "Test Longsword" });
    const obj = makeObj(kind);
    const result = objectDescName(obj, kind, DescMode.PREFIX);
    expect(result).toBe("a Test Longsword");
  });

  it("should produce plural name for multiple items", () => {
    const kind = makeKind({ name: "& Arrow~", tval: TVal.ARROW });
    const obj = makeObj(kind, { number: 5 });
    const result = objectDescName(obj, kind, DescMode.PREFIX);
    expect(result).toBe("5 Arrows");
  });

  it("should show singular when forced", () => {
    const kind = makeKind({ name: "& Arrow~", tval: TVal.ARROW });
    const obj = makeObj(kind, { number: 5 });
    const result = objectDescName(obj, kind, DescMode.PREFIX | DescMode.SINGULAR);
    expect(result).toBe("5 Arrow");
  });

  it("should show combat info when COMBAT mode is set", () => {
    const kf = new BitFlag(KindFlag.MAX);
    kf.on(KindFlag.SHOW_DICE);
    const kind = makeKind({ kindFlags: kf });
    const obj = makeObj(kind, {
      dd: 2,
      ds: 5,
      toH: 3,
      toD: 5,
      notice: ObjectNotice.ASSESSED,
    });
    const result = objectDescName(obj, kind, DescMode.PREFIX | DescMode.COMBAT);
    expect(result).toContain("(2d5)");
    expect(result).toContain("(+3,+5)");
  });

  it("should show 'an' for vowel-starting items", () => {
    const kind = makeKind({ name: "& Elven Cloak~", tval: TVal.CLOAK });
    const obj = makeObj(kind);
    const result = objectDescName(obj, kind, DescMode.PREFIX);
    expect(result).toBe("an Elven Cloak");
  });

  it("should handle ring with flavor", () => {
    const flavor: Flavor = {
      fidx: 1 as any,
      text: "Copper",
      tval: TVal.RING,
      sval: 1 as any,
      dAttr: 0,
      dChar: "=",
    };
    const kind = makeKind({
      name: "Resist Fire",
      tval: TVal.RING,
      flavor,
      aware: true,
    });
    const obj = makeObj(kind);
    const result = objectDescName(obj, kind, DescMode.PREFIX);
    // Aware ring: shows kind name as "of X"
    expect(result).toContain("Ring");
    expect(result).toContain("of Resist Fire");
  });

  it("should show money description", () => {
    const kind = makeKind({ name: "gold", tval: TVal.GOLD });
    const obj = makeObj(kind, { pval: 42 });
    const result = objectDescName(obj, kind, DescMode.PREFIX);
    expect(result).toBe("42 gold pieces worth of gold");
  });

  it("should handle nothing gracefully", () => {
    expect(objectDescName(null as any, null as any, DescMode.PREFIX)).toBe(
      "(nothing)",
    );
  });

  it("should capitalise when CAPITAL mode is set", () => {
    const kind = makeKind({ name: "Test Longsword" });
    const obj = makeObj(kind);
    const result = objectDescName(
      obj,
      kind,
      DescMode.PREFIX | DescMode.CAPITAL,
    );
    expect(result[0]).toBe("A");
  });

  it("should include ego name when aware and not NOEGO", () => {
    const kind = makeKind({ aware: true });
    const ego = { name: "of Slay Evil", eidx: 1 } as any;
    const obj = makeObj(kind, { ego });
    const result = objectDescName(obj, kind, DescMode.PREFIX);
    expect(result).toContain("of Slay Evil");
  });

  it("should omit ego name when NOEGO is set", () => {
    const kind = makeKind({ aware: true });
    const ego = { name: "of Slay Evil", eidx: 1 } as any;
    const obj = makeObj(kind, { ego });
    const result = objectDescName(obj, kind, DescMode.PREFIX | DescMode.NOEGO);
    expect(result).not.toContain("of Slay Evil");
  });

  it("should show artifact name when assessed", () => {
    const art = { name: "'Ringil'" } as any;
    const kind = makeKind();
    const obj = makeObj(kind, {
      artifact: art,
      notice: ObjectNotice.ASSESSED,
    });
    const result = objectDescName(obj, kind, DescMode.PREFIX);
    expect(result).toContain("'Ringil'");
    // Artifact gets "the" prefix
    expect(result).toMatch(/^the /);
  });
});
