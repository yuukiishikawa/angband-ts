/**
 * Tests for z/dice.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Dice } from "./dice.js";
import { RNG, Aspect } from "./rand.js";
import { Expression } from "./expression.js";

describe("Dice", () => {
  let rng: RNG;

  beforeEach(() => {
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);
  });

  describe("parseString", () => {
    it("should parse simple base", () => {
      const d = new Dice();
      expect(d.parseString("5")).toBe(true);
      expect(d.testValues(5, 0, 0, 0)).toBe(true);
    });

    it("should parse dice notation XdY", () => {
      const d = new Dice();
      expect(d.parseString("2d6")).toBe(true);
      expect(d.testValues(0, 2, 6, 0)).toBe(true);
    });

    it("should parse base + dice: 1+2d6", () => {
      const d = new Dice();
      expect(d.parseString("1+2d6")).toBe(true);
      expect(d.testValues(1, 2, 6, 0)).toBe(true);
    });

    it("should parse full notation: 1+2d6M4", () => {
      const d = new Dice();
      expect(d.parseString("1+2d6M4")).toBe(true);
      expect(d.testValues(1, 2, 6, 4)).toBe(true);
    });

    it("should parse just d notation: d6", () => {
      const d = new Dice();
      expect(d.parseString("d6")).toBe(true);
      expect(d.testValues(0, 1, 6, 0)).toBe(true);
    });

    it("should parse negative base", () => {
      const d = new Dice();
      expect(d.parseString("-5")).toBe(true);
      expect(d.testValues(-5, 0, 0, 0)).toBe(true);
    });

    it("should parse bonus only: m10", () => {
      const d = new Dice();
      // "5m10" is invalid (base not flushed before bonus marker)
      // Valid format is just "m10" or within dice notation like "2d6m10"
      expect(d.parseString("m10")).toBe(true);
      expect(d.testValues(0, 0, 0, 10)).toBe(true);
    });

    it("should parse sides + bonus: 2d6m10", () => {
      const d = new Dice();
      expect(d.parseString("2d6m10")).toBe(true);
      expect(d.testValues(0, 2, 6, 10)).toBe(true);
    });

    it("should parse with spaces", () => {
      const d = new Dice();
      expect(d.parseString("1 + 2 d 6")).toBe(true);
      expect(d.testValues(1, 2, 6, 0)).toBe(true);
    });

    it("should parse variable notation: $LEVEL", () => {
      const d = new Dice();
      expect(d.parseString("$LEVEL")).toBe(true);
      expect(d.testVariables("LEVEL", null, null, null)).toBe(true);
    });

    it("should parse mixed: $BASE+$NUMd$SIDES", () => {
      const d = new Dice();
      expect(d.parseString("$BASE+$NUMd$SIDES")).toBe(true);
      expect(d.testVariables("BASE", "NUM", "SIDES", null)).toBe(true);
    });

    it("should handle reuse (reset)", () => {
      const d = new Dice();
      d.parseString("2d6");
      d.parseString("3d8");
      expect(d.testValues(0, 3, 8, 0)).toBe(true);
    });
  });

  describe("randomValue", () => {
    it("should return literal values", () => {
      const d = new Dice();
      d.parseString("5+2d6M3");
      const rv = d.randomValue();
      expect(rv.base).toBe(5);
      expect(rv.dice).toBe(2);
      expect(rv.sides).toBe(6);
      expect(rv.m_bonus).toBe(3);
    });

    it("should evaluate bound expressions", () => {
      const d = new Dice();
      d.parseString("$LEVEL");
      const expr = new Expression();
      expr.baseValue = () => 25;
      d.bindExpression("LEVEL", expr);

      const rv = d.randomValue();
      expect(rv.base).toBe(25);
    });
  });

  describe("roll", () => {
    it("should return base + damroll(dice, sides)", () => {
      const d = new Dice();
      d.parseString("5+2d6");

      for (let i = 0; i < 100; i++) {
        const result = d.roll(rng);
        expect(result).toBeGreaterThanOrEqual(7);  // 5 + 2
        expect(result).toBeLessThanOrEqual(17);     // 5 + 12
      }
    });
  });

  describe("evaluate", () => {
    it("MAXIMISE should return max possible", () => {
      const d = new Dice();
      d.parseString("5+2d6");
      expect(d.evaluate(rng, 0, Aspect.MAXIMISE)).toBe(17);
    });

    it("MINIMISE should return min possible", () => {
      const d = new Dice();
      d.parseString("5+2d6");
      expect(d.evaluate(rng, 0, Aspect.MINIMISE)).toBe(7);
    });
  });

  describe("bindExpression", () => {
    it("should return -1 for unknown variable", () => {
      const d = new Dice();
      d.parseString("5");
      const expr = new Expression();
      expect(d.bindExpression("UNKNOWN", expr)).toBe(-1);
    });

    it("should bind and evaluate", () => {
      const d = new Dice();
      d.parseString("$DMG");
      const expr = new Expression();
      expr.baseValue = () => 100;
      expect(d.bindExpression("DMG", expr)).toBeGreaterThanOrEqual(0);
      expect(d.randomValue().base).toBe(100);
    });
  });
});
