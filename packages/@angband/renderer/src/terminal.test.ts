/**
 * Tests for terminal.ts — virtual terminal grid
 */
import { describe, it, expect } from "vitest";
import { Terminal } from "./terminal.js";
import { COLOUR_WHITE, COLOUR_DARK, COLOUR_RED, COLOUR_GREEN } from "@angband/core";

describe("Terminal", () => {
  describe("constructor", () => {
    it("should create a terminal with the given dimensions", () => {
      const term = new Terminal(80, 24);
      expect(term.width).toBe(80);
      expect(term.height).toBe(24);
    });

    it("should initialize all cells to space with white-on-dark", () => {
      const term = new Terminal(5, 3);
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 5; x++) {
          const cell = term.getCell(x, y);
          expect(cell.char).toBe(" ");
          expect(cell.fg).toBe(COLOUR_WHITE);
          expect(cell.bg).toBe(COLOUR_DARK);
          expect(cell.dirty).toBe(false);
        }
      }
    });
  });

  describe("putChar", () => {
    it("should write a character with default colors", () => {
      const term = new Terminal(10, 10);
      term.putChar(3, 5, "@");
      const cell = term.getCell(3, 5);
      expect(cell.char).toBe("@");
      expect(cell.fg).toBe(COLOUR_WHITE);
      expect(cell.bg).toBe(COLOUR_DARK);
      expect(cell.dirty).toBe(true);
    });

    it("should write a character with specified colors", () => {
      const term = new Terminal(10, 10);
      term.putChar(0, 0, "#", COLOUR_RED, COLOUR_GREEN);
      const cell = term.getCell(0, 0);
      expect(cell.char).toBe("#");
      expect(cell.fg).toBe(COLOUR_RED);
      expect(cell.bg).toBe(COLOUR_GREEN);
    });

    it("should silently ignore out-of-bounds writes", () => {
      const term = new Terminal(5, 5);
      // These should not throw
      term.putChar(-1, 0, "x");
      term.putChar(0, -1, "x");
      term.putChar(5, 0, "x");
      term.putChar(0, 5, "x");
      term.putChar(100, 100, "x");
      // Verify no dirty region created
      expect(term.getDirtyRegion()).toBeNull();
    });
  });

  describe("putString", () => {
    it("should write a string starting at the given position", () => {
      const term = new Terminal(20, 5);
      term.putString(2, 1, "Hello", COLOUR_GREEN);
      expect(term.getCell(2, 1).char).toBe("H");
      expect(term.getCell(3, 1).char).toBe("e");
      expect(term.getCell(4, 1).char).toBe("l");
      expect(term.getCell(5, 1).char).toBe("l");
      expect(term.getCell(6, 1).char).toBe("o");
      // All should have the specified color
      for (let i = 0; i < 5; i++) {
        expect(term.getCell(2 + i, 1).fg).toBe(COLOUR_GREEN);
      }
    });

    it("should clip characters that extend beyond the right edge", () => {
      const term = new Terminal(5, 3);
      term.putString(3, 0, "ABCDE");
      expect(term.getCell(3, 0).char).toBe("A");
      expect(term.getCell(4, 0).char).toBe("B");
      // Characters at x=5,6,7 are out of bounds — silently ignored
      expect(term.getCell(4, 0).char).toBe("B");
    });

    it("should handle empty string without errors", () => {
      const term = new Terminal(10, 10);
      term.putString(0, 0, "");
      expect(term.getDirtyRegion()).toBeNull();
    });
  });

  describe("getCell", () => {
    it("should return a default cell for out-of-bounds access", () => {
      const term = new Terminal(5, 5);
      const cell = term.getCell(-1, 0);
      expect(cell.char).toBe(" ");
      expect(cell.fg).toBe(COLOUR_WHITE);
      expect(cell.bg).toBe(COLOUR_DARK);
      expect(cell.dirty).toBe(false);
    });

    it("should return a reference to the actual cell for in-bounds access", () => {
      const term = new Terminal(5, 5);
      term.putChar(2, 2, "X", COLOUR_RED);
      const cell = term.getCell(2, 2);
      expect(cell.char).toBe("X");
      expect(cell.fg).toBe(COLOUR_RED);
    });
  });

  describe("clear", () => {
    it("should reset all cells and mark everything dirty", () => {
      const term = new Terminal(3, 3);
      term.putChar(1, 1, "@", COLOUR_RED);
      term.clearDirty();
      term.clear();

      // All cells should be reset
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          const cell = term.getCell(x, y);
          expect(cell.char).toBe(" ");
          expect(cell.fg).toBe(COLOUR_WHITE);
          expect(cell.bg).toBe(COLOUR_DARK);
          expect(cell.dirty).toBe(true);
        }
      }

      // Dirty region should cover the entire terminal
      const dirty = term.getDirtyRegion();
      expect(dirty).toEqual({ x: 0, y: 0, w: 3, h: 3 });
    });
  });

  describe("clearRegion", () => {
    it("should clear a rectangular area", () => {
      const term = new Terminal(10, 10);
      // Fill some cells
      term.putString(0, 0, "XXXXXXXXXX");
      term.putString(0, 1, "XXXXXXXXXX");
      term.clearDirty();

      // Clear a sub-region
      term.clearRegion(2, 0, 3, 2);

      expect(term.getCell(1, 0).char).toBe("X");
      expect(term.getCell(2, 0).char).toBe(" ");
      expect(term.getCell(3, 0).char).toBe(" ");
      expect(term.getCell(4, 0).char).toBe(" ");
      expect(term.getCell(5, 0).char).toBe("X");
      expect(term.getCell(2, 0).dirty).toBe(true);
    });

    it("should clamp to terminal bounds", () => {
      const term = new Terminal(5, 5);
      // This should not throw even with out-of-range coords
      term.clearRegion(-1, -1, 100, 100);
      // All cells should be clear
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          expect(term.getCell(x, y).dirty).toBe(true);
        }
      }
    });
  });

  describe("dirty tracking", () => {
    it("should return null when no cells are dirty", () => {
      const term = new Terminal(10, 10);
      expect(term.getDirtyRegion()).toBeNull();
    });

    it("should track the bounding box of dirty cells", () => {
      const term = new Terminal(20, 20);
      term.putChar(5, 3, "a");
      term.putChar(10, 8, "b");

      const dirty = term.getDirtyRegion();
      expect(dirty).toEqual({ x: 5, y: 3, w: 6, h: 6 });
    });

    it("should track a single dirty cell correctly", () => {
      const term = new Terminal(10, 10);
      term.putChar(7, 4, "Z");
      const dirty = term.getDirtyRegion();
      expect(dirty).toEqual({ x: 7, y: 4, w: 1, h: 1 });
    });

    it("clearDirty should reset all dirty flags", () => {
      const term = new Terminal(10, 10);
      term.putChar(0, 0, "A");
      term.putChar(9, 9, "B");
      expect(term.getDirtyRegion()).not.toBeNull();

      term.clearDirty();
      expect(term.getDirtyRegion()).toBeNull();

      // Individual cells should no longer be dirty
      expect(term.getCell(0, 0).dirty).toBe(false);
      expect(term.getCell(9, 9).dirty).toBe(false);
    });
  });

  describe("resize", () => {
    it("should change dimensions and reset content", () => {
      const term = new Terminal(10, 10);
      term.putChar(5, 5, "@");
      term.clearDirty();

      term.resize(20, 15);
      expect(term.width).toBe(20);
      expect(term.height).toBe(15);

      // Content should be reset
      const cell = term.getCell(5, 5);
      expect(cell.char).toBe(" ");

      // Entire new area should be dirty
      const dirty = term.getDirtyRegion();
      expect(dirty).toEqual({ x: 0, y: 0, w: 20, h: 15 });
    });

    it("should handle resize to smaller dimensions", () => {
      const term = new Terminal(20, 20);
      term.resize(5, 3);
      expect(term.width).toBe(5);
      expect(term.height).toBe(3);

      // Old coordinates should now be out of bounds
      const cell = term.getCell(15, 15);
      expect(cell.dirty).toBe(false); // Out-of-bounds sentinel
    });
  });
});
