/**
 * @file effect/attack.ts
 * @brief Attack-related effect handlers
 *
 * Port of effect-handler-attack.c — bolt, beam, ball, breath, and
 * direct damage effects.
 *
 * Every handler follows the functional pattern: take an EffectContext
 * and optional Dice, return an EffectResult. Side-effects are limited
 * to mutating player/chunk state through the context.
 *
 * Copyright (c) 2007 Andi Sidwell
 * Copyright (c) 2016 Ben Semmler, Nick McConnell
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Dice } from "../z/index.js";
import type { Stat } from "../types/index.js";
import { STAT_MAX } from "../types/index.js";
import {
  type EffectContext,
  type EffectResult,
  EffectType,
  registerHandler,
  calculateValue,
  damageResult,
  successResult,
  failResult,
} from "./handler.js";

// ── Element name helper ──

/** Placeholder element names for messages. */
const ELEMENT_NAMES: Record<number, string> = {
  0: "acid",
  1: "lightning",
  2: "fire",
  3: "cold",
  4: "poison",
  5: "light",
  6: "dark",
  7: "sound",
  8: "shards",
  9: "nexus",
  10: "nether",
  11: "chaos",
  12: "disenchantment",
  13: "water",
  14: "ice",
  15: "gravity",
  16: "inertia",
  17: "force",
  18: "time",
  19: "plasma",
  20: "meteor",
  21: "missile",
  22: "mana",
  23: "holy orb",
  24: "arrow",
};

function elementName(subtype: number | undefined): string {
  if (subtype === undefined) return "unknown";
  return ELEMENT_NAMES[subtype] ?? `element(${subtype})`;
}

/** Stat names for messages. */
const STAT_NAMES = ["strength", "intelligence", "wisdom", "dexterity", "constitution"];

function statName(stat: number): string {
  return STAT_NAMES[stat] ?? `stat(${stat})`;
}

// ── Effect: DAMAGE (direct damage to the player) ──

/**
 * Deal direct damage to the player. Port of `effect_handler_DAMAGE`.
 *
 * When the source is a monster or trap, damage is applied to
 * the player's current HP. The effect always identifies.
 */
export function effectDamage(ctx: EffectContext, dice?: Dice): EffectResult {
  const dam = calculateValue(ctx.rng, dice, ctx.boost, false);
  const messages: string[] = [];

  if (ctx.source === "player") {
    // Player-sourced DAMAGE effects don't make sense in vanilla;
    // treat as a no-op.
    return successResult(["You feel a strange energy."], true);
  }

  // Apply damage
  ctx.player.chp -= dam;

  if (dam > 0) {
    messages.push(`You take ${dam} damage.`);
  }

  if (ctx.player.chp < 0) {
    ctx.player.chp = 0;
    messages.push("You die.");
  }

  return damageResult(dam, messages, true);
}

// ── Effect: BOLT ──

/**
 * Cast a bolt spell — single-target, stops on first monster hit.
 * Port of `effect_handler_BOLT`.
 *
 * Calculates damage with device boost, generates a message, and
 * returns the result. Actual projection is delegated to the
 * project system (not yet implemented — this returns the calculated
 * values for the caller to apply).
 */
export function effectBolt(ctx: EffectContext, dice?: Dice): EffectResult {
  const dam = calculateValue(ctx.rng, dice, ctx.boost);
  const elem = elementName(ctx.subtype);
  const messages = [`You cast a bolt of ${elem} for ${dam} damage.`];

  return damageResult(dam, messages, true);
}

// ── Effect: BEAM ──

/**
 * Cast a beam spell — passes through all targets in a line.
 * Port of `effect_handler_BEAM`.
 */
export function effectBeam(ctx: EffectContext, dice?: Dice): EffectResult {
  const dam = calculateValue(ctx.rng, dice, ctx.boost);
  const elem = elementName(ctx.subtype);
  const messages = [`You cast a beam of ${elem} for ${dam} damage.`];

  return damageResult(dam, messages, true);
}

// ── Effect: BALL ──

/**
 * Fire a ball spell — area damage centred on the target.
 * Port of `effect_handler_BALL`.
 *
 * @param ctx    The effect context (subtype = element, radius from ctx.radius).
 * @param dice   Damage dice.
 */
