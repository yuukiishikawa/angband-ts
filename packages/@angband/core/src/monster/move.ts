/**
 * @file monster/move.ts
 * @brief Monster movement AI
 *
 * Port of mon-move.c — monster AI decision-making, pathfinding,
 * movement validation, and movement execution.
 *
 * Copyright (c) 1997 Ben Harrison, David Reeve Sward, Keldon Jones.
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Loc } from "../z/index.js";
import { loc, locSum, locEq, type RNG } from "../z/index.js";
import type {
  Chunk,
  MonsterId,
  Monster,
} from "../types/index.js";
import {
  MonsterRaceFlag,
  MonsterTimedEffect,
  MonsterTempFlag,
} from "../types/index.js";
import {
  chunkContains,
  chunkContainsFully,
  chunkGetSquare,
  squareIsPassable,
  squareHasMonster,
  squareIsClosedDoor,
  squareIsWall,
} from "../cave/index.js";
import { createMonster, placeNewMonster } from "./make.js";

// ── Types ──

/**
 * Discriminated union for monster AI actions.
 *
 * Each turn a monster chooses one of these actions:
 * - `move`   — move to an adjacent square
 * - `attack` — attack the player (or another monster) at target
 * - `spell`  — cast a spell (placeholder for future expansion)
 * - `idle`   — do nothing (sleep, stunned, no valid move)
 */
export type MonsterAction =
  | { readonly type: "move"; readonly target: Loc }
  | { readonly type: "attack"; readonly target: Loc }
  | { readonly type: "spell"; readonly target: Loc }
  | { readonly type: "idle" };

// ── Constants ──

/** The 8 directions as (dx, dy) offsets, cardinal first. */
const DIRS: readonly Loc[] = [
  loc(0, -1),  // N
  loc(0, 1),   // S
  loc(-1, 0),  // W
  loc(1, 0),   // E
  loc(-1, -1), // NW
  loc(1, -1),  // NE
  loc(-1, 1),  // SW
  loc(1, 1),   // SE
];

// ── Movement validation ──

/**
 * Check if a monster can enter a given square.
 *
 * Considers terrain passability and monster race flags:
 * - PASS_WALL allows moving through walls
 * - KILL_WALL allows destroying walls (treated as passable)
 * - OPEN_DOOR / BASH_DOOR allows handling closed doors
 * - NEVER_MOVE prevents all movement
 *
 * Port of movement checks from mon-move.c.
 */
export function monsterCanMove(
  chunk: Chunk,
  mon: Monster,
  moveLoc: Loc,
): boolean {
  // Never move flag
  if (mon.race.flags.has(MonsterRaceFlag.NEVER_MOVE)) return false;

  // Must be in bounds
  if (!chunkContains(chunk, moveLoc)) return false;

  // Pass-wall or kill-wall monsters can go through walls
  if (mon.race.flags.has(MonsterRaceFlag.PASS_WALL) ||
      mon.race.flags.has(MonsterRaceFlag.KILL_WALL)) {
    // Even wall-passers can't go out of the map border
    if (!chunkContainsFully(chunk, moveLoc)) return false;
    return true;
  }

  // Check if the terrain is passable
  if (!squareIsPassable(chunk, moveLoc)) {
    // Closed doors can be opened or bashed
    if (squareIsClosedDoor(chunk, moveLoc)) {
      if (mon.race.flags.has(MonsterRaceFlag.OPEN_DOOR) ||
          mon.race.flags.has(MonsterRaceFlag.BASH_DOOR)) {
        return true;
      }
    }
    return false;
  }

  return true;
}

// ── Pathfinding ──

/**
 * Chebyshev distance between two locations.
 */
function chebyshev(a: Loc, b: Loc): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Find the next step for a monster toward a target location.
 *
 * Uses a simple greedy approach: among the 8 adjacent squares, pick the
 * one that is closest to the target and that the monster can enter.
 * Falls back to the noise/scent heatmaps if available.
 *
 * This is a simplified version of the C get_move_advance() logic.
 *
 * @param chunk  - The dungeon level
 * @param mon    - The monster
 * @param target - The target location to move toward
 * @returns The best adjacent location to step to, or null if stuck
 */
