/**
 * @file data/loader.ts
 * @brief Data loading module for Angband gamedata text files.
 *
 * Provides typed loader functions that use the Parser class to parse
 * gamedata text files and return structured TypeScript records.
 *
 * Follows the C init pattern: register fields -> parse -> collect results.
 *
 * Copyright (c) 2011 Elly <elly+angband@leptoquark.net>
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import { Parser, ParseError, parseErrorStr } from "./parser.js";

// ── Result interfaces ──

/** A parsed monster blow method record (from blow_methods.txt). */
export interface BlowMethodDef {
  name: string;
  cut: boolean;
  stun: boolean;
  miss: boolean;
  phys: boolean;
  msgt: string;
  messages: string[];
  desc: string;
}

/** A parsed monster blow effect record (from blow_effects.txt). */
export interface BlowEffectDef {
  name: string;
  power: number;
  eval: number;
  desc: string;
  loreColorBase: string;
  loreColorResist: string;
  loreColorImmune: string;
  effectType: string;
  resist: string;
  lashType: string;
}

/** A parsed object base record (from object_base.txt). */
export interface ObjectBaseDef {
  tval: string;
  name: string;
  graphics: string;
  breakChance: number;
  maxStack: number;
  flags: string[];
}

// ── Parsing error class ──

/** Error thrown when a data file fails to parse. */
export class DataLoadError extends Error {
  readonly line: number;
  readonly col: number;
  readonly code: ParseError;

  constructor(code: ParseError, line: number, col: number, msg: string) {
    super(`Parse error at line ${line}, col ${col}: ${parseErrorStr(code)} — ${msg}`);
    this.name = "DataLoadError";
    this.code = code;
    this.line = line;
    this.col = col;
  }
}

// ── Helper: run parser and throw on error ──

function runParser(parser: Parser, text: string): void {
  const err = parser.parseString(text);
  if (err !== ParseError.NONE) {
    const state = parser.getState();
    throw new DataLoadError(err, state.line, state.col, state.msg);
  }
}

// ── Helper: parse pipe-separated flag string ──

function parseFlags(raw: string): string[] {
  return raw
    .split("|")
    .map(s => s.trim())
    .filter(Boolean);
}

// ── Blow method loader ──

/**
 * Parse blow_methods.txt content and return an array of BlowMethodDef records.
 *
 * Mirrors the C `init_parse_meth` / `finish_parse_meth` pattern from mon-init.c.
 */
export function loadBlowMethods(text: string): BlowMethodDef[] {
  const results: BlowMethodDef[] = [];
  let current: BlowMethodDef | null = null;

  const parser = new Parser();

  parser.register("name str name", (p) => {
    current = {
      name: p.getString("name"),
      cut: false,
      stun: false,
      miss: false,
      phys: false,
      msgt: "",
      messages: [],
      desc: "",
    };
    results.push(current);
    return ParseError.NONE;
  });

  parser.register("cut uint cut", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    current.cut = p.getUint("cut") !== 0;
    return ParseError.NONE;
  });

  parser.register("stun uint stun", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    current.stun = p.getUint("stun") !== 0;
    return ParseError.NONE;
  });

  parser.register("miss uint miss", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    current.miss = p.getUint("miss") !== 0;
    return ParseError.NONE;
  });

  parser.register("phys uint phys", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    current.phys = p.getUint("phys") !== 0;
    return ParseError.NONE;
  });

  parser.register("msg ?str msg", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    if (p.hasValue("msg")) {
      current.msgt = p.getString("msg");
    }
    return ParseError.NONE;
  });

  parser.register("act str act", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    current.messages.push(p.getString("act"));
    return ParseError.NONE;
  });

  parser.register("desc str desc", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    if (current.desc.length > 0) current.desc += " ";
    current.desc += p.getString("desc");
    return ParseError.NONE;
  });

  runParser(parser, text);
  return results;
}

// ── Blow effect loader ──

/**
 * Parse blow_effects.txt content and return an array of BlowEffectDef records.
 *
 * Mirrors the C `init_parse_eff` / `finish_parse_eff` pattern from mon-init.c.
 */
export function loadBlowEffects(text: string): BlowEffectDef[] {
  const results: BlowEffectDef[] = [];
  let current: BlowEffectDef | null = null;

  const parser = new Parser();

  parser.register("name str name", (p) => {
    current = {
      name: p.getString("name"),
      power: 0,
      eval: 0,
      desc: "",
      loreColorBase: "",
      loreColorResist: "",
      loreColorImmune: "",
      effectType: "",
      resist: "",
      lashType: "",
    };
    results.push(current);
    return ParseError.NONE;
  });

  parser.register("power int power", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    current.power = p.getInt("power");
    return ParseError.NONE;
  });

  parser.register("eval int eval", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    current.eval = p.getInt("eval");
    return ParseError.NONE;
  });

  parser.register("desc str desc", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    if (current.desc.length > 0) current.desc += " ";
    current.desc += p.getString("desc");
    return ParseError.NONE;
  });

  parser.register("lore-color-base sym color", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    current.loreColorBase = p.getSym("color");
    return ParseError.NONE;
  });

  parser.register("lore-color-resist sym color", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    current.loreColorResist = p.getSym("color");
    return ParseError.NONE;
  });

  parser.register("lore-color-immune sym color", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    current.loreColorImmune = p.getSym("color");
    return ParseError.NONE;
  });

  parser.register("effect-type str type", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    current.effectType = p.getString("type");
    return ParseError.NONE;
  });

  parser.register("resist str resist", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    current.resist = p.getString("resist");
    return ParseError.NONE;
  });

  parser.register("lash-type str type", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    current.lashType = p.getString("type");
    return ParseError.NONE;
  });

  runParser(parser, text);
  return results;
}

// ── Object base loader ──

/**
 * Parse object_base.txt content and return an array of ObjectBaseDef records.
 *
 * Mirrors the C `init_parse_object_base` / `finish_parse_object_base` pattern
 * from obj-init.c.  Handles `default:` directives that set baseline values
 * for subsequently declared object bases.
 */
export function loadObjectBases(text: string): ObjectBaseDef[] {
  const results: ObjectBaseDef[] = [];
  let current: ObjectBaseDef | null = null;

  const defaults = {
    breakChance: 0,
    maxStack: 40,
  };

  const parser = new Parser();

  parser.register("default sym label int value", (p) => {
    const label = p.getSym("label");
    const value = p.getInt("value");
    if (label === "break-chance") {
      defaults.breakChance = value;
    } else if (label === "max-stack") {
      defaults.maxStack = value;
    } else {
      return ParseError.UNDEFINED_DIRECTIVE;
    }
    return ParseError.NONE;
  });

  parser.register("name sym tval ?str name", (p) => {
    current = {
      tval: p.getSym("tval"),
      name: p.hasValue("name") ? p.getString("name") : "",
      graphics: "",
      breakChance: defaults.breakChance,
      maxStack: defaults.maxStack,
      flags: [],
    };
    results.push(current);
    return ParseError.NONE;
  });

  parser.register("graphics sym color", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    current.graphics = p.getSym("color");
    return ParseError.NONE;
  });

  parser.register("break int breakage", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    current.breakChance = p.getInt("breakage");
    return ParseError.NONE;
  });

  parser.register("max-stack int size", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    current.maxStack = p.getInt("size");
    return ParseError.NONE;
  });

  parser.register("flags str flags", (p) => {
    if (!current) return ParseError.MISSING_FIELD;
    current.flags.push(...parseFlags(p.getString("flags")));
    return ParseError.NONE;
  });

  runParser(parser, text);
  return results;
}
