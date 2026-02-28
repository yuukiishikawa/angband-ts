/**
 * Tests for object/power.ts — Object power rating calculations.
 */
import { describe, it, expect } from "vitest";
import { BitFlag, RNG, randomValue } from "../z/index.js";
import {
  TVal,
  ObjectFlag,
  ObjectModifier,
  Element,
  KindFlag,
  ObjPropertyType,
} from "../types/index.js";
import type {
  ObjectType,
  ObjectKind,
  ObjectBase,
  Brand,
  Slay,
  ObjProperty,
  ElementInfo,
} from "../types/index.js";
import {
  DAMAGE_POWER,
  TO_HIT_POWER,
  TO_AC_POWER,
  BASE_AC_POWER,
  BASE_JEWELRY_POWER,
  BASE_ARMOUR_POWER,
  INHIBIT_POWER,
  INHIBIT_AC,
  HIGH_TO_AC,
  VERYHIGH_TO_AC,
  combatPower,
  armorPower,
  slayPower,
  brandPower,
  slayBrandPower,
  modifierPower,
  calculateObjectPower,
} from "./power.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeElementInfo(resLevel = 0): ElementInfo {
  return { resLevel, flags: new BitFlag(8) };
}

function makeTestObject(overrides: Partial<ObjectType> = {}): ObjectType {
  return {
    kind: null,
    ego: null,
    artifact: null,
    prev: null,
    next: null,
    known: null,
    oidx: 0 as any,
    grid: { x: 0, y: 0 },
    tval: TVal.NULL,
    sval: 0 as any,
    pval: 0,
    weight: 0,
    dd: 0,
    ds: 0,
    ac: 0,
    toA: 0,
    toH: 0,
    toD: 0,
    flags: new BitFlag(ObjectFlag.MAX),
    modifiers: new Array(ObjectModifier.MAX).fill(0),
    elInfo: Array.from({ length: Element.MAX }, () => makeElementInfo()),
    brands: null,
    slays: null,
    curses: null,
    effect: null,
    effectMsg: null,
    activation: null,
    time: randomValue(),
    timeout: 0,
    number: 1,
    notice: 0,
    heldMIdx: 0,
    mimickingMIdx: 0,
    origin: 0 as any,
    originDepth: 0,
    originRace: null,
    note: 0 as any,
    ...overrides,
  } as ObjectType;
}

// ---------------------------------------------------------------------------
// Tests: combatPower
// ---------------------------------------------------------------------------

