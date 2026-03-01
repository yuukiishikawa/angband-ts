/**
 * @file generate/populate.ts
 * @brief Monster and object placement during dungeon generation
 *
 * Port of alloc_object() and related functions from gen-util.c.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Chunk, Monster } from "../types/index.js";
import { Feat, SquareFlag } from "../types/index.js";
import type { MonsterRace, ObjectKind, EgoItem, ObjectType, ObjectId } from "../types/index.js";
import type { Loc, RNG } from "../z/index.js";
import { loc } from "../z/index.js";
import {
  chunkContainsFully,
  chunkGetSquare,
  squareSetFeat,
  squareIsFloor,
  squareIsRoom,
  squareHasMonster,
  squareHasObject,
} from "../cave/index.js";
import { placeNewMonster, pickMonsterRace } from "../monster/make.js";
import { makeObject, makeGold } from "../object/make.js";
import { TVal, ObjectOrigin } from "../types/index.js";

// ── Constants ──

/** Maximum attempts to find a valid placement location. */
const MAX_PLACEMENT_ATTEMPTS = 500;

// ── Internal helpers ──

/**
 * Find a random empty floor square suitable for placing something.
 *
 * @param chunk    The dungeon chunk.
 * @param rng      Random number generator.
 * @param inRoom   If true, only place in room squares. If false, only corridors.
 *                 If undefined, place anywhere on floor.
 * @returns A valid location, or null if none found after MAX_PLACEMENT_ATTEMPTS tries.
 */
function findEmptyFloor(
  chunk: Chunk,
  rng: RNG,
  inRoom?: boolean,
): Loc | null {
  for (let i = 0; i < MAX_PLACEMENT_ATTEMPTS; i++) {
    const x = 1 + rng.randint0(chunk.width - 2);
    const y = 1 + rng.randint0(chunk.height - 2);
    const pos = loc(x, y);

    if (!chunkContainsFully(chunk, pos)) continue;
    if (!squareIsFloor(chunk, pos)) continue;
    if (squareHasMonster(chunk, pos)) continue;
    if (squareHasObject(chunk, pos)) continue;

    // Check room requirement
    if (inRoom !== undefined) {
      const isRoom = squareIsRoom(chunk, pos);
      if (inRoom && !isRoom) continue;
      if (!inRoom && isRoom) continue;
    }

    return pos;
  }
  return null;
}

// ── Monster placement ──

/**
 * Scatter monsters across the dungeon level.
 *
 * Uses pickMonsterRace() for weighted race selection and
 * placeNewMonster() to create full Monster instances with
 * HP, speed, AI, and sleep state.
 *
 * @param chunk   The dungeon chunk.
 * @param depth   Current dungeon depth.
 * @param density Number of monsters to place.
 * @param races   Available monster races to choose from.
 * @param rng     Random number generator.
 * @returns Array of Monster instances placed on the level.
 */
export function populateMonsters(
  chunk: Chunk,
  depth: number,
  density: number,
  races: readonly MonsterRace[],
  rng: RNG,
): Monster[] {
  const placed: Monster[] = [];

  if (races.length === 0) return placed;

  // Mutable copy for pickMonsterRace (it reads curNum)
  const mutableRaces = races as MonsterRace[];

  for (let i = 0; i < density; i++) {
    const pos = findEmptyFloor(chunk, rng);
    if (!pos) continue;

    // Pick a race weighted by depth and rarity
    const race = pickMonsterRace(depth, mutableRaces, rng);
    if (!race) continue;

    // Create and place a full Monster instance
    const mon = placeNewMonster(
      chunk,
      pos,
      race,
      true,   // sleep: start asleep
      false,  // groupOk: skip groups for initial placement
      0,      // origin: dungeon generation
      rng,
    );

    if (mon) {
      placed.push(mon);
      // Note: placeMonsterOnGrid() already adds to chunk.monsters[midx]
    }
  }

  return placed;
}

// ── Object placement ──

/**
 * Scatter objects (items) across the dungeon level.
 *
 * Port of alloc_object(SET_BOTH, TYP_OBJECT) from gen-util.c.
 * Creates real ObjectType instances using makeObject()/makeGold().
 *
 * @param chunk    The dungeon chunk.
 * @param depth    Current dungeon depth.
 * @param density  Number of objects to place.
 * @param kinds    Available object kinds to choose from.
 * @param rng      Random number generator.
 * @param egoTable Optional ego item table for enchantment.
 * @returns Array of locations where objects were placed.
 */
export function populateObjects(
  chunk: Chunk,
  depth: number,
  density: number,
  kinds: readonly ObjectKind[],
  rng: RNG,
  egoTable?: readonly EgoItem[],
): Loc[] {
  const placed: Loc[] = [];

  if (kinds.length === 0) return placed;

  // Find gold kind for gold drops
  const goldKind = kinds.find(k => k.tval === TVal.GOLD) ?? null;

  let nextObjId = 1;

  for (let i = 0; i < density; i++) {
    const pos = findEmptyFloor(chunk, rng);
    if (!pos) continue;

    let obj: ObjectType | null = null;

    // 1 in 4 chance of gold pile
    if (goldKind && rng.oneIn(4)) {
      obj = makeGold(depth, rng, goldKind);
    } else {
      obj = makeObject(kinds, depth, false, false, rng, egoTable);
    }

    if (!obj) continue;

    // Place the object on the map
    obj.grid = { x: pos.x, y: pos.y };
    (obj as { origin: number }).origin = ObjectOrigin.FLOOR;
    (obj as { originDepth: number }).originDepth = depth;

    const oid = nextObjId as ObjectId;
    nextObjId++;

    const sq = chunkGetSquare(chunk, pos);
    sq.obj = oid;
    chunk.objectList.set(oid as number, obj);

    placed.push(pos);
  }

  return placed;
}

// ── Stairs placement ──

/**
 * Place up and down stairs at specific locations.
 *
 * Port of place_stairs() from gen-util.c.
 *
 * @param chunk   The dungeon chunk.
 * @param upLoc   Location for the up staircase.
 * @param downLoc Location for the down staircase.
 */
export function placeStairs(
  chunk: Chunk,
  upLoc: Loc,
  downLoc: Loc,
): void {
  if (chunkContainsFully(chunk, upLoc)) {
    squareSetFeat(chunk, upLoc, Feat.LESS);
  }
  if (chunkContainsFully(chunk, downLoc)) {
    squareSetFeat(chunk, downLoc, Feat.MORE);
  }
}

// ── Trap placement ──

/**
 * Place traps at random floor locations.
 *
 * Simplified port of alloc_object(SET_CORR, TYP_TRAP) from gen-util.c.
 * Traps are placed in corridors (non-room floor squares).
 *
 * @param chunk The dungeon chunk.
 * @param depth Current dungeon depth (affects trap selection).
 * @param count Number of traps to place.
 * @param rng   Random number generator.
 * @returns Array of locations where traps were placed.
 */
export function placeTraps(
  chunk: Chunk,
  depth: number,
  count: number,
  rng: RNG,
): Loc[] {
  const placed: Loc[] = [];

  for (let i = 0; i < count; i++) {
    // Traps go in corridors (non-room squares)
    const pos = findEmptyFloor(chunk, rng, false);
    if (!pos) continue;

    // Set the trap flag on the square. In the real game this would
    // create a Trap object; here we just mark the flag and set INVIS.
    const sq = chunkGetSquare(chunk, pos);
    sq.info.on(SquareFlag.TRAP);
    sq.info.on(SquareFlag.INVIS);

    placed.push(pos);
  }

  return placed;
}
