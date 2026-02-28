/**
 * @file save/load.ts
 * @brief Load game from JSON
 *
 * Deserializes a SaveData structure back into a live GameState.
 * Platform-agnostic: accepts strings, performs no file I/O.
 *
 * Inspired by the block-based load system in savefile.c / load.c,
 * but operates on JSON instead of binary data.
 *
 * Copyright (c) 2024 Angband-TS Contributors
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import { BitFlag } from "../z/bitflag.js";
import type { Loc } from "../z/type.js";
import { RNG } from "../z/rand.js";
import { EventBus } from "../game/event.js";
import type { GameState, GameMessage } from "../game/state.js";
import type {
  Player,
  PlayerRace,
  PlayerClass,
  PlayerBody,
  PlayerEquipSlot,
  PlayerShape,
  PlayerState,
  PlayerUpkeep,
  Quest,
  ElementInfo,
} from "../types/player.js";
import type {
  Chunk,
  Square,
  FeatureId,
  MonsterId,
  ObjectId,
  TrapId,
} from "../types/cave.js";
import type { Monster, MonsterRace } from "../types/monster.js";
import type { ObjectType } from "../types/object.js";
import { createPlayerKnowledge } from "../object/knowledge.js";

import {
  SAVE_VERSION,
  type SaveData,
  type PlayerSaveData,
  type DungeonSaveData,
  type SquareSaveData,
  type MonsterSaveData,
  type ObjectSaveData,
  type BitFlagData,
  type LocData,
  type RngStateData,
  type ElementInfoData,
  type PlayerBodyData,
  type QuestData,
} from "./save.js";

// ── Error types ──

/** Error thrown when save data is invalid or incompatible. */
export class SaveLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveLoadError";
  }
}

// ── Deserialization helpers ──

/**
 * Reconstruct a BitFlag from a serialized number array.
 * The array contains raw byte values from the original Uint8Array.
 */
export function deserializeBitFlag(data: BitFlagData): BitFlag {
  const arr = new Uint8Array(data);
  return new BitFlag(arr);
}

/** Reconstruct a Loc from saved data. */
function deserializeLoc(data: LocData): Loc {
  return { x: data.x, y: data.y };
}

/** Reconstruct an ElementInfo from saved data. */
function deserializeElementInfo(data: ElementInfoData): ElementInfo {
  return {
    resLevel: data.resLevel,
    flags: deserializeBitFlag(data.flags),
  };
}

/** Reconstruct a Quest from saved data. */
function deserializeQuest(data: QuestData): Quest {
  return {
    index: data.index,
    name: data.name,
    level: data.level,
    curNum: data.curNum,
    maxNum: data.maxNum,
  };
}

/** Reconstruct a PlayerBody from saved data. */
function deserializePlayerBody(data: PlayerBodyData): PlayerBody {
  return {
    name: data.name,
    count: data.count,
    slots: data.slots.map(
      (s): PlayerEquipSlot => ({
        type: s.type,
        name: s.name,
      }),
    ),
  };
}

/** Reconstruct a Square from saved data. */
function deserializeSquare(data: SquareSaveData): Square {
  return {
    feat: data.feat as FeatureId,
    info: deserializeBitFlag(data.info),
    light: data.light,
    mon: data.mon as MonsterId,
    obj: data.obj as ObjectId | null,
    trap: data.trap as TrapId | null,
  };
}

/**
 * Create a minimal default PlayerState (all zeros/empty).
 * The real game recalculates this from equipment after load.
 */
function defaultPlayerState(): PlayerState {
  return {
    statAdd: [],
    statInd: [],
    statUse: [],
    statTop: [],
    skills: [],
    speed: 110,
    numBlows: 100,
    numShots: 10,
    numMoves: 0,
    ammoMult: 0,
    ammoTval: 0,
    ac: 0,
    damRed: 0,
    percDamRed: 0,
    toA: 0,
    toH: 0,
    toD: 0,
    seeInfra: 0,
    curLight: 0,
    heavyWield: false,
    heavyShoot: false,
    blessWield: false,
    cumberArmor: false,
    flags: new BitFlag(0),
    pflags: new BitFlag(0),
    elInfo: [],
  };
}

/**
 * Create a minimal default PlayerUpkeep (all defaults).
 * Transient state that is rebuilt during play.
 */
function defaultPlayerUpkeep(): PlayerUpkeep {
  return {
    playing: true,
    autosave: false,
    generateLevel: false,
    onlyPartial: false,
    dropping: false,
    energyUse: 0,
    newSpells: 0,
    notice: 0,
    update: 0,
    redraw: 0,
    commandWrk: 0,
    createUpStair: false,
    createDownStair: false,
    lightLevel: false,
    arenaLevel: false,
    resting: 0,
    running: 0,
    runningFirstStep: false,
    totalWeight: 0,
    invenCnt: 0,
    equipCnt: 0,
    quiverCnt: 0,
    rechargePow: 0,
    stepCount: 0,
    pathDest: { x: 0, y: 0 },
  };
}

