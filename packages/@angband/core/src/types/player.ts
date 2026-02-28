/**
 * @file types/player.ts
 * @brief Player-related type definitions
 *
 * Port of player.h, list-stats.h, list-player-flags.h, list-player-timed.h,
 * list-equip-slots.h, and related structures.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 * Copyright (c) 2011 elly+angband@leptoquark.net
 * Copyright (c) 2015 Nick McConnell
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Loc, BitFlag } from "../z/index.js";
import type { PlayerKnowledge } from "../object/knowledge.js";

// ── Constants ──

/** Maximum experience points. */
export const PY_MAX_EXP = 99_999_999;

/** Level at which all runes become known. */
export const PY_KNOW_LEVEL = 30;

/** Maximum player level. */
export const PY_MAX_LEVEL = 50;

/** Maximum player name length. */
export const PLAYER_NAME_LEN = 32;

/** Spell has been learned. */
export const PY_SPELL_LEARNED = 0x01;

/** Spell has been successfully tried. */
export const PY_SPELL_WORKED = 0x02;

/** Spell has been forgotten. */
export const PY_SPELL_FORGOTTEN = 0x04;

/** Adjust base-to-hit per plus-to-hit. */
export const BTH_PLUS_ADJ = 3;

/** Range of possible stat table indexes (3..40). */
export const STAT_RANGE = 38;

// ── Stat (player attributes) ──

/** Player stat indexes. Matches list-stats.h order. */
export const enum Stat {
  STR = 0,
  INT = 1,
  WIS = 2,
  DEX = 3,
  CON = 4,
}

/** Total number of stats. */
export const STAT_MAX = 5;

// ── Equipment slots ──

/** Equipment slot types. Matches list-equip-slots.h. */
export const enum EquipSlot {
  NONE = 0,
  WEAPON = 1,
  BOW = 2,
  RING = 3,
  AMULET = 4,
  LIGHT = 5,
  BODY_ARMOR = 6,
  CLOAK = 7,
  SHIELD = 8,
  HAT = 9,
  GLOVES = 10,
  BOOTS = 11,
}

/** Total number of equipment slot types. */
export const EQUIP_SLOT_MAX = 12;

// ── Skills ──

/** Skill indexes. */
export const enum Skill {
  /** Disarming (physical). */
  DISARM_PHYS = 0,
  /** Disarming (magical). */
  DISARM_MAGIC = 1,
  /** Magic device usage. */
  DEVICE = 2,
  /** Saving throw. */
  SAVE = 3,
  /** Searching ability. */
  SEARCH = 4,
  /** Stealth factor. */
  STEALTH = 5,
  /** To hit (melee). */
  TO_HIT_MELEE = 6,
  /** To hit (shooting). */
  TO_HIT_BOW = 7,
  /** To hit (throwing). */
  TO_HIT_THROW = 8,
  /** Digging. */
  DIGGING = 9,
}

/** Total number of skills. */
export const SKILL_MAX = 10;

// ── Digging terrain types ──

/** Terrain types the player can attempt to dig through. */
export const enum DiggingType {
  RUBBLE = 0,
  MAGMA = 1,
  QUARTZ = 2,
  GRANITE = 3,
  DOORS = 4,
}

export const DIGGING_MAX = 5;

// ── Player flags (race/class intrinsic flags) ──

/** Player intrinsic flags. Matches list-player-flags.h. */
export const enum PlayerFlag {
  NONE = 0,
  /** Extra shots with bows. */
  FAST_SHOT = 1,
  /** Resist fear at level 30. */
  BRAVERY_30 = 2,
  /** Only blunt/blessed weapons. */
  BLESS_WEAPON = 3,
  /** Spells never fail at max level. */
  ZERO_FAIL = 4,
  /** Beams vs. bolts preference. */
  BEAM = 5,
  /** Can choose spells freely. */
  CHOOSE_SPELLS = 6,
  /** Auto-identify mushrooms. */
  KNOW_MUSHROOM = 7,
  /** Auto-identify wand/staff charges. */
  KNOW_ZAPPER = 8,
  /** Can sense ore veins. */
  SEE_ORE = 9,
  /** No mana pool. */
  NO_MANA = 10,
  /** Shopkeepers give better prices. */
  CHARM = 11,
  /** Bonus in darkness. */
  UNLIGHT = 12,
  /** Can throw rocks. */
  ROCK = 13,
  /** Can steal from monsters. */
  STEAL = 14,
  /** Shield bash attack. */
  SHIELD_BASH = 15,
  /** Evil alignment. */
  EVIL = 16,
  /** Regeneration from combat. */
  COMBAT_REGEN = 17,
}

