/**
 * @file display.ts
 * @brief Game display renderer — maps game state to the virtual terminal
 *
 * Port of ui-display.c / ui-map.c concepts. Renders the dungeon map,
 * sidebar, message area, and status line into a Terminal.
 *
 * This module is pure computation: it reads game state and writes to a
 * Terminal, with no I/O or DOM dependencies.
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import {
  COLOUR_WHITE,
  COLOUR_DARK,
  COLOUR_YELLOW,
  COLOUR_RED,
  COLOUR_GREEN,
  COLOUR_BLUE,
  COLOUR_ORANGE,
  COLOUR_L_DARK,
  COLOUR_L_WHITE,
  COLOUR_SLATE,
  COLOUR_UMBER,
  COLOUR_L_RED,
  COLOUR_L_GREEN,
  COLOUR_L_BLUE,
  COLOUR_VIOLET,
  COLOUR_L_UMBER,
} from "@angband/core";
import type { Terminal } from "./terminal.js";

// ── Local mirrors of const enum values from @angband/core ──
// const enums are erased at compile time and cannot be re-exported across
// module boundaries by bundlers (esbuild, swc). We define local constants
// mirroring the values from types/cave.ts and types/player.ts.

/** Feature indices (mirrors types.Feat). */
export const FEAT = {
  NONE: 0,
  FLOOR: 1,
  CLOSED: 2,
  OPEN: 3,
  BROKEN: 4,
  LESS: 5,
  MORE: 6,
  STORE_GENERAL: 7,
  STORE_ARMOR: 8,
  STORE_WEAPON: 9,
  STORE_BOOK: 10,
  STORE_ALCHEMY: 11,
  STORE_MAGIC: 12,
  STORE_BLACK: 13,
  HOME: 14,
  SECRET: 15,
  RUBBLE: 16,
  MAGMA: 17,
  QUARTZ: 18,
  MAGMA_K: 19,
  QUARTZ_K: 20,
  GRANITE: 21,
  PERM: 22,
  LAVA: 23,
  PASS_RUBBLE: 24,
} as const;

/** Square info flags (mirrors types.SquareFlag). */
export const SQUARE_FLAG = {
  NONE: 0,
  MARK: 1,
  GLOW: 2,
  VAULT: 3,
  ROOM: 4,
  SEEN: 5,
  VIEW: 6,
} as const;

/** Timed effect indices (mirrors types.TimedEffect). */
export const TIMED_EFFECT = {
  FAST: 0,
  SLOW: 1,
  BLIND: 2,
  PARALYZED: 3,
  CONFUSED: 4,
  AFRAID: 5,
  IMAGE: 6,
  POISONED: 7,
  CUT: 8,
  STUN: 9,
  FOOD: 10,
  PROTEVIL: 11,
  INVULN: 12,
  HERO: 13,
  SHERO: 14,
  SHIELD: 15,
  BLESSED: 16,
  SINVIS: 17,
} as const;

// ── Type imports (type-only, no runtime dependency on const enums) ──

// Minimal structural types for what the renderer needs from the game.
// These avoid importing branded types and the full Chunk/Player interfaces
// while remaining compatible with them.

/** Minimal square info interface — only needs has(flag) for SEEN/MARK. */
interface SquareInfo {
  has(flag: number): boolean;
}

/** Minimal square for rendering. */
interface RenderSquare {
  readonly feat: number;
  readonly info: SquareInfo;
  readonly mon: number;
  readonly obj: unknown | null;
}

/** Minimal chunk for rendering. */
export interface RenderChunk {
  readonly height: number;
  readonly width: number;
  readonly squares: RenderSquare[][];
}

/** Minimal player for rendering. */
export interface RenderPlayer {
  readonly grid: { readonly x: number; readonly y: number };
  readonly fullName: string;
  readonly race: { readonly name: string };
  readonly class: { readonly name: string };
  readonly lev: number;
  readonly maxLev: number;
  readonly exp: number;
  readonly maxExp: number;
  readonly au: number;
  readonly depth: number;
  readonly mhp: number;
  readonly chp: number;
  readonly msp: number;
  readonly csp: number;
  readonly statCur: number[];
  readonly statMax: number[];
  readonly timed: number[];
  readonly state: {
    readonly speed: number;
    readonly ac: number;
    readonly toA: number;
  };
}

