/**
 * @file generate/generate.ts
 * @brief Main dungeon generation entry point
 *
 * Port of generate.c — top-level dungeon generation orchestration.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 * Copyright (c) 2013 Erik Osheim, Nick McConnell
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Chunk } from "../types/index.js";
import { Feat } from "../types/index.js";
import type { MonsterRace, ObjectKind, EgoItem } from "../types/index.js";
import type { Loc, RNG } from "../z/index.js";
import { loc } from "../z/index.js";
import { createChunk, chunkContainsFully, squareSetFeat } from "../cave/index.js";
import {
  generateSimpleRoom,
  generateOverlappingRoom,
  generateCrossRoom,
  generateCircularRoom,
  generateLargeRoom,
  generateVaultRoom,
  pickVault,
  generatePitRoom,
  generateNestRoom,
  pickPit,
  type Room,
} from "./room.js";
import type { VaultTemplate } from "../data/vault-loader.js";
import type { PitDefinition } from "../data/pit-loader.js";
import type { DungeonProfile } from "../data/dungeon-profile-loader.js";
import { pickRoomType } from "../data/dungeon-profile-loader.js";
import { digTunnel } from "./tunnel.js";
import { populateMonsters, populateObjects, placeStairs, placeTraps } from "./populate.js";
import { generateTown } from "./town.js";

// ── Configuration ──

/**
 * Configuration for dungeon level generation.
 */
export interface DungeonConfig {
  /** Width of the dungeon level in columns. */
  readonly width: number;
  /** Height of the dungeon level in rows. */
  readonly height: number;
  /** Number of room placement attempts. */
  readonly roomAttempts: number;
  /** Number of tunnel connection attempts (unused — we connect all rooms). */
  readonly tunnelAttempts: number;
  /** Number of monsters to scatter. */
  readonly monsterDensity: number;
  /** Number of objects to scatter. */
  readonly objectDensity: number;
}

/**
 * Standard Angband dungeon parameters.
 *
 * Based on the "classic" profile in dungeon_profile.txt:
 * - 198x66 grid
 * - ~50 room attempts
 * - Moderate monster/object density
 */
export const DEFAULT_DUNGEON_CONFIG: DungeonConfig = {
  width: 198,
  height: 66,
  roomAttempts: 50,
  tunnelAttempts: 50,
  monsterDensity: 14,
  objectDensity: 9,
};

// ── Room builder dispatch ──

/**
 * Room builder functions indexed by a probability weighting.
 * Simple rooms are most common; larger/unusual rooms are rarer.
 */
const ROOM_BUILDERS = [
  generateSimpleRoom,      // weight 3 (most common)
  generateSimpleRoom,
  generateSimpleRoom,
  generateOverlappingRoom, // weight 2
  generateOverlappingRoom,
  generateCrossRoom,       // weight 1
  generateLargeRoom,       // weight 1
  generateCircularRoom,    // weight 1
] as const;

// ── Internal helpers ──

/**
 * Fill the entire chunk with granite walls.
 * The border is permanent wall; interior is regular granite.
 */
function fillWithWalls(chunk: Chunk): void {
  for (let y = 0; y < chunk.height; y++) {
    for (let x = 0; x < chunk.width; x++) {
      const pos = loc(x, y);
      if (
        y === 0 || y === chunk.height - 1 ||
        x === 0 || x === chunk.width - 1
      ) {
        squareSetFeat(chunk, pos, Feat.PERM);
      } else {
        squareSetFeat(chunk, pos, Feat.GRANITE);
      }
    }
  }
}

/**
 * Find a random floor square in a room for stair placement.
 */
function findFloorInRoom(chunk: Chunk, room: Room, rng: RNG): Loc {
  const [tl, br] = room.corners;
  for (let attempt = 0; attempt < 100; attempt++) {
    const x = tl.x + rng.randint0(br.x - tl.x + 1);
    const y = tl.y + rng.randint0(br.y - tl.y + 1);
    const pos = loc(x, y);
    if (chunkContainsFully(chunk, pos) && chunk.squares[y]![x]!.feat === Feat.FLOOR) {
      return pos;
    }
  }
  // Fallback to room center
  return room.center;
}

// ── Profile-driven room builder dispatch ──

/**
 * Build a room by its profile type name.
 *
 * Maps profile room type names (from dungeon_profile.json) to actual
 * room builder functions.
 */
