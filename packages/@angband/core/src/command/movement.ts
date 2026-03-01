/**
 * @file command/movement.ts
 * @brief Movement and terrain interaction commands
 *
 * Port of cmd-cave.c — movement, doors, disarming, tunneling, search, stairs.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Chunk, MonsterId, FeatureType } from "../types/index.js";
import { Feat, TerrainFlag, SquareFlag } from "../types/index.js";
import type { Player } from "../types/index.js";
import type { Loc, RNG } from "../z/index.js";
import { loc, locSum } from "../z/index.js";
import { chunkContains, chunkGetSquare, squareSetFeat, getFeatureInfo } from "../cave/index.js";
import { STANDARD_ENERGY, successResult, failResult } from "./core.js";
import type { CommandResult } from "./core.js";
import { addToInventory, inventoryIsFull } from "../object/index.js";
import { cmdAttack as cmdAttackFn } from "./combat.js";

// ── Direction handling ──

/**
 * Direction offsets indexed by numpad direction.
 *
 * The numpad layout is:
 *   7=NW  8=N  9=NE
 *   4=W   5=none 6=E
 *   1=SW  2=S  3=SE
 *
 * Each entry is a (dx, dy) offset. Note: y increases downward.
 * Port of ddgrid[] from cave.c.
 */
const DIRECTION_OFFSETS: readonly Loc[] = [
  loc(0, 0),   // 0: unknown/invalid
  loc(-1, 1),  // 1: SW
  loc(0, 1),   // 2: S
  loc(1, 1),   // 3: SE
  loc(-1, 0),  // 4: W
  loc(0, 0),   // 5: none (stay in place)
  loc(1, 0),   // 6: E
  loc(-1, -1), // 7: NW
  loc(0, -1),  // 8: N
  loc(1, -1),  // 9: NE
];

/**
 * Get the (dx, dy) offset for a numpad direction (0-9).
 *
 * Direction 5 means "stay in place" and returns (0, 0).
 * Out-of-range directions return (0, 0).
 */
export function directionOffset(dir: number): Loc {
  if (dir < 0 || dir > 9) return loc(0, 0);
  return DIRECTION_OFFSETS[dir]!;
}

/**
 * Check if a direction is valid for movement (1-9, excluding 0).
 */
export function isValidDirection(dir: number): boolean {
  return dir >= 1 && dir <= 9;
}

// ── Internal terrain helpers ──

/**
 * Attempt to get the feature info table.
 * Returns null if not initialized (tests without feature info setup).
 */
function tryGetFeatureInfo(): FeatureType[] | null {
  try {
    return getFeatureInfo();
  } catch {
    return null;
  }
}

/**
 * Test if a terrain feature has a given terrain flag.
 * Returns false if feature info is unavailable (safe fallback).
 */
function featHasFlag(chunk: Chunk, atLoc: Loc, flag: TerrainFlag): boolean {
  if (!chunkContains(chunk, atLoc)) return false;
  const info = tryGetFeatureInfo();
  if (!info) return false;
  const feat = chunkGetSquare(chunk, atLoc).feat;
  const fi = info[feat];
  if (!fi) return false;
  return fi.flags.has(flag);
}

/**
 * Safely check if a square has a specific feature type.
 */
function squareIsFeat(chunk: Chunk, atLoc: Loc, feat: number): boolean {
  if (!chunkContains(chunk, atLoc)) return false;
  return chunkGetSquare(chunk, atLoc).feat === feat;
}

/** Check if a square is passable (has PASSABLE terrain flag). */
function isPassable(chunk: Chunk, atLoc: Loc): boolean {
  return featHasFlag(chunk, atLoc, TerrainFlag.PASSABLE);
}

/** Check if a square has a closed door. */
function isClosedDoor(chunk: Chunk, atLoc: Loc): boolean {
  return featHasFlag(chunk, atLoc, TerrainFlag.DOOR_CLOSED);
}

/** Check if a square has an open door (closable). */
function isOpenDoor(chunk: Chunk, atLoc: Loc): boolean {
  return featHasFlag(chunk, atLoc, TerrainFlag.CLOSABLE);
}

/** Check if a square is a wall (has WALL terrain flag). */
function isWall(chunk: Chunk, atLoc: Loc): boolean {
  return featHasFlag(chunk, atLoc, TerrainFlag.WALL);
}

/** Check if a square is permanent (cannot be altered). */
function isPermanent(chunk: Chunk, atLoc: Loc): boolean {
  return featHasFlag(chunk, atLoc, TerrainFlag.PERMANENT);
}

