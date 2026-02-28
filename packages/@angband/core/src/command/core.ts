/**
 * @file command/core.ts
 * @brief Command dispatcher — types and execution entry point
 *
 * Port of cmd-core.c — the queueing/dispatching of game commands.
 *
 * Copyright (c) 2008-9 Antony Sidwell
 * Copyright (c) 2014 Andi Sidwell
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Chunk, MonsterId } from "../types/index.js";
import type { Player } from "../types/index.js";
import { EquipSlot } from "../types/index.js";
import type { Loc, RNG } from "../z/index.js";
import { locSum } from "../z/index.js";
import { squareIsClosedDoor, squareIsOpenDoor, squareIsWall, chunkContains } from "../cave/index.js";
import { getInventoryItem } from "../object/index.js";
import { cmdWalk, cmdRun, cmdOpen, cmdClose, cmdTunnel, cmdDisarm, cmdSearch, cmdGoUp, cmdGoDown, directionOffset } from "./movement.js";
import { cmdAttack, cmdFire, cmdThrow } from "./combat.js";
import { cmdEat, cmdQuaff, cmdRead, cmdAim, cmdZap, cmdPickup, cmdDrop, cmdEquip, cmdUnequip, cmdRest, cmdInscribe, cmdUseItem } from "./item.js";
import { cmdCast } from "./magic.js";

// ── Constants ──

/** Standard energy cost for one player action. */
export const STANDARD_ENERGY = 100;

// ── Command types ──

/**
 * Command type enum. Each value identifies a distinct player action.
 * Matches the CMD_xxx enum from the C source (gameplay commands only).
 */
export const enum CommandType {
  WALK = 0,
  RUN = 1,
  OPEN = 2,
  CLOSE = 3,
  TUNNEL = 4,
  DISARM = 5,
  ALTER = 6,
  ATTACK = 7,
  CAST = 8,
  FIRE = 9,
  THROW = 10,
  USE = 11,
  EAT = 12,
  QUAFF = 13,
  READ = 14,
  AIM = 15,
  ZAP = 16,
  PICKUP = 17,
  DROP = 18,
  EQUIP = 19,
  UNEQUIP = 20,
  BROWSE = 21,
  REST = 22,
  SEARCH = 23,
  GO_UP = 24,
  GO_DOWN = 25,
  INSCRIBE = 26,
  UNINSCRIBE = 27,
}

// ── Command result ──

/**
 * The outcome of executing a game command.
 *
 * All command functions return this immutable result rather than
 * mutating global state (functional style).
 *
 * Compatible with the CommandResult defined in magic.ts.
 */
export interface CommandResult {
  /** Whether the command completed successfully. */
  readonly success: boolean;
  /** Energy cost of the action (0 if the action was free). */
  readonly energyCost: number;
  /** Messages produced during execution, in order. */
  readonly messages: string[];
}

/**
 * Create a successful command result.
 */
export function successResult(
  energyCost: number,
  messages: string[] = [],
): CommandResult {
  return { success: true, energyCost, messages };
}

/**
 * Create a failed command result (no energy cost).
 */
export function failResult(
  messages: string[] = [],
): CommandResult {
  return { success: false, energyCost: 0, messages };
}

// ── Game command (discriminated union) ──

interface WalkCommand {
  readonly type: CommandType.WALK;
  readonly direction: number;
}

interface RunCommand {
  readonly type: CommandType.RUN;
  readonly direction: number;
}

interface OpenCommand {
  readonly type: CommandType.OPEN;
  readonly direction: number;
}

interface CloseCommand {
  readonly type: CommandType.CLOSE;
  readonly direction: number;
}

interface TunnelCommand {
  readonly type: CommandType.TUNNEL;
  readonly direction: number;
}

interface DisarmCommand {
  readonly type: CommandType.DISARM;
  readonly direction: number;
}

interface AlterCommand {
  readonly type: CommandType.ALTER;
  readonly direction: number;
}

interface AttackCommand {
  readonly type: CommandType.ATTACK;
  readonly target: Loc;
}

interface CastCommand {
  readonly type: CommandType.CAST;
  readonly spellIndex: number;
  readonly direction: number;
}

interface FireCommand {
  readonly type: CommandType.FIRE;
  readonly target: Loc;
}

