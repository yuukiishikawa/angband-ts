/**
 * @file player/timed.ts
 * @brief Timed effect management
 *
 * Port of player-timed.c — setting, increasing, decreasing and clearing
 * timed effects on the player.
 *
 * Copyright (c) 1997 Ben Harrison
 * Copyright (c) 2007 Andi Sidwell
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Player } from "../types/index.js";
import { TimedEffect, TMD_MAX } from "../types/index.js";

// ── Food constants (from player_timed.txt grade definitions) ──

/** Maximum food value (Full). */
export const PY_FOOD_MAX = 15000;

/** Full (no longer hungry). */
export const PY_FOOD_FULL = 10000;

/** Hungry threshold. */
export const PY_FOOD_HUNGRY = 2000;

/** Weak from hunger. */
export const PY_FOOD_WEAK = 1000;

/** Faint from hunger. */
export const PY_FOOD_FAINT = 500;

/** Starving (danger of death). */
export const PY_FOOD_STARVE = 100;

// ── Timed effect grade thresholds ──

/**
 * A grade within a timed effect. Effects can have multiple severity
 * levels (grades), each with a maximum duration threshold, a name,
 * and messages for transitioning up or down.
 */
export interface TimedEffectGrade {
  /** Grade ordinal (0 = off). */
  readonly grade: number;
  /** Maximum duration at this grade. */
  readonly max: number;
  /** Display name for this grade, or null for unnamed grades. */
  readonly name: string | null;
  /** Message shown when entering this grade from a lower one. */
  readonly upMsg: string | null;
  /** Message shown when dropping to this grade from a higher one. */
  readonly downMsg: string | null;
}

// ── Timed effect metadata ──

/**
 * Flags controlling timed effect behaviour.
 */
export const TMD_FLAG_NONSTACKING = 0x01;

/**
 * Metadata for a single timed effect.
 * Corresponds to C `struct timed_effect_data`.
 */
export interface TimedEffectData {
  /** Effect name (e.g. "FAST", "BLIND"). */
  readonly name: string;
  /** Description of the effect. */
  readonly desc: string | null;
  /** Message when the effect ends. */
  readonly onEnd: string | null;
  /** Message when the effect duration increases. */
  readonly onIncrease: string | null;
  /** Message when the effect duration decreases. */
  readonly onDecrease: string | null;
  /** Grade definitions (ascending order). First is always the "off" grade. */
  readonly grades: readonly TimedEffectGrade[];
  /** Behaviour flags (e.g. TMD_FLAG_NONSTACKING). */
  readonly flags: number;
  /** Lower bound for the duration (some effects never fully expire). */
  readonly lowerBound: number;
}

/**
 * Result of a timed effect operation.
 * Contains messages for the UI layer and whether the player was notified.
 */
export interface TimedEffectResult {
  /** Whether the operation caused a notification. */
  readonly changed: boolean;
  /** Messages to display to the player. */
  readonly messages: readonly string[];
}

// ── Default effect metadata registry ──

/**
 * Build a simple two-grade effect data entry (off / on).
 */
function simpleEffect(
  name: string,
  desc: string,
  onEnd: string | null,
  onIncrease: string | null,
  maxDuration = 32767,
  flags = 0,
  lowerBound = 0,
): TimedEffectData {
  return {
    name,
    desc,
    onEnd,
    onIncrease,
    onDecrease: null,
    grades: [
      { grade: 0, max: 0, name: null, upMsg: null, downMsg: null },
      { grade: 1, max: maxDuration, name, upMsg: onIncrease, downMsg: null },
    ],
    flags,
    lowerBound,
  };
}

/**
 * Default timed effect data table. In the full game this would be loaded
 * from player_timed.txt; here we provide sensible defaults matching the
 * C source's built-in values.
 */
const DEFAULT_EFFECTS: TimedEffectData[] = buildDefaultEffects();