/** Total number of player flags. */
export const PF_MAX = 18;

// ── Timed effects ──

/** Timed effects applied to the player. Matches list-player-timed.h. */
export const enum TimedEffect {
  /** Haste. */
  FAST = 0,
  /** Slow. */
  SLOW = 1,
  /** Blindness. */
  BLIND = 2,
  /** Paralysis. */
  PARALYZED = 3,
  /** Confusion. */
  CONFUSED = 4,
  /** Fear. */
  AFRAID = 5,
  /** Hallucination. */
  IMAGE = 6,
  /** Poison. */
  POISONED = 7,
  /** Bleeding (cuts). */
  CUT = 8,
  /** Stun. */
  STUN = 9,
  /** Nourishment (food timer). */
  FOOD = 10,
  /** Protection from evil. */
  PROTEVIL = 11,
  /** Invulnerability. */
  INVULN = 12,
  /** Heroism. */
  HERO = 13,
  /** Super-heroism (berserk). */
  SHERO = 14,
  /** Magical shield. */
  SHIELD = 15,
  /** Blessed. */
  BLESSED = 16,
  /** See invisible. */
  SINVIS = 17,
  /** Infravision boost. */
  SINFRA = 18,
  /** Resist acid. */
  OPP_ACID = 19,
  /** Resist electricity. */
  OPP_ELEC = 20,
  /** Resist fire. */
  OPP_FIRE = 21,
  /** Resist cold. */
  OPP_COLD = 22,
  /** Resist poison. */
  OPP_POIS = 23,
  /** Resist confusion. */
  OPP_CONF = 24,
  /** Amnesia. */
  AMNESIA = 25,
  /** Telepathy. */
  TELEPATHY = 26,
  /** Stone skin (AC bonus). */
  STONESKIN = 27,
  /** Terror (flee). */
  TERROR = 28,
  /** Sprint (short burst of speed). */
  SPRINT = 29,
  /** Bold (fear immunity). */
  BOLD = 30,
  /** Stat scramble. */
  SCRAMBLE = 31,
  /** Trap safety. */
  TRAPSAFE = 32,
  /** Fast casting. */
  FASTCAST = 33,
  /** Acid brand on attacks. */
  ATT_ACID = 34,
  /** Electric brand on attacks. */
  ATT_ELEC = 35,
  /** Fire brand on attacks. */
  ATT_FIRE = 36,
  /** Cold brand on attacks. */
  ATT_COLD = 37,
  /** Poison brand on attacks. */
  ATT_POIS = 38,
  /** Confusion brand on attacks. */
  ATT_CONF = 39,
  /** Slay evil on attacks. */
  ATT_EVIL = 40,
  /** Slay demon on attacks. */
  ATT_DEMON = 41,
  /** Vampiric drain on attacks. */
  ATT_VAMP = 42,
  /** Regeneration. */
  HEAL = 43,
  /** Monster command. */
  COMMAND = 44,
  /** Attack causes fleeing. */
  ATT_RUN = 45,
  /** Cover tracks (reduced monster detection). */
  COVERTRACKS = 46,
  /** Power shot (archery). */
  POWERSHOT = 47,
  /** Taunt (aggravate monsters). */
  TAUNT = 48,
  /** Bloodlust. */
  BLOODLUST = 49,
  /** Black breath. */
  BLACKBREATH = 50,
  /** Enhanced stealth. */
  STEALTH = 51,
  /** Free action. */
  FREE_ACT = 52,
}

