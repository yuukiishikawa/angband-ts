/**
 * @file z/dice.ts
 * @brief Represent complex dice expressions like "1+2d6M4" or "$LEVEL+1d$SIDES"
 *
 * Port of z-dice.c — state-machine parser for dice notation.
 *
 * Copyright (c) 2013 Ben Semmler
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import { type RNG, type RandomValue, type Aspect, randcalc, randomValue } from "./rand.js";
import { Expression } from "./expression.js";

const DICE_MAX_EXPRESSIONS = 4;
const DICE_TOKEN_SIZE = 16;

interface DiceExprEntry {
  name: string | null;
  expression: Expression | null;
}

// Parser states
const enum DS {
  START = 0,
  BASE_DIGIT = 1,
  FLUSH_BASE = 2,
  DICE_DIGIT = 3,
  FLUSH_DICE = 4,
  SIDE_DIGIT = 5,
  FLUSH_SIDE = 6,
  BONUS = 7,
  BONUS_DIGIT = 8,
  FLUSH_BONUS = 9,
  VAR = 10,
  VAR_CHAR = 11,
  FLUSH_ALL = 12,
  MAX = 13,
}

// Parser input types
const enum DI {
  AMP = 0,
  MINUS = 1,
  BASE = 2,
  DICE = 3,
  BONUS = 4,
  VAR = 5,
  DIGIT = 6,
  UPPER = 7,
  NULL = 8,
  MAX = 9,
}

/**
 * State transition table as numeric 2D array.
 * -1 = invalid transition (maps to DS.MAX).
 *
 * Columns: AMP(-), MINUS(-), BASE(+), DICE(d), BONUS(m), VAR($), DIGIT, UPPER, NULL
 * From C: state_table[DICE_STATE_MAX][DICE_INPUT_MAX]
 */
const X = -1; // invalid
const ST: number[][] = [
  /*                  &   -   +   d   m   $  DIG UPP NUL */
  /* START       */ [ X,  1,  X,  4,  7, 10,  1,  X,  X ],
  /* BASE_DIGIT  */ [ X,  X,  2,  4,  X,  X,  1,  X,  2 ],
  /* FLUSH_BASE  */ [ X,  X,  X,  4,  7, 10,  3,  X,  X ],
  /* DICE_DIGIT  */ [ X,  X,  X,  4,  X,  X,  3,  X,  X ],
  /* FLUSH_DICE  */ [ X,  X,  X,  X,  X, 10,  5,  X,  X ],
  /* SIDE_DIGIT  */ [ 6,  X,  X,  X,  7,  X,  5,  X,  6 ],
  /* FLUSH_SIDE  */ [ X,  X,  X,  X,  7,  X,  X,  X,  X ],
  /* BONUS       */ [ X,  X,  X,  X,  X, 10,  8,  X,  X ],
  /* BONUS_DIGIT */ [ X,  X,  X,  X,  X,  X,  8,  X,  9 ],
  /* FLUSH_BONUS */ [ X,  X,  X,  X,  X,  X,  X,  X,  X ],
  /* VAR         */ [ X,  X,  X,  X,  X,  X,  X, 11,  X ],
  /* VAR_CHAR    */ [ 6,  X,  2,  4,  7,  X,  X, 11, 12 ],
  /* FLUSH_ALL   */ [ X,  X,  X,  X,  X,  X,  X,  X,  X ],
];

function transition(state: DS, input: DI): DS {
  if (state >= DS.MAX || input >= DI.MAX) return DS.MAX;
  const row = ST[state];
  if (!row) return DS.MAX;
  const next = row[input];
  return (next === undefined || next === -1) ? DS.MAX : next as DS;
}

function inputForChar(c: string): DI {
  switch (c) {
    case "&": return DI.AMP;
    case "-": return DI.MINUS;
    case "+": return DI.BASE;
    case "d": return DI.DICE;
    case "M": case "m": return DI.BONUS;
    case "$": return DI.VAR;
    case "\0": return DI.NULL;
    default:
      if (/\d/.test(c)) return DI.DIGIT;
      if (/[A-Z]/.test(c)) return DI.UPPER;
      return DI.MAX;
  }
}

const enum LastSeen {
  NONE = 0,
  BASE = 1,
  DICE = 2,
  SIDE = 3,
  BONUS = 4,
}

/**
 * Parsed dice expression: b + XdY + Mm_bonus
 * Components can be literal numbers or references to named expressions.
 */
export class Dice {
  b = 0;
  x = 0;
  y = 0;
  m = 0;

  exB = false;
  exX = false;
  exY = false;
  exM = false;

  private expressions: DiceExprEntry[] | null = null;

  private reset(): void {
    this.b = 0;
    this.x = 0;
    this.y = 0;
    this.m = 0;
    this.exB = false;
    this.exX = false;
    this.exY = false;
    this.exM = false;

    if (this.expressions) {
      for (const entry of this.expressions) {
        entry.name = null;
        entry.expression = null;
      }
    }
  }

  private addVariable(name: string): number {
    if (!this.expressions) {
      this.expressions = Array.from({ length: DICE_MAX_EXPRESSIONS }, () => ({
        name: null,
        expression: null,
      }));
    }

    for (let i = 0; i < DICE_MAX_EXPRESSIONS; i++) {
      const entry = this.expressions[i]!;
      if (entry.name === null) {
        entry.name = name;
        return i;
      }
      if (entry.name.toLowerCase() === name.toLowerCase()) {
        return i;
      }
    }

    return -1; // no space
  }

