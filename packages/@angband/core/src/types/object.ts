/**
 * @file types/object.ts
 * @brief Object/Item type definitions
 *
 * Port of object.h, obj-properties.h, list-object-flags.h,
 * list-object-modifiers.h, list-tvals.h, list-elements.h, list-stats.h.
 *
 * Contains ONLY type definitions: interfaces, enums, type aliases, const enums.
 * No runtime implementations.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { BitFlag } from "../z/bitflag.js";
import type { Loc } from "../z/type.js";
import type { RandomValue } from "../z/rand.js";
import type { QuarkId } from "../z/quark.js";
import type { ObjectId } from "./cave.js";
import type { MonsterRaceId } from "./monster.js";
import type { Stat, ElementInfo } from "./player.js";

// ---------------------------------------------------------------------------
// Branded numeric ID types
// ---------------------------------------------------------------------------

// ObjectId is re-exported from cave.ts where it is canonically defined.
export type { ObjectId };

// MonsterRaceId is re-exported from monster.ts where it is canonically defined.
export type { MonsterRaceId };

/** Index into the object kind table (k_info). */
export type ObjectKindId = number & { readonly __brand: "ObjectKindId" };

/** Index into the artifact table (a_info). */
export type ArtifactId = number & { readonly __brand: "ArtifactId" };

/** Index into the ego item table (e_info). */
export type EgoItemId = number & { readonly __brand: "EgoItemId" };

/** Sub-type value within a TVal category. */
export type SVal = number & { readonly __brand: "SVal" };

/** Index into the activation table. */
export type ActivationId = number & { readonly __brand: "ActivationId" };

/** Index into the flavor table. */
export type FlavorId = number & { readonly __brand: "FlavorId" };

// ---------------------------------------------------------------------------
// Player stats  (list-stats.h)
// ---------------------------------------------------------------------------

// Stat enum is canonically defined and exported from player.ts.
// Imported here for internal reference only; consumers import Stat from player.

// ---------------------------------------------------------------------------
// Elements  (list-elements.h)
// ---------------------------------------------------------------------------

/** Damage / resistance element types. Order matches list-elements.h. */
export const enum Element {
  ACID = 0,
  ELEC = 1,
  FIRE = 2,
  COLD = 3,
  POIS = 4,
  LIGHT = 5,
  DARK = 6,
  SOUND = 7,
  SHARD = 8,
  NEXUS = 9,
  NETHER = 10,
  CHAOS = 11,
  DISEN = 12,
  WATER = 13,
  ICE = 14,
  GRAVITY = 15,
  INERTIA = 16,
  FORCE = 17,
  TIME = 18,
  PLASMA = 19,
  METEOR = 20,
  MISSILE = 21,
  MANA = 22,
  HOLY_ORB = 23,
  ARROW = 24,
  MAX = 25,
}

/** First of the four base elements (ACID..COLD). */
export const ELEM_BASE_MIN = Element.ACID;
/** One past the last base element. */
export const ELEM_BASE_MAX = Element.COLD + 1;
/** First of the high elements (POIS..DISEN). */
export const ELEM_HIGH_MIN = Element.POIS;
/** One past the last high element. */
export const ELEM_HIGH_MAX = Element.DISEN + 1;

// ---------------------------------------------------------------------------
// TVal  (list-tvals.h)
// ---------------------------------------------------------------------------

/** Object type categories. Order matches list-tvals.h. */
export const enum TVal {
  NULL = 0,
  CHEST = 1,
  SHOT = 2,
  ARROW = 3,
  BOLT = 4,
  BOW = 5,
  DIGGING = 6,
  HAFTED = 7,
  POLEARM = 8,
  SWORD = 9,
  BOOTS = 10,
  GLOVES = 11,
  HELM = 12,
  CROWN = 13,
  SHIELD = 14,
  CLOAK = 15,
  SOFT_ARMOR = 16,
  HARD_ARMOR = 17,
  DRAG_ARMOR = 18,
  LIGHT = 19,
  AMULET = 20,
  RING = 21,
  STAFF = 22,
  WAND = 23,
  ROD = 24,
  SCROLL = 25,
  POTION = 26,
  FLASK = 27,
  FOOD = 28,
  MUSHROOM = 29,
  MAGIC_BOOK = 30,
  PRAYER_BOOK = 31,
  NATURE_BOOK = 32,
  SHADOW_BOOK = 33,
  OTHER_BOOK = 34,
  GOLD = 35,
  MAX = 36,
}

