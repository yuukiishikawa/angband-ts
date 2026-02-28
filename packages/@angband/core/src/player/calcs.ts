/**
 * @file player/calcs.ts
 * @brief Derived stat calculations
 *
 * Port of player-calcs.c — stat indexing, stat bonuses, combat bonuses,
 * HP calculation, mana calculation.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 * Copyright (c) 2014 Nick McConnell
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Player, PlayerState } from "../types/index.js";
import {
  Stat,
  STAT_MAX,
  STAT_RANGE,
  Skill,
  SKILL_MAX,
} from "../types/index.js";
import { BitFlag } from "../z/index.js";

// ── Stat tables (from C player-calcs.c) ──

/** Stat Table (INT) -- Magic devices */
const adjIntDev: readonly number[] = [
  0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2,
  3, 3, 3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8,
  9, 9, 10, 10, 11, 11, 12, 13,
];

/** Stat Table (WIS) -- Saving throw */
const adjWisSav: readonly number[] = [
  0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2,
  3, 3, 3, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10, 11,
  12, 13, 14, 15, 16, 17, 18, 19,
];

/** Stat Table (DEX) -- disarming */
const adjDexDis: readonly number[] = [
  0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2,
  3, 3, 3, 4, 4, 5, 6, 7, 8, 9, 10, 10, 11, 12, 13,
  14, 15, 16, 17, 18, 19, 19, 19,
];

/** Stat Table (INT) -- disarming */
const adjIntDis: readonly number[] = [
  0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2,
  3, 3, 3, 4, 4, 5, 6, 7, 8, 9, 10, 10, 11, 12, 13,
  14, 15, 16, 17, 18, 19, 19, 19,
];

/** Stat Table (DEX) -- bonus to ac */
const adjDexTa: readonly number[] = [
  -4, -3, -2, -1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1,
  2, 2, 2, 2, 2, 3, 3, 3, 4, 5, 6, 7, 8, 9, 9,
  10, 11, 12, 13, 14, 15, 15, 15,
];

/** Stat Table (STR) -- bonus to dam */
export const adjStrTd: readonly number[] = [
  -2, -2, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2,
  2, 2, 3, 3, 3, 3, 3, 4, 5, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 18, 20,
];

/** Stat Table (DEX) -- bonus to hit */
export const adjDexTh: readonly number[] = [
  -3, -2, -2, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2,
  3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 6, 7, 8, 9, 9,
  10, 11, 12, 13, 14, 15, 15, 15,
];

/** Stat Table (STR) -- bonus to hit */
const adjStrTh: readonly number[] = [
  -3, -2, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9,
  10, 11, 12, 13, 14, 15, 15, 15,
];

/** Stat Table (STR) -- weight limit in deca-pounds */
const adjStrWgt: readonly number[] = [
  5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  20, 22, 24, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  30, 30, 30, 30, 30, 30, 30, 30,
];

/** Stat Table (STR) -- weapon weight limit in pounds */
export const adjStrHold: readonly number[] = [
  4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28,
  30, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 80, 80, 80, 80,
  90, 90, 90, 90, 90, 100, 100, 100,
];

/** Stat Table (STR) -- digging value */
const adjStrDig: readonly number[] = [
  0, 0, 1, 2, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8,
  9, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70,
  75, 80, 85, 90, 95, 100, 100, 100,
];

/** Stat Table (STR) -- help index into the "blow" table */
export const adjStrBlow: readonly number[] = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
  20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160,
  170, 180, 190, 200, 210, 220, 230, 240,
];

/** Stat Table (DEX) -- index into the "blow" table */
const adjDexBlow: readonly number[] = [
  0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2,
  2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 8,
  9, 9, 9, 10, 10, 11, 11, 11,
];

/** Stat Table (CON) -- extra 1/100th hitpoints per level */
const adjConMhp: readonly number[] = [
  -250, -150, -100, -75, -50, -25, -10, -5, 0, 5, 10, 25, 50, 75, 100,
  150, 175, 200, 225, 250, 275, 300, 350, 400, 450, 500, 550, 600, 650, 700,
  750, 800, 900, 1000, 1100, 1250, 1250, 1250,
];

