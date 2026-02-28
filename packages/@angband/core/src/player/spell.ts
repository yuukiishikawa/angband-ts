/**
 * @file player/spell.ts
 * @brief Spell casting system
 *
 * Port of player-spell.c — spell failure calculation, casting, learning,
 * and availability checks.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Player, ClassSpell } from "../types/index.js";
import {
  PY_SPELL_LEARNED,
  PY_SPELL_WORKED,
  TimedEffect,
  PlayerFlag,
  Stat,
  STAT_RANGE,
} from "../types/index.js";
import type { RNG } from "../z/index.js";

// ── Stat tables (from player-spell.c) ──

/**
 * Stat Table (INT/WIS) -- Minimum failure rate (percentage).
 * Indexed by stat_ind[casting_stat] (0..STAT_RANGE-1).
 */
const ADJ_MAG_FAIL: readonly number[] = [
  99, /* 3 */
  99, /* 4 */
  99, /* 5 */
  99, /* 6 */
  99, /* 7 */
  50, /* 8 */
  30, /* 9 */
  20, /* 10 */
  15, /* 11 */
  12, /* 12 */
  11, /* 13 */
  10, /* 14 */
   9, /* 15 */
   8, /* 16 */
   7, /* 17 */
   6, /* 18/00-18/09 */
   6, /* 18/10-18/19 */
   5, /* 18/20-18/29 */
   5, /* 18/30-18/39 */
   5, /* 18/40-18/49 */
   4, /* 18/50-18/59 */
   4, /* 18/60-18/69 */
   4, /* 18/70-18/79 */
   4, /* 18/80-18/89 */
   3, /* 18/90-18/99 */
   3, /* 18/100-18/109 */
   2, /* 18/110-18/119 */
   2, /* 18/120-18/129 */
   2, /* 18/130-18/139 */
   2, /* 18/140-18/149 */
   1, /* 18/150-18/159 */
   1, /* 18/160-18/169 */
   1, /* 18/170-18/179 */
   1, /* 18/180-18/189 */
   1, /* 18/190-18/199 */
   0, /* 18/200-18/209 */
   0, /* 18/210-18/219 */
   0, /* 18/220+ */
];

/**
 * Stat Table (INT/WIS) -- failure rate adjustment.
 * Indexed by stat_ind[casting_stat] (0..STAT_RANGE-1).
 */
const ADJ_MAG_STAT: readonly number[] = [
  -5, /* 3 */
  -4, /* 4 */
  -3, /* 5 */
  -3, /* 6 */
  -2, /* 7 */
  -1, /* 8 */
   0, /* 9 */
   0, /* 10 */
   0, /* 11 */
   0, /* 12 */
   0, /* 13 */
   1, /* 14 */
   2, /* 15 */
   3, /* 16 */
   4, /* 17 */
   5, /* 18/00-18/09 */
   6, /* 18/10-18/19 */
   7, /* 18/20-18/29 */
   8, /* 18/30-18/39 */
   9, /* 18/40-18/49 */
  10, /* 18/50-18/59 */
  11, /* 18/60-18/69 */
  12, /* 18/70-18/79 */
  15, /* 18/80-18/89 */
  18, /* 18/90-18/99 */
  21, /* 18/100-18/109 */
  24, /* 18/110-18/119 */
  27, /* 18/120-18/129 */
  30, /* 18/130-18/139 */
  33, /* 18/140-18/149 */
  36, /* 18/150-18/159 */
  39, /* 18/160-18/169 */
  42, /* 18/170-18/179 */
  45, /* 18/180-18/189 */
  48, /* 18/190-18/199 */
  51, /* 18/200-18/209 */
  54, /* 18/210-18/219 */
  57, /* 18/220+ */
];

// ── Spell result ──

/**
 * Result of attempting to cast a spell.
 */
export interface SpellResult {
  /** Whether the spell was successfully cast. */
  readonly success: boolean;
  /** Mana cost consumed (always paid, even on failure). */
  readonly manaCost: number;
  /** Messages for the UI layer. */
  readonly messages: readonly string[];
}

// ── Spell lookup ──

/**
 * Look up a spell by its global index (across all books).
 *
 * Port of C `spell_by_index()`.
 */
