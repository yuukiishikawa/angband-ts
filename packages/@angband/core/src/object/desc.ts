/**
 * @file object/desc.ts
 * @brief Object description/name generation
 *
 * Port of obj-desc.c — pure string functions for generating human-readable
 * object names (e.g. "a Longsword (+3,+5)", "5 Arrows", "the Phial of Galadriel").
 *
 * Copyright (c) 1997 - 2007 Angband contributors
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { ObjectType, ObjectKind, ObjectBase } from "../types/index.js";
import { TVal, KindFlag, ObjectFlag, ObjectModifier, ObjectNotice } from "../types/index.js";

// ---------------------------------------------------------------------------
// DescMode — controls how much detail the description includes
// ---------------------------------------------------------------------------

/** Description mode flags (bitfield). */
export const enum DescMode {
  /** Show prefix article/quantity ("a", "an", "5", "the"). */
  PREFIX = 0x01,
  /** Base name only — no combat or extra info. */
  BASE = 0x02,
  /** Include combat bonuses (to-hit, to-dam, AC). */
  COMBAT = 0x04,
  /** Include modifiers, charges, inscriptions. */
  EXTRA = 0x08,
  /** Force plural form. */
  PLURAL = 0x10,
  /** Force singular form. */
  SINGULAR = 0x20,
  /** In-store display (suppress ignore markers, treat as aware). */
  STORE = 0x40,
  /** Treat object as fully identified / spoiler mode. */
  SPOIL = 0x80,
  /** Capitalise the first letter. */
  CAPITAL = 0x100,
  /** Terse name (shorter book names, omit articles). */
  TERSE = 0x200,
  /** Omit ego item suffix. */
  NOEGO = 0x400,

  /** Convenience: full description = PREFIX | COMBAT | EXTRA. */
  FULL = PREFIX | COMBAT | EXTRA,
  /** Convenience: short = PREFIX | BASE. */
  SHORT = PREFIX | BASE,
}

// ---------------------------------------------------------------------------
// Vowel detection helper
// ---------------------------------------------------------------------------

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

function isVowel(ch: string): boolean {
  return VOWELS.has(ch.toLowerCase());
}

// ---------------------------------------------------------------------------
// Name format engine  (port of obj_desc_name_format)
// ---------------------------------------------------------------------------

/**
 * Format a name template with pluralisation and modifier substitution.
 *
 * - `&` at start is stripped (the prefix logic handles articles)
 * - `~` at end of a word causes English plural ("Ring~" => "Rings")
 * - `|singular|plural|` for irregular plurals ("Sta|ff|ves|")
 * - `#` is replaced by `modstr`
 */
