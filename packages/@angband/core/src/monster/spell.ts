/**
 * @file monster/spell.ts
 * @brief Monster spell casting and selection.
 *
 * Port of mon-spell.c — AI spell selection, casting, and damage calculation.
 * All functions are pure data-returning — no UI side effects.
 *
 * Copyright (c) 2010-14 Chris Carr and Nick McConnell
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import {
  type Monster,
  type MonsterRace,
  MonsterSpellFlag,
  MonsterRaceFlag,
  MonsterTimedEffect,
} from "../types/index.js";
import { type RNG, type Loc, Aspect, randcalc, randomValue } from "../z/index.js";
import { CONF_HIT_REDUCTION, monsterEffectLevel, monsterIsStunned } from "./timed.js";

// ---------------------------------------------------------------------------
// Result interfaces
// ---------------------------------------------------------------------------

/** Result of a monster casting a spell. */
export interface SpellCastResult {
  /** Which spell was cast. */
  readonly spell: MonsterSpellFlag;
  /** Damage dealt (0 for non-damaging spells). */
  readonly damage: number;
  /** Blast radius (0 for bolts / non-area spells). */
  readonly radius: number;
  /** Descriptive message. */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Spell type flags (from list-mon-spells.h RST_* constants)
// ---------------------------------------------------------------------------

/** Spell type classification bitflags. */
const RST_NONE    = 0x0000;
const RST_BOLT    = 0x0001;
const RST_BALL    = 0x0002;
const RST_BREATH  = 0x0004;
const RST_DIRECT  = 0x0008;
const RST_ANNOY   = 0x0010;
const RST_HASTE   = 0x0020;
const RST_HEAL    = 0x0040;
const RST_HEAL_OTHER = 0x0080;
const RST_TACTIC  = 0x0100;
const RST_ESCAPE  = 0x0200;
const RST_SUMMON  = 0x0400;
const RST_INNATE  = 0x0800;
const RST_ARCHERY = 0x1000;
const RST_DAMAGE  = RST_BOLT | RST_BALL | RST_BREATH | RST_DIRECT;

interface MonSpellInfo {
  readonly index: MonsterSpellFlag;
  readonly type: number;
}

/**
 * Spell type classification table (from list-mon-spells.h).
 */
const MON_SPELL_TYPES: readonly MonSpellInfo[] = [
  { index: MonsterSpellFlag.NONE,        type: 0 },
  { index: MonsterSpellFlag.SHRIEK,      type: RST_ANNOY | RST_INNATE },
  { index: MonsterSpellFlag.WHIP,        type: RST_BOLT | RST_INNATE },
  { index: MonsterSpellFlag.SPIT,        type: RST_BOLT | RST_INNATE },
  { index: MonsterSpellFlag.SHOT,        type: RST_BOLT | RST_INNATE | RST_ARCHERY },
  { index: MonsterSpellFlag.ARROW,       type: RST_BOLT | RST_INNATE | RST_ARCHERY },
  { index: MonsterSpellFlag.BOLT,        type: RST_BOLT | RST_INNATE | RST_ARCHERY },
  { index: MonsterSpellFlag.BR_ACID,     type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BR_ELEC,     type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BR_FIRE,     type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BR_COLD,     type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BR_POIS,     type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BR_NETH,     type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BR_LIGHT,    type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BR_DARK,     type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BR_SOUN,     type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BR_CHAO,     type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BR_DISE,     type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BR_NEXU,     type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BR_TIME,     type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BR_INER,     type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BR_GRAV,     type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BR_SHAR,     type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BR_PLAS,     type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BR_WALL,     type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BR_MANA,     type: RST_BREATH | RST_INNATE },
  { index: MonsterSpellFlag.BOULDER,     type: RST_BOLT | RST_INNATE },
  { index: MonsterSpellFlag.WEAVE,       type: RST_ANNOY | RST_INNATE },
  { index: MonsterSpellFlag.BA_ACID,     type: RST_BALL },
  { index: MonsterSpellFlag.BA_ELEC,     type: RST_BALL },
  { index: MonsterSpellFlag.BA_FIRE,     type: RST_BALL },
  { index: MonsterSpellFlag.BA_COLD,     type: RST_BALL },
  { index: MonsterSpellFlag.BA_POIS,     type: RST_BALL },
  { index: MonsterSpellFlag.BA_SHAR,     type: RST_BALL },
  { index: MonsterSpellFlag.BA_NETH,     type: RST_BALL },
  { index: MonsterSpellFlag.BA_WATE,     type: RST_BALL },
  { index: MonsterSpellFlag.BA_MANA,     type: RST_BALL },
  { index: MonsterSpellFlag.BA_HOLY,     type: RST_BALL },
  { index: MonsterSpellFlag.BA_DARK,     type: RST_BALL },
  { index: MonsterSpellFlag.BA_LIGHT,    type: RST_BALL },
  { index: MonsterSpellFlag.STORM,       type: RST_BALL },
  { index: MonsterSpellFlag.DRAIN_MANA,  type: RST_ANNOY },
  { index: MonsterSpellFlag.MIND_BLAST,  type: RST_DIRECT | RST_ANNOY },
  { index: MonsterSpellFlag.BRAIN_SMASH, type: RST_DIRECT | RST_ANNOY },
  { index: MonsterSpellFlag.WOUND,       type: RST_DIRECT },
  { index: MonsterSpellFlag.BO_ACID,     type: RST_BOLT },
  { index: MonsterSpellFlag.BO_ELEC,     type: RST_BOLT },
  { index: MonsterSpellFlag.BO_FIRE,     type: RST_BOLT },
  { index: MonsterSpellFlag.BO_COLD,     type: RST_BOLT },
  { index: MonsterSpellFlag.BO_POIS,     type: RST_BOLT },
  { index: MonsterSpellFlag.BO_NETH,     type: RST_BOLT },
  { index: MonsterSpellFlag.BO_WATE,     type: RST_BOLT },
  { index: MonsterSpellFlag.BO_MANA,     type: RST_BOLT },
  { index: MonsterSpellFlag.BO_PLAS,     type: RST_BOLT },
  { index: MonsterSpellFlag.BO_ICE,      type: RST_BOLT },
  { index: MonsterSpellFlag.MISSILE,     type: RST_BOLT },
  { index: MonsterSpellFlag.BE_ELEC,     type: RST_BALL },
  { index: MonsterSpellFlag.BE_NETH,     type: RST_BALL },
  { index: MonsterSpellFlag.SCARE,       type: RST_ANNOY },
  { index: MonsterSpellFlag.BLIND,       type: RST_ANNOY },
  { index: MonsterSpellFlag.CONF,        type: RST_ANNOY },
  { index: MonsterSpellFlag.SLOW,        type: RST_ANNOY | RST_HASTE },
  { index: MonsterSpellFlag.HOLD,        type: RST_ANNOY | RST_HASTE },
  { index: MonsterSpellFlag.HASTE,       type: RST_HASTE },
  { index: MonsterSpellFlag.HEAL,        type: RST_HEAL },
  { index: MonsterSpellFlag.HEAL_KIN,    type: RST_HEAL_OTHER },
  { index: MonsterSpellFlag.BLINK,       type: RST_TACTIC | RST_ESCAPE },
  { index: MonsterSpellFlag.TPORT,       type: RST_ESCAPE },
  { index: MonsterSpellFlag.TELE_TO,     type: RST_ANNOY },
  { index: MonsterSpellFlag.TELE_SELF_TO, type: RST_ANNOY },
  { index: MonsterSpellFlag.TELE_AWAY,   type: RST_ESCAPE },
  { index: MonsterSpellFlag.TELE_LEVEL,  type: RST_ESCAPE },
  { index: MonsterSpellFlag.DARKNESS,    type: RST_ANNOY },
  { index: MonsterSpellFlag.TRAPS,       type: RST_ANNOY },
  { index: MonsterSpellFlag.FORGET,      type: RST_ANNOY },
  { index: MonsterSpellFlag.SHAPECHANGE, type: RST_TACTIC },
  { index: MonsterSpellFlag.S_KIN,       type: RST_SUMMON },
  { index: MonsterSpellFlag.S_HI_DEMON,  type: RST_SUMMON },
  { index: MonsterSpellFlag.S_MONSTER,   type: RST_SUMMON },
  { index: MonsterSpellFlag.S_MONSTERS,  type: RST_SUMMON },
  { index: MonsterSpellFlag.S_ANIMAL,    type: RST_SUMMON },
  { index: MonsterSpellFlag.S_SPIDER,    type: RST_SUMMON },
  { index: MonsterSpellFlag.S_HOUND,     type: RST_SUMMON },
  { index: MonsterSpellFlag.S_HYDRA,     type: RST_SUMMON },
  { index: MonsterSpellFlag.S_AINU,      type: RST_SUMMON },
  { index: MonsterSpellFlag.S_DEMON,     type: RST_SUMMON },
  { index: MonsterSpellFlag.S_UNDEAD,    type: RST_SUMMON },
  { index: MonsterSpellFlag.S_DRAGON,    type: RST_SUMMON },
  { index: MonsterSpellFlag.S_HI_UNDEAD, type: RST_SUMMON },
  { index: MonsterSpellFlag.S_HI_DRAGON, type: RST_SUMMON },
  { index: MonsterSpellFlag.S_WRAITH,    type: RST_SUMMON },
  { index: MonsterSpellFlag.S_UNIQUE,    type: RST_SUMMON },
];

/**
 * Lookup table: spell index -> type bitfield.
 * Built once at module load time for O(1) access.
 */
const SPELL_TYPE_MAP = new Map<MonsterSpellFlag, number>();
for (const info of MON_SPELL_TYPES) {
  SPELL_TYPE_MAP.set(info.index, info.type);
}

// ---------------------------------------------------------------------------
// Spell name table
// ---------------------------------------------------------------------------

const SPELL_NAMES: Partial<Record<MonsterSpellFlag, string>> = {
  [MonsterSpellFlag.SHRIEK]:      "shriek",
  [MonsterSpellFlag.WHIP]:        "whip",
  [MonsterSpellFlag.SPIT]:        "spit",
  [MonsterSpellFlag.SHOT]:        "shot",
  [MonsterSpellFlag.ARROW]:       "arrow",
  [MonsterSpellFlag.BOLT]:        "bolt",
  [MonsterSpellFlag.BR_ACID]:     "breathe acid",
  [MonsterSpellFlag.BR_ELEC]:     "breathe lightning",
  [MonsterSpellFlag.BR_FIRE]:     "breathe fire",
  [MonsterSpellFlag.BR_COLD]:     "breathe frost",
  [MonsterSpellFlag.BR_POIS]:     "breathe poison",
  [MonsterSpellFlag.BR_NETH]:     "breathe nether",
  [MonsterSpellFlag.BR_LIGHT]:    "breathe light",
  [MonsterSpellFlag.BR_DARK]:     "breathe dark",
  [MonsterSpellFlag.BR_SOUN]:     "breathe sound",
  [MonsterSpellFlag.BR_CHAO]:     "breathe chaos",
  [MonsterSpellFlag.BR_DISE]:     "breathe disenchantment",
  [MonsterSpellFlag.BR_NEXU]:     "breathe nexus",
  [MonsterSpellFlag.BR_TIME]:     "breathe time",
  [MonsterSpellFlag.BR_INER]:     "breathe inertia",
  [MonsterSpellFlag.BR_GRAV]:     "breathe gravity",
  [MonsterSpellFlag.BR_SHAR]:     "breathe shards",
  [MonsterSpellFlag.BR_PLAS]:     "breathe plasma",
  [MonsterSpellFlag.BR_WALL]:     "breathe force",
  [MonsterSpellFlag.BR_MANA]:     "breathe mana",
  [MonsterSpellFlag.BOULDER]:     "throw boulder",
  [MonsterSpellFlag.WEAVE]:       "weave",
  [MonsterSpellFlag.BA_ACID]:     "acid ball",
  [MonsterSpellFlag.BA_ELEC]:     "lightning ball",
  [MonsterSpellFlag.BA_FIRE]:     "fire ball",
  [MonsterSpellFlag.BA_COLD]:     "frost ball",
  [MonsterSpellFlag.BA_POIS]:     "poison ball",
  [MonsterSpellFlag.BA_SHAR]:     "shard ball",
  [MonsterSpellFlag.BA_NETH]:     "nether ball",
  [MonsterSpellFlag.BA_WATE]:     "water ball",
  [MonsterSpellFlag.BA_MANA]:     "mana ball",
  [MonsterSpellFlag.BA_HOLY]:     "holy orb",
  [MonsterSpellFlag.BA_DARK]:     "darkness ball",
  [MonsterSpellFlag.BA_LIGHT]:    "light ball",
  [MonsterSpellFlag.STORM]:       "storm",
  [MonsterSpellFlag.DRAIN_MANA]:  "drain mana",
  [MonsterSpellFlag.MIND_BLAST]:  "mind blast",
  [MonsterSpellFlag.BRAIN_SMASH]: "brain smash",
  [MonsterSpellFlag.WOUND]:       "cause wounds",
  [MonsterSpellFlag.BO_ACID]:     "acid bolt",
  [MonsterSpellFlag.BO_ELEC]:     "lightning bolt",
  [MonsterSpellFlag.BO_FIRE]:     "fire bolt",
  [MonsterSpellFlag.BO_COLD]:     "frost bolt",
  [MonsterSpellFlag.BO_POIS]:     "poison bolt",
  [MonsterSpellFlag.BO_NETH]:     "nether bolt",
  [MonsterSpellFlag.BO_WATE]:     "water bolt",
  [MonsterSpellFlag.BO_MANA]:     "mana bolt",
  [MonsterSpellFlag.BO_PLAS]:     "plasma bolt",
  [MonsterSpellFlag.BO_ICE]:      "ice bolt",
  [MonsterSpellFlag.MISSILE]:     "magic missile",
  [MonsterSpellFlag.BE_ELEC]:     "lightning beam",
  [MonsterSpellFlag.BE_NETH]:     "nether beam",
  [MonsterSpellFlag.SCARE]:       "terrify",
  [MonsterSpellFlag.BLIND]:       "blind",
  [MonsterSpellFlag.CONF]:        "confuse",
  [MonsterSpellFlag.SLOW]:        "slow",
  [MonsterSpellFlag.HOLD]:        "paralyze",
  [MonsterSpellFlag.HASTE]:       "haste self",
  [MonsterSpellFlag.HEAL]:        "heal self",
  [MonsterSpellFlag.HEAL_KIN]:    "heal kin",
  [MonsterSpellFlag.BLINK]:       "blink",
  [MonsterSpellFlag.TPORT]:       "teleport",
  [MonsterSpellFlag.TELE_TO]:     "teleport to",
  [MonsterSpellFlag.TELE_SELF_TO]: "teleport self to",
  [MonsterSpellFlag.TELE_AWAY]:   "teleport away",
  [MonsterSpellFlag.TELE_LEVEL]:  "teleport level",
  [MonsterSpellFlag.DARKNESS]:    "create darkness",
  [MonsterSpellFlag.TRAPS]:       "create traps",
  [MonsterSpellFlag.FORGET]:      "cause amnesia",
  [MonsterSpellFlag.SHAPECHANGE]: "shapechange",
  [MonsterSpellFlag.S_KIN]:       "summon kin",
  [MonsterSpellFlag.S_HI_DEMON]:  "summon greater demons",
  [MonsterSpellFlag.S_MONSTER]:   "summon monster",
  [MonsterSpellFlag.S_MONSTERS]:  "summon monsters",
  [MonsterSpellFlag.S_ANIMAL]:    "summon animals",
  [MonsterSpellFlag.S_SPIDER]:    "summon spiders",
  [MonsterSpellFlag.S_HOUND]:     "summon hounds",
  [MonsterSpellFlag.S_HYDRA]:     "summon hydras",
  [MonsterSpellFlag.S_AINU]:      "summon ainu",
  [MonsterSpellFlag.S_DEMON]:     "summon demons",
  [MonsterSpellFlag.S_UNDEAD]:    "summon undead",
  [MonsterSpellFlag.S_DRAGON]:    "summon dragons",
  [MonsterSpellFlag.S_HI_UNDEAD]: "summon greater undead",
  [MonsterSpellFlag.S_HI_DRAGON]: "summon greater dragons",
  [MonsterSpellFlag.S_WRAITH]:    "summon wraiths",
  [MonsterSpellFlag.S_UNIQUE]:    "summon uniques",
};

// ---------------------------------------------------------------------------
// Breath damage divisors & caps (simplified from projections table)
// ---------------------------------------------------------------------------

interface BreathParams {
  readonly divisor: number;
  readonly damageCap: number;
}

const BREATH_PARAMS: Partial<Record<MonsterSpellFlag, BreathParams>> = {
  [MonsterSpellFlag.BR_ACID]:  { divisor: 3, damageCap: 1600 },
  [MonsterSpellFlag.BR_ELEC]:  { divisor: 3, damageCap: 1600 },
  [MonsterSpellFlag.BR_FIRE]:  { divisor: 3, damageCap: 1600 },
  [MonsterSpellFlag.BR_COLD]:  { divisor: 3, damageCap: 1600 },
  [MonsterSpellFlag.BR_POIS]:  { divisor: 3, damageCap: 800 },
  [MonsterSpellFlag.BR_NETH]:  { divisor: 6, damageCap: 550 },
  [MonsterSpellFlag.BR_LIGHT]: { divisor: 6, damageCap: 400 },
  [MonsterSpellFlag.BR_DARK]:  { divisor: 6, damageCap: 400 },
  [MonsterSpellFlag.BR_SOUN]:  { divisor: 6, damageCap: 500 },
  [MonsterSpellFlag.BR_CHAO]:  { divisor: 6, damageCap: 500 },
  [MonsterSpellFlag.BR_DISE]:  { divisor: 6, damageCap: 500 },
  [MonsterSpellFlag.BR_NEXU]:  { divisor: 6, damageCap: 400 },
  [MonsterSpellFlag.BR_TIME]:  { divisor: 3, damageCap: 150 },
  [MonsterSpellFlag.BR_INER]:  { divisor: 6, damageCap: 200 },
  [MonsterSpellFlag.BR_GRAV]:  { divisor: 3, damageCap: 200 },
  [MonsterSpellFlag.BR_SHAR]:  { divisor: 6, damageCap: 500 },
  [MonsterSpellFlag.BR_PLAS]:  { divisor: 6, damageCap: 150 },
  [MonsterSpellFlag.BR_WALL]:  { divisor: 6, damageCap: 200 },
  [MonsterSpellFlag.BR_MANA]:  { divisor: 3, damageCap: 250 },
};

// ---------------------------------------------------------------------------
// Non-breath spell base damage (simplified; typically from dice in spell data)
// ---------------------------------------------------------------------------

/**
 * Base damage dice for non-breath damaging spells.
 * In the C code these come from the effect's dice string; here we hardcode
 * typical values scaled by spell power.
 */
function nonBreathBaseDamage(spell: MonsterSpellFlag, race: MonsterRace, rng: RNG): number {
  const power = race.spellPower;

  switch (spell) {
    // Bolt spells: roughly 6d8 scaled by spell power
    case MonsterSpellFlag.BO_ACID:
    case MonsterSpellFlag.BO_FIRE:
    case MonsterSpellFlag.BO_ELEC:
    case MonsterSpellFlag.BO_COLD:
    case MonsterSpellFlag.BO_POIS:
      return rng.damroll(Math.max(1, Math.floor(power / 9)), 8);

    case MonsterSpellFlag.BO_NETH:
    case MonsterSpellFlag.BO_WATE:
    case MonsterSpellFlag.BO_MANA:
    case MonsterSpellFlag.BO_PLAS:
    case MonsterSpellFlag.BO_ICE:
      return rng.damroll(Math.max(1, Math.floor(power / 7)), 8);

    case MonsterSpellFlag.MISSILE:
      return rng.damroll(Math.max(1, Math.floor(power / 11)), 6);

    // Ball spells: roughly 5d10 scaled
    case MonsterSpellFlag.BA_ACID:
    case MonsterSpellFlag.BA_FIRE:
    case MonsterSpellFlag.BA_ELEC:
    case MonsterSpellFlag.BA_COLD:
    case MonsterSpellFlag.BA_POIS:
    case MonsterSpellFlag.BA_SHAR:
    case MonsterSpellFlag.BA_NETH:
    case MonsterSpellFlag.BA_WATE:
    case MonsterSpellFlag.BA_MANA:
    case MonsterSpellFlag.BA_HOLY:
    case MonsterSpellFlag.BA_DARK:
    case MonsterSpellFlag.BA_LIGHT:
    case MonsterSpellFlag.STORM:
      return rng.damroll(Math.max(1, Math.floor(power / 7)), 10);

    // Beam spells
    case MonsterSpellFlag.BE_ELEC:
    case MonsterSpellFlag.BE_NETH:
      return rng.damroll(Math.max(1, Math.floor(power / 6)), 10);

    // Innate ranged (arrows, shots, etc.)
    case MonsterSpellFlag.SHOT:
    case MonsterSpellFlag.ARROW:
    case MonsterSpellFlag.BOLT:
    case MonsterSpellFlag.BOULDER:
      return rng.damroll(Math.max(1, Math.floor(power / 8)), 6);

    // Direct damage spells
    case MonsterSpellFlag.MIND_BLAST:
      return rng.damroll(8, 8);
    case MonsterSpellFlag.BRAIN_SMASH:
      return rng.damroll(12, 15);
    case MonsterSpellFlag.WOUND:
      return rng.damroll(Math.max(1, Math.floor(power / 5)), 8);

    // Lash-type
    case MonsterSpellFlag.WHIP:
    case MonsterSpellFlag.SPIT:
      return rng.damroll(Math.max(1, Math.floor(power / 8)), 6);

    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Spell failrate
// ---------------------------------------------------------------------------

/**
 * Calculate the failure rate for a monster casting a spell.
 * Stupid monsters never fail. Fear and confusion increase the rate.
 */
export function monsterSpellFailrate(mon: Monster): number {
  const isStupid = mon.race.flags.has(MonsterRaceFlag.STUPID);
  if (isStupid) return 0;

  const power = Math.max(mon.race.spellPower, 1);
  let failrate = 25 - Math.floor((power + 3) / 4);

  // Fear adds 20%
  if ((mon.mTimed[MonsterTimedEffect.FEAR] ?? 0) > 0) {
    failrate += 20;
  }

  // Confusion and disenchantment add 50%
  if ((mon.mTimed[MonsterTimedEffect.CONF] ?? 0) > 0 ||
      (mon.mTimed[MonsterTimedEffect.DISEN] ?? 0) > 0) {
    failrate += 50;
  }

  return Math.max(0, failrate);
}

// ---------------------------------------------------------------------------
// Public API: predicates
// ---------------------------------------------------------------------------

/** Check if a monster race has a particular spell. */
export function monsterHasSpell(race: MonsterRace, spell: MonsterSpellFlag): boolean {
  return race.spellFlags.has(spell);
}

/** Returns true if the spell is a breath attack. */
export function isBreathSpell(spell: MonsterSpellFlag): boolean {
  const t = SPELL_TYPE_MAP.get(spell);
  return t !== undefined && (t & RST_BREATH) !== 0;
}

/** Returns true if the spell is a summoning spell. */
export function isSummonSpell(spell: MonsterSpellFlag): boolean {
  const t = SPELL_TYPE_MAP.get(spell);
  return t !== undefined && (t & RST_SUMMON) !== 0;
}

/** Returns true if the spell is innate (not a learned spell). */
export function isInnateSpell(spell: MonsterSpellFlag): boolean {
  const t = SPELL_TYPE_MAP.get(spell);
  return t !== undefined && (t & RST_INNATE) !== 0;
}

/** Returns true if the spell deals damage. */
export function isDamageSpell(spell: MonsterSpellFlag): boolean {
  const t = SPELL_TYPE_MAP.get(spell);
  return t !== undefined && (t & RST_DAMAGE) !== 0;
}

/** Returns true if the spell is a bolt-type spell. */
export function isBoltSpell(spell: MonsterSpellFlag): boolean {
  const t = SPELL_TYPE_MAP.get(spell);
  return t !== undefined && (t & RST_BOLT) !== 0;
}

/** Returns true if the spell is a ball-type spell. */
export function isBallSpell(spell: MonsterSpellFlag): boolean {
  const t = SPELL_TYPE_MAP.get(spell);
  return t !== undefined && (t & RST_BALL) !== 0;
}

// ---------------------------------------------------------------------------
// Public API: damage calculation
// ---------------------------------------------------------------------------

/**
 * Calculate damage for a breath spell.
 * Breath damage = hp / divisor, capped at damageCap.
 */
export function breathDamage(spell: MonsterSpellFlag, hp: number): number {
  const params = BREATH_PARAMS[spell];
  if (!params) return 0;

  let dam = Math.floor(hp / params.divisor);
  if (dam > params.damageCap) dam = params.damageCap;
  return dam;
}

/**
 * Get the damage for a monster spell.
 *
 * For breath spells, damage is based on monster HP.
 * For other spells, damage is based on the spell's dice and the race's spell power.
 */
export function getSpellDamage(
  spell: MonsterSpellFlag,
  race: MonsterRace,
  rng: RNG,
  hp?: number,
): number {
  if (isBreathSpell(spell)) {
    return breathDamage(spell, hp ?? race.avgHp);
  }
  return nonBreathBaseDamage(spell, race, rng);
}

// ---------------------------------------------------------------------------
// Public API: spell selection
// ---------------------------------------------------------------------------

/**
 * Have a monster choose a spell to cast.
 *
 * Extracts all available spells from the race's spell flags,
 * applies basic filtering (remove bad spells), and picks randomly.
 *
 * Returns null if no spell is available.
 */
export function monsterChooseSpell(
  mon: Monster,
  race: MonsterRace,
  rng: RNG,
): MonsterSpellFlag | null {
  // Collect available spells
  const available: MonsterSpellFlag[] = [];

  for (let i = MonsterSpellFlag.SHRIEK; i < MonsterSpellFlag.RSF_MAX; i++) {
    if (!race.spellFlags.has(i)) continue;
    available.push(i);
  }

  if (available.length === 0) return null;

  // Basic filtering (simplified version of remove_bad_spells)
  const filtered = available.filter((spell) => {
    // Don't heal if full HP
    if (spell === MonsterSpellFlag.HEAL && mon.hp >= mon.maxhp) return false;

    // Don't haste if already well-hasted
    if (spell === MonsterSpellFlag.HASTE && (mon.mTimed[MonsterTimedEffect.FAST] ?? 0) > 10) {
      return false;
    }

    return true;
  });

  if (filtered.length === 0) return null;

  // Pick at random
  const idx = rng.randint0(filtered.length);
  return filtered[idx] ?? null;
}

// ---------------------------------------------------------------------------
// Public API: spell casting
// ---------------------------------------------------------------------------

/**
 * Execute a monster spell.
 *
 * Returns a SpellCastResult with spell, damage, radius, and message.
 * Does NOT apply effects to the target — callers handle that.
 */
export function monsterCastSpell(
  mon: Monster,
  spell: MonsterSpellFlag,
  target: Loc,
  rng: RNG,
): SpellCastResult {
  const race = mon.race;
  const spellName = SPELL_NAMES[spell] ?? "unknown spell";

  // Check failure (innate spells never fail)
  if (!isInnateSpell(spell)) {
    const failrate = monsterSpellFailrate(mon);
    if (rng.randint0(100) < failrate) {
      return {
        spell,
        damage: 0,
        radius: 0,
        message: `${race.name} tries to cast a spell, but fails.`,
      };
    }
  }

  // Calculate damage
  const damage = isDamageSpell(spell)
    ? getSpellDamage(spell, race, rng, mon.hp)
    : 0;

  // Determine radius (balls = 2, storms = 3+, breaths = 0 for this simplified model)
  let radius = 0;
  if (isBallSpell(spell)) {
    radius = spell === MonsterSpellFlag.STORM ? 3 : 2;
  }

  // Build message
  const message = `${race.name} casts ${spellName}.`;

  return {
    spell,
    damage,
    radius,
    message,
  };
}
