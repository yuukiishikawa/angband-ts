/**
 * @file data/object-loader.ts
 * @brief Parse object/item JSON data into typed arrays
 *
 * Converts the raw JSON representation of object kinds, brands, slays,
 * artifacts, ego items, and object bases into typed objects usable by
 * the game engine.
 *
 * Follows the same pattern as monster-loader.ts: define raw JSON interfaces,
 * mapping tables, parse functions, and public API.
 */

import { BitFlag } from "../z/index.js";
import { randomValue, type RandomValue } from "../z/rand.js";
import { colorTextToAttr } from "../z/color.js";
import type {
  ObjectKind,
  ObjectKindId,
  ObjectBase,
  Artifact,
  ArtifactId,
  EgoItem,
  EgoItemId,
  Brand,
  Slay,
  Effect,
  Activation,
  Flavor,
  PossItem,
  SVal,
} from "../types/object.js";
import {
  TVal,
  ObjectFlag,
  KindFlag,
  ObjectModifier,
  Element,
  ElementInfoFlag,
} from "../types/object.js";
import type { ElementInfo } from "../types/player.js";
import { MonsterRaceFlag } from "../types/monster.js";

// ── Raw JSON types ──

interface RawObjectBase {
  _type?: string;
  name?: string;
  graphics?: string;
  break?: string;
  "break-chance"?: string;
  "max-stack"?: string;
  flags?: string[];
}

interface RawObject {
  name: string;
  type: string;
  graphics?: string;
  level?: string;
  weight?: string;
  cost?: string;
  alloc?: string;
  attack?: string;
  armor?: string;
  pval?: string;
  flags?: string[];
  values?: string[];
  desc?: string;
  effect?: string | string[];
  dice?: string | string[];
  msg?: string;
  power?: string;
  pile?: string;
  time?: string;
  charges?: string;
  "slay"?: string | string[];
  "brand"?: string | string[];
}

interface RawBrand {
  code?: string;
  name?: string;
  verb?: string;
  multiplier?: string;
  "o-multiplier"?: string;
  power?: string;
  "resist-flag"?: string;
  "vuln-flag"?: string;
}

interface RawSlay {
  code?: string;
  name?: string;
  "race-flag"?: string;
  multiplier?: string;
  "o-multiplier"?: string;
  power?: string;
  "melee-verb"?: string;
  "range-verb"?: string;
}

interface RawArtifact {
  name: string;
  "base-object"?: string;
  graphics?: string;
  level?: string;
  weight?: string;
  cost?: string;
  alloc?: string;
  attack?: string;
  armor?: string;
  flags?: string[];
  values?: string[];
  act?: string;
  time?: string;
  desc?: string;
  brand?: string | string[];
  slay?: string | string[];
}

interface RawEgoItem {
  name: string;
  info?: string;
  alloc?: string;
  type?: string | string[];
  item?: string | string[];
  combat?: string;
  flags?: string[];
  "flags-off"?: string[];
  values?: string[];
  "min-values"?: string;
  slay?: string | string[];
  brand?: string | string[];
  act?: string;
  time?: string;
  desc?: string;
}

// ── TVal name → enum mapping ──

const TVAL_MAP: Record<string, TVal> = {
  none: TVal.NULL,
  chest: TVal.CHEST,
  shot: TVal.SHOT,
  arrow: TVal.ARROW,
  bolt: TVal.BOLT,
  bow: TVal.BOW,
  digger: TVal.DIGGING,
  hafted: TVal.HAFTED,
  polearm: TVal.POLEARM,
  sword: TVal.SWORD,
  boots: TVal.BOOTS,
  gloves: TVal.GLOVES,
  helm: TVal.HELM,
  crown: TVal.CROWN,
  shield: TVal.SHIELD,
  cloak: TVal.CLOAK,
  "soft armor": TVal.SOFT_ARMOR,
  "hard armor": TVal.HARD_ARMOR,
  "dragon armor": TVal.DRAG_ARMOR,
  light: TVal.LIGHT,
  amulet: TVal.AMULET,
  ring: TVal.RING,
  staff: TVal.STAFF,
  wand: TVal.WAND,
  rod: TVal.ROD,
  scroll: TVal.SCROLL,
  potion: TVal.POTION,
  flask: TVal.FLASK,
  food: TVal.FOOD,
  mushroom: TVal.MUSHROOM,
  "magic book": TVal.MAGIC_BOOK,
  "prayer book": TVal.PRAYER_BOOK,
  "nature book": TVal.NATURE_BOOK,
  "shadow book": TVal.SHADOW_BOOK,
  gold: TVal.GOLD,
};

// ── Object flag name → enum mapping ──

const OBJ_FLAG_MAP: Record<string, ObjectFlag> = {
  SUST_STR: ObjectFlag.SUST_STR,
  SUST_INT: ObjectFlag.SUST_INT,
  SUST_WIS: ObjectFlag.SUST_WIS,
  SUST_DEX: ObjectFlag.SUST_DEX,
  SUST_CON: ObjectFlag.SUST_CON,
  PROT_FEAR: ObjectFlag.PROT_FEAR,
  PROT_BLIND: ObjectFlag.PROT_BLIND,
  PROT_CONF: ObjectFlag.PROT_CONF,
  PROT_STUN: ObjectFlag.PROT_STUN,
  SLOW_DIGEST: ObjectFlag.SLOW_DIGEST,
  FEATHER: ObjectFlag.FEATHER,
  REGEN: ObjectFlag.REGEN,
  TELEPATHY: ObjectFlag.TELEPATHY,
  SEE_INVIS: ObjectFlag.SEE_INVIS,
  FREE_ACT: ObjectFlag.FREE_ACT,
  HOLD_LIFE: ObjectFlag.HOLD_LIFE,
  IMPACT: ObjectFlag.IMPACT,
  BLESSED: ObjectFlag.BLESSED,
  BURNS_OUT: ObjectFlag.BURNS_OUT,
  TAKES_FUEL: ObjectFlag.TAKES_FUEL,
  NO_FUEL: ObjectFlag.NO_FUEL,
  IMPAIR_HP: ObjectFlag.IMPAIR_HP,
  IMPAIR_MANA: ObjectFlag.IMPAIR_MANA,
  AFRAID: ObjectFlag.AFRAID,
  NO_TELEPORT: ObjectFlag.NO_TELEPORT,
  AGGRAVATE: ObjectFlag.AGGRAVATE,
  DRAIN_EXP: ObjectFlag.DRAIN_EXP,
  STICKY: ObjectFlag.STICKY,
  FRAGILE: ObjectFlag.FRAGILE,
  LIGHT_2: ObjectFlag.LIGHT_2,
  LIGHT_3: ObjectFlag.LIGHT_3,
  DIG_1: ObjectFlag.DIG_1,
  DIG_2: ObjectFlag.DIG_2,
  DIG_3: ObjectFlag.DIG_3,
  EXPLODE: ObjectFlag.EXPLODE,
  TRAP_IMMUNE: ObjectFlag.TRAP_IMMUNE,
  THROWING: ObjectFlag.THROWING,
  MULTIPLY_WEIGHT: ObjectFlag.MULTIPLY_WEIGHT,
};

