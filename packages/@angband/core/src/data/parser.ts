/**
 * @file data/parser.ts
 * @brief Generic text data file parser for Angband gamedata files.
 *
 * Port of parser.c / parser.h — parses the colon-delimited key:value format
 * used throughout Angband's lib/gamedata/ directory.
 *
 * Copyright (c) 2011 Elly <elly+angband@leptoquark.net>
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import { type RandomValue, randomValue } from "../z/rand.js";

// ── Error codes ──

/**
 * Parse error codes matching the C parser's PARSE_ERROR_* enum.
 * Only the codes relevant to the generic parser are included;
 * game-specific codes (e.g. INVALID_MONSTER) are added by consumers.
 */
export const enum ParseError {
  NONE = 0,
  GENERIC = 1,
  INTERNAL = 2,
  MISSING_FIELD = 3,
  UNDEFINED_DIRECTIVE = 4,
  NOT_NUMBER = 5,
  NOT_RANDOM = 6,
  FIELD_TOO_LONG = 7,
  INVALID_VALUE = 8,
}

const ERROR_MESSAGES: Record<number, string> = {
  [ParseError.NONE]: "(none)",
  [ParseError.GENERIC]: "generic error",
  [ParseError.INTERNAL]: "internal error",
  [ParseError.MISSING_FIELD]: "missing field",
  [ParseError.UNDEFINED_DIRECTIVE]: "undefined directive",
  [ParseError.NOT_NUMBER]: "not a number",
  [ParseError.NOT_RANDOM]: "not random",
  [ParseError.FIELD_TOO_LONG]: "field too long",
  [ParseError.INVALID_VALUE]: "invalid value",
};

/**
 * Human-readable error description for a given ParseError code.
 */
export function parseErrorStr(err: ParseError): string {
  return ERROR_MESSAGES[err] ?? "unknown error";
}

// ── Field types (mirror the C PARSE_T_* constants) ──

const enum FieldType {
  NONE = 0,
  INT = 2,
  SYM = 4,
  STR = 6,
  RAND = 8,
  UINT = 10,
  CHAR = 12,
}

const OPT_FLAG = 0x01;

// ── Internal structures ──

interface FieldSpec {
  type: number;    // FieldType | OPT_FLAG
  name: string;
}

type ParsedValue =
  | { kind: "int"; value: number }
  | { kind: "uint"; value: number }
  | { kind: "sym"; value: string }
  | { kind: "str"; value: string }
  | { kind: "char"; value: string }
  | { kind: "rand"; value: RandomValue };

interface NamedValue {
  spec: FieldSpec;
  parsed: ParsedValue;
}

type HookFn = (parser: Parser) => ParseError;

interface Hook {
  directive: string;
  specs: FieldSpec[];
  fn: HookFn;
}

// ── Parser state (exposed to callers) ──

export interface ParserState {
  error: ParseError;
  line: number;
  col: number;
  msg: string;
}

// ── Random value parser (port of parse_random from parser.c) ──

function containsOnlySpaces(s: string): boolean {
  return /^\s*$/.test(s);
}

/**
 * Parse a random-value string like "5", "2d6", "1+2d6M4", "d6".
 * Returns null on failure.
 */
