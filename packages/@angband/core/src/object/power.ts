/**
 * @file object/power.ts
 * @brief Object power and value calculation
 *
 * Port of obj-power.c — calculation of object power ratings used
 * for balancing, generation decisions, and item evaluation.
 *
 * Copyright (c) 2001 Chris Carr, Chris Robertson
 * Revised in 2009-11 by Chris Carr, Peter Denison
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type {
  ObjectType,
  Slay,
  Brand,
  ObjProperty,
} from "../types/index.js";
import {
  TVal,
  ObjectModifier,
  ObjectFlag,
  ObjPropertyType,
  Element,
} from "../types/index.js";
import { FLAG_END } from "../z/index.js";
import {
  objectIsWeapon,
  objectIsArmor,
  objectIsMeleeWeapon,
  objectIsAmmo,
  objectIsJewelry,
  objectIsLauncher,
  objectIsWearable,
} from "./properties.js";

// ---------------------------------------------------------------------------
// Power calculation constants (from obj-power.h)
// ---------------------------------------------------------------------------

export const DAMAGE_POWER = 5;
export const TO_HIT_POWER = 3;
export const BASE_AC_POWER = 2;
export const TO_AC_POWER = 2;
export const BASE_JEWELRY_POWER = 4;
export const BASE_ARMOUR_POWER = 1;
export const MAX_BLOWS = 5;
export const NONWEAP_DAMAGE = 15;
export const WEAP_DAMAGE = 12;
export const INHIBIT_POWER = 20000;
export const INHIBIT_BLOWS = 3;
export const INHIBIT_MIGHT = 4;
export const INHIBIT_SHOTS = 21;
export const HIGH_TO_AC = 26;
export const VERYHIGH_TO_AC = 36;
export const INHIBIT_AC = 56;

// ---------------------------------------------------------------------------
// Archery data for launcher/ammo power calculations
// ---------------------------------------------------------------------------

interface ArcheryData {
  readonly ammoTval: TVal;
  readonly ammoDam: number;
  readonly launchDam: number;
  readonly launchMult: number;
}

const ARCHERY: readonly ArcheryData[] = [
  { ammoTval: TVal.SHOT, ammoDam: 10, launchDam: 9, launchMult: 4 },
  { ammoTval: TVal.ARROW, ammoDam: 12, launchDam: 9, launchMult: 5 },
  { ammoTval: TVal.BOLT, ammoDam: 14, launchDam: 9, launchMult: 7 },
];

// ---------------------------------------------------------------------------
// Ability power table (for combined stat bonuses)
// ---------------------------------------------------------------------------

const ABILITY_POWER: readonly number[] = [
  0, 0, 0, 0, 0, 0, 0, 2, 4, 6, 8,
  12, 16, 20, 24, 30, 36, 42, 48, 56, 64,
  74, 84, 96, 110,
];

// ---------------------------------------------------------------------------
// Element power data
// ---------------------------------------------------------------------------

const enum ElType {
  LRES = 0,
  HRES = 1,
}

interface ElementPower {
  readonly name: string;
  readonly type: ElType;
  readonly ignorePower: number;
  readonly vulnPower: number;
  readonly resPower: number;
  readonly imPower: number;
}

const EL_POWERS: readonly ElementPower[] = [
  { name: "acid", type: ElType.LRES, ignorePower: 3, vulnPower: -6, resPower: 5, imPower: 38 },
  { name: "electricity", type: ElType.LRES, ignorePower: 1, vulnPower: -6, resPower: 6, imPower: 35 },
  { name: "fire", type: ElType.LRES, ignorePower: 3, vulnPower: -6, resPower: 6, imPower: 40 },
  { name: "cold", type: ElType.LRES, ignorePower: 1, vulnPower: -6, resPower: 6, imPower: 37 },
  { name: "poison", type: ElType.HRES, ignorePower: 0, vulnPower: 0, resPower: 28, imPower: 0 },
  { name: "light", type: ElType.HRES, ignorePower: 0, vulnPower: 0, resPower: 6, imPower: 0 },
  { name: "dark", type: ElType.HRES, ignorePower: 0, vulnPower: 0, resPower: 16, imPower: 0 },
  { name: "sound", type: ElType.HRES, ignorePower: 0, vulnPower: 0, resPower: 14, imPower: 0 },
  { name: "shards", type: ElType.HRES, ignorePower: 0, vulnPower: 0, resPower: 8, imPower: 0 },
  { name: "nexus", type: ElType.HRES, ignorePower: 0, vulnPower: 0, resPower: 15, imPower: 0 },
  { name: "nether", type: ElType.HRES, ignorePower: 0, vulnPower: 0, resPower: 20, imPower: 0 },
  { name: "chaos", type: ElType.HRES, ignorePower: 0, vulnPower: 0, resPower: 20, imPower: 0 },
  { name: "disenchantment", type: ElType.HRES, ignorePower: 0, vulnPower: 0, resPower: 20, imPower: 0 },
];

// ---------------------------------------------------------------------------
// Individual power component functions
// ---------------------------------------------------------------------------

/**
 * Calculate power contribution from slay/brand combinations.
 *
 * @param slays     - Active slay booleans.
 * @param brands    - Active brand booleans.
 * @param slayTable - Global slay definitions.
 * @param brandTable - Global brand definitions.
 * @param dicePwr   - Power from damage dice.
 */
