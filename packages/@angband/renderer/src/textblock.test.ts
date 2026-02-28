/**
 * Tests for textblock.ts — formatted multi-line text
 */
import { describe, it, expect } from "vitest";
import { TextBlock } from "./textblock.js";
import { COLOUR_WHITE, COLOUR_RED, COLOUR_GREEN, COLOUR_L_BLUE } from "@angband/core";

describe("TextBlock", () => {
  describe("constructor", () => {
    it("should start empty", () => {
      const tb = new TextBlock();
      expect(tb.getLines()).toEqual([]);
      expect(tb.width()).toBe(0);
      expect(tb.height()).toBe(0);
    });
  });

  describe("addText", () => {
    it("should accumulate text on the current line", () => {
      const tb = new TextBlock();
      tb.addText("Hello");
      tb.addText(" world");
      const lines = tb.getLines();
      expect(lines).toHaveLength(1);
      expect(lines[0]!.text).toBe("Hello world");
    });

    it("should apply default WHITE color", () => {
      const tb = new TextBlock();
      tb.addText("Hi");
      const lines = tb.getLines();
      expect(lines[0]!.colors).toEqual([COLOUR_WHITE, COLOUR_WHITE]);
    });

    it("should apply specified colors per segment", () => {
      const tb = new TextBlock();
      tb.addText("AB", COLOUR_RED);
      tb.addText("CD", COLOUR_GREEN);
      const lines = tb.getLines();
      expect(lines[0]!.colors).toEqual([COLOUR_RED, COLOUR_RED, COLOUR_GREEN, COLOUR_GREEN]);
    });
  });

  describe("addLine", () => {
    it("should add a complete line", () => {
      const tb = new TextBlock();
      tb.addLine("First line");
      tb.addLine("Second line");
      const lines = tb.getLines();
      expect(lines).toHaveLength(2);
      expect(lines[0]!.text).toBe("First line");
      expect(lines[1]!.text).toBe("Second line");
    });

    it("should flush pending addText before adding the line", () => {
      const tb = new TextBlock();
      tb.addText("Partial");
      tb.addLine("Complete");
      const lines = tb.getLines();
      expect(lines).toHaveLength(2);
      expect(lines[0]!.text).toBe("Partial");
      expect(lines[1]!.text).toBe("Complete");
    });

    it("should apply the specified color", () => {
      const tb = new TextBlock();
      tb.addLine("Red line", COLOUR_RED);
      const lines = tb.getLines();
      expect(lines[0]!.colors.every(c => c === COLOUR_RED)).toBe(true);
    });
  });

  describe("newLine", () => {
    it("should flush current text and start a new line", () => {
      const tb = new TextBlock();
      tb.addText("Line 1");
      tb.newLine();
      tb.addText("Line 2");
      const lines = tb.getLines();
      expect(lines).toHaveLength(2);
      expect(lines[0]!.text).toBe("Line 1");
      expect(lines[1]!.text).toBe("Line 2");
    });

    it("should create an empty line when no text was added", () => {
      const tb = new TextBlock();
      tb.newLine();
      tb.addText("After blank");
      const lines = tb.getLines();
      expect(lines).toHaveLength(2);
      expect(lines[0]!.text).toBe("");
      expect(lines[1]!.text).toBe("After blank");
    });
  });

  describe("getLines", () => {
    it("should include the current incomplete line", () => {
      const tb = new TextBlock();
      tb.addText("In progress");
      const lines = tb.getLines();
      expect(lines).toHaveLength(1);
      expect(lines[0]!.text).toBe("In progress");
    });

    it("should return copies of color arrays", () => {
      const tb = new TextBlock();
      tb.addLine("Test", COLOUR_RED);
      const lines1 = tb.getLines();
      const lines2 = tb.getLines();
      // Different array instances
      expect(lines1[0]!.colors).not.toBe(lines2[0]!.colors);
      expect(lines1[0]!.colors).toEqual(lines2[0]!.colors);
    });
  });

  describe("clear", () => {
    it("should reset all content", () => {
      const tb = new TextBlock();
      tb.addLine("Line 1");
      tb.addText("Partial");
      tb.clear();
      expect(tb.getLines()).toEqual([]);
      expect(tb.width()).toBe(0);
      expect(tb.height()).toBe(0);
    });
  });

  describe("width", () => {
    it("should return the length of the widest line", () => {
      const tb = new TextBlock();
      tb.addLine("Short");
      tb.addLine("A much longer line");
      tb.addLine("Medium line");
      expect(tb.width()).toBe(18);
    });

    it("should consider the current incomplete line", () => {
      const tb = new TextBlock();
      tb.addLine("Hi");
      tb.addText("This is longer");
      expect(tb.width()).toBe(14);
    });

    it("should return 0 for empty block", () => {
      const tb = new TextBlock();
      expect(tb.width()).toBe(0);
    });
  });

  describe("height", () => {
    it("should count completed and current lines", () => {
      const tb = new TextBlock();
      tb.addLine("One");
      tb.addLine("Two");
      tb.addText("Three");
      expect(tb.height()).toBe(3);
    });

    it("should not count current line if empty", () => {
      const tb = new TextBlock();
      tb.addLine("One");
      tb.addLine("Two");
      expect(tb.height()).toBe(2);
    });
  });

  describe("complex formatting", () => {
    it("should handle mixed addText and addLine with colors", () => {
      const tb = new TextBlock();
      tb.addText("HP: ", COLOUR_WHITE);
      tb.addText("312", COLOUR_GREEN);
      tb.addText("/", COLOUR_WHITE);
      tb.addText("312", COLOUR_GREEN);
      tb.newLine();
      tb.addLine("AC: 150", COLOUR_L_BLUE);

      const lines = tb.getLines();
      expect(lines).toHaveLength(2);
      expect(lines[0]!.text).toBe("HP: 312/312");
      expect(lines[0]!.colors).toEqual([
        COLOUR_WHITE, COLOUR_WHITE, COLOUR_WHITE, COLOUR_WHITE,
        COLOUR_GREEN, COLOUR_GREEN, COLOUR_GREEN,
        COLOUR_WHITE,
        COLOUR_GREEN, COLOUR_GREEN, COLOUR_GREEN,
      ]);
      expect(lines[1]!.text).toBe("AC: 150");
    });
  });
});