/** Stat Table (INT/WIS) -- extra 1/100 mana-points per level */
const adjMagMana: readonly number[] = [
  0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140,
  150, 160, 170, 180, 190, 200, 225, 250, 300, 350, 400, 450, 500, 550, 600,
  650, 700, 750, 800, 800, 800, 800, 800,
];

/**
 * Blows table: energy cost per blow based on STR/weight index (P) and DEX index (D).
 * Rows = P (0..11), Cols = D (0..11).
 */
const blowsTable: readonly (readonly number[])[] = [
  [100, 100, 95, 85, 75, 60, 50, 42, 35, 30, 25, 23],
  [100, 95, 85, 75, 60, 50, 42, 35, 30, 25, 23, 21],
  [95, 85, 75, 60, 50, 42, 35, 30, 26, 23, 21, 20],
  [85, 75, 60, 50, 42, 36, 32, 28, 25, 22, 20, 19],
  [75, 60, 50, 42, 36, 33, 28, 25, 23, 21, 19, 18],
  [60, 50, 42, 36, 33, 30, 27, 24, 22, 21, 19, 17],
  [50, 42, 36, 33, 30, 27, 25, 23, 21, 20, 18, 17],
  [42, 36, 33, 30, 28, 26, 24, 22, 20, 19, 18, 17],
  [36, 33, 30, 28, 26, 24, 22, 21, 20, 19, 17, 16],
  [35, 32, 29, 26, 24, 22, 21, 20, 19, 18, 17, 16],
  [34, 30, 27, 25, 23, 22, 21, 20, 19, 18, 17, 16],
  [33, 29, 26, 24, 22, 21, 20, 19, 18, 17, 16, 15],
];

// ── Core functions ──

/**
 * Modify a stat value by an amount.
 * Port of C `modify_stat_value()` from player-util.c.
 *
 * Below 18, each point adds/subtracts 1.
 * At 18 and above, each point adds/subtracts 10.
 */
export function modifyStatValue(value: number, amount: number): number {
  let v = value;
  if (amount > 0) {
    for (let i = 0; i < amount; i++) {
      if (v < 18) v++;
      else v += 10;
    }
  } else if (amount < 0) {
    for (let i = 0; i < -amount; i++) {
      if (v >= 18 + 10) v -= 10;
      else if (v > 18) v = 18;
      else if (v > 3) v--;
    }
  }
  return v;
}

/**
 * Convert a raw stat "use" value to a stat table index (0..37).
 * Port of the inline logic in C `calc_bonuses()`.
 *
 * The index maps to STAT_RANGE (38) entries in all stat tables.
 * - Stats 3 or less    -> index 0
 * - Stats 4..18        -> index (stat - 3), i.e. 1..15
 * - Stats 18/00..18/219 -> index 15 + floor((stat - 18) / 10), i.e. 15..36
 * - Stats 18/220+      -> index 37
 */
export function adjStatToIndex(use: number): number {
  if (use <= 3) return 0;
  if (use <= 18) return use - 3;
  if (use <= 18 + 219) return 15 + Math.floor((use - 18) / 10);
  return 37;
}

/**
 * Look up the stat bonus for melee damage from STR.
 */
export function calcStatBonusDam(statIndex: number): number {
  return adjStrTd[Math.min(Math.max(statIndex, 0), STAT_RANGE - 1)]!;
}

/**
 * Look up the stat bonus to hit from DEX.
 */
export function calcStatBonusHitDex(statIndex: number): number {
  return adjDexTh[Math.min(Math.max(statIndex, 0), STAT_RANGE - 1)]!;
}

/**
 * Look up the stat bonus to hit from STR.
 */
export function calcStatBonusHitStr(statIndex: number): number {
  return adjStrTh[Math.min(Math.max(statIndex, 0), STAT_RANGE - 1)]!;
}

/**
 * Look up the AC bonus from DEX.
 */
export function calcStatBonusAC(statIndex: number): number {
  return adjDexTa[Math.min(Math.max(statIndex, 0), STAT_RANGE - 1)]!;
}

/**
 * Calculate all derived stats for a player, producing a new PlayerState.
 *
 * Simplified port of C `calc_bonuses()`. Handles stat indexing, combat bonuses
 * from stats, and skill adjustments. Equipment bonuses are included only
 * from the stat_add already present on the input state (if any).
 *
 * @param player - The player to calculate bonuses for.
 * @returns A new PlayerState with all derived values computed.
 */
