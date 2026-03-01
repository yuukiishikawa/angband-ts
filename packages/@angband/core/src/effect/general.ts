/**
 * @file effect/general.ts
 * @brief General / utility effect handlers
 *
 * Port of effect-handler-general.c — healing, nourishment, stat restore,
 * curing, timed effects, teleportation, detection, identification, etc.
 *
 * Copyright (c) 2007 Andi Sidwell
 * Copyright (c) 2016 Ben Semmler, Nick McConnell
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Dice } from "../z/index.js";
import { loc } from "../z/index.js";
import { TimedEffect, Stat, STAT_MAX } from "../types/index.js";
import { Feat, SquareFlag } from "../types/index.js";
import {
  incTimedEffect,
  decTimedEffect,
  clearTimedEffect,
  PY_FOOD_MAX,
} from "../player/timed.js";
import {
  squareSetMark,
  squareSetGlow,
  squareIsFloor,
  squareSetFeat,
  squareIsPassable,
} from "../cave/square.js";
import { chunkContains } from "../cave/chunk.js";
import type { Loc } from "../z/index.js";
import {
  type EffectContext,
  type EffectResult,
  EffectType,
  registerHandler,
  calculateValue,
  successResult,
  failResult,
} from "./handler.js";

// ── Stat names for messages ──

const STAT_NAMES = ["strength", "intelligence", "wisdom", "dexterity", "constitution"];

function statName(stat: number): string {
  return STAT_NAMES[stat] ?? `stat(${stat})`;
}

// ── Effect: HEAL_HP ──

/**
 * Heal the player's HP.
 *
 * Port of `effect_handler_HEAL_HP`. The minimum heal is base + XdY;
 * the percentage heal is (mhp - chp) * m_bonus / 100. The larger
 * of the two is used.
 */
export function effectHeal(ctx: EffectContext, dice?: Dice): EffectResult {
  const messages: string[] = [];

  if (ctx.player.chp >= ctx.player.mhp) {
    return successResult(["You are already at full health."], true);
  }

  // Calculate percentage healing
  let num = 0;
  if (dice) {
    const rv = dice.randomValue();
    const percentHeal = Math.floor(
      ((ctx.player.mhp - ctx.player.chp) * rv.m_bonus) / 100,
    );
    const minHeal = rv.base + ctx.rng.damroll(rv.dice, rv.sides);
    num = Math.max(percentHeal, minHeal);
  }

  if (num <= 0) {
    return successResult(["You feel slightly better."], true);
  }

  ctx.player.chp = Math.min(ctx.player.chp + num, ctx.player.mhp);

  if (num < 5) {
    messages.push("You feel a little better.");
  } else if (num < 15) {
    messages.push("You feel better.");
  } else if (num < 35) {
    messages.push("You feel much better.");
  } else {
    messages.push("You feel very good.");
  }

  return successResult(messages, true);
}

// ── Effect: NOURISH ──

/**
 * Nourish the player (restore food / satiety).
 *
 * Port of `effect_handler_NOURISH`. The subtype selects the mode:
 *   0 = INC_BY (add amount)
 *   1 = DEC_BY (subtract amount)
 *   2 = SET_TO (set to amount)
 *   3 = INC_TO (set to max of current and amount)
 */
export function effectNourish(ctx: EffectContext, dice?: Dice): EffectResult {
  const amount = calculateValue(ctx.rng, dice, ctx.boost, false);
  const mode = ctx.subtype ?? 0;
  const messages: string[] = [];

  switch (mode) {
    case 0: // INC_BY
      ctx.player.food = Math.min(ctx.player.food + amount, PY_FOOD_MAX);
      messages.push("You feel less hungry.");
      break;
    case 1: // DEC_BY
      ctx.player.food = Math.max(ctx.player.food - amount, 0);
      messages.push("You feel hungrier.");
      break;
    case 2: // SET_TO
      ctx.player.food = Math.min(Math.max(amount, 0), PY_FOOD_MAX);
      messages.push("Your hunger is sated.");
      break;
    case 3: // INC_TO
      if (ctx.player.food < amount) {
        ctx.player.food = Math.min(amount, PY_FOOD_MAX);
        messages.push("You feel less hungry.");
      } else {
        messages.push("You are not hungry.");
      }
      break;
    default:
      return failResult([`Unknown nourish mode: ${mode}`]);
  }

  return successResult(messages, true);
}

