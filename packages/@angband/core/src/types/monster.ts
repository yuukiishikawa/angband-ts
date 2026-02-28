/**
 * @file types/monster.ts
 * @brief Monster type definitions — interfaces, enums, and type aliases
 *
 * Port of monster.h, mon-lore.h, mon-blows.h and related list headers.
 *
 * Copyright (c) 2007 Andi Sidwell
 * Copyright (c) 2010 Chris Carr
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Loc, BitFlag, RandomValue } from "../z/index.js";
import type { MonsterId } from "./cave.js";

// ---------------------------------------------------------------------------
// Branded numeric IDs
// ---------------------------------------------------------------------------

// MonsterId is defined in cave.ts and re-exported here for convenience.
export type { MonsterId } from "./cave.js";

/** Index into the monster race (species) table. */
export type MonsterRaceId = number & { readonly __brand: "MonsterRaceId" };

// ---------------------------------------------------------------------------
// MonsterRaceFlag  (from list-mon-race-flags.h)
// ---------------------------------------------------------------------------

/**
 * Monster race property / ability flags.
 *
 * Values mirror the C `RF_*` enum (0-based).
 */
export const enum MonsterRaceFlag {
  NONE = 0,

  /* Obvious (RFT_OBV) */
  UNIQUE,
  QUESTOR,
  MALE,
  FEMALE,
  GROUP_AI,
  NAME_COMMA,

  /* Display (RFT_DISP) */
  CHAR_CLEAR,
  ATTR_RAND,
  ATTR_CLEAR,
  ATTR_MULTI,
  ATTR_FLICKER,

  /* Generation (RFT_GEN) */
  FORCE_DEPTH,
  FORCE_SLEEP,
  FORCE_EXTRA,
  SEASONAL,

  /* Noteworthy (RFT_NOTE) */
  UNAWARE,
  MULTIPLY,
  REGENERATE,

  /* Behaviour (RFT_BEHAV) */
  FRIGHTENED,
  NEVER_BLOW,
  NEVER_MOVE,
  RAND_25,
  RAND_50,
  MIMIC_INV,
  STUPID,
  SMART,
  SPIRIT,
  POWERFUL,

  /* Drops (RFT_DROP) */
  ONLY_GOLD,
  ONLY_ITEM,
  DROP_40,
  DROP_60,
  DROP_1,
  DROP_2,
  DROP_3,
  DROP_4,
  DROP_GOOD,
  DROP_GREAT,
  DROP_20,

  /* Detection (RFT_DET) */
  INVISIBLE,
  COLD_BLOOD,
  EMPTY_MIND,
  WEIRD_MIND,

  /* Environment / alteration (RFT_ALTER) */
  OPEN_DOOR,
  BASH_DOOR,
  PASS_WALL,
  KILL_WALL,
  SMASH_WALL,
  MOVE_BODY,
  KILL_BODY,
  TAKE_ITEM,
  KILL_ITEM,
  CLEAR_WEB,
  PASS_WEB,

  /* Race noun (RFT_RACE_N) */
  ORC,
  TROLL,
  GIANT,
  DRAGON,
  DEMON,

  /* Race adjective (RFT_RACE_A) */
  ANIMAL,
  EVIL,
  UNDEAD,
  NONLIVING,
  METAL,

  /* Vulnerabilities (RFT_VULN / RFT_VULN_I) */
  HURT_LIGHT,
  HURT_ROCK,
  HURT_FIRE,
  HURT_COLD,

  /* Elemental resistances (RFT_RES) */
  IM_ACID,
  IM_ELEC,
  IM_FIRE,
  IM_COLD,
  IM_POIS,
  IM_NETHER,
  IM_WATER,
  IM_PLASMA,
  IM_NEXUS,
  IM_DISEN,

  /* Status protections (RFT_PROT) */
  NO_FEAR,
  NO_STUN,
  NO_CONF,
  NO_SLEEP,
  NO_HOLD,
  NO_SLOW,

  RF_MAX,
}

/**
 * Categories that classify the race flags.
 */
