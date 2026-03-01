/**
 * @file command/combat.ts
 * @brief Player combat — melee attacks, ranged attacks, throwing
 *
 * Port of player-attack.c — the player's offensive actions.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Chunk, Monster, MonsterId, Player } from "../types/index.js";
import type { ObjectType, Brand, Slay } from "../types/index.js";
import { Skill, BTH_PLUS_ADJ, TimedEffect, EquipSlot } from "../types/index.js";
import type { Loc, RNG } from "../z/index.js";
import { locDiff } from "../z/index.js";
import { chunkContains, chunkGetSquare } from "../cave/index.js";
import { getEquippedItem, getInventoryItem, removeFromInventory } from "../object/gear.js";
import { findBestMultiplier, applySlayBrand } from "../object/slays.js";
import { TVal } from "../types/object.js";
import { STANDARD_ENERGY, successResult, failResult } from "./core.js";
import type { CommandResult } from "./core.js";

/**
 * Map launcher sval to the ammo TVal it fires.
 * Based on sval_SHOOTS_SHOTS/ARROWS/BOLTS in list-object-modifiers.h.
 */
function launcherAmmoTval(launcher: ObjectType): number {
  // Check launcher pval or sval to determine ammo type
  // Slings fire shots, bows fire arrows, crossbows fire bolts
  // The simplest heuristic: check the object's name or sub-type
  const sval = launcher.sval ?? 0;
  // In Angband, slings have low svals, bows mid, crossbows high
  // But we can use the pval/multiplier approach too
  // Simplest: sval 1-10 = sling(SHOT), 11-20 = bow(ARROW), 21+ = crossbow(BOLT)
  if (sval <= 10) return TVal.SHOT;
  if (sval <= 20) return TVal.ARROW;
  return TVal.BOLT;
}

// ── Attack result ──

/**
 * The outcome of a single attack action (melee blow, ranged shot, etc.).
 */
export interface AttackResult {
  /** Whether the attack connected. */
  readonly hit: boolean;
  /** Total damage dealt (0 on miss). */
  readonly damage: number;
  /** Whether the target was killed. */
  readonly killed: boolean;
  /** Messages produced during the attack. */
  readonly messages: readonly string[];
}

// ── Hit chance calculation ──

/**
 * Hit chance constants (from player-attack.c).
 * Percentages scaled to 10,000 to avoid rounding error.
 */
const HUNDRED_PCT = 10000;
const ALWAYS_HIT = 1200;  // 12% guaranteed hit
const ALWAYS_MISS = 500;  // 5% guaranteed miss

/**
 * Calculate the player's base melee to-hit value.
 *
 * Port of chance_of_melee_hit_base from player-attack.c.
 *
 * @param player The attacking player
 * @returns      The base to-hit chance
 */
export function chanceOfMeleeHitBase(player: Player): number {
  const toH = player.state.toH;
  const blessBonus = player.state.blessWield ? 2 : 0;
  return (player.state.skills[Skill.TO_HIT_MELEE] ?? 0) + (toH + blessBonus) * BTH_PLUS_ADJ;
}

/**
 * Calculate the player's melee to-hit value against a specific monster.
 *
 * Port of chance_of_melee_hit from player-attack.c.
 * Non-visible monsters receive a 50% penalty.
 *
 * @param player  The attacking player
 * @param visible Whether the monster is visible to the player
 * @returns       The to-hit chance vs this monster
 */
export function chanceOfMeleeHit(player: Player, visible: boolean): number {
  const base = chanceOfMeleeHitBase(player);
  return visible ? base : Math.floor(base / 2);
}

/**
 * Test if a hit roll succeeds against the target AC.
 *
 * Port of test_hit / hit_chance from player-attack.c.
 *
 * The hit calculation:
 * - Always hits 12% of the time
 * - Always misses 5% of the time
 * - Floor of 9 on the to-hit value
 * - Roll between 0 and to-hit; outcome must be >= AC*2/3 to hit
 *
 * @param rng    Random number generator
 * @param toHit  The total to-hit value
 * @param ac     The target's armor class
 * @returns      True if the attack hits
 */