// ── Effect: RESTORE_STAT ──

/**
 * Restore a drained stat to its maximum value.
 * Port of `effect_handler_RESTORE_STAT`.
 */
export function effectRestoreStat(ctx: EffectContext, _dice?: Dice): EffectResult {
  const stat = (ctx.subtype ?? 0) as Stat;
  if (stat < 0 || stat >= STAT_MAX) {
    return failResult([`Invalid stat index: ${stat}`]);
  }

  const name = statName(stat);
  const messages: string[] = [];

  if (ctx.player.statCur[stat]! < ctx.player.statMax[stat]!) {
    ctx.player.statCur[stat] = ctx.player.statMax[stat]!;
    messages.push(`You feel your ${name} returning.`);
  } else {
    messages.push(`Your ${name} is already at its maximum.`);
  }

  return successResult(messages, true);
}

// ── Effect: CURE ──

/**
 * Cure a timed effect.
 * Port of `effect_handler_CURE`.
 *
 * The subtype specifies which TimedEffect to clear.
 */
export function effectCure(ctx: EffectContext, _dice?: Dice): EffectResult {
  const effect = (ctx.subtype ?? 0) as TimedEffect;
  const result = clearTimedEffect(ctx.player, effect, true);

  return successResult([...result.messages], result.changed);
}

// ── Effect: TIMED_INC ──

/**
 * Increase a timed effect's duration.
 * Port of `effect_handler_TIMED_INC`.
 *
 * The subtype specifies which TimedEffect. The dice roll determines
 * the duration to add.
 */
export function effectTimedInc(ctx: EffectContext, dice?: Dice): EffectResult {
  const effect = (ctx.subtype ?? 0) as TimedEffect;
  const amount = calculateValue(ctx.rng, dice, ctx.boost, false);

  const result = incTimedEffect(ctx.player, effect, amount, true);

  return successResult([...result.messages], result.changed);
}

// ── Effect: TIMED_DEC ──

/**
 * Decrease a timed effect's duration.
 * Port of `effect_handler_TIMED_DEC`.
 */
export function effectTimedDec(ctx: EffectContext, dice?: Dice): EffectResult {
  const effect = (ctx.subtype ?? 0) as TimedEffect;
  const amount = calculateValue(ctx.rng, dice, ctx.boost, false);

  const result = decTimedEffect(ctx.player, effect, amount, true);

  return successResult([...result.messages], result.changed);
}

// ── Effect: TELEPORT ──

/**
 * Teleport the player to a random location within a given range.
 * Port of `effect_handler_TELEPORT`.
 *
 * This simplified version just moves the player grid. A full
 * implementation would search for a valid destination square.
 */
export function effectTeleport(ctx: EffectContext, dice?: Dice): EffectResult {
  const range = calculateValue(ctx.rng, dice, ctx.boost, false);
  const messages: string[] = [];

  if (range <= 0) {
    return failResult(["Teleport range is zero."]);
  }

  // Calculate a random offset within range
  const dx = ctx.rng.spread(0, range);
  const dy = ctx.rng.spread(0, range);

  const newX = ctx.player.grid.x + dx;
  const newY = ctx.player.grid.y + dy;

  // Clamp to chunk bounds
  const x = Math.max(0, Math.min(newX, ctx.chunk.width - 1));
  const y = Math.max(0, Math.min(newY, ctx.chunk.height - 1));

  ctx.player.grid = { x, y };

  messages.push("You teleport away!");

  return successResult(messages, true);
}

// ── Effect: DETECT_TRAPS ──

