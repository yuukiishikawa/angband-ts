/**
 * @file save/save.ts
 * @brief Save game to JSON
 *
 * Serializes the game state into a JSON-compatible structure.
 * Platform-agnostic: returns strings, performs no file I/O.
 *
 * Inspired by the block-based save system in savefile.c / save.c,
 * but uses JSON instead of a binary format.
 *
 * Copyright (c) 2024 Angband-TS Contributors
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { BitFlag } from "../z/bitflag.js";
import type { Loc } from "../z/type.js";
import type { RNG } from "../z/rand.js";
import type { GameState, GameMessage } from "../game/state.js";
import type { Player, Quest, ElementInfo, PlayerBody } from "../types/player.js";
import type {
  Chunk,
  Square,
  FeatureId,
  MonsterId,
  ObjectId,
} from "../types/cave.js";
import type { Monster } from "../types/monster.js";
import type {
  ObjectType,
  CurseData,
  ObjectOrigin,
  TVal,
  SVal,
} from "../types/object.js";

// ── Save format version ──

/** Current save format version. Increment on breaking changes. */
export const SAVE_VERSION = "1.0.0";

/**
 * Maximum number of messages preserved in a save file.
 * Keeps save files manageable while retaining enough context.
 */
export const SAVE_MAX_MESSAGES = 200;

// ── Serializable data interfaces ──

/** Serialized BitFlag: array of raw byte values from the underlying Uint8Array. */
export type BitFlagData = number[];

/** Serialized Loc. */
export interface LocData {
  readonly x: number;
  readonly y: number;
}

/** Serialized RNG state for deterministic resume. */
export interface RngStateData {
  /** WELL1024a state array (32 uint32 values). */
  readonly STATE: number[];
  /** Current state index. */
  readonly state_i: number;
}

/** Serialized element info. */
export interface ElementInfoData {
  readonly resLevel: number;
  readonly flags: BitFlagData;
}

/** Serialized quest data. */
export interface QuestData {
  readonly index: number;
  readonly name: string;
  readonly level: number;
  readonly curNum: number;
  readonly maxNum: number;
}

/** Serialized player body layout. */
export interface PlayerBodyData {
  readonly name: string;
  readonly count: number;
  readonly slots: readonly { readonly type: number; readonly name: string }[];
}

/** Serialized player data (saveable fields only). */
export interface PlayerSaveData {
  readonly raceName: string;
  readonly raceRidx: number;
  readonly className: string;
  readonly classCidx: number;

  readonly grid: LocData;
  readonly oldGrid: LocData;

  readonly hitdie: number;
  readonly expfact: number;
  readonly age: number;
  readonly ht: number;
  readonly wt: number;

  readonly au: number;

  readonly maxDepth: number;
  readonly recallDepth: number;
  readonly depth: number;

  readonly maxLev: number;
  readonly lev: number;

  readonly maxExp: number;
  readonly exp: number;
  readonly expFrac: number;

  readonly mhp: number;
  readonly chp: number;
  readonly chpFrac: number;

  readonly msp: number;
  readonly csp: number;
  readonly cspFrac: number;

  readonly statMax: number[];
  readonly statCur: number[];
  readonly statMap: number[];

  readonly timed: number[];

  readonly wordRecall: number;
  readonly deepDescent: number;

  readonly energy: number;
  readonly totalEnergy: number;
  readonly restingTurn: number;

  readonly food: number;
  readonly unignoring: number;

  readonly spellFlags: number[];
  readonly spellOrder: number[];

  readonly fullName: string;
  readonly diedFrom: string;
  readonly history: string;

  readonly quests: QuestData[];
  readonly totalWinner: boolean;
  readonly noscore: number;
  readonly isDead: boolean;
  readonly wizard: boolean;

  readonly playerHp: number[];

  readonly auBirth: number;
  readonly statBirth: number[];
  readonly htBirth: number;
  readonly wtBirth: number;

  readonly body: PlayerBodyData;
  readonly shapeName: string | null;
}

/** Serialized square data. */
export interface SquareSaveData {
  readonly feat: number;
  readonly info: BitFlagData;
  readonly light: number;
  readonly mon: number;
  readonly obj: number | null;
  readonly trap: number | null;
}

