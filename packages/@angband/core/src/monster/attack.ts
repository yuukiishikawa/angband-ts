/**
 * @file monster/attack.ts
 * @brief Monster melee combat — resolve blows against the player.
 *
 * Port of mon-attack.c (make_attack_normal) and parts of mon-blows.c.
 * All functions are pure data-returning — no UI side effects.
 *
 * Copyright (c) 1997 Ben Harrison, David Reeve Sward, Keldon Jones.
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import {
  type Monster,
  type MonsterRace,
  type MonsterBlow,
  type Player,
  BlowMethod,
  BlowEffect,
  MonsterRaceFlag,
  MonsterTimedEffect,
  TimedEffect,
  Stat,
} from "../types/index.js";
import { type RNG, type RandomValue, Aspect, randcalc } from "../z/index.js";
import { STUN_HIT_REDUCTION, STUN_DAM_REDUCTION, monsterIsStunned } from "./timed.js";

// ---------------------------------------------------------------------------
// Result interfaces
// ---------------------------------------------------------------------------

/** Status effect that a blow may inflict on the target. */
export interface StatusEffect {
  /** The kind of status (e.g. "poison", "blind", "paralyze", "drain_str"). */
  readonly kind: string;
  /** Duration or magnitude, if applicable. */
  readonly amount: number;
}

/** Result of resolving a single blow effect (damage + optional status). */
export interface BlowEffectResult {
  /** Actual damage dealt after AC reduction. */
  readonly damage: number;
  /** Optional status effect inflicted. */
  readonly statusEffect: StatusEffect | null;
  /** Flavour message describing the effect. */
  readonly message: string;
}

/** Result of a single melee blow. */
export interface AttackResult {
  /** Whether the blow connected. */
  readonly hit: boolean;
  /** Raw damage dealt (0 if missed). */
  readonly damage: number;
  /** The blow effect that was applied (NONE if missed). */
  readonly effect: BlowEffect;
  /** The blow method used. */
  readonly method: BlowMethod;
  /** Flavour message. */
  readonly message: string;
  /** Detailed effect result, if the blow hit. */
  readonly effectResult: BlowEffectResult | null;
  /** Whether this blow is a critical hit. */
  readonly critical: number;
}

// ---------------------------------------------------------------------------
// Blow method metadata
// ---------------------------------------------------------------------------

/**
 * Static metadata for blow methods.
 * In the C code this is loaded from blow_methods.txt; here we hard-code
 * the essential properties.
 */
interface BlowMethodMeta {
  readonly name: string;
  readonly cut: boolean;
  readonly stun: boolean;
  readonly miss: boolean;
  /** Physical blow (contributes to hit chance). */
  readonly phys: boolean;
  readonly desc: string;
}

const METHOD_META: Partial<Record<BlowMethod, BlowMethodMeta>> = {
  [BlowMethod.HIT]:    { name: "HIT",    cut: true,  stun: true,  miss: true,  phys: true,  desc: "hits" },
  [BlowMethod.TOUCH]:  { name: "TOUCH",  cut: false, stun: false, miss: true,  phys: true,  desc: "touches" },
  [BlowMethod.PUNCH]:  { name: "PUNCH",  cut: false, stun: true,  miss: true,  phys: true,  desc: "punches" },
  [BlowMethod.KICK]:   { name: "KICK",   cut: false, stun: true,  miss: true,  phys: true,  desc: "kicks" },
  [BlowMethod.CLAW]:   { name: "CLAW",   cut: true,  stun: false, miss: true,  phys: true,  desc: "claws" },
  [BlowMethod.BITE]:   { name: "BITE",   cut: true,  stun: false, miss: true,  phys: true,  desc: "bites" },
  [BlowMethod.STING]:  { name: "STING",  cut: false, stun: false, miss: true,  phys: true,  desc: "stings" },
  [BlowMethod.BUTT]:   { name: "BUTT",   cut: false, stun: true,  miss: true,  phys: true,  desc: "butts" },
  [BlowMethod.CRUSH]:  { name: "CRUSH",  cut: false, stun: true,  miss: true,  phys: true,  desc: "crushes" },
  [BlowMethod.ENGULF]: { name: "ENGULF", cut: false, stun: false, miss: true,  phys: true,  desc: "engulfs" },
  [BlowMethod.CRAWL]:  { name: "CRAWL",  cut: false, stun: false, miss: false, phys: false, desc: "crawls on" },
  [BlowMethod.DROOL]:  { name: "DROOL",  cut: false, stun: false, miss: false, phys: false, desc: "drools on" },
  [BlowMethod.SPIT]:   { name: "SPIT",   cut: false, stun: false, miss: false, phys: false, desc: "spits on" },
  [BlowMethod.GAZE]:   { name: "GAZE",   cut: false, stun: false, miss: false, phys: false, desc: "gazes at" },
  [BlowMethod.WAIL]:   { name: "WAIL",   cut: false, stun: false, miss: false, phys: false, desc: "wails at" },
  [BlowMethod.SPORE]:  { name: "SPORE",  cut: false, stun: false, miss: false, phys: false, desc: "releases spores at" },
  [BlowMethod.BEG]:    { name: "BEG",    cut: false, stun: false, miss: false, phys: false, desc: "begs" },
  [BlowMethod.INSULT]: { name: "INSULT", cut: false, stun: false, miss: false, phys: false, desc: "insults" },
  [BlowMethod.MOAN]:   { name: "MOAN",   cut: false, stun: false, miss: false, phys: false, desc: "moans" },
};