function buildRoomByType(
  typeName: string,
  chunk: Chunk,
  center: Loc,
  rng: RNG,
  vaults: readonly VaultTemplate[],
  depth: number,
  pits: readonly PitDefinition[],
  races: readonly MonsterRace[],
  vaultPlaced: boolean,
  pitPlaced: boolean,
  nestPlaced: boolean,
): Room | null {
  switch (typeName) {
    case "simple room":
      return generateSimpleRoom(chunk, center, rng);
    case "overlap room":
      return generateOverlappingRoom(chunk, center, rng);
    case "crossed room":
      return generateCrossRoom(chunk, center, rng);
    case "large room":
      return generateLargeRoom(chunk, center, rng);
    case "circular room":
      return generateCircularRoom(chunk, center, rng);

    case "Greater vault":
    case "Greater vault (new)":
    case "Medium vault":
    case "Medium vault (new)":
    case "Lesser vault":
    case "Lesser vault (new)":
    case "Interesting room": {
      if (vaultPlaced) return null;
      const vault = pickVault(vaults, depth, rng);
      return vault ? generateVaultRoom(chunk, center, vault, rng) : null;
    }

    case "monster pit": {
      if (pitPlaced || depth < 5) return null;
      const pit = pickPit(pits, depth, races, rng, 1);
      return pit ? generatePitRoom(chunk, center, pit, races, rng) : null;
    }

    case "monster nest": {
      if (nestPlaced || depth < 5) return null;
      const nest = pickPit(pits, depth, races, rng, 2);
      return nest ? generateNestRoom(chunk, center, nest, races, rng) : null;
    }

    // Unimplemented room types fall back to simple room
    case "huge room":
    case "room of chambers":
    case "moria room":
    case "room template":
    case "staircase room":
    default:
      return generateSimpleRoom(chunk, center, rng);
  }
}

// ── Main generation ──

/**
 * Generate a complete dungeon level.
 *
 * This is the main entry point for dungeon generation. It orchestrates:
 * 1. Create a chunk filled with granite walls (permanent border).
 * 2. Carve rooms at random positions.
 * 3. Connect all rooms with tunnels.
 * 4. Place up and down stairs.
 * 5. Scatter monsters.
 * 6. Scatter objects.
 * 7. Place traps.
 *
 * @param depth   Dungeon depth for this level.
 * @param config  Generation parameters.
 * @param rng     Random number generator.
 * @param races   Available monster races (optional, for population).
 * @param kinds   Available object kinds (optional, for population).
 * @returns A fully generated dungeon chunk.
 */
export function generateDungeon(
  depth: number,
  config: DungeonConfig,
  rng: RNG,
  races: readonly MonsterRace[] = [],
  kinds: readonly ObjectKind[] = [],
  egoItems: readonly EgoItem[] = [],
  vaults: readonly VaultTemplate[] = [],
  pits: readonly PitDefinition[] = [],
  profile?: DungeonProfile,
): Chunk {
  // Town level at depth 0
  if (depth === 0) {
    return generateTown(rng);
  }

  // Retry up to MAX_GEN_ATTEMPTS if the level has too few rooms
  for (let attempt = 0; attempt < MAX_GEN_ATTEMPTS; attempt++) {
    const chunk = attemptGenerateDungeon(
      depth, config, rng, races, kinds, egoItems, vaults, pits, profile,
    );
    // Accept if we got at least 2 rooms (basic connectivity)
    if (chunk !== null) return chunk;
  }

  // Final fallback — always returns something
  return attemptGenerateDungeon(
    depth, config, rng, races, kinds, egoItems, vaults, pits, profile,
  )!;
}

/** Maximum generation retry attempts. */
const MAX_GEN_ATTEMPTS = 100;

/** Minimum rooms for a level to be considered valid. */
const MIN_ROOMS = 2;

/**
 * Single attempt at generating a dungeon level.
 * Returns null if the result is invalid (too few rooms).
 */