/** Check if a square is an up staircase. */
function isUpStair(chunk: Chunk, atLoc: Loc): boolean {
  return featHasFlag(chunk, atLoc, TerrainFlag.UPSTAIR);
}

/** Check if a square is a down staircase. */
function isDownStair(chunk: Chunk, atLoc: Loc): boolean {
  return featHasFlag(chunk, atLoc, TerrainFlag.DOWNSTAIR);
}

/** Check if a square has a locked door. */
function isLockedDoor(chunk: Chunk, atLoc: Loc): boolean {
  return featHasFlag(chunk, atLoc, TerrainFlag.DOOR_LOCKED);
}

/** Check if a square has a jammed door. */
function isJammedDoor(chunk: Chunk, atLoc: Loc): boolean {
  return featHasFlag(chunk, atLoc, TerrainFlag.DOOR_JAMMED);
}

/** Check if a square is rock/diggable. */
function isRock(chunk: Chunk, atLoc: Loc): boolean {
  return featHasFlag(chunk, atLoc, TerrainFlag.ROCK);
}

/** Compute the target square from player position and direction. */
function targetFromDir(player: Player, dir: number): Loc {
  return locSum(player.grid, directionOffset(dir));
}

/** Check if there is a monster at the target square (positive mon = monster). */
function hasMonster(chunk: Chunk, atLoc: Loc): boolean {
  if (!chunkContains(chunk, atLoc)) return false;
  return chunkGetSquare(chunk, atLoc).mon > (0 as MonsterId);
}

// ── Movement commands ──

/**
 * Walk in the given direction.
 *
 * Port of do_cmd_walk from cmd-cave.c. Handles:
 * - Normal movement to an empty floor square
 * - Walking into a closed door (auto-open)
 * - Blocking by walls/rubble
 * - Monster attacks when walking into an occupied square
 *
 * @param player The player character
 * @param chunk  The current dungeon level
 * @param dir    Direction (1-9 numpad)
 * @param rng    Random number generator
 * @returns      Command result
 */
export function cmdWalk(
  player: Player,
  chunk: Chunk,
  dir: number,
  rng: RNG,
): CommandResult {
  if (!isValidDirection(dir)) {
    return failResult(["Invalid direction."]);
  }

  // Direction 5 = stay in place (hold)
  if (dir === 5) {
    return successResult(STANDARD_ENERGY, ["You stay in place."]);
  }

  const target = targetFromDir(player, dir);

  // Bounds check
  if (!chunkContains(chunk, target)) {
    return failResult(["There is a wall in the way!"]);
  }

  // Monster in the way -> attack
  if (hasMonster(chunk, target)) {
    return cmdAttackFn(player, chunk, target, rng);
  }

  // Closed door -> auto-open
  if (isClosedDoor(chunk, target)) {
    return cmdOpen(player, chunk, dir, rng);
  }

  // Not passable -> blocked
  if (!isPassable(chunk, target)) {
    if (isWall(chunk, target)) {
      const sq = chunkGetSquare(chunk, target);
      process.stderr.write(`[WALL-HIT] dir=${dir} from=(${player.grid.x},${player.grid.y}) to=(${target.x},${target.y}) feat=${sq.feat}\n`);
      return failResult(["There is a wall in the way!"]);
    }
    if (isRock(chunk, target)) {
      return failResult(["There is a pile of rubble in the way!"]);
    }
    return failResult(["You cannot pass through there."]);
  }

  // Move the player
  const messages: string[] = [];
  player.grid = target;

  // Check for traps
  const sq = chunkGetSquare(chunk, target);
  if (sq.trap !== null && sq.info.has(SquareFlag.TRAP)) {
    messages.push("You discover a trap!");
  }

  // Auto-pickup: pick up floor objects when walking onto them
  if (sq.obj !== null && !inventoryIsFull(player)) {
    const obj = chunk.objectList.get(sq.obj as number);
    if (obj && obj.kind) {
      chunk.objectList.delete(sq.obj as number);
      const nextObj = obj.next;
      if (nextObj) {
        for (const [id, o] of chunk.objectList) {
          if (o === nextObj) {
            (sq as { obj: number | null }).obj = id;
            break;
          }
        }
      } else {
        (sq as { obj: number | null }).obj = null;
      }
      addToInventory(player, obj);
      messages.push(`You pick up ${obj.kind.name}.`);
      process.stderr.write(`[PICKUP] ${obj.kind.name} tval=${obj.tval} sval=${obj.sval}\n`);
    }
  }

  return successResult(STANDARD_ENERGY, messages);
}

