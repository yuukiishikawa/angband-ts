/**
 * @file borg/screen-renderer.ts
 * @brief Render GameState to an 80x24 terminal buffer for remote borg protocol
 *
 * Produces a screen layout that matches the C Angband display format
 * so that the C borg's screen parser (borg_what_text) works correctly:
 *
 *   Row 0:      Message line
 *   Rows 1-21:  Dungeon map (80 cols × 21 rows viewport)
 *   Row 22:     Status line 1 (name, race, class, level)
 *   Row 23:     Status line 2 (HP, SP, depth, gold, turn, speed)
 */

import type { GameState, GameMessage } from "../game/state.js";
import { getRecentMessages, MessageType } from "../game/state.js";
import type { Chunk } from "../types/cave.js";
import { Feat } from "../types/cave.js";
import type { Player } from "../types/player.js";
import type { Monster } from "../types/monster.js";
import {
  COLOUR_DARK,
  COLOUR_WHITE,
  COLOUR_SLATE,
  COLOUR_ORANGE,
  COLOUR_RED,
  COLOUR_UMBER,
  COLOUR_L_WHITE,
  COLOUR_YELLOW,
  COLOUR_L_RED,
  COLOUR_L_GREEN,
  COLOUR_L_BLUE,
} from "../z/color.js";

// ── Terminal buffer ──

export const TERM_COLS = 80;
export const TERM_ROWS = 24;

/** Minimal terminal cell for protocol serialization. */
export interface ScreenCell {
  ch: string;
  attr: number;
}

/**
 * Simple 80×24 screen buffer for the remote borg protocol.
 * No browser dependencies — works in Node.js.
 */
export class ScreenBuffer {
  readonly cells: ScreenCell[][];
  cursorX = 0;
  cursorY = 0;

  constructor() {
    this.cells = [];
    for (let y = 0; y < TERM_ROWS; y++) {
      const row: ScreenCell[] = [];
      for (let x = 0; x < TERM_COLS; x++) {
        row.push({ ch: " ", attr: COLOUR_DARK });
      }
      this.cells.push(row);
    }
  }

  put(x: number, y: number, ch: string, attr: number): void {
    if (x >= 0 && x < TERM_COLS && y >= 0 && y < TERM_ROWS) {
      this.cells[y]![x] = { ch, attr };
    }
  }

  putString(x: number, y: number, text: string, attr: number): void {
    for (let i = 0; i < text.length && x + i < TERM_COLS; i++) {
      this.put(x + i, y, text[i]!, attr);
    }
  }

  clear(): void {
    for (let y = 0; y < TERM_ROWS; y++) {
      for (let x = 0; x < TERM_COLS; x++) {
        this.cells[y]![x] = { ch: " ", attr: COLOUR_DARK };
      }
    }
  }
}

// ── Viewport constants ──

const MSG_ROW = 0;
const MAP_TOP = 1;
const MAP_BOTTOM = 21;
const MAP_ROWS = MAP_BOTTOM - MAP_TOP + 1; // 21
const MAP_COLS = TERM_COLS; // 80
const STATUS_ROW = 22;
const STATUS_ROW2 = 23;

// ── Feature display ──

interface FeatDisplay {
  ch: string;
  fg: number;
}

