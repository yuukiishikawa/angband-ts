/**
 * Tests for z/color.ts
 */
import { describe, it, expect } from "vitest";
import {
  colorCharToAttr,
  colorTextToAttr,
  attrToText,
  getColor,
  buildGammaTable,
  gammaTable,
  COLOUR_DARK,
  COLOUR_WHITE,
  COLOUR_RED,
  COLOUR_GREEN,
  COLOUR_BLUE,
  COLOUR_YELLOW,
  COLOUR_L_RED,
  COLOUR_SLATE,
  ATTR_LIGHT,
  ATTR_DARK,
  BASIC_COLORS,
  angbandColorTable,
} from "./color.js";

describe("colorCharToAttr", () => {
  it("should map 'r' to RED", () => {
    expect(colorCharToAttr("r")).toBe(COLOUR_RED);
  });

  it("should map 'w' to WHITE", () => {
    expect(colorCharToAttr("w")).toBe(COLOUR_WHITE);
  });

  it("should map 'g' to GREEN", () => {
    expect(colorCharToAttr("g")).toBe(COLOUR_GREEN);
  });

  it("should map 'b' to BLUE", () => {
    expect(colorCharToAttr("b")).toBe(COLOUR_BLUE);
  });

  it("should map 'y' to YELLOW", () => {
    expect(colorCharToAttr("y")).toBe(COLOUR_YELLOW);
  });

  it("should map 'd' to DARK", () => {
    expect(colorCharToAttr("d")).toBe(COLOUR_DARK);
  });

  it("should default to WHITE for unknown", () => {
    expect(colorCharToAttr("x")).toBe(COLOUR_WHITE);
  });

  it("should return DARK for empty or space", () => {
    expect(colorCharToAttr("")).toBe(COLOUR_DARK);
    expect(colorCharToAttr(" ")).toBe(COLOUR_DARK);
  });
});

describe("colorTextToAttr", () => {
  it("should find Red", () => {
    expect(colorTextToAttr("Red")).toBe(COLOUR_RED);
  });

  it("should be case insensitive", () => {
    expect(colorTextToAttr("red")).toBe(COLOUR_RED);
    expect(colorTextToAttr("RED")).toBe(COLOUR_RED);
  });

  it("should default to WHITE for unknown", () => {
    expect(colorTextToAttr("Chartreuse")).toBe(COLOUR_WHITE);
  });
});

describe("attrToText", () => {
  it("should return color name", () => {
    expect(attrToText(COLOUR_RED)).toBe("Red");
    expect(attrToText(COLOUR_WHITE)).toBe("White");
  });

  it("should return 'Icky' for out-of-range", () => {
    expect(attrToText(BASIC_COLORS)).toBe("Icky");
  });
});

describe("getColor", () => {
  it("should pass through graphical attrs (high bit)", () => {
    expect(getColor(0x80, ATTR_LIGHT, 1)).toBe(0x80);
  });

  it("should return same color when attr is 0", () => {
    expect(getColor(COLOUR_RED, 0, 1)).toBe(COLOUR_RED);
  });

  it("should translate via light table", () => {
    const lit = getColor(COLOUR_RED, ATTR_LIGHT, 1);
    expect(lit).toBe(COLOUR_L_RED);
  });

  it("should translate via dark table", () => {
    const dark = getColor(COLOUR_RED, ATTR_DARK, 1);
    expect(dark).toBe(COLOUR_SLATE);
  });
});

describe("angbandColorTable", () => {
  it("should have correct RGB for white", () => {
    const [, r, g, b] = angbandColorTable[COLOUR_WHITE]!;
    expect(r).toBe(0xff);
    expect(g).toBe(0xff);
    expect(b).toBe(0xff);
  });

  it("should have correct RGB for dark", () => {
    const [, r, g, b] = angbandColorTable[COLOUR_DARK]!;
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });
});

describe("buildGammaTable", () => {
  it("should set endpoints", () => {
    buildGammaTable(128);
    expect(gammaTable[0]).toBe(0);
    expect(gammaTable[255]).toBe(255);
  });

  it("gamma=256 should be identity", () => {
    buildGammaTable(256);
    // At gamma 1.0 (256 in angband scale), values should be near identity
    for (let i = 0; i < 256; i++) {
      expect(Math.abs(gammaTable[i]! - i)).toBeLessThan(3);
    }
  });

  it("gamma < 256 should brighten midtones", () => {
    buildGammaTable(128);
    // Angband gamma: lower values = higher gamma correction = brighter midtones
    // gamma_table[128] at gamma=128 should be above 128
    expect(gammaTable[128]!).toBeGreaterThan(128);
  });
});