/** Serialized monster data. */
export interface MonsterSaveData {
  readonly raceRidx: number;
  readonly raceName: string;
  readonly originalRaceRidx: number | null;
  readonly midx: number;
  readonly grid: LocData;
  readonly hp: number;
  readonly maxhp: number;
  readonly mTimed: number[];
  readonly mspeed: number;
  readonly energy: number;
  readonly cdis: number;
  readonly mflag: BitFlagData;
  readonly mimickedObjIdx: number;
  readonly heldObjIdx: number;
  readonly attr: number;
  readonly target: { readonly grid: LocData; readonly midx: number };
  readonly groupInfo: readonly { readonly index: number; readonly role: number }[];
  readonly minRange: number;
  readonly bestRange: number;
}

/** Serialized object instance data. */
export interface ObjectSaveData {
  readonly oidx: number;
  readonly grid: LocData;
  readonly tval: number;
  readonly sval: number;
  readonly pval: number;
  readonly weight: number;
  readonly dd: number;
  readonly ds: number;
  readonly ac: number;
  readonly toA: number;
  readonly toH: number;
  readonly toD: number;
  readonly flags: BitFlagData;
  readonly modifiers: number[];
  readonly elInfo: ElementInfoData[];
  readonly brands: boolean[] | null;
  readonly slays: boolean[] | null;
  readonly curses: CurseData[] | null;
  readonly timeout: number;
  readonly number: number;
  readonly notice: number;
  readonly heldMIdx: number;
  readonly mimickingMIdx: number;
  readonly origin: number;
  readonly originDepth: number;
  readonly originRace: number | null;
  readonly note: number;
  readonly kindName: string | null;
  readonly egoName: string | null;
  readonly artifactName: string | null;
}

/** Serialized dungeon data. */
export interface DungeonSaveData {
  readonly name: string;
  readonly turn: number;
  readonly depth: number;
  readonly feeling: number;
  readonly objRating: number;
  readonly monRating: number;
  readonly goodItem: boolean;
  readonly height: number;
  readonly width: number;
  readonly feelingSquares: number;
  readonly squares: SquareSaveData[][];
  readonly monsters: MonsterSaveData[];
  readonly objects: ObjectSaveData[];
  readonly monMax: number;
  readonly monCnt: number;
  readonly objMax: number;
}

/** Complete savefile data. */
export interface SaveData {
  readonly version: string;
  readonly player: PlayerSaveData;
  readonly dungeon: DungeonSaveData;
  readonly depth: number;
  readonly turn: number;
  readonly rngState: RngStateData;
  readonly messages: GameMessage[];
  readonly running: boolean;
  readonly resting: number;
  readonly dead: boolean;
  readonly won: boolean;
}

// ── Serialization helpers ──

/**
 * Serialize a BitFlag to a plain number array (raw byte values).
 * This preserves the exact bit pattern for reconstruction.
 */
export function serializeBitFlag(flag: BitFlag): BitFlagData {
  return Array.from(flag.data);
}

/** Serialize a Loc to a plain object. */
function serializeLoc(l: Loc): LocData {
  return { x: l.x, y: l.y };
}

/** Serialize ElementInfo, converting its BitFlag. */
function serializeElementInfo(ei: ElementInfo): ElementInfoData {
  return {
    resLevel: ei.resLevel,
    flags: serializeBitFlag(ei.flags),
  };
}

/** Serialize a Quest. */
function serializeQuest(q: Quest): QuestData {
  return {
    index: q.index,
    name: q.name,
    level: q.level,
    curNum: q.curNum,
    maxNum: q.maxNum,
  };
}

/** Serialize the player body layout. */
function serializePlayerBody(body: PlayerBody): PlayerBodyData {
  return {
    name: body.name,
    count: body.count,
    slots: body.slots.map((s) => ({ type: s.type, name: s.name })),
  };
}

