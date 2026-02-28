/**
 * @file terminal.ts
 * @brief Virtual terminal grid for character-cell rendering
 *
 * Provides a platform-independent terminal abstraction. Both console and
 * canvas renderers write to a Terminal, then read dirty cells for output.
 *
 * Port of the term layer concepts from main-xxx.c / ui-display.c.
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import { COLOUR_WHITE, COLOUR_DARK } from "@angband/core";

// ── Cell interface ──

/**
 * A single character cell in the virtual terminal.
 */
export interface TerminalCell {
  /** The character displayed in this cell. */
  char: string;
  /** Foreground color index (COLOUR_* constant). */
  fg: number;
  /** Background color index (COLOUR_* constant). */
  bg: number;
  /** Whether this cell has been modified since last clearDirty(). */
  dirty: boolean;
}

// ── Terminal class ──

/**
 * Virtual terminal — a 2D grid of character cells with dirty tracking.
 *
 * The terminal does not perform any actual I/O. External renderers
 * (console, canvas, WebGL) read the cell grid and dirty region to
 * produce visible output.
 */
export class Terminal {
  private _width: number;
  private _height: number;
  private cells: TerminalCell[];

  // Dirty bounding box (inclusive). When no cells are dirty, these
  // are set to inverted (min > max) sentinel values.
  private dirtyMinX: number;
  private dirtyMinY: number;
  private dirtyMaxX: number;
  private dirtyMaxY: number;

  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
    this.cells = Terminal.allocCells(width, height);
    this.dirtyMinX = width;
    this.dirtyMinY = height;
    this.dirtyMaxX = -1;
    this.dirtyMaxY = -1;
  }

  // ── Properties ──

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  // ── Cell access ──

  /**
   * Write a single character to the grid.
   * Out-of-bounds writes are silently ignored.
   */
  putChar(x: number, y: number, char: string, fg: number = COLOUR_WHITE, bg: number = COLOUR_DARK): void {
    if (x < 0 || x >= this._width || y < 0 || y >= this._height) return;
    const idx = y * this._width + x;
    const cell = this.cells[idx]!;
    cell.char = char;
    cell.fg = fg;
    cell.bg = bg;
    cell.dirty = true;
    this.expandDirty(x, y);
  }

  /**
   * Write a string starting at (x, y). Characters that extend past the
   * right edge of the terminal are clipped.
   */
  putString(x: number, y: number, str: string, fg: number = COLOUR_WHITE, bg: number = COLOUR_DARK): void {
    for (let i = 0; i < str.length; i++) {
      this.putChar(x + i, y, str[i]!, fg, bg);
    }
  }

  /**
   * Read a cell. Returns a reference to the internal cell object.
   * Out-of-bounds access returns a default (space, white-on-dark) cell
   * that is not backed by the grid.
   */
  getCell(x: number, y: number): TerminalCell {
    if (x < 0 || x >= this._width || y < 0 || y >= this._height) {
      return { char: " ", fg: COLOUR_WHITE, bg: COLOUR_DARK, dirty: false };
    }
    return this.cells[y * this._width + x]!;
  }

  // ── Clearing ──

  /**
   * Clear the entire terminal to default cells (space, white on dark)
   * and mark every cell dirty.
   */
  clear(): void {
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]!;
      cell.char = " ";
      cell.fg = COLOUR_WHITE;
      cell.bg = COLOUR_DARK;
      cell.dirty = true;
    }
    this.dirtyMinX = 0;
    this.dirtyMinY = 0;
    this.dirtyMaxX = this._width - 1;
    this.dirtyMaxY = this._height - 1;
  }

  /**
   * Clear a rectangular region. Coordinates are clamped to the grid.
   */
  clearRegion(x: number, y: number, w: number, h: number): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this._width, x + w);
    const y1 = Math.min(this._height, y + h);
    for (let gy = y0; gy < y1; gy++) {
      for (let gx = x0; gx < x1; gx++) {
        const cell = this.cells[gy * this._width + gx]!;
        cell.char = " ";
        cell.fg = COLOUR_WHITE;
        cell.bg = COLOUR_DARK;
        cell.dirty = true;
        this.expandDirty(gx, gy);
      }
    }
  }

  // ── Dirty tracking ──

  /**
   * Return the bounding box of all dirty cells, or null if no cells
   * have been modified since the last clearDirty().
   */
  getDirtyRegion(): { x: number; y: number; w: number; h: number } | null {
    if (this.dirtyMaxX < this.dirtyMinX || this.dirtyMaxY < this.dirtyMinY) {
      return null;
    }
    return {
      x: this.dirtyMinX,
      y: this.dirtyMinY,
      w: this.dirtyMaxX - this.dirtyMinX + 1,
      h: this.dirtyMaxY - this.dirtyMinY + 1,
    };
  }

  /**
   * Reset all dirty flags and the dirty bounding box.
   */
  clearDirty(): void {
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i]!.dirty = false;
    }
    this.dirtyMinX = this._width;
    this.dirtyMinY = this._height;
    this.dirtyMaxX = -1;
    this.dirtyMaxY = -1;
  }

  // ── Resize ──

  /**
   * Resize the terminal. All content is lost (reset to defaults).
   * The entire new area is marked dirty.
   */
  resize(width: number, height: number): void {
    this._width = width;
    this._height = height;
    this.cells = Terminal.allocCells(width, height);
    this.dirtyMinX = 0;
    this.dirtyMinY = 0;
    this.dirtyMaxX = width - 1;
    this.dirtyMaxY = height - 1;
  }

  // ── Internals ──

  private expandDirty(x: number, y: number): void {
    if (x < this.dirtyMinX) this.dirtyMinX = x;
    if (y < this.dirtyMinY) this.dirtyMinY = y;
    if (x > this.dirtyMaxX) this.dirtyMaxX = x;
    if (y > this.dirtyMaxY) this.dirtyMaxY = y;
  }

  private static allocCells(width: number, height: number): TerminalCell[] {
    const cells: TerminalCell[] = new Array(width * height);
    for (let i = 0; i < cells.length; i++) {
      cells[i] = { char: " ", fg: COLOUR_WHITE, bg: COLOUR_DARK, dirty: false };
    }
    return cells;
  }
}
