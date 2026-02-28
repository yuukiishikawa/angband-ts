/**
 * @file generate/room.ts
 * @brief Room generation for dungeon levels
 *
 * Port of gen-room.c — room generation helpers and builders.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 * Copyright (c) 2013 Erik Osheim, Nick McConnell
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Chunk } from "../types/index.js";
import { Feat, SquareFlag } from "../types/index.js";
import type { MonsterRace } from "../types/index.js";
import type { Loc, RNG } from "../z/index.js";
import { loc } from "../z/index.js";
import {
  chunkContainsFully,
  chunkGetSquare,
  squareSetFeat,
  squareSetRoom,
  squareIsPassable,
} from "../cave/index.js";
import type { PitDefinition } from "../data/pit-loader.js";
import { placeNewMonster } from "../monster/make.js";

// ── Room type enum ──

/**
 * Types of rooms that can be generated.
 */
export const enum RoomType {
  SIMPLE = 0,
  OVERLAP = 1,
  CROSS = 2,
  LARGE = 3,
  CIRCULAR = 4,
  VAULT = 5,
  PIT = 6,
  NEST = 7,
}

// ── Interfaces ──

/**
 * Template describing a room type's parameters.
 */
export interface RoomTemplate {
  readonly type: RoomType;
  readonly width: number;
  readonly height: number;
  readonly rating: number;
}

/**
 * A generated room with its geometry.
 */
export interface Room {
  /** Center of the room. */
  readonly center: Loc;
  /** Bounding rectangle corners: [topLeft, bottomRight]. */
  readonly corners: readonly [Loc, Loc];
  /** Door locations along the room boundary. */
  readonly doors: Loc[];
}

// ── Internal helpers ──

/**
 * Fill a rectangular region with a feature and optionally mark as ROOM.
 */
function fillRect(
  chunk: Chunk,
  y1: number,
  x1: number,
  y2: number,
  x2: number,
  feat: Feat,
  markRoom: boolean,
): void {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      const pos = loc(x, y);
      if (!chunkContainsFully(chunk, pos)) continue;
      squareSetFeat(chunk, pos, feat);
      if (markRoom) {
        squareSetRoom(chunk, pos);
      }
    }
  }
}

/**
 * Draw the edges of a rectangle with the given feature.
 * Port of draw_rectangle() from gen-room.c.
 */
function drawRect(
  chunk: Chunk,
  y1: number,
  x1: number,
  y2: number,
  x2: number,
  feat: Feat,
  markRoom: boolean,
): void {
  for (let y = y1; y <= y2; y++) {
    for (const x of [x1, x2]) {
      const pos = loc(x, y);
      if (!chunkContainsFully(chunk, pos)) continue;
      squareSetFeat(chunk, pos, feat);
      if (markRoom) squareSetRoom(chunk, pos);
    }
  }
  for (let x = x1; x <= x2; x++) {
    for (const y of [y1, y2]) {
      const pos = loc(x, y);
      if (!chunkContainsFully(chunk, pos)) continue;
      squareSetFeat(chunk, pos, feat);
      if (markRoom) squareSetRoom(chunk, pos);
    }
  }
}

/**
 * Check that a rectangular region fits within the chunk (fully interior).
 */
function regionFits(
  chunk: Chunk,
  y1: number,
  x1: number,
  y2: number,
  x2: number,
): boolean {
  return (
    chunkContainsFully(chunk, loc(x1, y1)) &&
    chunkContainsFully(chunk, loc(x2, y2))
  );
}

/**
 * Set outer walls on a room: mark the outer walls with WALL_OUTER flag.
 * This is used by the tunnel algorithm to know where it can pierce.
 */
function markOuterWalls(
  chunk: Chunk,
  y1: number,
  x1: number,
  y2: number,
  x2: number,
): void {
  for (let y = y1; y <= y2; y++) {
    for (const x of [x1, x2]) {
      const pos = loc(x, y);
      if (!chunkContainsFully(chunk, pos)) continue;
      chunkGetSquare(chunk, pos).info.on(SquareFlag.WALL_OUTER);
    }
  }
  for (let x = x1 + 1; x < x2; x++) {
    for (const y of [y1, y2]) {
      const pos = loc(x, y);
      if (!chunkContainsFully(chunk, pos)) continue;
      chunkGetSquare(chunk, pos).info.on(SquareFlag.WALL_OUTER);
    }
  }
}