/**
 * Start running in a direction.
 *
 * Port of do_cmd_run from cmd-cave.c. Running is like walking but
 * continues automatically until interrupted. This implements the
 * first step of a run.
 *
 * @param player The player character
 * @param chunk  The current dungeon level
 * @param dir    Direction (1-9 numpad)
 * @param rng    Random number generator
 * @returns      Command result
 */
export function cmdRun(
  player: Player,
  chunk: Chunk,
  dir: number,
  _rng: RNG,
): CommandResult {
  if (!isValidDirection(dir)) {
    return failResult(["Invalid direction."]);
  }

  if (dir === 5) {
    return failResult(["You cannot run in place."]);
  }

  // Check for confusion (confused players cannot run)
  if ((player.timed[4] ?? 0) > 0) { // TimedEffect.CONFUSED = 4
    return failResult(["You are too confused to run!"]);
  }

  const target = targetFromDir(player, dir);

  // Bounds check
  if (!chunkContains(chunk, target)) {
    return failResult(["There is a wall in the way!"]);
  }

  // Not passable -> blocked
  if (!isPassable(chunk, target) && !isClosedDoor(chunk, target)) {
    return failResult(["There is a wall in the way!"]);
  }

  // Monster blocks running
  if (hasMonster(chunk, target)) {
    return failResult(["There is a monster in the way!"]);
  }

  // Move the player (first step of run)
  player.grid = target;
  player.upkeep.running = 1;
  player.upkeep.runningFirstStep = true;

  return successResult(STANDARD_ENERGY);
}

/**
 * Open a door (or locked/jammed door).
 *
 * Port of do_cmd_open from cmd-cave.c.
 *
 * @param player The player character
 * @param chunk  The current dungeon level
 * @param dir    Direction to the door
 * @param rng    Random number generator
 * @returns      Command result
 */
export function cmdOpen(
  player: Player,
  chunk: Chunk,
  dir: number,
  rng: RNG,
): CommandResult {
  if (!isValidDirection(dir)) {
    return failResult(["Invalid direction."]);
  }

  const target = targetFromDir(player, dir);

  // Bounds check
  if (!chunkContains(chunk, target)) {
    return failResult(["You see nothing there."]);
  }

  // Monster in the way
  if (hasMonster(chunk, target)) {
    return failResult(["There is a monster in the way!"]);
  }

  // Must be a closed door
  if (!isClosedDoor(chunk, target)) {
    return failResult(["You see nothing there to open."]);
  }

  // Jammed door
  if (isJammedDoor(chunk, target)) {
    return successResult(STANDARD_ENERGY, [
      "The door appears to be stuck.",
    ]);
  }

  // Locked door — attempt to pick the lock
  if (isLockedDoor(chunk, target)) {
    const skill = player.state.skills[0] ?? 0; // SKILL_DISARM_PHYS
    const chance = Math.max(2, skill - 10);
    if (rng.randint0(100) < chance) {
      // Successfully picked
      squareSetFeat(chunk, target, Feat.OPEN);
      return successResult(STANDARD_ENERGY, ["You have picked the lock."]);
    } else {
      return successResult(STANDARD_ENERGY, [
        "You failed to pick the lock.",
      ]);
    }
  }

  // Normal closed door — open it
  squareSetFeat(chunk, target, Feat.OPEN);
  return successResult(STANDARD_ENERGY, ["You open the door."]);
}

/**
 * Close an open door.
 *
 * Port of do_cmd_close from cmd-cave.c.
 *
 * @param player The player character
 * @param chunk  The current dungeon level
 * @param dir    Direction to the door
 * @param rng    Random number generator
 * @returns      Command result
 */
export function cmdClose(
  player: Player,
  chunk: Chunk,
  dir: number,
  _rng: RNG,
): CommandResult {
  if (!isValidDirection(dir)) {
    return failResult(["Invalid direction."]);
  }

  const target = targetFromDir(player, dir);

  // Bounds check
  if (!chunkContains(chunk, target)) {
    return failResult(["You see nothing there."]);
  }

  // Monster in the way
  if (hasMonster(chunk, target)) {
    return failResult(["There is a monster in the way!"]);
  }

  // Player standing in the doorway
  if (target.x === player.grid.x && target.y === player.grid.y) {
    return failResult(["You're standing in that doorway."]);
  }

  // Must be an open door
  if (!isOpenDoor(chunk, target)) {
    // Check if it's a broken door
    if (squareIsFeat(chunk, target, Feat.BROKEN)) {
      return successResult(STANDARD_ENERGY, [
        "The door appears to be broken.",
      ]);
    }
    return failResult(["You see nothing there to close."]);
  }

  // Close the door
  squareSetFeat(chunk, target, Feat.CLOSED);
  return successResult(STANDARD_ENERGY, ["You close the door."]);
}

