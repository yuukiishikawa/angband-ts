/**
 * @file types/cave.ts
 * @brief Cave/Dungeon type definitions — Square, Chunk, and related types
 *
 * Port of cave.h — the core dungeon data structures.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Loc, BitFlag } from "../z/index.js";
import type { Monster } from "./monster.js";

// ── Branded numeric ID types ──

/**
 * Branded type for monster indices.
 * In the C original: `int16_t mon` in struct square.
 */
export type MonsterId = number & { readonly __brand: "MonsterId" };

/**
 * Branded type for object indices.
 * Used for referencing objects in `Chunk.objects`.
 */
export type ObjectId = number & { readonly __brand: "ObjectId" };

/**
 * Branded type for feature (terrain) indices.
 * In the C original: `uint8_t feat` in struct square.
 */
export type FeatureId = number & { readonly __brand: "FeatureId" };

/**
 * Branded type for trap indices.
 */
export type TrapId = number & { readonly __brand: "TrapId" };

// ── Square flags (from list-square-flags.h) ──

/**
 * Flags stored per-square in the info bitflag array.
 *
 * These correspond to the SQUARE_xxx enum in cave.h, generated from
 * list-square-flags.h. Values start at 1 (NONE=0 is unused sentinel).
 *
 * Used with BitFlag: `sqinfo.has(SquareFlag.MARK)`.
 */
export const enum SquareFlag {
  NONE = 0,
  /** Square has been memorized by the player */
  MARK = 1,
  /** Square is self-illuminating */
  GLOW = 2,
  /** Square is part of a vault */
  VAULT = 3,
  /** Square is part of a room */
  ROOM = 4,
  /** Square is currently seen by the player */
  SEEN = 5,
  /** Square is in the player's field of view */
  VIEW = 6,
  /** Square was previously seen (used during view updates) */
  WASSEEN = 7,
  /** Hidden point that triggers level feelings */
  FEEL = 8,
  /** Square contains a known trap */
  TRAP = 9,
  /** Square contains an unknown (invisible) trap */
  INVIS = 10,
  /** Inner wall generation flag */
  WALL_INNER = 11,
  /** Outer wall generation flag */
  WALL_OUTER = 12,
  /** Solid wall generation flag */
  WALL_SOLID = 13,
  /** No random monster placement allowed */
  MON_RESTRICT = 14,
  /** Player cannot teleport from this square */
  NO_TELEPORT = 15,
  /** Square cannot be magically mapped */
  NO_MAP = 16,
  /** Telepathy does not work on this square */
  NO_ESP = 17,
  /** Marked for projection processing */
  PROJECT = 18,
  /** Trap detection has been applied to this square */
  DTRAP = 19,
  /** Square is not suitable for placing stairs */
  NO_STAIRS = 20,
  /** Square is seen and in player's light or UNLIGHT detection radius */
  CLOSE_PLAYER = 21,

  /** Total number of square flags (exclusive upper bound) */
  MAX = 22,
}

// ── Terrain flags (from list-terrain-flags.h) ──

/**
 * Flags describing properties of terrain feature types.
 *
 * These correspond to the TF_xxx enum in cave.h, generated from
 * list-terrain-flags.h.
 *
 * Stored in `FeatureType.flags` and queried with `tf_has()` in C.
 */
export const enum TerrainFlag {
  NONE = 0,
  /** Allows line of sight */
  LOS = 1,
  /** Allows projections to pass through */
  PROJECT = 2,
  /** Can be passed through by all creatures */
  PASSABLE = 3,
  /** Is noticed on looking around */
  INTERESTING = 4,
  /** Is permanent (cannot be altered) */
  PERMANENT = 5,
  /** Is easily passed through */
  EASY = 6,
  /** Can hold a trap */
  TRAP = 7,
  /** Cannot store scent */
  NO_SCENT = 8,
  /** No flow through */
  NO_FLOW = 9,
  /** Can hold objects */
  OBJECT = 10,
  /** Becomes bright when torch-lit */
  TORCH = 11,
  /** Can be found by searching */
  HIDDEN = 12,
  /** Contains treasure */
  GOLD = 13,
  /** Can be closed */
  CLOSABLE = 14,
  /** Is a clear floor */
  FLOOR = 15,
  /** Is a solid wall */
  WALL = 16,
  /** Is rocky */
  ROCK = 17,
  /** Is a granite rock wall */
  GRANITE = 18,
  /** Is any door */
  DOOR_ANY = 19,
  /** Is a closed door */
  DOOR_CLOSED = 20,
  /** Is a shop entrance */
  SHOP = 21,
  /** Is a jammed door */
  DOOR_JAMMED = 22,
  /** Is a locked door */
  DOOR_LOCKED = 23,
  /** Is a magma seam */
  MAGMA = 24,
  /** Is a quartz seam */
  QUARTZ = 25,
  /** Is a staircase */
  STAIR = 26,
  /** Is an up staircase */
  UPSTAIR = 27,
  /** Is a down staircase */
  DOWNSTAIR = 28,
  /** Should have smooth boundaries */
  SMOOTH = 29,
  /** Is internally lit */
  BRIGHT = 30,
  /** Is fire-based */
  FIERY = 31,

  /** Total number of terrain flags (exclusive upper bound) */
  MAX = 32,
}