describe("combatPower", () => {
  it("should return 0 for no bonuses and no dice", () => {
    expect(combatPower(0, 0, 0, 0)).toBe(0);
  });

  it("should add to-hit power", () => {
    const p = combatPower(10, 0, 0, 0);
    expect(p).toBe(Math.floor((10 * TO_HIT_POWER) / 2));
  });

  it("should add to-damage power", () => {
    const p = combatPower(0, 10, 0, 0);
    expect(p).toBe(Math.floor((10 * DAMAGE_POWER) / 2));
  });

  it("should add damage dice power", () => {
    const p = combatPower(0, 0, 2, 6);
    expect(p).toBe(Math.floor((2 * 7 * DAMAGE_POWER) / 4));
  });

  it("should combine all components", () => {
    const p = combatPower(5, 5, 2, 6);
    const expected =
      Math.floor((5 * TO_HIT_POWER) / 2) +
      Math.floor((5 * DAMAGE_POWER) / 2) +
      Math.floor((2 * 7 * DAMAGE_POWER) / 4);
    expect(p).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Tests: armorPower
// ---------------------------------------------------------------------------

describe("armorPower", () => {
  it("should return 0 for toA of 0", () => {
    expect(armorPower(0)).toBe(0);
  });

  it("should scale linearly for moderate values", () => {
    const p = armorPower(10);
    expect(p).toBe(Math.floor((10 * TO_AC_POWER) / 2));
  });

  it("should add extra power above HIGH_TO_AC threshold", () => {
    const toA = HIGH_TO_AC + 2;
    const base = Math.floor((toA * TO_AC_POWER) / 2);
    const highExtra = (toA - (HIGH_TO_AC - 1)) * TO_AC_POWER;
    expect(armorPower(toA)).toBe(base + highExtra);
  });

  it("should add more extra power above VERYHIGH_TO_AC threshold", () => {
    const toA = VERYHIGH_TO_AC + 2;
    const base = Math.floor((toA * TO_AC_POWER) / 2);
    const highExtra = (toA - (HIGH_TO_AC - 1)) * TO_AC_POWER;
    const vhighExtra = (toA - (VERYHIGH_TO_AC - 1)) * TO_AC_POWER * 2;
    expect(armorPower(toA)).toBe(base + highExtra + vhighExtra);
  });

  it("should add INHIBIT_POWER at INHIBIT_AC", () => {
    const p = armorPower(INHIBIT_AC);
    expect(p).toBeGreaterThanOrEqual(INHIBIT_POWER);
  });
});

// ---------------------------------------------------------------------------
// Tests: slayPower / brandPower
// ---------------------------------------------------------------------------

describe("slayPower", () => {
  it("should return 0 for empty array", () => {
    expect(slayPower([])).toBe(0);
  });

  it("should sum slay power values", () => {
    const slays: Slay[] = [
      { code: "S1", name: "Slay Evil", base: "", meleeVerb: "", rangeVerb: "", raceFlag: 0, multiplier: 200, oMultiplier: 200, power: 20 },
      { code: "S2", name: "Slay Undead", base: "", meleeVerb: "", rangeVerb: "", raceFlag: 0, multiplier: 300, oMultiplier: 300, power: 30 },
    ];
    expect(slayPower(slays)).toBe(50);
  });
});

describe("brandPower", () => {
  it("should return 0 for empty array", () => {
    expect(brandPower([])).toBe(0);
  });

  it("should sum brand power values", () => {
    const brands: Brand[] = [
      { code: "B1", name: "Fire", verb: "burn", resistFlag: 0, vulnFlag: 0, multiplier: 300, oMultiplier: 300, power: 15 },
      { code: "B2", name: "Cold", verb: "freeze", resistFlag: 0, vulnFlag: 0, multiplier: 300, oMultiplier: 300, power: 12 },
    ];
    expect(brandPower(brands)).toBe(27);
  });
});

// ---------------------------------------------------------------------------
// Tests: slayBrandPower
// ---------------------------------------------------------------------------

describe("slayBrandPower", () => {
  const slayTable: Slay[] = [
    { code: "S0", name: "None", base: "", meleeVerb: "", rangeVerb: "", raceFlag: 0, multiplier: 100, oMultiplier: 100, power: 1 },
    { code: "S1", name: "Evil", base: "", meleeVerb: "smite", rangeVerb: "strike", raceFlag: 1, multiplier: 200, oMultiplier: 200, power: 120 },
    { code: "S2", name: "Undead", base: "undead", meleeVerb: "destroy", rangeVerb: "obliterate", raceFlag: 2, multiplier: 500, oMultiplier: 500, power: 150 },
  ];
  const brandTable: Brand[] = [
    { code: "B0", name: "None", verb: "", resistFlag: 0, vulnFlag: 0, multiplier: 100, oMultiplier: 100, power: 0 },
    { code: "B1", name: "Fire", verb: "burn", resistFlag: 1, vulnFlag: 2, multiplier: 300, oMultiplier: 300, power: 100 },
  ];

  it("should return 0 when no slays or brands", () => {
    expect(slayBrandPower(null, null, slayTable, brandTable, 10)).toBe(0);
    expect(slayBrandPower([], [], slayTable, brandTable, 10)).toBe(0);
  });

  it("should contribute positive power for active slays", () => {
    const slays = [false, true, false];
    const p = slayBrandPower(slays, null, slayTable, brandTable, 20);
    expect(p).toBeGreaterThan(0);
  });

  it("should contribute more power for kills (multiplier > 3)", () => {
    const slaysNormal = [false, true, false]; // multiplier = 200 (slay)
    const slaysKill = [false, false, true]; // multiplier = 500 (kill)

    const pNormal = slayBrandPower(slaysNormal, null, slayTable, brandTable, 20);
    const pKill = slayBrandPower(slaysKill, null, slayTable, brandTable, 20);

    expect(pKill).toBeGreaterThan(pNormal);
  });

  it("should contribute power for active brands", () => {
    // brandTable[1] has power=100, so bestPower - 100 = 0 in the formula.
    // Use a brand with power > 100 to see a contribution.
    const localBrandTable: Brand[] = [
      { code: "B0", name: "None", verb: "", resistFlag: 0, vulnFlag: 0, multiplier: 100, oMultiplier: 100, power: 0 },
      { code: "B1", name: "Fire", verb: "burn", resistFlag: 1, vulnFlag: 2, multiplier: 300, oMultiplier: 300, power: 200 },
    ];
    const brands = [false, true];
    const p = slayBrandPower(null, brands, slayTable, localBrandTable, 20);
    expect(p).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: modifierPower
// ---------------------------------------------------------------------------

describe("modifierPower", () => {
  it("should return 0 for zero value", () => {
    expect(modifierPower(ObjectModifier.SPEED, 0)).toBe(0);
  });

  it("should return value when no property info", () => {
    expect(modifierPower(ObjectModifier.SPEED, 3)).toBe(3);
  });

  it("should apply property power and type_mult", () => {
    const prop: ObjProperty = {
      type: ObjPropertyType.MOD,
      subtype: 0,
      idType: 0 as any,
      index: ObjectModifier.SPEED,
      power: 6,
      mult: 1,
      typeMult: new Array(TVal.MAX).fill(1),
      name: "Speed",
      adjective: null,
      negAdj: null,
      msg: null,
      desc: null,
    };

    expect(modifierPower(ObjectModifier.SPEED, 3, prop, TVal.BOOTS)).toBe(18);
  });

  it("should apply tval-specific type_mult", () => {
    const typeMult = new Array(TVal.MAX).fill(1);
    typeMult[TVal.RING] = 2;
    const prop: ObjProperty = {
      type: ObjPropertyType.MOD,
      subtype: 0,
      idType: 0 as any,
      index: ObjectModifier.SPEED,
      power: 6,
      mult: 1,
      typeMult,
      name: "Speed",
      adjective: null,
      negAdj: null,
      msg: null,
      desc: null,
    };

    expect(modifierPower(ObjectModifier.SPEED, 3, prop, TVal.RING)).toBe(36);
  });
});

// ---------------------------------------------------------------------------
// Tests: calculateObjectPower
// ---------------------------------------------------------------------------

describe("calculateObjectPower", () => {
  it("should return 0 for a blank object", () => {
    const obj = makeTestObject();
    expect(calculateObjectPower(obj)).toBe(0);
  });

  it("should add power for weapon combat bonuses", () => {
    const obj = makeTestObject({
      tval: TVal.SWORD,
      toH: 5,
      toD: 5,
      dd: 2,
      ds: 6,
    });
    const p = calculateObjectPower(obj);
    expect(p).toBeGreaterThan(0);
  });

  it("should add power for armor bonuses", () => {
    const obj = makeTestObject({
      tval: TVal.SOFT_ARMOR,
      ac: 10,
      toA: 5,
      weight: 150,
    });
    const p = calculateObjectPower(obj);
    expect(p).toBeGreaterThan(0);
  });

  it("should add jewelry base power for rings", () => {
    const obj = makeTestObject({ tval: TVal.RING });
    const p = calculateObjectPower(obj);
    expect(p).toBe(BASE_JEWELRY_POWER);
  });

  it("should add power for element resistances", () => {
    const elInfo = Array.from({ length: Element.MAX }, () => makeElementInfo());
    elInfo[Element.FIRE] = makeElementInfo(1);

    const obj = makeTestObject({
      tval: TVal.SOFT_ARMOR,
      elInfo,
    });

    const pBase = calculateObjectPower(makeTestObject({ tval: TVal.SOFT_ARMOR }));
    const pRes = calculateObjectPower(obj);

    expect(pRes).toBeGreaterThan(pBase);
  });

  it("should add power for activation", () => {
    const obj = makeTestObject({
      activation: {
        name: "test",
        index: 1,
        aim: false,
        level: 10,
        power: 50,
        effect: null,
        message: null,
        desc: null,
      },
    });
    const p = calculateObjectPower(obj);
    expect(p).toBeGreaterThanOrEqual(50);
  });

  it("a great weapon should have more power than a plain one", () => {
    const plain = makeTestObject({
      tval: TVal.SWORD,
      dd: 2,
      ds: 6,
      toH: 0,
      toD: 0,
    });
    const great = makeTestObject({
      tval: TVal.SWORD,
      dd: 3,
      ds: 8,
      toH: 10,
      toD: 10,
    });

    expect(calculateObjectPower(great)).toBeGreaterThan(calculateObjectPower(plain));
  });
});
