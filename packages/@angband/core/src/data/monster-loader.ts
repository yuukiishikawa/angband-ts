/**
 * @file data/monster-loader.ts
 * @brief Parse monster JSON data into MonsterRace[] instances
 *
 * Converts the raw JSON representation of monster races (from monster.json
 * and monster_base.json) into typed MonsterRace objects usable by the
 * game engine.
 */

import { BitFlag } from "../z/index.js";
import { colorCharToAttr } from "../z/color.js";
import type {
  MonsterRace,
  MonsterRaceId,
  MonsterBase,
  MonsterBlow,
} from "../types/monster.js";
import {
  MonsterRaceFlag,
  MonsterSpellFlag,
  BlowMethod,
  BlowEffect,
} from "../types/monster.js";

// ── Raw JSON types ──

interface RawMonsterBase {
  name: string;
  glyph?: string;
  pain?: string;
  flags?: string[];
  desc?: string;
}

interface RawMonster {
  name: string;
  base: string;
  color?: string;
  speed?: string;
  "hit-points"?: string;
  hearing?: string;
  smell?: string;
  "armor-class"?: string;
  sleepiness?: string;
  depth?: string;
  rarity?: string;
  experience?: string;
  light?: string;
  blow?: string | string[];
  flags?: string[];
  "spell-freq"?: string;
  spells?: string[];
  desc?: string;
  friends?: string[];
  "friends-base"?: string[];
  "drop"?: string | string[];
  "drop-base"?: string | string[];
}

// ── Flag name → enum mapping ──