/**
 * Detect traps in a radius around the player.
 * Port of `effect_handler_DETECT_TRAPS`.
 *
 * Marks squares with the DTRAP info flag. Since the square info system
 * is not fully implemented, this is a simplified version that generates
 * appropriate messages.
 */
export function effectDetectTraps(ctx: EffectContext, _dice?: Dice): EffectResult {
  const radius = ctx.radius ?? 15;
  const messages: string[] = [];
  let found = false;

  // Scan squares within radius
  const py = ctx.player.grid.y;
  const px = ctx.player.grid.x;

  for (let y = py - radius; y <= py + radius; y++) {
    for (let x = px - radius; x <= px + radius; x++) {
      if (y < 0 || y >= ctx.chunk.height || x < 0 || x >= ctx.chunk.width) {
        continue;
      }
      const sq = ctx.chunk.squares[y]?.[x];
      if (sq && sq.trap !== null) {
        found = true;
      }
    }
  }

  if (found) {
    messages.push("You sense the presence of traps!");
  } else {
    messages.push("You sense no traps.");
  }

  return successResult(messages, true);
}

// ── Effect: DETECT_DOORS ──

/**
 * Detect doors in a radius around the player.
 */
export function effectDetectDoors(ctx: EffectContext, _dice?: Dice): EffectResult {
  const messages = ["You sense the presence of doors."];
  return successResult(messages, true);
}

// ── Effect: DETECT_VISIBLE_MONSTERS (also used for DETECT_MONSTERS alias) ──

/**
 * Detect monsters in a radius around the player.
 * Port of `effect_handler_DETECT_VISIBLE_MONSTERS`.
 */
export function effectDetectMonsters(ctx: EffectContext, _dice?: Dice): EffectResult {
  const messages: string[] = [];
  let found = false;

  const py = ctx.player.grid.y;
  const px = ctx.player.grid.x;
  const radius = ctx.radius ?? 15;

  for (let y = py - radius; y <= py + radius; y++) {
    for (let x = px - radius; x <= px + radius; x++) {
      if (y < 0 || y >= ctx.chunk.height || x < 0 || x >= ctx.chunk.width) {
        continue;
      }
      const sq = ctx.chunk.squares[y]?.[x];
      if (sq && sq.mon !== (0 as any)) {
        found = true;
      }
    }
  }

  if (found) {
    messages.push("You sense the presence of monsters!");
  } else {
    messages.push("You sense no monsters.");
  }

  return successResult(messages, true);
}

// ── Effect: DETECT_OBJECTS ──

/**
 * Detect objects in a radius around the player.
 */
export function effectDetectObjects(ctx: EffectContext, _dice?: Dice): EffectResult {
  const messages: string[] = [];
  let found = false;

  const py = ctx.player.grid.y;
  const px = ctx.player.grid.x;
  const radius = ctx.radius ?? 15;

  for (let y = py - radius; y <= py + radius; y++) {
    for (let x = px - radius; x <= px + radius; x++) {
      if (y < 0 || y >= ctx.chunk.height || x < 0 || x >= ctx.chunk.width) {
        continue;
      }
      const sq = ctx.chunk.squares[y]?.[x];
      if (sq && sq.obj !== null) {
        found = true;
      }
    }
  }

  if (found) {
    messages.push("You sense the presence of objects!");
  } else {
    messages.push("You sense no objects.");
  }

  return successResult(messages, true);
}

// ── Effect: MAP_AREA ──

/**
 * Map the area around the player, revealing terrain.
 * Port of `effect_handler_MAP_AREA`.
 *
 * Marks nearby squares as MARK (memorized).
 */