/** Total number of timed effects. */
export const TMD_MAX = 53;

// ── Noscore (cheating) flags ──

/** Cheating marker: wizard mode was used. */
export const NOSCORE_WIZARD = 0x0002;
/** Cheating marker: debug commands were used. */
export const NOSCORE_DEBUG = 0x0008;
/** Cheating marker: level jumping was used. */
export const NOSCORE_JUMPING = 0x0010;

// ── Element info (shared shape used by race, class, state) ──

/** Element resistance information for a single element. */
export interface ElementInfo {
  /** Resistance level (negative = vulnerable, 0 = normal, positive = resist). */
  readonly resLevel: number;
  /** Flags for this element. */
  readonly flags: BitFlag;
}

// ── Equipment slot instance ──

/** A single equipment slot on the player's body. */
export interface PlayerEquipSlot {
  /** Slot type. */
  readonly type: EquipSlot;
  /** Display name for this slot (e.g. "right hand"). */
  readonly name: string;
}

/** The player's body layout (which equipment slots are available). */
export interface PlayerBody {
  /** Body type name (e.g. "humanoid"). */
  readonly name: string;
  /** Number of equipment slots. */
  readonly count: number;
  /** Equipment slot definitions. */
  readonly slots: readonly PlayerEquipSlot[];
}

// ── Spell definitions ──

/** A single spell known by a class. */
export interface ClassSpell {
  /** Spell display name. */
  readonly name: string;
  /** Spell description text. */
  readonly text: string;
  /** Index of this spell for the class. */
  readonly sidx: number;
  /** Index into the player's book array. */
  readonly bidx: number;
  /** Required level to learn. */
  readonly slevel: number;
  /** Mana cost to cast. */
  readonly smana: number;
  /** Base failure chance (percentage). */
  readonly sfail: number;
  /** Encoded experience bonus. */
  readonly sexp: number;
  /** The magic realm this spell belongs to. */
  readonly realm: string;
}

/** A spellbook available to a class. */
export interface ClassBook {
  /** Item type value of the book. */
  readonly tval: number;
  /** Item sub-type value of the book. */
  readonly sval: number;
  /** Whether this book is found only in the dungeon. */
  readonly dungeon: boolean;
  /** Number of spells in this book. */
  readonly numSpells: number;
  /** Magic realm of this book. */
  readonly realm: string;
  /** Spells contained in this book. */
  readonly spells: readonly ClassSpell[];
}

/** Class magic knowledge (spellcasting system info). */
export interface ClassMagic {
  /** Level at which the first spell becomes available. */
  readonly spellFirst: number;
  /** Maximum armor weight before mana penalties apply. */
  readonly spellWeight: number;
  /** Number of spellbooks for this class. */
  readonly numBooks: number;
  /** Spellbook definitions. */
  readonly books: readonly ClassBook[];
  /** Total number of spells across all books. */
  readonly totalSpells: number;
}

// ── Starting items ──

/** An item the player starts with (defined per-class). */
export interface StartItem {
  /** General object type (TV_* value). */
  readonly tval: number;
  /** Object sub-type. */
  readonly sval: number;
  /** Minimum starting quantity. */
  readonly min: number;
  /** Maximum starting quantity. */
  readonly max: number;
  /** Tval name string for lookup (e.g. "food", "sword"). */
  readonly tvalName?: string;
  /** Sval name string for lookup (e.g. "Ration of Food", "Dagger"). */
  readonly svalName?: string;
}

// ── Player race ──

/** Player race template. Loaded from race.txt. */
export interface PlayerRace {
  /** Race name (e.g. "Human", "Elf", "Dwarf"). */
  readonly name: string;
  /** Race index. */
  readonly ridx: number;

  /** Hit-dice modifier. */
  readonly hitDice: number;
  /** Experience factor (higher = slower leveling). */
  readonly expFactor: number;

  /** Base age. */
  readonly baseAge: number;
  /** Age variation. */
  readonly modAge: number;