function attemptGenerateDungeon(
  depth: number,
  config: DungeonConfig,
  rng: RNG,
  races: readonly MonsterRace[],
  kinds: readonly ObjectKind[],
  egoItems: readonly EgoItem[],
  vaults: readonly VaultTemplate[],
  pits: readonly PitDefinition[],
  profile?: DungeonProfile,
): Chunk | null {
  const levelWidth = profile?.width ?? config.width;
  const levelHeight = profile?.height ?? config.height;
  const roomAttempts = profile?.roomAttempts ?? config.roomAttempts;

  const chunk = createChunk(levelHeight, levelWidth, depth);
  chunk.name = `Level ${depth}`;

  // Step 1: Fill with walls
  fillWithWalls(chunk);

  // Step 2: Carve rooms
  const rooms: Room[] = [];
  let vaultPlaced = false;
  let pitPlaced = false;
  let nestPlaced = false;
  for (let i = 0; i < roomAttempts; i++) {
    // Pick a random center point (away from edges)
    const cx = 10 + rng.randint0(levelWidth - 20);
    const cy = 5 + rng.randint0(levelHeight - 10);
    const center = loc(cx, cy);

    let room: Room | null = null;

    // Profile-driven room selection (if profile has room entries)
    if (profile && profile.rooms.length > 0) {
      const roll = rng.randint0(100);
      const roomType = pickRoomType(profile.rooms, roll);
      room = buildRoomByType(
        roomType, chunk, center, rng, vaults, depth, pits, races,
        vaultPlaced, pitPlaced, nestPlaced,
      );
      if (room) {
        if (roomType.includes("vault")) vaultPlaced = true;
        if (roomType === "monster pit") pitPlaced = true;
        if (roomType === "monster nest") nestPlaced = true;
      }
    } else {
      // Legacy fixed-weight room selection

      // ~5% chance of a vault (at most one per level, requires templates)
      if (!vaultPlaced && vaults.length > 0 && rng.randint0(20) === 0) {
        const vault = pickVault(vaults, depth, rng);
        if (vault) {
          room = generateVaultRoom(chunk, center, vault, rng);
          if (room) vaultPlaced = true;
        }
      }

      // ~3% chance of a monster pit (at most one per level, depth >= 5)
      if (!room && !pitPlaced && pits.length > 0 && depth >= 5 && rng.randint0(35) === 0) {
        const pit = pickPit(pits, depth, races, rng, 1);
        if (pit) {
          room = generatePitRoom(chunk, center, pit, races, rng);
          if (room) pitPlaced = true;
        }
      }

      // ~3% chance of a monster nest (at most one per level, depth >= 5)
      if (!room && !nestPlaced && pits.length > 0 && depth >= 5 && rng.randint0(35) === 0) {
        const nest = pickPit(pits, depth, races, rng, 2);
        if (nest) {
          room = generateNestRoom(chunk, center, nest, races, rng);
          if (room) nestPlaced = true;
        }
      }

      // Normal room generation
      if (!room) {
        const builder = ROOM_BUILDERS[rng.randint0(ROOM_BUILDERS.length)]!;
        room = builder(chunk, center, rng);
      }
    }

    if (room) {
      rooms.push(room);
    }
  }

  // Validate: need at least MIN_ROOMS
  if (rooms.length < MIN_ROOMS) return null;

  // Step 3: Connect rooms with tunnels
  // Connect each room to the next in sequence (ensures connectivity)
  for (let i = 1; i < rooms.length; i++) {
    digTunnel(chunk, rooms[i - 1]!.center, rooms[i]!.center, rng);
  }

  // Also connect the last room to the first for a loop
  if (rooms.length > 2) {
    digTunnel(chunk, rooms[rooms.length - 1]!.center, rooms[0]!.center, rng);
  }

  // Step 4: Place stairs
  if (rooms.length >= 2) {
    const upLoc = findFloorInRoom(chunk, rooms[0]!, rng);
    const downLoc = findFloorInRoom(chunk, rooms[rooms.length - 1]!, rng);
    placeStairs(chunk, upLoc, downLoc);
  } else if (rooms.length === 1) {
    // Only one room — put both stairs in it
    const upLoc = findFloorInRoom(chunk, rooms[0]!, rng);
    const downLoc = findFloorInRoom(chunk, rooms[0]!, rng);
    placeStairs(chunk, upLoc, downLoc);
  }

  // Step 5: Populate monsters
  populateMonsters(chunk, depth, config.monsterDensity, races, rng);

  // Step 6: Populate objects
  populateObjects(chunk, depth, config.objectDensity, kinds, rng, egoItems);

  // Step 7: Place traps (roughly depth/3 traps, minimum 1)
  const trapCount = Math.max(1, Math.floor(depth / 3));
  placeTraps(chunk, depth, trapCount, rng);

  // Step 8: Calculate level feeling
  chunk.feeling = calculateFeeling(chunk);

  return chunk;
}

/**
 * Calculate the level feeling (0-9) based on object and monster ratings.
 *
 * Port of calc_obj_feeling() + calc_mon_feeling() from gen-cave.c.
 * Feeling 0 = boring, 9 = superb/deadly.
 */
function calculateFeeling(chunk: Chunk): number {
  // Object feeling thresholds (from C source)
  const objThresholds = [0, 20, 50, 100, 200, 400, 800, 2000, 5000, 10000];
  // Monster feeling thresholds
  const monThresholds = [0, 10, 25, 50, 100, 200, 400, 800, 2000, 5000];

  let objFeeling = 0;
  for (let i = objThresholds.length - 1; i >= 0; i--) {
    if (chunk.objRating >= objThresholds[i]!) {
      objFeeling = i;
      break;
    }
  }

  let monFeeling = 0;
  for (let i = monThresholds.length - 1; i >= 0; i--) {
    if (chunk.monRating >= monThresholds[i]!) {
      monFeeling = i;
      break;
    }
  }

  // Combined feeling is the max of object and monster feelings
  return Math.max(objFeeling, monFeeling);
}