// ---------------------------------------------------------------------------
// Blow effect metadata
// ---------------------------------------------------------------------------

/**
 * Static metadata for blow effects.
 * `power` is the effect's contribution to the to-hit roll (from blow_effects.txt).
 */
interface BlowEffectMeta {
  readonly name: string;
  /** Power contribution to the to-hit calculation. */
  readonly power: number;
  readonly desc: string;
}

const EFFECT_META: Partial<Record<BlowEffect, BlowEffectMeta>> = {
  [BlowEffect.NONE]:           { name: "NONE",           power: 0,  desc: "" },
  [BlowEffect.HURT]:           { name: "HURT",           power: 60, desc: "attack" },
  [BlowEffect.POISON]:         { name: "POISON",         power: 5,  desc: "poison" },
  [BlowEffect.DISENCHANT]:     { name: "DISENCHANT",     power: 20, desc: "disenchant" },
  [BlowEffect.DRAIN_CHARGES]:  { name: "DRAIN_CHARGES",  power: 15, desc: "drain charges" },
  [BlowEffect.EAT_GOLD]:       { name: "EAT_GOLD",       power: 5,  desc: "steal gold" },
  [BlowEffect.EAT_ITEM]:       { name: "EAT_ITEM",       power: 5,  desc: "steal item" },
  [BlowEffect.EAT_FOOD]:       { name: "EAT_FOOD",       power: 5,  desc: "eat food" },
  [BlowEffect.EAT_LIGHT]:      { name: "EAT_LIGHT",      power: 5,  desc: "drain light" },
  [BlowEffect.ACID]:           { name: "ACID",           power: 0,  desc: "shoot acid" },
  [BlowEffect.ELEC]:           { name: "ELEC",           power: 10, desc: "electrocute" },
  [BlowEffect.FIRE]:           { name: "FIRE",           power: 10, desc: "burn" },
  [BlowEffect.COLD]:           { name: "COLD",           power: 10, desc: "freeze" },
  [BlowEffect.BLIND]:          { name: "BLIND",          power: 2,  desc: "blind" },
  [BlowEffect.CONFUSE]:        { name: "CONFUSE",        power: 10, desc: "confuse" },
  [BlowEffect.TERRIFY]:        { name: "TERRIFY",        power: 10, desc: "terrify" },
  [BlowEffect.PARALYZE]:       { name: "PARALYZE",       power: 2,  desc: "paralyze" },
  [BlowEffect.LOSE_STR]:       { name: "LOSE_STR",       power: 0,  desc: "drain strength" },
  [BlowEffect.LOSE_INT]:       { name: "LOSE_INT",       power: 0,  desc: "drain intelligence" },
  [BlowEffect.LOSE_WIS]:       { name: "LOSE_WIS",       power: 0,  desc: "drain wisdom" },
  [BlowEffect.LOSE_DEX]:       { name: "LOSE_DEX",       power: 0,  desc: "drain dexterity" },
  [BlowEffect.LOSE_CON]:       { name: "LOSE_CON",       power: 0,  desc: "drain constitution" },
  [BlowEffect.LOSE_ALL]:       { name: "LOSE_ALL",       power: 2,  desc: "drain all stats" },
  [BlowEffect.SHATTER]:        { name: "SHATTER",        power: 60, desc: "shatter" },
  [BlowEffect.EXP_10]:         { name: "EXP_10",         power: 5,  desc: "drain experience (10)" },
  [BlowEffect.EXP_20]:         { name: "EXP_20",         power: 5,  desc: "drain experience (20)" },
  [BlowEffect.EXP_40]:         { name: "EXP_40",         power: 5,  desc: "drain experience (40)" },
  [BlowEffect.EXP_80]:         { name: "EXP_80",         power: 5,  desc: "drain experience (80)" },
  [BlowEffect.HALLU]:          { name: "HALLU",          power: 10, desc: "hallucinate" },
  [BlowEffect.BLACK_BREATH]:   { name: "BLACK_BREATH",   power: 40, desc: "black breath" },
};