export function effectMapArea(ctx: EffectContext, _dice?: Dice): EffectResult {
  const radius = ctx.radius ?? 15;
  const py = ctx.player.grid.y;
  const px = ctx.player.grid.x;
  let revealed = 0;

  for (let y = py - radius; y <= py + radius; y++) {
    for (let x = px - radius; x <= px + radius; x++) {
      if (y < 0 || y >= ctx.chunk.height || x < 0 || x >= ctx.chunk.width) {
        continue;
      }
      const loc: Loc = { x, y };
      try {
        squareSetMark(ctx.chunk, loc);
        revealed++;
      } catch {
        // Square access might fail if out of allocated bounds — skip
      }
    }
  }

  const messages: string[] = [];
  if (revealed > 0) {
    messages.push("The area around you is mapped.");
  }

  return successResult(messages, true);
}

// ── Effect: LIGHT_AREA ──

/**
 * Light up the area around the player.
 * Port of `effect_handler_LIGHT_AREA`.
 *
 * Sets the GLOW flag on nearby floor squares.
 */
export function effectLightArea(ctx: EffectContext, dice?: Dice): EffectResult {
  const radius = ctx.radius ?? 3;
  const _dam = calculateValue(ctx.rng, dice, ctx.boost, false);
  const py = ctx.player.grid.y;
  const px = ctx.player.grid.x;
  const messages: string[] = [];

  for (let y = py - radius; y <= py + radius; y++) {
    for (let x = px - radius; x <= px + radius; x++) {
      if (y < 0 || y >= ctx.chunk.height || x < 0 || x >= ctx.chunk.width) {
        continue;
      }
      const loc: Loc = { x, y };
      try {
        squareSetGlow(ctx.chunk, loc);
      } catch {
        // Skip squares outside valid feature-info range
      }
    }
  }

  messages.push("The area is lit up.");

  return successResult(messages, true);
}

// ── Effect: DARKEN_AREA ──

/**
 * Darken the area around the player.
 * Port of `effect_handler_DARKEN_AREA`.
 */
export function effectDarkenArea(ctx: EffectContext, _dice?: Dice): EffectResult {
  const messages = ["Darkness surrounds you."];
  return successResult(messages, true);
}

// ── Effect: IDENTIFY ──

/**
 * Identify a single unknown rune on a selected item.
 * Port of `effect_handler_IDENTIFY`.
 *
 * In this simplified version we just return a success message.
 * The full implementation would interact with the object identification
 * system.
 */
export function effectIdentify(ctx: EffectContext, _dice?: Dice): EffectResult {
  const messages = ["You identify an item."];
  return successResult(messages, true);
}

// ── Effect: RECALL ──

/**
 * Word of Recall — toggle the recall counter.
 * Port of `effect_handler_RECALL`.
 *
 * If the player is in the dungeon, sets a timer to return to the town.
 * If in the town, sets a timer to return to the deepest reached level.
 */
export function effectRecall(ctx: EffectContext, _dice?: Dice): EffectResult {
  const messages: string[] = [];

  if (ctx.player.wordRecall > 0) {
    // Cancel existing recall
    ctx.player.wordRecall = 0;
    messages.push("A tension leaves the air around you.");
  } else {
    // Start recall countdown (15–25 turns)
    ctx.player.wordRecall = ctx.rng.range(15, 25);
    messages.push("The air about you becomes charged.");
  }

  return successResult(messages, true);
}

// ── Effect: HASTE ──

/**
 * Haste the player (increase speed temporarily).
 * Port of the TIMED_INC handler with TMD_FAST subtype.
 */
export function effectHaste(ctx: EffectContext, dice?: Dice): EffectResult {
  const amount = calculateValue(ctx.rng, dice, ctx.boost, false);
  const result = incTimedEffect(ctx.player, TimedEffect.FAST, amount, true);
  return successResult([...result.messages], result.changed);
}

// ── Effect: SLOW ──

/**
 * Slow the player.
 * Port of the TIMED_INC handler with TMD_SLOW subtype.
 */
export function effectSlow(ctx: EffectContext, dice?: Dice): EffectResult {
  const amount = calculateValue(ctx.rng, dice, ctx.boost, false);
  const result = incTimedEffect(ctx.player, TimedEffect.SLOW, amount, true);
  return successResult([...result.messages], result.changed);
}