// ---------------------------------------------------------------------------
// Object flags  (list-object-flags.h)
// ---------------------------------------------------------------------------

/**
 * Object property flags. OF_NONE (0) is the null sentinel.
 * Values 1..OF_MAX correspond to list-object-flags.h lines 17..55.
 * Changing order will break save files.
 */
export const enum ObjectFlag {
  NONE = 0,
  SUST_STR = 1,
  SUST_INT = 2,
  SUST_WIS = 3,
  SUST_DEX = 4,
  SUST_CON = 5,
  PROT_FEAR = 6,
  PROT_BLIND = 7,
  PROT_CONF = 8,
  PROT_STUN = 9,
  SLOW_DIGEST = 10,
  FEATHER = 11,
  REGEN = 12,
  TELEPATHY = 13,
  SEE_INVIS = 14,
  FREE_ACT = 15,
  HOLD_LIFE = 16,
  IMPACT = 17,
  BLESSED = 18,
  BURNS_OUT = 19,
  TAKES_FUEL = 20,
  NO_FUEL = 21,
  IMPAIR_HP = 22,
  IMPAIR_MANA = 23,
  AFRAID = 24,
  NO_TELEPORT = 25,
  AGGRAVATE = 26,
  DRAIN_EXP = 27,
  STICKY = 28,
  FRAGILE = 29,
  LIGHT_2 = 30,
  LIGHT_3 = 31,
  DIG_1 = 32,
  DIG_2 = 33,
  DIG_3 = 34,
  EXPLODE = 35,
  TRAP_IMMUNE = 36,
  THROWING = 37,
  MULTIPLY_WEIGHT = 38,
  MAX = 39,
}

// ---------------------------------------------------------------------------
// Kind flags  (list-kind-flags.h)
// ---------------------------------------------------------------------------

/**
 * Flags that apply to object kinds, ego items, and artifacts
 * (but not individual object instances).
 */
export const enum KindFlag {
  NONE = 0,
  RAND_HI_RES = 1,
  RAND_SUSTAIN = 2,
  RAND_POWER = 3,
  INSTA_ART = 4,
  QUEST_ART = 5,
  EASY_KNOW = 6,
  GOOD = 7,
  SHOW_DICE = 8,
  SHOW_MULT = 9,
  SHOOTS_SHOTS = 10,
  SHOOTS_ARROWS = 11,
  SHOOTS_BOLTS = 12,
  RAND_BASE_RES = 13,
  RAND_RES_POWER = 14,
  MAX = 15,
}

// ---------------------------------------------------------------------------
// Object modifiers  (list-stats.h + list-object-modifiers.h)
// ---------------------------------------------------------------------------

/**
 * Object modifier indices. Stats come first (from list-stats.h),
 * then the extra modifiers from list-object-modifiers.h.
 */
export const enum ObjectModifier {
  STR = 0,
  INT = 1,
  WIS = 2,
  DEX = 3,
  CON = 4,
  STEALTH = 5,
  SEARCH = 6,
  INFRA = 7,
  TUNNEL = 8,
  SPEED = 9,
  BLOWS = 10,
  SHOTS = 11,
  MIGHT = 12,
  LIGHT = 13,
  DAM_RED = 14,
  MOVES = 15,
  MAX = 16,
}

/** The first stat-based modifier. */
export const OBJ_MOD_MIN_STAT = ObjectModifier.STR;