interface ThrowCommand {
  readonly type: CommandType.THROW;
  readonly target: Loc;
  readonly itemIndex: number;
}

interface UseCommand {
  readonly type: CommandType.USE;
  readonly itemIndex: number;
}

interface EatCommand {
  readonly type: CommandType.EAT;
  readonly itemIndex: number;
}

interface QuaffCommand {
  readonly type: CommandType.QUAFF;
  readonly itemIndex: number;
}

interface ReadCommand {
  readonly type: CommandType.READ;
  readonly itemIndex: number;
}

interface AimCommand {
  readonly type: CommandType.AIM;
  readonly itemIndex: number;
  readonly direction: number;
}

interface ZapCommand {
  readonly type: CommandType.ZAP;
  readonly itemIndex: number;
}

interface PickupCommand {
  readonly type: CommandType.PICKUP;
}

interface DropCommand {
  readonly type: CommandType.DROP;
  readonly itemIndex: number;
  readonly quantity: number;
}

interface EquipCommand {
  readonly type: CommandType.EQUIP;
  readonly itemIndex: number;
}

interface UnequipCommand {
  readonly type: CommandType.UNEQUIP;
  readonly itemIndex: number;
}

interface BrowseCommand {
  readonly type: CommandType.BROWSE;
  readonly itemIndex: number;
}

interface RestCommand {
  readonly type: CommandType.REST;
  readonly turns: number;
}

interface SearchCommand {
  readonly type: CommandType.SEARCH;
}

interface GoUpCommand {
  readonly type: CommandType.GO_UP;
}

interface GoDownCommand {
  readonly type: CommandType.GO_DOWN;
}

interface InscribeCommand {
  readonly type: CommandType.INSCRIBE;
  readonly itemIndex: number;
  readonly inscription: string;
}

interface UninscribeCommand {
  readonly type: CommandType.UNINSCRIBE;
  readonly itemIndex: number;
}

/**
 * Base command fields shared by all commands.
 * nrepeat is an optional repeat count (numeric prefix, e.g. "5s" = search 5 times).
 */
interface CommandBase {
  /** Number of times to repeat this command (default 1). */
  readonly nrepeat?: number;
}

/**
 * Discriminated union of all game command types.
 * Each command carries its own arguments as typed fields.
 * All commands may optionally include an nrepeat field for command repetition.
 */
export type GameCommand = (
  | WalkCommand
  | RunCommand
  | OpenCommand
  | CloseCommand
  | TunnelCommand
  | DisarmCommand
  | AlterCommand
  | AttackCommand
  | CastCommand
  | FireCommand
  | ThrowCommand
  | UseCommand
  | EatCommand
  | QuaffCommand
  | ReadCommand
  | AimCommand
  | ZapCommand
  | PickupCommand
  | DropCommand
  | EquipCommand
  | UnequipCommand
  | BrowseCommand
  | RestCommand
  | SearchCommand
  | GoUpCommand
  | GoDownCommand
  | InscribeCommand
  | UninscribeCommand
) & CommandBase;

// ── Command info table ──

interface CommandInfo {
  readonly verb: string;
  readonly repeatAllowed: boolean;
  readonly canUseEnergy: boolean;
}

/**
 * Table of command metadata, paralleling game_cmds[] in cmd-core.c.
 */