// ── Kind flag name → enum mapping ──

const KIND_FLAG_MAP: Record<string, KindFlag> = {
  RAND_HI_RES: KindFlag.RAND_HI_RES,
  RAND_SUSTAIN: KindFlag.RAND_SUSTAIN,
  RAND_POWER: KindFlag.RAND_POWER,
  INSTA_ART: KindFlag.INSTA_ART,
  QUEST_ART: KindFlag.QUEST_ART,
  EASY_KNOW: KindFlag.EASY_KNOW,
  GOOD: KindFlag.GOOD,
  SHOW_DICE: KindFlag.SHOW_DICE,
  SHOW_MULT: KindFlag.SHOW_MULT,
  SHOOTS_SHOTS: KindFlag.SHOOTS_SHOTS,
  SHOOTS_ARROWS: KindFlag.SHOOTS_ARROWS,
  SHOOTS_BOLTS: KindFlag.SHOOTS_BOLTS,
  RAND_BASE_RES: KindFlag.RAND_BASE_RES,
  RAND_RES_POWER: KindFlag.RAND_RES_POWER,
};

// ── Object modifier name → enum mapping ──

const MOD_MAP: Record<string, ObjectModifier> = {
  STR: ObjectModifier.STR,
  INT: ObjectModifier.INT,
  WIS: ObjectModifier.WIS,
  DEX: ObjectModifier.DEX,
  CON: ObjectModifier.CON,
  STEALTH: ObjectModifier.STEALTH,
  SEARCH: ObjectModifier.SEARCH,
  INFRA: ObjectModifier.INFRA,
  TUNNEL: ObjectModifier.TUNNEL,
  SPEED: ObjectModifier.SPEED,
  BLOWS: ObjectModifier.BLOWS,
  SHOTS: ObjectModifier.SHOTS,
  MIGHT: ObjectModifier.MIGHT,
  LIGHT: ObjectModifier.LIGHT,
  DAM_RED: ObjectModifier.DAM_RED,
  MOVES: ObjectModifier.MOVES,
};

// ── Element name → enum mapping (for HATES/IGNORE/RES values) ──

const ELEM_MAP: Record<string, Element> = {
  ACID: Element.ACID,
  ELEC: Element.ELEC,
  FIRE: Element.FIRE,
  COLD: Element.COLD,
  POIS: Element.POIS,
  LIGHT: Element.LIGHT,
  DARK: Element.DARK,
  SOUND: Element.SOUND,
  SHARD: Element.SHARD,
  NEXUS: Element.NEXUS,
  NETHER: Element.NETHER,
  CHAOS: Element.CHAOS,
  DISEN: Element.DISEN,
  WATER: Element.WATER,
  ICE: Element.ICE,
  GRAVITY: Element.GRAVITY,
  INERTIA: Element.INERTIA,
  FORCE: Element.FORCE,
  TIME: Element.TIME,
  PLASMA: Element.PLASMA,
  METEOR: Element.METEOR,
  MISSILE: Element.MISSILE,
  MANA: Element.MANA,
  HOLY_ORB: Element.HOLY_ORB,
  ARROW: Element.ARROW,
};

// ── Parsing helpers ──

/**
 * Parse an allocation string like "70:1 to 100" into {prob, min, max}.
 */
function parseAlloc(s: string): { prob: number; min: number; max: number } {
  // Format: "prob:min to max"
  const colonIdx = s.indexOf(":");
  if (colonIdx === -1) {
    return { prob: parseInt(s, 10) || 0, min: 0, max: 100 };
  }
  const prob = parseInt(s.substring(0, colonIdx), 10) || 0;
  const rest = s.substring(colonIdx + 1).trim();
  const toIdx = rest.indexOf(" to ");
  if (toIdx === -1) {
    return { prob, min: parseInt(rest, 10) || 0, max: 100 };
  }
  const min = parseInt(rest.substring(0, toIdx), 10) || 0;
  const max = parseInt(rest.substring(toIdx + 4), 10) || 100;
  return { prob, min, max };
}

/**
 * Parse an attack string like "2d7:18:16" into {dd, ds, toH, toD}.
 */
function parseAttack(s: string): { dd: number; ds: number; toH: number; toD: number } {
  const parts = s.split(":");
  let dd = 0, ds = 0, toH = 0, toD = 0;
  if (parts[0]) {
    const dice = parts[0].match(/^(\d+)d(\d+)$/);
    if (dice) {
      dd = parseInt(dice[1]!, 10);
      ds = parseInt(dice[2]!, 10);
    }
  }
  if (parts[1]) toH = parseInt(parts[1], 10) || 0;
  if (parts[2]) toD = parseInt(parts[2], 10) || 0;
  return { dd, ds, toH, toD };
}

/**
 * Parse an armor string like "15:10" into {ac, toA}.
 */
function parseArmor(s: string): { ac: number; toA: number } {
  const parts = s.split(":");
  return {
    ac: parseInt(parts[0] ?? "0", 10) || 0,
    toA: parseInt(parts[1] ?? "0", 10) || 0,
  };
}

/**
 * Parse a graphics string like "~:y" or "&:w" into {char, attr}.
 */
function parseGraphics(s: string): { dChar: string; dAttr: number } {
  const parts = s.split(":");
  const dChar = parts[0] ?? "?";
  const dAttr = parts[1] ? colorTextToAttr(parts[1]) : 1;
  return { dChar, dAttr };
}