// ── Room builders ──

/**
 * Generate a simple rectangular room.
 *
 * Port of build_simple() from gen-room.c.
 * Generates a room of random size (3-10 x 3-20) centered on the given point.
 */
export function generateSimpleRoom(
  chunk: Chunk,
  center: Loc,
  rng: RNG,
): Room | null {
  const halfH = 1 + rng.randint0(4); // half-height 1-4 → height 3-9
  const halfW = 1 + rng.randint0(7); // half-width 1-7 → width 3-15

  const y1 = center.y - halfH;
  const y2 = center.y + halfH;
  const x1 = center.x - halfW;
  const x2 = center.x + halfW;

  if (!regionFits(chunk, y1 - 1, x1 - 1, y2 + 1, x2 + 1)) return null;

  // Draw outer granite walls
  drawRect(chunk, y1 - 1, x1 - 1, y2 + 1, x2 + 1, Feat.GRANITE, true);
  markOuterWalls(chunk, y1 - 1, x1 - 1, y2 + 1, x2 + 1);

  // Fill interior with floor
  fillRect(chunk, y1, x1, y2, x2, Feat.FLOOR, true);

  // Find doors at center of each wall
  const doors: Loc[] = [
    loc(center.x, y1 - 1), // N
    loc(center.x, y2 + 1), // S
    loc(x1 - 1, center.y), // W
    loc(x2 + 1, center.y), // E
  ];

  return {
    center,
    corners: [loc(x1, y1), loc(x2, y2)],
    doors,
  };
}

/**
 * Generate an overlapping room (two overlapping rectangles).
 *
 * Port of build_overlap() from gen-room.c.
 */
export function generateOverlappingRoom(
  chunk: Chunk,
  center: Loc,
  rng: RNG,
): Room | null {
  // First rectangle
  const h1a = 1 + rng.randint0(3);
  const w1a = 1 + rng.randint0(5);
  const h1b = 1 + rng.randint0(3);
  const w1b = 1 + rng.randint0(5);

  // Second rectangle offset from center
  const h2a = 1 + rng.randint0(3);
  const w2a = 1 + rng.randint0(5);
  const h2b = 1 + rng.randint0(3);
  const w2b = 1 + rng.randint0(5);

  const y1a = center.y - h1a;
  const y2a = center.y + h1b;
  const x1a = center.x - w1a;
  const x2a = center.x + w1b;

  const y1b = center.y - h2a;
  const y2b = center.y + h2b;
  const x1b = center.x - w2a;
  const x2b = center.x + w2b;

  const outerY1 = Math.min(y1a, y1b) - 1;
  const outerY2 = Math.max(y2a, y2b) + 1;
  const outerX1 = Math.min(x1a, x1b) - 1;
  const outerX2 = Math.max(x2a, x2b) + 1;

  if (!regionFits(chunk, outerY1, outerX1, outerY2, outerX2)) return null;

  // First room
  drawRect(chunk, y1a - 1, x1a - 1, y2a + 1, x2a + 1, Feat.GRANITE, true);
  fillRect(chunk, y1a, x1a, y2a, x2a, Feat.FLOOR, true);

  // Second room (overlapping)
  drawRect(chunk, y1b - 1, x1b - 1, y2b + 1, x2b + 1, Feat.GRANITE, true);
  fillRect(chunk, y1b, x1b, y2b, x2b, Feat.FLOOR, true);

  markOuterWalls(chunk, outerY1, outerX1, outerY2, outerX2);

  const doors: Loc[] = [
    loc(center.x, outerY1),
    loc(center.x, outerY2),
    loc(outerX1, center.y),
    loc(outerX2, center.y),
  ];

  return {
    center,
    corners: [loc(outerX1 + 1, outerY1 + 1), loc(outerX2 - 1, outerY2 - 1)],
    doors,
  };
}

/**
 * Generate a cross-shaped room.
 *
 * Port of build_crossed() from gen-room.c.
 * A plus/cross shape with a wider horizontal or vertical arm.
 */
