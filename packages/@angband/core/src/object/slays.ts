/**
 * @file object/slays.ts
 * @brief Slay and brand damage calculations
 *
 * Port of obj-slays.c — determines how slays and brands on weapons
 * modify damage against specific monsters.
 *
 * Copyright (c) 2024 Angband-TS Contributors
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { ObjectType } from "../types/object.js";
import type { Brand, Slay } from "../types/object.js";
import type { Monster } from "../types/monster.js";

// ── Result type ──

/** Result of searching for the best slay/brand multiplier. */
export interface SlayResult {
  /** The best multiplier found (x100, e.g. 300 = 3x). 0 if none apply. */
  readonly multiplier: number;
  /** Combat verb for the message (e.g. "burn", "smite"). Null if none. */
  readonly verb: string | null;
}

// ── Core functions ──

/**
 * Check if a brand applies to a monster and return its multiplier.
 *
 * A brand applies unless the monster has the resist flag.
 * If the monster has the vulnerability flag, damage is increased by 1/4.
 *
 * @param brand   The brand to check.
 * @param monster The target monster.
 * @returns       The effective multiplier (x100), or 0 if resisted.
 */
function checkBrand(brand: Brand, monster: Monster): number {
  // Monster resists this brand
  if (brand.resistFlag !== 0 && monster.race.flags.has(brand.resistFlag)) {
    return 0;
  }

  let mult = brand.multiplier;

  // Monster is vulnerable — add 1/4 of the multiplier
  if (brand.vulnFlag !== 0 && monster.race.flags.has(brand.vulnFlag)) {
    mult = mult + Math.floor(mult / 4);
  }

  return mult;
}

/**
 * Check if a slay applies to a monster and return its multiplier.
 *
 * A slay applies if the monster has the matching race flag.
 *
 * @param slay    The slay to check.
 * @param monster The target monster.
 * @returns       The effective multiplier (x100), or 0 if it doesn't apply.
 */
function checkSlay(slay: Slay, monster: Monster): number {
  if (slay.raceFlag !== 0 && monster.race.flags.has(slay.raceFlag)) {
    return slay.multiplier;
  }
  return 0;
}

/**
 * Find the best slay or brand multiplier for a weapon against a monster.
 *
 * Port of improve_attack_modifier from obj-slays.c.
 *
 * Checks all brands and slays on the weapon and returns the one
 * with the highest multiplier that applies to the target monster.
 *
 * @param obj     The weapon object (must have brands/slays arrays).
 * @param monster The target monster.
 * @param brands  The global brand table.
 * @param slays   The global slay table.
 * @param melee   True for melee (uses meleeVerb), false for ranged (rangeVerb).
 * @returns       The best multiplier and combat verb, or { multiplier: 0, verb: null }.
 */
export function findBestMultiplier(
  obj: ObjectType,
  monster: Monster,
  brands: readonly Brand[],
  slays: readonly Slay[],
  melee: boolean = true,
): SlayResult {
  let bestMult = 0;
  let bestVerb: string | null = null;

  // Check brands
  if (obj.brands) {
    for (let i = 0; i < obj.brands.length && i < brands.length; i++) {
      if (!obj.brands[i]) continue;
      const brand = brands[i]!;
      const mult = checkBrand(brand, monster);
      if (mult > bestMult) {
        bestMult = mult;
        bestVerb = brand.verb;
      }
    }
  }

  // Check slays
  if (obj.slays) {
    for (let i = 0; i < obj.slays.length && i < slays.length; i++) {
      if (!obj.slays[i]) continue;
      const slay = slays[i]!;
      const mult = checkSlay(slay, monster);
      if (mult > bestMult) {
        bestMult = mult;
        bestVerb = melee ? slay.meleeVerb : slay.rangeVerb;
      }
    }
  }

  return { multiplier: bestMult, verb: bestVerb };
}

/**
 * Apply a slay/brand multiplier to base damage.
 *
 * The multiplier is x100 (e.g. 300 = 3x), so we divide by 100 after.
 *
 * @param baseDamage The raw weapon damage (dd*ds roll).
 * @param multiplier The slay/brand multiplier (x100).
 * @returns          The modified damage.
 */
export function applySlayBrand(baseDamage: number, multiplier: number): number {
  if (multiplier <= 0) return baseDamage;
  return Math.floor(baseDamage * multiplier / 100);
}