/**
 * Parse a time/dice expression like "10+d10" or "1d6" into a RandomValue.
 */
function parseDiceExpr(s: string): RandomValue {
  if (!s) return randomValue();

  // Try "base+NdM" pattern
  const plusMatch = s.match(/^(\d+)\+(?:(\d+))?d(\d+)$/);
  if (plusMatch) {
    return randomValue(
      parseInt(plusMatch[1]!, 10),
      parseInt(plusMatch[2] ?? "1", 10),
      parseInt(plusMatch[3]!, 10),
    );
  }

  // Try "NdM" pattern
  const diceMatch = s.match(/^(\d+)d(\d+)$/);
  if (diceMatch) {
    return randomValue(
      0,
      parseInt(diceMatch[1]!, 10),
      parseInt(diceMatch[2]!, 10),
    );
  }

  // Try plain number
  const num = parseInt(s, 10);
  if (!isNaN(num)) {
    return randomValue(num);
  }

  return randomValue();
}

/**
 * Parse values like ["STR[4]", "RES_ACID[1]", "LIGHT[4]"] into
 * modifier and element info arrays.
 */
function parseValues(
  values: string[],
  modifiers: RandomValue[],
  elInfo: ElementInfo[],
): void {
  for (const v of values) {
    // Format: "NAME[value]"
    const match = v.match(/^([A-Z_]+)\[([^\]]+)\]$/);
    if (!match) continue;

    const name = match[1]!;
    const valStr = match[2]!;

    // Check if it's a resistance value (RES_*)
    if (name.startsWith("RES_")) {
      const elemName = name.substring(4);
      const elem = ELEM_MAP[elemName];
      if (elem !== undefined) {
        const level = parseInt(valStr, 10) || 0;
        const entry = elInfo[elem];
        if (entry) {
          // Mutate: set resistance level and RANDOM flags for non-zero
          (entry as { resLevel: number }).resLevel = level;
        }
        continue;
      }
    }

    // Check if it's an object modifier
    const mod = MOD_MAP[name];
    if (mod !== undefined) {
      modifiers[mod] = parseDiceExpr(valStr);
      continue;
    }

    // Check if it's a known element name directly (LIGHT, etc.)
    const elem = ELEM_MAP[name];
    if (elem !== undefined) {
      const level = parseInt(valStr, 10) || 0;
      const entry = elInfo[elem];
      if (entry) {
        (entry as { resLevel: number }).resLevel = level;
      }
    }
  }
}

/**
 * Parse object/kind flag strings into BitFlag instances.
 */
function parseObjFlags(flagNames: string[]): { flags: BitFlag; kindFlags: BitFlag } {
  const flags = new BitFlag(ObjectFlag.MAX);
  const kindFlags = new BitFlag(KindFlag.MAX);

  for (const name of flagNames) {
    const trimmed = name.trim();
    // Try element ignore/hates flags
    if (trimmed.startsWith("IGNORE_")) {
      const elemName = trimmed.substring(7);
      // Handled at element info level, not as object flags
      continue;
    }
    if (trimmed.startsWith("HATES_")) {
      continue;
    }

    const objFlag = OBJ_FLAG_MAP[trimmed];
    if (objFlag !== undefined) {
      flags.on(objFlag);
      continue;
    }

    const kindFlag = KIND_FLAG_MAP[trimmed];
    if (kindFlag !== undefined) {
      kindFlags.on(kindFlag);
      continue;
    }
  }

  return { flags, kindFlags };
}

/**
 * Parse element ignore/hates flags from a flag list into element info.
 */
function parseElementFlags(flagNames: string[], elInfo: ElementInfo[]): void {
  for (const name of flagNames) {
    const trimmed = name.trim();
    if (trimmed.startsWith("IGNORE_")) {
      const elemName = trimmed.substring(7);
      const elem = ELEM_MAP[elemName];
      if (elem !== undefined && elInfo[elem]) {
        elInfo[elem]!.flags.on(ElementInfoFlag.IGNORE);
      }
    } else if (trimmed.startsWith("HATES_")) {
      const elemName = trimmed.substring(6);
      const elem = ELEM_MAP[elemName];
      if (elem !== undefined && elInfo[elem]) {
        elInfo[elem]!.flags.on(ElementInfoFlag.HATES);
      }
    }
  }
}

/**
 * Create a fresh array of blank ElementInfo entries.
 */
function makeElementInfoArray(): ElementInfo[] {
  const arr: ElementInfo[] = [];
  for (let i = 0; i < Element.MAX; i++) {
    arr.push({ resLevel: 0, flags: new BitFlag(8) });
  }
  return arr;
}

/**
 * Parse brand/slay string references into boolean arrays.
 */
function parseBrandRefs(
  refs: string | string[] | undefined,
  brandCodeMap: Map<string, number>,
  totalBrands: number,
): boolean[] | null {
  if (!refs) return null;
  const codes = Array.isArray(refs) ? refs : [refs];
  if (codes.length === 0) return null;

  const arr = new Array<boolean>(totalBrands).fill(false);
  let any = false;
  for (const code of codes) {
    const idx = brandCodeMap.get(code.trim());
    if (idx !== undefined) {
      arr[idx] = true;
      any = true;
    }
  }
  return any ? arr : null;
}

function parseSlayRefs(
  refs: string | string[] | undefined,
  slayCodeMap: Map<string, number>,
  totalSlays: number,
): boolean[] | null {
  if (!refs) return null;
  const codes = Array.isArray(refs) ? refs : [refs];
  if (codes.length === 0) return null;

  const arr = new Array<boolean>(totalSlays).fill(false);
  let any = false;
  for (const code of codes) {
    const idx = slayCodeMap.get(code.trim());
    if (idx !== undefined) {
      arr[idx] = true;
      any = true;
    }
  }
  return any ? arr : null;
}

// ── Monster race flag name → numeric index (for brand resist/vuln) ──