export function generateCrossRoom(
  chunk: Chunk,
  center: Loc,
  rng: RNG,
): Room | null {
  // Arm dimensions
  const hArmH = 1 + rng.randint0(3); // vertical arm half-height
  const hArmW = 1 + rng.randint0(2); // vertical arm half-width
  const vArmH = 1 + rng.randint0(2); // horizontal arm half-height
  const vArmW = 1 + rng.randint0(5); // horizontal arm half-width

  const outerY1 = center.y - hArmH - 1;
  const outerY2 = center.y + hArmH + 1;
  const outerX1 = center.x - vArmW - 1;
  const outerX2 = center.x + vArmW + 1;

  if (!regionFits(chunk, outerY1, outerX1, outerY2, outerX2)) return null;

  // Vertical arm (taller, narrower)
  drawRect(
    chunk,
    center.y - hArmH - 1, center.x - hArmW - 1,
    center.y + hArmH + 1, center.x + hArmW + 1,
    Feat.GRANITE, true,
  );
  fillRect(
    chunk,
    center.y - hArmH, center.x - hArmW,
    center.y + hArmH, center.x + hArmW,
    Feat.FLOOR, true,
  );

  // Horizontal arm (wider, shorter)
  drawRect(
    chunk,
    center.y - vArmH - 1, center.x - vArmW - 1,
    center.y + vArmH + 1, center.x + vArmW + 1,
    Feat.GRANITE, true,
  );
  fillRect(
    chunk,
    center.y - vArmH, center.x - vArmW,
    center.y + vArmH, center.x + vArmW,
    Feat.FLOOR, true,
  );

  markOuterWalls(chunk, outerY1, outerX1, outerY2, outerX2);

  const doors: Loc[] = [
    loc(center.x, outerY1),
    loc(center.x, outerY2),
    loc(outerX1, center.y),
    loc(outerX2, center.y),
  ];

  return {
    center,
    corners: [loc(outerX1 + 1, outerY1 + 1), loc(outerX2 - 1, outerY2 - 1)],
    doors,
  };
}

/**
 * Generate a circular room.
 *
 * Port of build_circular() from gen-room.c.
 * Uses integer distance for a rough circle.
 */
export function generateCircularRoom(
  chunk: Chunk,
  center: Loc,
  rng: RNG,
): Room | null {
  const radius = 2 + rng.randint0(3); // 2-4

  const y1 = center.y - radius - 1;
  const y2 = center.y + radius + 1;
  const x1 = center.x - radius - 1;
  const x2 = center.x + radius + 1;

  if (!regionFits(chunk, y1, x1, y2, x2)) return null;

  // Fill outer area with granite, marked as room
  fillRect(chunk, y1, x1, y2, x2, Feat.GRANITE, true);
  markOuterWalls(chunk, y1, x1, y2, x2);

  // Carve circular interior
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      // Use Chebyshev-like distance for a "diamond" approximation,
      // or Euclidean for a true circle. Angband uses a simple formula.
      if (dx * dx + dy * dy <= radius * radius) {
        const pos = loc(center.x + dx, center.y + dy);
        if (chunkContainsFully(chunk, pos)) {
          squareSetFeat(chunk, pos, Feat.FLOOR);
          squareSetRoom(chunk, pos);
        }
      }
    }
  }

  // Set outer walls around the circle border
  for (let dy = -radius - 1; dy <= radius + 1; dy++) {
    for (let dx = -radius - 1; dx <= radius + 1; dx++) {
      const distSq = dx * dx + dy * dy;
      const rSq = radius * radius;
      // Border squares: outside the circle but inside outer boundary
      if (distSq > rSq && distSq <= (radius + 1) * (radius + 1)) {
        const pos = loc(center.x + dx, center.y + dy);
        if (chunkContainsFully(chunk, pos)) {
          squareSetFeat(chunk, pos, Feat.GRANITE);
          squareSetRoom(chunk, pos);
          chunkGetSquare(chunk, pos).info.on(SquareFlag.WALL_OUTER);
        }
      }
    }
  }

  const doors: Loc[] = [
    loc(center.x, center.y - radius - 1),
    loc(center.x, center.y + radius + 1),
    loc(center.x - radius - 1, center.y),
    loc(center.x + radius + 1, center.y),
  ];

  return {
    center,
    corners: [loc(x1 + 1, y1 + 1), loc(x2 - 1, y2 - 1)],
    doors,
  };
}

