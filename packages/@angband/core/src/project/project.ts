/**
 * @file project/project.ts
 * @brief Main projection engine — beam/bolt/ball/arc path calculation and effects
 *
 * Port of project.c — the generic "beam"/"bolt"/"ball"/"arc" projection system.
 *
 * The projection system traces a path from a source to a target grid,
 * then applies elemental effects to terrain, objects, monsters, and the player.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Loc } from "../z/index.js";
import { loc, locEq } from "../z/index.js";
import type { RNG } from "../z/index.js";
import type { Chunk, FeatureType } from "../types/index.js";
import { TerrainFlag, SquareFlag } from "../types/index.js";
import type { Element } from "../types/index.js";
import type { Player } from "../types/index.js";

import { projectFeature, type FeatResult } from "./feat.js";
import { projectMonster, type MonsterProjectResult } from "./monster.js";
import { projectPlayer, type PlayerProjectResult } from "./player.js";
import type { EventBus } from "../game/event.js";
import { GameEventType } from "../game/event.js";

// ── Project flags ──

/**
 * Bitflags controlling projection behaviour.
 * Port of PROJECT_* defines from project.h.
 */
export const enum ProjectFlag {
  /** Affect grids along an arc (cone) from the source */
  ARC = 0x0001,
  /** Affect all grids along the beam path */
  BEAM = 0x0002,
  /** Single bolt: only affects the final grid */
  BOLT = 0x0004,
  /** Ball explosion with radius */
  BALL = 0x0008,
  /** Stop at the first monster/player in the path */
  STOP = 0x0010,
  /** Affect terrain features */
  GRID = 0x0020,
  /** Affect objects on the ground */
  ITEM = 0x0040,
  /** Affect monsters */
  KILL = 0x0080,
  /** Affect the player */
  PLAY = 0x0100,
  /** Start the projection directly at the target (skip path) */
  JUMP = 0x0200,
  /** Continue past the target grid */
  THRU = 0x0400,
  /** Hide visual effects */
  HIDE = 0x0800,
  /** Safe: don't affect the source */
  SAFE = 0x1000,
  /** Information-only: don't stop at walls the player hasn't seen */
  INFO = 0x2000,
}

// ── Result types ──

/** A single monster that was hit by a projection. */
export interface MonsterHit {
  readonly loc: Loc;
  readonly damage: number;
  readonly killed: boolean;
}

/** Full result of a projection. */
export interface ProjectResult {
  readonly affectedGrids: Loc[];
  readonly monstersHit: MonsterHit[];
  readonly playerHit: boolean;
  readonly totalDamage: number;
  readonly messages: string[];
}

/** The path and affected area of a projection. */
export interface ProjectionPath {
  /** Grids along the line from source to target (the bolt/beam path). */
  readonly path: Loc[];
  /** All grids affected by the projection (path + explosion area). */
  readonly grids: Loc[];
}

// ── Feature table (module-level, set via setProjectFeatureTable) ──

let featureTable: FeatureType[] = [];

/**
 * Install the feature table used by projection helpers.
 * Must be called before any projection operations.
 */
export function setProjectFeatureTable(table: FeatureType[]): void {
  featureTable = table;
}

// ── Inline helpers ──

/** Check if a position is within chunk bounds. */
function inBounds(c: Chunk, g: Loc): boolean {
  return g.x >= 0 && g.x < c.width && g.y >= 0 && g.y < c.height;
}

/** Check if terrain allows projections to pass. */
function isProjectable(c: Chunk, g: Loc): boolean {
  if (!inBounds(c, g)) return false;
  const sq = c.squares[g.y]![g.x]!;
  const feat = featureTable[sq.feat];
  if (!feat) return false;
  return feat.flags.has(TerrainFlag.PROJECT);
}

/** Check if terrain is passable (monsters/player can enter). */
function isPassable(c: Chunk, g: Loc): boolean {
  if (!inBounds(c, g)) return false;
  const sq = c.squares[g.y]![g.x]!;
  const feat = featureTable[sq.feat];
  if (!feat) return false;
  return feat.flags.has(TerrainFlag.PASSABLE);
}

/** Check if a square has a monster (non-zero mon field). */
function hasMonster(c: Chunk, g: Loc): boolean {
  if (!inBounds(c, g)) return false;
  return c.squares[g.y]![g.x]!.mon !== 0;
}