const MONSTER_FLAG_MAP: Record<string, number> = {
  IM_ACID: MonsterRaceFlag.IM_ACID,
  IM_ELEC: MonsterRaceFlag.IM_ELEC,
  IM_FIRE: MonsterRaceFlag.IM_FIRE,
  IM_COLD: MonsterRaceFlag.IM_COLD,
  IM_POIS: MonsterRaceFlag.IM_POIS,
  HURT_FIRE: MonsterRaceFlag.HURT_FIRE,
  HURT_COLD: MonsterRaceFlag.HURT_COLD,
  HURT_LIGHT: MonsterRaceFlag.HURT_LIGHT,
  HURT_ROCK: MonsterRaceFlag.HURT_ROCK,
  EVIL: MonsterRaceFlag.EVIL,
  ANIMAL: MonsterRaceFlag.ANIMAL,
  ORC: MonsterRaceFlag.ORC,
  TROLL: MonsterRaceFlag.TROLL,
  GIANT: MonsterRaceFlag.GIANT,
  DRAGON: MonsterRaceFlag.DRAGON,
  DEMON: MonsterRaceFlag.DEMON,
  UNDEAD: MonsterRaceFlag.UNDEAD,
};

// ── Public API ──

/**
 * Parse object_base.json data into ObjectBase lookup.
 *
 * The JSON uses an offset structure: the first entry may have a _type: "defaults"
 * field, and each subsequent entry has a "name" field of format "tvalName:displayName".
 *
 * @param rawBases - Array of raw object base entries from object_base.json.
 * @returns Map from tval name (lowercase) to ObjectBase.
 */
export function parseObjectBases(rawBases: unknown[]): Map<string, ObjectBase> {
  const map = new Map<string, ObjectBase>();

  let defaultBreak = 10;
  let defaultMaxStack = 40;
  let svalCounters = new Map<TVal, number>();

  for (const raw of rawBases) {
    const entry = raw as RawObjectBase;

    // Handle defaults entry
    if (entry._type === "defaults") {
      if (entry["break-chance"]) defaultBreak = parseInt(entry["break-chance"], 10) || 10;
      if (entry["max-stack"]) defaultMaxStack = parseInt(entry["max-stack"], 10) || 40;
      continue;
    }

    if (!entry.name) continue;

    // Parse "tvalName:displayName" format
    const colonIdx = entry.name.indexOf(":");
    let tvalName: string;
    if (colonIdx >= 0) {
      tvalName = entry.name.substring(0, colonIdx);
    } else {
      tvalName = entry.name;
    }

    const tval = TVAL_MAP[tvalName] ?? TVal.NULL;

    // Parse flags
    const { flags, kindFlags } = parseObjFlags(entry.flags ?? []);
    const elInfo = makeElementInfoArray();
    parseElementFlags(entry.flags ?? [], elInfo);

    // Parse breakage
    const breakPerc = entry.break !== undefined
      ? parseInt(entry.break, 10) || 0
      : defaultBreak;

    // Determine color from graphics
    const attr = entry.graphics ? colorTextToAttr(entry.graphics) : 1;

    // Track number of svals
    const curSvals = svalCounters.get(tval) ?? 0;
    svalCounters.set(tval, curSvals);

    const base: ObjectBase = {
      name: tvalName,
      tval,
      attr,
      flags,
      kindFlags,
      elInfo,
      breakPerc,
      maxStack: defaultMaxStack,
      numSvals: 0, // Will be updated during object kind parsing
    };

    map.set(tvalName, base);
  }

  return map;
}

/**
 * Parse brand.json data into Brand array.
 *
 * The JSON uses an offset structure: the first entry's code field
 * names the code for the NEXT entry (not itself). Each subsequent
 * entry has name/verb/multiplier fields plus the code for the entry after it.
 *
 * @param rawBrands - Array of raw brand entries from brand.json.
 * @returns Array of Brand objects and a Map from code→index.
 */
export function parseBrands(rawBrands: unknown[]): {
  brands: Brand[];
  brandCodeMap: Map<string, number>;
} {
  const brands: Brand[] = [];
  const brandCodeMap = new Map<string, number>();

  // The offset structure: entry[0].code is the code for brand[0] (the first real brand),
  // entry[1] has name/verb/etc and .code is for brand[1], etc.
  // The first entry only has a code field — it names the first real brand.
  // Each subsequent entry has data for a brand and the code for the next.

  let nextCode: string | undefined;

  for (const raw of rawBrands) {
    const entry = raw as RawBrand;

    if (!entry.name && entry.code) {
      // First entry — only has a code (naming the next brand)
      nextCode = entry.code;
      continue;
    }

    if (!entry.name) continue;

    const code = nextCode ?? "";
    nextCode = entry.code; // This entry's code names the NEXT brand

    const brand: Brand = {
      code,
      name: entry.name,
      verb: entry.verb ?? "",
      resistFlag: entry["resist-flag"] ? (MONSTER_FLAG_MAP[entry["resist-flag"]] ?? 0) : 0,
      vulnFlag: entry["vuln-flag"] ? (MONSTER_FLAG_MAP[entry["vuln-flag"]] ?? 0) : 0,
      multiplier: parseInt(entry.multiplier ?? "0", 10) || 0,
      oMultiplier: parseInt(entry["o-multiplier"] ?? "0", 10) || 0,
      power: parseInt(entry.power ?? "0", 10) || 0,
    };

    brandCodeMap.set(code, brands.length);
    brands.push(brand);
  }

  return { brands, brandCodeMap };
}

/**
 * Parse slay.json data into Slay array.
 *
 * Same offset structure as brands: first entry has only a code field.
 *
 * @param rawSlays - Array of raw slay entries from slay.json.
 * @returns Array of Slay objects and a Map from code→index.
 */
export function parseSlays(rawSlays: unknown[]): {
  slays: Slay[];
  slayCodeMap: Map<string, number>;
} {
  const slays: Slay[] = [];
  const slayCodeMap = new Map<string, number>();

  let nextCode: string | undefined;

  for (const raw of rawSlays) {
    const entry = raw as RawSlay;

    if (!entry.name && entry.code) {
      nextCode = entry.code;
      continue;
    }

    if (!entry.name) continue;

    const code = nextCode ?? "";
    nextCode = entry.code;

    const slay: Slay = {
      code,
      name: entry.name,
      base: "", // Slays use race-flag, not base
      meleeVerb: entry["melee-verb"] ?? "hit",
      rangeVerb: entry["range-verb"] ?? "hits",
      raceFlag: entry["race-flag"] ? (MONSTER_FLAG_MAP[entry["race-flag"]] ?? 0) : 0,
      multiplier: parseInt(entry.multiplier ?? "0", 10) || 0,
      oMultiplier: parseInt(entry["o-multiplier"] ?? "0", 10) || 0,
      power: parseInt(entry.power ?? "0", 10) || 0,
    };

    slayCodeMap.set(code, slays.length);
    slays.push(slay);
  }

  return { slays, slayCodeMap };
}