export function effectBall(ctx: EffectContext, dice?: Dice): EffectResult {
  const dam = calculateValue(ctx.rng, dice, ctx.boost);
  const elem = elementName(ctx.subtype);
  const radius = ctx.radius ?? 2;
  const messages = [
    `You fire a ball of ${elem} (radius ${radius}) for ${dam} damage.`,
  ];

  return damageResult(dam, messages, true);
}

// ── Effect: BREATH ──

/**
 * Breath attack — cone-shaped area.
 * Port of `effect_handler_BREATH`.
 */
export function effectBreath(ctx: EffectContext, dice?: Dice): EffectResult {
  const dam = calculateValue(ctx.rng, dice, ctx.boost, false);
  const elem = elementName(ctx.subtype);
  const messages = [`You breathe ${elem} for ${dam} damage.`];

  return damageResult(dam, messages, true);
}

// ── Effect: DRAIN_LIFE (drain life from a target) ──

/**
 * Drain life from a target, healing the caster.
 *
 * Deals damage and recovers a portion as HP for the player.
 */
export function effectDrainLife(ctx: EffectContext, dice?: Dice): EffectResult {
  const dam = calculateValue(ctx.rng, dice, ctx.boost);
  const messages: string[] = [];

  messages.push(`You drain life for ${dam} damage.`);

  // Heal the player for a fraction of damage dealt
  const heal = Math.floor(dam / 4);
  if (heal > 0 && ctx.player.chp < ctx.player.mhp) {
    ctx.player.chp = Math.min(ctx.player.chp + heal, ctx.player.mhp);
    messages.push(`You feel better. (+${heal} HP)`);
  }

  return damageResult(dam, messages, true);
}

// ── Effect: DRAIN_STAT ──

/**
 * Drain a player stat by 1 point (temporary reduction).
 * Port of `effect_handler_DRAIN_STAT`.
 */
export function effectDrainStat(ctx: EffectContext, _dice?: Dice): EffectResult {
  const stat = (ctx.subtype ?? 0) as Stat;
  if (stat < 0 || stat >= STAT_MAX) {
    return failResult([`Invalid stat index: ${stat}`]);
  }

  const name = statName(stat);
  const messages: string[] = [];

  if (ctx.player.statCur[stat]! > 3) {
    ctx.player.statCur[stat] = ctx.player.statCur[stat]! - 1;
    messages.push(`You feel very ${name === "strength" ? "weak" : "clumsy"}.`);
    messages.push(`You feel your ${name} drain away!`);
  } else {
    messages.push(`Your ${name} is sustained.`);
  }

  return successResult(messages, true);
}

// ── Effect: DRAIN_MANA ──

/**
 * Drain mana from the player.
 * Port of `effect_handler_DRAIN_MANA`.
 */
export function effectDrainMana(ctx: EffectContext, dice?: Dice): EffectResult {
  const drain = calculateValue(ctx.rng, dice, ctx.boost, false);
  const messages: string[] = [];

  if (ctx.player.csp <= 0) {
    messages.push("You have no mana to drain.");
    return successResult(messages, true);
  }

  const actual = Math.min(drain, ctx.player.csp);
  ctx.player.csp -= actual;

  if (actual > 0) {
    messages.push(`${actual} mana was drained!`);
  }

  return successResult(messages, true);
}

// ── Effect: STAR (beams in all directions) ──

/**
 * Fire beams in all eight directions.
 * Port of `effect_handler_STAR`.
 */
export function effectStar(ctx: EffectContext, dice?: Dice): EffectResult {
  const dam = calculateValue(ctx.rng, dice, ctx.boost);
  const elem = elementName(ctx.subtype);
  const messages = [
    `You fire beams of ${elem} in all directions for ${dam} damage each.`,
  ];

  return damageResult(dam, messages, true);
}

// ── Register all attack handlers ──

registerHandler(EffectType.DAMAGE, effectDamage);
registerHandler(EffectType.BOLT, effectBolt);
registerHandler(EffectType.BOLT_STATUS, effectBolt);
registerHandler(EffectType.BOLT_STATUS_DAM, effectBolt);
registerHandler(EffectType.BOLT_AWARE, effectBolt);
registerHandler(EffectType.BEAM, effectBeam);
registerHandler(EffectType.BALL, effectBall);
registerHandler(EffectType.BREATH, effectBreath);
registerHandler(EffectType.DRAIN_STAT, effectDrainStat);
registerHandler(EffectType.DRAIN_MANA, effectDrainMana);
registerHandler(EffectType.STAR, effectStar);