// ── Feature (terrain) index constants (from list-terrain.h) ──

/**
 * Well-known terrain feature indices, matching FEAT_xxx in the C source.
 *
 * The full list is loaded from `terrain.txt` at runtime, but these
 * compile-time constants cover the built-in features in list-terrain.h.
 */
export const enum Feat {
  NONE = 0,
  FLOOR = 1,
  CLOSED = 2,
  OPEN = 3,
  BROKEN = 4,
  LESS = 5,
  MORE = 6,
  STORE_GENERAL = 7,
  STORE_ARMOR = 8,
  STORE_WEAPON = 9,
  STORE_BOOK = 10,
  STORE_ALCHEMY = 11,
  STORE_MAGIC = 12,
  STORE_BLACK = 13,
  HOME = 14,
  SECRET = 15,
  RUBBLE = 16,
  MAGMA = 17,
  QUARTZ = 18,
  MAGMA_K = 19,
  QUARTZ_K = 20,
  GRANITE = 21,
  PERM = 22,
  LAVA = 23,
  PASS_RUBBLE = 24,

  /** Total number of built-in features (exclusive upper bound) */
  MAX = 25,
}

// ── Grid light level (from cave.h enum grid_light_level) ──

/**
 * Lighting state of a grid for rendering purposes.
 *
 * Corresponds to `enum grid_light_level` in cave.h.
 */
export const enum GridLightLevel {
  /** Line of sight (brightest) */
  LOS = 0,
  /** Lit by player's torch */
  TORCH = 1,
  /** Permanently lit area (not in line of sight) */
  LIT = 2,
  /** Dark area */
  DARK = 3,

  MAX = 4,
}

// ── Direction constants (from cave.h) ──

/**
 * Movement/targeting directions.
 *
 * Numpad layout: 7=NW 8=N 9=NE / 4=W 5=none 6=E / 1=SW 2=S 3=SE.
 */
export const enum Direction {
  UNKNOWN = 0,
  SW = 1,
  S = 2,
  SE = 3,
  W = 4,
  /** Also DIR_TARGET — target/no movement */
  NONE = 5,
  E = 6,
  NW = 7,
  N = 8,
  NE = 9,
}

// ── Core data structures ──

/**
 * A single map tile.
 *
 * Corresponds to `struct square` in cave.h.
 * Each square has a terrain type, info flags, light level, and references
 * to the monster, objects, and traps occupying it.
 */
export interface Square {
  /** Terrain feature index (indexes into feature array) */
  feat: FeatureId;
  /** Per-square info flags (MARK, GLOW, VAULT, ROOM, etc.) */
  readonly info: BitFlag;
  /** Ambient light level (cumulative from adjacent light sources) */
  light: number;
  /** Monster occupying this square (0 = none, negative = player) */
  mon: MonsterId;
  /** Index of first object on this square (linked list head), or null */
  obj: ObjectId | null;
  /** Index of first trap on this square, or null */
  trap: TrapId | null;
}

/**
 * Heatmap for noise/scent propagation.
 *
 * Corresponds to `struct heatmap` in cave.h.
 * A 2D grid of uint16 values used by the monster AI flow system.
 */
export interface Heatmap {
  /** 2D grid of values, indexed as grids[y][x] */
  readonly grids: Uint16Array[];
}

/**
 * Connector for linking persistent dungeon levels.
 *
 * Corresponds to `struct connector` in cave.h.
 * Used during dungeon generation to connect adjacent persistent levels.
 */
export interface Connector {
  /** Grid location of the connector */
  readonly grid: Loc;
  /** Terrain feature at this connector */
  readonly feat: FeatureId;
  /** Square info flags for the connector */
  readonly info: BitFlag;
}

/**
 * A dungeon level — the main level container.
 *
 * Corresponds to `struct chunk` in cave.h.
 * Holds the complete state of a dungeon level: terrain grid, monsters,
 * objects, and metadata.
 */
export interface Chunk {
  /** Level name (e.g. "Town", "Level 50") */
  name: string;
  /** Game turn when this level was generated */
  turn: number;
  /** Dungeon depth (0 = town) */
  depth: number;

  // ── Level feeling / rating ──

  /** Level feeling (0..9, determined by ratings) */
  feeling: number;
  /** Cumulative object quality rating */
  objRating: number;
  /** Cumulative monster danger rating */
  monRating: number;
  /** Whether the level contains a good item (for feeling calc) */
  goodItem: boolean;

  // ── Dimensions ──

  /** Number of rows (y-axis) */
  readonly height: number;
  /** Number of columns (x-axis) */
  readonly width: number;

  // ── Grid data ──