export function monsterFindPath(
  chunk: Chunk,
  mon: Monster,
  target: Loc,
): Loc | null {
  let bestLoc: Loc | null = null;
  let bestDist = chebyshev(mon.grid, target);

  // Try using noise heatmap if the monster can hear
  const noiseGrids = chunk.noise.grids;
  const hasNoise = noiseGrids.length > 0 &&
    noiseGrids[mon.grid.y] !== undefined &&
    noiseGrids[mon.grid.y]![mon.grid.x] !== undefined &&
    noiseGrids[mon.grid.y]![mon.grid.x]! > 0;

  if (hasNoise) {
    let bestNoiseVal = noiseGrids[mon.grid.y]![mon.grid.x]!;

    for (const dir of DIRS) {
      const candidate = locSum(mon.grid, dir);
      if (!monsterCanMove(chunk, mon, candidate)) continue;
      if (squareHasMonster(chunk, candidate)) continue;

      const noiseRow = noiseGrids[candidate.y];
      if (noiseRow === undefined) continue;
      const noiseVal = noiseRow[candidate.x];
      if (noiseVal === undefined || noiseVal === 0) continue;

      // Lower noise value = closer to player (noise radiates outward)
      if (noiseVal < bestNoiseVal) {
        bestNoiseVal = noiseVal;
        bestLoc = candidate;
      }
    }

    if (bestLoc !== null) return bestLoc;
  }

  // Greedy: pick the adjacent square closest to target
  for (const dir of DIRS) {
    const candidate = locSum(mon.grid, dir);

    if (!monsterCanMove(chunk, mon, candidate)) continue;

    // Allow moving through monsters with MOVE_BODY or KILL_BODY
    if (squareHasMonster(chunk, candidate)) {
      if (!mon.race.flags.has(MonsterRaceFlag.MOVE_BODY) &&
          !mon.race.flags.has(MonsterRaceFlag.KILL_BODY)) {
        continue;
      }
    }

    const dist = chebyshev(candidate, target);
    if (dist < bestDist) {
      bestDist = dist;
      bestLoc = candidate;
    }
  }

  return bestLoc;
}

/**
 * Choose a random passable adjacent square for wandering.
 *
 * Port of get_move_random() from mon-move.c.
 */
function getRandomMove(
  chunk: Chunk,
  mon: Monster,
  rng: RNG,
): Loc | null {
  // Build list of valid adjacent squares and shuffle via Fisher-Yates
  const candidates: Loc[] = [];
  for (const dir of DIRS) {
    const candidate = locSum(mon.grid, dir);
    if (monsterCanMove(chunk, mon, candidate) &&
        !squareHasMonster(chunk, candidate)) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) return null;

  return candidates[rng.randint0(candidates.length)]!;
}

// ── Movement execution ──

/**
 * Execute a monster's movement to a new location.
 *
 * Updates the monster's grid, the old square's monster field, and the new
 * square's monster field. This function assumes the target square has already
 * been validated.
 *
 * @param chunk  - The dungeon level
 * @param mon    - The monster to move
 * @param newLoc - The destination location
 */
export function monsterMove(
  chunk: Chunk,
  mon: Monster,
  newLoc: Loc,
): void {
  const oldLoc = mon.grid;

  // Handle monster-on-monster interaction
  const newSq = chunkGetSquare(chunk, newLoc);
  if (newSq.mon > (0 as MonsterId) && newSq.mon !== mon.midx) {
    if (mon.race.flags.has(MonsterRaceFlag.KILL_BODY)) {
      // Kill the other monster
      // Find the target monster in chunk.monsters
      const targetMon = chunk.monsters.find((m) => m && m.midx === newSq.mon);
      if (targetMon) {
        targetMon.hp = 0; // Will be cleaned up by processDeadMonsters
      }
      // Clear the killer's old square (KILL_BODY doesn't swap)
      if (chunkContains(chunk, oldLoc)) {
        const oldSq = chunkGetSquare(chunk, oldLoc);
        if (oldSq.mon === mon.midx) {
          oldSq.mon = 0 as MonsterId;
        }
      }
    } else if (mon.race.flags.has(MonsterRaceFlag.MOVE_BODY)) {
      // Swap positions: push the other monster to our old square
      const targetMon = chunk.monsters.find((m) => m && m.midx === newSq.mon);
      if (targetMon) {
        targetMon.grid = oldLoc;
        const oldSq = chunkGetSquare(chunk, oldLoc);
        oldSq.mon = targetMon.midx;
        // New square will be set below
      }
    } else {
      // Can't move here
      return;
    }
  } else {
    // Clear the old square (only if no swap happened)
    if (chunkContains(chunk, oldLoc)) {
      const oldSq = chunkGetSquare(chunk, oldLoc);
      if (oldSq.mon === mon.midx) {
        oldSq.mon = 0 as MonsterId;
      }
    }
  }

  // Set the new square
  newSq.mon = mon.midx;

  // Update monster position
  mon.grid = newLoc;
}