export const enum MonsterFlagType {
  NONE = 0,
  OBV,
  DISP,
  GEN,
  NOTE,
  BEHAV,
  DROP,
  DET,
  ALTER,
  RACE_N,
  RACE_A,
  VULN,
  VULN_I,
  RES,
  PROT,

  RFT_MAX,
}

// ---------------------------------------------------------------------------
// MonsterSpellFlag  (from list-mon-spells.h)
// ---------------------------------------------------------------------------

/**
 * Monster spell / ranged attack indices.
 *
 * Values mirror the C `RSF_*` enum.
 */
export const enum MonsterSpellFlag {
  NONE = 0,

  /* Innate ranged */
  SHRIEK,
  WHIP,
  SPIT,
  SHOT,
  ARROW,
  BOLT,

  /* Breaths (innate) */
  BR_ACID,
  BR_ELEC,
  BR_FIRE,
  BR_COLD,
  BR_POIS,
  BR_NETH,
  BR_LIGHT,
  BR_DARK,
  BR_SOUN,
  BR_CHAO,
  BR_DISE,
  BR_NEXU,
  BR_TIME,
  BR_INER,
  BR_GRAV,
  BR_SHAR,
  BR_PLAS,
  BR_WALL,
  BR_MANA,

  /* Innate physical */
  BOULDER,
  WEAVE,

  /* Ball spells */
  BA_ACID,
  BA_ELEC,
  BA_FIRE,
  BA_COLD,
  BA_POIS,
  BA_SHAR,
  BA_NETH,
  BA_WATE,
  BA_MANA,
  BA_HOLY,
  BA_DARK,
  BA_LIGHT,
  STORM,

  /* Annoyance / direct */
  DRAIN_MANA,
  MIND_BLAST,
  BRAIN_SMASH,
  WOUND,

  /* Bolt spells */
  BO_ACID,
  BO_ELEC,
  BO_FIRE,
  BO_COLD,
  BO_POIS,
  BO_NETH,
  BO_WATE,
  BO_MANA,
  BO_PLAS,
  BO_ICE,
  MISSILE,

  /* Beam spells */
  BE_ELEC,
  BE_NETH,

  /* Status / utility */
  SCARE,
  BLIND,
  CONF,
  SLOW,
  HOLD,
  HASTE,
  HEAL,
  HEAL_KIN,

  /* Movement */
  BLINK,
  TPORT,
  TELE_TO,
  TELE_SELF_TO,
  TELE_AWAY,
  TELE_LEVEL,

  /* Misc */
  DARKNESS,
  TRAPS,
  FORGET,
  SHAPECHANGE,

  /* Summoning */
  S_KIN,
  S_HI_DEMON,
  S_MONSTER,
  S_MONSTERS,
  S_ANIMAL,
  S_SPIDER,
  S_HOUND,
  S_HYDRA,
  S_AINU,
  S_DEMON,
  S_UNDEAD,
  S_DRAGON,
  S_HI_UNDEAD,
  S_HI_DRAGON,
  S_WRAITH,
  S_UNIQUE,

  RSF_MAX,
}

// ---------------------------------------------------------------------------
// MonsterTimedEffect  (from list-mon-timed.h)
// ---------------------------------------------------------------------------

/** Timed status effects that can apply to a monster instance. */
export const enum MonsterTimedEffect {
  SLEEP = 0,
  STUN,
  CONF,
  FEAR,
  SLOW,
  FAST,
  HOLD,
  DISEN,
  COMMAND,
  CHANGED,

  MON_TMD_MAX,
}

/** How a timed effect stacks when re-applied. */
export const enum TimedEffectStack {
  /** Does not stack at all. */
  NO = 0,
  /** Takes the maximum of old and new durations. */
  MAX,
  /** Increments the current duration. */
  INCR,
}

// ---------------------------------------------------------------------------
// MonsterTempFlag  (from list-mon-temp-flags.h)
// ---------------------------------------------------------------------------

/** Temporary per-instance monster flags (not part of the race). */
export const enum MonsterTempFlag {
  NONE = 0,
  /** Monster is in line of sight. */
  VIEW,
  /** Monster is in active mode. */
  ACTIVE,
  /** Monster is still being nice. */
  NICE,
  /** Monster is recently memorized. */
  SHOW,
  /** Monster is currently memorized. */
  MARK,
  /** Monster is "visible". */
  VISIBLE,
  /** Player does not know this is a monster. */
  CAMOUFLAGE,
  /** Monster is aware of the player. */
  AWARE,
  /** Monster has been processed this turn. */
  HANDLED,
  /** Monster is tracking the player by sound or scent. */
  TRACKING,

  MFLAG_MAX,
}