export function spellByIndex(
  player: Player,
  index: number,
): ClassSpell | null {
  const magic = player.class.magic;
  if (index < 0 || index >= magic.totalSpells) return null;

  let count = 0;
  let book = 0;
  while (count + magic.books[book]!.numSpells - 1 < index) {
    count += magic.books[book]!.numSpells;
    book++;
  }

  return magic.books[book]!.spells[index - count] ?? null;
}

// ── Casting stat helpers ──

/**
 * Determine the casting stat for a spell based on its realm.
 *
 * In the C source this comes from spell->realm->stat. Since our ClassSpell
 * stores realm as a string, we use a convention: "arcane"/"sorcery" use INT,
 * "divine"/"prayer" use WIS. Default is INT for unrecognised realms.
 */
export function getCastingStat(spell: ClassSpell): Stat {
  const realm = spell.realm.toLowerCase();
  if (realm === "divine" || realm === "prayer" || realm === "nature") {
    return Stat.WIS;
  }
  return Stat.INT;
}

/**
 * Get the stat index for the casting stat, clamped to STAT_RANGE.
 */
function castingStatInd(player: Player, spell: ClassSpell): number {
  const stat = getCastingStat(spell);
  const ind = player.state.statInd[stat]!;
  return Math.max(0, Math.min(ind, STAT_RANGE - 1));
}

// ── Failure chance calculation ──

/**
 * Calculate the failure percentage for a spell.
 *
 * Port of C `spell_chance()`.
 *
 * @param player - The player attempting to cast.
 * @param spell  - The spell to calculate failure for.
 * @returns Failure percentage (0..95). Lower is better.
 */
export function spellFailChance(player: Player, spell: ClassSpell): number {
  // No spells for this class
  if (!player.class.magic.totalSpells) return 100;

  const statInd = castingStatInd(player, spell);

  // Base failure rate from the spell definition
  let chance = spell.sfail;

  // Reduce by effective level adjustment
  chance -= 3 * (player.lev - spell.slevel);

  // Reduce by casting stat adjustment
  chance -= ADJ_MAG_STAT[statInd]!;

  // Not enough mana penalty
  if (spell.smana > player.csp) {
    chance += 5 * (spell.smana - player.csp);
  }

  // Minimum failure from stat level
  let minfail = ADJ_MAG_FAIL[statInd]!;

  // Non zero-fail characters never get better than 5%
  if (!playerHasFlag(player, PlayerFlag.ZERO_FAIL) && minfail < 5) {
    minfail = 5;
  }

  // Fear makes spells harder (before minfail clamp)
  if (player.timed[TimedEffect.AFRAID]! > 0) {
    chance += 20;
  }

  // Apply minimum and maximum failure bounds
  if (chance < minfail) chance = minfail;
  if (chance > 50) chance = 50;

  // Stun makes spells harder (after minfail clamp)
  if (player.timed[TimedEffect.STUN]! > 50) {
    chance += 25;
  } else if (player.timed[TimedEffect.STUN]! > 0) {
    chance += 15;
  }

  // Amnesia makes spells very difficult
  if (player.timed[TimedEffect.AMNESIA]! > 0) {
    chance = 50 + Math.floor(chance / 2);
  }

  // Always at least 5% chance of working
  if (chance > 95) {
    chance = 95;
  }

  return chance;
}

// ── Spell availability checks ──

/**
 * Check if a player has learned a specific spell.
 */
export function spellIsLearned(player: Player, spellIndex: number): boolean {
  return (player.spellFlags[spellIndex]! & PY_SPELL_LEARNED) !== 0;
}

/**
 * Check if the player can cast a spell (it has been learned).
 *
 * Port of C `spell_okay_to_cast()`.
 */
export function canCastSpell(player: Player, spell: ClassSpell): boolean {
  return spellIsLearned(player, spell.sidx);
}

/**
 * Check if a spell can be studied (learned).
 *
 * Port of C `spell_okay_to_study()`.
 */
export function canStudySpell(
  player: Player,
  spellIndex: number,
): boolean {
  const spell = spellByIndex(player, spellIndex);
  if (!spell) return false;
  return spell.slevel <= player.lev &&
    !spellIsLearned(player, spellIndex);
}

