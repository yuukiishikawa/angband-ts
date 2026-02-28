/**
 * @file cave/view.ts
 * @brief Field of View (FOV) calculation — line-of-sight and view updates
 *
 * Port of cave-view.c — determines which squares are visible (VIEW) and
 * seen (SEEN) from the player's position.
 *
 * The C original uses a brute-force approach: iterate every grid, run
 * a full LOS check from the player position to each one. We implement
 * the same Joseph Hall integer LOS algorithm for accuracy, but also
 * provide the optimised recursive shadowcasting as the primary FOV
 * engine for `updateView()`. The brute-force `los()` function remains
 * available for one-off LOS queries.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Loc } from "../z/index.js";
import { loc } from "../z/index.js";
import type { Chunk, Square, FeatureType } from "../types/index.js";
import { SquareFlag, TerrainFlag } from "../types/index.js";
import { BitFlag } from "../z/index.js";

// ── Feature table (module-level, set via setFeatureTable) ──

/**
 * Global feature (terrain) table. Must be set before calling updateView().
 * In the full game this is loaded from terrain.txt. For tests, use
 * setFeatureTable() to inject a minimal table.
 */
let featureTable: FeatureType[] = [];

/**
 * Install the feature table used by FOV helpers.
 * Must be called before any FOV operations.
 */
export function setFeatureTable(table: FeatureType[]): void {
  featureTable = table;
}

// ── Inline helpers (no dependency on cave/square.ts or cave/chunk.ts) ──

/** Check if a position is within chunk bounds. */
function inBounds(c: Chunk, g: Loc): boolean {
  return g.x >= 0 && g.x < c.width && g.y >= 0 && g.y < c.height;
}

/** Get the square at a grid location. Caller must ensure in-bounds. */
function getSquare(c: Chunk, g: Loc): Square {
  return c.squares[g.y]![g.x]!;
}

/** Check if terrain allows line of sight (has the LOS terrain flag). */
function allowsLOS(c: Chunk, g: Loc): boolean {
  const sq = getSquare(c, g);
  const feat = featureTable[sq.feat];
  if (!feat) return false;
  return feat.flags.has(TerrainFlag.LOS);
}

/**
 * Check if terrain allows projections to pass — used by the Joseph Hall
 * LOS algorithm. Equivalent to square_isprojectable() in C.
 */
function isProjectable(c: Chunk, g: Loc): boolean {
  const sq = getSquare(c, g);
  const feat = featureTable[sq.feat];
  if (!feat) return false;
  return feat.flags.has(TerrainFlag.PROJECT);
}

/** Check if a square has a given info flag. */
function hasFlag(c: Chunk, g: Loc, flag: SquareFlag): boolean {
  return getSquare(c, g).info.has(flag);
}

/** Set a square info flag. */
function setFlag(c: Chunk, g: Loc, flag: SquareFlag): void {
  getSquare(c, g).info.on(flag);
}

/** Clear a square info flag. */
function clearFlag(c: Chunk, g: Loc, flag: SquareFlag): void {
  getSquare(c, g).info.off(flag);
}

/** Check if a square's light level > 0 (lit by any source). */
function isLit(c: Chunk, g: Loc): boolean {
  return getSquare(c, g).light > 0;
}

// ── Approximate distance (from C distance()) ──

/**
 * Angband's approximate distance: max(dy,dx) + min(dy,dx)/2.
 * Used for radius checks.
 */
export function distance(a: Loc, b: Loc): number {
  const ay = Math.abs(b.y - a.y);
  const ax = Math.abs(b.x - a.x);
  return ay > ax ? ay + (ax >> 1) : ax + (ay >> 1);
}

// ── Joseph Hall LOS algorithm (from C los()) ──

/**
 * Integer-based line-of-sight test between two grid centres.
 *
 * All intermediate grids (excluding endpoints) must allow projections.
 * Returns true if an unobstructed line of sight exists.
 *
 * This is a faithful port of the Joseph Hall algorithm from cave-view.c.
 */