function buildDefaultEffects(): TimedEffectData[] {
  const effects: TimedEffectData[] = new Array<TimedEffectData>(TMD_MAX);

  // Fill with placeholder entries
  for (let i = 0; i < TMD_MAX; i++) {
    effects[i] = simpleEffect(`TMD_${i}`, "", null, null);
  }

  // Override well-known effects with proper messages
  effects[TimedEffect.FAST] = simpleEffect(
    "FAST", "haste", "You feel yourself slow down.", "You feel yourself moving faster!",
  );
  effects[TimedEffect.SLOW] = simpleEffect(
    "SLOW", "slowness", "You feel yourself speed up.", "You feel yourself moving slower!",
  );
  effects[TimedEffect.BLIND] = simpleEffect(
    "BLIND", "blindness", "You can see again.", "You are blind!",
  );
  effects[TimedEffect.PARALYZED] = simpleEffect(
    "PARALYZED", "paralysis", "You can move again.", "You are paralyzed!",
    32767, TMD_FLAG_NONSTACKING,
  );
  effects[TimedEffect.CONFUSED] = simpleEffect(
    "CONFUSED", "confusion", "You are no longer confused.", "You are confused!",
  );
  effects[TimedEffect.AFRAID] = simpleEffect(
    "AFRAID", "fear", "You feel bolder now.", "You are terrified!",
  );
  effects[TimedEffect.IMAGE] = simpleEffect(
    "IMAGE", "hallucination", "You can see clearly again.", "You feel drugged!",
  );
  effects[TimedEffect.POISONED] = simpleEffect(
    "POISONED", "poison", "You are no longer poisoned.", "You are poisoned!",
  );
  effects[TimedEffect.CUT] = simpleEffect(
    "CUT", "cuts", "You are no longer bleeding.", null,
  );
  effects[TimedEffect.STUN] = simpleEffect(
    "STUN", "stun", "You are no longer stunned.", null,
  );
  effects[TimedEffect.PROTEVIL] = simpleEffect(
    "PROTEVIL", "protection from evil",
    "You no longer feel safe from evil.", "You feel safe from evil!",
  );
  effects[TimedEffect.INVULN] = simpleEffect(
    "INVULN", "invulnerability",
    "You are no longer invulnerable.", "You feel invulnerable!",
    32767, TMD_FLAG_NONSTACKING,
  );
  effects[TimedEffect.HERO] = simpleEffect(
    "HERO", "heroism", "You no longer feel heroic.", "You feel like a hero!",
  );
  effects[TimedEffect.SHERO] = simpleEffect(
    "SHERO", "berserk", "You are no longer berserk.", "You feel like a killing machine!",
  );
  effects[TimedEffect.SHIELD] = simpleEffect(
    "SHIELD", "mystic shield",
    "Your mystic shield crumbles away.", "A mystic shield forms around your body!",
  );
  effects[TimedEffect.BLESSED] = simpleEffect(
    "BLESSED", "bless", "The prayer has expired.", "You feel righteous!",
  );
  effects[TimedEffect.SINVIS] = simpleEffect(
    "SINVIS", "see invisible",
    "Your eyes feel less sensitive.", "Your eyes feel very sensitive!",
  );
  effects[TimedEffect.SINFRA] = simpleEffect(
    "SINFRA", "infravision",
    "Your eyes feel less sensitive.", "Your eyes begin to tingle!",
  );
  effects[TimedEffect.OPP_ACID] = simpleEffect(
    "OPP_ACID", "acid resistance", "You are no longer resistant to acid.", "You feel resistant to acid!",
  );
  effects[TimedEffect.OPP_ELEC] = simpleEffect(
    "OPP_ELEC", "electricity resistance",
    "You are no longer resistant to electricity.", "You feel resistant to electricity!",
  );
  effects[TimedEffect.OPP_FIRE] = simpleEffect(
    "OPP_FIRE", "fire resistance", "You are no longer resistant to fire.", "You feel resistant to fire!",
  );
  effects[TimedEffect.OPP_COLD] = simpleEffect(
    "OPP_COLD", "cold resistance", "You are no longer resistant to cold.", "You feel resistant to cold!",
  );
  effects[TimedEffect.OPP_POIS] = simpleEffect(
    "OPP_POIS", "poison resistance",
    "You are no longer resistant to poison.", "You feel resistant to poison!",
  );
  effects[TimedEffect.OPP_CONF] = simpleEffect(
    "OPP_CONF", "confusion resistance",
    "You are no longer resistant to confusion.", "You feel resistant to confusion!",
  );
  effects[TimedEffect.AMNESIA] = simpleEffect(
    "AMNESIA", "amnesia", "Your memories come flooding back.", "You feel your memories fading!",
  );
  effects[TimedEffect.TELEPATHY] = simpleEffect(
    "TELEPATHY", "telepathy",
    "Your mind quiets.", "Your mind expands!",
  );
  effects[TimedEffect.STONESKIN] = simpleEffect(
    "STONESKIN", "stone skin",
    "Your skin returns to normal.", "Your skin turns to stone!",
  );
  effects[TimedEffect.TERROR] = simpleEffect(
    "TERROR", "terror", "The terror leaves you.", "You feel the need to run away!",
  );
  effects[TimedEffect.SPRINT] = simpleEffect(
    "SPRINT", "sprint",
    "You slow down.", "You start sprinting!",
  );
  effects[TimedEffect.BOLD] = simpleEffect(
    "BOLD", "bold", "You no longer feel bold.", "You feel bold!",
  );
  effects[TimedEffect.SCRAMBLE] = simpleEffect(
    "SCRAMBLE", "stat scramble",
    "Your stats return to normal.", "Your stats are scrambled!",
  );
  effects[TimedEffect.TRAPSAFE] = simpleEffect(
    "TRAPSAFE", "trap safety",
    "You feel vulnerable to traps again.", "You feel safe from traps!",
  );
  effects[TimedEffect.FASTCAST] = simpleEffect(
    "FASTCAST", "fast casting",
    "You return to normal casting speed.", "You feel your magic quicken!",
  );
  effects[TimedEffect.ATT_ACID] = simpleEffect(
    "ATT_ACID", "acid brand", "Your weapon loses its acid coating.", "Your weapon drips with acid!",
  );
  effects[TimedEffect.ATT_ELEC] = simpleEffect(
    "ATT_ELEC", "electric brand",
    "Your weapon loses its electric charge.", "Your weapon crackles with electricity!",
  );
  effects[TimedEffect.ATT_FIRE] = simpleEffect(
    "ATT_FIRE", "fire brand", "Your weapon cools down.", "Your weapon is engulfed in flames!",
  );
  effects[TimedEffect.ATT_COLD] = simpleEffect(
    "ATT_COLD", "cold brand", "Your weapon warms up.", "Your weapon glows with frost!",
  );
  effects[TimedEffect.ATT_POIS] = simpleEffect(
    "ATT_POIS", "poison brand",
    "Your weapon loses its toxic coating.", "Your weapon drips with poison!",
  );
  effects[TimedEffect.ATT_CONF] = simpleEffect(
    "ATT_CONF", "confusion brand",
    "Your weapon returns to normal.", "Your hands glow bright red!",
  );
  effects[TimedEffect.ATT_EVIL] = simpleEffect(
    "ATT_EVIL", "slay evil", "Your weapon returns to normal.", "Your weapon shines brightly!",
  );
  effects[TimedEffect.ATT_DEMON] = simpleEffect(
    "ATT_DEMON", "slay demon",
    "Your weapon returns to normal.", "Your weapon glows with holy fury!",
  );
  effects[TimedEffect.ATT_VAMP] = simpleEffect(
    "ATT_VAMP", "vampiric drain",
    "Your weapon returns to normal.", "Your weapon thirsts for blood!",
  );
  effects[TimedEffect.HEAL] = simpleEffect(
    "HEAL", "regeneration", "Your body slows its healing.", "Your body regenerates quickly!",
  );
  effects[TimedEffect.COMMAND] = simpleEffect(
    "COMMAND", "monster command",
    "You lose your power of command.", "You feel a power over monsters!",
    32767, TMD_FLAG_NONSTACKING,
  );
  effects[TimedEffect.ATT_RUN] = simpleEffect(
    "ATT_RUN", "terror strike",
    "Your weapon returns to normal.", "Your weapon strikes with terror!",
  );
  effects[TimedEffect.COVERTRACKS] = simpleEffect(
    "COVERTRACKS", "cover tracks",
    "You feel less stealthy.", "You begin covering your tracks!",
  );
  effects[TimedEffect.POWERSHOT] = simpleEffect(
    "POWERSHOT", "power shot",
    "Your shooting returns to normal.", "You prepare a power shot!",
    32767, TMD_FLAG_NONSTACKING,
  );
  effects[TimedEffect.TAUNT] = simpleEffect(
    "TAUNT", "taunt", "You stop taunting.", "You start taunting monsters!",
  );
  effects[TimedEffect.BLOODLUST] = simpleEffect(
    "BLOODLUST", "bloodlust",
    "Your bloodlust fades.", "Your bloodlust rises!",
  );
  effects[TimedEffect.BLACKBREATH] = simpleEffect(
    "BLACKBREATH", "black breath",
    "The black breath leaves you.", "You feel the black breath seize you!",
  );
  effects[TimedEffect.STEALTH] = simpleEffect(
    "STEALTH", "enhanced stealth",
    "You feel less stealthy.", "You feel more stealthy!",
  );
  effects[TimedEffect.FREE_ACT] = simpleEffect(
    "FREE_ACT", "free action",
    "You feel sluggish.", "You feel free to act!",
  );

  // Food effect has special grades
  effects[TimedEffect.FOOD] = {
    name: "FOOD",
    desc: "nourishment",
    onEnd: null,
    onIncrease: null,
    onDecrease: null,
    grades: [
      { grade: 0, max: 0, name: null, upMsg: null, downMsg: null },
      { grade: 1, max: PY_FOOD_STARVE, name: "Starving", upMsg: null, downMsg: "You are getting faint from hunger!" },
      { grade: 2, max: PY_FOOD_FAINT, name: "Faint", upMsg: null, downMsg: "You are getting weak from hunger!" },
      { grade: 3, max: PY_FOOD_WEAK, name: "Weak", upMsg: null, downMsg: "You are getting hungry." },
      { grade: 4, max: PY_FOOD_HUNGRY, name: "Hungry", upMsg: null, downMsg: null },
      { grade: 5, max: PY_FOOD_FULL, name: "Fed", upMsg: "You are no longer hungry.", downMsg: null },
      { grade: 6, max: PY_FOOD_MAX, name: "Full", upMsg: "You are full!", downMsg: null },
    ],
    flags: 0,
    lowerBound: 0,
  };

  return effects;
}