  /**
   * Number of feeling squares the player has visited.
   * After enough visits the level feeling is revealed.
   */
  feelingSquares: number;
  /** Count of each feature type present on the level */
  readonly featCount: Int32Array;
  /**
   * The grid of squares, indexed as squares[y][x].
   * This is the primary map data.
   */
  readonly squares: Square[][];
  /** Noise propagation heatmap (for monster pathfinding) */
  readonly noise: Heatmap;
  /** Scent propagation heatmap (for monster tracking) */
  readonly scent: Heatmap;
  /** Location of the active decoy, or null if none */
  decoy: Loc;

  // ── Object tracking ──

  /**
   * Object pool indexed by ObjectId.
   * Slot 0 is unused; valid range is [1..objMax).
   */
  readonly objects: (ObjectId | null)[];
  /** High-water mark for the objects array */
  objMax: number;

  // ── Monster tracking ──

  /** Maximum number of monster slots allocated */
  monMax: number;
  /** Current number of living monsters */
  monCnt: number;
  /** Index of the monster currently being processed (turn loop) */
  monCurrent: number;
  /** Count of breeders (for reproduction cap) */
  numRepro: number;

  // ── Monster instances ──

  /** Live monster instances on this level (populated during generation). */
  monsters: Monster[];

  // ── Floor objects (actual ObjectType instances) ──

  /**
   * Map from ObjectId to actual ObjectType instances on this level.
   * Keyed by the same ObjectId stored in Square.obj.
   */
  readonly objectList: Map<number, import("./object.js").ObjectType>;

  // ── Level connectors (for persistent levels) ──

  /** Linked list of connectors to adjacent levels */
  readonly join: Connector[];
}

/**
 * Terrain feature type definition.
 *
 * Corresponds to `struct feature` in cave.h.
 * Loaded from `terrain.txt` at startup. Describes the properties of a
 * terrain type (floor, wall, door, etc.).
 */
export interface FeatureType {
  /** Display name (e.g. "open floor", "granite wall") */
  readonly name: string;
  /** Long description */
  readonly desc: string;
  /** Feature index (position in the f_info array) */
  readonly fidx: FeatureId;

  /**
   * Feature to mimic visually, or null.
   * Secret doors mimic the surrounding wall type.
   */
  readonly mimic: FeatureId | null;
  /** Display priority (higher = drawn on top) */
  readonly priority: number;

  /** Shop number this feature leads to (0 = not a shop) */
  readonly shopnum: number;
  /** Digging difficulty (0 = cannot dig) */
  readonly dig: number;

  /** Terrain property flags (LOS, PASSABLE, WALL, etc.) */
  readonly flags: BitFlag;

  /** Default display attribute (color) */
  readonly dAttr: number;
  /** Default display character */
  readonly dChar: string;

  /** Message when player walks into this terrain */
  readonly walkMsg: string;
  /** Message when player runs into this terrain */
  readonly runMsg: string;
  /** Message when player is hurt by this terrain */
  readonly hurtMsg: string;
  /** Message when player dies to this terrain */
  readonly dieMsg: string;
  /** Message when a confused monster moves into this terrain */
  readonly confusedMsg: string;
  /** Prefix for name in look result (e.g. "a", "an") */
  readonly lookPrefix: string;
  /** Preposition in look result when standing on this terrain */
  readonly lookInPreposition: string;
  /**
   * Monster resist flag index required to enter this terrain.
   * -1 if no resistance needed.
   */
  readonly resistFlag: number;
}

/**
 * Visual information about a grid for map rendering.
 *
 * Corresponds to `struct grid_data` in cave.h.
 * Produced by `map_info()` — combines terrain, monster, object, and
 * lighting data for a single tile as the player should see it.
 */
export interface GridData {
  /** Monster index at this grid (0 = none) */
  readonly mIdx: MonsterId;
  /** Feature index at this grid */
  readonly fIdx: FeatureId;
  /** Object kind index of the first item on the grid, or null */
  readonly firstKindIdx: number | null;
  /** Trap index at this grid, or null */
  readonly trap: TrapId | null;
  /** Whether more than one object is present */
  readonly multipleObjects: boolean;
  /** Whether there is an unaware/unseen object */
  readonly unseenObject: boolean;
  /** Whether there is unaware/unseen money */
  readonly unseenMoney: boolean;
  /** Current lighting state */
  readonly lighting: GridLightLevel;
  /** Whether the player can currently see this grid */
  readonly inView: boolean;
  /** Whether the player is standing on this grid */
  readonly isPlayer: boolean;
  /** Whether the player is hallucinating */
  readonly hallucinate: boolean;
}

// ── Dungeon generation enums (from generate.h) ──

/**
 * Dungeon allocation placement sets, used with `allocObject()`.
 *
 * Corresponds to the SET_xxx enum in generate.h.
 */
export const enum AllocSet {
  /** Place in corridors only */
  CORR = 0x01,
  /** Place in rooms only */
  ROOM = 0x02,
  /** Place anywhere */
  BOTH = 0x03,
}

/**
 * Dungeon allocation object types, used with `allocObject()`.
 *
 * Corresponds to the TYP_xxx enum in generate.h.
 */
export const enum AllocType {
  RUBBLE = 0,
  TRAP = 1,
  GOLD = 2,
  OBJECT = 3,
  GOOD = 4,
  GREAT = 5,
}