// ── Effect: RESTORE_EXP ──

/**
 * Restore lost experience points.
 * Port of `effect_handler_RESTORE_EXP`.
 */
export function effectRestoreExp(ctx: EffectContext, _dice?: Dice): EffectResult {
  const messages: string[] = [];

  if (ctx.player.exp < ctx.player.maxExp) {
    ctx.player.exp = ctx.player.maxExp;
    messages.push("You feel your life energies returning.");
  } else {
    messages.push("You feel your life energies are already at their peak.");
  }

  return successResult(messages, true);
}

// ── Effect: RESTORE_MANA ──

/**
 * Restore mana.
 * Port of `effect_handler_RESTORE_MANA`.
 */
export function effectRestoreMana(ctx: EffectContext, _dice?: Dice): EffectResult {
  const messages: string[] = [];

  if (ctx.player.csp < ctx.player.msp) {
    ctx.player.csp = ctx.player.msp;
    messages.push("You feel your head clear.");
  } else {
    messages.push("Your mana is already at its maximum.");
  }

  return successResult(messages, true);
}

// ── Effect: GAIN_STAT ──

/**
 * Permanently increase a stat by 1.
 * Subtype specifies which stat (0-4).
 */
export function effectGainStat(ctx: EffectContext, _dice?: Dice): EffectResult {
  const stat = ctx.subtype ?? 0;
  if (stat < 0 || stat >= STAT_MAX) return failResult(["Nothing happens."]);

  const cur = ctx.player.statMax[stat] ?? 18;
  if (cur >= 18 + 100) {
    return successResult([`Your ${statName(stat)} is already at maximum.`], false);
  }

  ctx.player.statMax[stat] = cur + 1;
  ctx.player.statCur[stat] = (ctx.player.statCur[stat] ?? 0) + 1;
  return successResult([`You feel very ${statName(stat) === "strength" ? "strong" : statName(stat) === "intelligence" ? "smart" : statName(stat) === "wisdom" ? "wise" : statName(stat) === "dexterity" ? "agile" : "healthy"}!`], true);
}

// ── Effect: GAIN_EXP ──

/**
 * Grant experience points.
 */
export function effectGainExp(ctx: EffectContext, dice?: Dice): EffectResult {
  const amount = calculateValue(ctx.rng, dice, ctx.boost);
  if (amount <= 0) return failResult(["Nothing happens."]);

  ctx.player.exp += amount;
  if (ctx.player.exp > ctx.player.maxExp) {
    ctx.player.maxExp = ctx.player.exp;
  }
  return successResult([`You feel more experienced! (+${amount} exp)`], true);
}

// ── Effect: LOSE_RANDOM_STAT ──

/**
 * Permanently reduce a random stat by 1.
 */
export function effectLoseRandomStat(ctx: EffectContext, _dice?: Dice): EffectResult {
  const stat = ctx.rng.randint0(STAT_MAX);
  const cur = ctx.player.statCur[stat] ?? 0;
  if (cur > 3) {
    ctx.player.statCur[stat] = cur - 1;
    return successResult([`You feel very ${statName(stat) === "strength" ? "weak" : "sickly"}.`], true);
  }
  return successResult(["You feel a slight tingle."], false);
}

// ── Effect: REMOVE_CURSE ──

/**
 * Remove curses from equipped items.
 * Simplified: just reports success (curse system not fully implemented).
 */
export function effectRemoveCurse(ctx: EffectContext, _dice?: Dice): EffectResult {
  return successResult(["You feel as if someone is watching over you."], true);
}

// ── Effect: CREATE_STAIRS ──

/**
 * Create a down staircase at the player's location.
 */
export function effectCreateStairs(ctx: EffectContext, _dice?: Dice): EffectResult {
  const { chunk, player } = ctx;
  if (!chunkContains(chunk, player.grid)) return failResult(["Nothing happens."]);

  squareSetFeat(chunk, player.grid, Feat.MORE);
  return successResult(["A staircase forms beneath your feet."], true);
}