// ---------------------------------------------------------------------------
// Object flag types and identification
// ---------------------------------------------------------------------------

/** How an object flag is categorised for ego/property generation. */
export const enum ObjectFlagType {
  NONE = 0,
  /** Sustains a stat */
  SUST = 1,
  /** Protection from an effect */
  PROT = 2,
  /** A good misc property, suitable for ego items */
  MISC = 3,
  /** Applicable only to light sources */
  LIGHT = 4,
  /** Applicable only to melee weapons */
  MELEE = 5,
  /** An undesirable flag */
  BAD = 6,
  /** Applicable only to diggers */
  DIG = 7,
  /** Applicable only to throwables */
  THROW = 8,
  /** Only relevant as part of a curse */
  CURSE_ONLY = 9,
  MAX = 10,
}

/** How an object flag is identified by the player. */
export const enum ObjectFlagId {
  NONE = 0,
  /** Normal identification on use */
  NORMAL = 1,
  /** Obvious after some time */
  TIMED = 2,
  /** Obvious on wield */
  WIELD = 3,
}

// ---------------------------------------------------------------------------
// Object property type
// ---------------------------------------------------------------------------

/** The type of an object property entry. */
export const enum ObjPropertyType {
  NONE = 0,
  STAT = 1,
  MOD = 2,
  FLAG = 3,
  IGNORE = 4,
  RESIST = 5,
  VULN = 6,
  IMM = 7,
  MAX = 8,
}

// ---------------------------------------------------------------------------
// Object origin  (list-origins.h)
// ---------------------------------------------------------------------------

/** How an object was found/acquired. */
export const enum ObjectOrigin {
  NONE = 0,
  FLOOR = 1,
  CHEST = 2,
  SPECIAL = 3,
  PIT = 4,
  VAULT = 5,
  LABYRINTH = 6,
  CAVERN = 7,
  RUBBLE = 8,
  MIXED = 9,
  DROP = 10,
  DROP_SPECIAL = 11,
  DROP_PIT = 12,
  DROP_VAULT = 13,
  STATS = 14,
  ACQUIRE = 15,
  STORE = 16,
  STOLEN = 17,
  BIRTH = 18,
  CHEAT = 19,
  DROP_BREED = 20,
  DROP_SUMMON = 21,
  DROP_UNKNOWN = 22,
  DROP_POLY = 23,
  DROP_MIMIC = 24,
  DROP_WIZARD = 25,
  MAX = 26,
}

// ---------------------------------------------------------------------------
// Element info flags
// ---------------------------------------------------------------------------

/** Bitfield values for ElementInfo.flags. */
export const enum ElementInfoFlag {
  HATES = 0x01,
  IGNORE = 0x02,
  RANDOM = 0x04,
}

// ---------------------------------------------------------------------------
// Object notice flags
// ---------------------------------------------------------------------------

/** Bitfield values for ObjectType.notice. */
export const enum ObjectNotice {
  WORN = 0x01,
  ASSESSED = 0x02,
  IGNORE = 0x04,
  IMAGINED = 0x08,
}

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

// ElementInfo interface is canonically defined and exported from player.ts.
// Imported here for internal reference only; consumers import ElementInfo from player.

/** An effect in a chain (activations, use-effects, etc.). */
export interface Effect {
  /** Effect index in the effect table. */
  readonly index: number;
  /** Dice expression for the effect. */
  readonly dice: RandomValue | null;
  /** Y coordinate or distance. */
  readonly y: number;
  /** X coordinate or distance. */
  readonly x: number;
  /** Projection type, timed effect type, etc. */
  readonly subtype: number;
  /** Radius of the effect (if applicable). */
  readonly radius: number;
  /** Extra parameter passed to the handler. */
  readonly other: number;
  /** Message for death or other outcomes. */
  readonly msg: string | null;
  /** Next effect in the chain. */
  readonly next: Effect | null;
}