function parseRandom(str: string): RandomValue | null {
  let negative = false;
  let pos = 0;

  // values: [base, dice, sides, m_bonus]
  const values = [0, 0, 0, 0];
  let i = 0;
  let minI = 1;

  if (str[pos] === "-") {
    negative = true;
    pos++;
  }

  while (true) {
    if (pos < str.length && str[pos] === "d") {
      if (i > 2) return null;
      if (i < 2) {
        i = 2;
        values[1] = 1;  // 'd' with no preceding number implies one die
      }
      minI = 3;
      pos++;
    } else if (pos < str.length && str[pos] === "M") {
      if (i === 2) return null;
      i = 3;
      minI = 4;
      pos++;
    } else {
      // Try to parse a number
      const remaining = str.slice(pos);
      const match = remaining.match(/^(\d+)/);

      if (!match) {
        // No digits found — check for trailing whitespace or end
        if (!containsOnlySpaces(remaining) || i < minI) {
          return null;
        }
        break;
      }

      const numStr = match[1]!;
      const uv = parseInt(numStr, 10);
      if (uv > 0x7fffffff || str[pos] === "+") return null;

      pos += numStr.length;

      if (i === 0) {
        if (pos < str.length && str[pos] === "d") {
          i = 1;
        } else if (pos < str.length && str[pos] === "+") {
          pos++;
          minI = 3;
        } else {
          if (!containsOnlySpaces(str.slice(pos))) return null;
          values[0] = uv;
          break;
        }
      } else if (i === 4) {
        return null;
      }

      values[i] = uv;
      i++;
    }
  }

  const rv = randomValue(values[0], values[1], values[2], values[3]);

  if (negative) {
    rv.base *= -1;
    rv.base -= rv.m_bonus;
    rv.base -= rv.dice * (rv.sides + 1);
  }

  return rv;
}

// ── Format string parser (port of parse_specs / parse_type from parser.c) ──

function parseType(s: string): number {
  let rv = 0;
  let type = s;
  if (type.startsWith("?")) {
    rv |= OPT_FLAG;
    type = type.slice(1);
  }
  switch (type) {
    case "int": return FieldType.INT | rv;
    case "sym": return FieldType.SYM | rv;
    case "str": return FieldType.STR | rv;
    case "rand": return FieldType.RAND | rv;
    case "uint": return FieldType.UINT | rv;
    case "char": return FieldType.CHAR | rv;
    default: return FieldType.NONE;
  }
}

function parseSpecs(fmt: string): { directive: string; specs: FieldSpec[] } | null {
  const parts = fmt.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const directive = parts[0]!;
  const specs: FieldSpec[] = [];

  let idx = 1;
  while (idx < parts.length) {
    const stype = parts[idx];
    if (stype === undefined) break;
    idx++;

    const name = parts[idx];
    if (name === undefined) return null;  // type without name is an error
    idx++;

    const type = parseType(stype);
    if (type === FieldType.NONE) return null;

    // A mandatory field after an optional field is an error
    if (!(type & OPT_FLAG) && specs.length > 0 &&
        (specs[specs.length - 1]!.type & OPT_FLAG)) {
      return null;
    }

    // A field after a str field is an error (str consumes rest of line)
    if (specs.length > 0 &&
        (specs[specs.length - 1]!.type & ~OPT_FLAG) === FieldType.STR) {
      return null;
    }

    specs.push({ type, name });
  }

  return { directive, specs };
}

// ── The Parser class ──

/**
 * Generic text data file parser for Angband's colon-delimited format.
 *
 * Usage:
 * ```
 * const parser = new Parser();
 * parser.register("name str name", (p) => {
 *   const name = p.getString("name");
 *   // ... build your data structure ...
 *   return ParseError.NONE;
 * });
 * parser.register("info int level int speed", (p) => {
 *   const level = p.getInt("level");
 *   const speed = p.getInt("speed");
 *   return ParseError.NONE;
 * });
 *
 * const error = parser.parseString(fileContents);
 * const data = parser.priv;
 * ```
 */
export class Parser {
  private hooks: Hook[] = [];
  private values: NamedValue[] = [];
  private lineno = 0;
  private colno = 1;
  private error: ParseError = ParseError.NONE;
  private errmsg = "";

  /** User-supplied private data, accessible from hook callbacks. */
  priv: unknown = null;

