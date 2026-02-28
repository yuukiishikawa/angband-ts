/**
 * @file monster/make.ts
 * @brief Monster creation and placement
 *
 * Port of mon-make.c — monster creation, placement, group spawning,
 * and deletion.
 *
 * Copyright (c) 1997-2007 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Loc } from "../z/index.js";
import { loc, locSum, BitFlag, type RNG } from "../z/index.js";
import type {
  Chunk,
  MonsterId,
  MonsterRace,
  Monster,
  MonsterTarget,
  MonsterGroupInfo,
} from "../types/index.js";
import {
  SquareFlag,
  MonsterRaceFlag,
  MonsterTimedEffect,
  MonsterTempFlag,
  MonsterGroupRole,
  MonsterGroupType,
} from "../types/index.js";
import {
  chunkContains,
  chunkContainsFully,
  chunkGetSquare,
  squareIsPassable,
  squareHasMonster,
} from "../cave/index.js";

// ── Constants ──

/** The 8 directions as (dx, dy) offsets. */
const DIRS: readonly Loc[] = [
  loc(0, -1),  // N
  loc(1, -1),  // NE
  loc(1, 0),   // E
  loc(1, 1),   // SE
  loc(0, 1),   // S
  loc(-1, 1),  // SW
  loc(-1, 0),  // W
  loc(-1, -1), // NW
];

/** Maximum scatter attempts for finding a valid spawn point. */
const MAX_SCATTER_ATTEMPTS = 50;

/** Maximum number of group placement attempts per member. */
const MAX_GROUP_ATTEMPTS = 20;

// ── Spawn point validation ──

/**
 * Check if a location is valid for monster placement.
 *
 * A valid spawn point must be:
 * - Within chunk bounds (fully, i.e. not on the border)
 * - Passable terrain
 * - Not already occupied by another monster
 * - Not marked MON_RESTRICT
 */
export function isValidSpawnPoint(chunk: Chunk, spawnLoc: Loc): boolean {
  if (!chunkContainsFully(chunk, spawnLoc)) return false;
  if (!squareIsPassable(chunk, spawnLoc)) return false;
  if (squareHasMonster(chunk, spawnLoc)) return false;

  const sq = chunkGetSquare(chunk, spawnLoc);
  if (sq.info.has(SquareFlag.MON_RESTRICT)) return false;

  return true;
}

/**
 * Find a valid spawn point near a given location using random scatter.
 *
 * Tries up to MAX_SCATTER_ATTEMPTS random offsets within the given spread
 * distance. Returns null if no valid point is found.
 */
export function findSpawnPoint(
  chunk: Chunk,
  center: Loc,
  spread: number,
  rng: RNG,
): Loc | null {
  for (let i = 0; i < MAX_SCATTER_ATTEMPTS; i++) {
    const dx = rng.spread(0, spread);
    const dy = rng.spread(0, spread);
    const candidate = loc(center.x + dx, center.y + dy);

    if (isValidSpawnPoint(chunk, candidate)) {
      return candidate;
    }
  }
  return null;
}

// ── Monster creation ──

/**
 * Create a monster instance from a race template.
 *
 * Allocates a new Monster with stats derived from the race. HP is
 * randomised around the race's average. The monster's grid is set to
 * (0,0) and must be placed on the map separately.
 *
 * Port of the monster creation logic from mon-make.c.
 */
export function createMonster(race: MonsterRace, rng: RNG): Monster {
  // Roll hit points: average +/- 12.5%
  const spread = Math.max(1, Math.floor(race.avgHp / 8));
  const hp = Math.max(1, rng.spread(race.avgHp, spread));

  // Determine sleep counter
  const sleepVal = race.sleep > 0
    ? rng.spread(race.sleep, Math.floor(race.sleep / 2))
    : 0;

  // Allocate timed effect array
  const mTimed = new Int16Array(MonsterTimedEffect.MON_TMD_MAX);
  if (sleepVal > 0) {
    mTimed[MonsterTimedEffect.SLEEP] = sleepVal;
  }

  // Temporary flags
  const mflag = new BitFlag(MonsterTempFlag.MFLAG_MAX);

  // Default target: no target
  const target: MonsterTarget = {
    grid: loc(0, 0),
    midx: 0 as MonsterId,
  };

  // Group info (one per group type)
  const groupInfo: MonsterGroupInfo[] = [
    { index: 0, role: MonsterGroupRole.MEMBER },
    { index: 0, role: MonsterGroupRole.MEMBER },
  ];

  return {
    race,
    originalRace: null,
    midx: 0 as MonsterId,
    grid: loc(0, 0),
    hp,
    maxhp: hp,
    mTimed,
    mspeed: race.speed,
    energy: 0,
    cdis: 0,
    mflag,
    mimickedObjIdx: 0,
    heldObjIdx: 0,
    attr: race.dAttr,
    target,
    groupInfo,
    minRange: 1,
    bestRange: 1,
  };
}

