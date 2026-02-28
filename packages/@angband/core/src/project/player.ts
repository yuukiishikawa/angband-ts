/**
 * @file project/player.ts
 * @brief Projection effects on the player
 *
 * Port of project-player.c — applies elemental damage to the player,
 * handling resistances, vulnerabilities, and side effects (stat drain,
 * timed effects like blindness, confusion, etc.).
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { RNG } from "../z/index.js";
import { Element, ELEM_HIGH_MAX } from "../types/index.js";
import type { Player } from "../types/index.js";

// ── Result type ──

/** Result of applying elemental damage to the player. */
export interface PlayerProjectResult {
  /** Actual damage dealt after resistance adjustments */
  readonly damage: number;
  /** Whether the player resisted (fully or partially) */
  readonly resisted: boolean;
  /** Side effects that occurred (descriptive strings) */
  readonly sideEffects: string[];
  /** Descriptive message for the main damage */
  readonly message: string;
}

// ── Element name mapping ──

/** Get a human-readable name for an element. */
function elementName(element: Element): string {
  switch (element) {
    case Element.ACID:    return "acid";
    case Element.ELEC:    return "lightning";
    case Element.FIRE:    return "fire";
    case Element.COLD:    return "cold";
    case Element.POIS:    return "poison";
    case Element.LIGHT:   return "light";
    case Element.DARK:    return "darkness";
    case Element.SOUND:   return "sound";
    case Element.SHARD:   return "shards";
    case Element.NEXUS:   return "nexus";
    case Element.NETHER:  return "nether";
    case Element.CHAOS:   return "chaos";
    case Element.DISEN:   return "disenchantment";
    case Element.WATER:   return "water";
    case Element.ICE:     return "ice";
    case Element.GRAVITY: return "gravity";
    case Element.INERTIA: return "inertia";
    case Element.FORCE:   return "force";
    case Element.TIME:    return "time";
    case Element.PLASMA:  return "plasma";
    case Element.METEOR:  return "meteors";
    case Element.MISSILE: return "missiles";
    case Element.MANA:    return "mana";
    case Element.HOLY_ORB: return "holy power";
    case Element.ARROW:   return "arrows";
    default:              return "an unknown force";
  }
}

// ── Resistance helpers ──

/**
 * Get the player's resistance level for a given element.
 *
 * Resistance levels in Angband:
 * - -1 = vulnerable (takes 4/3 damage)
 * -  0 = normal
 * -  1 = single resist (takes ~1/3 damage)
 * -  2 = double resist (takes ~1/9 damage)
 * -  3 = immune (takes 0 damage)
 *
 * ICE uses the COLD resistance.
 */
function getResistance(player: Player, element: Element): number {
  // ICE uses cold resistance
  const resElement = element === Element.ICE ? Element.COLD : element;

  // Only elements within the element info array have resistances
  if (resElement >= 0 && resElement < (player.state.elInfo?.length ?? 0)) {
    const info = player.state.elInfo[resElement];
    if (info) {
      return info.resLevel;
    }
  }
  return 0;
}

/**
 * Adjust damage based on resistance level.
 *
 * Port of adjust_dam() from project-player.c.
 */
function adjustDamage(
  damage: number,
  resistance: number,
  element: Element,
): number {
  // Immune
  if (resistance >= 3) return 0;

  // Vulnerable
  if (resistance < 0) {
    return Math.floor(damage * 4 / 3);
  }

  // Apply resistance layers
  let adjusted = damage;
  for (let i = 0; i < resistance; i++) {
    // Standard Angband: single resist divides by ~3
    adjusted = Math.floor(adjusted / 3);
  }

  return Math.max(adjusted, 0);
}

// ── Main function ──

/**
 * Apply elemental damage to the player.
 *
 * Handles resistances, vulnerabilities, and side effects such as:
 * - Stat drain (e.g. nether drains experience)
 * - Timed effects (e.g. fire can blind, cold can slow)
 * - Inventory damage (noted as a side effect but not applied here)
 *
 * @param player  The player instance
 * @param element The element type of the projection
 * @param damage  Base damage before adjustments
 * @param rng     Random number generator
 * @returns Result describing the damage and effects
 */
export function projectPlayer(
  player: Player,
  element: Element,
  damage: number,
  rng: RNG,
): PlayerProjectResult {
  const sideEffects: string[] = [];
  const name = elementName(element);

  // Get resistance and adjust damage
  const resistance = getResistance(player, element);
  const adjustedDamage = adjustDamage(damage, resistance, element);

  // Determine if resisted
  const resisted = resistance > 0;
  const immune = resistance >= 3;

  // Build the main message
  let message: string;
  if (immune) {
    message = `You are immune to ${name}!`;
  } else if (resisted) {
    message = `You resist the ${name}.`;
  } else if (adjustedDamage > 0) {
    message = `You are hit by ${name}!`;
  } else {
    message = "";
  }

  // Apply side effects (only if not immune and damage was dealt)
  if (!immune && adjustedDamage > 0) {
    applySideEffects(player, element, adjustedDamage, rng, sideEffects);
  }

  // Apply HP damage
  if (adjustedDamage > 0) {
    player.chp -= adjustedDamage;
    if (player.chp < 0) {
      player.chp = 0;
      player.isDead = true;
      sideEffects.push("You die.");
    }
  }

  return {
    damage: adjustedDamage,
    resisted: resisted || immune,
    sideEffects,
    message,
  };
}

