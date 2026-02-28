/**
 * @file cave/chunk.ts
 * @brief Chunk (dungeon level) creation and utility functions
 *
 * Port of cave.c — chunk allocation and basic operations.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type {
  Chunk,
  Square,
  Heatmap,
  FeatureId,
  MonsterId,
  Feat,
} from "../types/index.js";
import type { Loc } from "../z/index.js";
import { BitFlag } from "../z/index.js";
import { SquareFlag } from "../types/index.js";

// ── Constants ──

/** Number of square info flags */
const SQUARE_FLAG_COUNT = SquareFlag.MAX;

/** Initial object pool size */
const OBJECT_LIST_SIZE = 128;

/** Number of built-in feature types */
const FEAT_COUNT = 25; // Feat.MAX

// ── Square creation ──

/**
 * Create an empty square with default values.
 *
 * Allocates a fresh BitFlag for the info field and sets all other
 * fields to their zero/null defaults.
 */
export function createSquare(): Square {
  return {
    feat: 0 as FeatureId,
    info: new BitFlag(SQUARE_FLAG_COUNT),
    light: 0,
    mon: 0 as MonsterId,
    obj: null,
    trap: null,
  };
}

// ── Heatmap creation ──

/**
 * Create an empty heatmap of the given dimensions.
 */
function createHeatmap(height: number, width: number): Heatmap {
  const grids: Uint16Array[] = new Array(height);
  for (let y = 0; y < height; y++) {
    grids[y] = new Uint16Array(width);
  }
  return { grids };
}

// ── Chunk creation ──

/**
 * Allocate a new dungeon level (chunk).
 *
 * Port of `cave_new()` from cave.c. Creates a height x width grid of
 * empty squares with all supporting data structures initialized.
 *
 * @param height Number of rows (y-axis)
 * @param width  Number of columns (x-axis)
 * @param depth  Dungeon depth (0 = town)
 * @returns A fully initialized Chunk
 */
export function createChunk(height: number, width: number, depth: number): Chunk {
  // Allocate the 2D square grid
  const squares: Square[][] = new Array(height);
  for (let y = 0; y < height; y++) {
    squares[y] = new Array(width);
    for (let x = 0; x < width; x++) {
      squares[y]![x] = createSquare();
    }
  }

  // Allocate feature count tracker
  const featCount = new Int32Array(FEAT_COUNT + 1);

  // Allocate noise and scent heatmaps
  const noise = createHeatmap(height, width);
  const scent = createHeatmap(height, width);

  // Allocate object pool (slot 0 unused)
  const objects: (null)[] = new Array(OBJECT_LIST_SIZE).fill(null);

  const chunk: Chunk = {
    name: "",
    turn: 0,
    depth,

    feeling: 0,
    objRating: 0,
    monRating: 0,
    goodItem: false,

    height,
    width,

    feelingSquares: 0,
    featCount,
    squares,
    noise,
    scent,
    decoy: { x: 0, y: 0 },

    objects,
    objMax: OBJECT_LIST_SIZE - 1,

    objectList: new Map(),

    monMax: 1,
    monCnt: 0,
    monCurrent: -1,
    numRepro: 0,

    monsters: [],

    join: [],
  };

  return chunk;
}

// ── Chunk validation ──

/**
 * Verify chunk integrity.
 *
 * Checks that a chunk has valid dimensions and that its square grid
 * is properly allocated.
 */
export function chunkValidate(chunk: Chunk): boolean {
  if (chunk.height <= 0 || chunk.width <= 0) return false;
  if (!chunk.squares) return false;
  if (chunk.squares.length !== chunk.height) return false;

  for (let y = 0; y < chunk.height; y++) {
    const row = chunk.squares[y];
    if (!row || row.length !== chunk.width) return false;
    for (let x = 0; x < chunk.width; x++) {
      if (!row[x]) return false;
    }
  }

  return true;
}

// ── Bounds checking ──

/**
 * Test whether a location is within the chunk's bounds.
 *
 * Port of `square_in_bounds()` from cave-square.c.
 */
export function chunkContains(chunk: Chunk, loc: Loc): boolean {
  return loc.x >= 0 && loc.x < chunk.width &&
         loc.y >= 0 && loc.y < chunk.height;
}

/**
 * Test whether a location is fully within the chunk's bounds
 * (not on the border).
 *
 * Port of `square_in_bounds_fully()` from cave-square.c.
 */
export function chunkContainsFully(chunk: Chunk, loc: Loc): boolean {
  return loc.x > 0 && loc.x < chunk.width - 1 &&
         loc.y > 0 && loc.y < chunk.height - 1;
}

// ── Square access ──

/**
 * Get the square at a given position in the chunk.
 *
 * Port of `square()` from cave-square.c.
 * The caller is responsible for ensuring the location is in bounds.
 */
export function chunkGetSquare(chunk: Chunk, loc: Loc): Square {
  return chunk.squares[loc.y]![loc.x]!;
}

/**
 * Set (replace) the square at a given position in the chunk.
 */
export function chunkSetSquare(chunk: Chunk, loc: Loc, square: Square): void {
  chunk.squares[loc.y]![loc.x] = square;
}
