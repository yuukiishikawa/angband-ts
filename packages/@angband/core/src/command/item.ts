/**
 * @file command/item.ts
 * @brief Item usage commands
 *
 * Port of cmd-obj.c — object commands for using, eating, quaffing, reading,
 * aiming, zapping, equipping, dropping, picking up, resting, and inscribing items.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Player, ObjectType, Chunk } from "../types/index.js";
import { TVal, TimedEffect, EquipSlot } from "../types/index.js";
import type { RNG } from "../z/index.js";
import {
  getInventoryItem,
  removeFromInventory,
  addToInventory,
  inventoryIsFull,
  findEquipSlotForItem,
  equipItem,
  unequipItem,
  learnWieldRunes,
} from "../object/index.js";
import { incTimedEffect } from "../player/index.js";
import { PY_FOOD_MAX } from "../player/index.js";
import type { Effect } from "../types/index.js";
import { EffectType } from "../effect/handler.js";
import { Dice, Aspect, randcalc } from "../z/index.js";

import type { CommandResult } from "./magic.js";

// ── Constants ──

/** Standard energy cost for one player action (100 = one turn). */
const STANDARD_ENERGY = 100;

/**
 * Apply a single potion effect (inline handler for common effects).
 * This avoids needing the full EffectContext/Chunk that executeEffectChain requires.
 */
function applyPotionEffect(eff: Effect, player: Player, rng: RNG, messages: string[]): void {
  if (eff.index === EffectType.HEAL_HP) {
    if (player.chp >= player.mhp) return;
    let num = 0;
    if (eff.dice) {
      const base = eff.dice.base;
      const d = eff.dice.dice;
      const s = eff.dice.sides;
      const mBonus = eff.dice.m_bonus;
      const percentHeal = Math.floor(((player.mhp - player.chp) * mBonus) / 100);
      const minHeal = base + rng.damroll(d, s);
      num = Math.max(percentHeal, minHeal);
    }
    if (num > 0) {
      player.chp = Math.min(player.chp + num, player.mhp);
      console.error(`[HEAL] +${num} hp, now ${player.chp}/${player.mhp}\n`);
      if (num < 5) messages.push("You feel a little better.");
      else if (num < 15) messages.push("You feel better.");
      else if (num < 35) messages.push("You feel much better.");
      else messages.push("You feel very good.");
    }
  } else if (eff.index === EffectType.CURE) {
    // CURE:BLIND, CURE:CONFUSED, etc. — clear a timed effect
    const timedIdx = eff.subtype;
    if (timedIdx >= 0 && player.timed[timedIdx] !== undefined) {
      player.timed[timedIdx] = 0;
    }
  } else if (eff.index === EffectType.TIMED_DEC) {
    // Decrement a timed effect
    const timedIdx = eff.subtype;
    if (timedIdx >= 0 && player.timed[timedIdx] !== undefined) {
      const dec = eff.dice ? eff.dice.base : 10;
      player.timed[timedIdx] = Math.max(0, (player.timed[timedIdx] ?? 0) - dec);
    }
  } else if (eff.index === EffectType.NOURISH) {
    // Add food
    const amount = eff.dice ? eff.dice.base : 0;
    if (amount > 0) {
      const food = (player.timed[TimedEffect.FOOD] ?? 0) + amount;
      player.timed[TimedEffect.FOOD] = Math.min(food, PY_FOOD_MAX);
    }
  } else if (eff.index === EffectType.TIMED_INC) {
    // Increase a timed effect (like speed, heroism, berserk)
    const timedIdx = eff.subtype;
    const amount = eff.dice ? eff.dice.base + rng.damroll(eff.dice.dice, eff.dice.sides) : 0;
    if (timedIdx >= 0 && amount > 0) {
      incTimedEffect(player, timedIdx, amount, true);
    }
  }
  // Other effects silently ignored for now
}

/** Half energy cost (for quick actions like equip/drop). */
const HALF_ENERGY = 50;

