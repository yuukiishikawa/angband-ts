/**
 * @file object/properties.ts
 * @brief Object property query and manipulation functions
 *
 * Port of obj-properties.c and obj-tval.c — functions to test and
 * set flags, elements, modifiers, and categorical predicates on
 * object instances.
 *
 * Copyright (c) 2014 Chris Carr, Nick McConnell
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { BitFlag } from "../z/index.js";
import type {
  ObjectType,
  Brand,
  Slay,
  ElementInfo,
} from "../types/index.js";
import {
  ObjectFlag,
  ObjectModifier,
  Element,
  TVal,
  ObjectNotice,
  ELEM_BASE_MIN,
  ELEM_BASE_MAX,
  ELEM_HIGH_MIN,
  ELEM_HIGH_MAX,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Flag queries
// ---------------------------------------------------------------------------

/** Test whether an object has a specific ObjectFlag set. */
export function objectHasFlag(obj: ObjectType, flag: ObjectFlag): boolean {
  return obj.flags.has(flag);
}

/** Set a specific ObjectFlag on an object. */
export function objectSetFlag(obj: ObjectType, flag: ObjectFlag): void {
  obj.flags.on(flag);
}

/** Clear a specific ObjectFlag from an object. */
export function objectClearFlag(obj: ObjectType, flag: ObjectFlag): void {
  obj.flags.off(flag);
}

// ---------------------------------------------------------------------------
// Element queries
// ---------------------------------------------------------------------------

/**
 * Test whether an object provides resistance (resLevel > 0) for a given element.
 */
export function objectHasElement(obj: ObjectType, elem: Element): boolean {
  if (elem < 0 || elem >= Element.MAX) return false;
  const info = obj.elInfo[elem];
  if (!info) return false;
  return info.resLevel > 0;
}

// ---------------------------------------------------------------------------
// Modifier queries
// ---------------------------------------------------------------------------

/** Get the value of a specific modifier on an object. */
export function objectGetModifier(
  obj: ObjectType,
  mod: ObjectModifier,
): number {
  if (mod < 0 || mod >= ObjectModifier.MAX) return 0;
  return obj.modifiers[mod] ?? 0;
}

/** Set the value of a specific modifier on an object. */
export function objectSetModifier(
  obj: ObjectType,
  mod: ObjectModifier,
  value: number,
): void {
  if (mod < 0 || mod >= ObjectModifier.MAX) return;
  obj.modifiers[mod] = value;
}

// ---------------------------------------------------------------------------
// Categorical predicates (port of obj-tval.c helpers)
// ---------------------------------------------------------------------------

/** Weapon TVal set: melee weapons + bows + ammo. */
const WEAPON_TVALS: ReadonlySet<TVal> = new Set([
  TVal.SWORD,
  TVal.HAFTED,
  TVal.POLEARM,
  TVal.DIGGING,
  TVal.BOW,
]);

/** Melee weapon TVal set. */
const MELEE_TVALS: ReadonlySet<TVal> = new Set([
  TVal.SWORD,
  TVal.HAFTED,
  TVal.POLEARM,
  TVal.DIGGING,
]);

/** Ammo TVal set. */
const AMMO_TVALS: ReadonlySet<TVal> = new Set([
  TVal.SHOT,
  TVal.ARROW,
  TVal.BOLT,
]);

/** Armor TVal set. */
const ARMOR_TVALS: ReadonlySet<TVal> = new Set([
  TVal.BOOTS,
  TVal.GLOVES,
  TVal.HELM,
  TVal.CROWN,
  TVal.SHIELD,
  TVal.CLOAK,
  TVal.SOFT_ARMOR,
  TVal.HARD_ARMOR,
  TVal.DRAG_ARMOR,
]);

/** Wearable TVal set (weapons + armor + jewelry + light). */
const WEARABLE_TVALS: ReadonlySet<TVal> = new Set([
  ...WEAPON_TVALS,
  ...AMMO_TVALS,
  ...ARMOR_TVALS,
  TVal.LIGHT,
  TVal.AMULET,
  TVal.RING,
]);

/** Jewelry TVal set. */
const JEWELRY_TVALS: ReadonlySet<TVal> = new Set([
  TVal.RING,
  TVal.AMULET,
]);

/** Test whether an object is wearable (equippable). */
export function objectIsWearable(obj: ObjectType): boolean {
  return WEARABLE_TVALS.has(obj.tval);
}

/** Test whether an object is a weapon (melee, bow, or ammo). */
export function objectIsWeapon(obj: ObjectType): boolean {
  return WEAPON_TVALS.has(obj.tval) || AMMO_TVALS.has(obj.tval);
}

/** Test whether an object is a melee weapon. */
export function objectIsMeleeWeapon(obj: ObjectType): boolean {
  return MELEE_TVALS.has(obj.tval);
}

/** Test whether an object is ammunition. */
export function objectIsAmmo(obj: ObjectType): boolean {
  return AMMO_TVALS.has(obj.tval);
}

/** Test whether an object is armor. */
export function objectIsArmor(obj: ObjectType): boolean {
  return ARMOR_TVALS.has(obj.tval);
}

/** Test whether an object is jewelry (ring or amulet). */
export function objectIsJewelry(obj: ObjectType): boolean {
  return JEWELRY_TVALS.has(obj.tval);
}

/** Test whether an object is a light source. */
export function objectIsLight(obj: ObjectType): boolean {
  return obj.tval === TVal.LIGHT;
}

/** Test whether an object is a launcher (bow). */
export function objectIsLauncher(obj: ObjectType): boolean {
  return obj.tval === TVal.BOW;
}

/** Test whether an object is a chest. */
export function objectIsChest(obj: ObjectType): boolean {
  return obj.tval === TVal.CHEST;
}