// ---------------------------------------------------------------------------
// BlowMethod  (from blow_methods.txt / struct blow_method)
// ---------------------------------------------------------------------------

/**
 * Melee attack methods — how the monster physically strikes.
 *
 * Loaded from `blow_methods.txt`; values here are data-file indices.
 */
export const enum BlowMethod {
  NONE = 0,
  HIT,
  TOUCH,
  PUNCH,
  KICK,
  CLAW,
  BITE,
  STING,
  BUTT,
  CRUSH,
  ENGULF,
  CRAWL,
  DROOL,
  SPIT,
  GAZE,
  WAIL,
  SPORE,
  BEG,
  INSULT,
  MOAN,

  BLOW_METHOD_MAX,
}

// ---------------------------------------------------------------------------
// BlowEffect  (from blow_effects.txt / struct blow_effect)
// ---------------------------------------------------------------------------

/**
 * Melee attack effects — what happens when the blow lands.
 *
 * Loaded from `blow_effects.txt`; values here are data-file indices.
 */
export const enum BlowEffect {
  NONE = 0,
  HURT,
  POISON,
  DISENCHANT,
  DRAIN_CHARGES,
  EAT_GOLD,
  EAT_ITEM,
  EAT_FOOD,
  EAT_LIGHT,
  ACID,
  ELEC,
  FIRE,
  COLD,
  BLIND,
  CONFUSE,
  TERRIFY,
  PARALYZE,
  LOSE_STR,
  LOSE_INT,
  LOSE_WIS,
  LOSE_DEX,
  LOSE_CON,
  LOSE_ALL,
  SHATTER,
  EXP_10,
  EXP_20,
  EXP_40,
  EXP_80,
  HALLU,
  BLACK_BREATH,

  BLOW_EFFECT_MAX,
}

// ---------------------------------------------------------------------------
// MonsterMessage  (from list-mon-message.h)
// ---------------------------------------------------------------------------

/** Pre-defined monster message indices for the message batching system. */
export const enum MonsterMessage {
  NONE = 0,
  DIE,
  DESTROYED,
  RESIST_A_LOT,
  HIT_HARD,
  RESIST,
  IMMUNE,
  RESIST_SOMEWHAT,
  UNAFFECTED,
  SPAWN,
  HEALTHIER,
  FALL_ASLEEP,
  WAKES_UP,
  CRINGE_LIGHT,
  SHRIVEL_LIGHT,
  LOSE_SKIN,
  DISSOLVE,
  CATCH_FIRE,
  BADLY_FROZEN,
  SHUDDER,
  CHANGE,
  DISAPPEAR,
  MORE_DAZED,
  DAZED,
  NOT_DAZED,
  MORE_CONFUSED,
  CONFUSED,
  NOT_CONFUSED,
  MORE_SLOWED,
  SLOWED,
  NOT_SLOWED,
  MORE_HASTED,
  HASTED,
  NOT_HASTED,
  MORE_AFRAID,
  FLEE_IN_TERROR,
  NOT_AFRAID,
  HELD,
  NOT_HELD,
  DISEN,
  NOT_DISEN,
  COMMAND,
  NOT_COMMAND,
  SHAPE_FAIL,
  MORIA_DEATH,
  DISINTEGRATES,
  FREEZE_SHATTER,
  MANA_DRAIN,
  BRIEF_PUZZLE,
  MAINTAIN_SHAPE,
  UNHARMED,
  APPEAR,
  HIT_AND_RUN,
  QUAKE_DEATH,
  QUAKE_HURT,
  /** Dummy pain messages (95/75/50/35/20/10/0). */
  PAIN_95,
  PAIN_75,
  PAIN_50,
  PAIN_35,
  PAIN_20,
  PAIN_10,
  PAIN_0,

  MON_MSG_MAX,
}