export function playerMeleeHit(
  rng: RNG,
  toHit: number,
  ac: number,
): boolean {
  // Floor on the to-hit
  const effectiveToHit = Math.max(9, toHit);

  // Calculate the hit percentage (scaled to HUNDRED_PCT = 10000)
  let hitNumerator = Math.max(0, effectiveToHit - Math.floor(ac * 2 / 3));
  hitNumerator = Math.floor(HUNDRED_PCT * hitNumerator / effectiveToHit);

  // The calculated rate only applies when guaranteed hit/miss don't
  hitNumerator = Math.floor(
    hitNumerator * (HUNDRED_PCT - ALWAYS_MISS - ALWAYS_HIT) / HUNDRED_PCT,
  );

  // Add in the guaranteed hit
  hitNumerator += ALWAYS_HIT;

  // Roll
  return rng.randint0(HUNDRED_PCT) < hitNumerator;
}

/**
 * Calculate melee damage for a single blow.
 *
 * Port of melee_damage from player-attack.c.
 * Uses the equipped weapon's dd/ds if available, otherwise unarmed 1d3.
 *
 * @param player The attacking player
 * @param weapon The equipped weapon (null = unarmed)
 * @param rng    Random number generator
 * @returns      The raw damage value (before slays/brands/criticals)
 */
function baseMeleeDamage(player: Player, weapon: ObjectType | null, rng: RNG): number {
  const toD = player.state.toD;
  if (weapon) {
    // Weapon damage: NdM + weapon toD + player toD
    return rng.damroll(weapon.dd, weapon.ds) + weapon.toD + toD;
  }
  // Unarmed: 1d3 + toD
  return rng.damroll(1, 3) + toD;
}

/**
 * Calculate the player's damage including critical hits.
 *
 * Port of critical_melee from player-attack.c (simplified).
 * Uses weapon weight, plusses, and player level to determine criticals.
 *
 * @param player     The attacking player
 * @param mon        The target monster
 * @param baseDamage The raw damage before criticals
 * @param rng        Random number generator
 * @returns          Object with final damage and hit type message
 */
export function calculatePlayerDamage(
  player: Player,
  _mon: Monster,
  baseDamage: number,
  rng: RNG,
  weaponWeight: number = 50,
): { damage: number; critMsg: string | null } {
  return calculateCritical(player, baseDamage, rng, weaponWeight);
}

/**
 * Critical hit calculation (shared between the full and simplified paths).
 */
function calculateCritical(
  player: Player,
  baseDamage: number,
  rng: RNG,
  weaponWeight: number = 50,
): { damage: number; critMsg: string | null } {
  const toH = player.state.toH;
  const weight = weaponWeight;

  // Chance of critical: weight + toH*3 + level*3 + skill
  const chance =
    weight + toH * 3 + player.lev * 3 + (player.state.skills[Skill.TO_HIT_MELEE] ?? 0);

  // Critical range (from z_info in C; use 5000 as default)
  const critRange = 5000;

  if (rng.randint1(critRange) <= chance) {
    // Determine critical power
    const power = weight + rng.randint1(650);

    if (power < 400) {
      return { damage: baseDamage * 2 + 5, critMsg: "It was a good hit!" };
    } else if (power < 700) {
      return { damage: baseDamage * 2 + 10, critMsg: "It was a great hit!" };
    } else if (power < 900) {
      return { damage: baseDamage * 3 + 15, critMsg: "It was a superb hit!" };
    } else if (power < 1300) {
      return { damage: baseDamage * 3 + 20, critMsg: "It was a *GREAT* hit!" };
    } else {
      return { damage: baseDamage * 3 + 25, critMsg: "It was a *SUPERB* hit!" };
    }
  }

  return { damage: baseDamage, critMsg: null };
}

// ── Combat commands ──

/**
 * Resolve a melee attack against a monster at the target location.
 *
 * Port of py_attack / py_attack_real from player-attack.c.
 *
 * @param player The attacking player
 * @param chunk  The current dungeon level
 * @param target Grid location of the target
 * @param rng    Random number generator
 * @returns      Command result
 */