// ── Effect Chain Parsing ──

import { EffectType } from "../effect/handler.js";
import { TimedEffect } from "../types/player.js";

/** Map effect name strings to EffectType enum values. */
const EFFECT_NAME_MAP: Record<string, number> = {
  HEAL_HP: EffectType.HEAL_HP,
  CURE: EffectType.CURE,
  NOURISH: EffectType.NOURISH,
  CRUNCH: EffectType.CRUNCH,
  TIMED_SET: EffectType.TIMED_SET,
  TIMED_INC: EffectType.TIMED_INC,
  TIMED_INC_NO_RES: EffectType.TIMED_INC_NO_RES,
  TIMED_DEC: EffectType.TIMED_DEC,
  RESTORE_STAT: EffectType.RESTORE_STAT,
  DRAIN_STAT: EffectType.DRAIN_STAT,
  GAIN_STAT: EffectType.GAIN_STAT,
  RESTORE_EXP: EffectType.RESTORE_EXP,
  GAIN_EXP: EffectType.GAIN_EXP,
  RESTORE_MANA: EffectType.RESTORE_MANA,
  DAMAGE: EffectType.DAMAGE,
  TELEPORT: EffectType.TELEPORT,
  TELEPORT_LEVEL: EffectType.TELEPORT_LEVEL,
  RECALL: EffectType.RECALL,
  DEEP_DESCENT: EffectType.DEEP_DESCENT,
  MAP_AREA: EffectType.MAP_AREA,
  DETECT_TRAPS: EffectType.DETECT_TRAPS,
  DETECT_DOORS: EffectType.DETECT_DOORS,
  DETECT_STAIRS: EffectType.DETECT_STAIRS,
  DETECT_GOLD: EffectType.DETECT_GOLD,
  DETECT_OBJECTS: EffectType.DETECT_OBJECTS,
  DETECT_VISIBLE_MONSTERS: EffectType.DETECT_VISIBLE_MONSTERS,
  DETECT_INVISIBLE_MONSTERS: EffectType.DETECT_INVISIBLE_MONSTERS,
  DETECT_EVIL: EffectType.DETECT_EVIL,
  IDENTIFY: EffectType.IDENTIFY,
  LIGHT_AREA: EffectType.LIGHT_AREA,
  LIGHT_LEVEL: EffectType.LIGHT_LEVEL,
  REMOVE_CURSE: EffectType.REMOVE_CURSE,
  RECHARGE: EffectType.RECHARGE,
  ENCHANT: EffectType.ENCHANT,
  BOLT: EffectType.BOLT,
  BEAM: EffectType.BEAM,
  BOLT_OR_BEAM: EffectType.BOLT_OR_BEAM,
  BALL: EffectType.BALL,
  BREATH: EffectType.BREATH,
  ARC: EffectType.ARC,
  LINE: EffectType.LINE,
  STAR: EffectType.STAR,
  SPHERE: EffectType.SPHERE,
  PROJECT_LOS: EffectType.PROJECT_LOS,
  PROJECT_LOS_AWARE: EffectType.PROJECT_LOS_AWARE,
  BOLT_STATUS: EffectType.BOLT_STATUS,
  BOLT_STATUS_DAM: EffectType.BOLT_STATUS_DAM,
  BOLT_AWARE: EffectType.BOLT_AWARE,
  TOUCH: EffectType.TOUCH,
  SUMMON: EffectType.SUMMON,
  BANISH: EffectType.BANISH,
  MASS_BANISH: EffectType.MASS_BANISH,
  GLYPH: EffectType.GLYPH,
  DESTRUCTION: EffectType.DESTRUCTION,
  EARTHQUAKE: EffectType.EARTHQUAKE,
  WONDER: EffectType.WONDER,
  SELECT: EffectType.SELECT,
  SET_VALUE: EffectType.SET_VALUE,
  CLEAR_VALUE: EffectType.CLEAR_VALUE,
  RANDOM: EffectType.RANDOM,
  SHAPECHANGE: EffectType.SHAPECHANGE,
  ACQUIRE: EffectType.ACQUIRE,
  WAKE: EffectType.WAKE,
  PROBE: EffectType.PROBE,
  DARKEN_AREA: EffectType.DARKEN_AREA,
  SENSE_GOLD: EffectType.SENSE_GOLD,
  SENSE_OBJECTS: EffectType.SENSE_OBJECTS,
  DETECT_ORE: EffectType.DETECT_ORE,
  LOSE_RANDOM_STAT: EffectType.LOSE_RANDOM_STAT,
  DRAIN_MANA: EffectType.DRAIN_MANA,
  DRAIN_LIGHT: EffectType.DRAIN_LIGHT,
  CURSE_ARMOR: EffectType.CURSE_ARMOR,
  CURSE_WEAPON: EffectType.CURSE_WEAPON,
};

/** Map timed effect subtype names to TimedEffect enum values. */
const TIMED_SUBTYPE_MAP: Record<string, number> = {
  FAST: TimedEffect.FAST,
  SLOW: TimedEffect.SLOW,
  BLIND: TimedEffect.BLIND,
  PARALYZED: TimedEffect.PARALYZED,
  CONFUSED: TimedEffect.CONFUSED,
  AFRAID: TimedEffect.AFRAID,
  IMAGE: TimedEffect.IMAGE,
  POISONED: TimedEffect.POISONED,
  CUT: TimedEffect.CUT,
  STUN: TimedEffect.STUN,
  FOOD: TimedEffect.FOOD,
  PROTEVIL: TimedEffect.PROTEVIL,
  INVULN: TimedEffect.INVULN,
  HERO: TimedEffect.HERO,
  SHERO: TimedEffect.SHERO,
  SHIELD: TimedEffect.SHIELD,
  BLESSED: TimedEffect.BLESSED,
  SINVIS: TimedEffect.SINVIS,
  SINFRA: TimedEffect.SINFRA,
  AMNESIA: 19,
  STONESKIN: 20,
  TERROR: 21,
  SPRINT: 22,
  BOLD: 23,
};