/** Brand applied to a weapon (extra damage vs. element vulnerability). */
export interface Brand {
  readonly code: string;
  readonly name: string;
  /** Verb used in combat messages (e.g. "burn"). */
  readonly verb: string;
  /** Monster resistance flag that negates this brand. */
  readonly resistFlag: number;
  /** Monster vulnerability flag that enhances this brand. */
  readonly vulnFlag: number;
  /** Damage multiplier (x100, so 300 = 3.0x). */
  readonly multiplier: number;
  /** Off-weapon multiplier. */
  readonly oMultiplier: number;
  /** Power rating for item evaluation. */
  readonly power: number;
}

/** Slay applied to a weapon (extra damage vs. monster type). */
export interface Slay {
  readonly code: string;
  readonly name: string;
  /** Monster base type affected. */
  readonly base: string;
  /** Verb for melee messages. */
  readonly meleeVerb: string;
  /** Verb for ranged messages. */
  readonly rangeVerb: string;
  /** Monster race flag that triggers this slay. */
  readonly raceFlag: number;
  /** Damage multiplier (x100). */
  readonly multiplier: number;
  /** Off-weapon multiplier. */
  readonly oMultiplier: number;
  /** Power rating for item evaluation. */
  readonly power: number;
}

/** Curse definition. */
export interface Curse {
  readonly name: string;
  /** Which object kinds this curse can apply to (indexed by kidx). */
  readonly poss: boolean[];
  /** Conflicting curse name. */
  readonly conflict: string | null;
  /** Conflicting object flags. */
  readonly conflictFlags: BitFlag;
  /** Player-visible description. */
  readonly desc: string;
}

/** Runtime curse data attached to an object instance. */
export interface CurseData {
  /** Strength of the curse. */
  readonly power: number;
  /** Timeout counter before next curse effect. */
  readonly timeout: number;
}

/** Activation effect reference for artifacts and ego items. */
export interface Activation {
  readonly name: string;
  /** Index in the activation table. */
  readonly index: number;
  /** Whether the activation requires aiming. */
  readonly aim: boolean;
  /** Difficulty level for activation. */
  readonly level: number;
  /** Power rating. */
  readonly power: number;
  /** The chain of effects triggered. */
  readonly effect: Effect | null;
  /** Message displayed on activation. */
  readonly message: string | null;
  /** Short description for the player. */
  readonly desc: string | null;
}

/** Object property definition (from object_property.txt). */
export interface ObjProperty {
  readonly type: ObjPropertyType;
  readonly subtype: number;
  readonly idType: ObjectFlagId;
  readonly index: number;
  /** Base power rating. */
  readonly power: number;
  /** Relative weight rating. */
  readonly mult: number;
  /** Per-TVal relative weight ratings. */
  readonly typeMult: number[];
  readonly name: string;
  /** Adjective for the property (e.g. "strong"). */
  readonly adjective: string | null;
  /** Adjective for the negative of the property. */
  readonly negAdj: string | null;
  /** Message shown when the property is noticed. */
  readonly msg: string | null;
  /** Extra descriptive text for object info. */
  readonly desc: string | null;
}

/** Visual flavor for unidentified items (e.g. "a Bubbling potion"). */
export interface Flavor {
  readonly fidx: FlavorId;
  readonly text: string;
  readonly tval: TVal;
  readonly sval: SVal;
  /** Default display attribute. */
  readonly dAttr: number;
  /** Default display character. */
  readonly dChar: string;
}

/** Chest trap definition. */
export interface ChestTrap {
  readonly name: string;
  readonly code: string;
  readonly level: number;
  readonly effect: Effect | null;
  readonly pval: number;
  readonly destroy: boolean;
  readonly magic: boolean;
  readonly msg: string | null;
  readonly msgDeath: string | null;
}

// ---------------------------------------------------------------------------
// Object base type  (object_base in C)
// ---------------------------------------------------------------------------

/**
 * Information about object base types (e.g. "sword", "potion").
 * Groups object kinds by their TVal.
 */