  /** Base height. */
  readonly baseHeight: number;
  /** Height variation. */
  readonly modHeight: number;
  /** Base weight. */
  readonly baseWeight: number;
  /** Weight variation. */
  readonly modWeight: number;

  /** Infravision range (in 10-foot units). */
  readonly infra: number;

  /** Body type index. */
  readonly body: number;

  /** Stat bonuses, indexed by Stat. Length = STAT_MAX. */
  readonly statAdj: readonly number[];

  /** Skill bonuses, indexed by Skill. Length = SKILL_MAX. */
  readonly skills: readonly number[];

  /** Object flags granted by this race. */
  readonly flags: BitFlag;

  /** Player intrinsic flags granted by this race. */
  readonly pflags: BitFlag;

  /** Element resistances/vulnerabilities. */
  readonly elInfo: readonly ElementInfo[];
}

// ── Player class ──

/** Player class template. Loaded from class.txt. */
export interface PlayerClass {
  /** Class name (e.g. "Warrior", "Mage", "Rogue"). */
  readonly name: string;
  /** Class index. */
  readonly cidx: number;

  /** Class titles awarded at each level milestone (10 entries). */
  readonly titles: readonly string[];

  /** Stat modifiers, indexed by Stat. Length = STAT_MAX. */
  readonly statAdj: readonly number[];

  /** Base class skills, indexed by Skill. Length = SKILL_MAX. */
  readonly skills: readonly number[];

  /** Extra skills gained per level, indexed by Skill. Length = SKILL_MAX. */
  readonly extraSkills: readonly number[];

  /** Hit-dice adjustment. */
  readonly hitDice: number;
  /** Experience factor (higher = slower leveling). */
  readonly expFactor: number;

  /** Object flags granted by this class. */
  readonly flags: BitFlag;

  /** Player intrinsic flags granted by this class. */
  readonly pflags: BitFlag;

  /** Maximum possible attacks per round. */
  readonly maxAttacks: number;
  /** Minimum weapon weight for attack calculations. */
  readonly minWeight: number;
  /** Multiplier for attack calculations. */
  readonly attMultiply: number;

  /** Starting inventory items. */
  readonly startItems: readonly StartItem[];

  /** Magic/spellcasting information. */
  readonly magic: ClassMagic;
}

// ── Player shape ──

/** Player shapechange form. */
export interface PlayerShape {
  /** Shape name. */
  readonly name: string;
  /** Shape index. */
  readonly sidx: number;

  /** AC bonus. */
  readonly toA: number;
  /** To-hit bonus. */
  readonly toH: number;
  /** Damage bonus. */
  readonly toD: number;

  /** Skill adjustments. Length = SKILL_MAX. */
  readonly skills: readonly number[];
  /** Object flags for this shape. */
  readonly flags: BitFlag;
  /** Player flags for this shape. */
  readonly pflags: BitFlag;
  /** Stat and other modifiers. */
  readonly modifiers: readonly number[];
  /** Element resistances for this shape. */
  readonly elInfo: readonly ElementInfo[];

  /** Number of melee blows in this shape. */
  readonly numBlows: number;
  /** Names of blow types available in this shape. */
  readonly blowNames: readonly string[];
}

// ── Player state (derived/calculated) ──

/**
 * Derived player state, recalculated when equipment or status changes.
 * Corresponds to C `struct player_state`.
 */
export interface PlayerState {
  /** Equipment stat bonuses. Length = STAT_MAX. */
  readonly statAdd: readonly number[];
  /** Indexes into stat lookup tables. Length = STAT_MAX. */
  readonly statInd: readonly number[];
  /** Current modified stat values (after bonuses). Length = STAT_MAX. */
  readonly statUse: readonly number[];
  /** Maximum modified stat values. Length = STAT_MAX. */
  readonly statTop: readonly number[];

  /** Computed skills. Length = SKILL_MAX. */
  readonly skills: readonly number[];

  /** Current speed. */
  readonly speed: number;

  /** Number of blows per round (x100 for fractional). */
  readonly numBlows: number;
  /** Number of shots per round (x10 for fractional). */
  readonly numShots: number;
  /** Number of extra movement actions. */
  readonly numMoves: number;