// ── Helpers ──

/**
 * Check if the player is able to act (not paralyzed).
 * Returns an error CommandResult if unable, or null if OK.
 */
function checkCanAct(player: Player): CommandResult | null {
  if (player.timed[TimedEffect.PARALYZED]! > 0) {
    return {
      success: false,
      energyCost: 0,
      messages: ["You are paralyzed!"],
    };
  }
  return null;
}

/**
 * Check if the player can read (not blind or confused).
 * Returns an error CommandResult if unable, or null if OK.
 */
function checkCanRead(player: Player): CommandResult | null {
  const cantAct = checkCanAct(player);
  if (cantAct) return cantAct;

  if (player.timed[TimedEffect.BLIND]! > 0) {
    return {
      success: false,
      energyCost: 0,
      messages: ["You cannot see!"],
    };
  }

  if (player.timed[TimedEffect.CONFUSED]! > 0) {
    return {
      success: false,
      energyCost: 0,
      messages: ["You are too confused to read!"],
    };
  }

  return null;
}

/**
 * Check if a device (staff/wand/rod) can be used based on the player's
 * device skill. Returns 1 on success, 0 on fail-but-retryable, -1 on
 * permanent failure.
 *
 * Port of C `check_devices()`.
 */
function checkDevice(
  player: Player,
  obj: ObjectType,
  rng: RNG,
): { result: number; messages: string[] } {
  const messages: string[] = [];

  // Determine action description
  let action: string;
  let what: string | null = null;

  if (obj.tval === TVal.ROD) {
    action = "zap the rod";
  } else if (obj.tval === TVal.WAND) {
    action = "use the wand";
    what = "wand";
  } else if (obj.tval === TVal.STAFF) {
    action = "use the staff";
    what = "staff";
  } else {
    action = "activate it";
  }

  // Check for empty charges (staves/wands)
  if (what !== null && obj.pval <= 0) {
    messages.push(`The ${what} has no charges left.`);
    return { result: -1, messages };
  }

  // Calculate failure chance based on device skill vs item level
  const itemLevel = obj.kind?.level ?? 0;
  const deviceSkill = player.state.skills[2] ?? 0; // Skill.DEVICE = 2
  const fail = Math.max(0, Math.min(1000, 1000 - (deviceSkill - itemLevel) * 10));

  // Roll for usage
  if (rng.randint1(1000) < fail) {
    messages.push(`You failed to ${action} properly.`);
    return { result: fail < 1001 ? 0 : -1, messages };
  }

  return { result: 1, messages };
}

/**
 * Consume a single-use item from the player's inventory.
 * Decrements count or removes the item entirely.
 */
function consumeItem(
  player: Player,
  itemIndex: number,
  obj: ObjectType,
): string[] {
  const messages: string[] = [];

  if (obj.number > 1) {
    obj.number -= 1;
    messages.push(`You have ${obj.number} remaining.`);
  } else {
    removeFromInventory(player, itemIndex);
    messages.push("You used your last one.");
  }

  return messages;
}

// ── Item commands ──

/**
 * Use an item (general-purpose use command).
 *
 * Port of C `do_cmd_use()`. Dispatches to the appropriate sub-command
 * based on the item's tval.
 *
 * @param player    - The player using the item.
 * @param itemIndex - Index into the player's inventory.
 * @param target    - Target direction (for wands/rods that need aim).
 * @param rng       - Random number generator.
 */
