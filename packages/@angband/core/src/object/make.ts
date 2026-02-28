/**
 * @file object/make.ts
 * @brief Object generation functions
 *
 * Port of obj-make.c — object generation, preparation, enchantment,
 * ego item application, and gold creation.
 *
 * Copyright (c) 1987-2007 Angband contributors
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import {
  type RNG,
  type RandomValue,
  BitFlag,
  Aspect,
  randcalc,
  mBonus,
  randomValue,
} from "../z/index.js";
import type {
  ObjectType,
  ObjectKind,
  EgoItem,
  Artifact,
  ElementInfo,
} from "../types/index.js";
import {
  TVal,
  ObjectFlag,
  KindFlag,
  ObjectModifier,
  Element,
  ObjectOrigin,
  ElementInfoFlag,
} from "../types/index.js";
import {
  objectIsMeleeWeapon,
  objectIsAmmo,
  objectIsWeapon,
  objectIsArmor,
  objectIsWearable,
  objectIsLight,
  objectIsLauncher,
  objectCanHaveCharges,
  objectIsEdible,
  objectIsPotion,
  objectIsFuel,
  copySlays,
  copyBrands,
} from "./properties.js";

// ---------------------------------------------------------------------------
// Constants (from z_info equivalents)
// ---------------------------------------------------------------------------

/** Default maximum dungeon depth for object generation. */
const MAX_OBJ_DEPTH = 128;

/** Great object generation chance (one in N). */
const GREAT_OBJ = 20;

/** Great ego chance (one in N). */
const GREAT_EGO = 20;

/** Default torch fuel. */
const FUEL_TORCH = 5000;

/** Default lamp fuel. */
const DEFAULT_LAMP = 15000;

/** NO_MINIMUM sentinel for ego minima. */
const NO_MINIMUM = 255;

// ---------------------------------------------------------------------------
// Helper: create a blank ElementInfo entry
// ---------------------------------------------------------------------------

function makeElementInfo(): ElementInfo {
  return {
    resLevel: 0,
    flags: new BitFlag(8),
  };
}

// ---------------------------------------------------------------------------
// Object kind "good" predicate (port of kind_is_good)
// ---------------------------------------------------------------------------

/**
 * Determine if an object kind is "good" for allocation purposes.
 * Good items are those that can appear in the "great" allocation table.
 */