/**
 * Tunnel through walls or rubble.
 *
 * Port of do_cmd_tunnel from cmd-cave.c.
 *
 * @param player The player character
 * @param chunk  The current dungeon level
 * @param dir    Direction to tunnel
 * @param rng    Random number generator
 * @returns      Command result
 */
export function cmdTunnel(
  player: Player,
  chunk: Chunk,
  dir: number,
  rng: RNG,
): CommandResult {
  if (!isValidDirection(dir)) {
    return failResult(["Invalid direction."]);
  }

  const target = targetFromDir(player, dir);

  // Bounds check
  if (!chunkContains(chunk, target)) {
    return failResult(["You see nothing there."]);
  }

  // Monster in the way
  if (hasMonster(chunk, target)) {
    return failResult(["There is a monster in the way!"]);
  }

  // Permanent wall — still uses a turn (C game calls use_energy first)
  if (isPermanent(chunk, target)) {
    return successResult(STANDARD_ENERGY, ["This seems to be permanent rock."]);
  }

  // Must be diggable (wall or rock or closed door)
  if (!isWall(chunk, target) && !isRock(chunk, target) && !isClosedDoor(chunk, target)) {
    return successResult(STANDARD_ENERGY, ["You see nothing there to tunnel."]);
  }

  // Calculate digging chance based on player skill
  const diggingSkill = player.state.skills[9] ?? 0; // SKILL_DIGGING
  const isRubble = squareIsFeat(chunk, target, Feat.RUBBLE);

  // Difficulty: rubble < magma < quartz < granite
  let difficulty: number;
  if (isRubble) {
    difficulty = 200;
  } else if (featHasFlag(chunk, target, TerrainFlag.MAGMA)) {
    difficulty = 600;
  } else if (featHasFlag(chunk, target, TerrainFlag.QUARTZ)) {
    difficulty = 900;
  } else if (featHasFlag(chunk, target, TerrainFlag.GRANITE)) {
    difficulty = 1200;
  } else {
    // Closed door
    difficulty = 400;
  }

  // Attempt to dig
  const chance = Math.max(0, diggingSkill * 10 - difficulty);
  const success = chance > rng.randint0(1600);

  if (success) {
    // Replace with floor
    squareSetFeat(chunk, target, Feat.FLOOR);

    if (isRubble) {
      return successResult(STANDARD_ENERGY, [
        "You have removed the rubble.",
      ]);
    }

    // Check for gold in treasure veins
    if (featHasFlag(chunk, target, TerrainFlag.GOLD)) {
      return successResult(STANDARD_ENERGY, [
        "You have found something!",
      ]);
    }

    return successResult(STANDARD_ENERGY, [
      "You have finished the tunnel.",
    ]);
  }

  // Failed but can keep trying
  if (chance > 0) {
    if (isRubble) {
      return successResult(STANDARD_ENERGY, ["You dig in the rubble."]);
    }
    return successResult(STANDARD_ENERGY, ["You tunnel into the rock."]);
  }

  // No chance at all
  return successResult(STANDARD_ENERGY, [
    "You chip away futilely at the rock.",
  ]);
}

/**
 * Disarm a trap.
 *
 * Port of do_cmd_disarm from cmd-cave.c.
 *
 * @param player The player character
 * @param chunk  The current dungeon level
 * @param dir    Direction to the trap
 * @param rng    Random number generator
 * @returns      Command result
 */