const FLAG_MAP: Record<string, MonsterRaceFlag> = {
  UNIQUE: MonsterRaceFlag.UNIQUE,
  QUESTOR: MonsterRaceFlag.QUESTOR,
  MALE: MonsterRaceFlag.MALE,
  FEMALE: MonsterRaceFlag.FEMALE,
  GROUP_AI: MonsterRaceFlag.GROUP_AI,
  CHAR_CLEAR: MonsterRaceFlag.CHAR_CLEAR,
  ATTR_RAND: MonsterRaceFlag.ATTR_RAND,
  ATTR_CLEAR: MonsterRaceFlag.ATTR_CLEAR,
  ATTR_MULTI: MonsterRaceFlag.ATTR_MULTI,
  FORCE_DEPTH: MonsterRaceFlag.FORCE_DEPTH,
  FORCE_SLEEP: MonsterRaceFlag.FORCE_SLEEP,
  FORCE_EXTRA: MonsterRaceFlag.FORCE_EXTRA,
  UNAWARE: MonsterRaceFlag.UNAWARE,
  MULTIPLY: MonsterRaceFlag.MULTIPLY,
  REGENERATE: MonsterRaceFlag.REGENERATE,
  FRIGHTENED: MonsterRaceFlag.FRIGHTENED,
  NEVER_BLOW: MonsterRaceFlag.NEVER_BLOW,
  NEVER_MOVE: MonsterRaceFlag.NEVER_MOVE,
  RAND_25: MonsterRaceFlag.RAND_25,
  RAND_50: MonsterRaceFlag.RAND_50,
  STUPID: MonsterRaceFlag.STUPID,
  SMART: MonsterRaceFlag.SMART,
  SPIRIT: MonsterRaceFlag.SPIRIT,
  POWERFUL: MonsterRaceFlag.POWERFUL,
  ONLY_GOLD: MonsterRaceFlag.ONLY_GOLD,
  ONLY_ITEM: MonsterRaceFlag.ONLY_ITEM,
  DROP_40: MonsterRaceFlag.DROP_40,
  DROP_60: MonsterRaceFlag.DROP_60,
  DROP_1: MonsterRaceFlag.DROP_1,
  DROP_2: MonsterRaceFlag.DROP_2,
  DROP_3: MonsterRaceFlag.DROP_3,
  DROP_4: MonsterRaceFlag.DROP_4,
  DROP_GOOD: MonsterRaceFlag.DROP_GOOD,
  DROP_GREAT: MonsterRaceFlag.DROP_GREAT,
  DROP_20: MonsterRaceFlag.DROP_20,
  INVISIBLE: MonsterRaceFlag.INVISIBLE,
  COLD_BLOOD: MonsterRaceFlag.COLD_BLOOD,
  EMPTY_MIND: MonsterRaceFlag.EMPTY_MIND,
  WEIRD_MIND: MonsterRaceFlag.WEIRD_MIND,
  OPEN_DOOR: MonsterRaceFlag.OPEN_DOOR,
  BASH_DOOR: MonsterRaceFlag.BASH_DOOR,
  PASS_WALL: MonsterRaceFlag.PASS_WALL,
  KILL_WALL: MonsterRaceFlag.KILL_WALL,
  SMASH_WALL: MonsterRaceFlag.SMASH_WALL,
  MOVE_BODY: MonsterRaceFlag.MOVE_BODY,
  KILL_BODY: MonsterRaceFlag.KILL_BODY,
  TAKE_ITEM: MonsterRaceFlag.TAKE_ITEM,
  KILL_ITEM: MonsterRaceFlag.KILL_ITEM,
  CLEAR_WEB: MonsterRaceFlag.CLEAR_WEB,
  PASS_WEB: MonsterRaceFlag.PASS_WEB,
  ORC: MonsterRaceFlag.ORC,
  TROLL: MonsterRaceFlag.TROLL,
  GIANT: MonsterRaceFlag.GIANT,
  DRAGON: MonsterRaceFlag.DRAGON,
  DEMON: MonsterRaceFlag.DEMON,
  ANIMAL: MonsterRaceFlag.ANIMAL,
  EVIL: MonsterRaceFlag.EVIL,
  UNDEAD: MonsterRaceFlag.UNDEAD,
  NONLIVING: MonsterRaceFlag.NONLIVING,
  METAL: MonsterRaceFlag.METAL,
  HURT_LIGHT: MonsterRaceFlag.HURT_LIGHT,
  HURT_ROCK: MonsterRaceFlag.HURT_ROCK,
  HURT_FIRE: MonsterRaceFlag.HURT_FIRE,
  HURT_COLD: MonsterRaceFlag.HURT_COLD,
  IM_ACID: MonsterRaceFlag.IM_ACID,
  IM_ELEC: MonsterRaceFlag.IM_ELEC,
  IM_FIRE: MonsterRaceFlag.IM_FIRE,
  IM_COLD: MonsterRaceFlag.IM_COLD,
  IM_POIS: MonsterRaceFlag.IM_POIS,
  IM_NETHER: MonsterRaceFlag.IM_NETHER,
  IM_WATER: MonsterRaceFlag.IM_WATER,
  IM_PLASMA: MonsterRaceFlag.IM_PLASMA,
  IM_NEXUS: MonsterRaceFlag.IM_NEXUS,
  IM_DISEN: MonsterRaceFlag.IM_DISEN,
  NO_FEAR: MonsterRaceFlag.NO_FEAR,
  NO_STUN: MonsterRaceFlag.NO_STUN,
  NO_CONF: MonsterRaceFlag.NO_CONF,
  NO_SLEEP: MonsterRaceFlag.NO_SLEEP,
  NO_HOLD: MonsterRaceFlag.NO_HOLD,
  NO_SLOW: MonsterRaceFlag.NO_SLOW,
};

// ── Blow method name → enum ──

const BLOW_METHOD_MAP: Record<string, BlowMethod> = {
  HIT: BlowMethod.HIT,
  TOUCH: BlowMethod.TOUCH,
  PUNCH: BlowMethod.PUNCH,
  KICK: BlowMethod.KICK,
  CLAW: BlowMethod.CLAW,
  BITE: BlowMethod.BITE,
  STING: BlowMethod.STING,
  BUTT: BlowMethod.BUTT,
  CRUSH: BlowMethod.CRUSH,
  ENGULF: BlowMethod.ENGULF,
  CRAWL: BlowMethod.CRAWL,
  DROOL: BlowMethod.DROOL,
  SPIT: BlowMethod.SPIT,
  GAZE: BlowMethod.GAZE,
  WAIL: BlowMethod.WAIL,
  SPORE: BlowMethod.SPORE,
  BEG: BlowMethod.BEG,
  INSULT: BlowMethod.INSULT,
  MOAN: BlowMethod.MOAN,
};

