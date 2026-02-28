/**
 * @file terminal.ts
 * @brief Terminal grid abstraction for rendering
 *
 * A simple 80x24 (or configurable) character grid that the game writes to
 * and the canvas renderer reads from. Each cell holds a character, a
 * foreground color, and a background color.
 *
 * This acts as the bridge between game state and the renderer — the game
 * logic updates terminal cells, then the renderer draws them to canvas.
 */

import { COLOUR_WHITE, COLOUR_DARK } from "./color-palette.js";

/** Standard Angband terminal dimensions. */
export const TERM_COLS = 80;
export const TERM_ROWS = 24;

/**
 * A single cell in the terminal grid.
 */
export interface TerminalCell {
  /** The character to display (single ASCII char). */
  ch: string;
  /** Foreground color (Angband COLOUR_* index). */
  fg: number;
  /** Background color (Angband COLOUR_* index). */
  bg: number;
  /** Whether this cell has changed since last render. */
  dirty: boolean;
}

/**
 * An 80x24 (rows x cols) character-mode terminal.
 *
 * The game writes characters and colors into this grid; the renderer
 * reads from it and draws to canvas.
 */
export class Terminal {
  readonly cols: number;
  readonly rows: number;
  readonly cells: TerminalCell[][];

  constructor(cols: number = TERM_COLS, rows: number = TERM_ROWS) {
    this.cols = cols;
    this.rows = rows;
    this.cells = [];

    for (let y = 0; y < rows; y++) {
      const row: TerminalCell[] = [];
      for (let x = 0; x < cols; x++) {
        row.push({
          ch: " ",
          fg: COLOUR_WHITE,
          bg: COLOUR_DARK,
          dirty: true,
        });
      }
      this.cells.push(row);
    }
  }

  /**
   * Put a character at (x, y) with given colors.
   */
  putChar(x: number, y: number, ch: string, fg: number, bg: number = COLOUR_DARK): void {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return;
    const cell = this.cells[y]![x]!;
    if (cell.ch !== ch || cell.fg !== fg || cell.bg !== bg) {
      cell.ch = ch;
      cell.fg = fg;
      cell.bg = bg;
      cell.dirty = true;
    }
  }

  /**
   * Write a string starting at (x, y), advancing x for each character.
   */
  putString(x: number, y: number, text: string, fg: number, bg: number = COLOUR_DARK): void {
    for (let i = 0; i < text.length; i++) {
      this.putChar(x + i, y, text[i]!, fg, bg);
    }
  }

  /**
   * Clear the entire terminal to spaces with default colors.
   */
  clear(): void {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const cell = this.cells[y]![x]!;
        cell.ch = " ";
        cell.fg = COLOUR_WHITE;
        cell.bg = COLOUR_DARK;
        cell.dirty = true;
      }
    }
  }

  /**
   * Clear all dirty flags (called after a full render).
   */
  clearDirty(): void {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        this.cells[y]![x]!.dirty = false;
      }
    }
  }

  /**
   * Mark all cells as dirty (forces full redraw).
   */
  markAllDirty(): void {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        this.cells[y]![x]!.dirty = true;
      }
    }
  }
}