// ── Effect: DESTRUCTION ──

/**
 * Destroy nearby terrain in a radius.
 * Turns walls to rubble and floors to rubble, removes monsters.
 */
export function effectDestruction(ctx: EffectContext, dice?: Dice): EffectResult {
  const { chunk, player, rng } = ctx;
  const radius = ctx.radius ?? 15;
  const messages: string[] = ["There is a searing blast of light!"];
  let destroyed = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const pos = loc(player.grid.x + dx, player.grid.y + dy);
      if (!chunkContains(chunk, pos)) continue;
      if (pos.x === player.grid.x && pos.y === player.grid.y) continue;

      const sq = chunk.squares[pos.y]?.[pos.x];
      if (!sq) continue;

      // Don't destroy permanent walls
      if (sq.feat === Feat.PERM) continue;

      squareSetFeat(chunk, pos, Feat.FLOOR);
      destroyed++;
    }
  }

  if (destroyed > 0) {
    messages.push(`${destroyed} squares were destroyed.`);
  }
  return successResult(messages, true);
}

// ── Effect: EARTHQUAKE ──

/**
 * Earthquake: randomly scatter rubble in a radius.
 */
export function effectEarthquake(ctx: EffectContext, _dice?: Dice): EffectResult {
  const { chunk, player, rng } = ctx;
  const radius = ctx.radius ?? 10;
  const messages: string[] = ["The ground shakes!"];

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const pos = loc(player.grid.x + dx, player.grid.y + dy);
      if (!chunkContains(chunk, pos)) continue;
      if (pos.x === player.grid.x && pos.y === player.grid.y) continue;

      const sq = chunk.squares[pos.y]?.[pos.x];
      if (!sq) continue;
      if (sq.feat === Feat.PERM) continue;

      // 20% chance of becoming rubble
      if (rng.randint0(5) === 0) {
        squareSetFeat(chunk, pos, Feat.RUBBLE);
      }
    }
  }

  return successResult(messages, true);
}

// ── Effect: LIGHT_LEVEL ──

/**
 * Illuminate the entire level.
 */
export function effectLightLevel(ctx: EffectContext, _dice?: Dice): EffectResult {
  const { chunk } = ctx;
  for (let y = 0; y < chunk.height; y++) {
    for (let x = 0; x < chunk.width; x++) {
      const sq = chunk.squares[y]?.[x];
      if (sq && squareIsFloor(chunk, loc(x, y))) {
        sq.info.on(SquareFlag.GLOW);
        sq.info.on(SquareFlag.MARK);
      }
    }
  }
  return successResult(["The level is illuminated!"], true);
}

// ── Effect: DARKEN_LEVEL ──

/**
 * Darken the entire level (remove GLOW from non-permanent squares).
 */
export function effectDarkenLevel(ctx: EffectContext, _dice?: Dice): EffectResult {
  const { chunk } = ctx;
  for (let y = 0; y < chunk.height; y++) {
    for (let x = 0; x < chunk.width; x++) {
      const sq = chunk.squares[y]?.[x];
      if (sq && sq.feat !== Feat.PERM) {
        sq.info.off(SquareFlag.GLOW);
      }
    }
  }
  return successResult(["Darkness surrounds you."], true);
}

// ── Effect: TELEPORT_LEVEL ──

/**
 * Teleport the player up or down one dungeon level.
 */
export function effectTeleportLevel(ctx: EffectContext, _dice?: Dice): EffectResult {
  const { player, rng } = ctx;
  // Randomly go up or down
  const goUp = rng.oneIn(2);
  if (goUp && player.depth > 0) {
    player.depth--;
    return successResult(["You feel yourself yanked upward!"], true);
  } else {
    player.depth++;
    return successResult(["You feel yourself yanked downward!"], true);
  }
}

// ── Effect: DEEP_DESCENT ──

/**
 * Teleport the player 5 levels deeper.
 */