export function cmdAttack(
  player: Player,
  chunk: Chunk,
  target: Loc,
  rng: RNG,
): CommandResult {
  // Bounds check
  if (!chunkContains(chunk, target)) {
    return failResult(["You see nothing there to attack."]);
  }

  const sq = chunkGetSquare(chunk, target);

  // Must have a monster
  if (sq.mon <= (0 as MonsterId)) {
    return failResult(["You see nothing there to attack."]);
  }

  // Check if player is afraid — still costs a turn (as in original Angband)
  if ((player.timed[TimedEffect.AFRAID] ?? 0) > 0) {
    return successResult(STANDARD_ENERGY, ["You are too afraid to attack!"]);
  }

  // Look up the actual monster object
  // Try direct index first, then scan by midx
  let mon = chunk.monsters[sq.mon as number] ?? null;
  if (!mon || mon.hp <= 0 || mon.midx !== sq.mon) {
    const directMon = mon;
    mon = chunk.monsters.find((m) => m && m.midx === sq.mon && m.hp > 0) ?? null;
    process.stderr.write(`[ATK] sq.mon=${sq.mon}, direct[${sq.mon}]=${directMon ? `midx=${directMon.midx},hp=${directMon.hp}` : 'null'}, scan=${mon ? `midx=${mon.midx},hp=${mon.hp}` : 'null'}, monsters.len=${chunk.monsters.length}\n`);
  }
  if (!mon) {
    // Clear stale monster reference to prevent infinite attack loops
    if (sq.mon > 0) {
      process.stderr.write(`[ATK-FIX] Clearing stale sq.mon=${sq.mon} at (${target.x},${target.y})\n`);
      (sq as { mon: number }).mon = 0;
    }
    return failResult(["You see nothing there to attack."]);
  }

  const messages: string[] = [];

  // Number of blows (numBlows is x100 in the state)
  const numBlows = Math.max(1, Math.floor(player.state.numBlows / 100));

  // Get equipped weapon
  const weapon = getEquippedItem(player, EquipSlot.WEAPON);
  const weaponWeight = weapon?.weight ?? 50;

  // Use the monster's actual AC
  const monsterAc = mon.race?.ac ?? 0;
  const visible = true; // Simplified: assume monster is visible

  for (let blow = 0; blow < numBlows; blow++) {
    const toHit = chanceOfMeleeHit(player, visible);

    if (playerMeleeHit(rng, toHit, monsterAc)) {
      // Calculate base damage
      const baseDmg = baseMeleeDamage(player, weapon, rng);

      // Apply criticals
      const { damage, critMsg } = calculateCritical(player, baseDmg, rng, weaponWeight);

      // Ensure non-negative damage
      const finalDmg = Math.max(0, damage);

      if (finalDmg === 0) {
        messages.push("You fail to harm the monster.");
      } else {
        messages.push(`You hit the monster for ${finalDmg} damage.`);
      }

      // Apply damage to the monster
      mon.hp -= finalDmg;

      if (critMsg) {
        messages.push(critMsg);
      }

      // Check for death
      if (mon.hp <= 0) {
        messages.push(`You have slain the ${mon.race?.name ?? "monster"}!`);
        break;
      }
    } else {
      messages.push("You miss the monster.");
    }
  }

  return successResult(STANDARD_ENERGY, messages);
}

/**
 * Resolve a melee attack using a full Monster object.
 *
 * Port of py_attack_real from player-attack.c (full version).
 * This is the detailed melee resolution that uses the monster's
 * actual AC and race data.
 *
 * @param player The attacking player
 * @param mon    The target monster
 * @param rng    Random number generator
 * @returns      Attack result
 */