  /** Ammo damage multiplier. */
  readonly ammoMult: number;
  /** Ammo type value (TV_* for the ammo this launcher fires). */
  readonly ammoTval: number;

  /** Base armor class. */
  readonly ac: number;
  /** Flat damage reduction. */
  readonly damRed: number;
  /** Percentage damage reduction. */
  readonly percDamRed: number;
  /** Bonus to armor class. */
  readonly toA: number;
  /** Bonus to hit. */
  readonly toH: number;
  /** Bonus to damage. */
  readonly toD: number;

  /** Infravision range. */
  readonly seeInfra: number;
  /** Current light radius. */
  readonly curLight: number;

  /** Weapon is too heavy to wield effectively. */
  readonly heavyWield: boolean;
  /** Shooter is too heavy to use effectively. */
  readonly heavyShoot: boolean;
  /** Wielding a blessed (or blunt) weapon. */
  readonly blessWield: boolean;
  /** Armor is cumbering spellcasting. */
  readonly cumberArmor: boolean;

  /** Object flags from race and equipment. */
  readonly flags: BitFlag;
  /** Player intrinsic flags. */
  readonly pflags: BitFlag;
  /** Element resistances from race and equipment. */
  readonly elInfo: readonly ElementInfo[];
}

// ── Quest ──

/** A quest (e.g. kill a unique monster on a specific dungeon level). */
export interface Quest {
  /** Quest index. */
  readonly index: number;
  /** Quest name. */
  readonly name: string;
  /** Dungeon level for this quest. */
  readonly level: number;
  /** Number of quest monsters killed. */
  readonly curNum: number;
  /** Number of quest monsters required. */
  readonly maxNum: number;
}

// ── Player upkeep (transient runtime state) ──

/**
 * Temporary derived state used during play but not saved.
 * Corresponds to C `struct player_upkeep`.
 */
export interface PlayerUpkeep {
  /** True if actively playing. */
  playing: boolean;
  /** True if an autosave is pending. */
  autosave: boolean;
  /** True if the level needs regeneration. */
  generateLevel: boolean;
  /** True if only partial display updates are needed. */
  onlyPartial: boolean;
  /** True if auto-drop is in progress. */
  dropping: boolean;

  /** Energy used this turn. */
  energyUse: number;
  /** Number of new spells available to learn. */
  newSpells: number;

  /** Bit flags for pending actions (reorder inventory, etc.). */
  notice: number;
  /** Bit flags for recalculations needed (HP, visible area, etc.). */
  update: number;
  /** Bit flags for things that need to be redrawn. */
  redraw: number;

  /** UI state for equipment/inventory listing. */
  commandWrk: number;

  /** Create an up staircase on next level generation. */
  createUpStair: boolean;
  /** Create a down staircase on next level generation. */
  createDownStair: boolean;
  /** Light the entire level on creation. */
  lightLevel: boolean;
  /** Current level is an arena. */
  arenaLevel: boolean;

  /** Resting counter (turns remaining, or negative for special values). */
  resting: number;
  /** Running counter (turns remaining). */
  running: number;
  /** True if this is the first step of a run. */
  runningFirstStep: boolean;

  /** Total weight being carried (in 0.1 lbs). */
  totalWeight: number;
  /** Number of inventory items. */
  invenCnt: number;
  /** Number of equipped items. */
  equipCnt: number;
  /** Number of quiver items. */
  quiverCnt: number;
  /** Power of the current recharge effect. */
  rechargePow: number;

  /** Pathfinding: remaining steps. */
  stepCount: number;
  /** Pathfinding: destination grid. */
  pathDest: Loc;
}

// ── Player history ──

/** A single entry in the player's adventure history log. */
export interface PlayerHistoryEntry {
  /** Turn number when this event occurred. */
  readonly turn: number;
  /** Dungeon depth when this event occurred. */
  readonly depth: number;
  /** Player level when this event occurred. */
  readonly level: number;
  /** Description of the event. */
  readonly text: string;
}