/**
 * Apply elemental side effects beyond raw damage.
 *
 * These are the extra effects that elements can cause, such as
 * stat drain, blindness, confusion, etc.
 */
function applySideEffects(
  player: Player,
  element: Element,
  damage: number,
  rng: RNG,
  effects: string[],
): void {
  switch (element) {
    case Element.POIS: {
      // Poison: add poisoned timed effect duration
      // TimedEffect.POISONED = 7
      const duration = rng.div(10) + 10;
      if (player.timed[7] !== undefined) {
        player.timed[7] += duration;
        effects.push("You are poisoned!");
      }
      break;
    }

    case Element.NETHER: {
      // Nether: drain experience
      if (damage > 5) {
        const expDrain = Math.floor(damage / 2);
        player.exp = Math.max(0, player.exp - expDrain);
        effects.push("You feel your life force draining away!");
      }
      break;
    }

    case Element.CHAOS: {
      // Chaos: possible confusion
      // TimedEffect.CONFUSED = 4
      if (rng.div(100) < 30) {
        const duration = rng.div(20) + 10;
        if (player.timed[4] !== undefined) {
          player.timed[4] += duration;
          effects.push("You are confused!");
        }
      }
      // Chaos: possible hallucination
      // TimedEffect.IMAGE = 6
      if (rng.div(100) < 20) {
        const duration = rng.div(10) + 5;
        if (player.timed[6] !== undefined) {
          player.timed[6] += duration;
          effects.push("You feel your sanity slipping!");
        }
      }
      break;
    }

    case Element.DISEN: {
      // Disenchantment: noted but equipment effects not applied here
      effects.push("You feel a force draining your equipment.");
      break;
    }

    case Element.SOUND: {
      // Sound: possible stun
      // TimedEffect.STUN = 9
      if (rng.div(100) < 40) {
        const duration = rng.div(10) + 5;
        if (player.timed[9] !== undefined) {
          player.timed[9] += duration;
          effects.push("You are stunned!");
        }
      }
      break;
    }

    case Element.GRAVITY: {
      // Gravity: possible slow
      // TimedEffect.SLOW = 1
      if (rng.div(100) < 30) {
        const duration = rng.div(4) + 4;
        if (player.timed[1] !== undefined) {
          player.timed[1] += duration;
          effects.push("You feel yourself moving slower!");
        }
      }
      break;
    }

    case Element.INERTIA: {
      // Inertia: guaranteed slow effect
      // TimedEffect.SLOW = 1
      const duration = rng.div(4) + 4;
      if (player.timed[1] !== undefined) {
        player.timed[1] += duration;
        effects.push("You feel very sluggish!");
      }
      break;
    }

    case Element.TIME: {
      // Time: drain experience
      const expDrain = Math.floor(damage * 2 / 3);
      player.exp = Math.max(0, player.exp - expDrain);
      effects.push("You feel time itself wearing you away!");
      break;
    }

    case Element.DARK: {
      // Darkness: possible blindness
      // TimedEffect.BLIND = 2
      if (rng.div(100) < 50) {
        const duration = rng.div(5) + 3;
        if (player.timed[2] !== undefined) {
          player.timed[2] += duration;
          effects.push("You are blinded!");
        }
      }
      break;
    }

    case Element.LIGHT: {
      // Light: possible blindness
      // TimedEffect.BLIND = 2
      if (rng.div(100) < 30) {
        const duration = rng.div(3) + 2;
        if (player.timed[2] !== undefined) {
          player.timed[2] += duration;
          effects.push("You are blinded by the flash!");
        }
      }
      break;
    }

    case Element.NEXUS: {
      // Nexus: possible teleportation effect (noted but not applied here)
      effects.push("You feel reality warp around you!");
      break;
    }

    // Base elements (acid, elec, fire, cold) may damage inventory
    // but that is handled separately and noted here
    case Element.ACID:
      effects.push("Your equipment hisses!");
      break;

    case Element.FIRE:
      effects.push("Your belongings are singed!");
      break;

    case Element.COLD:
      effects.push("Your belongings freeze!");
      break;

    case Element.ELEC:
      effects.push("Sparks fly from your equipment!");
      break;

    default:
      // No additional side effects for other elements
      break;
  }
}