export function los(c: Chunk, grid1: Loc, grid2: Loc): boolean {
  const dy = grid2.y - grid1.y;
  const dx = grid2.x - grid1.x;
  const ay = Math.abs(dy);
  const ax = Math.abs(dx);

  // Adjacent or identical grids always have LOS
  if (ax < 2 && ay < 2) return true;

  // Directly South/North
  if (dx === 0) {
    if (dy > 0) {
      for (let ty = grid1.y + 1; ty < grid2.y; ty++) {
        if (!isProjectable(c, loc(grid1.x, ty))) return false;
      }
    } else {
      for (let ty = grid1.y - 1; ty > grid2.y; ty--) {
        if (!isProjectable(c, loc(grid1.x, ty))) return false;
      }
    }
    return true;
  }

  // Directly East/West
  if (dy === 0) {
    if (dx > 0) {
      for (let tx = grid1.x + 1; tx < grid2.x; tx++) {
        if (!isProjectable(c, loc(tx, grid1.y))) return false;
      }
    } else {
      for (let tx = grid1.x - 1; tx > grid2.x; tx--) {
        if (!isProjectable(c, loc(tx, grid1.y))) return false;
      }
    }
    return true;
  }

  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;

  // Vertical and horizontal "knight's move" special cases
  if (ax === 1 && ay === 2 && isProjectable(c, loc(grid1.x, grid1.y + sy))) {
    return true;
  }
  if (ay === 1 && ax === 2 && isProjectable(c, loc(grid1.x + sx, grid1.y))) {
    return true;
  }

  // Scale factor div 2 and scale factor
  const f2 = ax * ay;
  const f1 = f2 << 1;

  // Travel along the longer axis
  if (ax >= ay) {
    let qy = ay * ay;
    const m = qy << 1;
    let tx = grid1.x + sx;
    let ty: number;

    if (qy === f2) {
      ty = grid1.y + sy;
      qy -= f1;
    } else {
      ty = grid1.y;
    }

    while (grid2.x - tx !== 0) {
      if (!isProjectable(c, loc(tx, ty))) return false;
      qy += m;
      if (qy < f2) {
        tx += sx;
      } else if (qy > f2) {
        ty += sy;
        if (!isProjectable(c, loc(tx, ty))) return false;
        qy -= f1;
        tx += sx;
      } else {
        ty += sy;
        qy -= f1;
        tx += sx;
      }
    }
  } else {
    let qx = ax * ax;
    const m = qx << 1;
    let ty = grid1.y + sy;
    let tx: number;

    if (qx === f2) {
      tx = grid1.x + sx;
      qx -= f1;
    } else {
      tx = grid1.x;
    }

    while (grid2.y - ty !== 0) {
      if (!isProjectable(c, loc(tx, ty))) return false;
      qx += m;
      if (qx < f2) {
        ty += sy;
      } else if (qx > f2) {
        tx += sx;
        if (!isProjectable(c, loc(tx, ty))) return false;
        qx -= f1;
        ty += sy;
      } else {
        tx += sx;
        qx -= f1;
        ty += sy;
      }
    }
  }

  return true;
}

// ── Recursive Shadowcasting FOV ──

/**
 * Octant transformation multipliers for recursive shadowcasting.
 *
 * Each of the 8 octants maps the abstract scanning coordinates
 * (row, col) to actual grid offsets (dx, dy). "row" is the depth
 * from the origin (always positive, grows outward); "col" is the
 * lateral offset within that depth (0..row).
 *
 * For octant i, the actual grid offset is:
 *   dx = row * rowDx[i] + col * colDx[i]
 *   dy = row * rowDy[i] + col * colDy[i]
 *
 * The multipliers are arranged so that col/row = slope runs from 0
 * (along the primary axis) to 1 (diagonal). The 8 octants tile the
 * full circle:
 *
 *   Oct 0: E  to NE  (dx=+col, dy=-row)
 *   Oct 1: NE to N   (dx=+row, dy=-col)
 *   Oct 2: N  to NW  (dx=-row, dy=-col)  [note: reflected]
 *   Oct 3: NW to W   (dx=-col, dy=-row)
 *   Oct 4: W  to SW  (dx=-col, dy=+row)
 *   Oct 5: SW to S   (dx=-row, dy=+col)
 *   Oct 6: S  to SE  (dx=+row, dy=+col)
 *   Oct 7: SE to E   (dx=+col, dy=+row)
 */
