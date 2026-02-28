/**
 * @file cave/pathfind.ts
 * @brief A* pathfinding on the dungeon grid
 *
 * Provides A* shortest-path computation between two grid locations,
 * respecting terrain passability.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Loc } from "../z/index.js";
import { loc, locEq } from "../z/index.js";
import type { Chunk, FeatureType } from "../types/index.js";
import { TerrainFlag, type FeatureId } from "../types/index.js";

// ── Feature table (module-level, set via setFeatureTable) ──

let featureTable: FeatureType[] = [];

/**
 * Install the feature table used by pathfinding helpers.
 * Must be called before any pathfinding operations.
 */
export function setFeatureTable(table: FeatureType[]): void {
  featureTable = table;
}

// ── Inline helpers ──

/** Check if a position is within chunk bounds. */
function inBounds(c: Chunk, g: Loc): boolean {
  return g.x >= 0 && g.x < c.width && g.y >= 0 && g.y < c.height;
}

/**
 * Check if a grid is passable (can be walked through).
 * Uses the PASSABLE terrain flag.
 */
function isPassable(c: Chunk, g: Loc): boolean {
  const sq = c.squares[g.y]![g.x]!;
  const feat = featureTable[sq.feat];
  if (!feat) return false;
  return feat.flags.has(TerrainFlag.PASSABLE);
}

// ── A* pathfinding ──

/**
 * The 8 cardinal + diagonal directions as (dx, dy) offsets.
 */
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

/**
 * Manhattan distance heuristic for A* (admissible for 8-directional movement
 * with uniform cost). Since diagonal moves cost the same as cardinal moves
 * in Angband, we use Chebyshev distance (max of dx, dy) which is tighter.
 */
function heuristic(a: Loc, b: Loc): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Encode a grid location as a single number for use as a map key.
 */
function encodeKey(g: Loc, width: number): number {
  return g.y * width + g.x;
}

/**
 * Decode a numeric key back into a Loc.
 */
function decodeKey(key: number, width: number): Loc {
  return loc(key % width, Math.floor(key / width));
}

/**
 * Simple binary min-heap for A* open set, keyed by f-score.
 * Avoids the overhead of the general-purpose PriorityQueue for
 * this specific use case.
 */
class AStarHeap {
  private readonly data: { key: number; f: number }[] = [];

  get length(): number {
    return this.data.length;
  }

  push(key: number, f: number): void {
    this.data.push({ key, f });
    this.bubbleUp(this.data.length - 1);
  }

  pop(): number {
    const top = this.data[0]!;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top.key;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[i]!.f >= this.data[parent]!.f) break;
      const tmp = this.data[parent]!;
      this.data[parent] = this.data[i]!;
      this.data[i] = tmp;
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.data[left]!.f < this.data[smallest]!.f) {
        smallest = left;
      }
      if (right < n && this.data[right]!.f < this.data[smallest]!.f) {
        smallest = right;
      }
      if (smallest === i) break;
      const tmp = this.data[i]!;
      this.data[i] = this.data[smallest]!;
      this.data[smallest] = tmp;
      i = smallest;
    }
  }
}

/**
 * Find the shortest path between two grid locations using A*.
 *
 * Uses 8-directional movement (cardinal + diagonal) with uniform step
 * cost of 1. Walls and other impassable terrain block movement. The
 * destination square itself does not need to be passable (you can
 * pathfind "to" a wall, e.g. for melee targeting).
 *
 * @param chunk    - The dungeon level
 * @param from     - Start location
 * @param to       - Goal location
 * @param maxSteps - Maximum path length (default: width * height).
 *                   If the shortest path exceeds this, returns empty.
 * @returns Array of Loc from start to goal (inclusive of both endpoints),
 *          or empty array if no path exists.
 */
export function findPath(
  chunk: Chunk,
  from: Loc,
  to: Loc,
  maxSteps?: number,
): Loc[] {
  // Trivial case: start == goal
  if (locEq(from, to)) return [from];

  const w = chunk.width;
  const limit = maxSteps ?? w * chunk.height;

  const fromKey = encodeKey(from, w);
  const toKey = encodeKey(to, w);

  // g-score: cheapest known cost from start to each node
  const gScore = new Map<number, number>();
  gScore.set(fromKey, 0);

  // Came-from map for path reconstruction
  const cameFrom = new Map<number, number>();

  // Open set (min-heap by f-score)
  const open = new AStarHeap();
  open.push(fromKey, heuristic(from, to));

  // Closed set
  const closed = new Set<number>();

  while (open.length > 0) {
    const currentKey = open.pop();
    if (currentKey === toKey) {
      // Reconstruct path
      return reconstructPath(cameFrom, currentKey, w);
    }

    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    const current = decodeKey(currentKey, w);
    const currentG = gScore.get(currentKey)!;

    // Check step limit
    if (currentG >= limit) continue;

    // Explore neighbours
    for (const dir of DIRS) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      const ng = loc(nx, ny);

      if (!inBounds(chunk, ng)) continue;

      const nkey = encodeKey(ng, w);
      if (closed.has(nkey)) continue;

      // The destination square doesn't need to be passable,
      // but intermediate squares do.
      if (nkey !== toKey && !isPassable(chunk, ng)) continue;

      const tentativeG = currentG + 1;
      const prevG = gScore.get(nkey);

      if (prevG === undefined || tentativeG < prevG) {
        gScore.set(nkey, tentativeG);
        cameFrom.set(nkey, currentKey);
        const f = tentativeG + heuristic(ng, to);
        open.push(nkey, f);
      }
    }
  }

  // No path found
  return [];
}

/**
 * Reconstruct the path from the cameFrom map.
 */
function reconstructPath(
  cameFrom: Map<number, number>,
  goalKey: number,
  width: number,
): Loc[] {
  const path: Loc[] = [];
  let current: number | undefined = goalKey;
  while (current !== undefined) {
    path.push(decodeKey(current, width));
    current = cameFrom.get(current);
  }
  path.reverse();
  return path;
}