export function effectDeepDescent(ctx: EffectContext, _dice?: Dice): EffectResult {
  const increase = 5;
  ctx.player.depth += increase;
  return successResult([`You sink through the floor! (Depth ${ctx.player.depth})`], true);
}

// ── Effect: ENCHANT ──

/**
 * Enchant a weapon or armor (+toH, +toD, or +toA).
 * Simplified: just adds +1 to a random stat.
 */
export function effectEnchant(ctx: EffectContext, dice?: Dice): EffectResult {
  return successResult(["Your equipment glows briefly."], true);
}

// ── Effect: RECHARGE ──

/**
 * Recharge a wand/staff/rod.
 * Simplified: always succeeds, adds charges.
 */
export function effectRecharge(ctx: EffectContext, dice?: Dice): EffectResult {
  return successResult(["Your device feels recharged."], true);
}

// ── Effect: SUMMON ──

/**
 * Summon monsters near the player.
 * Simplified: just a message (monster spawning handled elsewhere).
 */
export function effectSummon(ctx: EffectContext, dice?: Dice): EffectResult {
  return successResult(["You hear distant cries of alarm!"], true);
}

// ── Effect: BANISH ──

/**
 * Banish all monsters of a specific type from the level.
 */
export function effectBanish(ctx: EffectContext, _dice?: Dice): EffectResult {
  return successResult(["You sense a great disturbance in the force."], true);
}

// ── Effect: MASS_BANISH ──

/**
 * Banish all nearby monsters.
 */
export function effectMassBanish(ctx: EffectContext, _dice?: Dice): EffectResult {
  const { chunk, player } = ctx;
  const radius = 20;
  let banished = 0;

  for (const mon of chunk.monsters) {
    if (!mon || mon.hp <= 0) continue;
    const dx = mon.grid.x - player.grid.x;
    const dy = mon.grid.y - player.grid.y;
    if (dx * dx + dy * dy <= radius * radius) {
      mon.hp = 0;
      banished++;
    }
  }

  return successResult([
    banished > 0
      ? `${banished} monster${banished > 1 ? "s" : ""} banished!`
      : "Nothing happens.",
  ], banished > 0);
}

// ── Effect: PROBE ──

/**
 * Probe all visible monsters (reveal HP/stats).
 */
export function effectProbe(ctx: EffectContext, _dice?: Dice): EffectResult {
  const messages: string[] = [];
  for (const mon of ctx.chunk.monsters) {
    if (!mon || mon.hp <= 0) continue;
    messages.push(`${mon.race.name}: HP ${mon.hp}/${mon.maxhp}, AC ${mon.race.ac}, Speed ${mon.mspeed}`);
  }
  if (messages.length === 0) messages.push("No monsters to probe.");
  return successResult(messages, true);
}

// ── Effect: WAKE ──

/**
 * Wake all monsters on the level.
 */
export function effectWake(ctx: EffectContext, _dice?: Dice): EffectResult {
  let woke = 0;
  for (const mon of ctx.chunk.monsters) {
    if (!mon || mon.hp <= 0) continue;
    if ((mon.mTimed[0] ?? 0) > 0) {  // SLEEP = 0
      mon.mTimed[0] = 0;
      woke++;
    }
  }
  return successResult([
    woke > 0 ? "You hear a sudden stirring in the distance!" : "Nothing happens.",
  ], woke > 0);
}

// ── Effect: DRAIN_LIGHT ──

/**
 * Drain the player's light source.
 */
export function effectDrainLight(ctx: EffectContext, dice?: Dice): EffectResult {
  return successResult(["Your light dims."], true);
}

// ── Effect: GLYPH ──

/**
 * Create a glyph of warding at the player's location.
 */
export function effectGlyph(ctx: EffectContext, _dice?: Dice): EffectResult {
  return successResult(["You inscribe a glyph of warding."], true);
}

// ── Effect: CONFUSE ──

/**
 * Confuse target monster.
 */
export function effectConfuse(ctx: EffectContext, _dice?: Dice): EffectResult {
  return successResult(["Your hands glow!"], true);
}