//                        0   1   2   3   4   5   6   7
const rowDx = /*depth*/ [ 0,  1, -1,  0,  0, -1,  1,  0];
const rowDy = /*depth*/ [-1,  0,  0, -1,  1,  0,  0,  1];
const colDx = /*col  */ [ 1,  0,  0, -1, -1,  0,  0,  1];
const colDy = /*col  */ [ 0, -1, -1,  0,  0,  1,  1,  0];

/**
 * Recursive shadowcasting for a single octant.
 *
 * Processes one "row" (depth level) at a time, sweeping col from 0
 * toward row. Slope = col / row ranges from 0.0 (along the primary
 * axis) to 1.0 (diagonal). `startSlope` and `endSlope` define the
 * visible cone: startSlope >= endSlope, with startSlope initially 1.0
 * (diagonal) and endSlope initially 0.0 (axis).
 *
 * When a wall is encountered the algorithm:
 * 1. Marks the wall cell as VIEW (walls are visible)
 * 2. Recurses with a narrowed endSlope to scan beyond the wall
 * 3. Updates startSlope to skip the shadow
 *
 * @param c          - The chunk
 * @param origin     - The player's position
 * @param octant     - Which of the 8 octants (0..7)
 * @param row        - Current depth from origin (starts at 1)
 * @param startSlope - Upper edge of visible cone (1.0 = diagonal)
 * @param endSlope   - Lower edge of visible cone (0.0 = axis)
 * @param maxRadius  - Maximum view distance
 * @param viewSet    - Set of grid keys already marked VIEW
 */
function castOctant(
  c: Chunk,
  origin: Loc,
  octant: number,
  row: number,
  startSlope: number,
  endSlope: number,
  maxRadius: number,
  viewSet: Set<number>,
): void {
  if (startSlope < endSlope) return;

  let nextStart = startSlope;

  for (let depth = row; depth <= maxRadius; depth++) {
    let blocked = false;

    // Sweep col from the highest (startSlope side) to lowest (endSlope side).
    // col runs from ceil(endSlope * depth) to floor(startSlope * depth).
    // But we iterate col from depth down to 0 for the standard "top to bottom"
    // scan order within the octant. Actually, col goes from high to low.
    const colMin = Math.round(endSlope * depth);
    const colMax = Math.round(startSlope * depth);

    for (let col = colMax; col >= colMin; col--) {
      // Transform (depth, col) to grid offset
      const dx = depth * rowDx[octant]! + col * colDx[octant]!;
      const dy = depth * rowDy[octant]! + col * colDy[octant]!;
      const g = loc(origin.x + dx, origin.y + dy);

      if (!inBounds(c, g)) continue;

      // Slopes for the edges of this cell
      const leftSlope = (col + 0.5) / (depth - 0.5);
      const rightSlope = (col - 0.5) / (depth + 0.5);

      // Skip cells outside the visible cone
      if (rightSlope > startSlope) continue;
      if (leftSlope < endSlope) break;

      // Distance check
      const dist = distance(origin, g);
      if (dist <= maxRadius) {
        const key = g.y * c.width + g.x;
        if (!viewSet.has(key)) {
          viewSet.add(key);
          setFlag(c, g, SquareFlag.VIEW);
        }
      }

      const cellBlocks = !allowsLOS(c, g);

      if (blocked) {
        // Previous cell was a wall
        if (cellBlocks) {
          // Still in wall — update nextStart to track the shadow edge
          nextStart = rightSlope;
        } else {
          // Emerged from wall — start new visible section
          blocked = false;
          startSlope = nextStart;
        }
      } else if (cellBlocks) {
        // Entering a wall — recurse for the visible part above this wall
        blocked = true;
        castOctant(
          c, origin, octant,
          depth + 1,
          nextStart,
          (col + 0.5) / (depth - 0.5), // leftSlope of the blocking cell
          maxRadius, viewSet,
        );
        nextStart = rightSlope;
      }
    }

    if (blocked) break;
  }
}