export function slayBrandPower(
  slays: boolean[] | null,
  brands: boolean[] | null,
  slayTable: readonly Slay[],
  brandTable: readonly Brand[],
  dicePwr: number,
): number {
  let p = 0;
  let numBrands = 0;
  let numSlays = 0;
  let numKills = 0;
  let bestPower = 1;

  if (brands) {
    for (let i = 1; i < brands.length; i++) {
      const b = brandTable[i];
      if (brands[i] && b) {
        numBrands++;
        if (b.power > bestPower) bestPower = b.power;
      }
    }
  }

  if (slays) {
    for (let i = 1; i < slays.length; i++) {
      const s = slayTable[i];
      if (slays[i] && s) {
        if (s.multiplier <= 3) {
          numSlays++;
        } else {
          numKills++;
        }
        if (s.power > bestPower) bestPower = s.power;
      }
    }
  }

  if (numSlays + numBrands + numKills === 0) return 0;

  // Base slay power
  p += Math.floor((dicePwr * dicePwr * (bestPower - 100)) / 2500);

  // Bonuses for multiple slays/brands
  if (numSlays > 1) {
    p += Math.floor((numSlays * numSlays * dicePwr) / (DAMAGE_POWER * 5));
  }
  if (numBrands > 1) {
    p += Math.floor((2 * numBrands * numBrands * dicePwr) / (DAMAGE_POWER * 5));
  }
  if (numSlays > 0 && numBrands > 0) {
    p += Math.floor((numSlays * numBrands * dicePwr) / (DAMAGE_POWER * 5));
  }
  if (numKills > 1) {
    p += Math.floor((3 * numKills * numKills * dicePwr) / (DAMAGE_POWER * 5));
  }

  // Full set bonuses
  if (numSlays === 8) p += 10;
  if (numBrands === 5) p += 20;
  if (numKills === 3) p += 20;

  return p;
}

/**
 * Simplified slay power: sum of slay.power values.
 */
export function slayPower(slays: readonly Slay[]): number {
  let total = 0;
  for (const s of slays) {
    total += s.power;
  }
  return total;
}

/**
 * Simplified brand power: sum of brand.power values.
 */
export function brandPower(brands: readonly Brand[]): number {
  let total = 0;
  for (const b of brands) {
    total += b.power;
  }
  return total;
}

/**
 * Calculate combat power from to-hit and to-damage bonuses and dice.
 */
export function combatPower(
  toH: number,
  toD: number,
  dice: number,
  sides: number,
): number {
  let p = 0;

  // To-hit power
  p += Math.floor((toH * TO_HIT_POWER) / 2);

  // To-damage power
  p += Math.floor((toD * DAMAGE_POWER) / 2);

  // Damage dice power (for melee weapons / ammo)
  if (dice > 0 && sides > 0) {
    p += Math.floor((dice * (sides + 1) * DAMAGE_POWER) / 4);
  }

  return p;
}

/**
 * Calculate armor power from to-armor bonus.
 */
export function armorPower(toA: number): number {
  let p = 0;
  if (toA === 0) return 0;

  p += Math.floor((toA * TO_AC_POWER) / 2);

  if (toA > HIGH_TO_AC) {
    p += (toA - (HIGH_TO_AC - 1)) * TO_AC_POWER;
  }
  if (toA > VERYHIGH_TO_AC) {
    p += (toA - (VERYHIGH_TO_AC - 1)) * TO_AC_POWER * 2;
  }
  if (toA >= INHIBIT_AC) {
    p += INHIBIT_POWER;
  }

  return p;
}

/**
 * Calculate power for a single modifier value.
 * Uses a property's base power and per-tval type_mult if available.
 */
export function modifierPower(
  mod: ObjectModifier,
  value: number,
  property?: ObjProperty,
  tval?: TVal,
): number {
  if (value === 0) return 0;
  if (!property || !property.power) return value;

  const typeMult = (tval !== undefined && property.typeMult[tval])
    ? property.typeMult[tval]
    : 1;
  return value * property.power * typeMult;
}

// ---------------------------------------------------------------------------
// Full object power calculation (port of object_power)
// ---------------------------------------------------------------------------

/**
 * Calculate the overall power rating of an object.
 *
 * This is a simplified version of the C object_power() function.
 * It calculates power contributions from: combat bonuses, armor bonuses,
 * damage dice, slays/brands, element resistances, object flags,
 * modifiers, and activations.
 *
 * @param obj        - The object to evaluate.
 * @param slayTable  - Global slay definitions (optional).
 * @param brandTable - Global brand definitions (optional).
 * @param properties - Object property definitions (optional).
 */