/**
 * Angband's approximate distance: max(dy,dx) + min(dy,dx)/2.
 * This produces an octagonal distance metric.
 */
export function angbandDistance(a: Loc, b: Loc): number {
  const ay = Math.abs(b.y - a.y);
  const ax = Math.abs(b.x - a.x);
  return ay > ax ? ay + (ax >> 1) : ax + (ay >> 1);
}

// ── Path calculation (Bresenham-like, port of project_path) ──

/**
 * Calculate the projection path from source to target.
 *
 * Uses the same Bresenham-like algorithm as Angband's project_path().
 * The path is traced one grid per unit along the major axis and
 * stops at walls, monsters (if STOP flag), or max range.
 *
 * @param chunk  The dungeon level
 * @param source Starting grid (excluded from path)
 * @param target Destination grid
 * @param range  Maximum path length
 * @param flags  ProjectFlag bitfield
 * @returns Array of grids along the path
 */
export function calculateProjectionPath(
  chunk: Chunk,
  source: Loc,
  target: Loc,
  range: number,
  flags: number,
): ProjectionPath {
  const path: Loc[] = [];

  if (locEq(source, target)) {
    return { path: [], grids: [] };
  }

  const ay = Math.abs(target.y - source.y);
  const ax = Math.abs(target.x - source.x);
  const sy = target.y < source.y ? -1 : 1;
  const sx = target.x < source.x ? -1 : 1;

  // Number of "units" in one "half" grid
  const half = ay * ax;
  // Number of "units" in one "full" grid
  const full = half << 1;

  let n = 0;
  let k = 0;

  if (ay > ax) {
    // Vertical major axis
    let frac = ax * ax;
    const m = frac << 1;
    let y = source.y + sy;
    let x = source.x;

    while (true) {
      const g = loc(x, y);
      path.push(g);
      n++;

      if ((n + (k >> 1)) >= range) break;

      if (!(flags & ProjectFlag.THRU)) {
        if (locEq(g, target)) break;
      }

      if (!(flags & ProjectFlag.INFO)) {
        if (n > 0 && !isProjectable(chunk, g)) break;
      }

      if (flags & ProjectFlag.STOP) {
        if (n > 0 && hasMonster(chunk, g)) break;
      }

      if (m) {
        frac += m;
        if (frac >= half) {
          x += sx;
          frac -= full;
          k++;
        }
      }
      y += sy;
    }
  } else if (ax > ay) {
    // Horizontal major axis
    let frac = ay * ay;
    const m = frac << 1;
    let y = source.y;
    let x = source.x + sx;

    while (true) {
      const g = loc(x, y);
      path.push(g);
      n++;

      if ((n + (k >> 1)) >= range) break;

      if (!(flags & ProjectFlag.THRU)) {
        if (locEq(g, target)) break;
      }

      if (!(flags & ProjectFlag.INFO)) {
        if (n > 0 && !isProjectable(chunk, g)) break;
      }

      if (flags & ProjectFlag.STOP) {
        if (n > 0 && hasMonster(chunk, g)) break;
      }

      if (m) {
        frac += m;
        if (frac >= half) {
          y += sy;
          frac -= full;
          k++;
        }
      }
      x += sx;
    }
  } else {
    // Diagonal (ay === ax)
    let y = source.y + sy;
    let x = source.x + sx;

    while (true) {
      const g = loc(x, y);
      path.push(g);
      n++;

      if ((n + (n >> 1)) >= range) break;

      if (!(flags & ProjectFlag.THRU)) {
        if (locEq(g, target)) break;
      }

      if (!(flags & ProjectFlag.INFO)) {
        if (n > 0 && !isProjectable(chunk, g)) break;
      }

      if (flags & ProjectFlag.STOP) {
        if (n > 0 && hasMonster(chunk, g)) break;
      }

      y += sy;
      x += sx;
    }
  }

  return { path, grids: [...path] };
}

// ── Area calculations ──

/**
 * Calculate all grids in a ball explosion area.
 *
 * Returns all grids within Angband distance <= radius from the centre
 * that are in line-of-sight (projectable) from the centre.
 *
 * @param center  Centre of the explosion
 * @param radius  Blast radius
 * @param chunk   The dungeon level
 * @returns Array of affected grids (including the centre)
 */