// ---------------------------------------------------------------------------
// To-hit and AC helpers
// ---------------------------------------------------------------------------

/**
 * Simulate a to-hit test (equivalent to C test_hit / hit_chance).
 * Uses the same formula as C Angband:
 *   - Always hit 12% of the time
 *   - Always miss 5% of the time
 *   - Floor of 9 on to_hit
 *   - Hit if roll >= AC * 2/3
 */
export function testHit(toHit: number, ac: number, rng: RNG): boolean {
  const HUNDRED_PCT = 10000;
  const ALWAYS_HIT = 1200;
  const ALWAYS_MISS = 500;

  // Floor on to_hit
  const effectiveToHit = Math.max(9, toHit);

  // Calculate base hit percentage (scaled to 10000)
  const baseChance = Math.max(0, effectiveToHit - Math.floor(ac * 2 / 3));
  const hitRate = Math.floor(HUNDRED_PCT * baseChance / effectiveToHit);

  // Apply guaranteed hit/miss range
  const numerator = Math.floor(
    hitRate * (HUNDRED_PCT - ALWAYS_MISS - ALWAYS_HIT) / HUNDRED_PCT
  ) + ALWAYS_HIT;

  return rng.randint0(HUNDRED_PCT) < numerator;
}

/**
 * Base to-hit value for a monster melee blow.
 * = MAX(race.level, 1) * 3 + effect.power
 */
export function chanceOfMonsterHitBase(race: MonsterRace, effect: BlowEffect): number {
  const effectMeta = EFFECT_META[effect];
  const power = effectMeta?.power ?? 0;
  return Math.max(race.level, 1) * 3 + power;
}

/**
 * Effective to-hit for a specific monster instance (applies stun penalty).
 */
function chanceOfMonsterHit(mon: Monster, effect: BlowEffect): number {
  let toHit = chanceOfMonsterHitBase(mon.race, effect);

  if (monsterIsStunned(mon)) {
    toHit = Math.floor(toHit * (100 - STUN_HIT_REDUCTION) / 100);
  }

  return toHit;
}

/**
 * Reduce damage by armor class.
 * AC caps at 240 for this calculation.
 */
export function adjustDamArmor(damage: number, ac: number): number {
  const effectiveAc = Math.min(ac, 240);
  return damage - Math.floor(damage * effectiveAc / 400);
}

// ---------------------------------------------------------------------------
// Critical blow calculation
// ---------------------------------------------------------------------------

/**
 * Determine critical hit severity.
 * Returns 0 for non-critical, 1-7+ for increasing severity.
 *
 * Port of monster_critical() in mon-attack.c.
 */
export function monsterCritical(dice: RandomValue, rlev: number, dam: number, rng: RNG): number {
  const total = randcalc(rng, dice, rlev, Aspect.MAXIMISE);

  // Must do at least 95% of perfect
  if (dam < Math.floor(total * 19 / 20)) return 0;

  // Weak blows rarely work
  if (dam < 20 && rng.randint0(100) >= dam) return 0;

  let max = 0;

  // Perfect damage bonus
  if (dam === total) max++;

  // Super-charge
  if (dam >= 20) {
    while (rng.randint0(100) < 2) max++;
  }

  // Critical damage tier
  if (dam > 45) return 6 + max;
  if (dam > 33) return 5 + max;
  if (dam > 25) return 4 + max;
  if (dam > 18) return 3 + max;
  if (dam > 11) return 2 + max;
  return 1 + max;
}