export interface ObjectBase {
  readonly name: string;
  readonly tval: TVal;
  /** Default display attribute. */
  readonly attr: number;
  /** Base object flags shared by all items of this type. */
  readonly flags: BitFlag;
  /** Kind flags. */
  readonly kindFlags: BitFlag;
  /** Per-element info (indexed by Element). */
  readonly elInfo: readonly ElementInfo[];
  /** Breakage percentage on throw/fire. */
  readonly breakPerc: number;
  /** Maximum stack size. */
  readonly maxStack: number;
  /** Number of sub-types (svals) for this base. */
  readonly numSvals: number;
}

// ---------------------------------------------------------------------------
// ObjectKind  (object_kind in C — item template)
// ---------------------------------------------------------------------------

/**
 * An item template / definition.
 * Read from object.txt; defines base stats, generation parameters,
 * and default flags for a category of items.
 */
export interface ObjectKind {
  readonly name: string;
  /** Descriptive text. */
  readonly text: string;
  /** Reference to the base object type. */
  readonly base: ObjectBase | null;
  /** Kind index in the k_info table. */
  readonly kidx: ObjectKindId;

  readonly tval: TVal;
  readonly sval: SVal;

  /** Item extra parameter (random value). */
  readonly pval: RandomValue;

  /** Bonus to hit (random value). */
  readonly toH: RandomValue;
  /** Bonus to damage (random value). */
  readonly toD: RandomValue;
  /** Bonus to armor (random value). */
  readonly toA: RandomValue;
  /** Base armor class. */
  readonly ac: number;

  /** Number of damage dice. */
  readonly dd: number;
  /** Number of sides per damage die. */
  readonly ds: number;
  /** Weight in 1/10 lbs. */
  readonly weight: number;

  /** Base cost in gold. */
  readonly cost: number;

  /** Object flags. */
  readonly flags: BitFlag;
  /** Kind flags. */
  readonly kindFlags: BitFlag;

  /** Stat/property modifiers (indexed by ObjectModifier). */
  readonly modifiers: readonly RandomValue[];
  /** Per-element info (indexed by Element). */
  readonly elInfo: readonly ElementInfo[];

  /** Brand presence flags (indexed by brand table index). */
  readonly brands: boolean[] | null;
  /** Slay presence flags (indexed by slay table index). */
  readonly slays: boolean[] | null;
  /** Curse powers (indexed by curse table index). */
  readonly curses: number[] | null;

  /** Default display attribute. */
  readonly dAttr: number;
  /** Default display character. */
  readonly dChar: string;

  /** Allocation commonness (generation probability). */
  readonly allocProb: number;
  /** Minimum dungeon level for generation. */
  readonly allocMin: number;
  /** Maximum dungeon level for generation. */
  readonly allocMax: number;
  /** Level / difficulty of activation. */
  readonly level: number;

  /** Artifact-like activation, if any. */
  readonly activation: Activation | null;
  /** Use-effect this item produces. */
  readonly effect: Effect | null;
  /** Power of the item's effect. */
  readonly power: number;
  /** Message on use. */
  readonly effectMsg: string | null;
  /** Visual message. */
  readonly visMsg: string | null;
  /** Recharge time for rods / activations. */
  readonly time: RandomValue;
  /** Number of charges for staves / wands. */
  readonly charge: RandomValue;

  /** Probability of generating more than one. */
  readonly genMultProb: number;
  /** Stack size on generation. */
  readonly stackSize: RandomValue;

  /** Special flavor for unidentified display. */
  readonly flavor: Flavor | null;

  /** Auto-inscription quark (aware). */
  readonly noteAware: QuarkId;
  /** Auto-inscription quark (unaware). */
  readonly noteUnaware: QuarkId;

  /** Player is aware of this kind's effects. */
  readonly aware: boolean;
  /** Kind has been tried by the player. */
  readonly tried: boolean;