/**
 * Compute the full shadowcasting FOV and return the set of VIEW grids.
 *
 * This sets the VIEW flag on all grids in line of sight from `origin`
 * within `maxRadius`, using recursive shadowcasting across 8 octants.
 *
 * @returns A Set of encoded grid keys (y * width + x) for all VIEW grids.
 */
function computeShadowcastFOV(
  c: Chunk,
  origin: Loc,
  maxRadius: number,
): Set<number> {
  const viewSet = new Set<number>();

  // The origin is always in view
  const originKey = origin.y * c.width + origin.x;
  viewSet.add(originKey);
  setFlag(c, origin, SquareFlag.VIEW);

  // Cast all 8 octants — each covers a 45-degree wedge
  for (let oct = 0; oct < 8; oct++) {
    castOctant(c, origin, oct, 1, 1.0, 0.0, maxRadius, viewSet);
  }

  return viewSet;
}

// ── Wall visibility fixup ──

/**
 * Fix wall visibility: walls adjacent to VIEW floors should also be VIEW.
 *
 * The shadowcasting algorithm sometimes misses walls at the edge of the
 * cone because the wall cell itself blocks LOS but the player should
 * still see the face of the wall. This matches the C original's
 * update_view_one() wall-stealing logic.
 */
function fixWallVisibility(
  c: Chunk,
  origin: Loc,
  maxRadius: number,
  viewSet: Set<number>,
): void {
  // Collect walls to add (cannot modify viewSet while iterating)
  const wallsToAdd: Loc[] = [];

  for (const key of viewSet) {
    const gy = Math.floor(key / c.width);
    const gx = key % c.width;
    const g = loc(gx, gy);

    // Only process floor (LOS) tiles that are in view
    if (!allowsLOS(c, g)) continue;

    // Check all 8 neighbours
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const ng = loc(gx + dx, gy + dy);
        if (!inBounds(c, ng)) continue;
        const nkey = ng.y * c.width + ng.x;
        if (viewSet.has(nkey)) continue; // already in view

        // Only add walls (non-LOS terrain)
        if (allowsLOS(c, ng)) continue;

        // Distance check
        if (distance(origin, ng) > maxRadius) continue;

        wallsToAdd.push(ng);
      }
    }
  }

  for (const w of wallsToAdd) {
    const wkey = w.y * c.width + w.x;
    if (!viewSet.has(wkey)) {
      viewSet.add(wkey);
      setFlag(c, w, SquareFlag.VIEW);
    }
  }
}

// ── Seen determination ──

/**
 * Determine SEEN status for all VIEW grids.
 *
 * A square is SEEN if it is VIEW and:
 * - For LOS terrain: the square is lit (light > 0) or within torch radius
 * - For wall terrain: the square is lit AND at least one adjacent floor
 *   tile closer to the player is also lit (so the player can see the
 *   wall's face), OR it is within torch radius
 *
 * @param torchRadius - The player's torch/light radius
 */
function determineSeen(
  c: Chunk,
  origin: Loc,
  viewSet: Set<number>,
  torchRadius: number,
): void {
  for (const key of viewSet) {
    const gy = Math.floor(key / c.width);
    const gx = key % c.width;
    const g = loc(gx, gy);
    const dist = distance(origin, g);

    // Within torch radius — always seen + close
    if (dist < torchRadius) {
      setFlag(c, g, SquareFlag.SEEN);
      setFlag(c, g, SquareFlag.CLOSE_PLAYER);
      continue;
    }

    // Check if the square is lit
    if (!isLit(c, g)) continue;

    if (allowsLOS(c, g)) {
      // Floor: lit + in view = seen
      setFlag(c, g, SquareFlag.SEEN);
    } else {
      // Wall: need a lit floor closer to the player to illuminate the face
      const xc = gx < origin.x ? gx + 1 : gx > origin.x ? gx - 1 : gx;
      const yc = gy < origin.y ? gy + 1 : gy > origin.y ? gy - 1 : gy;
      const closer = loc(xc, yc);
      if (inBounds(c, closer) && isLit(c, closer)) {
        setFlag(c, g, SquareFlag.SEEN);
      }
    }
  }
}

