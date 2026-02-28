/**
 * @file cave/square.ts
 * @brief Square query and manipulation functions
 *
 * Port of cave-square.c — functions for dealing with individual squares.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type {
  Chunk,
  Square,
  FeatureType,
  FeatureId,
  Feat,
  MonsterId,
} from "../types/index.js";
import {
  SquareFlag,
  TerrainFlag,
} from "../types/index.js";
import type { Loc } from "../z/index.js";
import { chunkContains, chunkGetSquare } from "./chunk.js";

// ── Feature info registry ──

/**
 * The global feature info table, analogous to `f_info` in the C source.
 *
 * Must be initialized by the game startup code (e.g. from terrain.txt).
 * Square query functions that depend on terrain flags will throw if
 * this is not set.
 */
let featureInfo: FeatureType[] | null = null;

/**
 * Register the feature info table. Called once during game initialization.
 */
export function setFeatureInfo(info: FeatureType[]): void {
  featureInfo = info;
}

/**
 * Get the feature info table, throwing if uninitialized.
 */
export function getFeatureInfo(): FeatureType[] {
  if (!featureInfo) {
    throw new Error("Feature info not initialized — call setFeatureInfo() first");
  }
  return featureInfo;
}

/**
 * Look up a feature type by its index.
 */
function featInfo(feat: FeatureId): FeatureType {
  const info = getFeatureInfo();
  const f = info[feat];
  if (!f) {
    throw new Error(`Unknown feature index: ${feat}`);
  }
  return f;
}

// ── Internal helpers ──

/**
 * Get the square at a location, with bounds assertion.
 */
function square(c: Chunk, loc: Loc): Square {
  return chunkGetSquare(c, loc);
}

/**
 * Test if a terrain feature has a given terrain flag.
 */
function tfHas(feat: FeatureId, flag: TerrainFlag): boolean {
  return featInfo(feat).flags.has(flag);
}

// ── FEATURE PREDICATES ──
// These test a terrain feature index for the described type.

export function featIsFloor(feat: FeatureId): boolean {
  return tfHas(feat, TerrainFlag.FLOOR);
}

export function featIsWall(feat: FeatureId): boolean {
  return tfHas(feat, TerrainFlag.WALL);
}

export function featIsGranite(feat: FeatureId): boolean {
  return tfHas(feat, TerrainFlag.GRANITE);
}

export function featIsLos(feat: FeatureId): boolean {
  return tfHas(feat, TerrainFlag.LOS);
}

export function featIsPassable(feat: FeatureId): boolean {
  return tfHas(feat, TerrainFlag.PASSABLE);
}

export function featIsProjectable(feat: FeatureId): boolean {
  return tfHas(feat, TerrainFlag.PROJECT);
}

export function featIsRock(feat: FeatureId): boolean {
  return tfHas(feat, TerrainFlag.ROCK);
}

// ── SQUARE FEATURE PREDICATES ──
// These test what kind of terrain the square has.

/**
 * True if the square is normal open floor.
 * Port of `square_isfloor()`.
 */
export function squareIsFloor(c: Chunk, loc: Loc): boolean {
  return featIsFloor(square(c, loc).feat);
}

/**
 * True if the square is a solid wall.
 * Port of `square_isrock()` — granite without DOOR_ANY.
 */
export function squareIsWall(c: Chunk, loc: Loc): boolean {
  return featIsWall(square(c, loc).feat);
}

/**
 * True if the square is granite.
 * Port of `square_isgranite()`.
 */
export function squareIsGranite(c: Chunk, loc: Loc): boolean {
  return featIsGranite(square(c, loc).feat);
}

/**
 * True if the square is a closed door (possibly locked or jammed).
 * Port of `square_iscloseddoor()`.
 */
export function squareIsClosedDoor(c: Chunk, loc: Loc): boolean {
  return tfHas(square(c, loc).feat, TerrainFlag.DOOR_CLOSED);
}

/**
 * True if the square is an open door.
 * Port of `square_isopendoor()`.
 */
export function squareIsOpenDoor(c: Chunk, loc: Loc): boolean {
  return tfHas(square(c, loc).feat, TerrainFlag.CLOSABLE);
}

// ── SQUARE BEHAVIOR PREDICATES ──

/**
 * True if the square is open (a floor square not occupied by a monster).
 * Port of `square_isopen()`.
 */
export function squareIsOpen(c: Chunk, loc: Loc): boolean {
  return squareIsFloor(c, loc) && square(c, loc).mon === (0 as MonsterId);
}

/**
 * True if the square is passable by the player.
 * Port of `square_ispassable()`.
 */
export function squareIsPassable(c: Chunk, loc: Loc): boolean {
  return featIsPassable(square(c, loc).feat);
}

/**
 * True if any projectable can pass through the square.
 * Port of `square_isprojectable()`.
 */
export function squareIsProjectable(c: Chunk, loc: Loc): boolean {
  if (!chunkContains(c, loc)) return false;
  return featIsProjectable(square(c, loc).feat);
}

/**
 * True if the square allows line-of-sight.
 * Port of `square_allowslos()`.
 */
export function squareAllowsLOS(c: Chunk, loc: Loc): boolean {
  return featIsLos(square(c, loc).feat);
}

// ── SQUARE INFO (FLAG) PREDICATES ──
// These test the per-square info bitflag.