// ── Module-level effect data (can be replaced via setTimedEffectData) ──

let effectData: TimedEffectData[] = DEFAULT_EFFECTS;

/**
 * Replace the timed effect data table (for data-driven loading).
 */
export function setTimedEffectData(data: TimedEffectData[]): void {
  effectData = data;
}

/**
 * Get the metadata for a timed effect.
 */
export function getTimedEffectData(idx: TimedEffect): TimedEffectData {
  return effectData[idx]!;
}

// ── Grade resolution ──

/**
 * Find the grade for a given duration value.
 */
function findGrade(effect: TimedEffectData, duration: number): TimedEffectGrade {
  const grades = effect.grades;
  // Walk through grades; each grade covers (previous max, this max]
  let result = grades[0]!; // "off" grade
  for (let i = 1; i < grades.length; i++) {
    const g = grades[i]!;
    if (duration > result.max) {
      result = g;
    }
    if (duration <= g.max) {
      break;
    }
  }
  return duration <= 0 ? grades[0]! : result;
}

// ── Core operations ──

/**
 * Set a timed effect to a specific duration.
 *
 * Port of C `player_set_timed()`.
 *
 * @param player  - The player to affect.
 * @param effect  - The timed effect index.
 * @param duration - The new duration value.
 * @param notify  - Whether to generate messages for minor changes.
 * @returns A result indicating whether the player was notified and any messages.
 */
