/**
 * Tests for object/properties.ts — Object property query and manipulation.
 */
import { describe, it, expect } from "vitest";
import { BitFlag } from "../z/index.js";
import { RNG, randomValue } from "../z/index.js";
import {
  ObjectFlag,
  ObjectModifier,
  Element,
  TVal,
  ObjectNotice,
  KindFlag,
} from "../types/index.js";
import type {
  ObjectType,
  ObjectKind,
  ObjectBase,
  Brand,
  Slay,
  ElementInfo,
} from "../types/index.js";
import {
  objectHasFlag,
  objectSetFlag,
  objectClearFlag,
  objectHasElement,
  objectGetModifier,
  objectSetModifier,
  objectIsWearable,
  objectIsWeapon,
  objectIsMeleeWeapon,
  objectIsAmmo,
  objectIsArmor,
  objectIsJewelry,
  objectIsLight,
  objectIsLauncher,
  objectIsChest,
  objectIsGold,
  objectCanHaveCharges,
  objectIsEdible,
  objectIsPotion,
  objectIsFuel,
  objectIsKnown,
  objectSlayIndices,
  objectSlays,
  objectBrandIndices,
  objectBrands,
  copySlays,
  copyBrands,
  randomBaseResist,
  randomHighResist,
} from "./properties.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeElementInfo(resLevel = 0): ElementInfo {
  return { resLevel, flags: new BitFlag(8) };
}

/** Build a minimal ObjectType for testing. */
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
// Tests: Flag operations
// ---------------------------------------------------------------------------