/**
 * Create a placeholder PlayerRace from saved data.
 * In the real game, the race template would be looked up from the registry.
 */
function placeholderRace(data: PlayerSaveData): PlayerRace {
  return {
    name: data.raceName,
    ridx: data.raceRidx,
    hitDice: 0,
    expFactor: 0,
    baseAge: 0,
    modAge: 0,
    baseHeight: 0,
    modHeight: 0,
    baseWeight: 0,
    modWeight: 0,
    infra: 0,
    body: 0,
    statAdj: [],
    skills: [],
    flags: new BitFlag(0),
    pflags: new BitFlag(0),
    elInfo: [],
  };
}

/**
 * Create a placeholder PlayerClass from saved data.
 * In the real game, the class template would be looked up from the registry.
 */
function placeholderClass(data: PlayerSaveData): PlayerClass {
  return {
    name: data.className,
    cidx: data.classCidx,
    titles: [],
    statAdj: [],
    skills: [],
    extraSkills: [],
    hitDice: 0,
    expFactor: 0,
    flags: new BitFlag(0),
    pflags: new BitFlag(0),
    maxAttacks: 0,
    minWeight: 0,
    attMultiply: 0,
    startItems: [],
    magic: { spellFirst: 0, spellWeight: 0, numBooks: 0, books: [], totalSpells: 0 },
  };
}

// ── Reconstruction functions ──

/**
 * Reconstruct a Player from saved data.
 *
 * Uses placeholder race/class templates. In a full implementation,
 * these would be looked up from the loaded game data registry.
 *
 * @param data - Serialized player data.
 * @param raceResolver - Optional function to resolve race by name/ridx.
 * @param classResolver - Optional function to resolve class by name/cidx.
 */
export function loadPlayer(
  data: PlayerSaveData,
  raceResolver?: (name: string, ridx: number) => PlayerRace,
  classResolver?: (name: string, cidx: number) => PlayerClass,
): Player {
  const race = raceResolver !== undefined
    ? raceResolver(data.raceName, data.raceRidx)
    : placeholderRace(data);

  const cls = classResolver !== undefined
    ? classResolver(data.className, data.classCidx)
    : placeholderClass(data);

  return {
    race,
    class: cls,

    grid: deserializeLoc(data.grid),
    oldGrid: deserializeLoc(data.oldGrid),

    hitdie: data.hitdie,
    expfact: data.expfact,
    age: data.age,
    ht: data.ht,
    wt: data.wt,

    au: data.au,

    maxDepth: data.maxDepth,
    recallDepth: data.recallDepth,
    depth: data.depth,

    maxLev: data.maxLev,
    lev: data.lev,

    maxExp: data.maxExp,
    exp: data.exp,
    expFrac: data.expFrac,

    mhp: data.mhp,
    chp: data.chp,
    chpFrac: data.chpFrac,

    msp: data.msp,
    csp: data.csp,
    cspFrac: data.cspFrac,

    statMax: [...data.statMax],
    statCur: [...data.statCur],
    statMap: [...data.statMap],

    timed: [...data.timed],

    wordRecall: data.wordRecall,
    deepDescent: data.deepDescent,

    energy: data.energy,
    totalEnergy: data.totalEnergy,
    restingTurn: data.restingTurn,

    food: data.food,
    unignoring: data.unignoring,

    spellFlags: [...data.spellFlags],
    spellOrder: [...data.spellOrder],

    fullName: data.fullName,
    diedFrom: data.diedFrom,
    history: data.history,

    quests: data.quests.map(deserializeQuest),
    totalWinner: data.totalWinner,
    noscore: data.noscore,
    isDead: data.isDead,
    wizard: data.wizard,

    playerHp: [...data.playerHp],

    auBirth: data.auBirth,
    statBirth: [...data.statBirth],
    htBirth: data.htBirth,
    wtBirth: data.wtBirth,

    body: deserializePlayerBody(data.body),
    shape: null, // Shape resolved separately if needed

    state: defaultPlayerState(),
    knownState: defaultPlayerState(),
    upkeep: defaultPlayerUpkeep(),
    knowledge: createPlayerKnowledge(),
  };
}

/**
 * Reconstruct a Chunk from saved dungeon data.
 */