export function setTimedEffect(
  player: Player,
  effect: TimedEffect,
  duration: number,
  notify: boolean,
): TimedEffectResult {
  const messages: string[] = [];
  const data = effectData[effect]!;

  // Apply lower bound
  let v = Math.max(duration, data.lowerBound);

  // Find current and target grades
  const currentGrade = findGrade(data, player.timed[effect]!);
  const newGrade = findGrade(data, v);

  // Clamp to the maximum of the highest grade
  const maxGrade = data.grades[data.grades.length - 1]!;
  if (v > maxGrade.max) {
    if (player.timed[effect] === maxGrade.max) {
      // Already at max, no change
      return { changed: false, messages: [] };
    }
    v = maxGrade.max;
  }

  // No change
  if (player.timed[effect] === v) {
    return { changed: false, messages: [] };
  }

  const oldDuration = player.timed[effect]!;

  // Determine notification messages
  if (newGrade.grade > currentGrade.grade) {
    // Going up a grade — always notify
    if (newGrade.upMsg) {
      messages.push(newGrade.upMsg);
    }
    notify = true;
  } else if (newGrade.grade < currentGrade.grade && newGrade.downMsg) {
    // Going down a grade with a down message
    messages.push(newGrade.downMsg);
    notify = true;
  } else if (notify) {
    if (v === 0) {
      // Finishing
      if (data.onEnd) {
        messages.push(data.onEnd);
      }
    } else if (oldDuration > v && data.onDecrease) {
      // Decrementing
      messages.push(data.onDecrease);
    } else if (v > oldDuration && data.onIncrease) {
      // Incrementing
      messages.push(data.onIncrease);
    }
  }

  // Apply the new duration
  player.timed[effect] = v;

  return { changed: notify, messages };
}