/** Serialize a Square. */
function serializeSquare(sq: Square): SquareSaveData {
  return {
    feat: sq.feat as number,
    info: serializeBitFlag(sq.info),
    light: sq.light,
    mon: sq.mon as number,
    obj: sq.obj as number | null,
    trap: sq.trap as number | null,
  };
}

/** Serialize a Monster instance. */
function serializeMonster(m: Monster): MonsterSaveData {
  return {
    raceRidx: m.race.ridx as number,
    raceName: m.race.name,
    originalRaceRidx:
      m.originalRace !== null ? (m.originalRace.ridx as number) : null,
    midx: m.midx as number,
    grid: serializeLoc(m.grid),
    hp: m.hp,
    maxhp: m.maxhp,
    mTimed: Array.from(m.mTimed),
    mspeed: m.mspeed,
    energy: m.energy,
    cdis: m.cdis,
    mflag: serializeBitFlag(m.mflag),
    mimickedObjIdx: m.mimickedObjIdx,
    heldObjIdx: m.heldObjIdx,
    attr: m.attr,
    target: {
      grid: serializeLoc(m.target.grid),
      midx: m.target.midx as number,
    },
    groupInfo: m.groupInfo.map((gi) => ({
      index: gi.index,
      role: gi.role as number,
    })),
    minRange: m.minRange,
    bestRange: m.bestRange,
  };
}

/** Serialize an ObjectType instance. */
function serializeObject(obj: ObjectType): ObjectSaveData {
  return {
    oidx: obj.oidx as number,
    grid: serializeLoc(obj.grid),
    tval: obj.tval as number,
    sval: obj.sval as number,
    pval: obj.pval,
    weight: obj.weight,
    dd: obj.dd,
    ds: obj.ds,
    ac: obj.ac,
    toA: obj.toA,
    toH: obj.toH,
    toD: obj.toD,
    flags: serializeBitFlag(obj.flags),
    modifiers: [...obj.modifiers],
    elInfo: obj.elInfo.map(serializeElementInfo),
    brands: obj.brands !== null ? [...obj.brands] : null,
    slays: obj.slays !== null ? [...obj.slays] : null,
    curses:
      obj.curses !== null
        ? obj.curses.map((c) => ({ power: c.power, timeout: c.timeout }))
        : null,
    timeout: obj.timeout,
    number: obj.number,
    notice: obj.notice,
    heldMIdx: obj.heldMIdx,
    mimickingMIdx: obj.mimickingMIdx,
    origin: obj.origin as number,
    originDepth: obj.originDepth,
    originRace: obj.originRace as number | null,
    note: obj.note as number,
    kindName: obj.kind !== null ? obj.kind.name : null,
    egoName: obj.ego !== null ? obj.ego.name : null,
    artifactName: obj.artifact !== null ? obj.artifact.name : null,
  };
}

/** Serialize the RNG state. */
function serializeRngState(rng: RNG): RngStateData {
  const state = rng.getState();
  return {
    STATE: Array.from(state.STATE),
    state_i: state.state_i,
  };
}

// ── Main save functions ──

/**
 * Collect all live monsters from the chunk.
 * Scans the squares grid for non-zero monster indices and collects unique entries.
 */
function collectMonsters(chunk: Chunk): Monster[] {
  // In the real game, monsters are tracked in a separate array on the chunk.
  // For serialization, we accept whatever Monster objects are referenced.
  // This function is a placeholder — the actual monsters must be provided
  // by the caller or accessed from a monster pool.
  // Since our Chunk type doesn't directly hold a Monster[] array,
  // we return an empty array and rely on external provision.
  return [];
}

/**
 * Collect all live objects from the chunk.
 * Similar to collectMonsters, objects in the real game are in a pool.
 */
function collectObjects(chunk: Chunk): ObjectType[] {
  return [];
}

/**
 * Serialize the complete game state into a SaveData structure.
 *
 * Strips transient data (eventBus, input provider, computed player state,
 * upkeep, monster AI heatmaps) and converts all BitFlags to number arrays.
 *
 * @param state - The current game state.
 * @param monsters - Live monster instances on the current level.
 * @param objects - Live object instances on the current level.
 * @returns A JSON-serializable SaveData snapshot.
 */