export function nameFormat(
  fmt: string,
  modstr: string | null,
  pluralise: boolean,
): string {
  let result = "";
  let i = 0;

  while (i < fmt.length) {
    const ch = fmt[i]!;

    if (ch === "&") {
      // Skip '&' and any following spaces
      i++;
      while (i < fmt.length && fmt[i] === " ") i++;
      continue;
    }

    if (ch === "~") {
      if (pluralise) {
        const prev = result.length > 0 ? result[result.length - 1]! : "";
        if (prev === "s" || prev === "h" || prev === "x") {
          result += "es";
        } else {
          result += "s";
        }
      }
      i++;
      continue;
    }

    if (ch === "|") {
      // Parse |singular|plural|
      const singStart = i + 1;
      const singEnd = fmt.indexOf("|", singStart);
      if (singEnd < 0) break;
      const plurStart = singEnd + 1;
      const plurEnd = fmt.indexOf("|", plurStart);
      if (plurEnd < 0) break;

      if (pluralise) {
        result += fmt.slice(plurStart, plurEnd);
      } else {
        result += fmt.slice(singStart, singEnd);
      }
      i = plurEnd + 1;
      continue;
    }

    if (ch === "#" && modstr !== null) {
      result += nameFormat(modstr, null, pluralise);
      i++;
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// TVal helpers
// ---------------------------------------------------------------------------

function tvalIsWeapon(tval: TVal): boolean {
  return (
    tval === TVal.SWORD ||
    tval === TVal.HAFTED ||
    tval === TVal.POLEARM ||
    tval === TVal.DIGGING ||
    tval === TVal.BOW
  );
}

function tvalIsMeleeWeapon(tval: TVal): boolean {
  return (
    tval === TVal.SWORD ||
    tval === TVal.HAFTED ||
    tval === TVal.POLEARM ||
    tval === TVal.DIGGING
  );
}

function tvalIsArmor(tval: TVal): boolean {
  return (
    tval === TVal.BOOTS ||
    tval === TVal.GLOVES ||
    tval === TVal.HELM ||
    tval === TVal.CROWN ||
    tval === TVal.SHIELD ||
    tval === TVal.CLOAK ||
    tval === TVal.SOFT_ARMOR ||
    tval === TVal.HARD_ARMOR ||
    tval === TVal.DRAG_ARMOR
  );
}

function tvalIsBodyArmor(tval: TVal): boolean {
  return (
    tval === TVal.SOFT_ARMOR ||
    tval === TVal.HARD_ARMOR ||
    tval === TVal.DRAG_ARMOR
  );
}

function tvalIsAmmo(tval: TVal): boolean {
  return tval === TVal.SHOT || tval === TVal.ARROW || tval === TVal.BOLT;
}

function tvalIsLight(tval: TVal): boolean {
  return tval === TVal.LIGHT;
}

function tvalIsRing(tval: TVal): boolean {
  return tval === TVal.RING;
}

function tvalIsBook(tval: TVal): boolean {
  return (
    tval === TVal.MAGIC_BOOK ||
    tval === TVal.PRAYER_BOOK ||
    tval === TVal.NATURE_BOOK ||
    tval === TVal.SHADOW_BOOK ||
    tval === TVal.OTHER_BOOK
  );
}

function tvalCanHaveFlavor(tval: TVal): boolean {
  return (
    tval === TVal.AMULET ||
    tval === TVal.RING ||
    tval === TVal.STAFF ||
    tval === TVal.WAND ||
    tval === TVal.ROD ||
    tval === TVal.POTION ||
    tval === TVal.SCROLL ||
    tval === TVal.MUSHROOM
  );
}

function tvalCanHaveCharges(tval: TVal): boolean {
  return tval === TVal.STAFF || tval === TVal.WAND;
}

function tvalIsRod(tval: TVal): boolean {
  return tval === TVal.ROD;
}

function tvalIsMoney(tval: TVal): boolean {
  return tval === TVal.GOLD;
}

function tvalIsChest(tval: TVal): boolean {
  return tval === TVal.CHEST;
}

// ---------------------------------------------------------------------------
// Get modifier string  (port of obj_desc_get_modstr)
// ---------------------------------------------------------------------------

function getModstr(kind: ObjectKind): string {
  if (tvalCanHaveFlavor(kind.tval)) {
    return kind.flavor ? kind.flavor.text : "";
  }
  if (tvalIsBook(kind.tval)) {
    return kind.name;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Get base name template  (port of obj_desc_get_basename)
// ---------------------------------------------------------------------------

function getBasename(
  obj: ObjectType,
  kind: ObjectKind,
  aware: boolean,
  terse: boolean,
  mode: number,
): string {
  const showFlavor =
    !terse && kind.flavor !== null && !(mode & DescMode.STORE);

  // Artifacts use the kind name directly
  if (obj.artifact && (aware || terse || !kind.flavor)) {
    return kind.name;
  }

  switch (obj.tval) {
    case TVal.FLASK:
    case TVal.CHEST:
    case TVal.SHOT:
    case TVal.BOLT:
    case TVal.ARROW:
    case TVal.BOW:
    case TVal.HAFTED:
    case TVal.POLEARM:
    case TVal.SWORD:
    case TVal.DIGGING:
    case TVal.BOOTS:
    case TVal.GLOVES:
    case TVal.CLOAK:
    case TVal.CROWN:
    case TVal.HELM:
    case TVal.SHIELD:
    case TVal.SOFT_ARMOR:
    case TVal.HARD_ARMOR:
    case TVal.DRAG_ARMOR:
    case TVal.LIGHT:
    case TVal.FOOD:
      return kind.name;

    case TVal.AMULET:
      return showFlavor ? "& # Amulet~" : "& Amulet~";
    case TVal.RING:
      return showFlavor ? "& # Ring~" : "& Ring~";
    case TVal.STAFF:
      return showFlavor ? "& # Sta|ff|ves|" : "& Sta|ff|ves|";
    case TVal.WAND:
      return showFlavor ? "& # Wand~" : "& Wand~";
    case TVal.ROD:
      return showFlavor ? "& # Rod~" : "& Rod~";
    case TVal.POTION:
      return showFlavor ? "& # Potion~" : "& Potion~";
    case TVal.SCROLL:
      return showFlavor ? "& Scroll~ titled #" : "& Scroll~";

    case TVal.MAGIC_BOOK:
      return terse ? "& Book~ #" : "& Book~ of Magic Spells #";
    case TVal.PRAYER_BOOK:
      return terse ? "& Book~ #" : "& Holy Book~ of Prayers #";
    case TVal.NATURE_BOOK:
      return terse ? "& Book~ #" : "& Book~ of Nature Magics #";
    case TVal.SHADOW_BOOK:
      return terse ? "& Tome~ #" : "& Necromantic Tome~ #";
    case TVal.OTHER_BOOK:
      return terse ? "& Book~ #" : "& Book of Mysteries~ #";

    case TVal.MUSHROOM:
      return showFlavor ? "& # Mushroom~" : "& Mushroom~";

    default:
      return "(nothing)";
  }
}

// ---------------------------------------------------------------------------
// Prefix logic (a/an/the/N)  (port of obj_desc_name_prefix)
// ---------------------------------------------------------------------------

function buildPrefix(
  obj: ObjectType,
  basename: string,
  modstr: string,
  terse: boolean,
  number: number,
): string {
  if (number === 0) return "no more ";
  if (number > 1) return `${number} `;

  // Known artifact gets "the"
  if (obj.artifact && (obj.notice & ObjectNotice.ASSESSED)) {
    return "the ";
  }

  if (basename.startsWith("&")) {
    // Basename with '&' — determine a/an from what follows
    let lookahead = 1;
    while (lookahead < basename.length && basename[lookahead] === " ") {
      lookahead++;
    }

    let an = false;
    if (lookahead < basename.length && basename[lookahead] === "#") {
      if (modstr.length > 0 && isVowel(modstr[0]!)) an = true;
    } else if (
      lookahead < basename.length &&
      isVowel(basename[lookahead]!)
    ) {
      an = true;
    }

    if (!terse) {
      return an ? "an " : "a ";
    }
  } else if (!terse) {
    // Basename without '&' (e.g. kind names for weapons/armor from data files).
    // Determine a/an from the first character of the formatted name.
    const firstChar = basename[0];
    if (firstChar && isVowel(firstChar)) {
      return "an ";
    }
    return "a ";
  }

  return "";
}

// ---------------------------------------------------------------------------
// objectDescBase — base name only  (export)
// ---------------------------------------------------------------------------

/**
 * Return the base name of an object kind (no bonuses, no prefix).
 */
export function objectDescBase(kind: ObjectKind): string {
  return nameFormat(kind.name, null, false);
}

// ---------------------------------------------------------------------------
// objectDescModifiers — combat bonus string  (export)
// ---------------------------------------------------------------------------

/**
 * Return a combat modifier string like "(+3,+5)" or "[12,+3]".
 */
export function objectDescModifiers(obj: ObjectType): string {
  const parts: string[] = [];

  // Damage dice (show if kind flags say so)
  const kind = obj.kind;
  if (kind && kind.kindFlags.has(KindFlag.SHOW_DICE)) {
    parts.push(`(${obj.dd}d${obj.ds})`);
  }

  // Multiplier for bows
  if (kind && kind.kindFlags.has(KindFlag.SHOW_MULT)) {
    const mult = obj.pval + (obj.modifiers[ObjectModifier.MIGHT] ?? 0);
    parts.push(`(x${mult})`);
  }

  // To-hit and to-dam
  const hasWeaponBonuses = tvalIsWeapon(obj.tval) || obj.toH !== 0 || obj.toD !== 0;
  if (hasWeaponBonuses && (obj.toH !== 0 || obj.toD !== 0)) {
    parts.push(`(${formatBonus(obj.toH)},${formatBonus(obj.toD)})`);
  }

  // Armor class
  if (tvalIsArmor(obj.tval) || obj.ac > 0) {
    if (obj.toA !== 0) {
      parts.push(`[${obj.ac},${formatBonus(obj.toA)}]`);
    } else {
      parts.push(`[${obj.ac}]`);
    }
  } else if (obj.toA !== 0) {
    parts.push(`[${formatBonus(obj.toA)}]`);
  }

  return parts.join(" ");
}

function formatBonus(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

// ---------------------------------------------------------------------------
// objectDescInscrip — inscription  (export)
// ---------------------------------------------------------------------------

/**
 * Return the inscription string for an object (e.g. "{cursed}" or "{tried}").
 * Returns empty string if no inscription/annotation.
 */
export function objectDescInscrip(obj: ObjectType): string {
  const parts: string[] = [];

  // Player-defined inscription
  if (obj.note) {
    parts.push(`${obj.note}`);
  }

  // Curses
  if (obj.curses) {
    const hasCurse = obj.curses.some((c) => c.power > 0);
    if (hasCurse) parts.push("cursed");
  }

  if (parts.length === 0) return "";
  return `{${parts.join(", ")}}`;
}

// ---------------------------------------------------------------------------
// Object modifiers string  (port of obj_desc_mods)
// ---------------------------------------------------------------------------

function buildModsString(obj: ObjectType): string {
  const distinctMods: number[] = [];

  for (let i = 0; i < ObjectModifier.MAX; i++) {
    const val = obj.modifiers[i];
    if (val !== undefined && val !== 0) {
      if (!distinctMods.includes(val)) {
        distinctMods.push(val);
      }
    }
  }

  if (distinctMods.length === 0) return "";
  return " <" + distinctMods.map(formatBonus).join(", ") + ">";
}

// ---------------------------------------------------------------------------
// Charges string  (port of obj_desc_charges)
// ---------------------------------------------------------------------------

function buildChargesString(obj: ObjectType, aware: boolean): string {
  if (aware && tvalCanHaveCharges(obj.tval)) {
    const s = obj.pval === 1 ? "" : "s";
    return ` (${obj.pval} charge${s})`;
  }
  if (obj.timeout > 0) {
    if (tvalIsRod(obj.tval) && obj.number > 1) {
      return " (charging)";
    } else if (tvalIsRod(obj.tval) || obj.activation || obj.effect) {
      return " (charging)";
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Light remaining turns  (port of obj_desc_light)
// ---------------------------------------------------------------------------

function buildLightString(obj: ObjectType): string {
  if (tvalIsLight(obj.tval) && !obj.flags.has(ObjectFlag.NO_FUEL)) {
    return ` (${obj.timeout} turns)`;
  }
  return "";
}

// ---------------------------------------------------------------------------
// objectDescName — the main description function  (export)
// ---------------------------------------------------------------------------

/**
 * Generate a full object description string.
 *
 * @param obj    The object instance to describe.
 * @param kind   The object kind template (obj.kind, passed explicitly for flexibility).
 * @param mode   Bitfield of DescMode flags controlling output.
 * @returns      The formatted description string.
 */
export function objectDescName(
  obj: ObjectType,
  kind: ObjectKind,
  mode: number,
): string {
  // Handle null/missing object
  if (!obj || !kind) return "(nothing)";

  // Handle money
  if (tvalIsMoney(obj.tval)) {
    return `${obj.pval} gold pieces worth of ${kind.name}`;
  }

  const prefix = !!(mode & DescMode.PREFIX);
  const terse = !!(mode & DescMode.TERSE);
  const store = !!(mode & DescMode.STORE);
  const spoil = !!(mode & DescMode.SPOIL);
  const noego = !!(mode & DescMode.NOEGO);

  // Determine awareness
  const aware = kind.aware || store || spoil;

  // Determine plurality
  const forceSingular = !!(mode & DescMode.SINGULAR);
  const forcePlural = !!(mode & DescMode.PLURAL);
  const plural =
    !forceSingular && !obj.artifact && (obj.number !== 1 || forcePlural);

  // Get base name and modifier string
  const basename = getBasename(obj, kind, aware, terse, mode);
  const modstr = getModstr(kind);

  // Build the name
  let result = "";

  // Prefix (article/quantity)
  if (prefix) {
    result += buildPrefix(obj, basename, modstr, terse, obj.number);
  }

  // Base name
  result += nameFormat(basename, modstr, plural);

  // Append artifact name
  if (obj.artifact && (obj.notice & ObjectNotice.ASSESSED)) {
    result += ` ${obj.artifact.name}`;
  } else if (obj.ego && !noego && (aware || store)) {
    result += ` ${obj.ego.name}`;
  } else if (aware && !obj.artifact && (kind.flavor || kind.tval === TVal.SCROLL)) {
    if (terse) {
      result += ` '${kind.name}'`;
    } else {
      result += ` of ${kind.name}`;
    }
  }

  // Combat properties
  if (mode & DescMode.COMBAT) {
    if (tvalIsChest(obj.tval)) {
      // Chest descriptions handled separately
    } else if (tvalIsLight(obj.tval)) {
      result += buildLightString(obj);
    }

    // Damage dice
    if (kind.kindFlags.has(KindFlag.SHOW_DICE)) {
      result += ` (${obj.dd}d${obj.ds})`;
    }

    // Shooting multiplier
    if (kind.kindFlags.has(KindFlag.SHOW_MULT)) {
      const mult = obj.pval + (obj.modifiers[ObjectModifier.MIGHT] ?? 0);
      result += ` (x${mult})`;
    }

    // Only show bonuses if assessed
    if (obj.notice & ObjectNotice.ASSESSED || spoil) {
      // Weapon bonuses
      if (tvalIsWeapon(obj.tval) || obj.toD !== 0 || obj.toH !== 0) {
        result += ` (${formatBonus(obj.toH)},${formatBonus(obj.toD)})`;
      }

      // Armor
      if (tvalIsArmor(obj.tval) || obj.ac > 0) {
        if (obj.toA !== 0) {
          result += ` [${obj.ac},${formatBonus(obj.toA)}]`;
        } else {
          result += ` [${obj.ac}]`;
        }
      } else if (obj.toA !== 0) {
        result += ` [${formatBonus(obj.toA)}]`;
      }
    }
  }

  // Extra details (modifiers, charges, inscriptions)
  if (mode & DescMode.EXTRA) {
    result += buildModsString(obj);
    result += buildChargesString(obj, aware);

    if (store) {
      // Store display: show awareness info
      if (!kind.aware) {
        result += " {unseen}";
      }
    } else {
      // Normal: show inscription
      const inscrip = objectDescInscrip(obj);
      if (inscrip) result += ` ${inscrip}`;
    }
  }

  // Capitalize if requested
  if ((mode & DescMode.CAPITAL) && result.length > 0) {
    result = result[0]!.toUpperCase() + result.slice(1);
  }

  return result;
}