// ── Main AI decision ──

/**
 * Determine what a monster does on its turn.
 *
 * Implements the core monster AI loop:
 * 1. If sleeping, stay idle (decrement sleep counter)
 * 2. If stunned, chance of idle
 * 3. If confused, move randomly
 * 4. If player is visible and adjacent, attack
 * 5. If player is visible, move toward player
 * 6. If can hear/smell player, track toward player
 * 7. Otherwise, wander randomly or stay idle
 *
 * Port of the main turn logic from mon-move.c (simplified).
 *
 * @param chunk     - The dungeon level
 * @param mon       - The monster taking its turn
 * @param playerLoc - The player's current position
 * @param rng       - Random number generator
 * @returns The action the monster chooses to take
 */
export function monsterTakeTurn(
  chunk: Chunk,
  mon: Monster,
  playerLoc: Loc,
  rng: RNG,
): MonsterAction {
  // Helper indices for timed effects (const enum values as numbers)
  const SLEEP = MonsterTimedEffect.SLEEP as number;
  const HOLD = MonsterTimedEffect.HOLD as number;
  const STUN = MonsterTimedEffect.STUN as number;
  const CONF = MonsterTimedEffect.CONF as number;
  const FEAR = MonsterTimedEffect.FEAR as number;

  // 1. Sleeping monsters do nothing (but decrement counter)
  if (mon.mTimed[SLEEP]! > 0) {
    mon.mTimed[SLEEP] = mon.mTimed[SLEEP]! - 1;
    return { type: "idle" };
  }

  // 2. Held monsters cannot act
  if (mon.mTimed[HOLD]! > 0) {
    mon.mTimed[HOLD] = mon.mTimed[HOLD]! - 1;
    return { type: "idle" };
  }

  // 3. Stunned monsters may skip their turn (50% chance)
  if (mon.mTimed[STUN]! > 0) {
    if (rng.oneIn(2)) {
      mon.mTimed[STUN] = mon.mTimed[STUN]! - 1;
      return { type: "idle" };
    }
  }

  // 4. Confused monsters move randomly
  if (mon.mTimed[CONF]! > 0) {
    mon.mTimed[CONF] = mon.mTimed[CONF]! - 1;
    const randomTarget = getRandomMove(chunk, mon, rng);
    if (randomTarget !== null) {
      return { type: "move", target: randomTarget };
    }
    return { type: "idle" };
  }

  // 5. Check random movement flags
  if (mon.race.flags.has(MonsterRaceFlag.RAND_50) && rng.oneIn(2)) {
    const randomTarget = getRandomMove(chunk, mon, rng);
    if (randomTarget !== null) {
      return { type: "move", target: randomTarget };
    }
  }
  if (mon.race.flags.has(MonsterRaceFlag.RAND_25) && rng.oneIn(4)) {
    const randomTarget = getRandomMove(chunk, mon, rng);
    if (randomTarget !== null) {
      return { type: "move", target: randomTarget };
    }
  }

  // 6. Frightened monsters flee away from the player
  if (mon.mTimed[FEAR]! > 0 ||
      mon.race.flags.has(MonsterRaceFlag.FRIGHTENED)) {
    return chooseFlee(chunk, mon, playerLoc, rng);
  }

  // 7. NEVER_MOVE monsters can only idle (no attacks in this simplified model)
  if (mon.race.flags.has(MonsterRaceFlag.NEVER_MOVE)) {
    // Check if player is adjacent for melee attack
    if (chebyshev(mon.grid, playerLoc) <= 1 &&
        !mon.race.flags.has(MonsterRaceFlag.NEVER_BLOW)) {
      return { type: "attack", target: playerLoc };
    }
    return { type: "idle" };
  }

  // 8. Calculate distance to player
  const dist = chebyshev(mon.grid, playerLoc);

  // 8.5. Consider casting a spell (before melee)
  // Spell casting chance: 1 in freq (freq=4 means 25% chance per turn)
  if (dist > 1 || mon.race.flags.has(MonsterRaceFlag.NEVER_BLOW)) {
    const freq = Math.max(mon.race.freqInnate, mon.race.freqSpell);
    if (freq > 0 && rng.randint0(freq) === 0) {
      // Monster decides to cast — return spell action toward player
      return { type: "spell", target: playerLoc };
    }
  }

  // 9. If adjacent to player, attack (unless NEVER_BLOW)
  if (dist <= 1) {
    if (!mon.race.flags.has(MonsterRaceFlag.NEVER_BLOW)) {
      return { type: "attack", target: playerLoc };
    }
    // NEVER_BLOW but adjacent: try to stay at range
    return chooseFlee(chunk, mon, playerLoc, rng);
  }

  // 10. Try to move toward the player
  const nextStep = monsterFindPath(chunk, mon, playerLoc);
  if (nextStep !== null) {
    // If the next step brings us adjacent to the player, check for attack
    if (chebyshev(nextStep, playerLoc) <= 0) {
      if (!mon.race.flags.has(MonsterRaceFlag.NEVER_BLOW)) {
        return { type: "attack", target: playerLoc };
      }
    }
    return { type: "move", target: nextStep };
  }

  // 11. No path to player: wander randomly
  const randomTarget = getRandomMove(chunk, mon, rng);
  if (randomTarget !== null) {
    return { type: "move", target: randomTarget };
  }

  // 12. Completely stuck
  return { type: "idle" };
}