// ---------------------------------------------------------------------------
// MonsterGroupRole / MonsterGroupType
// ---------------------------------------------------------------------------

/** Role a monster can play within its group. */
export const enum MonsterGroupRole {
  LEADER = 0,
  SERVANT,
  BODYGUARD,
  MEMBER,
  SUMMON,
}

/** Which group layer this entry belongs to. */
export const enum MonsterGroupType {
  PRIMARY = 0,
  SUMMON,

  GROUP_MAX,
}

// ---------------------------------------------------------------------------
// MonsterAltMsgType
// ---------------------------------------------------------------------------

/** Which spell message is being overridden by an alternate message. */
export const enum MonsterAltMsgType {
  SEEN = 0,
  UNSEEN,
  MISS,
}

// ---------------------------------------------------------------------------
// Composite interfaces
// ---------------------------------------------------------------------------

/**
 * A single melee blow definition.
 *
 * Port of `struct monster_blow`.
 */
export interface MonsterBlow {
  /** Attack method (HIT, CLAW, BITE, etc.). */
  readonly method: BlowMethod;
  /** Effect applied on hit (HURT, POISON, etc.). */
  readonly effect: BlowEffect;
  /** Damage dice expression (e.g. 3d6+2). */
  readonly dice: RandomValue;
  /** Number of times the player has observed this blow (lore tracking). */
  timesSeen: number;
}

/**
 * A specific drop entry for a monster race.
 *
 * Port of `struct monster_drop`.
 */
export interface MonsterDrop {
  /** Object kind index (or 0 if specified only by tval). */
  readonly kindIdx: number;
  /** Object tval category. */
  readonly tval: number;
  /** Percent chance this drop occurs (0..100). */
  readonly percentChance: number;
  /** Minimum quantity. */
  readonly min: number;
  /** Maximum quantity. */
  readonly max: number;
}

/**
 * Named monster friend entry — a specific race that may accompany this race.
 *
 * Port of `struct monster_friends`.
 */
export interface MonsterFriend {
  /** The friend's race id. */
  readonly raceId: MonsterRaceId;
  /** Group role the friend fills. */
  readonly role: MonsterGroupRole;
  /** Percent chance the friend is generated. */
  readonly percentChance: number;
  /** Number dice (NdS friends generated). */
  readonly numberDice: number;
  /** Number sides. */
  readonly numberSide: number;
}

/**
 * General-base friend entry — any race from a base type that may accompany.
 *
 * Port of `struct monster_friends_base`.
 */
export interface MonsterFriendBase {
  /** Base monster type name (e.g. "orc", "troll"). */
  readonly baseName: string;
  /** Group role. */
  readonly role: MonsterGroupRole;
  /** Percent chance. */
  readonly percentChance: number;
  /** Number dice. */
  readonly numberDice: number;
  /** Number sides. */
  readonly numberSide: number;
}

/**
 * A mimic form entry: the object kind this race can disguise itself as.
 *
 * Port of `struct monster_mimic`.
 */
export interface MonsterMimic {
  /** Object kind index being mimicked. */
  readonly kindIdx: number;
}

/**
 * A shape a monster can assume.
 *
 * Port of `struct monster_shape`.
 */
export interface MonsterShape {
  /** Shape name identifier. */
  readonly name: string;
  /** Race id this shape transforms into. */
  readonly raceId: MonsterRaceId;
}

/**
 * Alternate spell message override for a specific monster.
 *
 * Port of `struct monster_altmsg`.
 */
export interface MonsterAltMsg {
  /** The replacement message text (empty string = suppress message). */
  readonly message: string;
  /** Which of the spell's messages this overrides. */
  readonly msgType: MonsterAltMsgType;
  /** Spell index (MonsterSpellFlag). */
  readonly spellIndex: MonsterSpellFlag;
}

/**
 * Base monster type — shared template for visual / pain grouping.
 *
 * Port of `struct monster_base`.
 */
export interface MonsterBase {
  /** Internal code name. */
  readonly name: string;
  /** In-game display name. */
  readonly text: string;
  /** Inheritable race flags. */
  readonly flags: BitFlag;
  /** Default display character (Unicode code point). */
  readonly dChar: number;
}