  /** Squelch/ignore settings. */
  readonly ignore: number;
  /** Kind has ever been seen (for ignore menus). */
  readonly everseen: boolean;
}

// ---------------------------------------------------------------------------
// Artifact  (artifact in C — unique item definition)
// ---------------------------------------------------------------------------

/**
 * Unchanging definition of a unique artifact item.
 * Read from artifact.txt.
 */
export interface Artifact {
  readonly name: string;
  /** Descriptive / lore text. */
  readonly text: string;

  /** Artifact index in the a_info table. */
  readonly aidx: ArtifactId;

  readonly tval: TVal;
  readonly sval: SVal;

  /** Bonus to hit. */
  readonly toH: number;
  /** Bonus to damage. */
  readonly toD: number;
  /** Bonus to armor. */
  readonly toA: number;
  /** Base armor class. */
  readonly ac: number;

  /** Base damage dice. */
  readonly dd: number;
  /** Base damage sides. */
  readonly ds: number;

  /** Weight in 1/10 lbs. */
  readonly weight: number;

  /** Artifact cost / pseudo-worth in gold. */
  readonly cost: number;

  /** Artifact flags. */
  readonly flags: BitFlag;

  /** Stat/property modifiers (indexed by ObjectModifier). Fixed values. */
  readonly modifiers: readonly number[];
  /** Per-element info (indexed by Element). */
  readonly elInfo: readonly ElementInfo[];

  /** Brand presence flags. */
  readonly brands: boolean[] | null;
  /** Slay presence flags. */
  readonly slays: boolean[] | null;
  /** Curse powers. */
  readonly curses: number[] | null;

  /** Difficulty level for activation. */
  readonly level: number;

  /** Generation rarity. */
  readonly allocProb: number;
  /** Minimum depth. */
  readonly allocMin: number;
  /** Maximum depth (will never appear deeper). */
  readonly allocMax: number;

  /** Activation for this artifact, if any. */
  readonly activation: Activation | null;
  /** Alternative activation message. */
  readonly altMsg: string | null;

  /** Recharge time for activation. */
  readonly time: RandomValue;
}

/**
 * Mutable artifact state that changes during play.
 * Saved to the save file.
 */
export interface ArtifactUpkeep {
  /** Cross-index with Artifact.aidx. */
  readonly aidx: ArtifactId;
  /** Whether this artifact has been created in the current game. */
  created: boolean;
  /** Whether this artifact has been seen this game. */
  seen: boolean;
  /** Whether this artifact has ever been seen. */
  everseen: boolean;
}

// ---------------------------------------------------------------------------
// EgoItem  (ego_item in C — ego enchantment template)
// ---------------------------------------------------------------------------

/** A possible base item kind for an ego item. */
export interface PossItem {
  readonly kidx: ObjectKindId;
}

/**
 * Ego item enchantment template (e.g. "of Resist Fire", "of Speed").
 * Read from ego_item.txt.
 */
export interface EgoItem {
  readonly name: string;
  /** Descriptive text. */
  readonly text: string;

  /** Ego item index in the e_info table. */
  readonly eidx: EgoItemId;

  /** Ego item cost modifier. */
  readonly cost: number;

  /** Flags granted by this ego. */
  readonly flags: BitFlag;
  /** Flags removed by this ego. */
  readonly flagsOff: BitFlag;
  /** Kind flags. */
  readonly kindFlags: BitFlag;

  /** Modifier random values (indexed by ObjectModifier). */
  readonly modifiers: readonly RandomValue[];
  /** Minimum modifier values (indexed by ObjectModifier). */
  readonly minModifiers: readonly number[];
  /** Per-element info (indexed by Element). */
  readonly elInfo: readonly ElementInfo[];

  /** Brand presence flags. */
  readonly brands: boolean[] | null;
  /** Slay presence flags. */
  readonly slays: boolean[] | null;
  /** Curse powers. */
  readonly curses: number[] | null;