/** Map nourish subtype names to numeric values. */
const NOURISH_SUBTYPE_MAP: Record<string, number> = {
  INC_BY: 0,
  INC_TO: 1,
  SET_TO: 2,
};

/** Set of effect types that do NOT consume a dice entry. */
const NO_DICE_EFFECTS = new Set([
  EffectType.CURE,
  EffectType.RESTORE_EXP,
  EffectType.IDENTIFY,
  EffectType.MAP_AREA,
  EffectType.LIGHT_LEVEL,
  EffectType.DETECT_TRAPS,
  EffectType.DETECT_DOORS,
  EffectType.DETECT_STAIRS,
]);

/**
 * Parse an effect string like "HEAL_HP" or "CURE:BLIND" or "TIMED_INC:FAST:0:5"
 * into its components.
 */
function parseEffectString(s: string): { index: number; subtype: number; radius: number; other: number } {
  const parts = s.split(":");
  const typeName = parts[0]!;
  const index = EFFECT_NAME_MAP[typeName] ?? 0;

  let subtype = 0;
  if (parts[1]) {
    // Subtype depends on effect type
    if (index === EffectType.CURE || index === EffectType.TIMED_SET ||
        index === EffectType.TIMED_INC || index === EffectType.TIMED_INC_NO_RES ||
        index === EffectType.TIMED_DEC) {
      subtype = TIMED_SUBTYPE_MAP[parts[1]] ?? 0;
    } else if (index === EffectType.NOURISH) {
      subtype = NOURISH_SUBTYPE_MAP[parts[1]] ?? 0;
    } else {
      // Many effects use projection type as subtype — just parse as number or 0
      subtype = parseInt(parts[1], 10) || 0;
    }
  }

  const radius = parts[2] ? (parseInt(parts[2], 10) || 0) : 0;
  const other = parts[3] ? (parseInt(parts[3], 10) || 0) : 0;

  return { index, subtype, radius, other };
}

/**
 * Parse an effect chain from raw effect and dice arrays.
 * Builds a linked list of Effect objects.
 */
function parseEffectChain(
  rawEffects: string | string[] | undefined,
  rawDice: string | string[] | undefined,
): Effect | null {
  if (!rawEffects) return null;

  const effects = Array.isArray(rawEffects) ? rawEffects : [rawEffects];
  const diceArr = rawDice ? (Array.isArray(rawDice) ? rawDice : [rawDice]) : [];

  let diceIdx = 0;

  // Build from the end to create the linked list
  const parsed: Effect[] = [];
  for (const effStr of effects) {
    const { index, subtype, radius, other } = parseEffectString(effStr);

    let dice: RandomValue | null = null;
    if (!NO_DICE_EFFECTS.has(index) && diceIdx < diceArr.length) {
      dice = parseDiceExpr(diceArr[diceIdx]!);
      diceIdx++;
    }

    parsed.push({
      index,
      dice,
      y: 0,
      x: 0,
      subtype,
      radius,
      other,
      msg: null,
      next: null,
    });
  }

  // Link them into a chain
  for (let i = parsed.length - 2; i >= 0; i--) {
    (parsed[i] as { next: Effect | null }).next = parsed[i + 1]!;
  }

  return parsed[0] ?? null;
}

/**
 * Parse object.json data into ObjectKind array.
 *
 * @param rawObjects - Array of raw object entries from object.json.
 * @param bases      - Object base lookup from parseObjectBases().
 * @param brandCodeMap - Brand code→index map from parseBrands().
 * @param slayCodeMap  - Slay code→index map from parseSlays().
 * @param totalBrands  - Total number of brands.
 * @param totalSlays   - Total number of slays.
 * @returns Array of ObjectKind instances.
 */