// ── Blow effect name → enum ──

const BLOW_EFFECT_MAP: Record<string, BlowEffect> = {
  HURT: BlowEffect.HURT,
  POISON: BlowEffect.POISON,
  DISENCHANT: BlowEffect.DISENCHANT,
  DRAIN_CHARGES: BlowEffect.DRAIN_CHARGES,
  EAT_GOLD: BlowEffect.EAT_GOLD,
  EAT_ITEM: BlowEffect.EAT_ITEM,
  EAT_FOOD: BlowEffect.EAT_FOOD,
  EAT_LIGHT: BlowEffect.EAT_LIGHT,
  ACID: BlowEffect.ACID,
  ELEC: BlowEffect.ELEC,
  FIRE: BlowEffect.FIRE,
  COLD: BlowEffect.COLD,
  BLIND: BlowEffect.BLIND,
  CONFUSE: BlowEffect.CONFUSE,
  TERRIFY: BlowEffect.TERRIFY,
  PARALYZE: BlowEffect.PARALYZE,
  LOSE_STR: BlowEffect.LOSE_STR,
  LOSE_INT: BlowEffect.LOSE_INT,
  LOSE_WIS: BlowEffect.LOSE_WIS,
  LOSE_DEX: BlowEffect.LOSE_DEX,
  LOSE_CON: BlowEffect.LOSE_CON,
  LOSE_ALL: BlowEffect.LOSE_ALL,
  SHATTER: BlowEffect.SHATTER,
  EXP_10: BlowEffect.EXP_10,
  EXP_20: BlowEffect.EXP_20,
  EXP_40: BlowEffect.EXP_40,
  EXP_80: BlowEffect.EXP_80,
  HALLU: BlowEffect.HALLU,
  BLACK_BREATH: BlowEffect.BLACK_BREATH,
};

// ── Spell flag name → enum mapping ──

