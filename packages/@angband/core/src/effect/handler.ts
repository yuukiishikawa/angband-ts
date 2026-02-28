/**
 * @file effect/handler.ts
 * @brief Main effect dispatch system
 *
 * Port of effects.c — the central effect type enum, context/result interfaces,
 * and the dispatch functions that route effects to their handlers.
 *
 * Copyright (c) 2007 Andi Sidwell
 * Copyright (c) 2016 Ben Semmler, Nick McConnell
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Player, Chunk } from "../types/index.js";
import type { Effect } from "../types/object.js";
import type { RNG } from "../z/index.js";
import { Dice } from "../z/index.js";

// ── Effect Type Enum ──

/**
 * All known effect types. Mirrors the C EF_xxx enum built from list-effects.h.
 *
 * Not every effect in the C source is implemented yet; the enum is provided
 * in full so that data files can reference any effect and dispatch can
 * report "not implemented" gracefully.
 */
export const enum EffectType {
  NONE = 0,
  RANDOM,
  DAMAGE,
  HEAL_HP,
  MON_HEAL_HP,
  MON_HEAL_KIN,
  NOURISH,
  CRUNCH,
  CURE,
  TIMED_SET,
  TIMED_INC,
  TIMED_INC_NO_RES,
  MON_TIMED_INC,
  TIMED_DEC,
  GLYPH,
  WEB,
  RESTORE_STAT,
  DRAIN_STAT,
  LOSE_RANDOM_STAT,
  GAIN_STAT,
  RESTORE_EXP,
  GAIN_EXP,
  DRAIN_LIGHT,
  DRAIN_MANA,
  RESTORE_MANA,
  REMOVE_CURSE,
  RECALL,
  DEEP_DESCENT,
  ALTER_REALITY,
  MAP_AREA,
  READ_MINDS,
  DETECT_TRAPS,
  DETECT_DOORS,
  DETECT_STAIRS,
  DETECT_ORE,
  SENSE_GOLD,
  DETECT_GOLD,
  SENSE_OBJECTS,
  DETECT_OBJECTS,
  DETECT_LIVING_MONSTERS,
  DETECT_VISIBLE_MONSTERS,
  DETECT_INVISIBLE_MONSTERS,
  DETECT_FEARFUL_MONSTERS,
  IDENTIFY,
  DETECT_EVIL,
  DETECT_SOUL,
  CREATE_STAIRS,
  DISENCHANT,
  ENCHANT,
  RECHARGE,
  PROJECT_LOS,
  PROJECT_LOS_AWARE,
  ACQUIRE,
  WAKE,
  SUMMON,
  BANISH,
  MASS_BANISH,
  PROBE,
  TELEPORT,
  TELEPORT_TO,
  TELEPORT_LEVEL,
  RUBBLE,
  GRANITE,
  DESTRUCTION,
  EARTHQUAKE,
  LIGHT_LEVEL,
  DARKEN_LEVEL,
  LIGHT_AREA,
  DARKEN_AREA,
  SPOT,
  SPHERE,
  BALL,
  BREATH,
  ARC,
  SHORT_BEAM,
  LASH,
  SWARM,
  STRIKE,
  STAR,
  STAR_BALL,
  BOLT,
  BEAM,
  BOLT_OR_BEAM,
  LINE,
  ALTER,
  BOLT_STATUS,
  BOLT_STATUS_DAM,
  BOLT_AWARE,
  TOUCH,
  TOUCH_AWARE,
  CURSE_ARMOR,
  CURSE_WEAPON,
  BRAND_WEAPON,
  BRAND_AMMO,
  BRAND_BOLTS,
  CREATE_ARROWS,
  TAP_DEVICE,
  TAP_UNLIFE,
  SHAPECHANGE,
  CURSE,
  COMMAND,
  JUMP_AND_BITE,
  MOVE_ATTACK,
  SINGLE_COMBAT,
  MELEE_BLOWS,
  SWEEP,
  BIZARRE,
  WONDER,
  SELECT,
  SET_VALUE,
  CLEAR_VALUE,
  SCRAMBLE_STATS,
  UNSCRAMBLE_STATS,
  ENCHANT_WEAPON,
  ENCHANT_ARMOR,
  TURN_UNDEAD,
  HASTE,
  SLOW,
  CONFUSE,
  SLEEP,

  MAX,
}

// ── Effect Source ──

/**
 * The origin of an effect — who or what caused it.
 */
export type EffectSource = "player" | "monster" | "trap";

// ── Effect Context ──

/**
 * Context passed to every effect handler. Contains all the state an
 * effect needs to determine its outcome without knowing about the UI.
 */
export interface EffectContext {
  /** Who produced this effect. */
  readonly source: EffectSource;
  /** The player (always available — even monster effects can affect the player). */
  readonly player: Player;
  /** The current dungeon level. */
  readonly chunk: Chunk;
  /** Random number generator. */
  readonly rng: RNG;

  // ── Optional targeting / parameter fields ──