export function kindIsGood(kind: ObjectKind): boolean {
  switch (kind.tval) {
    // Armor -- Good unless damaged
    case TVal.HARD_ARMOR:
    case TVal.SOFT_ARMOR:
    case TVal.DRAG_ARMOR:
    case TVal.SHIELD:
    case TVal.CLOAK:
    case TVal.BOOTS:
    case TVal.GLOVES:
    case TVal.HELM:
    case TVal.CROWN:
      return kind.toA.base >= 0;

    // Weapons -- Good unless damaged
    case TVal.BOW:
    case TVal.SWORD:
    case TVal.HAFTED:
    case TVal.POLEARM:
    case TVal.DIGGING:
      return kind.toH.base >= 0 && kind.toD.base >= 0;

    // Ammo -- Arrows/Bolts are good
    case TVal.BOLT:
    case TVal.ARROW:
      return true;

    default:
      break;
  }

  // Anything with the GOOD kind flag
  if (kind.kindFlags.has(KindFlag.GOOD)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Allocation table (simplified for TypeScript port)
// ---------------------------------------------------------------------------

/**
 * Pick an object kind from a list of kinds, suitable for the given depth.
 *
 * Simplified allocation: we build a weighted probability list and
 * select using rejection sampling, matching the C `get_obj_num` logic.
 *
 * @param kinds - All known object kinds.
 * @param depth - Current dungeon level.
 * @param tval  - If non-null, restrict to this TVal.
 * @param rng   - Random number generator.
 * @param good  - If true, only pick from "good" items.
 */
export function pickObjectKind(
  kinds: readonly ObjectKind[],
  depth: number,
  tval: TVal | null,
  rng: RNG,
  good = false,
): ObjectKind | null {
  // Occasional level boost
  let level = depth;
  if (level > 0 && rng.oneIn(GREAT_OBJ)) {
    level = 1 + Math.floor((level * MAX_OBJ_DEPTH) / rng.randint1(MAX_OBJ_DEPTH));
  }
  level = Math.min(level, MAX_OBJ_DEPTH);
  level = Math.max(level, 0);

  // Build allocation entries
  type AllocEntry = { kind: ObjectKind; prob: number };
  const entries: AllocEntry[] = [];
  let total = 0;

  for (const kind of kinds) {
    if (tval !== null && kind.tval !== tval) continue;
    if (kind.allocProb <= 0) continue;
    if (level < kind.allocMin || level > kind.allocMax) continue;
    if (good && !kindIsGood(kind)) continue;

    entries.push({ kind, prob: kind.allocProb });
    total += kind.allocProb;
  }

  if (total === 0 || entries.length === 0) return null;

  // Weighted random selection
  let value = rng.randint0(total);
  for (const entry of entries) {
    if (value < entry.prob) return entry.kind;
    value -= entry.prob;
  }

  // Fallback (should not happen)
  return entries[entries.length - 1]!.kind;
}

// ---------------------------------------------------------------------------
// Create base object from kind (port of object_prep)
// ---------------------------------------------------------------------------

/**
 * Create a new ObjectType instance from a kind template.
 * This is the TypeScript equivalent of `object_prep()` in obj-make.c.
 */
export function createObjectFromKind(
  kind: ObjectKind,
  rng: RNG,
  level = 0,
  aspect: Aspect = Aspect.RANDOMISE,
): ObjectType {
  // Build element info array
  const elInfo: ElementInfo[] = [];
  for (let i = 0; i < Element.MAX; i++) {
    const kindEl = kind.elInfo[i];
    const baseEl = kind.base?.elInfo[i];
    const flags = new BitFlag(8);
    if (kindEl) flags.union(kindEl.flags);
    if (baseEl) flags.union(baseEl.flags);
    elInfo.push({
      resLevel: kindEl?.resLevel ?? 0,
      flags,
    });
  }

  // Build flags
  const flags = new BitFlag(ObjectFlag.MAX);
  if (kind.base) flags.union(kind.base.flags);
  flags.union(kind.flags);

  // Build modifiers
  const modifiers: number[] = new Array(ObjectModifier.MAX).fill(0);
  for (let i = 0; i < ObjectModifier.MAX; i++) {
    const rv = kind.modifiers[i];
    if (rv) {
      modifiers[i] = randcalc(rng, rv, level, aspect);
    }
  }

  // Compute pval
  let pval = 0;
  if (objectCanHaveChargesForKind(kind)) {
    pval = randcalc(rng, kind.charge, level, aspect);
  } else if (
    isEdibleKind(kind) ||
    isPotionKind(kind) ||
    isFuelKind(kind) ||
    isLauncherKind(kind)
  ) {
    pval = randcalc(rng, kind.pval, level, aspect);
  }

  // Default fuel for lights
  let timeout = 0;
  if (kind.tval === TVal.LIGHT) {
    if (flags.has(ObjectFlag.BURNS_OUT)) {
      timeout = FUEL_TORCH;
    } else if (flags.has(ObjectFlag.TAKES_FUEL)) {
      timeout = DEFAULT_LAMP;
    }
  }

  // Copy slays, brands
  const slays = copySlays(null, kind.slays ?? null);
  const brands = copyBrands(null, kind.brands ?? null);

  const obj: ObjectType = {
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

    pval,
    weight: kind.weight,

    dd: kind.dd,
    ds: kind.ds,
    ac: kind.ac,
    toA: randcalc(rng, kind.toA, level, aspect),
    toH: randcalc(rng, kind.toH, level, aspect),
    toD: randcalc(rng, kind.toD, level, aspect),

    flags,
    modifiers,
    elInfo,
    brands,
    slays,
    curses: null,

    effect: kind.effect,
    effectMsg: kind.effectMsg,
    activation: kind.activation,
    time: kind.time,
    timeout,

    number: 1,
    notice: 0,

    heldMIdx: 0,
    mimickingMIdx: 0,

    origin: ObjectOrigin.NONE,
    originDepth: 0,
    originRace: null,

    note: 0 as any,
  };

  return obj;
}

// Kind-level TVal helpers (avoid needing a full ObjectType)
function objectCanHaveChargesForKind(kind: ObjectKind): boolean {
  return kind.tval === TVal.STAFF || kind.tval === TVal.WAND;
}
function isEdibleKind(kind: ObjectKind): boolean {
  return kind.tval === TVal.FOOD || kind.tval === TVal.MUSHROOM;
}
function isPotionKind(kind: ObjectKind): boolean {
  return kind.tval === TVal.POTION;
}
function isFuelKind(kind: ObjectKind): boolean {
  return kind.tval === TVal.FLASK;
}
function isLauncherKind(kind: ObjectKind): boolean {
  return kind.tval === TVal.BOW;
}

// ---------------------------------------------------------------------------
// Apply magic to weapons (port of apply_magic_weapon)
// ---------------------------------------------------------------------------

function applyMagicWeapon(obj: ObjectType, level: number, power: number, rng: RNG): void {
  if (power <= 0) return;

  obj.toH += rng.randint1(5) + mBonus(rng, 5, level);
  obj.toD += rng.randint1(5) + mBonus(rng, 5, level);

  if (power > 1) {
    obj.toH += mBonus(rng, 10, level);
    obj.toD += mBonus(rng, 10, level);

    if (objectIsMeleeWeapon(obj)) {
      // Super-charge damage dice
      while (obj.dd * obj.ds > 0 && rng.oneIn(4 * obj.dd * obj.ds)) {
        if (rng.randint0(obj.dd + obj.ds) < obj.dd) {
          let newdice = rng.randint1(2 + Math.floor(obj.dd / obj.ds));
          while ((obj.dd + 1) * obj.ds <= 40 && newdice > 0) {
            if (!rng.oneIn(3)) obj.dd++;
            newdice--;
          }
        } else {
          let newsides = rng.randint1(2 + Math.floor(obj.ds / obj.dd));
          while (obj.dd * (obj.ds + 1) <= 40 && newsides > 0) {
            if (!rng.oneIn(3)) obj.ds++;
            newsides--;
          }
        }
      }
    } else if (objectIsAmmo(obj)) {
      // Up to two chances to enhance damage dice
      if (rng.oneIn(6)) {
        obj.ds++;
        if (rng.oneIn(10)) {
          obj.ds++;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Apply magic to armour (port of apply_magic_armour)
// ---------------------------------------------------------------------------

function applyMagicArmour(obj: ObjectType, level: number, power: number, rng: RNG): void {
  if (power <= 0) return;

  obj.toA += rng.randint1(5) + mBonus(rng, 5, level);
  if (power > 1) {
    obj.toA += mBonus(rng, 10, level);
  }
}

// ---------------------------------------------------------------------------
// Ego item application (port of ego_apply_magic / ego_apply_minima)
// ---------------------------------------------------------------------------

/**
 * Apply ego item enchantments to an object.
 * Assumes obj.ego is already set.
 */
export function egoApplyMagic(obj: ObjectType, level: number, rng: RNG): void {
  const ego = obj.ego;
  if (!ego) return;

  // Apply extra ego bonuses
  obj.toH += randcalc(rng, ego.toH, level, Aspect.RANDOMISE);
  obj.toD += randcalc(rng, ego.toD, level, Aspect.RANDOMISE);
  obj.toA += randcalc(rng, ego.toA, level, Aspect.RANDOMISE);

  // Apply modifiers
  for (let i = 0; i < ObjectModifier.MAX; i++) {
    const rv = ego.modifiers[i];
    if (rv) {
      const current = obj.modifiers[i] ?? 0;
      obj.modifiers[i] = current + randcalc(rng, rv, level, Aspect.RANDOMISE);
    }
  }

  // Apply flags
  obj.flags.union(ego.flags);
  obj.flags.diff(ego.flagsOff);

  // Add slays, brands
  obj.slays = copySlays(obj.slays, ego.slays ?? null);
  obj.brands = copyBrands(obj.brands, ego.brands ?? null);

  // Add resists
  for (let i = 0; i < Element.MAX; i++) {
    const egoEl = ego.elInfo[i];
    if (!egoEl) continue;
    const objEl = obj.elInfo[i];
    if (!objEl) continue;

    // Take the larger resist level
    const newLevel = Math.max(egoEl.resLevel, objEl.resLevel);
    // Union flags
    const newFlags = objEl.flags.clone();
    newFlags.union(egoEl.flags);
    obj.elInfo[i] = { resLevel: newLevel, flags: newFlags };
  }

  // Add activation (ego's activation trumps object's)
  if (ego.activation) {
    (obj as any).activation = ego.activation;
    (obj as any).time = ego.time;
  }
}

/**
 * Apply minimum standards for ego items.
 */
export function egoApplyMinima(obj: ObjectType): void {
  const ego = obj.ego;
  if (!ego) return;

  if (ego.minToH !== NO_MINIMUM && obj.toH < ego.minToH) {
    obj.toH = ego.minToH;
  }
  if (ego.minToD !== NO_MINIMUM && obj.toD < ego.minToD) {
    obj.toD = ego.minToD;
  }
  if (ego.minToA !== NO_MINIMUM && obj.toA < ego.minToA) {
    obj.toA = ego.minToA;
  }

  for (let i = 0; i < ObjectModifier.MAX; i++) {
    const min = ego.minModifiers[i] ?? 0;
    const current = obj.modifiers[i] ?? 0;
    if (current < min) {
      obj.modifiers[i] = min;
    }
  }
}

// ---------------------------------------------------------------------------
// Apply magic (port of apply_magic)
// ---------------------------------------------------------------------------

/**
 * Apply magic to a freshly-created object. Returns a power level:
 * 0 = normal, 1 = good, 2 = ego/great.
 *
 * This simplified port does not handle artifacts (those are handled
 * separately via makeObject).
 */
export function applyMagic(
  obj: ObjectType,
  level: number,
  isGood: boolean,
  isGreat: boolean,
  rng: RNG,
  egoTable?: readonly EgoItem[],
): number {
  let power = 0;

  // Chance of being good and great
  const goodChance = 33 + level;
  const greatChance = 30;

  if (isGood || rng.randint0(100) < goodChance) {
    power = 1;
    if (isGreat || rng.randint0(100) < greatChance) {
      power = 2;
    }
  }

  // Try to make an ego item
  if (power >= 2 && egoTable && egoTable.length > 0) {
    const ego = findEgo(obj, level, egoTable, rng);
    if (ego) {
      (obj as any).ego = ego;
      egoApplyMagic(obj, level, rng);
    }
  }

  // Apply magic based on type
  if (objectIsWeapon(obj)) {
    applyMagicWeapon(obj, level, power, rng);
  } else if (objectIsArmor(obj)) {
    applyMagicArmour(obj, level, power, rng);
  }

  // Apply ego minima
  egoApplyMinima(obj);

  return power;
}

// ---------------------------------------------------------------------------
// Ego finding (simplified port of ego_find_random)
// ---------------------------------------------------------------------------

function findEgo(
  obj: ObjectType,
  level: number,
  egoTable: readonly EgoItem[],
  rng: RNG,
): EgoItem | null {
  // Occasionally boost the ego generation level
  let egoLevel = level;
  if (egoLevel > 0 && rng.oneIn(GREAT_EGO)) {
    egoLevel = 1 + Math.floor(
      (egoLevel * MAX_OBJ_DEPTH) / rng.randint1(MAX_OBJ_DEPTH),
    );
    if (egoLevel >= MAX_OBJ_DEPTH) egoLevel = MAX_OBJ_DEPTH - 1;
  }

  type EgoEntry = { ego: EgoItem; prob: number };
  const entries: EgoEntry[] = [];
  let total = 0;

  for (const ego of egoTable) {
    if (ego.allocProb <= 0) continue;
    if (egoLevel > ego.allocMax) continue;

    // Out-of-depth check
    const oodChance = Math.max(2, Math.floor((ego.allocMin - egoLevel) / 3));
    if (egoLevel < ego.allocMin && !rng.oneIn(oodChance)) continue;

    // Check if this ego can apply to this object kind
    if (!obj.kind) continue;
    const kindMatch = ego.possItems.some((pi) => pi.kidx === obj.kind!.kidx);
    if (!kindMatch) continue;

    entries.push({ ego, prob: ego.allocProb });
    total += ego.allocProb;
  }

  if (total === 0 || entries.length === 0) return null;

  let value = rng.randint0(total);
  for (const entry of entries) {
    if (value < entry.prob) return entry.ego;
    value -= entry.prob;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Make a full object (port of make_object)
// ---------------------------------------------------------------------------

/**
 * Attempt to generate a random object appropriate for the given depth.
 *
 * @param kinds   - Array of all known object kinds.
 * @param depth   - Dungeon level.
 * @param isGood  - Force the object to be at least "good".
 * @param isGreat - Force the object to be "great".
 * @param rng     - Random number generator.
 * @param egoTable - Optional ego item table for enchantment.
 * @returns A new ObjectType, or null if generation failed.
 */
export function makeObject(
  kinds: readonly ObjectKind[],
  depth: number,
  isGood: boolean,
  isGreat: boolean,
  rng: RNG,
  egoTable?: readonly EgoItem[],
): ObjectType | null {
  let good = isGood;

  // Base level for the object
  const base = good ? depth + 10 : depth;

  // Try to choose an object kind
  const kind = pickObjectKind(kinds, base, null, rng, good || isGreat);
  if (!kind) return null;

  // Create the base object
  const obj = createObjectFromKind(kind, rng, depth);

  // Apply magic
  applyMagic(obj, depth, good, isGreat, rng, egoTable);

  // Generate multiple items
  if (!obj.artifact && kind.genMultProb >= rng.randint1(100)) {
    obj.number = randcalc(rng, kind.stackSize, depth, Aspect.RANDOMISE);
  }

  // Cap stack size
  if (kind.base && obj.number > kind.base.maxStack) {
    obj.number = kind.base.maxStack;
  }

  return obj;
}

// ---------------------------------------------------------------------------
// Make gold (port of make_gold)
// ---------------------------------------------------------------------------

/**
 * Create a gold pile object.
 *
 * @param depth - Dungeon level.
 * @param rng   - Random number generator.
 * @param goldKind - The ObjectKind for gold (TV_GOLD).
 * @returns A gold ObjectType (cannot fail if goldKind is provided).
 */
export function makeGold(
  depth: number,
  rng: RNG,
  goldKind: ObjectKind,
): ObjectType {
  // Average gold value: 16 at dlev0, 80 at dlev40, 176 at dlev100
  const avg = Math.floor((16 * depth) / 10) + 16;
  const spread = depth + 10;
  let value = rng.spread(avg, spread);

  // Increase the range to infinite, moving the average to 110%
  while (rng.oneIn(100) && value * 10 <= 32767) {
    value *= 10;
  }

  // Cap gold at max short
  if (value >= 32767) {
    value = 32767 - rng.randint0(200);
  }

  const obj = createObjectFromKind(goldKind, rng, depth);
  obj.pval = value;

  return obj;
}