/**
 * Monster pain messages for a particular base type.
 *
 * Port of `struct monster_pain`.
 */
export interface MonsterPain {
  /** Up to 7 pain messages at decreasing HP thresholds. */
  readonly messages: readonly string[];
  /** Pain table index. */
  readonly painIdx: number;
}

// ---------------------------------------------------------------------------
// MonsterRace — the species template
// ---------------------------------------------------------------------------

/**
 * Monster "race" (species) template.
 *
 * Loaded from `monster.txt` / `monster_base.txt`.
 * Port of `struct monster_race`.
 */
export interface MonsterRace {
  /** Race index in the global table. */
  readonly ridx: MonsterRaceId;

  /** Internal name. */
  readonly name: string;
  /** Flavour / description text. */
  readonly text: string;
  /** Optional explicit plural form. */
  readonly plural: string | null;

  /** Base monster type (visual / pain grouping). */
  readonly base: MonsterBase;

  /** Average hit points. */
  readonly avgHp: number;
  /** Armour class. */
  readonly ac: number;

  /** Base sleep / inactive counter. */
  readonly sleep: number;
  /** Sense of hearing (1-100, standard 20). */
  readonly hearing: number;
  /** Sense of smell (0-50, standard 20). */
  readonly smell: number;
  /** Speed (normally 110). */
  readonly speed: number;
  /** Light intensity emitted by this race. */
  readonly light: number;

  /** Experience value awarded on kill. */
  readonly mexp: number;

  /** Innate spell frequency (percentage). */
  readonly freqInnate: number;
  /** Other spell frequency (percentage). */
  readonly freqSpell: number;
  /** Power level for spell damage scaling. */
  readonly spellPower: number;

  /** Race property flags (RF_*). */
  readonly flags: BitFlag;
  /** Spell / ranged attack flags (RSF_*). */
  readonly spellFlags: BitFlag;

  /** Melee blow definitions (up to 4 in vanilla). */
  readonly blows: readonly MonsterBlow[];

  /** Dungeon depth at which this race normally appears. */
  readonly level: number;
  /** Rarity factor (higher = rarer). */
  readonly rarity: number;

  /** Default display attribute (colour index). */
  readonly dAttr: number;
  /** Default display character (Unicode code point). */
  readonly dChar: number;

  /** Maximum population allowed per level. */
  readonly maxNum: number;
  /** Current population on the active level (mutable runtime state). */
  curNum: number;

  /** Alternate spell messages for this race. */
  readonly spellMsgs: readonly MonsterAltMsg[];
  /** Specific drop table entries. */
  readonly drops: readonly MonsterDrop[];

  /** Named friend entries. */
  readonly friends: readonly MonsterFriend[];
  /** Base-type friend entries. */
  readonly friendsBase: readonly MonsterFriendBase[];

  /** Mimic forms. */
  readonly mimicKinds: readonly MonsterMimic[];

  /** Alternate shapes this race can assume. */
  readonly shapes: readonly MonsterShape[];
  /** Number of shapes (including the base). */
  readonly numShapes: number;
}

// ---------------------------------------------------------------------------
// MonsterGroupInfo
// ---------------------------------------------------------------------------

/** Per-group-layer information stored on each monster instance. */
export interface MonsterGroupInfo {
  /** Group index within the layer. */
  readonly index: number;
  /** This monster's role in the group. */
  readonly role: MonsterGroupRole;
}

// ---------------------------------------------------------------------------
// MonsterGroup — pack AI coordination
// ---------------------------------------------------------------------------

/**
 * Logical monster group for pack/coordinated AI behaviour.
 *
 * A group tracks a set of monsters that should act in concert.
 */
export interface MonsterGroup {
  /** Unique group identifier. */
  readonly index: number;
  /** Group type (primary or summoned). */
  readonly groupType: MonsterGroupType;
  /** Members of this group, keyed by MonsterId. */
  readonly memberIds: readonly MonsterId[];
  /** The leader's monster id, if any. */
  readonly leaderId: MonsterId | null;
}

// ---------------------------------------------------------------------------
// MonsterTarget
// ---------------------------------------------------------------------------