describe("objectHasFlag / objectSetFlag / objectClearFlag", () => {
  it("should set and query flags", () => {
    const obj = makeTestObject();

    expect(objectHasFlag(obj, ObjectFlag.REGEN)).toBe(false);
    objectSetFlag(obj, ObjectFlag.REGEN);
    expect(objectHasFlag(obj, ObjectFlag.REGEN)).toBe(true);
  });

  it("should clear a flag", () => {
    const obj = makeTestObject();
    objectSetFlag(obj, ObjectFlag.TELEPATHY);
    objectClearFlag(obj, ObjectFlag.TELEPATHY);
    expect(objectHasFlag(obj, ObjectFlag.TELEPATHY)).toBe(false);
  });

  it("should handle multiple flags independently", () => {
    const obj = makeTestObject();
    objectSetFlag(obj, ObjectFlag.SEE_INVIS);
    objectSetFlag(obj, ObjectFlag.FREE_ACT);

    expect(objectHasFlag(obj, ObjectFlag.SEE_INVIS)).toBe(true);
    expect(objectHasFlag(obj, ObjectFlag.FREE_ACT)).toBe(true);
    expect(objectHasFlag(obj, ObjectFlag.HOLD_LIFE)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Element queries
// ---------------------------------------------------------------------------

describe("objectHasElement", () => {
  it("should detect resistance", () => {
    const obj = makeTestObject();
    obj.elInfo[Element.FIRE] = makeElementInfo(1);

    expect(objectHasElement(obj, Element.FIRE)).toBe(true);
    expect(objectHasElement(obj, Element.COLD)).toBe(false);
  });

  it("should return false for vulnerability or neutral", () => {
    const obj = makeTestObject();
    obj.elInfo[Element.ACID] = makeElementInfo(-1);
    obj.elInfo[Element.ELEC] = makeElementInfo(0);

    expect(objectHasElement(obj, Element.ACID)).toBe(false);
    expect(objectHasElement(obj, Element.ELEC)).toBe(false);
  });

  it("should return false for out-of-range elements", () => {
    const obj = makeTestObject();
    expect(objectHasElement(obj, -1 as Element)).toBe(false);
    expect(objectHasElement(obj, Element.MAX)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Modifier operations
// ---------------------------------------------------------------------------

describe("objectGetModifier / objectSetModifier", () => {
  it("should get and set modifiers", () => {
    const obj = makeTestObject();

    expect(objectGetModifier(obj, ObjectModifier.SPEED)).toBe(0);
    objectSetModifier(obj, ObjectModifier.SPEED, 5);
    expect(objectGetModifier(obj, ObjectModifier.SPEED)).toBe(5);
  });

  it("should return 0 for out-of-range modifier", () => {
    const obj = makeTestObject();
    expect(objectGetModifier(obj, -1 as ObjectModifier)).toBe(0);
    expect(objectGetModifier(obj, ObjectModifier.MAX)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Categorical predicates
// ---------------------------------------------------------------------------

describe("objectIs* predicates", () => {
  it("objectIsWeapon should detect weapons and ammo", () => {
    expect(objectIsWeapon(makeTestObject({ tval: TVal.SWORD }))).toBe(true);
    expect(objectIsWeapon(makeTestObject({ tval: TVal.HAFTED }))).toBe(true);
    expect(objectIsWeapon(makeTestObject({ tval: TVal.POLEARM }))).toBe(true);
    expect(objectIsWeapon(makeTestObject({ tval: TVal.DIGGING }))).toBe(true);
    expect(objectIsWeapon(makeTestObject({ tval: TVal.BOW }))).toBe(true);
    expect(objectIsWeapon(makeTestObject({ tval: TVal.ARROW }))).toBe(true);
    expect(objectIsWeapon(makeTestObject({ tval: TVal.BOLT }))).toBe(true);
    expect(objectIsWeapon(makeTestObject({ tval: TVal.SHOT }))).toBe(true);
    expect(objectIsWeapon(makeTestObject({ tval: TVal.POTION }))).toBe(false);
  });

  it("objectIsMeleeWeapon should exclude bows and ammo", () => {
    expect(objectIsMeleeWeapon(makeTestObject({ tval: TVal.SWORD }))).toBe(true);
    expect(objectIsMeleeWeapon(makeTestObject({ tval: TVal.BOW }))).toBe(false);
    expect(objectIsMeleeWeapon(makeTestObject({ tval: TVal.ARROW }))).toBe(false);
  });

  it("objectIsAmmo should detect ammunition", () => {
    expect(objectIsAmmo(makeTestObject({ tval: TVal.SHOT }))).toBe(true);
    expect(objectIsAmmo(makeTestObject({ tval: TVal.ARROW }))).toBe(true);
    expect(objectIsAmmo(makeTestObject({ tval: TVal.BOLT }))).toBe(true);
    expect(objectIsAmmo(makeTestObject({ tval: TVal.SWORD }))).toBe(false);
  });

  it("objectIsArmor should detect armor", () => {
    expect(objectIsArmor(makeTestObject({ tval: TVal.SOFT_ARMOR }))).toBe(true);
    expect(objectIsArmor(makeTestObject({ tval: TVal.HARD_ARMOR }))).toBe(true);
    expect(objectIsArmor(makeTestObject({ tval: TVal.DRAG_ARMOR }))).toBe(true);
    expect(objectIsArmor(makeTestObject({ tval: TVal.BOOTS }))).toBe(true);
    expect(objectIsArmor(makeTestObject({ tval: TVal.GLOVES }))).toBe(true);
    expect(objectIsArmor(makeTestObject({ tval: TVal.HELM }))).toBe(true);
    expect(objectIsArmor(makeTestObject({ tval: TVal.CROWN }))).toBe(true);
    expect(objectIsArmor(makeTestObject({ tval: TVal.SHIELD }))).toBe(true);
    expect(objectIsArmor(makeTestObject({ tval: TVal.CLOAK }))).toBe(true);
    expect(objectIsArmor(makeTestObject({ tval: TVal.POTION }))).toBe(false);
  });

  it("objectIsWearable should include weapons, armor, jewelry, lights", () => {
    expect(objectIsWearable(makeTestObject({ tval: TVal.SWORD }))).toBe(true);
    expect(objectIsWearable(makeTestObject({ tval: TVal.SOFT_ARMOR }))).toBe(true);
    expect(objectIsWearable(makeTestObject({ tval: TVal.RING }))).toBe(true);
    expect(objectIsWearable(makeTestObject({ tval: TVal.AMULET }))).toBe(true);
    expect(objectIsWearable(makeTestObject({ tval: TVal.LIGHT }))).toBe(true);
    expect(objectIsWearable(makeTestObject({ tval: TVal.POTION }))).toBe(false);
    expect(objectIsWearable(makeTestObject({ tval: TVal.SCROLL }))).toBe(false);
  });

  it("objectIsJewelry should detect rings and amulets", () => {
    expect(objectIsJewelry(makeTestObject({ tval: TVal.RING }))).toBe(true);
    expect(objectIsJewelry(makeTestObject({ tval: TVal.AMULET }))).toBe(true);
    expect(objectIsJewelry(makeTestObject({ tval: TVal.HELM }))).toBe(false);
  });

  it("objectIsLight should detect light sources", () => {
    expect(objectIsLight(makeTestObject({ tval: TVal.LIGHT }))).toBe(true);
    expect(objectIsLight(makeTestObject({ tval: TVal.RING }))).toBe(false);
  });

  it("objectIsLauncher should detect bows", () => {
    expect(objectIsLauncher(makeTestObject({ tval: TVal.BOW }))).toBe(true);
    expect(objectIsLauncher(makeTestObject({ tval: TVal.SWORD }))).toBe(false);
  });

  it("objectIsChest should detect chests", () => {
    expect(objectIsChest(makeTestObject({ tval: TVal.CHEST }))).toBe(true);
    expect(objectIsChest(makeTestObject({ tval: TVal.SWORD }))).toBe(false);
  });

  it("objectIsGold should detect gold", () => {
    expect(objectIsGold(makeTestObject({ tval: TVal.GOLD }))).toBe(true);
    expect(objectIsGold(makeTestObject({ tval: TVal.SWORD }))).toBe(false);
  });

  it("objectCanHaveCharges should detect staves and wands", () => {
    expect(objectCanHaveCharges(makeTestObject({ tval: TVal.STAFF }))).toBe(true);
    expect(objectCanHaveCharges(makeTestObject({ tval: TVal.WAND }))).toBe(true);
    expect(objectCanHaveCharges(makeTestObject({ tval: TVal.POTION }))).toBe(false);
  });

  it("objectIsEdible should detect food and mushrooms", () => {
    expect(objectIsEdible(makeTestObject({ tval: TVal.FOOD }))).toBe(true);
    expect(objectIsEdible(makeTestObject({ tval: TVal.MUSHROOM }))).toBe(true);
    expect(objectIsEdible(makeTestObject({ tval: TVal.POTION }))).toBe(false);
  });

  it("objectIsPotion should detect potions", () => {
    expect(objectIsPotion(makeTestObject({ tval: TVal.POTION }))).toBe(true);
    expect(objectIsPotion(makeTestObject({ tval: TVal.SCROLL }))).toBe(false);
  });

  it("objectIsFuel should detect flasks", () => {
    expect(objectIsFuel(makeTestObject({ tval: TVal.FLASK }))).toBe(true);
    expect(objectIsFuel(makeTestObject({ tval: TVal.POTION }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Knowledge queries
// ---------------------------------------------------------------------------

describe("objectIsKnown", () => {
  it("should return true when ASSESSED notice is set", () => {
    const obj = makeTestObject({ notice: ObjectNotice.ASSESSED });
    expect(objectIsKnown(obj)).toBe(true);
  });

  it("should return false when ASSESSED notice is not set", () => {
    const obj = makeTestObject({ notice: 0 });
    expect(objectIsKnown(obj)).toBe(false);
  });

  it("should work with other notice flags present", () => {
    const obj = makeTestObject({ notice: ObjectNotice.WORN | ObjectNotice.ASSESSED });
    expect(objectIsKnown(obj)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: Slay/Brand extraction
// ---------------------------------------------------------------------------

describe("objectSlayIndices / objectSlays", () => {
  it("should return empty array when no slays", () => {
    const obj = makeTestObject();
    expect(objectSlayIndices(obj)).toEqual([]);
  });

  it("should return indices of active slays", () => {
    const obj = makeTestObject({
      slays: [false, true, false, true, false],
    });
    expect(objectSlayIndices(obj)).toEqual([1, 3]);
  });

  it("should resolve slays against a slay table", () => {
    const slayTable: Slay[] = [
      { code: "S0", name: "Slay0", base: "", meleeVerb: "", rangeVerb: "", raceFlag: 0, multiplier: 100, oMultiplier: 100, power: 1 },
      { code: "S1", name: "Slay Evil", base: "", meleeVerb: "smite", rangeVerb: "strike", raceFlag: 1, multiplier: 200, oMultiplier: 200, power: 20 },
      { code: "S2", name: "Slay Undead", base: "undead", meleeVerb: "destroy", rangeVerb: "obliterate", raceFlag: 2, multiplier: 300, oMultiplier: 300, power: 30 },
    ];
    const obj = makeTestObject({
      slays: [false, true, true],
    });
    const result = objectSlays(obj, slayTable);
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("Slay Evil");
    expect(result[1]!.name).toBe("Slay Undead");
  });
});

describe("objectBrandIndices / objectBrands", () => {
  it("should return empty array when no brands", () => {
    const obj = makeTestObject();
    expect(objectBrandIndices(obj)).toEqual([]);
  });

  it("should return indices of active brands", () => {
    const obj = makeTestObject({
      brands: [false, false, true],
    });
    expect(objectBrandIndices(obj)).toEqual([2]);
  });

  it("should resolve brands against a brand table", () => {
    const brandTable: Brand[] = [
      { code: "B0", name: "None", verb: "", resistFlag: 0, vulnFlag: 0, multiplier: 100, oMultiplier: 100, power: 0 },
      { code: "B1", name: "Fire", verb: "burn", resistFlag: 1, vulnFlag: 2, multiplier: 300, oMultiplier: 300, power: 20 },
    ];
    const obj = makeTestObject({
      brands: [false, true],
    });
    const result = objectBrands(obj, brandTable);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Fire");
  });
});

// ---------------------------------------------------------------------------
// Tests: Copy helpers
// ---------------------------------------------------------------------------

describe("copySlays / copyBrands", () => {
  it("should return null when source is null", () => {
    expect(copySlays(null, null)).toBeNull();
  });

  it("should create new array when dest is null", () => {
    const source = [false, true, false, true];
    const result = copySlays(null, source)!;
    expect(result).not.toBeNull();
    expect(result).toEqual([false, true, false, true]);
  });

  it("should merge slays into existing dest", () => {
    const dest = [false, true, false, false];
    const source = [false, false, true, false];
    const result = copySlays(dest, source)!;
    expect(result).toEqual([false, true, true, false]);
  });

  it("copyBrands should work the same as copySlays", () => {
    const source = [false, true, true];
    const result = copyBrands(null, source)!;
    expect(result).toEqual([false, true, true]);
  });
});

// ---------------------------------------------------------------------------
// Tests: Random resist helpers
// ---------------------------------------------------------------------------

describe("randomBaseResist", () => {
  it("should return a base element index when available", () => {
    const rng = new RNG();
    rng.fix(0);

    const obj = makeTestObject();
    // All base elements (ACID=0, ELEC=1, FIRE=2, COLD=3) are at 0
    const result = randomBaseResist(obj, rng);
    expect(result).toBeGreaterThanOrEqual(Element.ACID);
    expect(result).toBeLessThan(Element.POIS);

    rng.unfix();
  });

  it("should return -1 when all base elements have resistance", () => {
    const rng = new RNG();
    rng.fix(50);

    const obj = makeTestObject();
    for (let i = Element.ACID; i < Element.POIS; i++) {
      obj.elInfo[i] = makeElementInfo(1);
    }
    expect(randomBaseResist(obj, rng)).toBe(-1);

    rng.unfix();
  });
});

describe("randomHighResist", () => {
  it("should return a high element index when available", () => {
    const rng = new RNG();
    rng.fix(0);

    const obj = makeTestObject();
    const result = randomHighResist(obj, rng);
    expect(result).toBeGreaterThanOrEqual(Element.POIS);
    expect(result).toBeLessThanOrEqual(Element.DISEN);

    rng.unfix();
  });

  it("should return -1 when all high elements have resistance", () => {
    const rng = new RNG();
    rng.fix(50);

    const obj = makeTestObject();
    for (let i = Element.POIS; i <= Element.DISEN; i++) {
      obj.elInfo[i] = makeElementInfo(1);
    }
    expect(randomHighResist(obj, rng)).toBe(-1);

    rng.unfix();
  });
});
