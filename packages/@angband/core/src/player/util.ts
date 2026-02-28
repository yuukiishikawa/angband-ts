/**
 * @file player/util.ts
 * @brief Player utility functions
 *
 * Port of player-util.c — LOS checks, race/flag tests, stat adjustments,
 * and experience table.
 *
 * Copyright (c) 2011 The Angband Developers
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Loc } from "../z/index.js";
import type { Player, PlayerRace, Chunk } from "../types/index.js";
import {
  Stat,
  TimedEffect,
  PlayerFlag,
  PY_MAX_LEVEL,
  STAT_MAX,
} from "../types/index.js";
import { los } from "../cave/view.js";

// ── Experience table ──

/**
 * Experience required to reach each level.
 * Index 0 = level 1, index 49 = level 50.
 * Matches the `player_exp[]` table in player.c.
 *
 * The actual XP threshold is: `PLAYER_EXP[level - 1] * expfact / 100`.
 */
export const PLAYER_EXP: readonly number[] = [
  10,
  25,
  45,
  70,
  100,
  140,
  200,
  280,
  380,
  500,
  650,
  850,
  1100,
  1400,
  1800,
  2300,
  2900,
  3600,
  4400,
  5400,
  6800,
  8400,
  10200,
  12500,
  17500,
  25000,
  35000,
  50000,
  75000,
  100000,
  150000,
  200000,
  275000,
  350000,
  450000,
  550000,
  700000,
  850000,
  1000000,
  1250000,
  1500000,
  1800000,
  2100000,
  2400000,
  2700000,
  3000000,
  3500000,
  4000000,
  4500000,
  5000000,
];

/**
 * Get the base experience required to reach a given level.
 *
 * This returns the unmodified table value. To get the actual requirement
 * for a specific player, multiply by `player.expfact / 100`.
 *
 * @param level - The target level (1..PY_MAX_LEVEL).
 * @returns The base experience value, or 0 for invalid levels.
 */
export function expForLevel(level: number): number {
  if (level < 1 || level > PY_MAX_LEVEL) return 0;
  return PLAYER_EXP[level - 1]!;
}

/**
 * Get the actual experience required for a player to reach a specific level,
 * accounting for their experience factor.
 */
export function expForPlayerLevel(player: Player, level: number): number {
  const base = expForLevel(level);
  return Math.floor(base * player.expfact / 100);
}

// ── Line of sight checks ──

/**
 * Check if the player has line of sight to a target location.
 *
 * Uses the Joseph Hall LOS algorithm from cave/view.ts.
 *
 * @param player - The player.
 * @param chunk  - The current dungeon level.
 * @param target - The target grid location.
 * @returns true if an unobstructed line of sight exists.
 */
export function playerHasLOS(
  player: Player,
  chunk: Chunk,
  target: Loc,
): boolean {
  return los(chunk, player.grid, target);
}

/**
 * Check if the player can see a target location.
 *
 * A player can see a target if they have line of sight AND are not blind.
 * This is the standard visibility check used by most game systems.
 *
 * @param player - The player.
 * @param chunk  - The current dungeon level.
 * @param target - The target grid location.
 * @returns true if the player can see the target.
 */
export function playerCanSee(
  player: Player,
  chunk: Chunk,
  target: Loc,
): boolean {
  // Blind players cannot see anything
  if (player.timed[TimedEffect.BLIND]! > 0) return false;

  return playerHasLOS(player, chunk, target);
}

// ── Race checks ──

/**
 * Check if the player is of a specific race.
 *
 * @param player - The player.
 * @param raceId - The race index to check against.
 * @returns true if the player's race matches the given race ID.
 */
export function playerOfRace(player: Player, raceId: number): boolean {
  return player.race.ridx === raceId;
}

// ── Flag checks ──

/**
 * Check if the player has a specific player flag.
 *
 * Port of C `player_has()` macro:
 * `#define player_has(p, flag) (pf_has(p->state.pflags, (flag)))`
 *
 * Checks the computed state flags which combine race, class, and equipment.
 *
 * @param player - The player.
 * @param flag   - The PlayerFlag to check.
 * @returns true if the flag is set in the player's state.
 */
export function playerHasFlag(player: Player, flag: PlayerFlag): boolean {
  return player.state.pflags.has(flag);
}

// ── Stat adjustments ──

/**
 * Adjust a base stat value by the racial modifier.
 *
 * Used during character creation and stat recalculation.
 *
 * @param base   - The base stat value.
 * @param race   - The player's race template.
 * @param stat   - The stat index (Stat.STR, Stat.INT, etc.).
 * @returns The adjusted stat value.
 */
export function adjustStatByRace(
  base: number,
  race: PlayerRace,
  stat: Stat,
): number {
  if (stat < 0 || stat >= STAT_MAX) return base;
  return base + race.statAdj[stat]!;
}

/**
 * Adjust a base stat value by both racial and class modifiers.
 */
export function adjustStatByRaceAndClass(
  base: number,
  player: Player,
  stat: Stat,
): number {
  if (stat < 0 || stat >= STAT_MAX) return base;
  return base + player.race.statAdj[stat]! + player.class.statAdj[stat]!;
}