export function saveGame(
  state: GameState,
  monsters: Monster[] = [],
  objects: ObjectType[] = [],
): SaveData {
  const { player, chunk, rng } = state;

  const playerData: PlayerSaveData = {
    raceName: player.race.name,
    raceRidx: player.race.ridx,
    className: player.class.name,
    classCidx: player.class.cidx,

    grid: serializeLoc(player.grid),
    oldGrid: serializeLoc(player.oldGrid),

    hitdie: player.hitdie,
    expfact: player.expfact,
    age: player.age,
    ht: player.ht,
    wt: player.wt,

    au: player.au,

    maxDepth: player.maxDepth,
    recallDepth: player.recallDepth,
    depth: player.depth,

    maxLev: player.maxLev,
    lev: player.lev,

    maxExp: player.maxExp,
    exp: player.exp,
    expFrac: player.expFrac,

    mhp: player.mhp,
    chp: player.chp,
    chpFrac: player.chpFrac,

    msp: player.msp,
    csp: player.csp,
    cspFrac: player.cspFrac,

    statMax: [...player.statMax],
    statCur: [...player.statCur],
    statMap: [...player.statMap],

    timed: [...player.timed],

    wordRecall: player.wordRecall,
    deepDescent: player.deepDescent,

    energy: player.energy,
    totalEnergy: player.totalEnergy,
    restingTurn: player.restingTurn,

    food: player.food,
    unignoring: player.unignoring,

    spellFlags: [...player.spellFlags],
    spellOrder: [...player.spellOrder],

    fullName: player.fullName,
    diedFrom: player.diedFrom,
    history: player.history,

    quests: player.quests.map(serializeQuest),
    totalWinner: player.totalWinner,
    noscore: player.noscore,
    isDead: player.isDead,
    wizard: player.wizard,

    playerHp: [...player.playerHp],

    auBirth: player.auBirth,
    statBirth: [...player.statBirth],
    htBirth: player.htBirth,
    wtBirth: player.wtBirth,

    body: serializePlayerBody(player.body),
    shapeName: player.shape !== null ? player.shape.name : null,
  };

  // Serialize terrain grid
  const squaresData: SquareSaveData[][] = [];
  for (let y = 0; y < chunk.height; y++) {
    const row: SquareSaveData[] = [];
    const chunkRow = chunk.squares[y];
    if (chunkRow !== undefined) {
      for (let x = 0; x < chunk.width; x++) {
        const sq = chunkRow[x];
        if (sq !== undefined) {
          row.push(serializeSquare(sq));
        }
      }
    }
    squaresData.push(row);
  }

  const dungeonData: DungeonSaveData = {
    name: chunk.name,
    turn: chunk.turn,
    depth: chunk.depth,
    feeling: chunk.feeling,
    objRating: chunk.objRating,
    monRating: chunk.monRating,
    goodItem: chunk.goodItem,
    height: chunk.height,
    width: chunk.width,
    feelingSquares: chunk.feelingSquares,
    squares: squaresData,
    monsters: monsters.map(serializeMonster),
    objects: objects.map(serializeObject),
    monMax: chunk.monMax,
    monCnt: chunk.monCnt,
    objMax: chunk.objMax,
  };

  // Trim messages to save only the most recent ones
  const recentMessages = state.messages.slice(-SAVE_MAX_MESSAGES);

  return {
    version: SAVE_VERSION,
    player: playerData,
    dungeon: dungeonData,
    depth: state.depth,
    turn: state.turn,
    rngState: serializeRngState(rng),
    messages: recentMessages,
    running: state.running,
    resting: state.resting,
    dead: state.dead,
    won: state.won,
  };
}

/**
 * Serialize the game state to a formatted JSON string.
 *
 * @param state - The current game state.
 * @param monsters - Live monster instances on the current level.
 * @param objects - Live object instances on the current level.
 * @returns A JSON string with 2-space indentation.
 */
export function saveGameToJSON(
  state: GameState,
  monsters: Monster[] = [],
  objects: ObjectType[] = [],
): string {
  const saveData = saveGame(state, monsters, objects);
  return JSON.stringify(saveData, null, 2);
}