const SPELL_FLAG_MAP: Record<string, MonsterSpellFlag> = {
  // Innate ranged
  SHRIEK: MonsterSpellFlag.SHRIEK,
  WHIP: MonsterSpellFlag.WHIP,
  SPIT: MonsterSpellFlag.SPIT,
  SHOT: MonsterSpellFlag.SHOT,
  ARROW: MonsterSpellFlag.ARROW,
  BOLT: MonsterSpellFlag.BOLT,

  // Breaths (innate)
  BR_ACID: MonsterSpellFlag.BR_ACID,
  BR_ELEC: MonsterSpellFlag.BR_ELEC,
  BR_FIRE: MonsterSpellFlag.BR_FIRE,
  BR_COLD: MonsterSpellFlag.BR_COLD,
  BR_POIS: MonsterSpellFlag.BR_POIS,
  BR_NETH: MonsterSpellFlag.BR_NETH,
  BR_LIGHT: MonsterSpellFlag.BR_LIGHT,
  BR_DARK: MonsterSpellFlag.BR_DARK,
  BR_SOUN: MonsterSpellFlag.BR_SOUN,
  BR_CHAO: MonsterSpellFlag.BR_CHAO,
  BR_DISE: MonsterSpellFlag.BR_DISE,
  BR_NEXU: MonsterSpellFlag.BR_NEXU,
  BR_TIME: MonsterSpellFlag.BR_TIME,
  BR_INER: MonsterSpellFlag.BR_INER,
  BR_GRAV: MonsterSpellFlag.BR_GRAV,
  BR_SHAR: MonsterSpellFlag.BR_SHAR,
  BR_PLAS: MonsterSpellFlag.BR_PLAS,
  BR_WALL: MonsterSpellFlag.BR_WALL,
  BR_MANA: MonsterSpellFlag.BR_MANA,

  // Innate physical
  BOULDER: MonsterSpellFlag.BOULDER,
  WEAVE: MonsterSpellFlag.WEAVE,

  // Ball spells
  BA_ACID: MonsterSpellFlag.BA_ACID,
  BA_ELEC: MonsterSpellFlag.BA_ELEC,
  BA_FIRE: MonsterSpellFlag.BA_FIRE,
  BA_COLD: MonsterSpellFlag.BA_COLD,
  BA_POIS: MonsterSpellFlag.BA_POIS,
  BA_SHAR: MonsterSpellFlag.BA_SHAR,
  BA_NETH: MonsterSpellFlag.BA_NETH,
  BA_WATE: MonsterSpellFlag.BA_WATE,
  BA_MANA: MonsterSpellFlag.BA_MANA,
  BA_HOLY: MonsterSpellFlag.BA_HOLY,
  BA_DARK: MonsterSpellFlag.BA_DARK,
  BA_LIGHT: MonsterSpellFlag.BA_LIGHT,
  STORM: MonsterSpellFlag.STORM,

  // Annoyance / direct
  DRAIN_MANA: MonsterSpellFlag.DRAIN_MANA,
  MIND_BLAST: MonsterSpellFlag.MIND_BLAST,
  BRAIN_SMASH: MonsterSpellFlag.BRAIN_SMASH,
  WOUND: MonsterSpellFlag.WOUND,

  // Bolt spells
  BO_ACID: MonsterSpellFlag.BO_ACID,
  BO_ELEC: MonsterSpellFlag.BO_ELEC,
  BO_FIRE: MonsterSpellFlag.BO_FIRE,
  BO_COLD: MonsterSpellFlag.BO_COLD,
  BO_POIS: MonsterSpellFlag.BO_POIS,
  BO_NETH: MonsterSpellFlag.BO_NETH,
  BO_WATE: MonsterSpellFlag.BO_WATE,
  BO_MANA: MonsterSpellFlag.BO_MANA,
  BO_PLAS: MonsterSpellFlag.BO_PLAS,
  BO_ICE: MonsterSpellFlag.BO_ICE,
  MISSILE: MonsterSpellFlag.MISSILE,

  // Beam spells
  BE_ELEC: MonsterSpellFlag.BE_ELEC,
  BE_NETH: MonsterSpellFlag.BE_NETH,

  // Status / utility
  SCARE: MonsterSpellFlag.SCARE,
  BLIND: MonsterSpellFlag.BLIND,
  CONF: MonsterSpellFlag.CONF,
  SLOW: MonsterSpellFlag.SLOW,
  HOLD: MonsterSpellFlag.HOLD,
  HASTE: MonsterSpellFlag.HASTE,
  HEAL: MonsterSpellFlag.HEAL,
  HEAL_KIN: MonsterSpellFlag.HEAL_KIN,

  // Movement
  BLINK: MonsterSpellFlag.BLINK,
  TPORT: MonsterSpellFlag.TPORT,
  TELE_TO: MonsterSpellFlag.TELE_TO,
  TELE_SELF_TO: MonsterSpellFlag.TELE_SELF_TO,
  TELE_AWAY: MonsterSpellFlag.TELE_AWAY,
  TELE_LEVEL: MonsterSpellFlag.TELE_LEVEL,

  // Misc
  DARKNESS: MonsterSpellFlag.DARKNESS,
  TRAPS: MonsterSpellFlag.TRAPS,
  FORGET: MonsterSpellFlag.FORGET,
  SHAPECHANGE: MonsterSpellFlag.SHAPECHANGE,

  // Summoning
  S_KIN: MonsterSpellFlag.S_KIN,
  S_HI_DEMON: MonsterSpellFlag.S_HI_DEMON,
  S_MONSTER: MonsterSpellFlag.S_MONSTER,
  S_MONSTERS: MonsterSpellFlag.S_MONSTERS,
  S_ANIMAL: MonsterSpellFlag.S_ANIMAL,
  S_SPIDER: MonsterSpellFlag.S_SPIDER,
  S_HOUND: MonsterSpellFlag.S_HOUND,
  S_HYDRA: MonsterSpellFlag.S_HYDRA,
  S_AINU: MonsterSpellFlag.S_AINU,
  S_DEMON: MonsterSpellFlag.S_DEMON,
  S_UNDEAD: MonsterSpellFlag.S_UNDEAD,
  S_DRAGON: MonsterSpellFlag.S_DRAGON,
  S_HI_UNDEAD: MonsterSpellFlag.S_HI_UNDEAD,
  S_HI_DRAGON: MonsterSpellFlag.S_HI_DRAGON,
  S_WRAITH: MonsterSpellFlag.S_WRAITH,
  S_UNIQUE: MonsterSpellFlag.S_UNIQUE,
};