export function playerAttackMonster(
  player: Player,
  mon: Monster,
  rng: RNG,
  brands: readonly Brand[] = [],
  slays: readonly Slay[] = [],
): AttackResult {
  const messages: string[] = [];

  // Check if player is afraid
  if ((player.timed[TimedEffect.AFRAID] ?? 0) > 0) {
    messages.push("You are too afraid to attack!");
    return { hit: false, damage: 0, killed: false, messages };
  }

  // Get equipped weapon
  const weapon = getEquippedItem(player, EquipSlot.WEAPON);
  const weaponWeight = weapon?.weight ?? 50;

  // Calculate hit chance
  const visible = true; // Simplified
  const toHit = chanceOfMeleeHit(player, visible);
  const ac = mon.race.ac;

  if (!playerMeleeHit(rng, toHit, ac)) {
    messages.push("You miss.");
    return { hit: false, damage: 0, killed: false, messages };
  }

  // Calculate base weapon damage
  let baseDmg = baseMeleeDamage(player, weapon, rng);

  // Apply slay/brand multiplier
  if (weapon && (brands.length > 0 || slays.length > 0)) {
    const { multiplier, verb } = findBestMultiplier(weapon, mon, brands, slays, true);
    if (multiplier > 0) {
      baseDmg = applySlayBrand(baseDmg, multiplier);
      if (verb) {
        messages.push(`You ${verb} the ${mon.race.name}!`);
      }
    }
  }

  // Apply criticals
  const { damage, critMsg } = calculatePlayerDamage(player, mon, baseDmg, rng, weaponWeight);
  const finalDmg = Math.max(0, damage);

  if (finalDmg === 0) {
    messages.push("You fail to harm it.");
  } else {
    messages.push(`You hit for ${finalDmg} damage.`);
  }

  if (critMsg) {
    messages.push(critMsg);
  }

  // Apply damage to the monster
  mon.hp -= finalDmg;
  const killed = mon.hp <= 0;

  if (killed) {
    messages.push("You have slain the monster!");
  }

  return { hit: true, damage: finalDmg, killed, messages };
}

// ── Ranged combat ──

/**
 * Calculate distance between two locations (Chebyshev distance).
 */
function distance(a: Loc, b: Loc): number {
  const diff = locDiff(a, b);
  return Math.max(Math.abs(diff.x), Math.abs(diff.y));
}

/**
 * Calculate the player's missile to-hit chance.
 *
 * Port of chance_of_missile_hit_base from player-attack.c.
 *
 * @param player The attacking player
 * @returns      Base missile to-hit value
 */
export function chanceOfMissileHitBase(player: Player): number {
  const toH = player.state.toH;
  return (player.state.skills[Skill.TO_HIT_BOW] ?? 0) + toH * BTH_PLUS_ADJ;
}

/**
 * Fire a missile weapon at a target.
 *
 * Port of do_cmd_fire from cmd-obj.c / player-attack.c.
 * Simplified version: uses the player's ranged stats directly.
 *
 * @param player The attacking player
 * @param chunk  The current dungeon level
 * @param target Grid location of the target
 * @param rng    Random number generator
 * @returns      Command result
 */
export function cmdFire(
  player: Player,
  chunk: Chunk,
  target: Loc,
  rng: RNG,
  brands: readonly Brand[] = [],
  slays: readonly Slay[] = [],
): CommandResult {
  // Bounds check
  if (!chunkContains(chunk, target)) {
    return failResult(["You see nothing there to fire at."]);
  }

  // Need a launcher equipped
  const launcher = getEquippedItem(player, EquipSlot.BOW);
  if (!launcher) {
    return failResult(["You have no missile launcher equipped."]);
  }

  // Find matching ammo in inventory
  const ammoTval = launcherAmmoTval(launcher);
  let ammoIdx = -1;
  for (let i = 0; i < 40; i++) {
    const item = getInventoryItem(player, i);
    if (!item) continue;
    if (item.tval === ammoTval) { ammoIdx = i; break; }
  }
  if (ammoIdx < 0) {
    return failResult(["You have no ammunition for that weapon."]);
  }

  const ammo = getInventoryItem(player, ammoIdx)!;
  const sq = chunkGetSquare(chunk, target);

  // Must have a monster
  if (sq.mon <= (0 as MonsterId)) {
    return failResult(["You see nothing there to fire at."]);
  }

  const mon = chunk.monsters[sq.mon];
  if (!mon) {
    return failResult(["You see nothing there to fire at."]);
  }

  const messages: string[] = [];

  // Calculate distance penalty
  const dist = distance(player.grid, target);
  const baseChance = chanceOfMissileHitBase(player);
  const toHit = Math.max(0, baseChance - dist);
  const ac = mon.race.ac;

  // Hit check
  if (playerMeleeHit(rng, toHit, ac)) {
    // Damage = ammo dice * launcher multiplier + to-hit bonuses
    const ammoDmg = rng.damroll(ammo.dd, ammo.ds);
    const launcherMult = Math.max(1, launcher.pval ?? 2);
    let baseDmg = ammoDmg * launcherMult + ammo.toD + launcher.toD + player.state.toD;

    // Apply slay/brand from ammo or launcher
    if (brands.length > 0 || slays.length > 0) {
      const ammoResult = findBestMultiplier(ammo, mon, brands, slays, true);
      const launcherResult = findBestMultiplier(launcher, mon, brands, slays, true);
      const bestResult = ammoResult.multiplier >= launcherResult.multiplier ? ammoResult : launcherResult;
      if (bestResult.multiplier > 0) {
        baseDmg = applySlayBrand(baseDmg, bestResult.multiplier);
        if (bestResult.verb) {
          messages.push(`Your missile ${bestResult.verb} the ${mon.race.name}!`);
        }
      }
    }

    const finalDmg = Math.max(0, baseDmg);

    // Apply damage to monster
    mon.hp -= finalDmg;
    const killed = mon.hp <= 0;

    if (killed) {
      messages.push(`Your missile kills the ${mon.race.name}! (${finalDmg} damage)`);
    } else {
      messages.push(`Your missile hits the ${mon.race.name} for ${finalDmg} damage.`);
    }
  } else {
    messages.push(`Your missile misses the ${mon.race.name}.`);
  }

  // Consume one unit of ammo
  if (ammo.number > 1) {
    (ammo as { number: number }).number -= 1;
  } else {
    removeFromInventory(player, ammoIdx);
  }

  return successResult(STANDARD_ENERGY, messages);
}