  /** Level rating boost for dungeon feeling. */
  readonly rating: number;
  /** Generation rarity. */
  readonly allocProb: number;
  /** Minimum depth. */
  readonly allocMin: number;
  /** Maximum depth. */
  readonly allocMax: number;

  /** Which base item kinds this ego can appear on. */
  readonly possItems: readonly PossItem[];

  /** Extra bonus to hit (random value). */
  readonly toH: RandomValue;
  /** Extra bonus to damage (random value). */
  readonly toD: RandomValue;
  /** Extra bonus to armor (random value). */
  readonly toA: RandomValue;

  /** Minimum bonus to hit. */
  readonly minToH: number;
  /** Minimum bonus to damage. */
  readonly minToD: number;
  /** Minimum bonus to armor. */
  readonly minToA: number;

  /** Activation for this ego, if any. */
  readonly activation: Activation | null;
  /** Recharge time for activation. */
  readonly time: RandomValue;

  /** Whether this ego has ever been seen (for ignore menus). */
  readonly everseen: boolean;
}

// ---------------------------------------------------------------------------
// ObjectType  (struct object in C — a specific item instance)
// ---------------------------------------------------------------------------

/**
 * A specific object instance in the game world.
 *
 * Each dungeon grid can point to an object, and objects form doubly-linked
 * stacks via prev/next. Monsters also hold object chains via held_m_idx.
 */
export interface ObjectType {
  /** Kind template for this object. */
  readonly kind: ObjectKind | null;
  /** Ego item enchantment, if any. */
  readonly ego: EgoItem | null;
  /** Artifact info, if this is an artifact. */
  readonly artifact: Artifact | null;

  /** Previous object in a pile. */
  prev: ObjectType | null;
  /** Next object in a pile. */
  next: ObjectType | null;
  /** Known (player-visible) version of this object. */
  known: ObjectType | null;

  /** Item list index. */
  readonly oidx: ObjectId;

  /** Position on the map, or (0,0) if held by a monster. */
  grid: Loc;

  readonly tval: TVal;
  readonly sval: SVal;

  /** Item extra parameter. */
  pval: number;

  /** Weight in 1/10 lbs. */
  weight: number;

  /** Number of damage dice. */
  dd: number;
  /** Number of sides per damage die. */
  ds: number;
  /** Base armor class. */
  ac: number;
  /** Bonus to armor. */
  toA: number;
  /** Bonus to hit. */
  toH: number;
  /** Bonus to damage. */
  toD: number;

  /** Object flags (bitflag set). */
  readonly flags: BitFlag;
  /** Stat/property modifiers (indexed by ObjectModifier). */
  readonly modifiers: number[];
  /** Per-element info (indexed by Element). */
  readonly elInfo: ElementInfo[];
  /** Brand presence flags (indexed by brand table index). */
  brands: boolean[] | null;
  /** Slay presence flags (indexed by slay table index). */
  slays: boolean[] | null;
  /** Curse data per curse (indexed by curse table index). */
  curses: CurseData[] | null;

  /** Use-effect this item produces. */
  readonly effect: Effect | null;
  /** Message on use. */
  readonly effectMsg: string | null;
  /** Activation for this item, if applicable. */
  readonly activation: Activation | null;
  /** Recharge time for rods / activations. */
  readonly time: RandomValue;
  /** Timeout counter (turns remaining before recharge). */
  timeout: number;

  /** Number of items in this stack. */
  number: number;
  /** Combination of ObjectNotice flags. */
  notice: number;

  /** Index of the monster holding this object (0 = none). */
  heldMIdx: number;
  /** Index of the monster mimicking this object (0 = none). */
  mimickingMIdx: number;

  /** How this item was found (ObjectOrigin). */
  readonly origin: ObjectOrigin;
  /** Dungeon depth where the item was found. */
  readonly originDepth: number;
  /** Monster race that dropped it, if applicable. */
  readonly originRace: MonsterRaceId | null;

  /** Inscription quark index. */
  note: QuarkId;
}
