/**
 * @file z/rand.ts
 * @brief A Random Number Generator for Angband
 *
 * Port of z-rand.c — WELL1024a algorithm for game entropy.
 *
 * Copyright (c) 1997 Ben Harrison, Randy Hutson
 * Copyright (c) 2010 Erik Osheim (WELL implementation)
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

/** Assumed maximum dungeon level for bonus calculations. */
export const MAX_RAND_DEPTH = 128;

/** Number of 32-bit integers in the WELL state. */
const RAND_DEG = 32;

/** WELL1024a parameters */
const M1 = 3;
const M2 = 24;
const M3 = 10;

/**
 * Dice roll aspects for calculation helpers.
 */
export const enum Aspect {
  MINIMISE = 0,
  AVERAGE = 1,
  MAXIMISE = 2,
  EXTREMIFY = 3,
  RANDOMISE = 4,
}

/**
 * A strategy for making a dice roll: base + XdY + m_bonus.
 */
export interface RandomValue {
  base: number;
  dice: number;
  sides: number;
  m_bonus: number;
}

/**
 * A random chance of success, e.g. 8 in 125 (6.4%).
 */
export interface RandomChance {
  numerator: number;
  denominator: number;
}

export function randomValue(
  base = 0,
  dice = 0,
  sides = 0,
  m_bonus = 0,
): RandomValue {
  return { base, dice, sides, m_bonus };
}

/**
 * Force a number into uint32 range using bitwise ops.
 * In JS, `x >>> 0` converts to unsigned 32-bit integer.
 */
function u32(n: number): number {
  return n >>> 0;
}

/**
 * Linear Congruential RNG (simple/quick mode).
 */
function LCRNG(x: number): number {
  return u32(Math.imul(x, 1103515245) + 12345);
}

/**
 * The RNG state. Encapsulated in a class for explicit context.
 */
export class RNG {
  /** WELL1024a state array (32 x uint32) */
  private STATE = new Uint32Array(RAND_DEG);
  private state_i = 0;
  private z0 = 0;
  private z1 = 0;
  private z2 = 0;

  /** Whether to use quick (LCRNG) mode. */
  quick = true;

  /** Quick RNG seed/state. */
  quickValue = 0;

  private fixedMode = false;
  private fixedValue = 0;

  /**
   * WELL1024a generator. Returns a uint32.
   */
  private WELLRNG1024a(): number {
    const S = this.STATE;
    const si = this.state_i;

    const VRm1 = S[(si + 31) & 0x1f]!;
    const V0 = S[si]!;
    const VM1 = S[(si + M1) & 0x1f]!;
    const VM2 = S[(si + M2) & 0x1f]!;
    const VM3 = S[(si + M3) & 0x1f]!;

    this.z0 = VRm1;
    this.z1 = u32(V0 ^ (VM1 >>> 8));
    this.z2 = u32((VM2 << 19) ^ (VM3 << 14));

    // newV1 = STATE[state_i]
    S[si] = u32(this.z1 ^ this.z2);
    // newV0 = STATE[(state_i + 31) & 0x1f]
    S[(si + 31) & 0x1f] = u32(
      (this.z0 << 11) ^ (this.z1 << 7) ^ (this.z2 << 13),
    );

    this.state_i = (si + 31) & 0x1f;
    return S[this.state_i]!;
  }

  /**
   * Initialize the complex RNG using a seed.
   */
  stateInit(seed: number): void {
    this.STATE[0] = u32(seed);

    for (let i = 1; i < RAND_DEG; i++) {
      this.STATE[i] = LCRNG(this.STATE[i - 1]!);
    }

    // Cycle the table ten times per degree
    for (let i = 0; i < RAND_DEG * 10; i++) {
      const j = (this.state_i + 1) % RAND_DEG;
      this.STATE[j] = u32(this.STATE[j]! + this.STATE[this.state_i]!);
      this.state_i = j;
    }
  }

  /**
   * Initialize the RNG with a time-based seed.
   */
  init(): void {
    if (this.quick) {
      let seed = u32(Date.now());
      seed = u32((seed >>> 3) * 2);
      this.quick = false;
      this.stateInit(seed);
    }
  }

  /**
   * Extract a random number from 0 to m-1 via rejection sampling.
   * Unbiased. Matches C Rand_div() exactly.
   */
  div(m: number): number {
    if (m <= 1) return 0;

    if (this.fixedMode) {
      return Math.floor((this.fixedValue * 1000 * (m - 1)) / (100 * 1000));
    }

    const n = Math.floor(0x10000000 / m);
    let r = 0;

    if (this.quick) {
      while (true) {
        this.quickValue = LCRNG(this.quickValue);
        r = Math.floor(((this.quickValue >>> 4) & 0x0fffffff) / n);
        if (r < m) break;
      }
    } else {
      while (true) {
        const raw = this.WELLRNG1024a();
        r = Math.floor(((raw >>> 4) & 0x0fffffff) / n);
        if (r < m) break;
      }
    }

    return r;
  }