/**
 * Throw an item at a target.
 *
 * Port of do_cmd_throw from cmd-obj.c / player-attack.c.
 * Simplified version.
 *
 * @param player The attacking player
 * @param chunk  The current dungeon level
 * @param target Grid location of the target
 * @param rng    Random number generator
 * @returns      Command result
 */
export function cmdThrow(
  player: Player,
  chunk: Chunk,
  target: Loc,
  rng: RNG,
  itemIndex: number = 0,
): CommandResult {
  // Bounds check
  if (!chunkContains(chunk, target)) {
    return failResult(["You see nothing there to throw at."]);
  }

  // Get the item to throw
  const item = getInventoryItem(player, itemIndex);
  if (!item) {
    return failResult(["You have nothing to throw."]);
  }

  const sq = chunkGetSquare(chunk, target);
  const hasTarget = sq.mon > (0 as MonsterId);
  const messages: string[] = [];

  if (hasTarget) {
    const mon = chunk.monsters[sq.mon];
    if (!mon) {
      return failResult(["You see nothing there to throw at."]);
    }

    // Calculate distance penalty
    const dist = distance(player.grid, target);
    const throwSkill = player.state.skills[Skill.TO_HIT_THROW] ?? 0;
    const toHit = Math.max(0, Math.floor(throwSkill * 3 / 2) - dist);
    const ac = mon.race.ac;

    if (playerMeleeHit(rng, toHit, ac)) {
      // Thrown item damage: use item's dice if available, else 1d4
      const dd = item.dd > 0 ? item.dd : 1;
      const ds = item.ds > 0 ? item.ds : 4;
      const baseDmg = rng.damroll(dd, ds) + item.toD + player.state.toD;
      const finalDmg = Math.max(0, baseDmg);

      // Apply damage
      mon.hp -= finalDmg;
      const killed = mon.hp <= 0;

      if (killed) {
        messages.push(`Your thrown item kills the ${mon.race.name}! (${finalDmg} damage)`);
      } else {
        messages.push(`Your thrown item hits the ${mon.race.name} for ${finalDmg} damage.`);
      }
    } else {
      messages.push(`Your thrown item misses the ${mon.race.name}.`);
    }
  } else {
    messages.push("Your thrown item lands on the ground.");
  }

  // Consume the thrown item
  if (item.number > 1) {
    (item as { number: number }).number -= 1;
  } else {
    removeFromInventory(player, itemIndex);
  }

  return successResult(STANDARD_ENERGY, messages);
}