/** A monster's current target (grid + optional monster index). */
export interface MonsterTarget {
  /** Target grid location. */
  readonly grid: Loc;
  /** Target monster index (0 = no monster target, use grid instead). */
  readonly midx: MonsterId;
}

// ---------------------------------------------------------------------------
// Monster — a live instance on the map
// ---------------------------------------------------------------------------

/**
 * A monster instance on the current dungeon level.
 *
 * Port of `struct monster`.
 */
export interface Monster {
  /** Current (possibly shape-changed) race. */
  race: MonsterRace;
  /** Original race before any shapechange (null if unchanged). */
  originalRace: MonsterRace | null;
  /** Monster index in the level's monster array. */
  readonly midx: MonsterId;

  /** Position on the map. */
  grid: Loc;

  /** Current hit points. */
  hp: number;
  /** Maximum hit points. */
  maxhp: number;

  /**
   * Timed status effect counters, indexed by MonsterTimedEffect.
   * Length = MON_TMD_MAX.
   */
  readonly mTimed: Int16Array;

  /** Current speed. */
  mspeed: number;
  /** Accumulated energy for the turn system. */
  energy: number;

  /** Current distance from the player. */
  cdis: number;

  /** Temporary per-instance flags (MFLAG_*). */
  readonly mflag: BitFlag;

  /** Index of the object this monster is mimicking (0 = none). */
  mimickedObjIdx: number;
  /** Index of the first held object (0 = none). */
  heldObjIdx: number;

  /** Attribute last used when drawing this monster. */
  attr: number;

  /** Monster's current target. */
  target: MonsterTarget;

  /**
   * Group info per group layer, indexed by MonsterGroupType.
   * Length = GROUP_MAX.
   */
  readonly groupInfo: readonly MonsterGroupInfo[];

  /** Preferred minimum range from its target. */
  minRange: number;
  /** Ideal engagement range. */
  bestRange: number;
}

// ---------------------------------------------------------------------------
// MonsterLore — player's accumulated knowledge about a race
// ---------------------------------------------------------------------------

/**
 * Player's accumulated knowledge about a monster race.
 *
 * Port of `struct monster_lore` (mon-lore.h).
 */
export interface MonsterLore {
  /** Race index this lore entry covers. */
  readonly ridx: MonsterRaceId;

  /** Total sightings of this race. */
  sights: number;
  /** Total player deaths caused by this race. */
  deaths: number;

  /** Kills by the current character. */
  pkills: number;
  /** Objects stolen by this race in the current life. */
  thefts: number;
  /** Total kills across all lives. */
  tkills: number;

  /** Times the player has woken this race. */
  wake: number;
  /** Times the player has failed to notice this race. */
  ignore: number;

  /** Max gold items observed dropped at once. */
  dropGold: number;
  /** Max non-gold items observed dropped at once. */
  dropItem: number;

  /** Max number of innate spells observed cast. */
  castInnate: number;
  /** Max number of non-innate spells observed cast. */
  castSpell: number;

  /** Known blow definitions (mirrors race blows with observation counts). */
  readonly blows: readonly MonsterBlow[];

  /**
   * Observed race flags. A set bit means the player knows whether the
   * flag is present or absent on the actual race.
   */
  readonly flags: BitFlag;
  /** Observed spell flags. */
  readonly spellFlags: BitFlag;

  /** Known drop entries. */
  readonly drops: readonly MonsterDrop[];
  /** Known friend entries. */
  readonly friends: readonly MonsterFriend[];
  /** Known base-type friend entries. */
  readonly friendsBase: readonly MonsterFriendBase[];
  /** Known mimic forms. */
  readonly mimicKinds: readonly MonsterMimic[];

  /* Derived "fully known" convenience flags */

  /** True if the player knows everything about this race. */
  allKnown: boolean;
  /** Per-blow-slot knowledge (true = that blow slot is known). */
  readonly blowKnown: boolean[];
  /** Whether AC is known. */
  armourKnown: boolean;
  /** Whether drops are fully known. */
  dropKnown: boolean;
  /** Whether sleep value is known. */
  sleepKnown: boolean;
  /** Whether non-innate spell frequency is known. */
  spellFreqKnown: boolean;
  /** Whether innate spell frequency is known. */
  innateFreqKnown: boolean;
}