/**
 * Generate a large rectangular room, optionally with internal pillars.
 *
 * Port of build_large() from gen-room.c.
 */
export function generateLargeRoom(
  chunk: Chunk,
  center: Loc,
  rng: RNG,
): Room | null {
  const halfH = 3 + rng.randint0(3); // half-height 3-5
  const halfW = 5 + rng.randint0(6); // half-width 5-10

  const y1 = center.y - halfH;
  const y2 = center.y + halfH;
  const x1 = center.x - halfW;
  const x2 = center.x + halfW;

  if (!regionFits(chunk, y1 - 1, x1 - 1, y2 + 1, x2 + 1)) return null;

  // Draw outer granite walls
  drawRect(chunk, y1 - 1, x1 - 1, y2 + 1, x2 + 1, Feat.GRANITE, true);
  markOuterWalls(chunk, y1 - 1, x1 - 1, y2 + 1, x2 + 1);

  // Fill interior with floor
  fillRect(chunk, y1, x1, y2, x2, Feat.FLOOR, true);

  // Maybe add inner features (pillars, cross walls, etc.)
  const variant = rng.randint0(4);

  if (variant === 0) {
    // Pillars at regular intervals
    for (let y = y1 + 2; y < y2; y += 2) {
      for (let x = x1 + 2; x < x2; x += 2) {
        const pos = loc(x, y);
        squareSetFeat(chunk, pos, Feat.GRANITE);
        chunkGetSquare(chunk, pos).info.on(SquareFlag.WALL_INNER);
      }
    }
  } else if (variant === 1) {
    // Inner room (room within a room)
    const innerH = Math.max(1, halfH - 2);
    const innerW = Math.max(1, halfW - 2);
    drawRect(
      chunk,
      center.y - innerH, center.x - innerW,
      center.y + innerH, center.x + innerW,
      Feat.GRANITE, true,
    );
    // Open one side of the inner room
    const side = rng.randint0(4);
    const midX = center.x;
    const midY = center.y;
    if (side === 0) squareSetFeat(chunk, loc(midX, center.y - innerH), Feat.FLOOR);
    else if (side === 1) squareSetFeat(chunk, loc(midX, center.y + innerH), Feat.FLOOR);
    else if (side === 2) squareSetFeat(chunk, loc(center.x - innerW, midY), Feat.FLOOR);
    else squareSetFeat(chunk, loc(center.x + innerW, midY), Feat.FLOOR);
  } else if (variant === 2) {
    // Plus-shaped inner walls
    for (let y = y1; y <= y2; y++) {
      squareSetFeat(chunk, loc(center.x, y), Feat.GRANITE);
      chunkGetSquare(chunk, loc(center.x, y)).info.on(SquareFlag.WALL_INNER);
    }
    for (let x = x1; x <= x2; x++) {
      squareSetFeat(chunk, loc(x, center.y), Feat.GRANITE);
      chunkGetSquare(chunk, loc(x, center.y)).info.on(SquareFlag.WALL_INNER);
    }
    // Open the cross at cardinal directions
    squareSetFeat(chunk, loc(center.x, y1), Feat.FLOOR);
    squareSetFeat(chunk, loc(center.x, y2), Feat.FLOOR);
    squareSetFeat(chunk, loc(x1, center.y), Feat.FLOOR);
    squareSetFeat(chunk, loc(x2, center.y), Feat.FLOOR);
  }
  // variant === 3: plain large room (no inner features)

  const doors: Loc[] = [
    loc(center.x, y1 - 1),
    loc(center.x, y2 + 1),
    loc(x1 - 1, center.y),
    loc(x2 + 1, center.y),
  ];

  return {
    center,
    corners: [loc(x1, y1), loc(x2, y2)],
    doors,
  };
}

// ── Room placement ──

