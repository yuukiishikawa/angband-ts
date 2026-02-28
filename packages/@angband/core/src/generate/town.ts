/**
 * @file generate/town.ts
 * @brief Town level generation
 *
 * Port of town generation from gen-cave.c — creates the surface town
 * with store buildings arranged around an open area and a down staircase.
 *
 * Copyright (c) 2024 Angband-TS Contributors
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Chunk } from "../types/index.js";
import { Feat, SquareFlag } from "../types/index.js";
import type { Loc, RNG } from "../z/index.js";
import { loc } from "../z/index.js";
import { createChunk, squareSetFeat } from "../cave/index.js";

// ── Constants ──

/** Town dimensions (smaller than a dungeon level). */
const TOWN_WIDTH = 66;
const TOWN_HEIGHT = 22;

/** Store building dimensions. */
const BUILDING_WIDTH = 9;
const BUILDING_HEIGHT = 5;

/**
 * The 9 stores in order, as Feat values.
 * Arranged in two rows: top row (4 stores) and bottom row (5 stores).
 */
const STORE_FEATS: readonly number[] = [
  Feat.STORE_GENERAL,  // General Store
  Feat.STORE_ARMOR,    // Armory
  Feat.STORE_WEAPON,   // Weapon Smiths
  Feat.STORE_BOOK,     // Bookstore (Temple slot in classic)
  Feat.STORE_ALCHEMY,  // Alchemy Shop
  Feat.STORE_MAGIC,    // Magic Shop
  Feat.STORE_BLACK,    // Black Market
  Feat.HOME,           // Player's Home
];

// ── Town generation ──

/**
 * Generate a town level.
 *
 * The town is an open area (lit and known) with store buildings
 * arranged in two rows and a down staircase in the center.
 *
 * Layout (schematic):
 * ```
 * ####################################
 * #  [Gen] [Arm] [Wpn] [Boo]        #
 * #                                  #
 * #             >                    #
 * #                                  #
 * #  [Alc] [Mag] [Blk] [Hom]        #
 * ####################################
 * ```
 *
 * Port of town_gen() from gen-cave.c (simplified).
 *
 * @param rng Random number generator
 * @returns A chunk representing the town level
 */
export function generateTown(rng: RNG): Chunk {
  const chunk = createChunk(TOWN_HEIGHT, TOWN_WIDTH, 0);
  chunk.name = "Town";

  // Step 1: Fill with permanent walls (border) and floor (interior)
  for (let y = 0; y < TOWN_HEIGHT; y++) {
    for (let x = 0; x < TOWN_WIDTH; x++) {
      const pos = loc(x, y);
      if (
        y === 0 || y === TOWN_HEIGHT - 1 ||
        x === 0 || x === TOWN_WIDTH - 1
      ) {
        squareSetFeat(chunk, pos, Feat.PERM);
      } else {
        squareSetFeat(chunk, pos, Feat.FLOOR);
        // Town is fully lit and known
        chunk.squares[y]![x]!.info.on(SquareFlag.GLOW);
        chunk.squares[y]![x]!.info.on(SquareFlag.MARK);
      }
    }
  }

  // Step 2: Place store buildings in two rows
  const leftMargin = 3;
  const spacing = BUILDING_WIDTH + 2;

  // Top row: 4 stores starting at y=2
  for (let i = 0; i < 4 && i < STORE_FEATS.length; i++) {
    const bx = leftMargin + i * spacing;
    const by = 2;
    placeBuilding(chunk, loc(bx, by), STORE_FEATS[i]!);
  }

  // Bottom row: 4 stores starting at y=TOWN_HEIGHT-BUILDING_HEIGHT-2
  for (let i = 4; i < 8 && i < STORE_FEATS.length; i++) {
    const bx = leftMargin + (i - 4) * spacing;
    const by = TOWN_HEIGHT - BUILDING_HEIGHT - 2;
    placeBuilding(chunk, loc(bx, by), STORE_FEATS[i]!);
  }

  // Step 3: Place down staircase in center
  const stairX = Math.floor(TOWN_WIDTH / 2);
  const stairY = Math.floor(TOWN_HEIGHT / 2);
  squareSetFeat(chunk, loc(stairX, stairY), Feat.MORE);

  return chunk;
}

/**
 * Place a store building on the chunk.
 *
 * A building is a rectangle of permanent walls with an entrance
 * (the store feature) on the south wall center.
 *
 * @param chunk    The town chunk
 * @param topLeft  Top-left corner of the building
 * @param storeFeat The Feat value for the store entrance
 */
function placeBuilding(
  chunk: Chunk,
  topLeft: Loc,
  storeFeat: number,
): void {
  const x1 = topLeft.x;
  const y1 = topLeft.y;
  const x2 = x1 + BUILDING_WIDTH - 1;
  const y2 = y1 + BUILDING_HEIGHT - 1;

  // Draw building walls (permanent)
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      if (y < 0 || y >= chunk.height || x < 0 || x >= chunk.width) continue;

      if (y === y1 || y === y2 || x === x1 || x === x2) {
        squareSetFeat(chunk, loc(x, y), Feat.PERM);
      } else {
        // Interior is floor (not accessible, but required for the data model)
        squareSetFeat(chunk, loc(x, y), Feat.PERM);
      }
    }
  }

  // Place the store entrance on the south wall center
  const doorX = x1 + Math.floor(BUILDING_WIDTH / 2);
  const doorY = y2;
  if (doorX >= 0 && doorX < chunk.width && doorY >= 0 && doorY < chunk.height) {
    squareSetFeat(chunk, loc(doorX, doorY), storeFeat);
    // Store entrances are lit and known
    chunk.squares[doorY]![doorX]!.info.on(SquareFlag.GLOW);
    chunk.squares[doorY]![doorX]!.info.on(SquareFlag.MARK);
  }
}