export function calcBonuses(player: Player): PlayerState {
  const statAdd = new Array(STAT_MAX).fill(0);
  const statInd = new Array(STAT_MAX).fill(0);
  const statUse = new Array(STAT_MAX).fill(0);
  const statTop = new Array(STAT_MAX).fill(0);
  const skills = new Array(SKILL_MAX).fill(0);

  let speed = 110;
  let toA = 0;
  let toH = 0;
  let toD = 0;
  const ac = 0;

  // Base skills from race + class
  for (let i = 0; i < SKILL_MAX; i++) {
    skills[i] = (player.race.skills[i] ?? 0) + (player.class.skills[i] ?? 0);
  }

  // Calculate stat values
  for (let i = 0; i < STAT_MAX; i++) {
    const add = (player.race.statAdj[i] ?? 0) + (player.class.statAdj[i] ?? 0);
    statAdd[i] = add;
    statTop[i] = modifyStatValue(player.statMax[i]!, add);
    const use = modifyStatValue(player.statCur[i]!, add);
    statUse[i] = use;
    statInd[i] = adjStatToIndex(use);
  }

  // Apply stat-based bonuses to AC, to-hit, to-damage
  toA += adjDexTa[statInd[Stat.DEX]]!;
  toD += adjStrTd[statInd[Stat.STR]]!;
  toH += adjDexTh[statInd[Stat.DEX]]!;
  toH += adjStrTh[statInd[Stat.STR]]!;

  // Apply stat-based skill bonuses
  skills[Skill.DISARM_PHYS] += adjDexDis[statInd[Stat.DEX]]!;
  skills[Skill.DISARM_MAGIC] += adjIntDis[statInd[Stat.INT]]!;
  skills[Skill.DEVICE] += adjIntDev[statInd[Stat.INT]]!;
  skills[Skill.SAVE] += adjWisSav[statInd[Stat.WIS]]!;
  skills[Skill.DIGGING] += adjStrDig[statInd[Stat.STR]]!;

  // Per-level skill bonuses from class
  for (let i = 0; i < SKILL_MAX; i++) {
    skills[i] += Math.floor(
      ((player.class.extraSkills[i] ?? 0) * player.lev) / 10,
    );
  }

  // Clamp digging and stealth
  if (skills[Skill.DIGGING]! < 1) skills[Skill.DIGGING] = 1;
  if (skills[Skill.STEALTH]! > 30) skills[Skill.STEALTH] = 30;
  if (skills[Skill.STEALTH]! < 0) skills[Skill.STEALTH] = 0;

  // Infravision from race
  const seeInfra = player.race.infra;

  // Number of blows (simplified — no weapon equipped at birth)
  const numBlows = 100;

  // Collect flags from race and class
  const flags = player.race.flags.clone();
  flags.union(player.class.flags);

  const pflags = player.race.pflags.clone();
  pflags.union(player.class.pflags);

  return {
    statAdd,
    statInd,
    statUse,
    statTop,
    skills,
    speed,
    numBlows,
    numShots: 0,
    numMoves: 0,
    ammoMult: 0,
    ammoTval: 0,
    ac,
    damRed: 0,
    percDamRed: 0,
    toA,
    toH,
    toD,
    seeInfra,
    curLight: 0,
    heavyWield: false,
    heavyShoot: false,
    blessWield: false,
    cumberArmor: false,
    flags,
    pflags,
    elInfo: [],
  };
}

/**
 * Calculate melee combat bonuses from stats.
 *
 * @param player - The player.
 * @param state - The player's current state.
 * @returns Object with toH (to-hit) and toD (to-damage) bonuses from stats.
 */
export function calcMeleeBonus(
  player: Player,
  state: PlayerState,
): { toH: number; toD: number } {
  const strInd = state.statInd[Stat.STR]!;
  const dexInd = state.statInd[Stat.DEX]!;
  return {
    toH: adjStrTh[strInd]! + adjDexTh[dexInd]!,
    toD: adjStrTd[strInd]!,
  };
}