/** Minimal monster race for rendering. */
export interface RenderMonsterRace {
  readonly dChar: number;
  readonly dAttr: number;
}

/** Minimal feature type for rendering. */
export interface RenderFeatureType {
  readonly dChar: string;
  readonly dAttr: number;
}

// ── Display configuration ──

/**
 * Layout configuration for the game display.
 */
export interface DisplayConfig {
  /** Width of the map viewport in columns. */
  readonly mapWidth: number;
  /** Height of the map viewport in rows. */
  readonly mapHeight: number;
  /** Width of the right sidebar in columns. */
  readonly sidebarWidth: number;
  /** Number of lines reserved for message display at top. */
  readonly messageLines: number;
  /** Number of lines reserved for the status bar at bottom. */
  readonly statusLines: number;
}

/**
 * Standard Angband display layout (80x24 terminal).
 *
 * Layout:
 * - Row 0: message line
 * - Rows 1..21: map (21 rows) | sidebar (13 cols)
 * - Row 22: status line
 * - Row 23: prompt / input line
 */
export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  mapWidth: 66,
  mapHeight: 21,
  sidebarWidth: 13,
  messageLines: 1,
  statusLines: 2,
};

// ── Terrain display characters ──

/** Character and color for a terrain feature. */
export interface CharAttr {
  readonly char: string;
  readonly color: number;
}

/**
 * Standard ASCII characters for built-in terrain features.
 * Indexed by Feat enum value.
 */
const TERRAIN_CHARS: Record<number, CharAttr> = {
  [FEAT.NONE]:          { char: " ", color: COLOUR_DARK },
  [FEAT.FLOOR]:         { char: ".", color: COLOUR_WHITE },
  [FEAT.CLOSED]:        { char: "+", color: COLOUR_L_UMBER },
  [FEAT.OPEN]:          { char: "'", color: COLOUR_L_UMBER },
  [FEAT.BROKEN]:        { char: "'", color: COLOUR_UMBER },
  [FEAT.LESS]:          { char: "<", color: COLOUR_WHITE },
  [FEAT.MORE]:          { char: ">", color: COLOUR_WHITE },
  [FEAT.STORE_GENERAL]: { char: "1", color: COLOUR_L_UMBER },
  [FEAT.STORE_ARMOR]:   { char: "2", color: COLOUR_SLATE },
  [FEAT.STORE_WEAPON]:  { char: "3", color: COLOUR_L_WHITE },
  [FEAT.STORE_BOOK]:    { char: "4", color: COLOUR_RED },
  [FEAT.STORE_ALCHEMY]: { char: "5", color: COLOUR_BLUE },
  [FEAT.STORE_MAGIC]:   { char: "6", color: COLOUR_VIOLET },
  [FEAT.STORE_BLACK]:   { char: "7", color: COLOUR_L_DARK },
  [FEAT.HOME]:          { char: "8", color: COLOUR_YELLOW },
  [FEAT.SECRET]:        { char: "#", color: COLOUR_L_WHITE },
  [FEAT.RUBBLE]:        { char: ":", color: COLOUR_L_UMBER },
  [FEAT.MAGMA]:         { char: "#", color: COLOUR_SLATE },
  [FEAT.QUARTZ]:        { char: "#", color: COLOUR_L_WHITE },
  [FEAT.MAGMA_K]:       { char: "*", color: COLOUR_ORANGE },
  [FEAT.QUARTZ_K]:      { char: "*", color: COLOUR_L_WHITE },
  [FEAT.GRANITE]:       { char: "#", color: COLOUR_WHITE },
  [FEAT.PERM]:          { char: "#", color: COLOUR_WHITE },
  [FEAT.LAVA]:          { char: "#", color: COLOUR_RED },
  [FEAT.PASS_RUBBLE]:   { char: ".", color: COLOUR_L_UMBER },
};

