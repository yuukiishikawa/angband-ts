/**
 * @file command/magic.ts
 * @brief Spell/magic commands
 *
 * Port of the spell-related parts of cmd-obj.c — casting, studying, and
 * browsing spells.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Player, ClassSpell } from "../types/index.js";
import { PY_SPELL_LEARNED, PY_SPELL_WORKED, TimedEffect } from "../types/index.js";
import type { RNG } from "../z/index.js";
import {
  spellByIndex,
  spellFailChance,
  spellIsLearned,
  canStudySpell,
  castSpell,
  learnSpell,
} from "../player/index.js";

// ── Standard energy cost ──

/** Standard energy cost for one player action. */
const STANDARD_ENERGY = 100;

/** Reduced energy cost for fast casting (3/4 of standard). */
const FAST_CAST_ENERGY = 75;

// ── Result types ──

/**
 * Result of executing a command.
 */
export interface CommandResult {
  /** Whether the command completed successfully. */
  readonly success: boolean;
  /** Energy cost consumed by this action (0 if action failed before use). */
  readonly energyCost: number;
  /** Messages for the UI layer. */
  readonly messages: string[];
}

/**
 * Information about a single spell in a book, for browsing.
 */
export interface SpellInfo {
  /** Spell display name. */
  readonly name: string;
  /** Minimum level required to learn. */
  readonly level: number;
  /** Mana cost to cast. */
  readonly manaCost: number;
  /** Failure chance (0..95 percentage). */
  readonly failChance: number;
  /** Whether the player has learned this spell. */
  readonly known: boolean;
  /** Whether the player has successfully cast this spell at least once. */
  readonly worked: boolean;
}

/**
 * Result of browsing a spellbook.
 */
export interface BrowseResult {
  /** Spells contained in the book. */
  readonly spells: SpellInfo[];
}

// ── Magic commands ──

/**
 * Cast a spell.
 *
 * Port of C `do_cmd_cast()`. Delegates to the spell system in player/spell.ts.
 *
 * @param player     - The player casting the spell.
 * @param spellIndex - The global spell index to cast.
 * @param _target    - Target direction/location (reserved for effect system).
 * @param rng        - Random number generator.
 * @returns A CommandResult indicating success, energy cost, and messages.
 */
export function cmdCast(
  player: Player,
  spellIndex: number,
  _target: number | null,
  rng: RNG,
): CommandResult {
  const messages: string[] = [];

  // Check the player can cast spells at all
  if (!player.class.magic.totalSpells) {
    messages.push("You cannot cast spells!");
    return { success: false, energyCost: 0, messages };
  }

  // Look up the spell
  const spell = spellByIndex(player, spellIndex);
  if (!spell) {
    messages.push("That spell does not exist.");
    return { success: false, energyCost: 0, messages };
  }

  // Must have learned the spell
  if (!spellIsLearned(player, spellIndex)) {
    messages.push("You have not learned that spell.");
    return { success: false, energyCost: 0, messages };
  }

  // Check if paralyzed
  if (player.timed[TimedEffect.PARALYZED]! > 0) {
    messages.push("You are paralyzed!");
    return { success: false, energyCost: 0, messages };
  }

  // Check if confused
  if (player.timed[TimedEffect.CONFUSED]! > 0) {
    messages.push("You are too confused to cast spells!");
    return { success: false, energyCost: 0, messages };
  }

  // Check if blind (for scrolls and reading spells from books)
  if (player.timed[TimedEffect.BLIND]! > 0) {
    messages.push("You cannot see!");
    return { success: false, energyCost: 0, messages };
  }

  // Warn if mana is insufficient (but still allow attempt)
  if (spell.smana > player.csp) {
    messages.push(
      "You do not have enough mana to cast this spell.",
    );
    messages.push("Attempting it anyway...");
  }

  // Cast the spell (handles failure roll, mana deduction, experience)
  const result = castSpell(player, spell, rng);
  messages.push(...result.messages);

  // Determine energy cost
  let energyCost: number;
  if (player.timed[TimedEffect.FASTCAST]! > 0) {
    energyCost = FAST_CAST_ENERGY;
  } else {
    energyCost = STANDARD_ENERGY;
  }

  return { success: result.success, energyCost, messages };
}

/**
 * Learn (study) a spell.
 *
 * Port of C `do_cmd_study_spell()` / `do_cmd_study()`.
 *
 * @param player     - The player studying the spell.
 * @param spellIndex - The global spell index to learn.
 * @returns A CommandResult indicating success, energy cost, and messages.
 */
export function cmdStudy(
  player: Player,
  spellIndex: number,
): CommandResult {
  const messages: string[] = [];

  // Check the player can study at all
  if (!player.class.magic.totalSpells) {
    messages.push("You cannot learn spells!");
    return { success: false, energyCost: 0, messages };
  }

  // Check if there are new spells available
  if (player.upkeep.newSpells <= 0) {
    messages.push("You cannot learn any more spells.");
    return { success: false, energyCost: 0, messages };
  }

  // Check if paralyzed
  if (player.timed[TimedEffect.PARALYZED]! > 0) {
    messages.push("You are paralyzed!");
    return { success: false, energyCost: 0, messages };
  }

  // Check if confused
  if (player.timed[TimedEffect.CONFUSED]! > 0) {
    messages.push("You are too confused to study!");
    return { success: false, energyCost: 0, messages };
  }

  // Check if blind
  if (player.timed[TimedEffect.BLIND]! > 0) {
    messages.push("You cannot see!");
    return { success: false, energyCost: 0, messages };
  }

  // Verify the spell can be studied
  if (!canStudySpell(player, spellIndex)) {
    const spell = spellByIndex(player, spellIndex);
    if (!spell) {
      messages.push("That spell does not exist.");
    } else if (spellIsLearned(player, spellIndex)) {
      messages.push("You already know that spell.");
    } else {
      messages.push("You are not experienced enough to learn that spell.");
    }
    return { success: false, energyCost: 0, messages };
  }

  // Learn the spell
  const learnMessages = learnSpell(player, spellIndex);
  messages.push(...learnMessages);

  return { success: true, energyCost: STANDARD_ENERGY, messages };
}

/**
 * Browse the spells in a spellbook.
 *
 * Port of C spell browsing — displays information about all spells
 * in a specific book.
 *
 * @param player    - The player browsing.
 * @param bookIndex - Index into the player's class book array.
 * @returns A BrowseResult with spell information, or null if the book is invalid.
 */
export function cmdBrowse(
  player: Player,
  bookIndex: number,
): BrowseResult | null {
  const magic = player.class.magic;

  if (bookIndex < 0 || bookIndex >= magic.numBooks) {
    return null;
  }

  const book = magic.books[bookIndex];
  if (!book) return null;

  const spells: SpellInfo[] = [];

  // Calculate the global spell index offset for this book
  let offset = 0;
  for (let b = 0; b < bookIndex; b++) {
    offset += magic.books[b]!.numSpells;
  }

  for (let s = 0; s < book.numSpells; s++) {
    const spell = book.spells[s];
    if (!spell) continue;

    const globalIndex = offset + s;
    const flags = player.spellFlags[globalIndex] ?? 0;

    spells.push({
      name: spell.name,
      level: spell.slevel,
      manaCost: spell.smana,
      failChance: spellFailChance(player, spell),
      known: (flags & PY_SPELL_LEARNED) !== 0,
      worked: (flags & PY_SPELL_WORKED) !== 0,
    });
  }

  return { spells };
}