export function calculateBallArea(
  center: Loc,
  radius: number,
  chunk: Chunk,
): Loc[] {
  const grids: Loc[] = [];

  for (let y = center.y - radius; y <= center.y + radius; y++) {
    for (let x = center.x - radius; x <= center.x + radius; x++) {
      const g = loc(x, y);
      if (!inBounds(chunk, g)) continue;

      const dist = angbandDistance(center, g);
      if (dist > radius) continue;

      // Must be projectable from centre (or be the centre itself)
      if (locEq(g, center) || isProjectable(chunk, g)) {
        grids.push(g);
      }
    }
  }

  // Sort by distance from centre (closest first)
  grids.sort(
    (a, b) => angbandDistance(center, a) - angbandDistance(center, b),
  );

  return grids;
}

/**
 * Calculate grids in an arc/cone area.
 *
 * An arc is a portion of a ball explosion, restricted to a cone
 * of the given angular width centred on the line from source to target.
 *
 * @param source   Origin of the arc
 * @param target   Direction target (defines the centre line)
 * @param radius   Arc radius
 * @param degrees  Width of the arc in degrees (0 = beam-like)
 * @param chunk    The dungeon level
 * @returns Array of affected grids
 */
export function calculateArcArea(
  source: Loc,
  target: Loc,
  radius: number,
  degrees: number,
  chunk: Chunk,
): Loc[] {
  const grids: Loc[] = [];

  // Calculate the centre-line angle
  const dy = target.y - source.y;
  const dx = target.x - source.x;
  const centreAngle = Math.atan2(dy, dx);

  // Half-width in radians
  const halfArc = (degrees / 2) * (Math.PI / 180);

  for (let y = source.y - radius; y <= source.y + radius; y++) {
    for (let x = source.x - radius; x <= source.x + radius; x++) {
      const g = loc(x, y);
      if (!inBounds(chunk, g)) continue;
      if (locEq(g, source)) {
        grids.push(g);
        continue;
      }

      const dist = angbandDistance(source, g);
      if (dist > radius) continue;
      if (dist === 0) continue;

      // Check if grid is within the arc angle
      const gridAngle = Math.atan2(y - source.y, x - source.x);
      let angleDiff = Math.abs(gridAngle - centreAngle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

      if (degrees > 0 && angleDiff > halfArc) continue;

      if (isProjectable(chunk, g) || isPassable(chunk, g)) {
        grids.push(g);
      }
    }
  }

  grids.sort(
    (a, b) => angbandDistance(source, a) - angbandDistance(source, b),
  );

  return grids;
}

/**
 * Calculate all grids along a beam path.
 *
 * A beam affects every grid it passes through (not just the endpoint).
 *
 * @param source  Starting grid
 * @param target  Target grid
 * @param range   Maximum range
 * @param chunk   The dungeon level
 * @returns Array of grids the beam passes through
 */
export function calculateBeamArea(
  source: Loc,
  target: Loc,
  range: number,
  chunk: Chunk,
): Loc[] {
  const result = calculateProjectionPath(
    chunk,
    source,
    target,
    range,
    ProjectFlag.BEAM | ProjectFlag.THRU,
  );
  return result.path;
}

// ── Main project function ──

/**
 * Main projection entry point.
 *
 * Traces a path from source to target, calculates the affected area based
 * on the projection type (bolt/beam/ball/arc), then applies effects to
 * terrain, monsters, and the player.
 *
 * @param chunk    The dungeon level
 * @param source   Origin grid of the projection
 * @param target   Target grid
 * @param element  Element type (from the Element enum)
 * @param damage   Base damage
 * @param radius   Explosion radius (0 for bolt/beam)
 * @param flags    ProjectFlag bitfield
 * @param rng      Random number generator
 * @param player   The player (optional, for player damage)
 * @returns Full projection result
 */
export function project(
  chunk: Chunk,
  source: Loc,
  target: Loc,
  element: Element,
  damage: number,
  radius: number,
  flags: number,
  rng: RNG,
  player?: Player,
  eventBus?: EventBus,
): ProjectResult {
  const messages: string[] = [];
  const monstersHit: MonsterHit[] = [];
  let playerHit = false;
  let totalDamage = 0;

  // Determine the starting point
  let start: Loc;
  if (flags & ProjectFlag.JUMP) {
    start = target;
    flags &= ~ProjectFlag.JUMP;
  } else {
    start = source;
  }

  // Determine affected grids
  let affectedGrids: Loc[];

  if (locEq(start, target)) {
    // Point-effect: only affects the target grid
    affectedGrids = [target];
  } else if (flags & ProjectFlag.BEAM) {
    // Beam: affects all grids along the path
    const beamRange = radius > 0 ? radius : 20;
    affectedGrids = calculateBeamArea(start, target, beamRange, chunk);
  } else {
    // Calculate the projection path first
    const projection = calculateProjectionPath(
      chunk, start, target, 20, flags,
    );

    if (projection.path.length === 0) {
      return { affectedGrids: [], monstersHit: [], playerHit: false, totalDamage: 0, messages: [] };
    }

    // Find the centre of explosion (last passable grid on the path)
    let centre = projection.path[projection.path.length - 1]!;
    for (let i = projection.path.length - 1; i >= 0; i--) {
      const g = projection.path[i]!;
      if (isPassable(chunk, g) || locEq(g, target)) {
        centre = g;
        break;
      }
    }

    if (radius > 0) {
      // Ball: calculate explosion area around the centre
      if (flags & ProjectFlag.ARC) {
        affectedGrids = calculateArcArea(start, target, radius, 90, chunk);
      } else {
        affectedGrids = calculateBallArea(centre, radius, chunk);
      }
    } else {
      // Bolt: only affects the final grid
      affectedGrids = [centre];
    }
  }

  // Calculate damage falloff for ball spells
  const damageAtDist = (dist: number): number => {
    if (radius <= 0) return damage;
    if (dist === 0) return damage;
    // Standard Angband ball falloff: damage / (dist + 1)
    return Math.max(1, Math.floor(damage / (dist + 1)));
  };

  // Emit visual events (bolt path / explosion area)
  if (eventBus && !(flags & ProjectFlag.HIDE)) {
    if (flags & ProjectFlag.BOLT) {
      eventBus.emit(GameEventType.BOLT, {
        source, target, element, affectedGrids,
      });
    } else if (radius > 0) {
      eventBus.emit(GameEventType.EXPLOSION, {
        source, target, element, radius, affectedGrids,
      });
    } else {
      eventBus.emit(GameEventType.MISSILE, {
        source, target, element, affectedGrids,
      });
    }
  }

  // Apply effects to each affected grid
  for (const g of affectedGrids) {
    if (!inBounds(chunk, g)) continue;

    const dist = locEq(start, target)
      ? 0
      : angbandDistance(
          affectedGrids.length > 0 ? affectedGrids[0]! : start,
          g,
        );
    const gridDamage = radius > 0
      ? damageAtDist(angbandDistance(
          // Use the ball centre (first grid for point-effect, else actual centre)
          affectedGrids[0]!,
          g,
        ))
      : damage;

    // Affect terrain features
    if (flags & ProjectFlag.GRID) {
      const featResult = projectFeature(chunk, g, element, gridDamage, featureTable);
      if (featResult.changed && featResult.message) {
        messages.push(featResult.message);
      }
    }

    // Affect monsters
    if (flags & ProjectFlag.KILL) {
      const sq = chunk.squares[g.y]?.[g.x];
      if (sq && sq.mon > 0) {
        // Skip the source monster if SAFE flag
        if (!(flags & ProjectFlag.SAFE) || !locEq(g, source)) {
          const monResult = projectMonster(chunk, g, element, gridDamage, source, rng);
          monstersHit.push({
            loc: g,
            damage: monResult.damage,
            killed: monResult.killed,
          });
          totalDamage += monResult.damage;
          if (monResult.message) {
            messages.push(monResult.message);
          }
        }
      }
    }

    // Affect the player
    if ((flags & ProjectFlag.PLAY) && player) {
      if (locEq(g, player.grid)) {
        // Don't hit the source if SAFE flag
        if (!(flags & ProjectFlag.SAFE) || !locEq(g, source)) {
          const playerResult = projectPlayer(player, element, gridDamage, rng);
          playerHit = true;
          totalDamage += playerResult.damage;
          if (playerResult.message) {
            messages.push(playerResult.message);
          }
          for (const se of playerResult.sideEffects) {
            messages.push(se);
          }
        }
      }
    }
  }

  return {
    affectedGrids,
    monstersHit,
    playerHit,
    totalDamage,
    messages,
  };
}