export function cmdUseItem(
  player: Player,
  itemIndex: number,
  target: number | null,
  rng: RNG,
): CommandResult {
  const cantAct = checkCanAct(player);
  if (cantAct) return cantAct;

  const obj = getInventoryItem(player, itemIndex);
  if (!obj) {
    return {
      success: false,
      energyCost: 0,
      messages: ["You have nothing to use."],
    };
  }

  // Dispatch based on item type
  switch (obj.tval) {
    case TVal.POTION:
      return cmdQuaff(player, itemIndex, rng);
    case TVal.FOOD:
    case TVal.MUSHROOM:
      return cmdEat(player, itemIndex, rng);
    case TVal.SCROLL:
      return cmdRead(player, itemIndex, rng);
    case TVal.WAND:
      return cmdAim(player, itemIndex, target, rng);
    case TVal.ROD:
      return cmdZap(player, itemIndex, rng);
    case TVal.STAFF:
      return cmdUseStaff(player, itemIndex, rng);
    default:
      // Check for activatable equipment
      if (obj.activation) {
        return cmdActivate(player, itemIndex, rng);
      }
      return {
        success: false,
        energyCost: 0,
        messages: ["The item cannot be used at the moment."],
      };
  }
}

/**
 * Eat food or a mushroom.
 *
 * Port of C `do_cmd_eat_food()`.
 *
 * @param player    - The player eating.
 * @param itemIndex - Index into the player's inventory.
 * @param _rng      - Random number generator (for future effect application).
 */
export function cmdEat(
  player: Player,
  itemIndex: number,
  _rng: RNG,
): CommandResult {
  const cantAct = checkCanAct(player);
  if (cantAct) return cantAct;

  const obj = getInventoryItem(player, itemIndex);
  if (!obj) {
    return {
      success: false,
      energyCost: 0,
      messages: ["You have no food to eat."],
    };
  }

  if (obj.tval !== TVal.FOOD && obj.tval !== TVal.MUSHROOM) {
    return {
      success: false,
      energyCost: 0,
      messages: ["You cannot eat that!"],
    };
  }

  const messages: string[] = [];
  messages.push("You eat the food.");

  // Nourish the player: use pval as food value, or a default
  const foodValue = obj.pval > 0 ? obj.pval : 5000;
  const timedResult = incTimedEffect(player, TimedEffect.FOOD, foodValue, true);
  messages.push(...timedResult.messages);

  // Consume the item
  messages.push(...consumeItem(player, itemIndex, obj));

  return { success: true, energyCost: STANDARD_ENERGY, messages };
}

/**
 * Quaff a potion.
 *
 * Port of C `do_cmd_quaff_potion()`.
 *
 * @param player    - The player drinking.
 * @param itemIndex - Index into the player's inventory.
 * @param _rng      - Random number generator.
 */
export function cmdQuaff(
  player: Player,
  itemIndex: number,
  _rng: RNG,
): CommandResult {
  const cantAct = checkCanAct(player);
  if (cantAct) return cantAct;

  const obj = getInventoryItem(player, itemIndex);
  if (!obj) {
    return {
      success: false,
      energyCost: 0,
      messages: ["You have no potions to quaff."],
    };
  }

  if (obj.tval !== TVal.POTION) {
    console.error(`[QUAFF] Item at index ${itemIndex} is not a potion (tval=${obj.tval})\n`);
    return {
      success: false,
      energyCost: 0,
      messages: ["You cannot quaff that!"],
    };
  }
  console.error(`[QUAFF] Quaffing item at index ${itemIndex}: ${obj.kind?.name ?? 'unknown'} (tval=${obj.tval} effect=${obj.effect ? 'yes' : 'no'} pval=${obj.pval})\n`);

  const messages: string[] = [];
  messages.push("You quaff the potion.");

  // Process the potion's effect chain
  if (obj.effect) {
    let eff: Effect | null = obj.effect;
    while (eff) {
      applyPotionEffect(eff, player, _rng, messages);
      eff = eff.next;
    }
  } else if (obj.pval > 0) {
    // Fallback for simple items without effect chain
    const heal = obj.pval;
    player.chp = Math.min(player.chp + heal, player.mhp);
    messages.push(`You feel better. (${heal} HP restored)`);
  }

  // Consume the potion
  messages.push(...consumeItem(player, itemIndex, obj));

  return { success: true, energyCost: STANDARD_ENERGY, messages };
}

