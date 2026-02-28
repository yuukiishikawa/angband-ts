/**
 * @file object/knowledge.ts
 * @brief Rune identification and player knowledge system
 *
 * Port of obj-knowledge.c — tracks which item properties (runes) the player
 * has discovered, and provides functions for identifying items.
 *
 * In Angband, "runes" are individual item properties (stat bonuses,
 * resistances, slays, brands, flags, combat bonuses). Players learn
 * runes by using, wearing, or identifying items. Once a rune is learned,
 * it is automatically recognized on all future items.
 *
 * Copyright (c) 2016 Nick McConnell
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { ObjectType, ObjectKind } from "../types/object.js";
import { ObjectNotice } from "../types/object.js";

// ── Rune Categories ──

/**
 * Categories of item properties that can be learned.
 */
export const enum RuneCategory {
  /** Combat bonuses: to-hit, to-damage, to-AC. */
  COMBAT = 0,
  /** Stat modifiers: STR, INT, WIS, DEX, CON. */
  MODIFIER = 1,
  /** Element resistances: ACID, ELEC, FIRE, COLD, etc. */
  RESISTANCE = 2,
  /** Object flags: sustains, protections, abilities. */
  FLAG = 3,
  /** Brands: fire brand, acid brand, etc. */
  BRAND = 4,
  /** Slays: slay dragon, slay undead, etc. */
  SLAY = 5,
  /** Curses. */
  CURSE = 6,
}

// ── Player Knowledge ──

/**
 * Tracks all runes the player has learned globally.
 *
 * Once a rune is learned (e.g., "resist fire" from wearing a ring),
 * it is automatically recognized on all future items.
 */
export interface PlayerKnowledge {
  /** Set of learned rune identifiers (e.g., "mod:0", "res:2", "flag:12"). */
  readonly learnedRunes: Set<string>;
  /** Set of object kind indices that the player is aware of. */
  readonly awareKinds: Set<number>;
}

/**
 * Create a fresh PlayerKnowledge instance.
 */
export function createPlayerKnowledge(): PlayerKnowledge {
  return {
    learnedRunes: new Set<string>(),
    awareKinds: new Set<number>(),
  };
}

// ── Rune identification helpers ──

/**
 * Generate a rune identifier string for a modifier.
 */
function modRuneId(modIndex: number): string {
  return `mod:${modIndex}`;
}

/**
 * Generate a rune identifier string for an element resistance.
 */
function resRuneId(elemIndex: number): string {
  return `res:${elemIndex}`;
}

/**
 * Generate a rune identifier string for an object flag.
 */
function flagRuneId(flagIndex: number): string {
  return `flag:${flagIndex}`;
}

/**
 * Generate a rune identifier string for a brand.
 */
function brandRuneId(brandIndex: number): string {
  return `brand:${brandIndex}`;
}

/**
 * Generate a rune identifier string for a slay.
 */
function slayRuneId(slayIndex: number): string {
  return `slay:${slayIndex}`;
}

// ── Core identification functions ──

/**
 * Learn a specific rune.
 *
 * @param knowledge The player's knowledge state
 * @param runeId    The rune identifier string
 * @returns True if this was a new rune (not previously known)
 */
export function learnRune(knowledge: PlayerKnowledge, runeId: string): boolean {
  if (knowledge.learnedRunes.has(runeId)) return false;
  (knowledge.learnedRunes as Set<string>).add(runeId);
  return true;
}

/**
 * Check if a specific rune has been learned.
 */
export function runeIsKnown(knowledge: PlayerKnowledge, runeId: string): boolean {
  return knowledge.learnedRunes.has(runeId);
}

/**
 * Learn all runes present on an object.
 *
 * This is called when an item is fully identified (e.g., via Identify scroll).
 * It adds all of the item's properties as known runes.
 *
 * @param knowledge The player's knowledge state
 * @param obj       The object to learn from
 * @returns Array of newly learned rune IDs
 */
export function learnObjectRunes(
  knowledge: PlayerKnowledge,
  obj: ObjectType,
): string[] {
  const newRunes: string[] = [];

  // Learn modifiers
  if (obj.modifiers) {
    for (let i = 0; i < obj.modifiers.length; i++) {
      if ((obj.modifiers[i] ?? 0) !== 0) {
        const id = modRuneId(i);
        if (learnRune(knowledge, id)) newRunes.push(id);
      }
    }
  }

  // Learn element resistances
  if (obj.elInfo) {
    for (let i = 0; i < obj.elInfo.length; i++) {
      const info = obj.elInfo[i];
      if (info && info.resLevel !== 0) {
        const id = resRuneId(i);
        if (learnRune(knowledge, id)) newRunes.push(id);
      }
    }
  }

  // Learn brands
  if (obj.brands) {
    for (let i = 0; i < obj.brands.length; i++) {
      if (obj.brands[i]) {
        const id = brandRuneId(i);
        if (learnRune(knowledge, id)) newRunes.push(id);
      }
    }
  }

  // Learn slays
  if (obj.slays) {
    for (let i = 0; i < obj.slays.length; i++) {
      if (obj.slays[i]) {
        const id = slayRuneId(i);
        if (learnRune(knowledge, id)) newRunes.push(id);
      }
    }
  }

  // Learn combat bonuses (always learn if non-zero)
  if (obj.toH !== 0) {
    if (learnRune(knowledge, "combat:toH")) newRunes.push("combat:toH");
  }
  if (obj.toD !== 0) {
    if (learnRune(knowledge, "combat:toD")) newRunes.push("combat:toD");
  }
  if (obj.toA !== 0) {
    if (learnRune(knowledge, "combat:toA")) newRunes.push("combat:toA");
  }

  return newRunes;
}