  /**
   * Bind an expression to a variable name.
   * Returns the index or -1 on error.
   */
  bindExpression(name: string, expression: Expression): number {
    if (!this.expressions) return -1;

    for (let i = 0; i < DICE_MAX_EXPRESSIONS; i++) {
      const entry = this.expressions[i]!;
      if (entry.name === null) continue;
      if (entry.name.toLowerCase() === name.toLowerCase()) {
        entry.expression = expression.copy();
        return i;
      }
    }

    return -1;
  }

  /**
   * Parse a dice string like "1+2d6M4" or "$LEVEL+$NUMd$SIDES".
   * Returns true on success.
   */
  parseString(str: string): boolean {
    this.reset();

    let token = "";
    let state: DS = DS.START;
    let lastSeen = LastSeen.NONE;

    // Include null terminator in parse (hence <= length)
    for (let i = 0; i <= str.length; i++) {
      const c = i < str.length ? str[i]! : "\0";

      // Skip whitespace
      if (c !== "\0" && /\s/.test(c)) continue;

      const inputType = inputForChar(c);

      // Get next state based on input
      switch (inputType) {
        case DI.AMP:
        case DI.BASE:
        case DI.DICE:
        case DI.VAR:
        case DI.NULL:
          state = transition(state, inputType);
          break;

        case DI.MINUS:
        case DI.DIGIT:
        case DI.UPPER:
          if (token.length < DICE_TOKEN_SIZE) {
            token += c;
          }
          state = transition(state, inputType);
          break;

        default:
          break;
      }

      // Handle 'M' ambiguity (bonus marker vs variable name char)
      if (c === "M") {
        if (state === DS.VAR || state === DS.VAR_CHAR) {
          if (token.length < DICE_TOKEN_SIZE) {
            token += c;
          }
          state = transition(state, DI.UPPER);
        } else {
          state = transition(state, DI.BONUS);
        }
      } else if (c === "m") {
        state = transition(state, DI.BONUS);
      }

      if (state >= DS.MAX) return false;

      let flush = true;

      switch (state) {
        case DS.FLUSH_BASE:
          lastSeen = LastSeen.BASE;
          break;
        case DS.FLUSH_DICE:
          lastSeen = LastSeen.DICE;
          if (token.length === 0) token = "1";
          break;
        case DS.FLUSH_SIDE:
          lastSeen = LastSeen.SIDE;
          break;
        case DS.FLUSH_BONUS:
          lastSeen = LastSeen.BONUS;
          break;
        case DS.FLUSH_ALL:
          if (lastSeen < LastSeen.BONUS) lastSeen++;
          break;
        case DS.BONUS:
          if (lastSeen === LastSeen.DICE)
            lastSeen = LastSeen.SIDE;
          else
            lastSeen = LastSeen.BONUS;
          break;
        default:
          flush = false;
          break;
      }

      if (flush && token.length > 0) {
        let value: number;
        let isVariable = false;

        if (/^[A-Z]/.test(token)) {
          value = this.addVariable(token);
          isVariable = true;
        } else {
          value = parseInt(token, 10);
          isVariable = false;
        }

        switch (lastSeen) {
          case LastSeen.BASE: this.b = value; this.exB = isVariable; break;
          case LastSeen.DICE: this.x = value; this.exX = isVariable; break;
          case LastSeen.SIDE: this.y = value; this.exY = isVariable; break;
          case LastSeen.BONUS: this.m = value; this.exM = isVariable; break;
        }

        token = "";
      }
    }

    return true;
  }

  /**
   * Extract a RandomValue by evaluating any bound expressions.
   */
  randomValue(): RandomValue {
    const rv = randomValue();

    if (this.exB) {
      const entry = this.expressions?.[this.b];
      rv.base = entry?.expression ? entry.expression.evaluate() : 0;
    } else {
      rv.base = this.b;
    }

    if (this.exX) {
      const entry = this.expressions?.[this.x];
      rv.dice = entry?.expression ? entry.expression.evaluate() : 0;
    } else {
      rv.dice = this.x;
    }

    if (this.exY) {
      const entry = this.expressions?.[this.y];
      rv.sides = entry?.expression ? entry.expression.evaluate() : 0;
    } else {
      rv.sides = this.y;
    }

    if (this.exM) {
      const entry = this.expressions?.[this.m];
      rv.m_bonus = entry?.expression ? entry.expression.evaluate() : 0;
    } else {
      rv.m_bonus = this.m;
    }

    return rv;
  }

  /**
   * Fully evaluate: randcalc(randomValue(), level, aspect).
   */
  evaluate(rng: RNG, level: number, aspect: Aspect): number {
    const rv = this.randomValue();
    return randcalc(rng, rv, level, aspect);
  }

  /**
   * Simple evaluation: base + damroll(dice, sides).
   */
  roll(rng: RNG): number {
    const rv = this.randomValue();
    return rv.base + rng.damroll(rv.dice, rv.sides);
  }

  /** Test internal values. */
  testValues(base: number, diceCount: number, sides: number, bonus: number): boolean {
    return this.b === base && this.x === diceCount && this.y === sides && this.m === bonus;
  }

  /** Test that the expected variables are bound. */
  testVariables(
    base: string | null,
    diceName: string | null,
    sides: string | null,
    bonus: string | null,
  ): boolean {
    if (!this.expressions) return false;

    const check = (isEx: boolean, idx: number, expected: string | null): boolean => {
      if (expected === null) return !isEx;
      if (!isEx || idx < 0) return false;
      const entry = this.expressions![idx];
      return entry !== undefined && entry.name !== null &&
        entry.name.toLowerCase() === expected.toLowerCase();
    };

    return (
      check(this.exB, this.b, base) &&
      check(this.exX, this.x, diceName) &&
      check(this.exY, this.y, sides) &&
      check(this.exM, this.m, bonus)
    );
  }
}