export const COMMAND_INFO: Record<CommandType, CommandInfo> = {
  [CommandType.WALK]:       { verb: "walk",       repeatAllowed: true,  canUseEnergy: true },
  [CommandType.RUN]:        { verb: "run",        repeatAllowed: true,  canUseEnergy: true },
  [CommandType.OPEN]:       { verb: "open",       repeatAllowed: true,  canUseEnergy: true },
  [CommandType.CLOSE]:      { verb: "close",      repeatAllowed: true,  canUseEnergy: true },
  [CommandType.TUNNEL]:     { verb: "tunnel",     repeatAllowed: true,  canUseEnergy: true },
  [CommandType.DISARM]:     { verb: "disarm",     repeatAllowed: true,  canUseEnergy: true },
  [CommandType.ALTER]:      { verb: "alter",      repeatAllowed: true,  canUseEnergy: true },
  [CommandType.ATTACK]:     { verb: "attack",     repeatAllowed: false, canUseEnergy: true },
  [CommandType.CAST]:       { verb: "cast",       repeatAllowed: false, canUseEnergy: true },
  [CommandType.FIRE]:       { verb: "fire",       repeatAllowed: false, canUseEnergy: true },
  [CommandType.THROW]:      { verb: "throw",      repeatAllowed: false, canUseEnergy: true },
  [CommandType.USE]:        { verb: "use",        repeatAllowed: true,  canUseEnergy: true },
  [CommandType.EAT]:        { verb: "eat",        repeatAllowed: false, canUseEnergy: true },
  [CommandType.QUAFF]:      { verb: "quaff",      repeatAllowed: false, canUseEnergy: true },
  [CommandType.READ]:       { verb: "read",       repeatAllowed: false, canUseEnergy: true },
  [CommandType.AIM]:        { verb: "aim",        repeatAllowed: true,  canUseEnergy: true },
  [CommandType.ZAP]:        { verb: "zap",        repeatAllowed: true,  canUseEnergy: true },
  [CommandType.PICKUP]:     { verb: "pickup",     repeatAllowed: false, canUseEnergy: true },
  [CommandType.DROP]:       { verb: "drop",       repeatAllowed: false, canUseEnergy: true },
  [CommandType.EQUIP]:      { verb: "equip",      repeatAllowed: false, canUseEnergy: true },
  [CommandType.UNEQUIP]:    { verb: "unequip",    repeatAllowed: false, canUseEnergy: true },
  [CommandType.BROWSE]:     { verb: "browse",     repeatAllowed: false, canUseEnergy: false },
  [CommandType.REST]:       { verb: "rest",       repeatAllowed: false, canUseEnergy: true },
  [CommandType.SEARCH]:     { verb: "search",     repeatAllowed: false, canUseEnergy: true },
  [CommandType.GO_UP]:      { verb: "go up",      repeatAllowed: false, canUseEnergy: true },
  [CommandType.GO_DOWN]:    { verb: "go down",    repeatAllowed: false, canUseEnergy: true },
  [CommandType.INSCRIBE]:   { verb: "inscribe",   repeatAllowed: false, canUseEnergy: false },
  [CommandType.UNINSCRIBE]: { verb: "uninscribe", repeatAllowed: false, canUseEnergy: false },
};

/**
 * Look up the verb for a command type.
 */
export function commandVerb(type: CommandType): string {
  return COMMAND_INFO[type].verb;
}

// ── Main dispatcher ──

/**
 * Execute a game command and return its result.
 *
 * This is the main command dispatcher, analogous to the game_cmds
 * table dispatch in the C source. It routes each command type to
 * the appropriate handler function.
 *
 * Commands that are not yet implemented return a failure result
 * with an appropriate message.
 *
 * @param cmd    The command to execute
 * @param player The player executing the command
 * @param chunk  The current dungeon level
 * @param rng    The random number generator
 * @returns      The result of the command execution
 */
