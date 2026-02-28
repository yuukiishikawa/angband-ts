/**
 * @file monster/timed.ts
 * @brief Monster timed effects — set, increment, decrement, clear, and query.
 *
 * Port of mon-timed.c. All functions are pure: they mutate the Monster's
 * mTimed array and return whether the timer actually changed, but produce
 * no other side effects (messages, redraws).
 *
 * Copyright (c) 1997-2007 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import {
  type Monster,
  MonsterTimedEffect,
  TimedEffectStack,
  MonsterRaceFlag,
} from "../types/index.js";
import { type RNG, BitFlag } from "../z/index.js";

// ---------------------------------------------------------------------------
// Constants (from mon-timed.h / list-mon-timed.h)
// ---------------------------------------------------------------------------

/** Percentage to-hit reduction per stun level. */
export const STUN_HIT_REDUCTION = 25;

/** Percentage damage reduction when stunned. */
export const STUN_DAM_REDUCTION = 25;

/** Percentage to-hit reduction per confusion level for spells. */
export const CONF_HIT_REDUCTION = 20;

/** Minimum turns a new timed effect can last (MON_INC_MIN_TURNS). */
const MON_INC_MIN_TURNS = 2;

// ---------------------------------------------------------------------------
// Effect metadata (mirrors list-mon-timed.h)
// ---------------------------------------------------------------------------

interface MonTimedEffectDef {
  readonly name: string;
  readonly getsSave: boolean;
  readonly stacking: TimedEffectStack;
  readonly flagResist: MonsterRaceFlag;
  readonly maxTimer: number;
}

/**
 * Static metadata for each monster timed effect, indexed by MonsterTimedEffect.
 */
const EFFECT_DEFS: readonly MonTimedEffectDef[] = [
  /* SLEEP */   { name: "SLEEP",   getsSave: true,  stacking: TimedEffectStack.NO,   flagResist: MonsterRaceFlag.NO_SLEEP, maxTimer: 10000 },
  /* STUN */    { name: "STUN",    getsSave: false, stacking: TimedEffectStack.MAX,  flagResist: MonsterRaceFlag.NO_STUN,  maxTimer: 50 },
  /* CONF */    { name: "CONF",    getsSave: false, stacking: TimedEffectStack.MAX,  flagResist: MonsterRaceFlag.NO_CONF,  maxTimer: 50 },
  /* FEAR */    { name: "FEAR",    getsSave: true,  stacking: TimedEffectStack.INCR, flagResist: MonsterRaceFlag.NO_FEAR,  maxTimer: 10000 },
  /* SLOW */    { name: "SLOW",    getsSave: false, stacking: TimedEffectStack.INCR, flagResist: MonsterRaceFlag.NO_SLOW,  maxTimer: 50 },
  /* FAST */    { name: "FAST",    getsSave: false, stacking: TimedEffectStack.INCR, flagResist: MonsterRaceFlag.NONE,     maxTimer: 50 },
  /* HOLD */    { name: "HOLD",    getsSave: false, stacking: TimedEffectStack.MAX,  flagResist: MonsterRaceFlag.NO_HOLD,  maxTimer: 50 },
  /* DISEN */   { name: "DISEN",   getsSave: false, stacking: TimedEffectStack.MAX,  flagResist: MonsterRaceFlag.IM_DISEN, maxTimer: 50 },
  /* COMMAND */ { name: "COMMAND", getsSave: false, stacking: TimedEffectStack.MAX,  flagResist: MonsterRaceFlag.NONE,     maxTimer: 50 },
  /* CHANGED */ { name: "CHANGED", getsSave: false, stacking: TimedEffectStack.MAX,  flagResist: MonsterRaceFlag.NONE,     maxTimer: 50 },
];

// ---------------------------------------------------------------------------
// Resistance / saving throw helpers
// ---------------------------------------------------------------------------

/**
 * Roll a saving throw for a monster against a timed effect.
 * Unique monsters get a double check.
 */
function savingThrow(mon: Monster, timer: number, rng: RNG): boolean {
  const resistChance = Math.min(90, mon.race.level + Math.max(0, 25 - Math.floor(timer / 2)));

  const isUnique = mon.race.flags.has(MonsterRaceFlag.UNIQUE);
  if (isUnique && rng.randint0(100) < resistChance) {
    return true;
  }

  return rng.randint0(100) < resistChance;
}

/**
 * Determine whether a monster resists a timed effect.
 *
 * @param nofail If true, resistance is bypassed.
 */
function doesResist(
  mon: Monster,
  effectType: MonsterTimedEffect,
  timer: number,
  nofail: boolean,
  rng: RNG,
): boolean {
  const def = EFFECT_DEFS[effectType];
  if (!def) return false;

  if (nofail) return false;

  // Check flag-based resistance
  if (def.flagResist !== MonsterRaceFlag.NONE && mon.race.flags.has(def.flagResist)) {
    return true;
  }

  // Some effects get a saving throw
  if (def.getsSave) {
    return savingThrow(mon, timer, rng);
  }

  return false;
}

// ---------------------------------------------------------------------------
// Core set function (internal)
// ---------------------------------------------------------------------------

/**
 * Set a monster's timed effect to an exact value.
 * Returns true if the timer was actually changed.
 */