/**
 * Read a scroll.
 *
 * Port of C `do_cmd_read_scroll()`.
 *
 * @param player    - The player reading.
 * @param itemIndex - Index into the player's inventory.
 * @param _rng      - Random number generator.
 */
export function cmdRead(
  player: Player,
  itemIndex: number,
  rng: RNG,
  chunk?: Chunk,
): CommandResult {
  const cantRead = checkCanRead(player);
  if (cantRead) return cantRead;

  const obj = getInventoryItem(player, itemIndex);
  if (!obj) {
    return {
      success: false,
      energyCost: 0,
      messages: ["You have no scrolls to read."],
    };
  }

  if (obj.tval !== TVal.SCROLL) {
    return {
      success: false,
      energyCost: 0,
      messages: ["You cannot read that!"],
    };
  }

  const messages: string[] = [];
  messages.push("You read the scroll.");

  // Apply the scroll's effect chain
  if (obj.effect) {
    let eff: Effect | null = obj.effect;
    while (eff) {
      applyScrollEffect(eff, player, rng, messages, chunk);
      eff = eff.next;
    }
  }

  // Consume the scroll
  messages.push(...consumeItem(player, itemIndex, obj));

  return { success: true, energyCost: STANDARD_ENERGY, messages };
}

/**
 * Apply a single scroll effect.
 * Handles TELEPORT, NOURISH, TIMED_INC, RECALL, etc.
 */
function applyScrollEffect(
  eff: Effect, player: Player, rng: RNG, messages: string[], chunk?: Chunk,
): void {
  if (eff.index === EffectType.TELEPORT) {
    // Phase Door / Teleport — move player to a random floor tile
    // Must use randcalc to properly evaluate dice including m_bonus.
    // E.g. Teleportation scroll has dice "M60" → {base:0, m_bonus:60}
    // Using just dice.base would give 0 (bug: teleport to same tile).
    const dist = eff.dice
      ? randcalc(rng, eff.dice, player.lev, Aspect.RANDOMISE)
      : 10;
    const actualDist = Math.max(dist, 2); // minimum distance of 2
    if (chunk) {
      const newPos = findTeleportDest(player.grid, actualDist, chunk, rng);
      if (newPos) {
        // Move player
        player.grid = newPos;
        messages.push(dist <= 10 ? "You blink." : "You teleport away.");
        console.error(`[SCROLL] TELEPORT dist=${actualDist} to (${newPos.x},${newPos.y})\n`);
      }
    }
  } else if (eff.index === EffectType.RECALL) {
    // Word of Recall — toggle recall flag
    if (player.depth > 0) {
      // In dungeon → recall to town
      player.depth = 0;
      player.upkeep.generateLevel = true;
      messages.push("The air about you becomes charged...");
      messages.push("You feel yourself yanked upwards!");
      console.error(`[SCROLL] RECALL to town\n`);
    } else {
      // In town → recall to deepest level
      const target = Math.max(1, player.recallDepth ?? 1);
      player.depth = target;
      player.upkeep.generateLevel = true;
      messages.push("The air about you becomes charged...");
      messages.push("You feel yourself yanked downwards!");
      console.error(`[SCROLL] RECALL to depth=${target}\n`);
    }
  } else {
    // Reuse potion effect handler for shared effects (NOURISH, TIMED_INC, etc.)
    applyPotionEffect(eff, player, rng, messages);
  }
}

/**
 * Find a valid teleport destination within the given distance.
 */