function featToDisplay(feat: number): FeatDisplay {
  switch (feat) {
    case Feat.FLOOR:    return { ch: ".", fg: COLOUR_WHITE };
    case Feat.OPEN:     return { ch: "'", fg: COLOUR_UMBER };
    case Feat.BROKEN:   return { ch: "'", fg: COLOUR_UMBER };
    case Feat.CLOSED:   return { ch: "+", fg: COLOUR_UMBER };
    case Feat.LESS:     return { ch: "<", fg: COLOUR_WHITE };
    case Feat.MORE:     return { ch: ">", fg: COLOUR_WHITE };
    case Feat.SECRET:   return { ch: "#", fg: COLOUR_SLATE };
    case Feat.RUBBLE:   return { ch: ":", fg: COLOUR_SLATE };
    case Feat.MAGMA:    return { ch: "%", fg: COLOUR_SLATE };
    case Feat.QUARTZ:   return { ch: "%", fg: COLOUR_L_WHITE };
    case Feat.MAGMA_K:  return { ch: "*", fg: COLOUR_ORANGE };
    case Feat.QUARTZ_K: return { ch: "*", fg: COLOUR_L_WHITE };
    case Feat.GRANITE:  return { ch: "#", fg: COLOUR_SLATE };
    case Feat.PERM:     return { ch: "#", fg: COLOUR_WHITE };
    case Feat.LAVA:     return { ch: "~", fg: COLOUR_RED };
    case Feat.STORE_GENERAL: return { ch: "1", fg: COLOUR_L_WHITE };
    case Feat.STORE_ARMOR:   return { ch: "2", fg: COLOUR_L_WHITE };
    case Feat.STORE_WEAPON:  return { ch: "3", fg: COLOUR_L_WHITE };
    case Feat.STORE_BOOK:    return { ch: "4", fg: COLOUR_L_WHITE };
    case Feat.STORE_ALCHEMY: return { ch: "5", fg: COLOUR_L_WHITE };
    case Feat.STORE_MAGIC:   return { ch: "6", fg: COLOUR_L_WHITE };
    case Feat.STORE_BLACK:   return { ch: "7", fg: COLOUR_L_WHITE };
    case Feat.HOME:          return { ch: "8", fg: COLOUR_L_WHITE };
    case Feat.NONE:     return { ch: " ", fg: COLOUR_DARK };
    default:            return { ch: " ", fg: COLOUR_DARK };
  }
}

// ── Main renderer ──

export class ScreenRenderer {
  private cameraX = 0;
  private cameraY = 0;

  constructor(private screen: ScreenBuffer) {}

  /** Camera offset X (dungeon x of left map column). */
  getCameraX(): number { return this.cameraX; }
  /** Camera offset Y (dungeon y of top map row). */
  getCameraY(): number { return this.cameraY; }

  /**
   * Render the full game state to the screen buffer.
   * Call this after each game turn.
   */
  render(state: GameState): void {
    this.screen.clear();
    this.updateCamera(state.player, state.chunk);
    this.renderMessages(state);
    this.renderMap(state);
    this.renderStatus(state);
  }

  private updateCamera(player: Player, chunk: Chunk): void {
    this.cameraX = player.grid.x - Math.floor(MAP_COLS / 2);
    this.cameraY = player.grid.y - Math.floor(MAP_ROWS / 2);
    this.cameraX = Math.max(0, Math.min(this.cameraX, chunk.width - MAP_COLS));
    this.cameraY = Math.max(0, Math.min(this.cameraY, chunk.height - MAP_ROWS));
  }

  /**
   * Row 0: Most recent message.
   */
  private renderMessages(state: GameState): void {
    const messages = getRecentMessages(state, 1);
    if (messages.length > 0) {
      const msg = messages[0]!;
      const color = messageColor(msg);
      const text = msg.text.length > TERM_COLS ? msg.text.substring(0, TERM_COLS) : msg.text;
      this.screen.putString(0, MSG_ROW, text, color);
    }
  }