/**
 * Innate spell flags — breaths, physical attacks, and innate ranged.
 * These use freqInnate; all others use freqSpell.
 */
const INNATE_SPELLS = new Set<MonsterSpellFlag>([
  MonsterSpellFlag.SHRIEK, MonsterSpellFlag.WHIP, MonsterSpellFlag.SPIT,
  MonsterSpellFlag.SHOT, MonsterSpellFlag.ARROW, MonsterSpellFlag.BOLT,
  MonsterSpellFlag.BR_ACID, MonsterSpellFlag.BR_ELEC, MonsterSpellFlag.BR_FIRE,
  MonsterSpellFlag.BR_COLD, MonsterSpellFlag.BR_POIS, MonsterSpellFlag.BR_NETH,
  MonsterSpellFlag.BR_LIGHT, MonsterSpellFlag.BR_DARK, MonsterSpellFlag.BR_SOUN,
  MonsterSpellFlag.BR_CHAO, MonsterSpellFlag.BR_DISE, MonsterSpellFlag.BR_NEXU,
  MonsterSpellFlag.BR_TIME, MonsterSpellFlag.BR_INER, MonsterSpellFlag.BR_GRAV,
  MonsterSpellFlag.BR_SHAR, MonsterSpellFlag.BR_PLAS, MonsterSpellFlag.BR_WALL,
  MonsterSpellFlag.BR_MANA, MonsterSpellFlag.BOULDER, MonsterSpellFlag.WEAVE,
]);

/**
 * Parse spell name strings into a BitFlag and determine innate/spell freq split.
 */
function parseSpellFlags(spellNames: string[]): {
  spellFlags: BitFlag;
  hasInnate: boolean;
  hasNonInnate: boolean;
} {
  const spellFlags = new BitFlag(MonsterSpellFlag.RSF_MAX);
  let hasInnate = false;
  let hasNonInnate = false;

  for (const name of spellNames) {
    const flag = SPELL_FLAG_MAP[name.trim()];
    if (flag !== undefined) {
      spellFlags.on(flag);
      if (INNATE_SPELLS.has(flag)) {
        hasInnate = true;
      } else {
        hasNonInnate = true;
      }
    }
  }

  return { spellFlags, hasInnate, hasNonInnate };
}

// ── Blow parsing ──

/**
 * Parse a blow string like "CLAW:HURT:1d1" or "BEG" or "TOUCH:EAT_GOLD".
 */
function parseBlow(blowStr: string): MonsterBlow {
  const parts = blowStr.split(":");
  const method = BLOW_METHOD_MAP[parts[0]!] ?? BlowMethod.HIT;
  const effect = parts[1] ? (BLOW_EFFECT_MAP[parts[1]] ?? BlowEffect.HURT) : BlowEffect.NONE;

  let diceNum = 0;
  let diceSides = 0;
  if (parts[2]) {
    const diceMatch = parts[2].match(/^(\d+)d(\d+)$/);
    if (diceMatch) {
      diceNum = parseInt(diceMatch[1]!, 10);
      diceSides = parseInt(diceMatch[2]!, 10);
    }
  }

  return {
    method,
    effect,
    dice: { base: 0, dice: diceNum, sides: diceSides, m_bonus: 0 },
    timesSeen: 0,
  };
}

// ── Flag parsing ──

function parseFlags(flagNames: string[]): BitFlag {
  const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
  for (const name of flagNames) {
    const flag = FLAG_MAP[name];
    if (flag !== undefined) {
      flags.on(flag);
    }
  }
  return flags;
}

// ── Public API ──

/**
 * Parse monster base JSON data into a lookup map.
 *
 * @param rawBases - Array of raw monster base objects from monster_base.json.
 * @returns Map from base name to MonsterBase.
 */