function findTeleportDest(
  from: { x: number; y: number },
  maxDist: number,
  chunk: Chunk,
  rng: RNG,
): { x: number; y: number } | null {
  const minDist = Math.max(1, Math.floor(maxDist / 5) + 1);
  // Try up to 200 random positions within range
  for (let i = 0; i < 200; i++) {
    const dx = rng.randint0(maxDist * 2 + 1) - maxDist;
    const dy = rng.randint0(maxDist * 2 + 1) - maxDist;
    // Enforce minimum distance (matching C Angband behavior)
    if (Math.abs(dx) + Math.abs(dy) < minDist) continue;
    const nx = from.x + dx;
    const ny = from.y + dy;
    if (nx < 1 || nx >= chunk.width - 1 || ny < 1 || ny >= chunk.height - 1) continue;
    const sq = chunk.squares[ny]?.[nx];
    if (!sq) continue;
    // Must be passable floor (Feat: 1=floor, 3=open, 4=broken, 5=less, 6=more)
    if (sq.feat !== 1 && sq.feat !== 3 && sq.feat !== 4 && sq.feat !== 5 && sq.feat !== 6) continue;
    // No monster on the tile
    if (sq.mon > 0) continue;
    return { x: nx, y: ny };
  }
  return null;
}

/**
 * Aim a wand.
 *
 * Port of C `do_cmd_aim_wand()`.
 *
 * @param player    - The player aiming.
 * @param itemIndex - Index into the player's inventory.
 * @param _target   - Target direction.
 * @param rng       - Random number generator.
 */
export function cmdAim(
  player: Player,
  itemIndex: number,
  _target: number | null,
  rng: RNG,
): CommandResult {
  const cantAct = checkCanAct(player);
  if (cantAct) return cantAct;

  const obj = getInventoryItem(player, itemIndex);
  if (!obj) {
    return {
      success: false,
      energyCost: 0,
      messages: ["You have no wands to aim."],
    };
  }

  if (obj.tval !== TVal.WAND) {
    return {
      success: false,
      energyCost: 0,
      messages: ["That is not a wand!"],
    };
  }

  // Check charges
  if (obj.pval <= 0) {
    return {
      success: false,
      energyCost: 0,
      messages: ["That wand has no charges."],
    };
  }

  const messages: string[] = [];

  // Device use check
  const deviceCheck = checkDevice(player, obj, rng);
  messages.push(...deviceCheck.messages);

  if (deviceCheck.result <= 0) {
    // Failed to use but still costs energy
    return {
      success: false,
      energyCost: STANDARD_ENERGY,
      messages,
    };
  }

  // Success: use a charge
  obj.pval -= 1;
  messages.push("You aim the wand.");

  // Apply the wand's effect (simplified; full game uses effect_do())
  if (obj.effect) {
    messages.push("The wand's magic takes effect.");
  }

  messages.push(`The wand has ${obj.pval} charge${obj.pval !== 1 ? "s" : ""} remaining.`);

  return { success: true, energyCost: STANDARD_ENERGY, messages };
}

/**
 * Zap a rod.
 *
 * Port of C `do_cmd_zap_rod()`.
 *
 * @param player    - The player zapping.
 * @param itemIndex - Index into the player's inventory.
 * @param rng       - Random number generator.
 */
export function cmdZap(
  player: Player,
  itemIndex: number,
  rng: RNG,
): CommandResult {
  const cantAct = checkCanAct(player);
  if (cantAct) return cantAct;

  const obj = getInventoryItem(player, itemIndex);
  if (!obj) {
    return {
      success: false,
      energyCost: 0,
      messages: ["You have no rods to zap."],
    };
  }

  if (obj.tval !== TVal.ROD) {
    return {
      success: false,
      energyCost: 0,
      messages: ["That is not a rod!"],
    };
  }

  // Check if the rod is still charging
  if (obj.timeout > 0) {
    return {
      success: false,
      energyCost: 0,
      messages: ["That rod is still charging."],
    };
  }

  const messages: string[] = [];

  // Device use check
  const deviceCheck = checkDevice(player, obj, rng);
  messages.push(...deviceCheck.messages);

  if (deviceCheck.result <= 0) {
    return {
      success: false,
      energyCost: STANDARD_ENERGY,
      messages,
    };
  }

  // Success: apply timeout (rod recharge)
  const rechargeTime = obj.time.base + (obj.time.dice > 0 && obj.time.sides > 0
    ? rng.randint1(obj.time.sides) * obj.time.dice
    : 0);
  obj.timeout += rechargeTime > 0 ? rechargeTime : 10;
  messages.push("You zap the rod.");

  // Apply the rod's effect (simplified)
  if (obj.effect) {
    messages.push("The rod's magic takes effect.");
  }

  return { success: true, energyCost: STANDARD_ENERGY, messages };
}