function monSetTimed(
  mon: Monster,
  effectType: MonsterTimedEffect,
  timer: number,
  nofail: boolean,
  rng: RNG,
): boolean {
  const def = EFFECT_DEFS[effectType];
  if (!def) return false;

  const oldTimer = mon.mTimed[effectType] ?? 0;

  // Clamp to max
  let newTimer = timer;
  if (newTimer > def.maxTimer) {
    newTimer = def.maxTimer;
  }
  if (newTimer < 0) {
    newTimer = 0;
  }

  // No change
  if (oldTimer === newTimer) {
    return false;
  }

  // Determine whether to check resistance
  let checkResist: boolean;
  if (newTimer === 0) {
    // Turning off - never resist
    checkResist = false;
  } else if (oldTimer === 0) {
    // Turning on - check resistance
    checkResist = true;
  } else if (newTimer > oldTimer) {
    // Increasing - check resistance
    checkResist = true;
  } else {
    // Decreasing - never resist
    checkResist = false;
  }

  if (checkResist && doesResist(mon, effectType, newTimer, nofail, rng)) {
    return false;
  }

  mon.mTimed[effectType] = newTimer;
  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Set a monster timed effect to an exact duration.
 * Returns true if the monster was affected.
 */
export function setMonsterTimedEffect(
  mon: Monster,
  effect: MonsterTimedEffect,
  duration: number,
  rng: RNG,
  nofail = false,
): boolean {
  return monSetTimed(mon, effect, duration, nofail, rng);
}

/**
 * Increase a monster timed effect by the given amount.
 * Stacking rules from list-mon-timed.h are applied.
 * Returns true if the monster's timer changed.
 */
export function incMonsterTimedEffect(
  mon: Monster,
  effect: MonsterTimedEffect,
  amount: number,
  rng: RNG,
  nofail = false,
): boolean {
  if (amount <= 0) return false;

  const def = EFFECT_DEFS[effect];
  if (!def) return false;

  const oldValue = mon.mTimed[effect] ?? 0;

  // Enforce minimum duration for new effects
  let timer = amount;
  if (oldValue === 0 && timer < MON_INC_MIN_TURNS) {
    timer = MON_INC_MIN_TURNS;
  }

  let newValue: number;
  switch (def.stacking) {
    case TimedEffectStack.NO:
      newValue = oldValue === 0 ? timer : oldValue;
      break;
    case TimedEffectStack.MAX:
      newValue = Math.max(oldValue, timer);
      break;
    case TimedEffectStack.INCR:
      newValue = oldValue + timer;
      break;
    default:
      newValue = timer;
  }

  return monSetTimed(mon, effect, newValue, nofail, rng);
}

/**
 * Decrease a monster timed effect by the given amount.
 * Decreases never fail (no resistance check).
 * Returns true if the monster's timer changed.
 */
export function decMonsterTimedEffect(
  mon: Monster,
  effect: MonsterTimedEffect,
  amount: number,
  rng: RNG,
): boolean {
  if (amount <= 0) return false;

  const current = mon.mTimed[effect] ?? 0;
  const newLevel = Math.max(0, current - amount);

  return monSetTimed(mon, effect, newLevel, false, rng);
}

/**
 * Clear a monster timed effect entirely.
 * Returns true if the timer was nonzero and is now cleared.
 */
export function clearMonsterTimedEffect(
  mon: Monster,
  effect: MonsterTimedEffect,
  rng: RNG,
): boolean {
  const current = mon.mTimed[effect] ?? 0;
  if (current === 0) return false;

  return monSetTimed(mon, effect, 0, false, rng);
}

/**
 * The severity level of a timed effect on a monster (0-5).
 * Level 0 = not affected.
 */
export function monsterEffectLevel(mon: Monster, effectType: MonsterTimedEffect): number {
  const def = EFFECT_DEFS[effectType];
  if (!def) return 0;

  const current = mon.mTimed[effectType] ?? 0;
  const divisor = Math.max(Math.floor(def.maxTimer / 5), 1);
  return Math.min(Math.floor((current + divisor - 1) / divisor), 5);
}

// ---------------------------------------------------------------------------
// Convenience predicates
// ---------------------------------------------------------------------------

/** Returns true if the monster is currently confused. */
export function monsterIsConfused(mon: Monster): boolean {
  return (mon.mTimed[MonsterTimedEffect.CONF] ?? 0) > 0;
}

/** Returns true if the monster is currently asleep. */
export function monsterIsAsleep(mon: Monster): boolean {
  return (mon.mTimed[MonsterTimedEffect.SLEEP] ?? 0) > 0;
}

/** Returns true if the monster is currently afraid. */
export function monsterIsAfraid(mon: Monster): boolean {
  return (mon.mTimed[MonsterTimedEffect.FEAR] ?? 0) > 0;
}

/** Returns true if the monster is currently stunned. */
export function monsterIsStunned(mon: Monster): boolean {
  return (mon.mTimed[MonsterTimedEffect.STUN] ?? 0) > 0;
}

/** Returns true if the monster is currently held (paralysed). */
export function monsterIsHeld(mon: Monster): boolean {
  return (mon.mTimed[MonsterTimedEffect.HOLD] ?? 0) > 0;
}

/** Returns true if the monster is currently slowed. */
export function monsterIsSlowed(mon: Monster): boolean {
  return (mon.mTimed[MonsterTimedEffect.SLOW] ?? 0) > 0;
}

/** Returns true if the monster is currently hasted. */
export function monsterIsHasted(mon: Monster): boolean {
  return (mon.mTimed[MonsterTimedEffect.FAST] ?? 0) > 0;
}