export function parseMonsterBases(rawBases: unknown[]): Map<string, MonsterBase> {
  const map = new Map<string, MonsterBase>();

  for (const raw of rawBases) {
    const entry = raw as RawMonsterBase;
    if (!entry.name) continue;

    const flags = parseFlags(entry.flags ?? []);
    const glyph = entry.glyph ?? "?";

    map.set(entry.name, {
      name: entry.name,
      text: entry.desc ?? entry.name,
      flags,
      dChar: glyph.charCodeAt(0),
    });
  }

  return map;
}

/**
 * Default (fallback) monster base for races whose base name isn't found.
 */
const DEFAULT_BASE: MonsterBase = {
  name: "unknown",
  text: "unknown creature",
  flags: new BitFlag(1),
  dChar: "?".charCodeAt(0),
};

/**
 * Parse monster race JSON data into MonsterRace array.
 *
 * @param rawMonsters - Array of raw monster objects from monster.json.
 * @param bases       - Monster base lookup from parseMonsterBases().
 * @returns Array of MonsterRace instances (skipping the <player> entry).
 */
export function parseMonsterRaces(
  rawMonsters: unknown[],
  bases: Map<string, MonsterBase>,
): MonsterRace[] {
  const races: MonsterRace[] = [];
  let ridx = 0;

  for (const raw of rawMonsters) {
    const entry = raw as RawMonster;
    if (!entry.name || entry.name === "<player>") continue;

    const base = bases.get(entry.base) ?? DEFAULT_BASE;

    // Merge base flags with per-race flags
    const raceFlags = parseFlags(entry.flags ?? []);
    // Copy base flags onto the race flags
    for (let bit = 0; bit < MonsterRaceFlag.RF_MAX; bit++) {
      if (base.flags.has(bit)) {
        raceFlags.on(bit);
      }
    }

    // Parse blows
    const blows: MonsterBlow[] = [];
    if (entry.blow) {
      const blowEntries = Array.isArray(entry.blow) ? entry.blow : [entry.blow];
      for (const b of blowEntries) {
        blows.push(parseBlow(b));
      }
    }

    // Determine display character (from base glyph)
    const dChar = base.dChar;

    // Determine display color
    const dAttr = entry.color ? colorCharToAttr(entry.color) : 1; // default white

    // Parse spell data
    const { spellFlags, hasInnate, hasNonInnate } = parseSpellFlags(entry.spells ?? []);
    const spellFreq = entry["spell-freq"] ? parseInt(entry["spell-freq"], 10) : 0;
    const monsterLevel = parseInt(entry.depth ?? "0", 10) || 0;

    ridx++;
    const race: MonsterRace = {
      ridx: ridx as MonsterRaceId,
      name: entry.name,
      text: entry.desc ?? "",
      plural: null,
      base,
      avgHp: parseInt(entry["hit-points"] ?? "1", 10) || 1,
      ac: parseInt(entry["armor-class"] ?? "0", 10) || 0,
      sleep: parseInt(entry.sleepiness ?? "0", 10) || 0,
      hearing: parseInt(entry.hearing ?? "20", 10) || 20,
      smell: parseInt(entry.smell ?? "0", 10) || 0,
      speed: parseInt(entry.speed ?? "110", 10) || 110,
      light: parseInt(entry.light ?? "0", 10) || 0,
      mexp: parseInt(entry.experience ?? "0", 10) || 0,
      freqInnate: hasInnate ? spellFreq : 0,
      freqSpell: hasNonInnate ? spellFreq : 0,
      spellPower: spellFreq > 0 ? monsterLevel : 0,
      flags: raceFlags,
      spellFlags,
      blows,
      level: monsterLevel,
      rarity: parseInt(entry.rarity ?? "1", 10) || 1,
      dAttr,
      dChar,
      maxNum: raceFlags.has(MonsterRaceFlag.UNIQUE) ? 1 : 100,
      curNum: 0,
      spellMsgs: [],
      drops: [],
      friends: [],
      friendsBase: [],
      mimicKinds: [],
      shapes: [],
      numShapes: 0,
    };

    races.push(race);
  }

  return races;
}
