/**
 * @file monster/death.ts
 * @brief Monster death processing — drops, experience, and cleanup
 *
 * Port of mon-death.c — handles what happens when a monster is killed:
 * item drops, gold drops, experience gain, and grid cleanup.
 *
 * Copyright (c) 2024 Angband-TS Contributors
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Monster } from "../types/monster.js";
import { MonsterRaceFlag } from "../types/monster.js";
import type { Chunk } from "../types/cave.js";
import type { ObjectType, ObjectKind, EgoItem } from "../types/object.js";
import type { Player } from "../types/player.js";
import type { Loc, RNG } from "../z/index.js";
import { makeObject, makeGold, pickObjectKind } from "../object/make.js";
import { TVal } from "../types/object.js";

// ── Result type ──

/** Items dropped when a monster dies. */
export interface MonsterDeathResult {
  /** Objects to place on the ground at the monster's location. */
  readonly drops: ObjectType[];
  /** Total gold value dropped. */
  readonly goldTotal: number;
  /** Experience gained from the kill. */
  readonly exp: number;
  /** Messages generated. */
  readonly messages: string[];
}

// ── Constants ──

/** Maximum number of drops per monster. */
const MAX_DROPS = 8;

// ── Drop count calculation ──

/**
 * Determine how many items a monster drops based on its flags.
 *
 * Port of mon_create_drop_count from mon-make.c.
 * The DROP_N flags indicate guaranteed drops (1-4).
 * DROP_40/60/20 add probabilistic drops.
 */
function calculateDropCount(mon: Monster, rng: RNG): number {
  const flags = mon.race.flags;
  let count = 0;

  // Guaranteed drops
  if (flags.has(MonsterRaceFlag.DROP_4)) count += 4;
  else if (flags.has(MonsterRaceFlag.DROP_3)) count += 3;
  else if (flags.has(MonsterRaceFlag.DROP_2)) count += 2;
  else if (flags.has(MonsterRaceFlag.DROP_1)) count += 1;

  // Probabilistic drops
  if (flags.has(MonsterRaceFlag.DROP_60) && rng.randint0(100) < 60) count++;
  if (flags.has(MonsterRaceFlag.DROP_40) && rng.randint0(100) < 40) count++;
  if (flags.has(MonsterRaceFlag.DROP_20) && rng.randint0(100) < 20) count++;

  return Math.min(count, MAX_DROPS);
}

/**
 * Process a monster's death: generate drops and calculate experience.
 *
 * Port of monster_death from mon-death.c (simplified).
 *
 * @param mon       The killed monster.
 * @param player    The player who killed it.
 * @param depth     Current dungeon depth.
 * @param kinds     Available object kinds for drops.
 * @param rng       Random number generator.
 * @param egoItems  Ego item table for enchantment.
 * @returns         Death processing result with drops and experience.
 */
export function monsterDeath(
  mon: Monster,
  player: Player,
  depth: number,
  kinds: readonly ObjectKind[],
  rng: RNG,
  egoItems: readonly EgoItem[] = [],
): MonsterDeathResult {
  const drops: ObjectType[] = [];
  const messages: string[] = [];
  let goldTotal = 0;

  const flags = mon.race.flags;
  const onlyGold = flags.has(MonsterRaceFlag.ONLY_GOLD);
  const onlyItem = flags.has(MonsterRaceFlag.ONLY_ITEM);
  const isGood = flags.has(MonsterRaceFlag.DROP_GOOD);
  const isGreat = flags.has(MonsterRaceFlag.DROP_GREAT);

  // Calculate number of drops
  const dropCount = calculateDropCount(mon, rng);

  // Find a gold kind for gold drops
  const goldKind = kinds.find((k) => k.tval === TVal.GOLD) ?? null;

  // Generate each drop
  for (let i = 0; i < dropCount; i++) {
    // Decide gold vs item
    // Default: 50/50 gold vs item, unless ONLY_GOLD or ONLY_ITEM
    const makeGoldDrop = onlyGold || (!onlyItem && rng.oneIn(2));

    if (makeGoldDrop && goldKind) {
      const gold = makeGold(depth, rng, goldKind);
      gold.grid = { x: mon.grid.x, y: mon.grid.y };
      goldTotal += gold.pval;
      drops.push(gold);
    } else if (!onlyGold) {
      const obj = makeObject(kinds, depth, isGood, isGreat, rng, egoItems);
      if (obj) {
        obj.grid = { x: mon.grid.x, y: mon.grid.y };
        drops.push(obj);
      }
    }
  }

  // Calculate experience
  const exp = calculateMonsterExp(mon, player);

  // Decrement the race's curNum counter
  if (mon.race.curNum > 0) {
    (mon.race as { curNum: number }).curNum--;
  }

  if (drops.length > 0) {
    messages.push(`The ${mon.race.name} drops ${drops.length} item(s).`);
  }

  return { drops, goldTotal, exp, messages };
}

/**
 * Calculate experience for killing a monster.
 *
 * Port of monster_exp from mon-util.c.
 * Formula: mexp * level / (player_level + 2), with divisor for high-level characters.
 */
function calculateMonsterExp(mon: Monster, player: Player): number {
  const mexp = mon.race.mexp;
  const monLevel = mon.race.level;
  const playerLevel = player.lev;

  // Base exp calculation
  let exp = mexp * monLevel;

  // Divide by a factor based on player level (diminishing returns)
  const divisor = playerLevel + 2;
  exp = Math.floor(exp / divisor);

  // Minimum 1 exp for any monster
  return Math.max(1, exp);
}