export function executeCommand(
  cmd: GameCommand,
  player: Player,
  chunk: Chunk,
  rng: RNG,
): CommandResult {
  switch (cmd.type) {
    // Movement and terrain interaction
    case CommandType.WALK:
      return cmdWalk(player, chunk, cmd.direction, rng);
    case CommandType.RUN:
      return cmdRun(player, chunk, cmd.direction, rng);
    case CommandType.OPEN:
      return cmdOpen(player, chunk, cmd.direction, rng);
    case CommandType.CLOSE:
      return cmdClose(player, chunk, cmd.direction, rng);
    case CommandType.TUNNEL:
      return cmdTunnel(player, chunk, cmd.direction, rng);
    case CommandType.DISARM:
      return cmdDisarm(player, chunk, cmd.direction, rng);
    case CommandType.SEARCH:
      return cmdSearch(player, chunk, rng);
    case CommandType.GO_UP:
      return cmdGoUp(player, chunk);
    case CommandType.GO_DOWN:
      return cmdGoDown(player, chunk);

    // Combat
    case CommandType.ATTACK:
      return cmdAttack(player, chunk, cmd.target, rng);
    case CommandType.FIRE:
      return cmdFire(player, chunk, cmd.target, rng);
    case CommandType.THROW:
      return cmdThrow(player, chunk, cmd.target, rng, cmd.itemIndex);

    // ALTER: context-sensitive — open/close/tunnel/disarm based on terrain
    case CommandType.ALTER:
      return cmdAlter(player, chunk, cmd.direction, rng);

    // Item usage
    case CommandType.USE:
      return cmdUseItem(player, cmd.itemIndex, null, rng);
    case CommandType.EAT:
      return cmdEat(player, cmd.itemIndex, rng);
    case CommandType.QUAFF:
      return cmdQuaff(player, cmd.itemIndex, rng);
    case CommandType.READ:
      return cmdRead(player, cmd.itemIndex, rng);
    case CommandType.AIM:
      return cmdAim(player, cmd.itemIndex, cmd.direction, rng);
    case CommandType.ZAP:
      return cmdZap(player, cmd.itemIndex, rng);

    // Inventory management
    case CommandType.PICKUP:
      return cmdPickup(player, chunk, rng);
    case CommandType.DROP:
      return cmdDrop(player, cmd.itemIndex, cmd.quantity);
    case CommandType.EQUIP:
      return cmdEquip(player, cmd.itemIndex);
    case CommandType.UNEQUIP:
      return cmdUnequip(player, cmd.itemIndex as EquipSlot);
    case CommandType.REST:
      return cmdRest(player, cmd.turns);

    // Magic
    case CommandType.CAST:
      return cmdCast(player, cmd.spellIndex, cmd.direction, rng);

    // UI-only (handled by game bridge, not core)
    case CommandType.BROWSE:
      return failResult(["Browse is handled by the UI layer."]);

    // Inscriptions
    case CommandType.INSCRIBE:
      return cmdInscribe(player, cmd.itemIndex, cmd.inscription);
    case CommandType.UNINSCRIBE: {
      const uObj = getInventoryItem(player, cmd.itemIndex);
      if (!uObj) return failResult(["You have nothing to uninscribe."]);
      uObj.note = 0;
      return successResult(0, ["Inscription removed."]);
    }
  }
}

// ── ALTER helper ──

/**
 * The "alter" command acts on whatever is in the given direction:
 * - Monster -> attack
 * - Closed door -> open
 * - Open door -> close
 * - Trap -> disarm
 * - Wall/rubble -> tunnel
 *
 * Port of do_cmd_alter from cmd-cave.c.
 */
function cmdAlter(
  player: Player,
  chunk: Chunk,
  dir: number,
  rng: RNG,
): CommandResult {
  const target = locSum(player.grid, directionOffset(dir));

  // Check bounds
  if (!chunkContains(chunk, target)) {
    return failResult(["You see nothing there."]);
  }

  const sq = chunk.squares[target.y]![target.x]!;

  // Monster -> attack
  if (sq.mon > (0 as MonsterId)) {
    return cmdAttack(player, chunk, target, rng);
  }

  // Closed door -> open
  if (squareIsClosedDoorSafe(chunk, target)) {
    return cmdOpen(player, chunk, dir, rng);
  }

  // Open door -> close
  if (squareIsOpenDoorSafe(chunk, target)) {
    return cmdClose(player, chunk, dir, rng);
  }

  // Trap -> disarm
  if (sq.trap !== null) {
    return cmdDisarm(player, chunk, dir, rng);
  }

  // Wall -> tunnel
  if (squareIsWallSafe(chunk, target)) {
    return cmdTunnel(player, chunk, dir, rng);
  }

  return failResult(["You see nothing to alter there."]);
}

// ── Safe predicate wrappers ──
// Feature info may not be initialized; return false rather than throwing.

function squareIsClosedDoorSafe(chunk: Chunk, atLoc: Loc): boolean {
  try { return squareIsClosedDoor(chunk, atLoc); } catch { return false; }
}

function squareIsOpenDoorSafe(chunk: Chunk, atLoc: Loc): boolean {
  try { return squareIsOpenDoor(chunk, atLoc); } catch { return false; }
}

function squareIsWallSafe(chunk: Chunk, atLoc: Loc): boolean {
  try { return squareIsWall(chunk, atLoc); } catch { return false; }
}