  /** Random 0..m-1 (signed). Equivalent to C randint0(M). */
  randint0(m: number): number {
    return this.div(m) | 0;
  }

  /** Random 1..m (signed). Equivalent to C randint1(M). */
  randint1(m: number): number {
    return (this.div(m) | 0) + 1;
  }

  /** Return true one time in x. */
  oneIn(x: number): boolean {
    return this.randint0(x) === 0;
  }

  /** Random A..B inclusive. */
  range(a: number, b: number): number {
    if (a === b) return a;
    return a + this.div(1 + b - a);
  }

  /** Random spread: A-D..A+D inclusive. */
  spread(a: number, d: number): number {
    return a + this.randint0(1 + d + d) - d;
  }

  /**
   * Normal distribution using lookup table.
   * Matches C Rand_normal() exactly.
   */
  normal(mean: number, stand: number): number {
    if (stand < 1) return mean;

    const tmp = this.randint0(32768);

    // Binary search in the normal table
    let low = 0;
    let high = RANDNOR_NUM;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (RAND_NORMAL_TABLE[mid]! < tmp) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    const offset = Math.floor((stand * low) / RANDNOR_STD);

    if (this.oneIn(2)) return mean - offset;
    return mean + offset;
  }

  /**
   * Sample from a distribution with known mean, upper, and lower bounds.
   */
  sample(
    mean: number,
    upper: number,
    lower: number,
    standU: number,
    standL: number,
  ): number {
    let pick = this.normal(0, 1000);

    if (pick > 0) {
      pick = Math.floor((pick * (upper - mean)) / (100 * standU));
    } else if (pick < 0) {
      pick = Math.floor((pick * (mean - lower)) / (100 * standL));
    }

    return mean + pick;
  }

  /**
   * Simulate dice: roll `num` dice with `sides` sides.
   */
  damroll(num: number, sides: number): number {
    if (sides <= 0) return 0;
    let sum = 0;
    for (let i = 0; i < num; i++) {
      sum += this.randint1(sides);
    }
    return sum;
  }

  /**
   * Fix RNG output for testing. val = 0..100 (percent of max).
   */
  fix(val: number): void {
    this.fixedMode = true;
    this.fixedValue = val;
  }

  /**
   * Unfix the RNG.
   */
  unfix(): void {
    this.fixedMode = false;
    this.fixedValue = 0;
  }

  /**
   * Get the full WELL state (for save/restore).
   */
  getState(): { STATE: Uint32Array; state_i: number } {
    return {
      STATE: new Uint32Array(this.STATE),
      state_i: this.state_i,
    };
  }

  /**
   * Restore the WELL state.
   */
  setState(state: { STATE: Uint32Array; state_i: number }): void {
    this.STATE.set(state.STATE);
    this.state_i = state.state_i;
  }
}

/**
 * Perform division, possibly rounding up based on remainder and chance.
 */
function simulateDivision(rng: RNG, dividend: number, divisor: number): number {
  const quotient = Math.floor(dividend / divisor);
  const remainder = ((dividend % divisor) + divisor) % divisor;
  return rng.randint0(divisor) < remainder ? quotient + 1 : quotient;
}

/**
 * Calculation helper for damroll.
 */
export function damcalc(
  rng: RNG,
  num: number,
  sides: number,
  aspect: Aspect,
): number {
  switch (aspect) {
    case Aspect.MAXIMISE:
    case Aspect.EXTREMIFY:
      return num * sides;
    case Aspect.RANDOMISE:
      return rng.damroll(num, sides);
    case Aspect.MINIMISE:
      return num;
    case Aspect.AVERAGE:
      return Math.floor((num * (sides + 1)) / 2);
  }
}

/**
 * Help determine an enchantment bonus.
 */
export function mBonus(rng: RNG, max: number, level: number): number {
  let lvl = level;
  if (lvl >= MAX_RAND_DEPTH) lvl = MAX_RAND_DEPTH - 1;

  const bonus = simulateDivision(rng, max * lvl, MAX_RAND_DEPTH);
  const stand = simulateDivision(rng, max, 4);
  const value = rng.normal(bonus, stand);

  if (value < 0) return 0;
  if (value > max) return max;
  return value;
}

/**
 * Calculation helper for m_bonus.
 */
export function mBonusCalc(
  rng: RNG,
  max: number,
  level: number,
  aspect: Aspect,
): number {
  switch (aspect) {
    case Aspect.EXTREMIFY:
    case Aspect.MAXIMISE:
      return max;
    case Aspect.RANDOMISE:
      return mBonus(rng, max, level);
    case Aspect.MINIMISE:
      return 0;
    case Aspect.AVERAGE:
      return Math.floor((max * level) / MAX_RAND_DEPTH);
  }
}