/**
 * Use a staff (internal helper, exposed via cmdUseItem dispatch).
 *
 * Port of C `do_cmd_use_staff()`.
 */
function cmdUseStaff(
  player: Player,
  itemIndex: number,
  rng: RNG,
): CommandResult {
  const cantAct = checkCanAct(player);
  if (cantAct) return cantAct;

  const obj = getInventoryItem(player, itemIndex);
  if (!obj) {
    return {
      success: false,
      energyCost: 0,
      messages: ["You have no staves to use."],
    };
  }

  if (obj.tval !== TVal.STAFF) {
    return {
      success: false,
      energyCost: 0,
      messages: ["That is not a staff!"],
    };
  }

  // Check charges
  if (obj.pval <= 0) {
    return {
      success: false,
      energyCost: 0,
      messages: ["That staff has no charges."],
    };
  }

  const messages: string[] = [];

  // Device use check
  const deviceCheck = checkDevice(player, obj, rng);
  messages.push(...deviceCheck.messages);

  if (deviceCheck.result <= 0) {
    return {
      success: false,
      energyCost: STANDARD_ENERGY,
      messages,
    };
  }

  // Success: use a charge
  obj.pval -= 1;
  messages.push("You use the staff.");

  // Apply the staff's effect (simplified)
  if (obj.effect) {
    messages.push("The staff's magic takes effect.");
  }

  messages.push(`The staff has ${obj.pval} charge${obj.pval !== 1 ? "s" : ""} remaining.`);

  return { success: true, energyCost: STANDARD_ENERGY, messages };
}

/**
 * Activate an equipped item (internal helper).
 *
 * Port of C `do_cmd_activate()`.
 */
function cmdActivate(
  player: Player,
  itemIndex: number,
  _rng: RNG,
): CommandResult {
  const cantAct = checkCanAct(player);
  if (cantAct) return cantAct;

  const obj = getInventoryItem(player, itemIndex);
  if (!obj) {
    return {
      success: false,
      energyCost: 0,
      messages: ["You have nothing to activate."],
    };
  }

  if (!obj.activation) {
    return {
      success: false,
      energyCost: 0,
      messages: ["That item cannot be activated."],
    };
  }

  // Check if still on timeout
  if (obj.timeout > 0) {
    return {
      success: false,
      energyCost: 0,
      messages: ["That item is still charging."],
    };
  }

  const messages: string[] = [];
  messages.push("You activate it.");

  if (obj.activation.message) {
    messages.push(obj.activation.message);
  }

  // Apply timeout for recharging
  const rechargeTime = obj.time.base + (obj.time.dice > 0 && obj.time.sides > 0
    ? obj.time.dice * obj.time.sides
    : 0);
  obj.timeout = rechargeTime > 0 ? rechargeTime : 10;

  return { success: true, energyCost: STANDARD_ENERGY, messages };
}

// ── Inventory management commands ──

/**
 * Pick up items from the floor.
 *
 * Port of C pickup logic. In the full game this iterates over the
 * floor pile at the player's position. Here we provide a simplified
 * version that picks up the first available object.
 *
 * @param player - The player picking up items.
 * @param chunk  - The current dungeon chunk (for floor objects).
 * @param _rng   - Random number generator (reserved).
 */