/**
 * Fully identify an object.
 *
 * Sets the ASSESSED notice flag and learns all runes on the object.
 * Also marks the object kind as aware.
 *
 * @param knowledge The player's knowledge state
 * @param obj       The object to identify
 * @returns Array of newly learned rune IDs
 */
export function identifyObject(
  knowledge: PlayerKnowledge,
  obj: ObjectType,
): string[] {
  // Mark as assessed
  (obj as { notice: number }).notice |= ObjectNotice.ASSESSED;

  // Mark kind as aware
  if (obj.kind) {
    (obj.kind as { aware: boolean }).aware = true;
    (knowledge.awareKinds as Set<number>).add(obj.kind.kidx);
  }

  // Learn all runes
  return learnObjectRunes(knowledge, obj);
}

/**
 * Learn runes that are obvious on equipping (WIELD id-type properties).
 *
 * In Angband, some properties are immediately obvious when worn:
 * - All stat modifiers
 * - Speed bonus
 * - Light radius
 * - Combat bonuses (to-hit, to-damage, to-AC)
 *
 * @param knowledge The player's knowledge state
 * @param obj       The object being equipped
 * @returns Array of newly learned rune IDs
 */
export function learnWieldRunes(
  knowledge: PlayerKnowledge,
  obj: ObjectType,
): string[] {
  const newRunes: string[] = [];

  // Mark as worn
  (obj as { notice: number }).notice |= ObjectNotice.WORN;

  // Learn modifiers (all are obvious on equip)
  if (obj.modifiers) {
    for (let i = 0; i < obj.modifiers.length; i++) {
      if ((obj.modifiers[i] ?? 0) !== 0) {
        const id = modRuneId(i);
        if (learnRune(knowledge, id)) newRunes.push(id);
      }
    }
  }

  // Learn combat bonuses
  if (obj.toH !== 0) {
    if (learnRune(knowledge, "combat:toH")) newRunes.push("combat:toH");
  }
  if (obj.toD !== 0) {
    if (learnRune(knowledge, "combat:toD")) newRunes.push("combat:toD");
  }
  if (obj.toA !== 0) {
    if (learnRune(knowledge, "combat:toA")) newRunes.push("combat:toA");
  }

  // If we learned everything, mark as assessed
  if (newRunes.length > 0) {
    // Check if all properties are now known
    const allKnown = checkAllRunesKnown(knowledge, obj);
    if (allKnown) {
      (obj as { notice: number }).notice |= ObjectNotice.ASSESSED;
    }
  }

  return newRunes;
}

/**
 * Check if all runes on an object are known.
 */
function checkAllRunesKnown(knowledge: PlayerKnowledge, obj: ObjectType): boolean {
  // Check modifiers
  if (obj.modifiers) {
    for (let i = 0; i < obj.modifiers.length; i++) {
      if ((obj.modifiers[i] ?? 0) !== 0 && !knowledge.learnedRunes.has(modRuneId(i))) {
        return false;
      }
    }
  }

  // Check resistances
  if (obj.elInfo) {
    for (let i = 0; i < obj.elInfo.length; i++) {
      const info = obj.elInfo[i];
      if (info && info.resLevel !== 0 && !knowledge.learnedRunes.has(resRuneId(i))) {
        return false;
      }
    }
  }

  // Check brands
  if (obj.brands) {
    for (let i = 0; i < obj.brands.length; i++) {
      if (obj.brands[i] && !knowledge.learnedRunes.has(brandRuneId(i))) return false;
    }
  }

  // Check slays
  if (obj.slays) {
    for (let i = 0; i < obj.slays.length; i++) {
      if (obj.slays[i] && !knowledge.learnedRunes.has(slayRuneId(i))) return false;
    }
  }

  return true;
}

/**
 * Check if an object is fully identified (all runes known and kind aware).
 *
 * Port of `object_is_known()` with full rune checking.
 */
export function objectIsFullyKnown(obj: ObjectType): boolean {
  return (obj.notice & ObjectNotice.ASSESSED) !== 0;
}

/**
 * Check if a specific property on an object is known to the player.
 *
 * @param knowledge The player's knowledge
 * @param category  The rune category
 * @param index     The property index within that category
 */
export function objectPropertyIsKnown(
  knowledge: PlayerKnowledge,
  category: RuneCategory,
  index: number,
): boolean {
  switch (category) {
    case RuneCategory.COMBAT:
      return knowledge.learnedRunes.has(`combat:${["toH", "toD", "toA"][index] ?? index}`);
    case RuneCategory.MODIFIER:
      return knowledge.learnedRunes.has(modRuneId(index));
    case RuneCategory.RESISTANCE:
      return knowledge.learnedRunes.has(resRuneId(index));
    case RuneCategory.FLAG:
      return knowledge.learnedRunes.has(flagRuneId(index));
    case RuneCategory.BRAND:
      return knowledge.learnedRunes.has(brandRuneId(index));
    case RuneCategory.SLAY:
      return knowledge.learnedRunes.has(slayRuneId(index));
    default:
      return false;
  }
}