export function calculateObjectPower(
  obj: ObjectType,
  slayTable?: readonly Slay[],
  brandTable?: readonly Brand[],
  properties?: readonly ObjProperty[],
): number {
  let p = 0;

  // --- To-damage power ---
  p += Math.floor((obj.toD * DAMAGE_POWER) / 2);

  // Non-weapon to_dam counts double
  if (!objectIsMeleeWeapon(obj) && !objectIsAmmo(obj) && !objectIsLauncher(obj)) {
    p += obj.toD * DAMAGE_POWER;
  }

  // --- Damage dice power ---
  if (objectIsMeleeWeapon(obj) || objectIsAmmo(obj)) {
    p += Math.floor((obj.dd * (obj.ds + 1) * DAMAGE_POWER) / 4);
  } else if (
    !objectIsLauncher(obj) &&
    (obj.brands || obj.slays ||
     (obj.modifiers[ObjectModifier.BLOWS] ?? 0) > 0 ||
     (obj.modifiers[ObjectModifier.SHOTS] ?? 0) > 0 ||
     (obj.modifiers[ObjectModifier.MIGHT] ?? 0) > 0)
  ) {
    p += WEAP_DAMAGE * DAMAGE_POWER;
  }

  // --- Slay/Brand power ---
  const dicePwr = objectIsMeleeWeapon(obj) || objectIsAmmo(obj)
    ? Math.floor((obj.dd * (obj.ds + 1) * DAMAGE_POWER) / 4)
    : 0;

  if (slayTable && brandTable) {
    p += slayBrandPower(obj.slays, obj.brands, slayTable, brandTable, dicePwr);
  }

  // --- Extra blows power ---
  const blows = obj.modifiers[ObjectModifier.BLOWS] ?? 0;
  if (blows > 0) {
    if (blows >= INHIBIT_BLOWS) {
      p += INHIBIT_POWER;
    } else {
      p = Math.floor(p * (MAX_BLOWS + blows) / MAX_BLOWS);
      p += Math.floor((NONWEAP_DAMAGE * blows * DAMAGE_POWER) / 2);
    }
  }

  // --- Extra shots power ---
  const shots = obj.modifiers[ObjectModifier.SHOTS] ?? 0;
  if (shots > 0) {
    if (shots >= INHIBIT_SHOTS) {
      p += INHIBIT_POWER;
    } else {
      p = Math.floor(p * (10 + shots) / 10);
    }
  }

  // --- Rescale bow power ---
  if (objectIsLauncher(obj)) {
    p = Math.floor(p / MAX_BLOWS);
  }

  // --- To-hit power ---
  p += Math.floor((obj.toH * TO_HIT_POWER) / 2);

  // --- Base AC power ---
  if (obj.ac > 0) {
    p += BASE_ARMOUR_POWER;
    let q = Math.floor((obj.ac * BASE_AC_POWER) / 2);
    if (obj.weight > 0) {
      const wRatio = Math.min(450, Math.floor((750 * (obj.ac + obj.toA)) / obj.weight));
      q = Math.floor((q * wRatio) / 100);
    } else {
      q *= 5;
    }
    p += q;
  }

  // --- To-AC power ---
  p += armorPower(obj.toA);

  // --- Jewelry base power ---
  if (objectIsJewelry(obj)) {
    p += BASE_JEWELRY_POWER;
  }

  // --- Modifier power ---
  if (properties) {
    let extraStatBonus = 0;
    for (let i = 0; i < ObjectModifier.MAX; i++) {
      const k = obj.modifiers[i] ?? 0;
      if (k === 0) continue;
      // Find matching property
      const prop = properties.find(
        (pp) => (pp.type === ObjPropertyType.MOD || pp.type === ObjPropertyType.STAT) && pp.index === i,
      );
      if (prop) {
        extraStatBonus += k * prop.mult;
        if (prop.power) {
          const tm = prop.typeMult[obj.tval] ?? 1;
          p += k * prop.power * tm;
        }
      }
    }
    // Extra power for combined ability bonuses
    if (extraStatBonus > 249) {
      p += INHIBIT_POWER;
    } else if (extraStatBonus > 0) {
      const idx = Math.min(Math.floor(extraStatBonus / 10), ABILITY_POWER.length - 1);
      p += ABILITY_POWER[idx] ?? 0;
    }
  }

  // --- Element power ---
  for (let i = 0; i < EL_POWERS.length && i < obj.elInfo.length; i++) {
    const info = obj.elInfo[i];
    if (!info) continue;
    const ep = EL_POWERS[i]!;

    // Ignore power
    if (info.flags.has(2 /* ElementInfoFlag.IGNORE */)) {
      p += ep.ignorePower;
    }

    // Vulnerability
    if (info.resLevel === -1) {
      p += ep.vulnPower;
    } else if (info.resLevel === 1) {
      p += ep.resPower;
    } else if (info.resLevel === 3) {
      p += ep.imPower + ep.resPower;
    }
  }

  // --- Activation power ---
  if (obj.activation) {
    p += obj.activation.power;
  } else if (obj.kind?.power) {
    p += obj.kind.power;
  }

  return p;
}