export function cmdPickup(
  player: Player,
  chunk: Chunk | null,
  _rng: RNG,
): CommandResult {
  const cantAct = checkCanAct(player);
  if (cantAct) return cantAct;

  const messages: string[] = [];

  // Check if there are objects at the player's location
  if (!chunk) {
    messages.push("There is nothing here to pick up.");
    return { success: false, energyCost: 0, messages };
  }

  const sq = chunk.squares[player.grid.y]?.[player.grid.x];
  if (!sq || sq.obj === null) {
    return { success: false, energyCost: 0, messages };
  }
  console.error(`[PICKUP-TRY] at (${player.grid.x},${player.grid.y}) sq.obj=${sq.obj}\n`);

  // Get the floor object from the chunk's object list
  const obj = chunk.objectList.get(sq.obj as number);
  if (!obj || !obj.kind) {
    return { success: false, energyCost: 0, messages };
  }

  // Check if inventory is full
  if (inventoryIsFull(player)) {
    messages.push("Your pack is full!");
    return { success: false, energyCost: 0, messages };
  }

  // Remove from floor
  chunk.objectList.delete(sq.obj as number);
  sq.obj = null;

  // If there's a linked list of objects, promote the next one
  if (obj.next) {
    // Find the next object's id in the objectList
    for (const [id, o] of chunk.objectList) {
      if (o === obj.next) {
        sq.obj = id as unknown as typeof sq.obj;
        break;
      }
    }
  }

  // Add to inventory
  addToInventory(player, obj);
  const name = obj.kind.name;
  messages.push(`You pick up ${name}.`);
  console.error(`[PICKUP] ${name} tval=${obj.tval} sval=${obj.sval}\n`);

  return { success: true, energyCost: STANDARD_ENERGY, messages };
}

/**
 * Drop an item from inventory.
 *
 * Port of C `do_cmd_drop()`.
 *
 * @param player    - The player dropping items.
 * @param itemIndex - Index into the player's inventory.
 * @param count     - Number of items to drop (from a stack). 0 = all.
 */
export function cmdDrop(
  player: Player,
  itemIndex: number,
  count: number,
): CommandResult {
  const cantAct = checkCanAct(player);
  if (cantAct) return cantAct;

  const obj = getInventoryItem(player, itemIndex);
  if (!obj) {
    return {
      success: false,
      energyCost: 0,
      messages: ["You have nothing to drop."],
    };
  }

  const messages: string[] = [];

  // Determine how many to drop
  const dropCount = count <= 0 ? obj.number : Math.min(count, obj.number);

  if (dropCount >= obj.number) {
    // Drop the entire stack
    removeFromInventory(player, itemIndex);
    messages.push(`You drop ${obj.kind?.name ?? "the item"}.`);
  } else {
    // Split the stack
    obj.number -= dropCount;
    messages.push(
      `You drop ${dropCount} of your ${obj.kind?.name ?? "items"}.`,
    );
  }

  return { success: true, energyCost: HALF_ENERGY, messages };
}

/**
 * Equip (wield/wear) an item from inventory.
 *
 * Port of C `do_cmd_wield()`.
 *
 * @param player    - The player equipping.
 * @param itemIndex - Index into the player's inventory.
 */
export function cmdEquip(
  player: Player,
  itemIndex: number,
): CommandResult {
  const cantAct = checkCanAct(player);
  if (cantAct) return cantAct;

  const obj = getInventoryItem(player, itemIndex);
  if (!obj) {
    return {
      success: false,
      energyCost: 0,
      messages: ["You have nothing to equip."],
    };
  }

  // Find the appropriate slot
  const slot = findEquipSlotForItem(obj);
  if (slot === null || slot === EquipSlot.NONE) {
    return {
      success: false,
      energyCost: 0,
      messages: ["You cannot equip that item."],
    };
  }

  const messages: string[] = [];

  // Remove from inventory
  removeFromInventory(player, itemIndex);

  // Equip the item (this also returns the previously equipped item, if any)
  const result = equipItem(player, obj, slot);
  messages.push(result.message);

  // Learn runes that are obvious on equipping (stat mods, combat bonuses)
  const newRunes = learnWieldRunes(player.knowledge, obj);
  if (newRunes.length > 0) {
    messages.push("You learn more about the item's properties.");
  }

  // If something was already equipped, put it back in inventory
  if (result.previousItem) {
    const added = addToInventory(player, result.previousItem);
    if (!added) {
      messages.push("Your pack is full! The replaced item falls to the floor.");
    }
  }

  return { success: true, energyCost: HALF_ENERGY, messages };
}

