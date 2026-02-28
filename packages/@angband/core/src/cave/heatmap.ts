/**
 * @file cave/heatmap.ts
 * @brief Sound and scent heatmap propagation
 *
 * Port of cave-map.c update_noise() / update_scent() — BFS-based
 * propagation of sound (noise) and scent from the player's position.
 *
 * Noise: Recalculated every player turn. Radiates outward from the
 * player through passable squares. Value 1 = player position,
 * 2 = 1 step away, etc. Monsters follow decreasing values to
 * locate the player even without LOS.
 *
 * Scent: Builds up over time. The player leaves a scent trail that
 * persists for several hundred turns. Monsters with SMELL can
 * track the player by following increasing scent values.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 * Copyright (c) 2024 Angband-TS Contributors
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Chunk, Heatmap } from "../types/cave.js";
import type { Loc } from "../z/type.js";
import { loc } from "../z/type.js";
import { chunkContains } from "./chunk.js";
import { squareIsPassable } from "./square.js";

// ── Constants ──

/** Maximum BFS propagation radius for noise. */
const NOISE_MAX_RADIUS = 60;

/** Maximum scent age before it fades completely. */
const SCENT_MAX_AGE = 5000;

/** Scent strength deposited at the player's position each turn. */
const SCENT_DEPOSIT = 1;

/** 8-directional offsets for BFS expansion. */
const DIRS: readonly Loc[] = [
  loc(-1, -1), loc(0, -1), loc(1, -1),
  loc(-1, 0),              loc(1, 0),
  loc(-1, 1),  loc(0, 1),  loc(1, 1),
];

// ── Noise propagation ──

/**
 * Recalculate the noise heatmap via BFS from the player's position.
 *
 * Port of `update_noise()` from cave-map.c.
 *
 * The noise heatmap tells monsters how far (in steps) they are from
 * the player. Value 1 = player position, 2+ = further away, 0 = unreachable.
 * Monsters follow the gradient toward lower values.
 *
 * @param chunk     The dungeon level
 * @param playerLoc The player's current position
 */
export function updateNoise(chunk: Chunk, playerLoc: Loc): void {
  const heatmap = chunk.noise;

  // Guard: skip if heatmap grids are not allocated (e.g. test stubs)
  if (heatmap.grids.length === 0 || heatmap.grids[0] === undefined) return;

  // Clear the existing noise map
  for (let y = 0; y < chunk.height; y++) {
    heatmap.grids[y]!.fill(0);
  }

  // BFS from the player
  const queue: Loc[] = [playerLoc];
  heatmap.grids[playerLoc.y]![playerLoc.x] = 1;

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++]!;
    const curVal = heatmap.grids[cur.y]![cur.x]!;

    // Don't propagate beyond max radius
    if (curVal >= NOISE_MAX_RADIUS) continue;

    for (const dir of DIRS) {
      const nx = cur.x + dir.x;
      const ny = cur.y + dir.y;
      const next = loc(nx, ny);

      if (!chunkContains(chunk, next)) continue;

      // Already visited
      if (heatmap.grids[ny]![nx]! !== 0) continue;

      // Noise only passes through passable terrain
      if (!squareIsPassable(chunk, next)) continue;

      heatmap.grids[ny]![nx] = curVal + 1;
      queue.push(next);
    }
  }
}

// ── Scent propagation ──

/**
 * Update the scent heatmap.
 *
 * Port of `update_scent()` from cave-map.c.
 *
 * Deposits scent at the player's current position and nearby squares.
 * Scent values represent the turn number when scent was last deposited,
 * allowing monsters to track the player's trail.
 *
 * @param chunk     The dungeon level
 * @param playerLoc The player's current position
 * @param turn      The current game turn
 */
export function updateScent(
  chunk: Chunk,
  playerLoc: Loc,
  turn: number,
): void {
  const heatmap = chunk.scent;

  // Guard: skip if heatmap grids are not allocated (e.g. test stubs)
  if (heatmap.grids.length === 0 || heatmap.grids[0] === undefined) return;

  // Deposit scent at player position and immediate neighbors
  // The scent value is the turn number — higher = more recent
  const depositRadius = 2;

  for (let dy = -depositRadius; dy <= depositRadius; dy++) {
    for (let dx = -depositRadius; dx <= depositRadius; dx++) {
      const sx = playerLoc.x + dx;
      const sy = playerLoc.y + dy;
      const sLoc = loc(sx, sy);

      if (!chunkContains(chunk, sLoc)) continue;
      if (!squareIsPassable(chunk, sLoc)) continue;

      // Only deposit within Chebyshev radius
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (dist > depositRadius) continue;

      // Store the current turn as scent age
      // Newer turns = higher values = fresher scent
      heatmap.grids[sy]![sx] = turn & 0xFFFF; // Wrap at 16-bit boundary
    }
  }
}

/**
 * Check how old the scent at a location is relative to the current turn.
 *
 * @param chunk The dungeon level
 * @param at    The location to check
 * @param turn  The current game turn
 * @returns Age in turns (0 = fresh), or SCENT_MAX_AGE if no scent
 */
export function scentAge(chunk: Chunk, at: Loc, turn: number): number {
  const val = chunk.scent.grids[at.y]?.[at.x] ?? 0;
  if (val === 0) return SCENT_MAX_AGE;

  const currentWrapped = turn & 0xFFFF;
  let age = currentWrapped - val;
  if (age < 0) age += 0x10000; // Handle wrap-around

  return Math.min(age, SCENT_MAX_AGE);
}