/**
 * Apply a room to the chunk by setting all interior squares to Feat.FLOOR
 * and marking them with SquareFlag.ROOM.
 *
 * This is a secondary placement pass — mainly useful if the room was
 * built in a temporary buffer and is now being stamped into the real chunk.
 * The individual room builders already do this inline.
 */
export function placeRoom(chunk: Chunk, room: Room): void {
  const [tl, br] = room.corners;
  for (let y = tl.y; y <= br.y; y++) {
    for (let x = tl.x; x <= br.x; x++) {
      const pos = loc(x, y);
      if (!chunkContainsFully(chunk, pos)) continue;
      squareSetFeat(chunk, pos, Feat.FLOOR);
      squareSetRoom(chunk, pos);
    }
  }
}

// ── Vault room generation ──

/** Import the vault template type. */
import type { VaultTemplate } from "../data/vault-loader.js";

/**
 * Vault ASCII symbol → terrain feature mapping.
 *
 * Port of the vault symbol table from gen-room.c.
 */
const VAULT_CHAR_MAP: Record<string, number> = {
  " ": Feat.GRANITE,   // Outer wall (space = wall outside vault)
  "%": Feat.PERM,      // Permanent wall
  "#": Feat.GRANITE,   // Granite wall
  ".": Feat.FLOOR,     // Floor
  "+": Feat.CLOSED,    // Closed door
  "^": Feat.FLOOR,     // Trap (floor with trap flag)
  "-": Feat.OPEN,      // Open door
  ":": Feat.RUBBLE,    // Rubble
  ";": Feat.FLOOR,     // Secret door (appears as floor initially)
  "*": Feat.FLOOR,     // Treasure (floor, object placed separately)
  "&": Feat.FLOOR,     // Monster/treasure intersection
  "<": Feat.LESS,      // Up stairs
  ">": Feat.MORE,      // Down stairs
};

/**
 * Generate a vault room from a template.
 *
 * Carves out the vault at the given center position by rendering the
 * ASCII template onto the chunk grid. Monster/object placement from
 * vault symbols (9, &, *, etc.) is handled as floor — actual entities
 * would be placed in a second pass.
 *
 * Port of build_vault() from gen-room.c (simplified).
 *
 * @param chunk    The dungeon chunk
 * @param center   Center location for the vault
 * @param vault    The vault template to render
 * @param rng      Random number generator (for future use)
 * @returns The Room descriptor, or null if it doesn't fit
 */
export function generateVaultRoom(
  chunk: Chunk,
  center: Loc,
  vault: VaultTemplate,
  _rng: RNG,
): Room | null {
  const halfW = Math.floor(vault.columns / 2);
  const halfH = Math.floor(vault.rows / 2);

  const x1 = center.x - halfW;
  const y1 = center.y - halfH;
  const x2 = x1 + vault.columns - 1;
  const y2 = y1 + vault.rows - 1;

  // Check bounds
  if (!chunkContainsFully(chunk, loc(x1, y1))) return null;
  if (!chunkContainsFully(chunk, loc(x2, y2))) return null;

  // Render the template
  const doors: Loc[] = [];

  for (let dy = 0; dy < vault.rows && dy < vault.text.length; dy++) {
    const line = vault.text[dy]!;
    for (let dx = 0; dx < vault.columns && dx < line.length; dx++) {
      const ch = line[dx]!;
      const pos = loc(x1 + dx, y1 + dy);

      // Determine the terrain feature
      let feat = VAULT_CHAR_MAP[ch];
      if (feat === undefined) {
        // Digits, letters, and other chars default to floor (monster/item markers)
        feat = Feat.FLOOR;
      }

      squareSetFeat(chunk, pos, feat);
      squareSetRoom(chunk, pos);

      // Mark vault squares
      const sq = chunkGetSquare(chunk, pos);
      sq.info.on(SquareFlag.VAULT);

      // Track doors for tunnel connections
      if (ch === "+" || ch === "-") {
        doors.push(pos);
      }
    }
  }

  // If no doors were found, add some at the midpoints of each edge
  if (doors.length === 0) {
    const midX = Math.floor((x1 + x2) / 2);
    const midY = Math.floor((y1 + y2) / 2);
    doors.push(loc(midX, y1));  // N
    doors.push(loc(midX, y2));  // S
    doors.push(loc(x1, midY));  // W
    doors.push(loc(x2, midY));  // E
  }

  // Update chunk ratings for level feeling
  chunk.monRating += vault.rating;
  chunk.objRating += vault.rating;

  return {
    center,
    corners: [loc(x1, y1), loc(x2, y2)],
    doors,
  };
}