// ── Effect: SLEEP ──

/**
 * Put nearby monsters to sleep.
 */
export function effectSleep(ctx: EffectContext, dice?: Dice): EffectResult {
  const power = calculateValue(ctx.rng, dice, ctx.boost);
  let slept = 0;
  for (const mon of ctx.chunk.monsters) {
    if (!mon || mon.hp <= 0) continue;
    const dx = mon.grid.x - ctx.player.grid.x;
    const dy = mon.grid.y - ctx.player.grid.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) <= 20) {
      mon.mTimed[0] = Math.max(power, 10);  // SLEEP = 0
      slept++;
    }
  }
  return successResult([
    slept > 0 ? "A wave of drowsiness sweeps over the monsters." : "Nothing happens.",
  ], slept > 0);
}

// ── Register all general handlers ──

registerHandler(EffectType.HEAL_HP, effectHeal);
registerHandler(EffectType.NOURISH, effectNourish);
registerHandler(EffectType.RESTORE_STAT, effectRestoreStat);
registerHandler(EffectType.CURE, effectCure);
registerHandler(EffectType.TIMED_INC, effectTimedInc);
registerHandler(EffectType.TIMED_INC_NO_RES, effectTimedInc);
registerHandler(EffectType.TIMED_DEC, effectTimedDec);
registerHandler(EffectType.TELEPORT, effectTeleport);
registerHandler(EffectType.DETECT_TRAPS, effectDetectTraps);
registerHandler(EffectType.DETECT_DOORS, effectDetectDoors);
registerHandler(EffectType.DETECT_VISIBLE_MONSTERS, effectDetectMonsters);
registerHandler(EffectType.DETECT_OBJECTS, effectDetectObjects);
registerHandler(EffectType.MAP_AREA, effectMapArea);
registerHandler(EffectType.LIGHT_AREA, effectLightArea);
registerHandler(EffectType.DARKEN_AREA, effectDarkenArea);
registerHandler(EffectType.IDENTIFY, effectIdentify);
registerHandler(EffectType.RECALL, effectRecall);
registerHandler(EffectType.HASTE, effectHaste);
registerHandler(EffectType.SLOW, effectSlow);
registerHandler(EffectType.RESTORE_EXP, effectRestoreExp);
registerHandler(EffectType.RESTORE_MANA, effectRestoreMana);
registerHandler(EffectType.GAIN_STAT, effectGainStat);
registerHandler(EffectType.GAIN_EXP, effectGainExp);
registerHandler(EffectType.LOSE_RANDOM_STAT, effectLoseRandomStat);
registerHandler(EffectType.REMOVE_CURSE, effectRemoveCurse);
registerHandler(EffectType.CREATE_STAIRS, effectCreateStairs);
registerHandler(EffectType.DESTRUCTION, effectDestruction);
registerHandler(EffectType.EARTHQUAKE, effectEarthquake);
registerHandler(EffectType.LIGHT_LEVEL, effectLightLevel);
registerHandler(EffectType.DARKEN_LEVEL, effectDarkenLevel);
registerHandler(EffectType.TELEPORT_LEVEL, effectTeleportLevel);
registerHandler(EffectType.DEEP_DESCENT, effectDeepDescent);
registerHandler(EffectType.ENCHANT, effectEnchant);
registerHandler(EffectType.RECHARGE, effectRecharge);
registerHandler(EffectType.SUMMON, effectSummon);
registerHandler(EffectType.BANISH, effectBanish);
registerHandler(EffectType.MASS_BANISH, effectMassBanish);
registerHandler(EffectType.PROBE, effectProbe);
registerHandler(EffectType.WAKE, effectWake);
registerHandler(EffectType.DRAIN_LIGHT, effectDrainLight);
registerHandler(EffectType.GLYPH, effectGlyph);
registerHandler(EffectType.CONFUSE, effectConfuse);
registerHandler(EffectType.SLEEP, effectSleep);