export function cmdDisarm(
  player: Player,
  chunk: Chunk,
  dir: number,
  rng: RNG,
): CommandResult {
  if (!isValidDirection(dir)) {
    return failResult(["Invalid direction."]);
  }

  const target = targetFromDir(player, dir);

  // Bounds check
  if (!chunkContains(chunk, target)) {
    return failResult(["You see nothing there."]);
  }

  // Monster in the way
  if (hasMonster(chunk, target)) {
    return failResult(["There is a monster in the way!"]);
  }

  const sq = chunkGetSquare(chunk, target);

  // Must have a trap
  if (sq.trap === null) {
    // Check if it's a closed unlocked door (lock it instead)
    if (isClosedDoor(chunk, target) && !isLockedDoor(chunk, target)) {
      const skill = player.state.skills[0] ?? 0; // SKILL_DISARM_PHYS
      if (rng.randint0(100) < Math.max(2, skill)) {
        return successResult(STANDARD_ENERGY, ["You lock the door."]);
      }
      return successResult(STANDARD_ENERGY, [
        "You failed to lock the door.",
      ]);
    }
    return failResult(["You see nothing there to disarm."]);
  }

  // Calculate disarm chance
  const skill = player.state.skills[0] ?? 0; // SKILL_DISARM_PHYS
  let disarmChance = skill;

  // Penalize blindness and confusion
  if ((player.timed[2] ?? 0) > 0) disarmChance = Math.floor(disarmChance / 10); // BLIND
  if ((player.timed[4] ?? 0) > 0) disarmChance = Math.floor(disarmChance / 10); // CONFUSED

  const trapPower = 5; // Default trap power
  const chance = Math.max(2, disarmChance - trapPower);

  if (rng.randint0(100) < chance) {
    // Successfully disarmed
    sq.trap = null;
    sq.info.off(SquareFlag.TRAP);
    return successResult(STANDARD_ENERGY, [
      "You have disarmed the trap.",
    ]);
  }

  // Failed — trap may trigger
  if (rng.oneIn(3)) {
    return successResult(STANDARD_ENERGY, [
      "You failed to disarm the trap.",
      "The trap triggers!",
    ]);
  }

  return successResult(STANDARD_ENERGY, [
    "You failed to disarm the trap.",
  ]);
}

/**
 * Search for hidden features (traps, secret doors).
 *
 * Port of do_cmd_search from cmd-cave.c. Examines adjacent squares
 * for hidden traps or secret doors and reveals them.
 *
 * @param player The player character
 * @param chunk  The current dungeon level
 * @param rng    Random number generator
 * @returns      Command result
 */
export function cmdSearch(
  player: Player,
  chunk: Chunk,
  rng: RNG,
): CommandResult {
  const messages: string[] = [];
  const searchSkill = player.state.skills[4] ?? 0; // SKILL_SEARCH

  // Check all 8 adjacent squares plus current square
  for (let dir = 1; dir <= 9; dir++) {
    const target = locSum(player.grid, directionOffset(dir));

    if (!chunkContains(chunk, target)) continue;

    const sq = chunkGetSquare(chunk, target);

    // Reveal hidden traps
    if (sq.info.has(SquareFlag.INVIS)) {
      const chance = searchSkill;
      if (rng.randint0(100) < chance) {
        sq.info.off(SquareFlag.INVIS);
        sq.info.on(SquareFlag.TRAP);
        messages.push("You have found a trap!");
      }
    }

    // Reveal secret doors
    if (squareIsFeat(chunk, target, Feat.SECRET)) {
      const chance = searchSkill;
      if (rng.randint0(100) < chance) {
        squareSetFeat(chunk, target, Feat.CLOSED);
        messages.push("You have found a secret door!");
      }
    }
  }

  if (messages.length === 0) {
    messages.push("You found nothing.");
  }

  return successResult(STANDARD_ENERGY, messages);
}

/**
 * Use an up staircase.
 *
 * Port of do_cmd_go_up from cmd-cave.c.
 *
 * @param player The player character
 * @param chunk  The current dungeon level
 * @returns      Command result
 */
export function cmdGoUp(
  player: Player,
  chunk: Chunk,
): CommandResult {
  // Must be standing on an up staircase
  if (!isUpStair(chunk, player.grid)) {
    return failResult(["I see no up staircase here."]);
  }

  // Cannot go above surface (depth 0)
  if (chunk.depth <= 0) {
    return failResult(["You can't go up from here!"]);
  }

  // Go up one level
  process.stderr.write(`[STAIRS-UP] depth ${player.depth} → ${player.depth - 1}\n`);
  player.depth -= 1;
  player.upkeep.createUpStair = false;
  player.upkeep.createDownStair = true;

  return successResult(STANDARD_ENERGY, [
    "You enter a maze of up staircases.",
  ]);
}

/**
 * Use a down staircase.
 *
 * Port of do_cmd_go_down from cmd-cave.c.
 *
 * @param player The player character
 * @param chunk  The current dungeon level
 * @returns      Command result
 */
export function cmdGoDown(
  player: Player,
  chunk: Chunk,
): CommandResult {
  // Must be standing on a down staircase
  if (!isDownStair(chunk, player.grid)) {
    return failResult(["I see no down staircase here."]);
  }

  // Go down one level
  process.stderr.write(`[STAIRS] depth ${player.depth} → ${player.depth + 1}\n`);
  player.depth += 1;
  player.upkeep.createUpStair = true;
  player.upkeep.createDownStair = false;

  return successResult(STANDARD_ENERGY, [
    "You enter a maze of down staircases.",
  ]);
}