/**
 * Get the display character and color for a terrain feature index.
 *
 * If a FeatureType is provided (from the loaded data files), its
 * dChar and dAttr are used. Otherwise falls back to the built-in
 * TERRAIN_CHARS table.
 */
export function getTerrainChar(feat: number, featureType?: RenderFeatureType): CharAttr {
  if (featureType) {
    return { char: featureType.dChar, color: featureType.dAttr };
  }
  const entry = TERRAIN_CHARS[feat];
  if (entry) return entry;
  return { char: "#", color: COLOUR_WHITE };
}

// ── Monster display characters ──

/**
 * Get the display character and color for a monster race.
 */
export function getMonsterChar(race: RenderMonsterRace): CharAttr {
  const char = String.fromCodePoint(race.dChar);
  return { char, color: race.dAttr };
}

// ── Object display characters ──

/**
 * Common object display characters by tval group.
 * These are simplified defaults; the real game reads from object_base.txt.
 */
const OBJECT_TVAL_CHARS: Record<number, CharAttr> = {
  // TV_SKELETON
  1: { char: "~", color: COLOUR_WHITE },
  // TV_LIGHT
  5: { char: "~", color: COLOUR_YELLOW },
  // TV_AMULET
  10: { char: '"', color: COLOUR_ORANGE },
  // TV_RING
  11: { char: "=", color: COLOUR_RED },
  // TV_STAFF
  12: { char: "_", color: COLOUR_L_UMBER },
  // TV_WAND
  13: { char: "-", color: COLOUR_L_BLUE },
  // TV_ROD
  14: { char: "-", color: COLOUR_SLATE },
  // TV_SCROLL
  15: { char: "?", color: COLOUR_WHITE },
  // TV_POTION
  16: { char: "!", color: COLOUR_L_BLUE },
  // TV_FLASK
  17: { char: "!", color: COLOUR_YELLOW },
  // TV_FOOD / TV_MUSHROOM
  18: { char: ",", color: COLOUR_L_UMBER },
  19: { char: ",", color: COLOUR_GREEN },
  // TV_MAGIC_BOOK
  20: { char: "?", color: COLOUR_RED },
  // TV_PRAYER_BOOK
  21: { char: "?", color: COLOUR_L_GREEN },
  // TV_NATURE_BOOK
  22: { char: "?", color: COLOUR_GREEN },
  // TV_SHADOW_BOOK
  23: { char: "?", color: COLOUR_L_DARK },
  // TV_OTHER_BOOK
  24: { char: "?", color: COLOUR_L_WHITE },
  // TV_GOLD
  100: { char: "$", color: COLOUR_YELLOW },
};

/**
 * Get the display character for an object.
 * If a full ObjectKind/ObjectType is available, use its dChar/dAttr.
 * Otherwise falls back to tval-based lookup.
 */
export function getObjectChar(obj: { tval: number; dChar?: string; dAttr?: number }): CharAttr {
  if (obj.dChar != null && obj.dAttr != null) {
    return { char: obj.dChar, color: obj.dAttr };
  }
  const entry = OBJECT_TVAL_CHARS[obj.tval];
  if (entry) return entry;
  return { char: "&", color: COLOUR_WHITE };
}

// ── Grid display priority ──

/**
 * Determine what to display at a grid position.
 *
 * Display priority (highest to lowest):
 * 1. Player (always '@')
 * 2. Visible monster
 * 3. Topmost visible object
 * 4. Terrain
 *
 * @param chunk - The dungeon level data
 * @param x - Grid x coordinate
 * @param y - Grid y coordinate
 * @param player - The player (for position check)
 * @param monsters - Optional monster lookup (index -> MonsterRace)
 * @param features - Optional feature lookup (feat index -> FeatureType)
 */
