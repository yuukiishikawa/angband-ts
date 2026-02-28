/**
 * Tests for z/expression.ts
 */
import { describe, it, expect } from "vitest";
import { Expression, ExpressionError } from "./expression.js";

describe("Expression", () => {
  it("should evaluate to 0 with no base value or operations", () => {
    const e = new Expression();
    expect(e.evaluate()).toBe(0);
  });

  it("should use base value function", () => {
    const e = new Expression();
    e.baseValue = () => 42;
    expect(e.evaluate()).toBe(42);
  });

  it("should add operations", () => {
    const e = new Expression();
    e.baseValue = () => 10;
    e.addOperationsString("+ 5");
    expect(e.evaluate()).toBe(15);
  });

  it("should handle multiple operations", () => {
    const e = new Expression();
    e.baseValue = () => 10;
    e.addOperationsString("+ 5 * 3");
    // 10 + 5 = 15, then 15 * 3 = 45
    expect(e.evaluate()).toBe(45);
  });

  it("should handle subtraction", () => {
    const e = new Expression();
    e.baseValue = () => 20;
    e.addOperationsString("- 5");
    expect(e.evaluate()).toBe(15);
  });

  it("should handle division", () => {
    const e = new Expression();
    e.baseValue = () => 20;
    e.addOperationsString("/ 3");
    expect(e.evaluate()).toBe(6); // truncated
  });

  it("should handle negation", () => {
    const e = new Expression();
    e.baseValue = () => 10;
    e.addOperationsString("n + 5");
    // 10, negate → -10, then -10 + 5 = -5
    expect(e.evaluate()).toBe(-5);
  });

  it("should return identity for empty string", () => {
    const e = new Expression();
    expect(e.addOperationsString("")).toBe(0);
    e.baseValue = () => 42;
    expect(e.evaluate()).toBe(42);
  });

  it("should reject invalid operator", () => {
    const e = new Expression();
    const result = e.addOperationsString("x 5");
    expect(result).toBe(ExpressionError.INVALID_OPERATOR);
  });

  it("should reject divide by zero", () => {
    const e = new Expression();
    const result = e.addOperationsString("/ 0");
    expect(result).toBe(ExpressionError.DIVIDE_BY_ZERO);
  });

  it("should reject out-of-bounds operands", () => {
    const e = new Expression();
    const result = e.addOperationsString("+ 40000");
    expect(result).toBe(ExpressionError.OPERAND_OUT_OF_BOUNDS);
  });

  describe("copy", () => {
    it("should create an independent deep copy", () => {
      const e = new Expression();
      e.baseValue = () => 10;
      e.addOperationsString("+ 5 * 2");

      const c = e.copy();
      expect(c.evaluate()).toBe(e.evaluate());
      expect(e.testCopy(c)).toBe(true);
    });
  });

  it("should handle multiple operands with same operator", () => {
    const e = new Expression();
    e.baseValue = () => 0;
    e.addOperationsString("+ 1 2 3");
    // 0 + 1 = 1, + 2 = 3, + 3 = 6
    expect(e.evaluate()).toBe(6);
  });
});