/**
 * True if the square is marked (memorized by the player).
 */
export function squareIsMark(c: Chunk, loc: Loc): boolean {
  return square(c, loc).info.has(SquareFlag.MARK);
}

/**
 * True if the square is self-illuminating.
 */
export function squareIsGlow(c: Chunk, loc: Loc): boolean {
  return square(c, loc).info.has(SquareFlag.GLOW);
}

/**
 * True if the square is part of a vault.
 */
export function squareIsVault(c: Chunk, loc: Loc): boolean {
  return square(c, loc).info.has(SquareFlag.VAULT);
}

/**
 * True if the square is part of a room.
 */
export function squareIsRoom(c: Chunk, loc: Loc): boolean {
  return square(c, loc).info.has(SquareFlag.ROOM);
}

/**
 * True if the square is currently seen by the player.
 */
export function squareIsSeen(c: Chunk, loc: Loc): boolean {
  return square(c, loc).info.has(SquareFlag.SEEN);
}

/**
 * True if the square is in the player's field of view.
 */
export function squareIsView(c: Chunk, loc: Loc): boolean {
  return square(c, loc).info.has(SquareFlag.VIEW);
}

/**
 * True if the square is a feeling trigger.
 */
export function squareIsFeel(c: Chunk, loc: Loc): boolean {
  return square(c, loc).info.has(SquareFlag.FEEL);
}

// ── FLAG SETTERS ──

/**
 * Set the MARK flag on a square.
 */
export function squareSetMark(c: Chunk, loc: Loc): void {
  square(c, loc).info.on(SquareFlag.MARK);
}

/**
 * Clear the MARK flag on a square.
 */
export function squareClearMark(c: Chunk, loc: Loc): void {
  square(c, loc).info.off(SquareFlag.MARK);
}

/**
 * Set the GLOW flag on a square.
 */
export function squareSetGlow(c: Chunk, loc: Loc): void {
  square(c, loc).info.on(SquareFlag.GLOW);
}

/**
 * Clear the GLOW flag on a square.
 */
export function squareClearGlow(c: Chunk, loc: Loc): void {
  square(c, loc).info.off(SquareFlag.GLOW);
}

/**
 * Set the VAULT flag on a square.
 */
export function squareSetVault(c: Chunk, loc: Loc): void {
  square(c, loc).info.on(SquareFlag.VAULT);
}

/**
 * Clear the VAULT flag on a square.
 */
export function squareClearVault(c: Chunk, loc: Loc): void {
  square(c, loc).info.off(SquareFlag.VAULT);
}

/**
 * Set the ROOM flag on a square.
 */
export function squareSetRoom(c: Chunk, loc: Loc): void {
  square(c, loc).info.on(SquareFlag.ROOM);
}

/**
 * Clear the ROOM flag on a square.
 */
export function squareClearRoom(c: Chunk, loc: Loc): void {
  square(c, loc).info.off(SquareFlag.ROOM);
}

/**
 * Set the SEEN flag on a square.
 */
export function squareSetSeen(c: Chunk, loc: Loc): void {
  square(c, loc).info.on(SquareFlag.SEEN);
}

/**
 * Clear the SEEN flag on a square.
 */
export function squareClearSeen(c: Chunk, loc: Loc): void {
  square(c, loc).info.off(SquareFlag.SEEN);
}

/**
 * Set the VIEW flag on a square.
 */
export function squareSetView(c: Chunk, loc: Loc): void {
  square(c, loc).info.on(SquareFlag.VIEW);
}

/**
 * Clear the VIEW flag on a square.
 */
export function squareClearView(c: Chunk, loc: Loc): void {
  square(c, loc).info.off(SquareFlag.VIEW);
}

/**
 * Set the FEEL flag on a square.
 */
export function squareSetFeel(c: Chunk, loc: Loc): void {
  square(c, loc).info.on(SquareFlag.FEEL);
}

/**
 * Clear the FEEL flag on a square.
 */
export function squareClearFeel(c: Chunk, loc: Loc): void {
  square(c, loc).info.off(SquareFlag.FEEL);
}

// ── FEATURE SETTERS ──

/**
 * Set the terrain type for a square.
 *
 * Port of `square_set_feat()` from cave-square.c.
 * Updates the chunk's feat_count tracking.
 */
export function squareSetFeat(c: Chunk, loc: Loc, feat: number): void {
  const sq = square(c, loc);
  const currentFeat = sq.feat;

  // Track feature count changes
  if (currentFeat) {
    const cur = c.featCount[currentFeat];
    if (cur !== undefined) c.featCount[currentFeat] = cur - 1;
  }
  if (feat) {
    const cur = c.featCount[feat];
    if (cur !== undefined) c.featCount[feat] = cur + 1;
  }

  // Set the new terrain
  sq.feat = feat as FeatureId;
}

// ── MONSTER / OBJECT QUERIES ──

/**
 * True if the square has a monster (or player) occupying it.
 * Port of `square_isoccupied()` — returns true if mon != 0.
 */
export function squareHasMonster(c: Chunk, loc: Loc): boolean {
  return square(c, loc).mon !== (0 as MonsterId);
}

/**
 * True if the square has one or more objects on it.
 * Port of `square_object()` null check.
 */
export function squareHasObject(c: Chunk, loc: Loc): boolean {
  return square(c, loc).obj !== null;
}