/** Test whether an object is gold. */
export function objectIsGold(obj: ObjectType): boolean {
  return obj.tval === TVal.GOLD;
}

/** Test whether an object can have charges (wands/staves). */
export function objectCanHaveCharges(obj: ObjectType): boolean {
  return obj.tval === TVal.STAFF || obj.tval === TVal.WAND;
}

/** Test whether an object is edible. */
export function objectIsEdible(obj: ObjectType): boolean {
  return obj.tval === TVal.FOOD || obj.tval === TVal.MUSHROOM;
}

/** Test whether an object is a potion. */
export function objectIsPotion(obj: ObjectType): boolean {
  return obj.tval === TVal.POTION;
}

/** Test whether an object is fuel (flask of oil). */
export function objectIsFuel(obj: ObjectType): boolean {
  return obj.tval === TVal.FLASK;
}

// ---------------------------------------------------------------------------
// Knowledge queries
// ---------------------------------------------------------------------------

/**
 * Test whether the player considers this object "known" (assessed).
 * In the C source, this checks OBJ_NOTICE_ASSESSED.
 */
export function objectIsKnown(obj: ObjectType): boolean {
  return (obj.notice & ObjectNotice.ASSESSED) !== 0;
}

// ---------------------------------------------------------------------------
// Slay / Brand extraction
// ---------------------------------------------------------------------------

/**
 * Get the list of active slays on an object.
 * Requires a global slay definition table for full resolution;
 * here we return the indices of active slays.
 */
export function objectSlayIndices(obj: ObjectType): number[] {
  const result: number[] = [];
  if (!obj.slays) return result;
  for (let i = 0; i < obj.slays.length; i++) {
    if (obj.slays[i]) result.push(i);
  }
  return result;
}

/**
 * Get the list of active slays on an object, resolved against a slay table.
 */
export function objectSlays(obj: ObjectType, slayTable: readonly Slay[]): Slay[] {
  const result: Slay[] = [];
  if (!obj.slays) return result;
  for (let i = 0; i < obj.slays.length; i++) {
    const slay = slayTable[i];
    if (obj.slays[i] && slay) {
      result.push(slay);
    }
  }
  return result;
}

/**
 * Get the list of active brand indices on an object.
 */
export function objectBrandIndices(obj: ObjectType): number[] {
  const result: number[] = [];
  if (!obj.brands) return result;
  for (let i = 0; i < obj.brands.length; i++) {
    if (obj.brands[i]) result.push(i);
  }
  return result;
}

/**
 * Get the list of active brands on an object, resolved against a brand table.
 */
export function objectBrands(
  obj: ObjectType,
  brandTable: readonly Brand[],
): Brand[] {
  const result: Brand[] = [];
  if (!obj.brands) return result;
  for (let i = 0; i < obj.brands.length; i++) {
    const brand = brandTable[i];
    if (obj.brands[i] && brand) {
      result.push(brand);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Slay / Brand copy helpers (port of obj-slays.c copy_slays / copy_brands)
// ---------------------------------------------------------------------------

/**
 * Copy slays from a source boolean array onto a destination, creating
 * the destination if needed. Returns the updated slay array.
 */
export function copySlays(
  dest: boolean[] | null,
  source: boolean[] | null,
): boolean[] | null {
  if (!source) return dest;
  if (!dest) {
    dest = new Array<boolean>(source.length).fill(false);
  }
  for (let i = 0; i < source.length; i++) {
    if (source[i]) dest[i] = true;
  }
  return dest;
}

/**
 * Copy brands from a source boolean array onto a destination, creating
 * the destination if needed. Returns the updated brand array.
 */
export function copyBrands(
  dest: boolean[] | null,
  source: boolean[] | null,
): boolean[] | null {
  if (!source) return dest;
  if (!dest) {
    dest = new Array<boolean>(source.length).fill(false);
  }
  for (let i = 0; i < source.length; i++) {
    if (source[i]) dest[i] = true;
  }
  return dest;
}

// ---------------------------------------------------------------------------
// Random resist helpers (port of obj-make.c random_base_resist / random_high_resist)
// ---------------------------------------------------------------------------

import type { RNG } from "../z/index.js";

/**
 * Pick a random unresisted base element (ACID..COLD).
 * Returns the Element index, or -1 if all base elements already have resistance.
 */
export function randomBaseResist(obj: ObjectType, rng: RNG): number {
  let count = 0;
  for (let i = ELEM_BASE_MIN; i < ELEM_HIGH_MIN; i++) {
    const el = obj.elInfo[i];
    if (el && el.resLevel === 0) count++;
  }
  if (count === 0) return -1;

  let r = rng.randint0(count);
  for (let i = ELEM_BASE_MIN; i < ELEM_HIGH_MIN; i++) {
    const el = obj.elInfo[i];
    if (!el || el.resLevel !== 0) continue;
    if (r === 0) return i;
    r--;
  }
  return -1;
}

/**
 * Pick a random unresisted high element (POIS..DISEN).
 * Returns the Element index, or -1 if all high elements already have resistance.
 */
export function randomHighResist(obj: ObjectType, rng: RNG): number {
  let count = 0;
  for (let i = ELEM_HIGH_MIN; i < ELEM_HIGH_MAX; i++) {
    const el = obj.elInfo[i];
    if (el && el.resLevel === 0) count++;
  }
  if (count === 0) return -1;

  let r = rng.randint0(count);
  for (let i = ELEM_HIGH_MIN; i < ELEM_HIGH_MAX; i++) {
    const el = obj.elInfo[i];
    if (!el || el.resLevel !== 0) continue;
    if (r === 0) return i;
    r--;
  }
  return -1;
}