export function parseObjectKinds(
  rawObjects: unknown[],
  bases: Map<string, ObjectBase>,
  brandCodeMap: Map<string, number>,
  slayCodeMap: Map<string, number>,
  totalBrands: number,
  totalSlays: number,
): ObjectKind[] {
  const kinds: ObjectKind[] = [];
  const svalCounters = new Map<TVal, number>();
  let kidx = 0;

  for (const raw of rawObjects) {
    const entry = raw as RawObject;
    if (!entry.name) continue;

    const typeName = entry.type ?? "none";
    const base = bases.get(typeName) ?? null;
    const tval = TVAL_MAP[typeName] ?? TVal.NULL;

    // Track sval per tval
    const sval = (svalCounters.get(tval) ?? 0) as SVal;
    svalCounters.set(tval, sval + 1);

    // Parse graphics
    let dChar = "?";
    let dAttr = 1;
    if (entry.graphics) {
      const g = parseGraphics(entry.graphics);
      dChar = g.dChar;
      dAttr = g.dAttr;
    }

    // Parse allocation
    const alloc = entry.alloc ? parseAlloc(entry.alloc) : { prob: 0, min: 0, max: 0 };

    // Parse attack
    const attack = entry.attack ? parseAttack(entry.attack) : { dd: 0, ds: 0, toH: 0, toD: 0 };

    // Parse armor
    const armor = entry.armor ? parseArmor(entry.armor) : { ac: 0, toA: 0 };

    // Parse flags
    const { flags, kindFlags } = parseObjFlags(entry.flags ?? []);

    // Merge base flags
    if (base) {
      flags.union(base.flags);
      kindFlags.union(base.kindFlags);
    }

    // Parse element info (including from base)
    const elInfo = makeElementInfoArray();
    if (base) {
      for (let i = 0; i < Element.MAX; i++) {
        const baseEl = base.elInfo[i];
        if (baseEl) {
          elInfo[i]!.flags.union(baseEl.flags);
        }
      }
    }
    parseElementFlags(entry.flags ?? [], elInfo);

    // Parse modifiers from values
    const modifiers: RandomValue[] = new Array(ObjectModifier.MAX).fill(null).map(() => randomValue());
    parseValues(entry.values ?? [], modifiers, elInfo);

    // Parse brands/slays
    const brands = parseBrandRefs(entry.brand, brandCodeMap, totalBrands);
    const slays = parseSlayRefs(entry.slay, slayCodeMap, totalSlays);

    // Parse pile (genMultProb and stackSize)
    // pile can be a string "prob:dice" or an array of such strings (use first)
    let genMultProb = 0;
    let stackSize = randomValue(1);
    if (entry.pile) {
      const pileStr = Array.isArray(entry.pile) ? entry.pile[0] : entry.pile;
      if (typeof pileStr === "string") {
        const pileMatch = pileStr.match(/^(\d+):(.+)$/);
        if (pileMatch) {
          genMultProb = parseInt(pileMatch[1]!, 10) || 0;
          stackSize = parseDiceExpr(pileMatch[2]!);
        }
      }
    }

    // Parse time
    const time = entry.time ? parseDiceExpr(entry.time) : randomValue();

    // Parse charges
    const charge = entry.charges ? parseDiceExpr(entry.charges) : randomValue();

    // Parse pval
    const pval = entry.pval ? parseDiceExpr(entry.pval) : randomValue();

    const kind: ObjectKind = {
      name: entry.name,
      text: entry.desc ?? "",
      base,
      kidx: kidx as ObjectKindId,
      tval,
      sval,
      pval,
      toH: randomValue(attack.toH),
      toD: randomValue(attack.toD),
      toA: randomValue(armor.toA),
      ac: armor.ac,
      dd: attack.dd,
      ds: attack.ds,
      weight: parseInt(entry.weight ?? "0", 10) || 0,
      cost: parseInt(entry.cost ?? "0", 10) || 0,
      flags,
      kindFlags,
      modifiers,
      elInfo,
      brands,
      slays,
      curses: null,
      dAttr,
      dChar,
      allocProb: alloc.prob,
      allocMin: alloc.min,
      allocMax: alloc.max,
      level: parseInt(entry.level ?? "0", 10) || 0,
      activation: null, // TODO: activation lookup
      effect: parseEffectChain(entry.effect, entry.dice),
      power: parseInt(entry.power ?? "0", 10) || 0,
      effectMsg: entry.msg ?? null,
      visMsg: null,
      time,
      charge,
      genMultProb,
      stackSize,
      flavor: null,
      noteAware: 0 as any,
      noteUnaware: 0 as any,
      aware: false,
      tried: false,
      ignore: 0,
      everseen: false,
    };

    kinds.push(kind);
    kidx++;
  }

  return kinds;
}

/**
 * Parse artifact.json data into Artifact array.
 *
 * @param rawArtifacts - Array of raw artifact entries from artifact.json.
 * @param kinds        - Parsed object kinds (for base-object resolution).
 * @param brandCodeMap - Brand code→index map.
 * @param slayCodeMap  - Slay code→index map.
 * @param totalBrands  - Total number of brands.
 * @param totalSlays   - Total number of slays.
 * @returns Array of Artifact instances.
 */
export function parseArtifacts(
  rawArtifacts: unknown[],
  kinds: readonly ObjectKind[],
  brandCodeMap: Map<string, number>,
  slayCodeMap: Map<string, number>,
  totalBrands: number,
  totalSlays: number,
): Artifact[] {
  const artifacts: Artifact[] = [];

  // Build a lookup: "tvalName:kindName" → ObjectKind
  const kindLookup = new Map<string, ObjectKind>();
  for (const kind of kinds) {
    if (kind.base) {
      kindLookup.set(`${kind.base.name}:${kind.name.replace(/^& /, "").replace(/~$/g, "").trim()}`, kind);
    }
  }

  let aidx = 0;
  for (const raw of rawArtifacts) {
    const entry = raw as RawArtifact;
    if (!entry.name) continue;

    // Resolve base-object reference like "sword:Dagger" or "light:Phial"
    let tval = TVal.NULL;
    let sval = 0 as SVal;
    let baseWeight = 0;
    let baseAc = 0;
    let baseDd = 0;
    let baseDs = 0;

    if (entry["base-object"]) {
      const baseKind = kindLookup.get(entry["base-object"]);
      if (baseKind) {
        tval = baseKind.tval;
        sval = baseKind.sval;
        baseWeight = baseKind.weight;
        baseAc = baseKind.ac;
        baseDd = baseKind.dd;
        baseDs = baseKind.ds;
      } else {
        // Try to at least get the tval from the base-object prefix
        const colonIdx = entry["base-object"].indexOf(":");
        if (colonIdx >= 0) {
          const tvalName = entry["base-object"].substring(0, colonIdx);
          tval = TVAL_MAP[tvalName] ?? TVal.NULL;
        }
      }
    }

    // Parse allocation
    const alloc = entry.alloc ? parseAlloc(entry.alloc) : { prob: 0, min: 0, max: 0 };

    // Parse attack
    const attack = entry.attack ? parseAttack(entry.attack) : { dd: baseDd, ds: baseDs, toH: 0, toD: 0 };

    // Parse armor
    const armor = entry.armor ? parseArmor(entry.armor) : { ac: baseAc, toA: 0 };

    // Parse flags
    const { flags } = parseObjFlags(entry.flags ?? []);

    // Parse element info + modifiers
    const elInfo = makeElementInfoArray();
    parseElementFlags(entry.flags ?? [], elInfo);

    // For artifacts, modifiers are fixed numbers (not RandomValue)
    const modifiers: number[] = new Array(ObjectModifier.MAX).fill(0);
    // Parse values into temp RandomValue array, then extract base
    const tempMods: RandomValue[] = new Array(ObjectModifier.MAX).fill(null).map(() => randomValue());
    parseValues(entry.values ?? [], tempMods, elInfo);
    for (let i = 0; i < ObjectModifier.MAX; i++) {
      modifiers[i] = tempMods[i]!.base;
    }

    // Parse brands/slays
    const brands = parseBrandRefs(entry.brand, brandCodeMap, totalBrands);
    const slays = parseSlayRefs(entry.slay, slayCodeMap, totalSlays);

    // Parse time
    const time = entry.time ? parseDiceExpr(entry.time) : randomValue();

    const artifact: Artifact = {
      name: entry.name,
      text: entry.desc ?? "",
      aidx: aidx as ArtifactId,
      tval,
      sval,
      toH: attack.toH,
      toD: attack.toD,
      toA: armor.toA,
      ac: armor.ac,
      dd: attack.dd,
      ds: attack.ds,
      weight: parseInt(entry.weight ?? String(baseWeight), 10) || baseWeight,
      cost: parseInt(entry.cost ?? "0", 10) || 0,
      flags,
      modifiers,
      elInfo,
      brands,
      slays,
      curses: null,
      level: parseInt(entry.level ?? "0", 10) || 0,
      allocProb: alloc.prob,
      allocMin: alloc.min,
      allocMax: alloc.max,
      activation: null, // TODO: activation lookup
      altMsg: null,
      time,
    };

    artifacts.push(artifact);
    aidx++;
  }

  return artifacts;
}