export function getGridDisplay(
  chunk: RenderChunk,
  x: number,
  y: number,
  player: RenderPlayer,
  monsters?: ReadonlyMap<number, RenderMonsterRace>,
  features?: ReadonlyMap<number, RenderFeatureType>,
): { char: string; fg: number; bg: number } {
  // Bounds check
  if (y < 0 || y >= chunk.height || x < 0 || x >= chunk.width) {
    return { char: " ", fg: COLOUR_DARK, bg: COLOUR_DARK };
  }

  const sq = chunk.squares[y]![x]!;

  // Check if player is at this position
  if (player.grid.x === x && player.grid.y === y) {
    return { char: "@", fg: COLOUR_WHITE, bg: COLOUR_DARK };
  }

  // Check for monster (mon > 0 means a monster is present)
  if (sq.mon > 0 && monsters) {
    const race = monsters.get(sq.mon);
    if (race) {
      const mc = getMonsterChar(race);
      return { char: mc.char, fg: mc.color, bg: COLOUR_DARK };
    }
  }

  // Check for object on the floor
  if (sq.obj != null) {
    // Without full object data, show a generic item marker
    return { char: "&", fg: COLOUR_YELLOW, bg: COLOUR_DARK };
  }

  // Terrain
  const feat = sq.feat;
  const featureType = features?.get(feat);
  const tc = getTerrainChar(feat, featureType);

  // Check if the square has been seen / is memorized
  const isSeen = sq.info.has(SQUARE_FLAG.SEEN);
  const isMark = sq.info.has(SQUARE_FLAG.MARK);

  if (!isSeen && !isMark) {
    // Never seen — show nothing
    return { char: " ", fg: COLOUR_DARK, bg: COLOUR_DARK };
  }

  // Seen or memorized — show terrain
  // Darken memorized-but-not-currently-seen squares
  const fg = isSeen ? tc.color : COLOUR_L_DARK;
  return { char: tc.char, fg, bg: COLOUR_DARK };
}

// ── Rendering functions ──

/**
 * Render the dungeon map onto the terminal.
 *
 * @param terminal - Target terminal
 * @param chunk - Dungeon level
 * @param player - Player (for @ position)
 * @param offsetX - Map viewport x offset (column in terminal where map starts)
 * @param offsetY - Map viewport y offset (row in terminal where map starts)
 * @param config - Display layout config
 * @param monsters - Optional monster race lookup
 * @param features - Optional feature type lookup
 */
export function renderMap(
  terminal: Terminal,
  chunk: RenderChunk,
  player: RenderPlayer,
  offsetX: number,
  offsetY: number,
  config: DisplayConfig = DEFAULT_DISPLAY_CONFIG,
  monsters?: ReadonlyMap<number, RenderMonsterRace>,
  features?: ReadonlyMap<number, RenderFeatureType>,
): void {
  // Center the map on the player
  const scrollX = Math.max(0, Math.min(
    chunk.width - config.mapWidth,
    player.grid.x - Math.floor(config.mapWidth / 2),
  ));
  const scrollY = Math.max(0, Math.min(
    chunk.height - config.mapHeight,
    player.grid.y - Math.floor(config.mapHeight / 2),
  ));

  for (let row = 0; row < config.mapHeight; row++) {
    const mapY = scrollY + row;
    for (let col = 0; col < config.mapWidth; col++) {
      const mapX = scrollX + col;
      const display = getGridDisplay(chunk, mapX, mapY, player, monsters, features);
      terminal.putChar(offsetX + col, offsetY + row, display.char, display.fg, display.bg);
    }
  }
}

/**
 * Render the right sidebar showing player stats.
 *
 * Layout (standard Angband sidebar):
 * - Line 0: Player name
 * - Line 1: Race / Class
 * - Line 2: Title
 * - Line 3: (blank)
 * - Line 4: Level
 * - Line 5: Experience
 * - Line 6: Gold
 * - Line 7: (blank)
 * - Line 8: STR, INT, WIS, DEX, CON
 * - Line 13: (blank)
 * - Line 14: AC
 * - Line 15: HP
 * - Line 16: MP
 * - Line 17: (blank)
 * - Line 18: Depth
 */