// ── Main entry point ──

/**
 * Update the field of view for the chunk from the given player position.
 *
 * This is the primary FOV entry point, equivalent to update_view() in the
 * C original (without the player-state-specific parts like blindness,
 * level feelings, and trap reveals).
 *
 * Algorithm:
 * 1. Save WASSEEN state and clear VIEW/SEEN/CLOSE_PLAYER on all squares
 * 2. Compute FOV via recursive shadowcasting (sets VIEW flags)
 * 3. Fix wall visibility at FOV edges
 * 4. Determine SEEN based on lighting and torch radius
 * 5. Player's own square is always VIEW + SEEN
 *
 * @param chunk       - The dungeon level
 * @param playerLoc   - The player's grid position
 * @param maxRadius   - Maximum view distance (typically 20 in Angband)
 * @param torchRadius - Player's torch/light radius (grids lit by torch).
 *                      Defaults to 1 (standing light only).
 * @param blind       - If true, the player is blind and cannot see anything.
 * @param infraRadius - Infravision radius. Warm-blooded monsters within this
 *                      range are visible even in the dark (not when blind).
 */
export function updateView(
  chunk: Chunk,
  playerLoc: Loc,
  maxRadius: number,
  torchRadius = 1,
  blind = false,
  infraRadius = 0,
): void {
  // Phase 1: Mark WASSEEN, clear VIEW/SEEN/CLOSE_PLAYER
  for (let y = 0; y < chunk.height; y++) {
    for (let x = 0; x < chunk.width; x++) {
      const g = loc(x, y);
      if (hasFlag(chunk, g, SquareFlag.SEEN)) {
        setFlag(chunk, g, SquareFlag.WASSEEN);
      }
      clearFlag(chunk, g, SquareFlag.VIEW);
      clearFlag(chunk, g, SquareFlag.SEEN);
      clearFlag(chunk, g, SquareFlag.CLOSE_PLAYER);
    }
  }

  // Blindness: player's own square only
  if (blind) {
    setFlag(chunk, playerLoc, SquareFlag.VIEW);
    setFlag(chunk, playerLoc, SquareFlag.SEEN);
    return;
  }

  // Phase 2: Compute FOV via recursive shadowcasting
  const viewSet = computeShadowcastFOV(chunk, playerLoc, maxRadius);

  // Phase 3: Fix wall visibility
  fixWallVisibility(chunk, playerLoc, maxRadius, viewSet);

  // Phase 4: Determine SEEN
  determineSeen(chunk, playerLoc, viewSet, torchRadius);

  // Phase 5: Player's square is always VIEW + SEEN
  setFlag(chunk, playerLoc, SquareFlag.VIEW);
  setFlag(chunk, playerLoc, SquareFlag.SEEN);

  // Phase 6: Infravision — mark squares containing warm-blooded monsters
  // within infraRadius as SEEN (even if not lit), provided they are in VIEW.
  if (infraRadius > 0) {
    for (const key of viewSet) {
      const gy = Math.floor(key / chunk.width);
      const gx = key % chunk.width;
      const g = loc(gx, gy);
      const dist = distance(playerLoc, g);
      if (dist > infraRadius) continue;

      // Check if a monster occupies this square (mon > 0)
      const sq = getSquare(chunk, g);
      if (sq.mon > 0) {
        // Square is already in VIEW; mark it SEEN for infravision
        setFlag(chunk, g, SquareFlag.SEEN);
      }
    }
  }
}
