/**
 * @file project/monster.ts
 * @brief Projection effects on monsters
 *
 * Port of project-mon.c — applies elemental damage to monsters,
 * handling resistances, immunities, and vulnerabilities.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Loc } from "../z/index.js";
import type { RNG } from "../z/index.js";
import type { Chunk } from "../types/index.js";
import { Element } from "../types/index.js";
import { MonsterRaceFlag } from "../types/index.js";
import type { Monster } from "../types/index.js";

// ── Result type ──

/** Result of applying elemental damage to a monster. */
export interface MonsterProjectResult {
  /** Actual damage dealt after adjustments */
  readonly damage: number;
  /** Whether the monster was killed */
  readonly killed: boolean;
  /** Whether the monster resisted the element */
  readonly resisted: boolean;
  /** Descriptive message */
  readonly message: string;
}

// ── Element resistance mapping ──

/**
 * Maps an Element to the MonsterRaceFlag that grants immunity to it.
 * Not all elements have a corresponding immunity flag.
 */
function getImmunityFlag(element: Element): MonsterRaceFlag | null {
  switch (element) {
    case Element.ACID:   return MonsterRaceFlag.IM_ACID;
    case Element.ELEC:   return MonsterRaceFlag.IM_ELEC;
    case Element.FIRE:   return MonsterRaceFlag.IM_FIRE;
    case Element.COLD:   return MonsterRaceFlag.IM_COLD;
    case Element.POIS:   return MonsterRaceFlag.IM_POIS;
    case Element.NETHER: return MonsterRaceFlag.IM_NETHER;
    case Element.WATER:  return MonsterRaceFlag.IM_WATER;
    case Element.PLASMA: return MonsterRaceFlag.IM_PLASMA;
    case Element.NEXUS:  return MonsterRaceFlag.IM_NEXUS;
    case Element.DISEN:  return MonsterRaceFlag.IM_DISEN;
    default:             return null;
  }
}

/**
 * Maps an Element to the MonsterRaceFlag indicating vulnerability.
 */
function getVulnerabilityFlag(element: Element): MonsterRaceFlag | null {
  switch (element) {
    case Element.FIRE:  return MonsterRaceFlag.HURT_FIRE;
    case Element.COLD:  return MonsterRaceFlag.HURT_COLD;
    case Element.LIGHT: return MonsterRaceFlag.HURT_LIGHT;
    default:            return null;
  }
}

// ── Helper: get monster at grid ──

/**
 * Find the monster at a specific grid location.
 * Returns null if there is no monster there.
 *
 * Since the Chunk interface does not hold a direct monster array reference,
 * we check if the square's mon field is positive (indicating a monster, not
 * the player). We return a minimal Monster reference or null.
 *
 * NOTE: In the full game, you would look up chunk.monsters[sq.mon].
 * For this module, we return basic info from the square.
 */
function getMonsterAt(chunk: Chunk, g: Loc): { mon: number } | null {
  if (g.y < 0 || g.y >= chunk.height || g.x < 0 || g.x >= chunk.width) {
    return null;
  }
  const sq = chunk.squares[g.y]![g.x]!;
  if (sq.mon > 0) {
    return { mon: sq.mon };
  }
  return null;
}

// ── Main function ──

/**
 * Apply elemental damage to a monster at a grid location.
 *
 * Checks for immunities, resistances, and vulnerabilities based on
 * the monster's race flags, then calculates the adjusted damage.
 *
 * @param chunk   The dungeon level
 * @param g       Grid location of the target monster
 * @param element The element type of the projection
 * @param damage  Base damage before adjustments
 * @param source  Origin grid of the projection
 * @param rng     Random number generator
 * @param monster Optional monster instance for detailed processing
 * @returns Result describing the damage and whether the monster was killed
 */
export function projectMonster(
  chunk: Chunk,
  g: Loc,
  element: Element,
  damage: number,
  source: Loc,
  rng: RNG,
  monster?: Monster,
): MonsterProjectResult {
  // Check if there is a monster at this grid
  const monRef = getMonsterAt(chunk, g);
  if (!monRef) {
    return { damage: 0, killed: false, resisted: false, message: "" };
  }

  // If we have a full monster reference, use its race flags
  let adjustedDamage = damage;
  let resisted = false;
  let immune = false;
  let vulnerable = false;

  if (monster) {
    const race = monster.race;

    // Check immunity
    const immFlag = getImmunityFlag(element);
    if (immFlag !== null && race.flags.has(immFlag)) {
      immune = true;
      adjustedDamage = 0;
    }

    // Check vulnerability (only if not immune)
    if (!immune) {
      const vulnFlag = getVulnerabilityFlag(element);
      if (vulnFlag !== null && race.flags.has(vulnFlag)) {
        vulnerable = true;
        adjustedDamage = Math.floor(adjustedDamage * 2);
      }
    }

    // For non-elemental types, check if undead/evil for holy orb
    if (!immune && element === Element.HOLY_ORB) {
      if (race.flags.has(MonsterRaceFlag.EVIL)) {
        adjustedDamage = Math.floor(adjustedDamage * 2);
        vulnerable = true;
      }
      if (race.flags.has(MonsterRaceFlag.UNDEAD)) {
        adjustedDamage = Math.floor(adjustedDamage * 3 / 2);
        vulnerable = true;
      }
    }

    // Nonliving creatures resist some elements
    if (!immune && race.flags.has(MonsterRaceFlag.NONLIVING)) {
      if (element === Element.NETHER || element === Element.POIS) {
        resisted = true;
        adjustedDamage = Math.floor(adjustedDamage * 3 / 9);
      }
    }
  } else {
    // Without a full monster reference, use basic damage
    // (no resistance/immunity checks possible)
    adjustedDamage = damage;
  }

  // Determine message
  let message: string;
  if (immune) {
    message = "The monster is unaffected!";
    resisted = true;
  } else if (vulnerable) {
    message = "The monster is hit hard!";
  } else if (resisted) {
    message = "The monster resists.";
  } else {
    message = adjustedDamage > 0 ? "The monster is hit." : "";
  }

  // Apply damage to the monster instance if provided
  let killed = false;
  if (monster && adjustedDamage > 0) {
    monster.hp -= adjustedDamage;
    if (monster.hp <= 0) {
      killed = true;
      monster.hp = 0;
      message = "The monster is destroyed!";
    }
  }

  // Clear the monster from the square if killed
  if (killed) {
    const sq = chunk.squares[g.y]?.[g.x];
    if (sq) {
      sq.mon = 0 as typeof sq.mon;
    }
  }

  return {
    damage: adjustedDamage,
    killed,
    resisted: resisted || immune,
    message,
  };
}