  /**
   * Register a parse hook.
   *
   * Format: `"directive [type name]* [?type name]*"`
   *
   * Supported types: int, uint, sym, str, rand, char.
   * Prefix with `?` for optional fields (e.g. `?int bonus`).
   *
   * It is an error for a mandatory field to follow an optional field.
   * It is an error for any field to follow a str field (str consumes the
   * remainder of the line).
   *
   * @returns true on success, false if the format string is invalid.
   */
  register(fmt: string, fn: HookFn): boolean {
    const parsed = parseSpecs(fmt);
    if (!parsed) return false;

    // Later registrations for the same directive supersede earlier ones
    this.hooks = this.hooks.filter(h => h.directive !== parsed.directive);
    this.hooks.push({
      directive: parsed.directive,
      specs: parsed.specs,
      fn,
    });
    return true;
  }

  /**
   * Parse a single line of input.
   *
   * Returns ParseError.NONE on success (including for blank lines and comments).
   */
  parseLine(line: string): ParseError {
    this.values = [];
    this.lineno++;
    this.colno = 1;

    // Skip leading whitespace
    const trimmed = line.trimStart();

    // Blank lines and comments
    if (trimmed.length === 0 || trimmed[0] === "#") {
      return ParseError.NONE;
    }

    // Split on first colon to get directive
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx < 0) {
      this.error = ParseError.MISSING_FIELD;
      this.errmsg = trimmed;
      return ParseError.MISSING_FIELD;
    }

    const directive = trimmed.slice(0, colonIdx);
    let rest = trimmed.slice(colonIdx + 1);

    // Handle ?:expr conditional directives — skip for now (pass through)
    if (directive === "?") {
      // Conditional directives are silently ignored in this port.
      // A full implementation would evaluate the expression.
      return ParseError.NONE;
    }

    // Find matching hook
    const hook = this.hooks.find(h => h.directive === directive);
    if (!hook) {
      this.errmsg = directive;
      this.error = ParseError.UNDEFINED_DIRECTIVE;
      return ParseError.UNDEFINED_DIRECTIVE;
    }

    // Parse fields according to the hook's spec list
    for (let si = 0; si < hook.specs.length; si++) {
      const spec = hook.specs[si]!;
      const baseType = spec.type & ~OPT_FLAG;
      const isOptional = !!(spec.type & OPT_FLAG);
      this.colno++;

      let tok: string | null;

      if (baseType === FieldType.STR) {
        // str consumes the entire remainder of the line (no colon splitting)
        tok = rest.length > 0 ? rest : null;
        rest = "";
      } else if (baseType === FieldType.CHAR) {
        // char consumes one character, then expects ':' or end-of-field
        if (rest.length === 0) {
          tok = null;
        } else {
          tok = rest[0]!;
          const after = rest.slice(1);
          if (after.length > 0) {
            if (after[0] === ":") {
              rest = after.slice(1);
            } else {
              this.errmsg = spec.name;
              this.error = ParseError.FIELD_TOO_LONG;
              return ParseError.FIELD_TOO_LONG;
            }
          } else {
            rest = "";
          }
        }
      } else {
        // int, uint, sym, rand — tokenize on ':'
        const ci = rest.indexOf(":");
        if (ci >= 0) {
          tok = rest.slice(0, ci);
          rest = rest.slice(ci + 1);
        } else if (rest.length > 0) {
          tok = rest;
          rest = "";
        } else {
          tok = null;
        }
      }

      if (tok === null) {
        if (!isOptional) {
          this.errmsg = spec.name;
          this.error = ParseError.MISSING_FIELD;
          return ParseError.MISSING_FIELD;
        }
        break;
      }

      // Parse the token according to its type
      let parsed: ParsedValue;

      switch (baseType) {
        case FieldType.INT: {
          const n = parseInt(tok, 10);
          if (isNaN(n)) {
            this.errmsg = spec.name;
            this.error = ParseError.NOT_NUMBER;
            return ParseError.NOT_NUMBER;
          }
          parsed = { kind: "int", value: n };
          break;
        }

        case FieldType.UINT: {
          if (tok.startsWith("-")) {
            this.errmsg = spec.name;
            this.error = ParseError.NOT_NUMBER;
            return ParseError.NOT_NUMBER;
          }
          const n = parseInt(tok, 10);
          if (isNaN(n)) {
            this.errmsg = spec.name;
            this.error = ParseError.NOT_NUMBER;
            return ParseError.NOT_NUMBER;
          }
          parsed = { kind: "uint", value: n };
          break;
        }

        case FieldType.SYM:
          parsed = { kind: "sym", value: tok };
          break;

        case FieldType.STR:
          parsed = { kind: "str", value: tok };
          break;

        case FieldType.CHAR:
          parsed = { kind: "char", value: tok };
          break;

        case FieldType.RAND: {
          const rv = parseRandom(tok);
          if (!rv) {
            this.errmsg = spec.name;
            this.error = ParseError.NOT_RANDOM;
            return ParseError.NOT_RANDOM;
          }
          parsed = { kind: "rand", value: rv };
          break;
        }

        default:
          this.error = ParseError.INTERNAL;
          return ParseError.INTERNAL;
      }

      this.values.push({ spec, parsed });
    }