  /**
   * Rows 1-21: Dungeon map viewport.
   */
  private renderMap(state: GameState): void {
    const chunk = state.chunk;
    const player = state.player;

    // Build monster lookup map
    const monsterMap = new Map<number, Monster>();
    for (const mon of state.monsters) {
      if (mon && mon.hp > 0) {
        monsterMap.set(mon.midx, mon);
      }
    }

    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        const dungeonX = this.cameraX + col;
        const dungeonY = this.cameraY + row;
        const termY = MAP_TOP + row;

        if (
          dungeonX < 0 || dungeonX >= chunk.width ||
          dungeonY < 0 || dungeonY >= chunk.height
        ) {
          this.screen.put(col, termY, " ", COLOUR_DARK);
          continue;
        }

        const sq = chunk.squares[dungeonY]![dungeonX]!;

        // Player
        if (dungeonX === player.grid.x && dungeonY === player.grid.y) {
          this.screen.put(col, termY, "@", COLOUR_WHITE);
          // Set cursor to player position (C borg uses this)
          this.screen.cursorX = col;
          this.screen.cursorY = termY;
          continue;
        }

        // Monster
        if (sq.mon > 0) {
          const mon = monsterMap.get(sq.mon);
          if (mon) {
            const ch = String.fromCharCode(mon.race.dChar);
            const fg = mon.race.dAttr;
            this.screen.put(col, termY, ch, fg);
            continue;
          }
        }

        // Floor object
        if (sq.obj !== null) {
          const obj = chunk.objectList.get(sq.obj as number);
          if (obj?.kind) {
            this.screen.put(col, termY, obj.kind.dChar, obj.kind.dAttr);
            continue;
          }
        }

        // Terrain
        const display = featToDisplay(sq.feat);
        this.screen.put(col, termY, display.ch, display.fg);
      }
    }
  }

  /**
   * Rows 22-23: Status bars matching C Angband format.
   *
   * Row 22: "Borg the Human Warrior  Lv 1"
   * Row 23: "HP:15/15  SP:0/0  Depth:Town  AU:100  T:1  Speed:+0"
   */
  private renderStatus(state: GameState): void {
    const player = state.player;

    // Row 22: name, race, class, level
    const nameStr = player.fullName || "Borg";
    const raceStr = player.race.name;
    const classStr = player.class.name;
    const levelStr = `Lv ${player.lev}`;
    const line1 = `${nameStr} the ${raceStr} ${classStr}  ${levelStr}`;
    this.screen.putString(0, STATUS_ROW, line1, COLOUR_WHITE);

    // Row 23: HP, SP, Depth, AU, Turn, Speed
    const hpColor = player.chp < player.mhp / 4 ? COLOUR_RED :
                    player.chp < player.mhp / 2 ? COLOUR_YELLOW :
                    COLOUR_L_GREEN;

    let x = 0;

    // HP
    this.screen.putString(x, STATUS_ROW2, "HP:", COLOUR_WHITE);
    x += 3;
    const hpStr = `${player.chp}/${player.mhp}`;
    this.screen.putString(x, STATUS_ROW2, hpStr, hpColor);
    x += hpStr.length + 2;

    // SP
    this.screen.putString(x, STATUS_ROW2, "SP:", COLOUR_WHITE);
    x += 3;
    const spStr = `${player.csp}/${player.msp}`;
    this.screen.putString(x, STATUS_ROW2, spStr, COLOUR_L_BLUE);
    x += spStr.length + 2;

    // Depth
    const depthStr = state.depth === 0 ? "Town" : `${state.depth * 50}'`;
    this.screen.putString(x, STATUS_ROW2, `Depth:${depthStr}`, COLOUR_WHITE);
    x += 6 + depthStr.length + 2;

    // Gold
    this.screen.putString(x, STATUS_ROW2, `AU:${player.au}`, COLOUR_YELLOW);
    x += 3 + String(player.au).length + 2;

    // Turn
    this.screen.putString(x, STATUS_ROW2, `T:${state.turn}`, COLOUR_SLATE);
    x += 2 + String(state.turn).length + 2;

    // Speed
    const speed = player.state.speed - 110; // Relative to normal
    const speedStr = speed >= 0 ? `+${speed}` : `${speed}`;
    this.screen.putString(x, STATUS_ROW2, `Speed:${speedStr}`, COLOUR_WHITE);
  }
}

function messageColor(msg: GameMessage): number {
  switch (msg.type) {
    case MessageType.COMBAT:  return COLOUR_L_RED;
    case MessageType.MAGIC:   return COLOUR_L_BLUE;
    case MessageType.MONSTER: return COLOUR_ORANGE;
    case MessageType.ITEM:    return COLOUR_L_GREEN;
    case MessageType.URGENT:  return COLOUR_YELLOW;
    default:                  return COLOUR_WHITE;
  }
}