// ── Monster placement ──

/**
 * Place a monster instance onto the chunk at the given location.
 *
 * Updates the square's monster field and the chunk's monster tracking.
 * Returns the monster index assigned, or -1 if placement failed.
 */
function placeMonsterOnGrid(
  chunk: Chunk,
  mon: Monster,
  placeLoc: Loc,
): number {
  const sq = chunkGetSquare(chunk, placeLoc);

  // Assign monster index (monMax is next available slot)
  const midx = chunk.monMax;
  (mon as { midx: MonsterId }).midx = midx as MonsterId;
  mon.grid = placeLoc;

  // Record on the square
  sq.mon = midx as MonsterId;

  // Add to the chunk's monster array at the correct index
  while (chunk.monsters.length <= midx) {
    chunk.monsters.push(null as unknown as Monster);
  }
  chunk.monsters[midx] = mon;

  // Update chunk tracking
  chunk.monMax++;
  chunk.monCnt++;

  // Update racial count
  mon.race.curNum++;

  // Track breeders
  if (mon.race.flags.has(MonsterRaceFlag.MULTIPLY)) {
    chunk.numRepro++;
  }

  return midx;
}

/**
 * Place a new monster at a given location.
 *
 * Creates a monster from the given race, places it on the chunk, and
 * optionally puts it to sleep. Returns the placed monster, or null if
 * placement is invalid.
 *
 * Port of place_new_monster() from mon-make.c.
 *
 * @param chunk   - The dungeon level
 * @param placeLoc - Target grid location
 * @param race    - Monster race (species) template
 * @param sleep   - Whether the monster starts asleep
 * @param groupOk - Whether to spawn group members alongside
 * @param origin  - Numeric origin code (e.g. for lore tracking)
 * @param rng     - Random number generator
 * @returns The placed monster, or null if placement failed
 */
export function placeNewMonster(
  chunk: Chunk,
  placeLoc: Loc,
  race: MonsterRace,
  sleep: boolean,
  groupOk: boolean,
  origin: number,
  rng: RNG,
): Monster | null {
  if (!isValidSpawnPoint(chunk, placeLoc)) return null;

  const mon = createMonster(race, rng);

  // Force sleep if flag says so, or if caller requests
  if (!sleep && race.flags.has(MonsterRaceFlag.FORCE_SLEEP)) {
    sleep = true;
  }

  if (sleep) {
    const sleepVal = race.sleep > 0
      ? rng.spread(race.sleep, Math.floor(race.sleep / 2))
      : 10;
    mon.mTimed[MonsterTimedEffect.SLEEP] = Math.max(1, sleepVal);
  } else {
    mon.mTimed[MonsterTimedEffect.SLEEP] = 0;
  }

  const idx = placeMonsterOnGrid(chunk, mon, placeLoc);
  if (idx < 0) return null;

  // If group spawning is allowed and the race has GROUP_AI, spawn friends
  if (groupOk && race.flags.has(MonsterRaceFlag.GROUP_AI)) {
    const groupSize = rng.range(2, 5);
    placeMonsterGroup(chunk, placeLoc, race, groupSize, rng);
  }

  return mon;
}

// ── Race selection ──

/**
 * Pick a monster race appropriate for a given depth.
 *
 * Implements a simplified version of get_mon_num() from mon-make.c.
 * Filters races by level and rarity, then picks one weighted by probability.
 * Has a 60% chance to try for a harder monster (keeping the deeper one)
 * and a 10% chance to try twice.
 *
 * @param depth - The current dungeon depth
 * @param races - Array of all available monster races
 * @param rng   - Random number generator
 * @returns A suitable race, or null if none is appropriate
 */