/**
 * Evaluate a RandomValue with a given aspect.
 */
export function randcalc(
  rng: RNG,
  v: RandomValue,
  level: number,
  aspect: Aspect,
): number {
  if (aspect === Aspect.EXTREMIFY) {
    const min = randcalc(rng, v, level, Aspect.MINIMISE);
    const max = randcalc(rng, v, level, Aspect.MAXIMISE);
    return Math.abs(min) > Math.abs(max) ? min : max;
  }

  const dmg = damcalc(rng, v.dice, v.sides, aspect);
  const bonus = mBonusCalc(rng, v.m_bonus, level, aspect);
  return v.base + dmg + bonus;
}

/**
 * Test if a value is within a RandomValue's range.
 */
export function randcalcValid(
  rng: RNG,
  v: RandomValue,
  test: number,
): boolean {
  if (test < randcalc(rng, v, 0, Aspect.MINIMISE)) return false;
  if (test > randcalc(rng, v, 0, Aspect.MAXIMISE)) return false;
  return true;
}

/**
 * Test if a RandomValue actually varies.
 */
export function randcalcVaries(rng: RNG, v: RandomValue): boolean {
  return (
    randcalc(rng, v, 0, Aspect.MINIMISE) !==
    randcalc(rng, v, 0, Aspect.MAXIMISE)
  );
}

/**
 * Roll on a random chance and check for success.
 */
export function randomChanceCheck(rng: RNG, c: RandomChance): boolean {
  return rng.randint0(c.denominator) >= c.denominator - c.numerator;
}

/**
 * Scale a random chance to use a new denominator.
 */
export function randomChanceScaled(c: RandomChance, scale: number): number {
  return Math.floor((scale * c.numerator) / c.denominator);
}

// ── Normal distribution table ──

const RANDNOR_NUM = 256;
const RANDNOR_STD = 64;

/**
 * Lookup table for Rand_normal(). Each entry N at index 64*i represents
 * the probability (out of 32767) that a normally distributed variable
 * falls within i standard deviations of the mean.
 */
const RAND_NORMAL_TABLE = new Int16Array([
  206, 613, 1022, 1430, 1838, 2245, 2652, 3058, 3463, 3867, 4271, 4673, 5075,
  5475, 5874, 6271, 6667, 7061, 7454, 7845, 8234, 8621, 9006, 9389, 9770,
  10148, 10524, 10898, 11269, 11638, 12004, 12367, 12727, 13085, 13440, 13792,
  14140, 14486, 14828, 15168, 15504, 15836, 16166, 16492, 16814, 17133, 17449,
  17761, 18069, 18374, 18675, 18972, 19266, 19556, 19842, 20124, 20403, 20678,
  20949, 21216, 21479, 21738, 21994, 22245, 22493, 22737, 22977, 23213, 23446,
  23674, 23899, 24120, 24336, 24550, 24759, 24965, 25166, 25365, 25559, 25750,
  25937, 26120, 26300, 26476, 26649, 26818, 26983, 27146, 27304, 27460, 27612,
  27760, 27906, 28048, 28187, 28323, 28455, 28585, 28711, 28835, 28955, 29073,
  29188, 29299, 29409, 29515, 29619, 29720, 29818, 29914, 30007, 30098, 30186,
  30272, 30356, 30437, 30516, 30593, 30668, 30740, 30810, 30879, 30945, 31010,
  31072, 31133, 31192, 31249, 31304, 31358, 31410, 31460, 31509, 31556, 31601,
  31646, 31688, 31730, 31770, 31808, 31846, 31882, 31917, 31950, 31983, 32014,
  32044, 32074, 32102, 32129, 32155, 32180, 32205, 32228, 32251, 32273, 32294,
  32314, 32333, 32352, 32370, 32387, 32404, 32420, 32435, 32450, 32464, 32477,
  32490, 32503, 32515, 32526, 32537, 32548, 32558, 32568, 32577, 32586, 32595,
  32603, 32611, 32618, 32625, 32632, 32639, 32645, 32651, 32657, 32662, 32667,
  32672, 32677, 32682, 32686, 32690, 32694, 32698, 32702, 32705, 32708, 32711,
  32714, 32717, 32720, 32722, 32725, 32727, 32729, 32731, 32733, 32735, 32737,
  32739, 32740, 32742, 32743, 32745, 32746, 32747, 32748, 32749, 32750, 32751,
  32752, 32753, 32754, 32755, 32756, 32757, 32757, 32758, 32758, 32759, 32760,
  32760, 32761, 32761, 32761, 32762, 32762, 32763, 32763, 32763, 32764, 32764,
  32764, 32764, 32765, 32765, 32765, 32765, 32766, 32766, 32766, 32766, 32767,
]);