/**
 * Pick a random vault template appropriate for the given depth.
 *
 * Filters by min/max depth and vault type, then picks randomly.
 *
 * @param vaults Available vault templates
 * @param depth  Current dungeon depth
 * @param rng    Random number generator
 * @param maxType Maximum vault type to consider
 * @returns A vault template, or null if none match
 */
/** Maximum vault type value for filtering (Greater = 2). */
const MAX_VAULT_TYPE = 2;

export function pickVault(
  vaults: readonly VaultTemplate[],
  depth: number,
  rng: RNG,
  maxType: number = MAX_VAULT_TYPE,
): VaultTemplate | null {
  const valid = vaults.filter((v) => {
    if (v.type > maxType) return false;
    if (v.minDepth > 0 && depth < v.minDepth) return false;
    if (v.maxDepth > 0 && depth > v.maxDepth) return false;
    return true;
  });

  if (valid.length === 0) return null;
  return valid[rng.randint0(valid.length)]!;
}

// ── Pit/Nest room generation ──

/**
 * Filter monster races that match a pit/nest definition's criteria.
 *
 * @param races Available monster races
 * @param pit   Pit/nest definition
 * @param depth Current dungeon depth
 * @returns Array of matching races
 */
export function filterPitRaces(
  races: readonly MonsterRace[],
  pit: PitDefinition,
  depth: number,
): MonsterRace[] {
  return races.filter((race) => {
    // Skip unique monsters — they don't belong in pits
    if (race.flags.has(1)) return false;  // UNIQUE = 1

    // Check depth allocation
    if (race.level > depth + 5) return false;
    if (race.level < 1) return false;

    // Check monster base name filter
    if (pit.monBases.length > 0) {
      if (!pit.monBases.includes(race.base.name)) return false;
    }

    // Check required flags (all must be present)
    for (const flag of pit.flagsReq) {
      if (!race.flags.has(flag)) return false;
    }

    // Check banned flags (none may be present)
    for (const flag of pit.flagsBan) {
      if (race.flags.has(flag)) return false;
    }

    // Check required spell flags
    for (const spell of pit.spellReq) {
      if (!race.spellFlags.has(spell)) return false;
    }

    // Check banned spell flags
    for (const spell of pit.spellBan) {
      if (race.spellFlags.has(spell)) return false;
    }

    return true;
  });
}

/**
 * Pick a pit/nest definition appropriate for the given depth.
 *
 * @param pits  Available pit definitions
 * @param depth Current dungeon depth
 * @param races Available monster races
 * @param rng   Random number generator
 * @param roomType Filter by pit room type (1=pit, 2=nest)
 * @returns A pit definition, or null if none match
 */
export function pickPit(
  pits: readonly PitDefinition[],
  depth: number,
  races: readonly MonsterRace[],
  rng: RNG,
  roomType: number = 1,
): PitDefinition | null {
  const valid = pits.filter((p) => {
    if (p.roomType !== roomType) return false;
    if (depth < p.minDepth) return false;
    if (p.maxDepth > 0 && depth > p.maxDepth) return false;
    // Must have at least some matching races
    return filterPitRaces(races, p, depth).length >= 4;
  });

  if (valid.length === 0) return null;
  return valid[rng.randint0(valid.length)]!;
}

/**
 * Generate a pit room: a rectangular room filled with themed monsters.
 *
 * Pit layout: 11×5 inner area with monsters arranged in ranks.
 * Outer wall, inner floor, monsters placed in a grid pattern.
 *
 * @param chunk  The dungeon chunk
 * @param center Desired center of the room
 * @param pit    The pit definition
 * @param races  Available monster races
 * @param rng    Random number generator
 * @returns The generated room, or null if it doesn't fit
 */