// ── Cast a spell ──

/**
 * Attempt to cast a spell.
 *
 * Port of C `spell_cast()`.
 *
 * This function:
 * 1. Rolls for failure
 * 2. Deducts mana (even on failure)
 * 3. On first successful cast, grants experience
 * 4. Returns a SpellResult with messages
 *
 * @param player - The player casting the spell.
 * @param spell  - The spell to cast.
 * @param rng    - Random number generator for failure rolls.
 * @returns Result of the casting attempt.
 */
export function castSpell(
  player: Player,
  spell: ClassSpell,
  rng: RNG,
): SpellResult {
  const messages: string[] = [];
  const chance = spellFailChance(player, spell);

  // Roll for failure
  const success = rng.randint0(100) >= chance;

  if (!success) {
    messages.push("You failed to concentrate hard enough!");
  } else {
    // First successful cast grants experience
    if ((player.spellFlags[spell.sidx]! & PY_SPELL_WORKED) === 0) {
      player.spellFlags[spell.sidx]! |= PY_SPELL_WORKED;
      const expGain = spell.sexp * spell.slevel;
      player.exp += expGain;
      if (player.exp > player.maxExp) {
        player.maxExp = player.exp;
      }
      messages.push(`You have gained ${expGain} experience.`);
    }
  }

  // Deduct mana (always, even on failure)
  const manaCost = spell.smana;
  if (manaCost <= player.csp) {
    player.csp -= manaCost;
  } else {
    // Over-exertion: not enough mana
    const oops = manaCost - player.csp;
    player.csp = 0;
    player.cspFrac = 0;
    messages.push(`You faint from the effort! (${oops} excess mana)`);
  }

  return { success, manaCost, messages };
}

// ── Learn a spell ──

/**
 * Learn a new spell.
 *
 * Port of C `spell_learn()`.
 *
 * @param player     - The player learning the spell.
 * @param spellIndex - The global spell index to learn.
 * @returns Messages for the UI layer.
 */
export function learnSpell(
  player: Player,
  spellIndex: number,
): string[] {
  const messages: string[] = [];
  const spell = spellByIndex(player, spellIndex);
  if (!spell) return messages;

  // Mark as learned
  player.spellFlags[spellIndex]! |= PY_SPELL_LEARNED;

  // Find next open entry in spell_order
  const totalSpells = player.class.magic.totalSpells;
  for (let i = 0; i < totalSpells; i++) {
    if (player.spellOrder[i] === 99) {
      player.spellOrder[i] = spellIndex;
      break;
    }
  }

  messages.push(`You have learned the spell of ${spell.name}.`);

  // One less spell available
  if (player.upkeep) {
    player.upkeep.newSpells--;
    if (player.upkeep.newSpells > 0) {
      messages.push(
        `You can learn ${player.upkeep.newSpells} more spell${player.upkeep.newSpells > 1 ? "s" : ""}.`,
      );
    }
  }

  return messages;
}

// ── Get available spells ──

/**
 * Get all spells the player has learned and can cast.
 */
export function getAvailableSpells(player: Player): ClassSpell[] {
  const result: ClassSpell[] = [];
  const magic = player.class.magic;

  for (let b = 0; b < magic.numBooks; b++) {
    const book = magic.books[b]!;
    for (let s = 0; s < book.numSpells; s++) {
      const spell = book.spells[s]!;
      if (spellIsLearned(player, spell.sidx)) {
        result.push(spell);
      }
    }
  }

  return result;
}

/**
 * Get all spells available for study at the player's current level.
 */
export function getStudyableSpells(player: Player): ClassSpell[] {
  const result: ClassSpell[] = [];
  const magic = player.class.magic;
  let idx = 0;

  for (let b = 0; b < magic.numBooks; b++) {
    const book = magic.books[b]!;
    for (let s = 0; s < book.numSpells; s++) {
      if (canStudySpell(player, idx)) {
        result.push(book.spells[s]!);
      }
      idx++;
    }
  }

  return result;
}

// ── Helper used internally ──

/**
 * Check if a player has a specific player flag (from state.pflags).
 */
function playerHasFlag(player: Player, flag: PlayerFlag): boolean {
  return player.state.pflags.has(flag);
}