export function pickMonsterRace(
  depth: number,
  races: MonsterRace[],
  rng: RNG,
): MonsterRace | null {
  // Occasional out-of-depth boost (1 in 25 chance)
  let generatedLevel = depth;
  if (depth > 0 && rng.oneIn(25)) {
    generatedLevel += Math.min(Math.floor(depth / 4) + 2, 4);
  }

  // Build probability table
  interface AllocEntry {
    race: MonsterRace;
    prob: number;
  }

  const table: AllocEntry[] = [];
  let total = 0;

  for (const race of races) {
    // Skip races with no rarity (special/ungenerated)
    if (race.rarity <= 0) continue;

    // Skip races deeper than generated level
    if (race.level > generatedLevel) continue;

    // No town monsters in dungeon
    if (depth > 0 && race.level <= 0) continue;

    // Only one copy of a unique at a time
    if (race.flags.has(MonsterRaceFlag.UNIQUE) && race.curNum >= race.maxNum) {
      continue;
    }

    // Some monsters never appear out of depth
    if (race.flags.has(MonsterRaceFlag.FORCE_DEPTH) && race.level > depth) {
      continue;
    }

    // Calculate probability
    const prob = Math.floor(100 / race.rarity) * (1 + Math.floor(race.level / 10));
    if (prob <= 0) continue;

    table.push({ race, prob });
    total += prob;
  }

  if (total <= 0 || table.length === 0) return null;

  // Helper: pick a race from the weighted table
  function pickFromTable(): MonsterRace {
    let value = rng.randint0(total);
    for (const entry of table) {
      if (value < entry.prob) return entry.race;
      value -= entry.prob;
    }
    // Fallback (should not happen)
    return table[table.length - 1]!.race;
  }

  let race = pickFromTable();

  // Try for a harder monster (60% chance)
  const p = rng.randint0(100);
  if (p < 60) {
    const candidate = pickFromTable();
    if (candidate.level > race.level) {
      race = candidate;
    }
  }

  // Try again for an even harder one (10% chance)
  if (p < 10) {
    const candidate = pickFromTable();
    if (candidate.level > race.level) {
      race = candidate;
    }
  }

  return race;
}

// ── Group placement ──

/**
 * Place a group of monsters of the same race near a location.
 *
 * Attempts to scatter group members around the given center point.
 * Returns the array of successfully placed monsters.
 *
 * Port of group placement logic from mon-make.c.
 */
export function placeMonsterGroup(
  chunk: Chunk,
  center: Loc,
  race: MonsterRace,
  count: number,
  rng: RNG,
): Monster[] {
  const placed: Monster[] = [];

  for (let i = 0; i < count; i++) {
    let success = false;

    for (let attempt = 0; attempt < MAX_GROUP_ATTEMPTS; attempt++) {
      // Pick a random adjacent or nearby location
      const dir = DIRS[rng.randint0(8)]!;
      const candidate = locSum(center, loc(dir.x * (i + 1), dir.y * (i + 1)));

      // Try with scatter if direct placement fails
      const spawnLoc = isValidSpawnPoint(chunk, candidate)
        ? candidate
        : findSpawnPoint(chunk, center, 3, rng);

      if (spawnLoc !== null) {
        const mon = createMonster(race, rng);
        // Group members are awake by default
        mon.mTimed[MonsterTimedEffect.SLEEP] = 0;

        const idx = placeMonsterOnGrid(chunk, mon, spawnLoc);
        if (idx >= 0) {
          placed.push(mon);
          success = true;
          break;
        }
      }
    }

    // If we can't place this member, continue trying the rest
    if (!success) continue;
  }

  return placed;
}

// ── Monster deletion ──

/**
 * Remove a monster from the chunk.
 *
 * Clears the monster from its square, decrements racial and chunk counts.
 * Note: does not compact the monster list (the slot remains empty).
 *
 * Port of delete_monster_idx() from mon-make.c (simplified).
 */
export function deleteMonster(chunk: Chunk, mon: Monster): void {
  // Clear the square reference
  if (chunkContains(chunk, mon.grid)) {
    const sq = chunkGetSquare(chunk, mon.grid);
    if (sq.mon === mon.midx) {
      sq.mon = 0 as MonsterId;
    }
  }

  // Reduce the racial counter
  if (mon.originalRace) {
    mon.originalRace.curNum--;
  } else {
    mon.race.curNum--;
  }

  // Count breeders
  if (mon.race.flags.has(MonsterRaceFlag.MULTIPLY)) {
    chunk.numRepro--;
  }

  // Update chunk count
  chunk.monCnt--;
}