/** The player's history log. */
export interface PlayerHistory {
  /** History entries in chronological order. */
  readonly entries: readonly PlayerHistoryEntry[];
}

// ── Main Player structure ──

/**
 * The player character. Contains all saved and derived state.
 * Corresponds to C `struct player`.
 */
export interface Player {
  /** Player's race template. */
  readonly race: PlayerRace;
  /** Player's class template. */
  readonly class: PlayerClass;

  /** Current grid position. */
  grid: Loc;
  /** Previous grid position (before arena). */
  oldGrid: Loc;

  /** Hit dice (number of sides). */
  readonly hitdie: number;
  /** Experience factor. */
  readonly expfact: number;

  /** Character age. */
  readonly age: number;
  /** Character height. */
  readonly ht: number;
  /** Character weight. */
  readonly wt: number;

  /** Current gold. */
  au: number;

  /** Maximum dungeon depth reached. */
  maxDepth: number;
  /** Recall depth (word of recall destination). */
  recallDepth: number;
  /** Current dungeon depth. */
  depth: number;

  /** Maximum level ever reached. */
  maxLev: number;
  /** Current level. */
  lev: number;

  /** Maximum experience ever earned. */
  maxExp: number;
  /** Current experience. */
  exp: number;
  /** Fractional experience (x 2^16). */
  expFrac: number;

  /** Maximum hit points. */
  mhp: number;
  /** Current hit points. */
  chp: number;
  /** Fractional hit points (x 2^16). */
  chpFrac: number;

  /** Maximum spell points (mana). */
  msp: number;
  /** Current spell points (mana). */
  csp: number;
  /** Fractional spell points (x 2^16). */
  cspFrac: number;

  /** Current maximal ("natural") stat values. Length = STAT_MAX. */
  statMax: number[];
  /** Current ("natural") stat values. Length = STAT_MAX. */
  statCur: number[];
  /** Tracks remapped stats from temporary stat swap. Length = STAT_MAX. */
  statMap: number[];

  /** Timed effect durations. Indexed by TimedEffect. Length = TMD_MAX. */
  timed: number[];

  /** Word of recall countdown. */
  wordRecall: number;
  /** Deep descent countdown. */
  deepDescent: number;

  /** Current energy. */
  energy: number;
  /** Total energy used (including resting). */
  totalEnergy: number;
  /** Number of player turns spent resting. */
  restingTurn: number;

  /** Current nutrition level. */
  food: number;

  /** Unignoring state (for item squelch/ignore system). */
  unignoring: number;

  /** Spell flags (PY_SPELL_LEARNED, _WORKED, _FORGOTTEN per spell). */
  spellFlags: number[];
  /** Order in which spells were learned. */
  spellOrder: number[];

  /** Player's full name. */
  fullName: string;
  /** Cause of death. */
  diedFrom: string;
  /** Character background history text. */
  history: string;

  /** Quest information. */
  quests: Quest[];
  /** True if the player has won the game. */
  totalWinner: boolean;

  /** Cheating/noscore flags. */
  noscore: number;

  /** True if the player is dead. */
  isDead: boolean;
  /** True if in wizard mode. */
  wizard: boolean;

  /** HP gained at each level. Length = PY_MAX_LEVEL. */
  playerHp: number[];

  /** Birth gold (when birth_money option is false). */
  auBirth: number;
  /** Birth stat values. Length = STAT_MAX. */
  statBirth: number[];
  /** Birth height. */
  htBirth: number;
  /** Birth weight. */
  wtBirth: number;

  /** Player body layout (available equipment slots). */
  body: PlayerBody;
  /** Current shapechange form, or null if in natural form. */
  shape: PlayerShape | null;

  /** Calculated state (after equipment bonuses etc.). */
  state: PlayerState;
  /** State as known to the player (may differ from actual state). */
  knownState: PlayerState;
  /** Temporary runtime state. */
  upkeep: PlayerUpkeep;

  /** Rune identification knowledge (which item properties are known). */
  knowledge: PlayerKnowledge;
}