// ── Multiplication ──

/** Maximum number of breeders on a level. */
const MAX_REPRO = 100;

/**
 * Attempt monster multiplication (breeding).
 *
 * MULTIPLY-flagged monsters try to clone themselves to an adjacent
 * empty square. Breeding is capped per level and probability scales
 * inversely with monster speed.
 *
 * Port of multiply_monster() from mon-move.c.
 *
 * @param chunk - The dungeon level
 * @param mon   - The breeding monster
 * @param rng   - Random number generator
 * @returns True if a clone was successfully placed
 */
export function monsterMultiply(
  chunk: Chunk,
  mon: Monster,
  rng: RNG,
): boolean {
  if (!mon.race.flags.has(MonsterRaceFlag.MULTIPLY)) return false;

  // Cap total breeders on the level
  if (chunk.numRepro >= MAX_REPRO) return false;

  // Find an adjacent empty square
  const candidates: Loc[] = [];
  for (const dir of DIRS) {
    const candidate = locSum(mon.grid, dir);
    if (!chunkContains(chunk, candidate)) continue;
    if (!squareIsPassable(chunk, candidate)) continue;
    if (squareHasMonster(chunk, candidate)) continue;
    candidates.push(candidate);
  }

  if (candidates.length === 0) return false;

  const target = candidates[rng.randint0(candidates.length)]!;

  // Place a clone of the same race (awake, no group spawning)
  const clone = placeNewMonster(chunk, target, mon.race, false, false, 0, rng);
  return clone !== null;
}

// ── Fleeing logic ──

/**
 * Choose a flee direction: move away from the player.
 */
function chooseFlee(
  chunk: Chunk,
  mon: Monster,
  playerLoc: Loc,
  rng: RNG,
): MonsterAction {
  let bestLoc: Loc | null = null;
  let bestDist = chebyshev(mon.grid, playerLoc);

  // Try all 8 directions, prefer the one farthest from player
  const shuffled = [...DIRS];
  // Fisher-Yates shuffle for randomness among equal choices
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.randint0(i + 1);
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }

  for (const dir of shuffled) {
    const candidate = locSum(mon.grid, dir);
    if (!monsterCanMove(chunk, mon, candidate)) continue;
    if (squareHasMonster(chunk, candidate)) continue;

    const dist = chebyshev(candidate, playerLoc);
    if (dist > bestDist) {
      bestDist = dist;
      bestLoc = candidate;
    }
  }

  if (bestLoc !== null) {
    return { type: "move", target: bestLoc };
  }

  return { type: "idle" };
}