export function generatePitRoom(
  chunk: Chunk,
  center: Loc,
  pit: PitDefinition,
  races: readonly MonsterRace[],
  rng: RNG,
): Room | null {
  const halfW = 6;
  const halfH = 3;
  const x1 = center.x - halfW;
  const y1 = center.y - halfH;
  const x2 = center.x + halfW;
  const y2 = center.y + halfH;

  // Check bounds
  if (!regionFits(chunk, y1, x1, y2, x2)) return null;

  // Filter matching races
  const validRaces = filterPitRaces(races, pit, chunk.depth);
  if (validRaces.length < 4) return null;

  // Sort by level (strongest in center)
  validRaces.sort((a, b) => b.level - a.level);

  // Draw outer walls and fill interior with floor
  fillRect(chunk, y1, x1, y2, x2, Feat.FLOOR, true);
  drawRect(chunk, y1, x1, y2, x2, Feat.GRANITE, true);

  // Place monsters in the interior
  const innerY1 = y1 + 1;
  const innerY2 = y2 - 1;
  const innerX1 = x1 + 1;
  const innerX2 = x2 - 1;

  for (let y = innerY1; y <= innerY2; y++) {
    for (let x = innerX1; x <= innerX2; x++) {
      const pos = loc(x, y);
      if (!chunkContainsFully(chunk, pos)) continue;

      // Pick a race based on distance from center (closer = stronger)
      const dist = Math.max(Math.abs(x - center.x), Math.abs(y - center.y));
      const tierIdx = Math.min(dist, Math.floor(validRaces.length / 3));
      const startIdx = Math.floor(tierIdx * validRaces.length / 4);
      const endIdx = Math.min(startIdx + Math.ceil(validRaces.length / 4), validRaces.length);
      const race = validRaces[startIdx + rng.randint0(endIdx - startIdx)]!;

      placeNewMonster(chunk, pos, race, true, false, 0, rng);
    }
  }

  // Update chunk monster rating
  chunk.monRating += validRaces.length * 5;

  return {
    center,
    corners: [loc(x1, y1), loc(x2, y2)] as const,
    doors: [loc(center.x, y1)],  // Door on top
  };
}

/**
 * Generate a nest room: a larger room with themed monsters scattered inside.
 *
 * Nest layout: 23×11 room, 25-35% fill rate with matching monsters.
 *
 * @param chunk  The dungeon chunk
 * @param center Desired center of the room
 * @param pit    The nest definition
 * @param races  Available monster races
 * @param rng    Random number generator
 * @returns The generated room, or null if it doesn't fit
 */
export function generateNestRoom(
  chunk: Chunk,
  center: Loc,
  pit: PitDefinition,
  races: readonly MonsterRace[],
  rng: RNG,
): Room | null {
  const halfW = 11;
  const halfH = 5;
  const x1 = center.x - halfW;
  const y1 = center.y - halfH;
  const x2 = center.x + halfW;
  const y2 = center.y + halfH;

  // Check bounds
  if (!regionFits(chunk, y1, x1, y2, x2)) return null;

  // Filter matching races
  const validRaces = filterPitRaces(races, pit, chunk.depth);
  if (validRaces.length < 4) return null;

  // Draw outer walls and fill interior with floor
  fillRect(chunk, y1, x1, y2, x2, Feat.FLOOR, true);
  drawRect(chunk, y1, x1, y2, x2, Feat.GRANITE, true);

  // Scatter monsters inside (roughly 25% fill rate)
  const innerY1 = y1 + 1;
  const innerY2 = y2 - 1;
  const innerX1 = x1 + 1;
  const innerX2 = x2 - 1;

  for (let y = innerY1; y <= innerY2; y++) {
    for (let x = innerX1; x <= innerX2; x++) {
      if (rng.randint0(4) !== 0) continue;  // 25% fill

      const pos = loc(x, y);
      if (!chunkContainsFully(chunk, pos)) continue;

      const race = validRaces[rng.randint0(validRaces.length)]!;
      placeNewMonster(chunk, pos, race, true, false, 0, rng);
    }
  }

  // Update chunk monster rating
  chunk.monRating += validRaces.length * 3;

  return {
    center,
    corners: [loc(x1, y1), loc(x2, y2)] as const,
    doors: [loc(center.x, y1), loc(center.x, y2)],
  };
}