export function renderSidebar(
  terminal: Terminal,
  player: RenderPlayer,
  _state?: unknown,
): void {
  const x = terminal.width - 13;
  const y = 1;

  // Name
  terminal.putString(x, y, player.fullName.substring(0, 12), COLOUR_WHITE);

  // Race / Class
  terminal.putString(x, y + 1, player.race.name.substring(0, 12), COLOUR_L_BLUE);
  terminal.putString(x, y + 2, player.class.name.substring(0, 12), COLOUR_L_BLUE);

  // Level
  terminal.putString(x, y + 4, "Lev:", COLOUR_WHITE);
  const lvColor = player.lev >= player.maxLev ? COLOUR_L_GREEN : COLOUR_YELLOW;
  terminal.putString(x + 5, y + 4, String(player.lev).padStart(7), lvColor);

  // Experience
  terminal.putString(x, y + 5, "Exp:", COLOUR_WHITE);
  const expColor = player.exp >= player.maxExp ? COLOUR_L_GREEN : COLOUR_YELLOW;
  terminal.putString(x + 5, y + 5, String(player.exp).padStart(7), expColor);

  // Gold
  terminal.putString(x, y + 6, "AU:", COLOUR_WHITE);
  terminal.putString(x + 5, y + 6, String(player.au).padStart(7), COLOUR_L_GREEN);

  // Stats (STR, INT, WIS, DEX, CON)
  const statNames = ["STR", "INT", "WIS", "DEX", "CON"];
  for (let i = 0; i < statNames.length; i++) {
    terminal.putString(x, y + 8 + i, `${statNames[i]!}:`, COLOUR_WHITE);
    const val = player.statCur[i] ?? 0;
    const max = player.statMax[i] ?? 0;
    const color = val < max ? COLOUR_YELLOW : COLOUR_L_GREEN;
    // Angband stat display: 18/xx for high values, plain number otherwise
    const statStr = val >= 18 + 100
      ? `18/${(val - 18).toString().padStart(3, "0")}`
      : val >= 18
        ? `18/${(val - 18).toString().padStart(2, "0")}`
        : String(val);
    terminal.putString(x + 5, y + 8 + i, statStr.padStart(7), color);
  }

  // AC
  terminal.putString(x, y + 14, "AC:", COLOUR_WHITE);
  terminal.putString(x + 5, y + 14, String(player.state.ac + player.state.toA).padStart(7), COLOUR_L_GREEN);

  // HP
  terminal.putString(x, y + 15, "HP:", COLOUR_WHITE);
  const hpRatio = player.mhp > 0 ? player.chp / player.mhp : 0;
  const hpColor = hpRatio >= 1.0 ? COLOUR_L_GREEN
    : hpRatio >= 0.5 ? COLOUR_YELLOW
    : hpRatio >= 0.25 ? COLOUR_ORANGE
    : COLOUR_RED;
  terminal.putString(x + 4, y + 15, `${String(player.chp).padStart(4)}/${String(player.mhp).padStart(4)}`, hpColor);

  // SP (mana)
  terminal.putString(x, y + 16, "SP:", COLOUR_WHITE);
  const spRatio = player.msp > 0 ? player.csp / player.msp : 0;
  const spColor = spRatio >= 1.0 ? COLOUR_L_GREEN
    : spRatio >= 0.5 ? COLOUR_YELLOW
    : spRatio >= 0.25 ? COLOUR_ORANGE
    : COLOUR_RED;
  terminal.putString(x + 4, y + 16, `${String(player.csp).padStart(4)}/${String(player.msp).padStart(4)}`, spColor);

  // Depth
  terminal.putString(x, y + 18, "Dep:", COLOUR_WHITE);
  if (player.depth === 0) {
    terminal.putString(x + 5, y + 18, "  Town".padStart(7), COLOUR_L_GREEN);
  } else {
    const depthFt = player.depth * 50;
    terminal.putString(x + 5, y + 18, `${depthFt}'`.padStart(7), COLOUR_L_GREEN);
  }
}

