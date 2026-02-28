/**
 * @file z/expression.ts
 * @brief Creating, storing, and evaluating simple math expressions
 *
 * Port of z-expression.c — prefix-notation expression parser.
 *
 * Copyright (c) 2013 Ben Semmler
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

export const enum ExpressionError {
  GENERIC = -1,
  INVALID_OPERATOR = -2,
  EXPECTED_OPERATOR = -3,
  EXPECTED_OPERAND = -4,
  DIVIDE_BY_ZERO = -5,
  OPERAND_OUT_OF_BOUNDS = -6,
}

const enum Operator {
  NONE = 0,
  ADD = 1,
  SUB = 2,
  MUL = 3,
  DIV = 4,
  NEG = 5,
}

interface Operation {
  operator: Operator;
  operand: number;
}

const enum ExprState {
  START = 0,
  OPERATOR = 1,
  OPERAND = 2,
  MAX = 3,
}

const enum ExprInput {
  INVALID = 0,
  NEEDS_OPERANDS = 1,
  UNARY_OPERATOR = 2,
  VALUE = 3,
  MAX = 4,
}

const STATE_TABLE: number[][] = [
  /* START */    [ExpressionError.INVALID_OPERATOR, ExprState.OPERATOR, ExprState.START, ExpressionError.EXPECTED_OPERATOR],
  /* OPERATOR */ [ExpressionError.INVALID_OPERATOR, ExpressionError.EXPECTED_OPERAND, ExpressionError.EXPECTED_OPERAND, ExprState.OPERAND],
  /* OPERAND */  [ExpressionError.INVALID_OPERATOR, ExprState.OPERATOR, ExprState.START, ExprState.OPERAND],
];

function operatorFromToken(token: string): Operator {
  if (token.length !== 1) return Operator.NONE;
  switch (token) {
    case "+": return Operator.ADD;
    case "-": return Operator.SUB;
    case "*": return Operator.MUL;
    case "/": return Operator.DIV;
    case "n": case "N": return Operator.NEG;
    default: return Operator.NONE;
  }
}

function inputForOperator(op: Operator): ExprInput {
  switch (op) {
    case Operator.NONE: return ExprInput.INVALID;
    case Operator.ADD:
    case Operator.SUB:
    case Operator.MUL:
    case Operator.DIV:
      return ExprInput.NEEDS_OPERANDS;
    case Operator.NEG:
      return ExprInput.UNARY_OPERATOR;
  }
}

export type BaseValueFn = () => number;

/**
 * A simple math expression with optional base value function
 * and a list of prefix-notation operations.
 */
export class Expression {
  baseValue: BaseValueFn | null = null;
  private operations: Operation[] = [];

  /** Evaluate the expression. */
  evaluate(): number {
    let value = this.baseValue ? this.baseValue() : 0;

    for (const op of this.operations) {
      switch (op.operator) {
        case Operator.ADD: value += op.operand; break;
        case Operator.SUB: value -= op.operand; break;
        case Operator.MUL: value *= op.operand; break;
        case Operator.DIV: value = Math.trunc(value / op.operand); break;
        case Operator.NEG: value = -value; break;
      }
    }

    return value;
  }

  /** Deep copy. */
  copy(): Expression {
    const e = new Expression();
    e.baseValue = this.baseValue;
    e.operations = this.operations.map((op) => ({ ...op }));
    return e;
  }

  /**
   * Parse a prefix-notation string and add operations.
   * Returns the number of operations added, or a negative error code.
   */
  addOperationsString(str: string): number {
    if (str === "") return 0;

    const tokens = str.split(/\s+/).filter((t) => t.length > 0);
    const ops: Operation[] = [];
    let state: number = ExprState.START;
    let currentOperator = Operator.NONE;

    for (const token of tokens) {
      const value = parseInt(token, 10);
      let parsedOperator: Operator;
      let currentInput: ExprInput;

      if (isNaN(value)) {
        parsedOperator = operatorFromToken(token);
        currentInput = inputForOperator(parsedOperator);
        state = STATE_TABLE[state]![currentInput]!;
      } else {
        parsedOperator = Operator.NONE;
        state = STATE_TABLE[state]![ExprInput.VALUE]!;
      }

      if (state < ExprState.START) {
        return state; // error code
      }

      if (state === ExprState.START) {
        ops.push({ operator: parsedOperator, operand: 0 });
      } else if (state === ExprState.OPERATOR) {
        currentOperator = parsedOperator;
      } else if (state === ExprState.OPERAND) {
        if (value < -32768 || value > 32767) {
          return ExpressionError.OPERAND_OUT_OF_BOUNDS;
        }
        if (currentOperator === Operator.DIV && value === 0) {
          return ExpressionError.DIVIDE_BY_ZERO;
        }
        ops.push({ operator: currentOperator, operand: value });
      }

      if (ops.length >= 50) break;
    }

    for (const op of ops) {
      this.operations.push(op);
    }

    return ops.length;
  }

  /** Test structural equality of two expressions. */
  testCopy(other: Expression): boolean {
    if (this === other) return false;
    if (this.baseValue !== other.baseValue) return false;
    if (this.operations.length !== other.operations.length) return false;
    for (let i = 0; i < this.operations.length; i++) {
      if (this.operations[i]!.operator !== other.operations[i]!.operator) return false;
      if (this.operations[i]!.operand !== other.operations[i]!.operand) return false;
    }
    return true;
  }
}
