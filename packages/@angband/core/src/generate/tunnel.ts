/**
 * @file generate/tunnel.ts
 * @brief Tunnel generation between rooms
 *
 * Port of the tunneling algorithm from gen-cave.c build_tunnel().
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 * Copyright (c) 2013 Erik Osheim, Nick McConnell
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Chunk } from "../types/index.js";
import { Feat, SquareFlag } from "../types/index.js";
import type { Loc, RNG } from "../z/index.js";
import { loc, locSum, locEq } from "../z/index.js";
import {
  chunkContains,
  chunkContainsFully,
  chunkGetSquare,
  squareSetFeat,
  squareIsFloor,
  squareIsRoom,
  squareIsGranite,
} from "../cave/index.js";

// ── Constants ──

/** Maximum iterations to prevent infinite loops. */
const MAX_TUNNEL_ITERATIONS = 2000;

/** Probability (percent) of changing direction. */
const TUNNEL_CHANGE_DIR = 30;

/** Probability (percent) of taking a random direction (within a change). */
const TUNNEL_RANDOM_DIR = 10;

/**
 * The four cardinal directions as (dx, dy) offsets.
 */
const CARDINAL_DIRS: readonly Loc[] = [
  loc(0, -1), // N
  loc(1, 0),  // E
  loc(0, 1),  // S
  loc(-1, 0), // W
];

// ── Helpers ──

/**
 * Given two points, pick a valid cardinal direction from one toward the other.
 *
 * Port of correct_dir() from gen-util.c.
 * If diagonal, randomly pick either the horizontal or vertical component.
 */
function correctDir(rng: RNG, from: Loc, to: Loc): Loc {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);

  if (dx === 0 || dy === 0) return loc(dx, dy);

  // Diagonal — randomly choose horizontal or vertical
  if (rng.randint0(100) < 50) {
    return loc(dx, 0);
  }
  return loc(0, dy);
}

/**
 * Pick a random cardinal direction.
 *
 * Port of rand_dir() from gen-util.c.
 */
function randDir(rng: RNG): Loc {
  return CARDINAL_DIRS[rng.randint0(4)]!;
}

/**
 * Test if a square is an outer wall (granite with WALL_OUTER flag).
 */
function isOuterWall(chunk: Chunk, pos: Loc): boolean {
  if (!chunkContains(chunk, pos)) return false;
  const sq = chunkGetSquare(chunk, pos);
  return squareIsGranite(chunk, pos) && sq.info.has(SquareFlag.WALL_OUTER);
}

/**
 * Test if a square is a solid wall (granite with WALL_SOLID flag)
 * or permanent wall.
 */
function isSolidWall(chunk: Chunk, pos: Loc): boolean {
  if (!chunkContains(chunk, pos)) return false;
  const sq = chunkGetSquare(chunk, pos);
  if (sq.feat === Feat.PERM) return true;
  return squareIsGranite(chunk, pos) && sq.info.has(SquareFlag.WALL_SOLID);
}

// ── Main tunnel builder ──

/**
 * Dig a tunnel between two points using a biased random walk.
 *
 * Port of build_tunnel() from gen-cave.c (simplified).
 *
 * Algorithm:
 * 1. Start at `from`, aim toward `to`.
 * 2. Each step, with some probability, change direction (biased toward target).
 * 3. Skip permanent walls and solid-marked walls.
 * 4. Pierce outer walls of rooms, placing a door opportunity.
 * 5. Carve through granite by setting to FLOOR.
 * 6. Stop when reaching the target or after MAX_TUNNEL_ITERATIONS.
 *
 * @param chunk The dungeon chunk being generated.
 * @param from  Starting location (typically a room center).
 * @param to    Target location (another room center).
 * @param rng   Random number generator.
 * @returns Array of Loc positions that were carved into floor.
 */
export function digTunnel(
  chunk: Chunk,
  from: Loc,
  to: Loc,
  rng: RNG,
): Loc[] {
  const carved: Loc[] = [];
  let current = from;
  let dir = correctDir(rng, current, to);
  let iterations = 0;

  while (!locEq(current, to) && iterations < MAX_TUNNEL_ITERATIONS) {
    iterations++;

    // Possibly change direction
    if (rng.randint0(100) < TUNNEL_CHANGE_DIR) {
      dir = correctDir(rng, current, to);
      if (rng.randint0(100) < TUNNEL_RANDOM_DIR) {
        dir = randDir(rng);
      }
    }

    // Compute next grid
    let next = locSum(current, dir);

    // If out of bounds, redirect
    if (!chunkContains(chunk, next)) {
      dir = correctDir(rng, current, to);
      next = locSum(current, dir);
      if (!chunkContains(chunk, next)) continue;
    }

    // Skip permanent walls and solid-flagged walls
    if (isSolidWall(chunk, next)) {
      continue;
    }

    // Pierce outer walls of rooms — this becomes a door location
    if (isOuterWall(chunk, next)) {
      squareSetFeat(chunk, next, Feat.CLOSED);
      // Mark adjacent outer walls as solid to prevent adjacent piercings
      for (const d of CARDINAL_DIRS) {
        const adj = locSum(next, d);
        if (chunkContains(chunk, adj) && isOuterWall(chunk, adj)) {
          chunkGetSquare(chunk, adj).info.off(SquareFlag.WALL_OUTER);
          chunkGetSquare(chunk, adj).info.on(SquareFlag.WALL_SOLID);
        }
      }
      carved.push(next);
      current = next;
      continue;
    }

    // Move through rooms quickly (already carved)
    if (squareIsFloor(chunk, next) || squareIsRoom(chunk, next)) {
      current = next;
      continue;
    }

    // Carve through granite or rock
    if (squareIsGranite(chunk, next) || chunkGetSquare(chunk, next).feat === Feat.NONE) {
      squareSetFeat(chunk, next, Feat.FLOOR);
      carved.push(next);
      current = next;
      continue;
    }

    // For any other terrain, just advance
    current = next;
  }

  return carved;
}