// ---------------------------------------------------------------------------
// Blow damage calculation
// ---------------------------------------------------------------------------

/**
 * Roll damage for a single monster blow.
 * Accounts for stun damage reduction.
 */
export function calculateBlowDamage(
  blow: MonsterBlow,
  rlev: number,
  mon: Monster,
  rng: RNG,
): number {
  let damage = randcalc(rng, blow.dice, rlev, Aspect.RANDOMISE);

  // Stun reduces damage
  if (monsterIsStunned(mon)) {
    damage = Math.floor(damage * (100 - STUN_DAM_REDUCTION) / 100);
  }

  return damage;
}

// ---------------------------------------------------------------------------
// Blow method resolution
// ---------------------------------------------------------------------------

/**
 * Determine whether a blow hits the player.
 *
 * NONE-effect blows always hit (they are passive effects like drool).
 * Otherwise a standard to-hit vs AC check is performed.
 */
export function resolveBlowMethod(
  method: BlowMethod,
  effect: BlowEffect,
  mon: Monster,
  playerAc: number,
  rng: RNG,
): boolean {
  // NONE-effect blows always hit
  if (effect === BlowEffect.NONE) return true;

  const toHit = chanceOfMonsterHit(mon, effect);
  return testHit(toHit, playerAc, rng);
}

// ---------------------------------------------------------------------------
// Blow effect resolution
// ---------------------------------------------------------------------------

/**
 * Map a BlowEffect to a status effect kind string.
 */
function effectToStatusKind(effect: BlowEffect): string | null {
  switch (effect) {
    case BlowEffect.POISON:     return "poison";
    case BlowEffect.BLIND:      return "blind";
    case BlowEffect.CONFUSE:    return "confuse";
    case BlowEffect.TERRIFY:    return "fear";
    case BlowEffect.PARALYZE:   return "paralyze";
    case BlowEffect.HALLU:      return "hallucinate";
    case BlowEffect.LOSE_STR:   return "drain_str";
    case BlowEffect.LOSE_INT:   return "drain_int";
    case BlowEffect.LOSE_WIS:   return "drain_wis";
    case BlowEffect.LOSE_DEX:   return "drain_dex";
    case BlowEffect.LOSE_CON:   return "drain_con";
    case BlowEffect.LOSE_ALL:   return "drain_all";
    case BlowEffect.EXP_10:     return "drain_exp";
    case BlowEffect.EXP_20:     return "drain_exp";
    case BlowEffect.EXP_40:     return "drain_exp";
    case BlowEffect.EXP_80:     return "drain_exp";
    case BlowEffect.DISENCHANT: return "disenchant";
    case BlowEffect.EAT_GOLD:   return "steal_gold";
    case BlowEffect.EAT_ITEM:   return "steal_item";
    case BlowEffect.EAT_FOOD:   return "eat_food";
    case BlowEffect.EAT_LIGHT:  return "drain_light";
    case BlowEffect.BLACK_BREATH: return "black_breath";
    default:                     return null;
  }
}

/**
 * Resolve the effect of a melee blow that has already hit.
 *
 * Returns the damage after AC adjustment and any status effect to apply.
 * This is a pure function — it does not mutate player state.
 */
export function resolveBlowEffect(
  effect: BlowEffect,
  rawDamage: number,
  playerAc: number,
): BlowEffectResult {
  const effectMeta = EFFECT_META[effect];
  const desc = effectMeta?.desc ?? "attack";
  const statusKind = effectToStatusKind(effect);

  // Physical damage effects get AC reduction
  let damage: number;
  switch (effect) {
    case BlowEffect.HURT:
    case BlowEffect.SHATTER:
      damage = adjustDamArmor(rawDamage, playerAc);
      break;

    // Elemental blows get partial AC reduction
    case BlowEffect.ACID:
    case BlowEffect.ELEC:
    case BlowEffect.FIRE:
    case BlowEffect.COLD:
      damage = adjustDamArmor(rawDamage, playerAc);
      break;

    // Most other effects pass raw damage through
    default:
      damage = rawDamage;
      break;
  }

  // Ensure non-negative
  if (damage < 0) damage = 0;

  const statusEffect = statusKind
    ? { kind: statusKind, amount: damage }
    : null;

  return {
    damage,
    statusEffect,
    message: desc,
  };
}

// ---------------------------------------------------------------------------
// Full attack resolution
// ---------------------------------------------------------------------------