/**
 * Parse ego_item.json data into EgoItem array.
 *
 * @param rawEgos     - Array of raw ego item entries from ego_item.json.
 * @param kinds       - Parsed object kinds (for possItems resolution).
 * @param bases       - Object base lookup (for type matching).
 * @param brandCodeMap - Brand code→index map.
 * @param slayCodeMap  - Slay code→index map.
 * @param totalBrands  - Total number of brands.
 * @param totalSlays   - Total number of slays.
 * @returns Array of EgoItem instances.
 */
export function parseEgoItems(
  rawEgos: unknown[],
  kinds: readonly ObjectKind[],
  bases: Map<string, ObjectBase>,
  brandCodeMap: Map<string, number>,
  slayCodeMap: Map<string, number>,
  totalBrands: number,
  totalSlays: number,
): EgoItem[] {
  const egoItems: EgoItem[] = [];

  // Build kind lookup for "item" field: "tvalName:kindName" → ObjectKind
  const kindByName = new Map<string, ObjectKind>();
  for (const kind of kinds) {
    if (kind.base) {
      const cleanName = kind.name.replace(/^& /, "").replace(/~$/g, "").trim();
      kindByName.set(`${kind.base.name}:${cleanName}`, kind);
    }
  }

  let eidx = 0;
  for (const raw of rawEgos) {
    const entry = raw as RawEgoItem;
    if (!entry.name) continue;

    // Parse info "cost:rating"
    let cost = 0, rating = 0;
    if (entry.info) {
      const infoParts = entry.info.split(":");
      cost = parseInt(infoParts[0] ?? "0", 10) || 0;
      rating = parseInt(infoParts[1] ?? "0", 10) || 0;
    }

    // Parse allocation
    const alloc = entry.alloc ? parseAlloc(entry.alloc) : { prob: 0, min: 0, max: 0 };

    // Parse flags
    const { flags, kindFlags } = parseObjFlags(entry.flags ?? []);
    const { flags: flagsOff } = parseObjFlags(entry["flags-off"] ?? []);

    // Parse element info + modifiers
    const elInfo = makeElementInfoArray();
    parseElementFlags(entry.flags ?? [], elInfo);
    const modifiers: RandomValue[] = new Array(ObjectModifier.MAX).fill(null).map(() => randomValue());
    parseValues(entry.values ?? [], modifiers, elInfo);

    // Parse min-values like "STEALTH[0] | LIGHT[-4]" or "WIS[0]"
    const minModifiers: number[] = new Array(ObjectModifier.MAX).fill(0);
    if (entry["min-values"]) {
      const parts = entry["min-values"].split("|").map(s => s.trim());
      for (const part of parts) {
        const match = part.match(/^([A-Z_]+)\[(-?\d+)\]$/);
        if (match) {
          const mod = MOD_MAP[match[1]!];
          if (mod !== undefined) {
            minModifiers[mod] = parseInt(match[2]!, 10) || 0;
          }
        }
      }
    }

    // Parse combat "d6:d6:d4" → toH, toD, toA as RandomValues
    let toH = randomValue(), toD = randomValue(), toA = randomValue();
    let minToH = 255, minToD = 255, minToA = 255; // 255 = NO_MINIMUM
    if (entry.combat) {
      const combatParts = entry.combat.split(":");
      if (combatParts[0]) toH = parseDiceExpr(combatParts[0]);
      if (combatParts[1]) toD = parseDiceExpr(combatParts[1]);
      if (combatParts[2]) toA = parseDiceExpr(combatParts[2]);
      // If combat is specified, minimums are 0 (not NO_MINIMUM)
      minToH = 0;
      minToD = 0;
      minToA = 0;
    }

    // Parse brands/slays
    const brands = parseBrandRefs(entry.brand, brandCodeMap, totalBrands);
    const slays = parseSlayRefs(entry.slay, slayCodeMap, totalSlays);

    // Build possItems from "type" and "item" fields
    const possItems: PossItem[] = [];

    // "type" field matches tval names → all kinds of that type
    if (entry.type) {
      const types = Array.isArray(entry.type) ? entry.type : [entry.type];
      for (const typeName of types) {
        for (const kind of kinds) {
          if (kind.base && kind.base.name === typeName) {
            possItems.push({ kidx: kind.kidx });
          }
        }
      }
    }

    // "item" field matches specific kinds: "tval:kindName"
    if (entry.item) {
      const items = Array.isArray(entry.item) ? entry.item : [entry.item];
      for (const itemRef of items) {
        const kind = kindByName.get(itemRef);
        if (kind) {
          // Only add if not already present
          if (!possItems.some(p => p.kidx === kind.kidx)) {
            possItems.push({ kidx: kind.kidx });
          }
        }
      }
    }

    // Parse time
    const time = entry.time ? parseDiceExpr(entry.time) : randomValue();

    const ego: EgoItem = {
      name: entry.name,
      text: entry.desc ?? "",
      eidx: eidx as EgoItemId,
      cost,
      flags,
      flagsOff,
      kindFlags,
      modifiers,
      minModifiers,
      elInfo,
      brands,
      slays,
      curses: null,
      rating,
      allocProb: alloc.prob,
      allocMin: alloc.min,
      allocMax: alloc.max,
      possItems,
      toH,
      toD,
      toA,
      minToH,
      minToD,
      minToA,
      activation: null, // TODO: activation lookup
      time,
      everseen: false,
    };

    egoItems.push(ego);
    eidx++;
  }

  return egoItems;
}