export function loadChunk(data: DungeonSaveData): Chunk {
  const squares: Square[][] = [];
  for (let y = 0; y < data.height; y++) {
    const row: Square[] = [];
    const savedRow = data.squares[y];
    if (savedRow !== undefined) {
      for (let x = 0; x < data.width; x++) {
        const sq = savedRow[x];
        if (sq !== undefined) {
          row.push(deserializeSquare(sq));
        }
      }
    }
    squares.push(row);
  }

  // Create empty heatmaps (rebuilt at runtime)
  const emptyHeatmap = {
    grids: Array.from({ length: data.height }, () => new Uint16Array(data.width)),
  };

  return {
    name: data.name,
    turn: data.turn,
    depth: data.depth,
    feeling: data.feeling,
    objRating: data.objRating,
    monRating: data.monRating,
    goodItem: data.goodItem,
    height: data.height,
    width: data.width,
    feelingSquares: data.feelingSquares,
    featCount: new Int32Array(32), // Rebuilt at runtime
    squares,
    noise: emptyHeatmap,
    scent: emptyHeatmap,
    decoy: { x: 0, y: 0 },
    objects: [],
    objMax: data.objMax,
    objectList: new Map(),
    monMax: data.monMax,
    monCnt: data.monCnt,
    monCurrent: 0,
    numRepro: 0,
    monsters: [],
    join: [],
  };
}

/**
 * Restore the RNG state from saved data.
 */
export function loadRngState(rng: RNG, data: RngStateData): void {
  const stateArray = new Uint32Array(data.STATE);
  rng.setState({ STATE: stateArray, state_i: data.state_i });
}

// ── Validation ──

/**
 * Parse a semantic version string into [major, minor, patch].
 * Returns null if the string is not a valid semver.
 */
function parseSemver(v: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (match === null) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Type guard that validates an unknown value as SaveData.
 *
 * Checks:
 * - Top-level structure has required fields
 * - Version string is present and compatible
 * - Player and dungeon sections are present
 *
 * @param data - Unknown data to validate.
 * @returns True if the data is a valid SaveData object.
 */
export function validateSaveData(data: unknown): data is SaveData {
  if (data === null || data === undefined || typeof data !== "object") {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Check version
  if (typeof obj["version"] !== "string") return false;
  const savedVersion = parseSemver(obj["version"] as string);
  const currentVersion = parseSemver(SAVE_VERSION);
  if (savedVersion === null || currentVersion === null) return false;

  // Major version must match exactly
  if (savedVersion[0] !== currentVersion[0]) return false;

  // Saved minor version must not exceed current (forward compat)
  if (savedVersion[1] > currentVersion[1]) return false;

  // Check required top-level fields
  if (typeof obj["turn"] !== "number") return false;
  if (typeof obj["depth"] !== "number") return false;

  // Check player section exists
  if (obj["player"] === null || obj["player"] === undefined || typeof obj["player"] !== "object") {
    return false;
  }
  const p = obj["player"] as Record<string, unknown>;
  if (typeof p["fullName"] !== "string") return false;
  if (typeof p["lev"] !== "number") return false;

  // Check dungeon section exists
  if (obj["dungeon"] === null || obj["dungeon"] === undefined || typeof obj["dungeon"] !== "object") {
    return false;
  }
  const d = obj["dungeon"] as Record<string, unknown>;
  if (typeof d["height"] !== "number") return false;
  if (typeof d["width"] !== "number") return false;

  // Check rngState exists
  if (obj["rngState"] === null || obj["rngState"] === undefined || typeof obj["rngState"] !== "object") {
    return false;
  }

  // Check messages is an array
  if (!Array.isArray(obj["messages"])) return false;

  return true;
}

// ── Main load functions ──

/**
 * Load a game from a validated SaveData structure.
 *
 * Reconstructs the GameState including player, dungeon, RNG state,
 * and message history. Transient state (eventBus, upkeep, computed
 * player state) is created fresh.
 *
 * @param data - Validated save data.
 * @param rng - RNG instance to restore state into.
 * @returns A reconstructed GameState.
 * @throws SaveLoadError if the data is structurally invalid.
 */
export function loadGame(data: SaveData, rng: RNG): GameState {
  if (!validateSaveData(data)) {
    throw new SaveLoadError("Invalid save data structure");
  }

  // Restore RNG state
  loadRngState(rng, data.rngState);

  // Reconstruct player
  const player = loadPlayer(data.player);

  // Reconstruct dungeon
  const chunk = loadChunk(data.dungeon);

  // Build the game state
  const state: GameState = {
    player,
    chunk,
    depth: data.depth,
    turn: data.turn,
    running: data.running,
    resting: data.resting,
    dead: data.dead,
    won: data.won,
    messages: [...data.messages],
    maxMessages: 2048,
    eventBus: new EventBus(),
    rng,
    monsters: chunk.monsters ?? [],
    monsterRaces: [],
    objectKinds: [],
    artifacts: [],
    egoItems: [],
    brands: [],
    slays: [],
    stores: [],
  };

  return state;
}

/**
 * Parse a JSON string and load the game state.
 *
 * @param json - A JSON string containing SaveData.
 * @param rng - RNG instance to restore state into.
 * @returns A reconstructed GameState.
 * @throws SaveLoadError if the JSON is malformed or data is invalid.
 */
export function loadGameFromJSON(json: string, rng: RNG): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SaveLoadError("Malformed JSON in save file");
  }

  if (!validateSaveData(parsed)) {
    throw new SaveLoadError("Save data failed validation");
  }

  return loadGame(parsed, rng);
}