/**
 * Execute all melee blows for one monster attack against the player.
 *
 * Port of make_attack_normal() from mon-attack.c.
 * Returns an array of results for each blow attempted.
 * Does NOT mutate player HP — callers apply the results.
 */
export function monsterAttackPlayer(
  mon: Monster,
  player: Player,
  rng: RNG,
): AttackResult[] {
  const results: AttackResult[] = [];

  // Not allowed to attack
  if (mon.race.flags.has(MonsterRaceFlag.NEVER_BLOW)) {
    return results;
  }

  const rlev = Math.max(mon.race.level, 1);
  const playerAc = player.state.ac + player.state.toA;
  const monName = mon.race.name;

  for (const blow of mon.race.blows) {
    // Skip NONE-method blows (end of blow list)
    if (blow.method === BlowMethod.NONE) break;

    const methodMeta = METHOD_META[blow.method];
    const methodDesc = methodMeta?.desc ?? "attacks";

    // Check if the blow hits
    const hit = resolveBlowMethod(blow.method, blow.effect, mon, playerAc, rng);

    if (hit) {
      // Roll damage
      const rawDamage = calculateBlowDamage(blow, rlev, mon, rng);

      // Apply effect
      const effectResult = resolveBlowEffect(blow.effect, rawDamage, playerAc);

      // Calculate critical severity
      const critical = monsterCritical(blow.dice, rlev, rawDamage, rng);

      const message = `${monName} ${methodDesc} you.`;

      results.push({
        hit: true,
        damage: effectResult.damage,
        effect: blow.effect,
        method: blow.method,
        message,
        effectResult,
        critical,
      });
    } else {
      // Miss
      const missMessage = methodMeta?.miss
        ? `${monName} misses you.`
        : "";

      results.push({
        hit: false,
        damage: 0,
        effect: blow.effect,
        method: blow.method,
        message: missMessage,
        effectResult: null,
        critical: 0,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Apply blow effect to player
// ---------------------------------------------------------------------------

/**
 * Apply a blow effect's status/theft to the player.
 *
 * This is the side-effectful companion to resolveBlowEffect().
 * Called after damage is already applied. Returns additional messages.
 *
 * @param effect  The blow effect that hit.
 * @param player  The player being affected.
 * @param damage  The damage dealt by this blow.
 * @param rng     Random number generator.
 * @returns       Messages describing the effect.
 */
export function applyBlowEffect(
  effect: BlowEffect,
  player: Player,
  damage: number,
  rng: RNG,
): string[] {
  const messages: string[] = [];

  switch (effect) {
    case BlowEffect.POISON:
      if ((player.timed[TimedEffect.POISONED] ?? 0) === 0) {
        player.timed[TimedEffect.POISONED] = damage + rng.randint1(damage);
        messages.push("You are poisoned!");
      }
      break;

    case BlowEffect.BLIND:
      if ((player.timed[TimedEffect.BLIND] ?? 0) === 0) {
        player.timed[TimedEffect.BLIND] = 10 + rng.randint1(10);
        messages.push("You are blinded!");
      }
      break;

    case BlowEffect.CONFUSE:
      if ((player.timed[TimedEffect.CONFUSED] ?? 0) === 0) {
        player.timed[TimedEffect.CONFUSED] = 3 + rng.randint1(damage);
        messages.push("You are confused!");
      }
      break;

    case BlowEffect.TERRIFY:
      if ((player.timed[TimedEffect.AFRAID] ?? 0) === 0) {
        player.timed[TimedEffect.AFRAID] = 3 + rng.randint1(damage);
        messages.push("You are terrified!");
      }
      break;

    case BlowEffect.PARALYZE:
      if ((player.timed[TimedEffect.PARALYZED] ?? 0) === 0) {
        player.timed[TimedEffect.PARALYZED] = 3 + rng.randint1(damage);
        messages.push("You are paralyzed!");
      }
      break;

    case BlowEffect.HALLU:
      if ((player.timed[TimedEffect.IMAGE] ?? 0) === 0) {
        player.timed[TimedEffect.IMAGE] = 3 + rng.randint1(damage);
        messages.push("You feel drugged!");
      }
      break;

    case BlowEffect.LOSE_STR:
      if ((player.statCur[Stat.STR] ?? 0) > 3) {
        player.statCur[Stat.STR] = (player.statCur[Stat.STR] ?? 0) - 1;
        messages.push("You feel weak!");
      }
      break;

    case BlowEffect.LOSE_INT:
      if ((player.statCur[Stat.INT] ?? 0) > 3) {
        player.statCur[Stat.INT] = (player.statCur[Stat.INT] ?? 0) - 1;
        messages.push("You feel stupid!");
      }
      break;

    case BlowEffect.LOSE_WIS:
      if ((player.statCur[Stat.WIS] ?? 0) > 3) {
        player.statCur[Stat.WIS] = (player.statCur[Stat.WIS] ?? 0) - 1;
        messages.push("You feel naive!");
      }
      break;

    case BlowEffect.LOSE_DEX:
      if ((player.statCur[Stat.DEX] ?? 0) > 3) {
        player.statCur[Stat.DEX] = (player.statCur[Stat.DEX] ?? 0) - 1;
        messages.push("You feel clumsy!");
      }
      break;

    case BlowEffect.LOSE_CON:
      if ((player.statCur[Stat.CON] ?? 0) > 3) {
        player.statCur[Stat.CON] = (player.statCur[Stat.CON] ?? 0) - 1;
        messages.push("You feel sickly!");
      }
      break;

    case BlowEffect.LOSE_ALL: {
      let drained = false;
      for (let s = 0; s < 5; s++) {
        if ((player.statCur[s] ?? 0) > 3) {
          player.statCur[s] = (player.statCur[s] ?? 0) - 1;
          drained = true;
        }
      }
      if (drained) messages.push("You feel life draining away!");
      break;
    }

    case BlowEffect.DRAIN_CHARGES:
      // Simplified: just drain 1d3 mana from the player
      {
        const drain = rng.randint1(3);
        if (player.csp > 0) {
          player.csp = Math.max(0, player.csp - drain);
          messages.push("Energy drains from your pack!");
        }
      }
      break;

    case BlowEffect.EAT_GOLD:
      // Simplified: steal 10-30% of gold
      {
        const stolen = Math.floor(player.au * (10 + rng.randint0(20)) / 100);
        if (stolen > 0 && player.au > 0) {
          player.au = Math.max(0, player.au - stolen);
          messages.push(`${stolen} coins were stolen!`);
        }
      }
      break;

    case BlowEffect.EAT_ITEM:
      // Simplified: just report the theft attempt
      messages.push("The monster tries to steal something!");
      break;

    case BlowEffect.EAT_FOOD:
      // Reduce food timer
      {
        const current = player.timed[TimedEffect.FOOD] ?? 0;
        if (current > 0) {
          const drain = Math.min(current, 500 + rng.randint0(500));
          player.timed[TimedEffect.FOOD] = current - drain;
          messages.push("You feel hungry!");
        }
      }
      break;

    case BlowEffect.EAT_LIGHT:
      // Drain light from equipped torch/lamp (simplified: reduce food)
      messages.push("Your light dims!");
      break;

    case BlowEffect.SHATTER:
      // Shatter is like HURT but damages nearby terrain (simplified: just extra damage message)
      if (damage > 0) {
        messages.push("The dungeon quakes!");
      }
      break;

    case BlowEffect.EXP_10:
      drainExp(player, 10, rng, messages);
      break;

    case BlowEffect.EXP_20:
      drainExp(player, 20, rng, messages);
      break;

    case BlowEffect.EXP_40:
      drainExp(player, 40, rng, messages);
      break;

    case BlowEffect.EXP_80:
      drainExp(player, 80, rng, messages);
      break;

    case BlowEffect.BLACK_BREATH:
      messages.push("You feel the Black Breath upon you!");
      break;

    // ACID, ELEC, FIRE, COLD are handled as raw damage; no extra status here
    // DISENCHANT is complex (item enchant removal) — deferred
    default:
      break;
  }

  return messages;
}

/**
 * Drain experience from the player.
 *
 * @param player  The player.
 * @param divisor How much to drain (exp / divisor).
 * @param rng     Random number generator.
 * @param msgs    Message array to push into.
 */
function drainExp(player: Player, divisor: number, rng: RNG, msgs: string[]): void {
  const drain = Math.max(1, Math.floor(player.exp / divisor) + rng.randint0(divisor));
  if (player.exp > 0) {
    player.exp = Math.max(0, player.exp - drain);
    msgs.push("You feel your life draining away!");
  }
}
