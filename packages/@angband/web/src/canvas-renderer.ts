/**
 * @file canvas-renderer.ts
 * @brief Canvas-based rendering of the terminal grid
 *
 * Draws the 80x24 terminal grid onto an HTML Canvas using monospace
 * font rendering with fillText. Supports efficient dirty-region
 * redrawing: only cells that have changed since the last frame are
 * redrawn.
 */

import { angbandColorToCSS, COLOUR_DARK } from "./color-palette.js";
import type { Terminal } from "./terminal.js";

/** Default cell dimensions in pixels. */
const DEFAULT_CELL_WIDTH = 12;
const DEFAULT_CELL_HEIGHT = 20;

/** The monospace font family to use for rendering. */
const FONT_FAMILY = '"Courier New", Courier, monospace';

/**
 * Canvas-based renderer for the Angband terminal grid.
 *
 * Each terminal cell is drawn as a colored character on a colored
 * background rectangle. The renderer tracks dirty cells and only
 * redraws what has changed.
 */
export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private cellWidth: number;
  private cellHeight: number;

  constructor(
    canvas: HTMLCanvasElement,
    cellWidth: number = DEFAULT_CELL_WIDTH,
    cellHeight: number = DEFAULT_CELL_HEIGHT,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D rendering context from canvas");
    }
    this.ctx = ctx;
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;
  }

  /**
   * Update the cell size and trigger a full redraw on next render.
   */
  setCellSize(width: number, height: number): void {
    this.cellWidth = width;
    this.cellHeight = height;
  }

  /**
   * Resize the canvas to fit the terminal grid dimensions.
   *
   * @param cols Number of terminal columns.
   * @param rows Number of terminal rows.
   */
  resize(cols: number, rows: number): void {
    this.canvas.width = cols * this.cellWidth;
    this.canvas.height = rows * this.cellHeight;
  }

  /**
   * Render the terminal grid to the canvas.
   *
   * Only redraws cells that have their dirty flag set.
   * After rendering, all dirty flags are cleared.
   *
   * @param terminal The terminal grid to render.
   */
  render(terminal: Terminal): void {
    const ctx = this.ctx;
    const cw = this.cellWidth;
    const ch = this.cellHeight;

    // Configure the font once per frame.
    // The font size is slightly smaller than cell height for padding.
    const fontSize = Math.floor(ch * 0.85);
    ctx.font = `${fontSize}px ${FONT_FAMILY}`;
    ctx.textBaseline = "top";

    // Horizontal offset to center the character within its cell.
    // measureText is costly, so we approximate with a fixed offset.
    const textOffsetX = Math.floor(cw * 0.1);
    const textOffsetY = Math.floor((ch - fontSize) / 2);

    for (let y = 0; y < terminal.rows; y++) {
      for (let x = 0; x < terminal.cols; x++) {
        const cell = terminal.cells[y]![x]!;
        if (!cell.dirty) continue;

        const px = x * cw;
        const py = y * ch;

        // Draw background
        ctx.fillStyle = angbandColorToCSS(cell.bg);
        ctx.fillRect(px, py, cw, ch);

        // Draw character (skip spaces for performance)
        if (cell.ch !== " ") {
          ctx.fillStyle = angbandColorToCSS(cell.fg);
          ctx.fillText(cell.ch, px + textOffsetX, py + textOffsetY);
        }
      }
    }

    terminal.clearDirty();
  }

  /**
   * Clear the entire canvas to black.
   */
  clearCanvas(): void {
    this.ctx.fillStyle = angbandColorToCSS(COLOUR_DARK);
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Get the current cell width. */
  getCellWidth(): number {
    return this.cellWidth;
  }

  /** Get the current cell height. */
  getCellHeight(): number {
    return this.cellHeight;
  }
}