/**
 * Calculate ranged combat bonuses from stats.
 * Ranged to-hit uses DEX only; ranged to-damage uses STR.
 */
export function calcRangedBonus(
  player: Player,
  state: PlayerState,
): { toH: number; toD: number } {
  const strInd = state.statInd[Stat.STR]!;
  const dexInd = state.statInd[Stat.DEX]!;
  return {
    toH: adjDexTh[dexInd]!,
    toD: adjStrTd[strInd]!,
  };
}

/**
 * Calculate total armor class from base AC plus DEX bonus.
 */
export function calcAC(player: Player, state: PlayerState): number {
  return state.ac + state.toA;
}

/**
 * Calculate the player's speed (base 110 = normal speed).
 * At birth with no equipment, speed is the default 110.
 */
export function calcSpeed(player: Player, state: PlayerState): number {
  return state.speed;
}

/**
 * Calculate maximum hit points.
 * Port of C `calc_hitpoints()`.
 *
 * mhp = player_hp[lev-1] + (adj_con_mhp[con_index] * lev / 100)
 * Minimum: lev + 1.
 */
export function calcHP(player: Player): number {
  const state = player.state;
  const conInd = state.statInd[Stat.CON]!;
  const bonus = adjConMhp[Math.min(Math.max(conInd, 0), STAT_RANGE - 1)]!;
  let mhp = player.playerHp[player.lev - 1]! + Math.floor((bonus * player.lev) / 100);
  if (mhp < player.lev + 1) mhp = player.lev + 1;
  return mhp;
}

/**
 * Calculate maximum mana (spell points).
 * Port of C `calc_mana()`.
 *
 * For classes with no spells, mana is always 0.
 * Otherwise: msp = 1 + adj_mag_mana[spell_stat_index] * levels / 100
 * where levels = (player.lev - class.magic.spellFirst) + 1.
 */
export function calcMana(player: Player): number {
  if (!player.class.magic.totalSpells) return 0;

  const state = player.state;
  // Use WIS for priests, INT for mages as a simple heuristic.
  // In the C code this is based on the first book's realm stat.
  // Here we use INT as default spell stat (index 1).
  const spellStat = Stat.INT;
  const spellStatInd = state.statInd[spellStat]!;

  const levels = (player.lev - player.class.magic.spellFirst) + 1;
  if (levels <= 0) return 0;

  let msp = 1 + Math.floor(
    (adjMagMana[Math.min(Math.max(spellStatInd, 0), STAT_RANGE - 1)]! * levels) / 100,
  );

  if (msp < 0) msp = 0;
  return msp;
}

/**
 * Calculate number of blows per round (x100 for fractional).
 *
 * Uses the blows table from C. Requires weapon weight to look up properly.
 * Without a weapon, returns 100 (1 blow).
 *
 * @param state - Player state with stat indices.
 * @param cls - Player class (for maxAttacks, minWeight, attMultiply).
 * @param weaponWeight - Weight of wielded weapon in 1/10 lbs, or 0 if unarmed.
 * @returns Number of blows * 100.
 */
export function calcBlows(
  state: PlayerState,
  cls: {
    maxAttacks: number;
    minWeight: number;
    attMultiply: number;
  },
  weaponWeight: number,
): number {
  if (weaponWeight <= 0) return 100;

  const weight = weaponWeight / 10;
  const minWeight = cls.minWeight;
  const div = weight < minWeight ? minWeight : weight;

  const strInd = state.statInd[Stat.STR]!;
  const dexInd = state.statInd[Stat.DEX]!;

  // Str/weight index
  let strIndex = Math.floor(
    (adjStrBlow[Math.min(Math.max(strInd, 0), STAT_RANGE - 1)]! * cls.attMultiply) / div,
  );
  if (strIndex > 11) strIndex = 11;

  // Dex index
  const dexIndex = Math.min(
    adjDexBlow[Math.min(Math.max(dexInd, 0), STAT_RANGE - 1)]!,
    11,
  );

  // Look up energy cost per blow
  const blowEnergy = blowsTable[strIndex]![dexIndex]!;

  // Blows per round
  const blows = Math.min(
    Math.floor(10000 / blowEnergy),
    100 * cls.maxAttacks,
  );

  // Minimum 1 blow
  return Math.max(blows, 100);
}