/**
 * Increase the duration of a timed effect.
 *
 * Port of C `player_inc_timed()`.
 *
 * @param player - The player to affect.
 * @param effect - The timed effect index.
 * @param amount - The amount to add to the current duration.
 * @param notify - Whether to generate messages.
 * @returns A result indicating whether the player was notified and any messages.
 */
export function incTimedEffect(
  player: Player,
  effect: TimedEffect,
  amount: number,
  notify: boolean,
): TimedEffectResult {
  const data = effectData[effect]!;

  // Nonstacking effects cannot be increased once active
  if ((data.flags & TMD_FLAG_NONSTACKING) !== 0 && player.timed[effect]! > 0) {
    return { changed: false, messages: [] };
  }

  return setTimedEffect(player, effect, player.timed[effect]! + amount, notify);
}

/**
 * Decrease the duration of a timed effect.
 *
 * Port of C `player_dec_timed()`.
 *
 * @param player - The player to affect.
 * @param effect - The timed effect index.
 * @param amount - The amount to subtract from the current duration.
 * @param notify - Whether to generate messages.
 * @returns A result indicating whether the player was notified and any messages.
 */
export function decTimedEffect(
  player: Player,
  effect: TimedEffect,
  amount: number,
  notify: boolean,
): TimedEffectResult {
  const newValue = player.timed[effect]! - amount;

  // If finishing (going to zero or below), always notify
  if (newValue <= 0) {
    return setTimedEffect(player, effect, newValue, true);
  }

  return setTimedEffect(player, effect, newValue, notify);
}

/**
 * Clear a timed effect (set to 0).
 *
 * Port of C `player_clear_timed()`.
 *
 * @param player - The player to affect.
 * @param effect - The timed effect index.
 * @param notify - Whether to generate messages.
 * @returns A result indicating whether the player was notified and any messages.
 */
export function clearTimedEffect(
  player: Player,
  effect: TimedEffect,
  notify: boolean,
): TimedEffectResult {
  return setTimedEffect(player, effect, 0, notify);
}

/**
 * Clear all timed effects on the player.
 */
export function clearAllTimedEffects(player: Player): void {
  for (let i = 0; i < TMD_MAX; i++) {
    player.timed[i] = 0;
  }
}

/**
 * Check whether the player currently has a timed effect active.
 */
export function playerHasTimedEffect(
  player: Player,
  effect: TimedEffect,
): boolean {
  return player.timed[effect]! > 0;
}

/**
 * Get the remaining duration of a timed effect.
 */
export function getTimedEffectDuration(
  player: Player,
  effect: TimedEffect,
): number {
  return player.timed[effect]!;
}

/**
 * Check if the player's timed effect matches a specific grade name.
 *
 * Port of C `player_timed_grade_eq()`.
 */
export function playerTimedGradeEq(
  player: Player,
  effect: TimedEffect,
  match: string,
): boolean {
  if (player.timed[effect]! <= 0) return false;
  const data = effectData[effect]!;
  const grade = findGrade(data, player.timed[effect]!);
  return grade.name !== null && grade.name === match;
}
