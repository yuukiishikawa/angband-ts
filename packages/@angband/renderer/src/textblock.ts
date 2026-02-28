/**
 * @file textblock.ts
 * @brief Formatted multi-line text block
 *
 * Port of z-textblock.c. A TextBlock accumulates styled text for display
 * in character dumps, item descriptions, monster lore, and help screens.
 *
 * Each character in the block can have an independent color attribute.
 * Lines are built incrementally with addText() / addLine() / newLine().
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import { COLOUR_WHITE } from "@angband/core";

// ── Line data ──

/**
 * A single line in a TextBlock.
 * Each character in `text` has a corresponding entry in `colors`.
 */
export interface TextLine {
  /** The text content of the line. */
  readonly text: string;
  /** Per-character color attributes. Length matches text.length. */
  readonly colors: number[];
}

// ── TextBlock class ──

/**
 * Accumulator for styled multi-line text.
 *
 * Usage:
 * ```ts
 * const tb = new TextBlock();
 * tb.addText("HP: ", COLOUR_WHITE);
 * tb.addText("312/312", COLOUR_L_GREEN);
 * tb.newLine();
 * tb.addLine("AC: 150", COLOUR_WHITE);
 * ```
 */
export class TextBlock {
  /** Lines completed so far. */
  private lines: { text: string; colors: number[] }[];
  /** Text accumulating on the current (incomplete) line. */
  private currentText: string;
  /** Colors for the current line. */
  private currentColors: number[];

  constructor() {
    this.lines = [];
    this.currentText = "";
    this.currentColors = [];
  }

  /**
   * Append text to the current line.
   * Does not advance to a new line.
   *
   * @param text - Text to append
   * @param color - Color for all characters in this segment (default WHITE)
   */
  addText(text: string, color: number = COLOUR_WHITE): void {
    this.currentText += text;
    for (let i = 0; i < text.length; i++) {
      this.currentColors.push(color);
    }
  }

  /**
   * Append a complete line. Flushes the current line first (if any
   * text was accumulated via addText), then adds the new text as a
   * separate line.
   *
   * @param text - Full line text
   * @param color - Color for all characters (default WHITE)
   */
  addLine(text: string, color: number = COLOUR_WHITE): void {
    // If there is pending text on the current line, flush it first
    if (this.currentText.length > 0) {
      this.newLine();
    }
    const colors: number[] = [];
    for (let i = 0; i < text.length; i++) {
      colors.push(color);
    }
    this.lines.push({ text, colors });
  }

  /**
   * End the current line and start a new one.
   * If no text has been added to the current line, an empty line is created.
   */
  newLine(): void {
    this.lines.push({
      text: this.currentText,
      colors: [...this.currentColors],
    });
    this.currentText = "";
    this.currentColors = [];
  }

  /**
   * Get all completed lines plus the current incomplete line (if any).
   */
  getLines(): TextLine[] {
    const result: TextLine[] = this.lines.map(l => ({
      text: l.text,
      colors: [...l.colors],
    }));
    // Include the current line if it has content
    if (this.currentText.length > 0) {
      result.push({
        text: this.currentText,
        colors: [...this.currentColors],
      });
    }
    return result;
  }

  /**
   * Clear all content and reset to empty state.
   */
  clear(): void {
    this.lines = [];
    this.currentText = "";
    this.currentColors = [];
  }

  /**
   * Width of the widest line in the block.
   */
  width(): number {
    let max = this.currentText.length;
    for (const line of this.lines) {
      if (line.text.length > max) {
        max = line.text.length;
      }
    }
    return max;
  }

  /**
   * Total number of lines (completed + current if non-empty).
   */
  height(): number {
    return this.lines.length + (this.currentText.length > 0 ? 1 : 0);
  }
}