  /** Target grid { x, y }, if applicable. */
  readonly target?: { x: number; y: number };
  /** Direction index (1–9, 5 = none/target). */
  readonly dir?: number;
  /** Effect subtype (projection type, timed effect index, stat index, etc.). */
  readonly subtype?: number;
  /** Radius for area effects. */
  readonly radius?: number;
  /** Extra parameter passed by the effect chain. */
  readonly other?: number;
  /** Boost percentage for device effects (0–138). */
  readonly boost?: number;
}

// ── Effect Result ──

/**
 * Outcome of executing a single effect. Purely data — no side-effects
 * beyond what was applied to the player/chunk passed via context.
 */
export interface EffectResult {
  /** Whether the effect was successfully executed. */
  readonly success: boolean;
  /** Damage dealt, if applicable. */
  readonly damage?: number;
  /** Messages generated for the UI. */
  readonly messages: readonly string[];
  /** Whether the item/scroll/potion should be identified. */
  readonly ident: boolean;
}

// ── Handler function type ──

/**
 * Signature for an individual effect handler.
 */
export type EffectHandler = (
  ctx: EffectContext,
  dice?: Dice,
) => EffectResult;

// ── Handler registry ──

/**
 * Mutable map of EffectType -> handler. Populated by the attack and
 * general modules at import time.
 */
const handlers = new Map<EffectType, EffectHandler>();

/**
 * Register an effect handler. Called by sub-modules to populate the
 * dispatch table.
 */
export function registerHandler(type: EffectType, handler: EffectHandler): void {
  handlers.set(type, handler);
}

// ── Helpers ──

/**
 * Create a successful result with no damage.
 */
export function successResult(
  messages: string[] = [],
  ident = true,
): EffectResult {
  return { success: true, messages, ident };
}

/**
 * Create a failed result.
 */
export function failResult(
  messages: string[] = [],
  ident = false,
): EffectResult {
  return { success: false, messages, ident };
}

/**
 * Create a damage result.
 */
export function damageResult(
  damage: number,
  messages: string[] = [],
  ident = true,
): EffectResult {
  return { success: true, damage, messages, ident };
}

// ── Calculate value helper (mirrors C effect_calculate_value) ──

/**
 * Calculate an effect's value from its dice expression, optionally
 * applying a device boost.
 */
export function calculateValue(
  rng: RNG,
  dice: Dice | undefined,
  boost?: number,
  useBoost = true,
): number {
  if (!dice) return 0;

  let value = dice.roll(rng);

  if (useBoost && boost !== undefined && boost > 0) {
    value = Math.floor((value * (100 + boost)) / 100);
  }

  return value;
}

// ── Main dispatch ──

/**
 * Execute a single effect.
 *
 * Port of the inner loop of C `effect_do()`. Looks up the handler
 * for the given type and invokes it.
 *
 * @param type  The effect to execute.
 * @param ctx   The context (player, chunk, rng, targeting info).
 * @param dice  Optional dice expression for damage / duration.
 * @returns     The effect result.
 */
export function executeEffect(
  type: EffectType,
  ctx: EffectContext,
  dice?: Dice,
): EffectResult {
  if (type === EffectType.NONE || type >= EffectType.MAX) {
    return failResult(["Bad effect passed to executeEffect."]);
  }

  const handler = handlers.get(type);
  if (!handler) {
    return failResult([`Effect ${type} is not yet implemented.`]);
  }

  return handler(ctx, dice);
}

/**
 * Execute a chain of effects (as stored on an item or spell).
 *
 * Port of the outer loop of C `effect_do()`. Walks the linked list
 * of Effect nodes, executing each in turn.
 *
 * @param effects Array of effect definitions from the data layer.
 * @param ctx     The context shared by all effects in the chain.
 * @returns       An array of results, one per effect executed.
 */
export function executeEffectChain(
  effects: Effect[],
  ctx: EffectContext,
): EffectResult[] {
  const results: EffectResult[] = [];

  for (const eff of effects) {
    // Build a Dice from the effect's RandomValue, if present
    let dice: Dice | undefined;
    if (eff.dice) {
      dice = new Dice();
      dice.b = eff.dice.base;
      dice.x = eff.dice.dice;
      dice.y = eff.dice.sides;
      dice.m = eff.dice.m_bonus;
    }

    // Build a more specific context if the effect carries targeting info.
    // Construct the object literal directly to avoid readonly / exactOptionalPropertyTypes issues.
    const effSubtype = eff.subtype !== 0 ? eff.subtype : ctx.subtype;
    const effRadius = eff.radius !== 0 ? eff.radius : ctx.radius;
    const effOther = eff.other !== 0 ? eff.other : ctx.other;

    const effCtx = Object.assign({}, ctx) as {
      -readonly [K in keyof EffectContext]: EffectContext[K];
    };
    if (effSubtype !== undefined) effCtx.subtype = effSubtype;
    if (effRadius !== undefined) effCtx.radius = effRadius;
    if (effOther !== undefined) effCtx.other = effOther;

    const result = executeEffect(eff.index as EffectType, effCtx, dice);
    results.push(result);
  }

  return results;
}