    // Invoke the hook callback
    this.error = hook.fn(this);
    return this.error;
  }

  /**
   * Parse a full multi-line string (the contents of a data file).
   *
   * Stops at the first error and returns it, or ParseError.NONE if all
   * lines were parsed successfully.
   */
  parseString(data: string): ParseError {
    const lines = data.split(/\r?\n/);
    for (const line of lines) {
      const err = this.parseLine(line);
      if (err !== ParseError.NONE) return err;
    }
    return ParseError.NONE;
  }

  // ── Value accessors ──

  /**
   * Check whether a named value was parsed for the current line.
   */
  hasValue(name: string): boolean {
    return this.values.some(v => v.spec.name === name);
  }

  /**
   * Get a sym (symbol) value by name. Throws if not found.
   */
  getSym(name: string): string {
    const v = this.findValue(name);
    if (v.parsed.kind !== "sym") throw new Error(`Expected sym for '${name}'`);
    return v.parsed.value;
  }

  /**
   * Get a str (string) value by name. Throws if not found.
   */
  getString(name: string): string {
    const v = this.findValue(name);
    if (v.parsed.kind !== "str") throw new Error(`Expected str for '${name}'`);
    return v.parsed.value;
  }

  /**
   * Get an int value by name. Throws if not found.
   */
  getInt(name: string): number {
    const v = this.findValue(name);
    if (v.parsed.kind !== "int") throw new Error(`Expected int for '${name}'`);
    return v.parsed.value;
  }

  /**
   * Get a uint value by name. Throws if not found.
   */
  getUint(name: string): number {
    const v = this.findValue(name);
    if (v.parsed.kind !== "uint") throw new Error(`Expected uint for '${name}'`);
    return v.parsed.value;
  }

  /**
   * Get a char value by name. Throws if not found.
   */
  getChar(name: string): string {
    const v = this.findValue(name);
    if (v.parsed.kind !== "char") throw new Error(`Expected char for '${name}'`);
    return v.parsed.value;
  }

  /**
   * Get a rand (random value) by name. Throws if not found.
   */
  getRand(name: string): RandomValue {
    const v = this.findValue(name);
    if (v.parsed.kind !== "rand") throw new Error(`Expected rand for '${name}'`);
    return v.parsed.value;
  }

  // ── State accessors ──

  /**
   * Get the current parser state (for error reporting).
   */
  getState(): ParserState {
    return {
      error: this.error,
      line: this.lineno,
      col: this.colno,
      msg: this.errmsg,
    };
  }

  /**
   * Set the parser's error state (for hooks to report custom errors).
   */
  setState(col: number, msg: string): void {
    this.colno = col;
    this.errmsg = msg;
  }

  // ── Private helpers ──

  private findValue(name: string): NamedValue {
    const v = this.values.find(val => val.spec.name === name);
    if (!v) throw new Error(`parser: no value named '${name}'`);
    return v;
  }
}