/**
 * Render the message area at the top of the screen.
 *
 * @param terminal - Target terminal
 * @param messages - Array of message strings (newest first)
 * @param count - Number of message lines to display
 */
export function renderMessages(
  terminal: Terminal,
  messages: readonly string[],
  count: number,
): void {
  // Clear the message area
  terminal.clearRegion(0, 0, terminal.width, count);

  // Display messages (newest at bottom of message area)
  for (let i = 0; i < count && i < messages.length; i++) {
    const msg = messages[i]!;
    const row = count - 1 - i;
    terminal.putString(0, row, msg.substring(0, terminal.width), COLOUR_WHITE);
  }
}

/**
 * Render the bottom status line showing speed, depth, and timed effects.
 */
export function renderStatusLine(
  terminal: Terminal,
  player: RenderPlayer,
): void {
  const y = terminal.height - 1;
  terminal.clearRegion(0, y, terminal.width, 1);

  let x = 0;

  // Speed
  const speed = player.state.speed - 110;
  if (speed !== 0) {
    const speedStr = speed > 0 ? `Fast (+${speed})` : `Slow (${speed})`;
    const speedColor = speed > 0 ? COLOUR_L_GREEN : COLOUR_L_RED;
    terminal.putString(x, y, speedStr, speedColor);
    x += speedStr.length + 2;
  }

  // Depth
  const depthStr = player.depth === 0 ? "Town" : `${player.depth * 50}' (L${player.depth})`;
  terminal.putString(x, y, depthStr, COLOUR_WHITE);
  x += depthStr.length + 2;

  // Key timed effects
  const timedEffects: { index: number; label: string; color: number }[] = [
    { index: TIMED_EFFECT.BLIND, label: "Blind", color: COLOUR_ORANGE },
    { index: TIMED_EFFECT.CONFUSED, label: "Confused", color: COLOUR_ORANGE },
    { index: TIMED_EFFECT.AFRAID, label: "Afraid", color: COLOUR_ORANGE },
    { index: TIMED_EFFECT.POISONED, label: "Poisoned", color: COLOUR_GREEN },
    { index: TIMED_EFFECT.CUT, label: "Cut", color: COLOUR_RED },
    { index: TIMED_EFFECT.STUN, label: "Stun", color: COLOUR_ORANGE },
    { index: TIMED_EFFECT.FAST, label: "Haste", color: COLOUR_L_GREEN },
    { index: TIMED_EFFECT.SLOW, label: "Slow", color: COLOUR_L_RED },
    { index: TIMED_EFFECT.PROTEVIL, label: "ProtEvil", color: COLOUR_L_BLUE },
    { index: TIMED_EFFECT.INVULN, label: "Invuln", color: COLOUR_YELLOW },
    { index: TIMED_EFFECT.HERO, label: "Hero", color: COLOUR_YELLOW },
    { index: TIMED_EFFECT.SHERO, label: "Berserk", color: COLOUR_RED },
    { index: TIMED_EFFECT.SHIELD, label: "Shield", color: COLOUR_L_BLUE },
    { index: TIMED_EFFECT.BLESSED, label: "Blessed", color: COLOUR_L_WHITE },
    { index: TIMED_EFFECT.SINVIS, label: "SInvis", color: COLOUR_L_BLUE },
  ];

  for (const effect of timedEffects) {
    if ((player.timed[effect.index] ?? 0) > 0) {
      if (x + effect.label.length + 1 > terminal.width) break;
      terminal.putString(x, y, effect.label, effect.color);
      x += effect.label.length + 1;
    }
  }

  // Hunger status
  const food = player.timed[TIMED_EFFECT.FOOD] ?? 0;
  if (food < 500) {
    terminal.putString(x, y, "Weak", COLOUR_RED);
  } else if (food < 1000) {
    terminal.putString(x, y, "Hungry", COLOUR_YELLOW);
  } else if (food >= 15000) {
    terminal.putString(x, y, "Gorged", COLOUR_GREEN);
  } else if (food >= 10000) {
    terminal.putString(x, y, "Full", COLOUR_L_GREEN);
  }
}