/**
 * Unequip (take off) an item from an equipment slot.
 *
 * Port of C `do_cmd_takeoff()`.
 *
 * @param player - The player unequipping.
 * @param slot   - The equipment slot to unequip.
 */
export function cmdUnequip(
  player: Player,
  slot: EquipSlot,
): CommandResult {
  const cantAct = checkCanAct(player);
  if (cantAct) return cantAct;

  if (slot === EquipSlot.NONE) {
    return {
      success: false,
      energyCost: 0,
      messages: ["Invalid equipment slot."],
    };
  }

  const messages: string[] = [];

  const removed = unequipItem(player, slot);
  if (!removed) {
    return {
      success: false,
      energyCost: 0,
      messages: ["Nothing is equipped in that slot."],
    };
  }

  // Check inventory capacity
  if (inventoryIsFull(player)) {
    // Put it back
    equipItem(player, removed, slot);
    return {
      success: false,
      energyCost: 0,
      messages: ["Your pack is full! You cannot unequip that item."],
    };
  }

  addToInventory(player, removed);
  messages.push(`You remove ${removed.kind?.name ?? "the item"}.`);

  return { success: true, energyCost: HALF_ENERGY, messages };
}

/**
 * Rest for a number of turns.
 *
 * Port of resting logic. When turns is 0, rest until fully healed.
 * When turns is a positive number, rest for exactly that many turns.
 *
 * @param player - The player resting.
 * @param turns  - Number of turns to rest. 0 = until fully healed.
 */
export function cmdRest(
  player: Player,
  turns: number,
): CommandResult {
  const cantAct = checkCanAct(player);
  if (cantAct) return cantAct;

  const messages: string[] = [];

  if (turns < 0) {
    return {
      success: false,
      energyCost: 0,
      messages: ["Invalid rest duration."],
    };
  }

  if (turns === 0) {
    // Rest until HP and SP are full
    // In the actual game, this sets a special resting counter (-2)
    // that the game loop checks each turn.
    player.upkeep.resting = -2; // REST_ALL_POINTS convention
    messages.push("You begin resting until healed...");
  } else {
    player.upkeep.resting = turns;
    messages.push(`You begin resting for ${turns} turns.`);
  }

  return { success: true, energyCost: STANDARD_ENERGY, messages };
}

/**
 * Inscribe an item with a text label.
 *
 * Port of C `do_cmd_inscribe()`.
 *
 * @param player      - The player inscribing.
 * @param itemIndex   - Index into the player's inventory.
 * @param inscription - The inscription text.
 */
export function cmdInscribe(
  player: Player,
  itemIndex: number,
  inscription: string,
): CommandResult {
  const cantAct = checkCanAct(player);
  if (cantAct) return cantAct;

  const obj = getInventoryItem(player, itemIndex);
  if (!obj) {
    return {
      success: false,
      energyCost: 0,
      messages: ["You have nothing to inscribe."],
    };
  }

  if (!inscription || inscription.trim().length === 0) {
    return {
      success: false,
      energyCost: 0,
      messages: ["No inscription provided."],
    };
  }

  const messages: string[] = [];

  // In the full game, the inscription is stored as a quark.
  // We store a simple numeric ID (quark index). For the command layer,
  // we use a placeholder to set the note field.
  // A real implementation would call quarkAdd(inscription).
  // For now, we use a hash-like approach.
  obj.note = simpleQuarkId(inscription);

  messages.push(
    `You inscribe ${obj.kind?.name ?? "the item"} with "${inscription}".`,
  );

  return { success: true, energyCost: 0, messages };
}

/**
 * Simple quark ID for inscription (placeholder).
 * In the full game this would go through QuarkStore.
 */
function simpleQuarkId(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  // Ensure positive and non-zero
  return (hash >>> 0) + 1;
}
