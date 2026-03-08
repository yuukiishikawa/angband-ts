/**
 * @file game/world.ts
 * @brief Main game loop — turn management, world processing, energy system
 *
 * Port of game-world.c — the main game loop, process_world(), turn_energy(),
 * player/monster turn processing, regen, hunger, and level transitions.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Player } from "../types/player.js";
import type { Chunk, MonsterId } from "../types/cave.js";
import type { Monster } from "../types/monster.js";
import { MonsterRaceFlag, MonsterTempFlag, MonsterTimedEffect } from "../types/monster.js";
import { Stat, TimedEffect } from "../types/player.js";
import { PY_FOOD_WEAK, PY_FOOD_FAINT, PY_FOOD_STARVE } from "../player/timed.js";
import { TVal } from "../types/object.js";
import type { ObjectType } from "../types/object.js";
import type { GameState } from "./state.js";
import { addMessage, MessageType } from "./state.js";
import { GameEventType } from "./event.js";
import type { InputProvider } from "./input.js";
import type { GameCommand, CommandResult } from "../command/core.js";
import { executeCommand, STANDARD_ENERGY } from "../command/core.js";
import { updateView } from "../cave/view.js";
import { updateNoise, updateScent } from "../cave/heatmap.js";
import { squareSetFeat, squareIsFloor } from "../cave/square.js";
import { Feat } from "../types/cave.js";
import { loc } from "../z/index.js";
import { generateDungeon, DEFAULT_DUNGEON_CONFIG } from "../generate/generate.js";
import { monsterTakeTurn, monsterMove, monsterMultiply, monsterCheckActive } from "../monster/move.js";
import { pickMonsterRace, placeNewMonster, findSpawnPoint } from "../monster/make.js";
import { monsterAttackPlayer, applyBlowEffect } from "../monster/attack.js";
import { monsterDeath } from "../monster/death.js";
import { monsterChooseSpell, monsterCastSpell } from "../monster/spell.js";
import { expForPlayerLevel } from "../player/util.js";
import { calcBonuses } from "../player/calcs.js";

// ── Constants ──

/** Normal speed value. */
export const NORMAL_SPEED = 110;

/** Energy required for one action. */
export const MOVE_ENERGY = 100;

/** Default maximum view radius. */
const MAX_VIEW_RADIUS = 20;

/**
 * Speed-to-energy conversion table (from C extract_energy[]).
 *
 * Index = speed value (0..199). The entry gives the energy gained
 * per game tick at that speed. Normal speed (110) yields 10 energy,
 * so it takes 10 ticks to accumulate 100 energy (one action).
 */
export const EXTRACT_ENERGY: readonly number[] = [
  /* Slow */     1,  1,  1,  1,  1,  1,  1,  1,  1,  1,
  /* Slow */     1,  1,  1,  1,  1,  1,  1,  1,  1,  1,
  /* Slow */     1,  1,  1,  1,  1,  1,  1,  1,  1,  1,
  /* Slow */     1,  1,  1,  1,  1,  1,  1,  1,  1,  1,
  /* Slow */     1,  1,  1,  1,  1,  1,  1,  1,  1,  1,
  /* Slow */     1,  1,  1,  1,  1,  1,  1,  1,  1,  1,
  /* S-50 */     1,  1,  1,  1,  1,  1,  1,  1,  1,  1,
  /* S-40 */     2,  2,  2,  2,  2,  2,  2,  2,  2,  2,
  /* S-30 */     2,  2,  2,  2,  2,  2,  2,  3,  3,  3,
  /* S-20 */     3,  3,  3,  3,  3,  4,  4,  4,  4,  4,
  /* S-10 */     5,  5,  5,  5,  6,  6,  7,  7,  8,  9,
  /* Norm */    10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  /* F+10 */    20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
  /* F+20 */    30, 31, 32, 33, 34, 35, 36, 36, 37, 37,
  /* F+30 */    38, 38, 39, 39, 40, 40, 40, 41, 41, 41,
  /* F+40 */    42, 42, 42, 43, 43, 43, 44, 44, 44, 44,
  /* F+50 */    45, 45, 45, 45, 45, 46, 46, 46, 46, 46,
  /* F+60 */    47, 47, 47, 47, 47, 48, 48, 48, 48, 48,
  /* F+70 */    49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
  /* Fast */    49, 49, 49, 49, 49, 49, 49, 49, 49, 49,
];

// ── Energy system ──

/**
 * Calculate the energy gained in one game tick at the given speed.
 *
 * Port of turn_energy() from game-world.c.
 *
 * @param speed - The entity's speed value (typically around 110).
 * @returns The amount of energy gained per tick.
 */
export function turnEnergy(speed: number): number {
  const clamped = Math.max(0, Math.min(199, speed));
  return EXTRACT_ENERGY[clamped]!;
}

// ── Regeneration ──

/**
 * Normal regeneration rate per turn.
 * Matches C's PY_REGEN_NORMAL from defines.h.
 * At this rate it takes ~333 turns to regen 1 HP (65536 / 197 ≈ 333).
 */
export const PY_REGEN_NORMAL = 197;
/** Regen rate when Weak from hunger (C: PY_REGEN_WEAK). */
const PY_REGEN_WEAK = 98;
/** Regen rate when Faint from hunger (C: PY_REGEN_FAINT). */
const PY_REGEN_FAINT = 33;

/**
 * Regenerate the player's hit points.
 *
 * Port of player_regen_hp() from player-util.c.
 * Called every turn. Uses fractional HP (chpFrac) to accumulate
 * sub-integer regen. Base rate is PY_REGEN_NORMAL (197) per turn,
 * modified by food level, resting, and equipment flags.
 *
 * @param player - The player to regenerate.
 */
export function regenerateHP(player: Player): void {
  if (player.chp >= player.mhp) return;

  // Base regen rate — graduated by food level (port of C logic)
  const food = player.timed[TimedEffect.FOOD] ?? 0;
  let percent = 0;
  if (food >= PY_FOOD_WEAK) {
    percent = PY_REGEN_NORMAL;  // 197
  } else if (food >= PY_FOOD_FAINT) {
    percent = PY_REGEN_WEAK;    // 98
  } else if (food >= PY_FOOD_STARVE) {
    percent = PY_REGEN_FAINT;   // 33
  }

  // Food bonus — better fed players regen up to ~33% faster (C port)
  // fed_pct = food / food_value; percent *= (100 + fed_pct/3) / 100
  const FOOD_VALUE = 100;
  const fedPct = Math.floor(food / FOOD_VALUE);
  percent = Math.floor(percent * (100 + Math.floor(fedPct / 3)) / 100);

  // Resting doubles regen rate
  if (player.upkeep.resting > 0) {
    percent *= 2;
  }

  // TODO: if (playerOfHas(player, OF_REGEN)) percent *= 2;
  // TODO: if (playerOfHas(player, OF_IMPAIR_HP)) percent /= 2;

  // Status effects block HP regen (matches C exactly)
  if ((player.timed[TimedEffect.PARALYZED] ?? 0) > 0) percent = 0;
  if ((player.timed[TimedEffect.POISONED] ?? 0) > 0) percent = 0;
  if ((player.timed[TimedEffect.STUN] ?? 0) > 0) percent = 0;
  if ((player.timed[TimedEffect.CUT] ?? 0) > 0) percent = 0;

  // Accumulate fractional HP (with base gain matching C's PY_REGEN_HPBASE)
  const PY_REGEN_HPBASE = 1442;
  const hpGainRaw = player.mhp * percent + PY_REGEN_HPBASE;
  player.chpFrac += hpGainRaw;

  // Convert fractional overflow to real HP
  if (player.chpFrac >= 0x10000) {
    const hpGain = Math.floor(player.chpFrac / 0x10000);
    player.chpFrac %= 0x10000;
    player.chp = Math.min(player.mhp, player.chp + hpGain);
  }
}

/**
 * Regenerate the player's mana (spell points).
 *
 * Port of player_regen_mana() from player-util.c.
 * Called every turn. Uses fractional SP (cspFrac) to accumulate
 * sub-integer regen. Base rate is PY_REGEN_NORMAL (197) per turn,
 * modified by food level and resting.
 *
 * @param player - The player to regenerate.
 */
export function regenerateMana(player: Player): void {
  if (player.msp <= 0) return;
  if (player.csp >= player.msp) return;

  // Base regen rate (matches C PY_REGEN_NORMAL)
  let percent = PY_REGEN_NORMAL;

  // Food level affects regen
  const food = player.timed[TimedEffect.FOOD] ?? 0;
  if (food < PY_FOOD_WEAK) {
    percent = 0;
  }

  // Resting doubles regen rate
  if (player.upkeep.resting > 0) {
    percent *= 2;
  }

  // TODO: if (playerOfHas(player, OF_REGEN)) percent *= 2;
  // TODO: if (playerOfHas(player, OF_IMPAIR_HP)) percent /= 2;

  // Accumulate fractional SP
  player.cspFrac += percent;

  // Convert fractional overflow to real SP
  if (player.cspFrac >= 0x10000) {
    const spGain = Math.floor(player.cspFrac / 0x10000);
    player.cspFrac %= 0x10000;
    player.csp = Math.min(player.msp, player.csp + spGain);
  }
}

// ── Hunger ──

/**
 * Process hunger (food decrease per turn).
 *
 * Port of the food digestion logic from process_world() in game-world.c.
 * The food timer (TMD_FOOD) decreases each turn. When it reaches
 * critical levels the player faints or starves.
 *
 * @param player - The player to apply hunger to.
 */
export function processHunger(player: Player): void {
  const foodIndex = TimedEffect.FOOD as number;
  const currentFood = player.timed[foodIndex];
  if (currentFood === undefined || currentFood <= 0) return;

  // Base digestion: 1 unit per turn, scaled by speed
  const digestRate = Math.max(1, Math.floor(turnEnergy(player.state.speed) / 10));
  const newFood = Math.max(0, currentFood - digestRate);
  player.timed[foodIndex] = newFood;
}

// ── Timed effects ──

/**
 * Decrement all active timed effects by 1 each turn.
 *
 * Port of decrease_timeouts() from game-world.c.
 * Food is handled separately by processHunger().
 *
 * @param player - The player whose timed effects to decrement.
 */
export function decreaseTimeouts(player: Player): void {
  const FOOD = TimedEffect.FOOD as number;

  for (let i = 0; i < player.timed.length; i++) {
    // Skip food (handled by processHunger) and already-expired effects
    if (i === FOOD) continue;
    const current = player.timed[i];
    if (current === undefined || current <= 0) continue;
    player.timed[i] = current - 1;
  }
}

// ── Level change detection ──

/**
 * Check if the player has used stairs and needs a level change.
 *
 * This detects the condition where a GO_UP or GO_DOWN command
 * modified player.depth so it differs from state.depth. The
 * player's upkeep.generateLevel flag is also checked (set by
 * stair commands and word of recall).
 *
 * @param state - The current game state.
 * @returns True if a level change is needed.
 */
export function checkLevelChange(state: GameState): boolean {
  // Primary check: upkeep flag
  if (state.player.upkeep.generateLevel) return true;

  // Secondary check: depth mismatch (stair commands update player.depth)
  if (state.player.depth !== state.depth) return true;

  return false;
}

/**
 * Execute a level change: generate a new dungeon level at the given depth.
 *
 * Port of prepare_next_level() + on_new_level() from game-world.c.
 *
 * @param state    - The current game state (modified in place).
 * @param newDepth - The target dungeon depth.
 */
export function changeLevel(state: GameState, newDepth: number): void {
  // Generate a new dungeon level with monster races and object kinds
  const newChunk = generateDungeon(
    newDepth,
    DEFAULT_DUNGEON_CONFIG,
    state.rng,
    state.monsterRaces,
    state.objectKinds,
    state.egoItems ?? [],
  );
  console.error(`[LEVEL] Generated depth=${newDepth}: objects=${newChunk.objectList.size} monsters=${newChunk.monsters.length} kinds=${state.objectKinds.length}\n`);

  // For dungeon levels (depth > 0), place an extra down stair near the up stair
  // so the C borg can find it without traversing the entire dungeon.
  if (newDepth > 0) {
    // Find the up stair (player start position)
    let upX = -1, upY = -1;
    for (let y = 1; y < newChunk.height - 1 && upX < 0; y++) {
      for (let x = 1; x < newChunk.width - 1; x++) {
        if (newChunk.squares[y]![x]!.feat === Feat.LESS) {
          upX = x; upY = y; break;
        }
      }
    }
    if (upX >= 0) {
      // Search outward from the up stair for the closest floor tile.
      // Start at radius 1 to ensure the stair is in the same room/corridor.
      let placed = false;
      for (let radius = 1; radius <= 30 && !placed; radius++) {
        for (let dy = -radius; dy <= radius && !placed; dy++) {
          for (let dx = -radius; dx <= radius && !placed; dx++) {
            if (Math.abs(dx) < radius && Math.abs(dy) < radius) continue;
            const nx = upX + dx, ny = upY + dy;
            if (nx < 1 || ny < 1 || nx >= newChunk.width - 1 || ny >= newChunk.height - 1) continue;
            const sq = newChunk.squares[ny]![nx]!;
            if (sq.feat === Feat.FLOOR) {
              squareSetFeat(newChunk, loc(nx, ny), Feat.MORE);
              console.error(`[LEVEL] Extra down stair at (${nx},${ny}) near up@(${upX},${upY}) dist=${Math.abs(dx)+Math.abs(dy)}\n`);
              placed = true;
            }
          }
        }
      }
    }
  }

  // Find a floor square for the player to start on
  // (prefer an up/down stair position from the generated level)
  const startLoc = findPlayerStart(newChunk);

  // Decrement curNum for all monsters on the old level
  // (prevents UNIQUEs from being permanently blocked)
  for (const mon of state.monsters) {
    if (mon && mon.race.curNum > 0) {
      mon.race.curNum--;
    }
  }

  // Update state
  state.chunk = newChunk;
  state.depth = newDepth;
  state.player.depth = newDepth;
  state.player.grid = startLoc;
  state.monsters = newChunk.monsters;

  // Track maximum depth
  if (newDepth > state.player.maxDepth) {
    state.player.maxDepth = newDepth;
    state.player.recallDepth = newDepth;
  }

  // Clear the generateLevel flag
  state.player.upkeep.generateLevel = false;

  // Give the player minimum energy to start the level
  if (state.player.energy < MOVE_ENERGY) {
    state.player.energy = MOVE_ENERGY;
  }

  // Emit events
  state.eventBus.emit(GameEventType.NEW_LEVEL_DISPLAY);
  state.eventBus.emit(GameEventType.DUNGEONLEVEL, newDepth);

  addMessage(
    state,
    newDepth === 0
      ? "You enter the town."
      : `You enter dungeon level ${newDepth}.`,
  );
}

/**
 * Find a starting position for the player on a new level.
 *
 * Searches for an up staircase first (when going down) or
 * a floor tile as fallback.
 */
function findPlayerStart(chunk: Chunk): { x: number; y: number } {
  // First pass: look for an up staircase (FEAT_LESS = 5)
  for (let y = 1; y < chunk.height - 1; y++) {
    const row = chunk.squares[y];
    if (!row) continue;
    for (let x = 1; x < chunk.width - 1; x++) {
      const sq = row[x];
      if (!sq) continue;
      if (sq.feat === (5 as never)) { // Feat.LESS
        return { x, y };
      }
    }
  }

  // Second pass: look for any floor tile (FEAT_FLOOR = 1)
  for (let y = 1; y < chunk.height - 1; y++) {
    const row = chunk.squares[y];
    if (!row) continue;
    for (let x = 1; x < chunk.width - 1; x++) {
      const sq = row[x];
      if (!sq) continue;
      if (sq.feat === (1 as never)) { // Feat.FLOOR
        return { x, y };
      }
    }
  }

  // Fallback: center of the map
  return {
    x: Math.floor(chunk.width / 2),
    y: Math.floor(chunk.height / 2),
  };
}

// ── Monster processing ──

/**
 * Process all monsters for the current tick.
 *
 * Each monster with enough energy (>= MOVE_ENERGY) takes a turn,
 * then has its energy deducted. All monsters gain energy based on
 * their speed each tick.
 *
 * Port of process_monsters() from mon-move.c / game-world.c.
 *
 * @param state      - The current game state.
 * @param monsters   - Array of active monsters on the level.
 * @param minEnergy  - Minimum energy threshold to act (default 0).
 *                     Pass player.energy+1 after level change so only
 *                     fast monsters act before the player's first turn
 *                     (port of C's process_monsters(cave, p, min) call).
 */
export function processMonsters(
  state: GameState,
  monsters: Monster[],
  minEnergy: number = 0,
): void {
  const chunk = state.chunk;
  const playerLoc = state.player.grid;
  const rng = state.rng;

  for (const mon of monsters) {
    // Skip null entries (sparse array from monster placement)
    if (!mon) continue;
    // Skip dead monsters (hp <= 0)
    if (mon.hp <= 0) continue;

    // Give energy based on speed
    mon.energy += turnEnergy(mon.mspeed);

    // Process turns while the monster has enough energy
    // minEnergy filter: skip monsters below the threshold (fast-monster phase)
    while (mon.energy >= MOVE_ENERGY && mon.energy >= minEnergy) {
      // C: monster_check_active() BEFORE any action (including multiply)
      // Inactive monsters skip their entire turn — no breeding, no movement.
      if (!monsterCheckActive(chunk, mon, state.turn)) {
        mon.mflag.off(MonsterTempFlag.ACTIVE);
        mon.energy -= MOVE_ENERGY;
        continue;
      }
      mon.mflag.on(MonsterTempFlag.ACTIVE);

      // C: awake active monsters have 10% chance/turn to become AWARE
      // AWARE monsters track the player more accurately
      const SLEEP = MonsterTimedEffect.SLEEP as number;
      if ((mon.mTimed[SLEEP] ?? 0) === 0 && rng.randint0(10) === 0) {
        mon.mflag.on(MonsterTempFlag.AWARE);
      }

      // Try to multiply FIRST — this uses the turn (C: monster_turn_multiply)
      let didMultiply = false;
      if (mon.race.flags.has(MonsterRaceFlag.MULTIPLY)) {
        didMultiply = monsterMultiply(chunk, mon, rng);
        if (didMultiply) {
          console.error(`[REPRO] ${mon.race.name} multiplied! numRepro=${chunk.numRepro}, monCnt=${chunk.monCnt}\n`);
        }
      }

      if (!didMultiply) {
        // Normal action (move/attack/spell/idle)
        const action = monsterTakeTurn(chunk, mon, playerLoc, rng);

        switch (action.type) {
          case "move":
            monsterMove(chunk, mon, action.target);
            break;
          case "attack":
            // Monster attacks the player — use full blow resolution
            {
              const blowResults = monsterAttackPlayer(mon, state.player, rng);
              let totalDamage = 0;
              for (const result of blowResults) {
                if (result.hit) {
                  totalDamage += result.damage;
                  if (result.message) {
                    addMessage(state, result.message, MessageType.COMBAT);
                  }
                  // Apply blow effect (status effects, theft, drain)
                  const effectMsgs = applyBlowEffect(result.effect, state.player, result.damage, rng);
                  for (const msg of effectMsgs) {
                    addMessage(state, msg, MessageType.COMBAT);
                  }
                } else if (result.message) {
                  addMessage(state, result.message, MessageType.COMBAT);
                }
              }
              if (totalDamage > 0) {
                const hpBefore = state.player.chp;
                state.player.chp -= totalDamage;
                console.error(`[COMBAT] DMG_TAKEN ${mon.race.name} totalDmg=${totalDamage} HP=${hpBefore}→${state.player.chp}/${state.player.mhp}\n`);
                if (state.player.chp <= 0) {
                  state.player.chp = 0;
                  state.player.isDead = true;
                  state.dead = true;
                  state.player.diedFrom = mon.race.name;
                  console.error(`[COMBAT] PLAYER_DIED from=${mon.race.name}\n`);
                }
              }
            }
            break;
          case "spell":
            // Monster spell casting
            {
              const spell = monsterChooseSpell(mon, mon.race, rng);
              if (spell !== null) {
                const castResult = monsterCastSpell(mon, spell, playerLoc, rng);
                addMessage(state, castResult.message, MessageType.COMBAT);
                if (castResult.damage > 0) {
                  state.player.chp -= castResult.damage;
                  addMessage(state, `You take ${castResult.damage} damage.`, MessageType.COMBAT);
                  if (state.player.chp <= 0) {
                    state.player.chp = 0;
                    state.player.isDead = true;
                    state.dead = true;
                    state.player.diedFrom = mon.race.name;
                  }
                }
              }
            }
            break;
          case "idle":
            // Do nothing
            break;
        }
      }

      mon.energy -= MOVE_ENERGY;

      // Stop processing if player died
      if (state.player.isDead) break;
    }

    // Stop processing remaining monsters if player died
    if (state.player.isDead) break;
  }
}

// ── World processing ──

/**
 * Process world effects for one game tick.
 *
 * Called every tick (or every 10 ticks for some effects, matching C).
 * Handles: HP regeneration, mana regeneration, hunger, timed effect
 * decrements, and other periodic effects.
 *
 * Port of process_world() from game-world.c.
 *
 * @param state - The current game state.
 */
export function processWorld(state: GameState): void {
  const player = state.player;

  // Skip if dead
  if (player.isDead) return;

  // HP regeneration
  if (player.chp < player.mhp) {
    regenerateHP(player);
  }

  // Mana regeneration
  if (player.msp > 0 && player.csp < player.msp) {
    regenerateMana(player);
  }

  // Hunger (food digestion) — C: !(turn % 100) inside process_world (called every 10 turns)
  // Since processWorld is now called every 10 turns, use turn % 100 for every 100 turns total
  if (state.turn % 100 === 0) {
    processHunger(player);
  }

  // Poison damage tick
  if ((player.timed[TimedEffect.POISONED] ?? 0) > 0) {
    const poisonDmg = Math.max(1, Math.floor((player.timed[TimedEffect.POISONED] ?? 0) / 10));
    player.chp -= poisonDmg;
    if (player.chp <= 0) {
      player.chp = 0;
      player.isDead = true;
      player.diedFrom = "poison";
    }
  }

  // Bleeding (cuts) damage tick
  if ((player.timed[TimedEffect.CUT] ?? 0) > 0) {
    const cutLevel = player.timed[TimedEffect.CUT] ?? 0;
    let cutDmg = 0;
    if (cutLevel > 200) cutDmg = 3;       // Mortal wound
    else if (cutLevel > 100) cutDmg = 3;  // Deep gash
    else if (cutLevel > 50) cutDmg = 2;   // Severe cut
    else if (cutLevel > 25) cutDmg = 2;   // Nasty cut
    else if (cutLevel > 10) cutDmg = 1;   // Bad cut
    else cutDmg = 1;                       // Light cut
    player.chp -= cutDmg;
    if (player.chp <= 0) {
      player.chp = 0;
      player.isDead = true;
      player.diedFrom = "a fatal wound";
    }
  }

  // Decrement timed effects
  decreaseTimeouts(player);

  // Monster HP regeneration — every 100 turns, 1/8 max HP
  if (state.turn % 100 === 0) {
    for (const mon of state.monsters) {
      if (!mon || mon.hp <= 0) continue;
      if (mon.hp < mon.maxhp) {
        const regenRate = mon.race.flags.has(MonsterRaceFlag.REGENERATE)
          ? Math.floor(mon.maxhp / 4)  // REGENERATE: heal 1/4 per tick
          : Math.floor(mon.maxhp / 8); // Normal: heal 1/8 per tick
        mon.hp = Math.min(mon.maxhp, mon.hp + Math.max(1, regenRate));
      }
    }
  }

  // Monster natural spawning — C uses one_in_(alloc_monster_chance=500) per
  // process_world() call. Since processWorld runs every 10 turns, effective
  // rate is 1/5000 per game turn, matching C.
  if (state.depth > 0 && state.rng.oneIn(500)) {
    const race = pickMonsterRace(state.depth, state.monsterRaces, state.rng);
    if (race) {
      // C: pick_and_place_distant_monster(c, player->grid, max_sight + 5, ...)
      // max_sight = 20, so minimum Chebyshev distance = 25
      const MIN_SPAWN_DIST = 25; // C: z_info->max_sight + 5
      const spawnLoc = findSpawnPoint(state.chunk, player.grid, MIN_SPAWN_DIST + 5, state.rng);
      if (spawnLoc) {
        const chebyshev = Math.max(
          Math.abs(spawnLoc.x - player.grid.x),
          Math.abs(spawnLoc.y - player.grid.y),
        );
        if (chebyshev >= MIN_SPAWN_DIST) {
          placeNewMonster(state.chunk, spawnLoc, race, true, false, 0, state.rng);
        }
      }
    }
  }

  // Emit HP/mana events for UI updates
  state.eventBus.emit(GameEventType.HP, {
    cur: player.chp,
    max: player.mhp,
  });
  state.eventBus.emit(GameEventType.MANA, {
    cur: player.csp,
    max: player.msp,
  });
}

// ── Player turn processing ──

/**
 * Parse keyboard input into a game command.
 *
 * The InputProvider returns an InputResponse which this function
 * translates into a GameCommand. For now, we support the "command"
 * type response which directly provides a GameCommand.
 *
 * This is the bridge between the input abstraction and the command system.
 */
export interface CommandInputProvider {
  /**
   * Get the next game command from the player.
   * This awaits player input via the UI.
   */
  getCommand(): Promise<GameCommand | null>;
}

/**
 * Process a single player turn: get a command and execute it.
 *
 * Port of process_player() from game-world.c.
 *
 * @param state - The current game state.
 * @param input - The command input provider.
 * @returns True if the player used energy (took an action), false otherwise.
 */
export async function processPlayer(
  state: GameState,
  input: CommandInputProvider,
): Promise<boolean> {
  // Paralysis: skip turn without requesting input (C: cmd_get returns CMD_SLEEP)
  if ((state.player.timed[TimedEffect.PARALYZED] ?? 0) > 0) {
    return true; // consume energy, let monsters/world process
  }

  // Get a command from the player
  const cmd = await input.getCommand();
  if (cmd === null) return false;

  // Determine repeat count (numeric prefix, default 1)
  const nrepeat = cmd.nrepeat ?? 1;
  let usedEnergy = false;

  for (let rep = 0; rep < nrepeat; rep++) {
    // Execute the command
    const result: CommandResult = executeCommand(
      cmd,
      state.player,
      state.chunk,
      state.rng,
    );

    // Debug: log failed commands to stderr
    if (!result.success && result.messages.length > 0) {
      const dirInfo = 'direction' in cmd ? ` dir=${(cmd as {direction:number}).direction}` : '';
      console.error(`[CMD-FAIL] type=${cmd.type}${dirInfo} pos=(${state.player.grid.x},${state.player.grid.y}) depth=${state.player.depth} msg=${result.messages[0]}\n`);
    }

    // Apply messages (only show on first and last iteration to avoid spam)
    if (rep === 0 || rep === nrepeat - 1) {
      for (const msg of result.messages) {
        addMessage(state, msg);
      }
    }

    // Deduct energy if the command used some
    if (result.energyCost > 0) {
      state.player.energy -= result.energyCost;
      state.player.totalEnergy += result.energyCost;
      state.player.upkeep.energyUse = result.energyCost;
      usedEnergy = true;
    }

    // Stop repeating if command failed or no energy left for next iteration
    if (!result.success || result.energyCost === 0) break;
    if (state.player.energy < MOVE_ENERGY && rep < nrepeat - 1) break;
  }

  // Recalculate derived stats after any action (equipment, buffs, etc.)
  // Port of the calc_bonuses() call in C process_player().
  if (usedEnergy) {
    state.player.state = calcBonuses(state.player);
  } else {
    state.player.upkeep.energyUse = 0;
  }
  return usedEnergy;
}

// ── Dead monster cleanup ──

/**
 * Process dead monsters: generate drops, award experience, remove from grid.
 *
 * Port of process_player_cleanup() dead monster section from game-world.c.
 * Called after the player takes an action.
 *
 * @param state - The current game state.
 */
export function processDeadMonsters(state: GameState): void {
  const chunk = state.chunk;

  for (let i = state.monsters.length - 1; i >= 0; i--) {
    const mon = state.monsters[i];
    if (!mon || mon.hp > 0) continue;

    // Process death: drops and experience
    const result = monsterDeath(
      mon,
      state.player,
      state.depth,
      state.objectKinds,
      state.rng,
      state.egoItems,
    );

    // Award experience
    if (result.exp > 0) {
      state.player.exp += result.exp;
      if (state.player.exp > state.player.maxExp) {
        state.player.maxExp = state.player.exp;
      }
      console.error(`[XP] Killed ${mon.race.name} (midx=${mon.midx}): +${result.exp} XP, total=${state.player.exp}\n`);
    } else {
      console.error(`[XP] Dead monster ${mon.race.name} (midx=${mon.midx}): 0 exp from monsterDeath\n`);
    }

    // Award gold
    if (result.goldTotal > 0) {
      state.player.au += result.goldTotal;
      addMessage(state, `You collect ${result.goldTotal} gold.`, MessageType.COMBAT);
    }

    // Report drop messages
    for (const msg of result.messages) {
      addMessage(state, msg, MessageType.COMBAT);
    }

    // Place non-gold drops on the map (stored in chunk.objectList)
    for (const obj of result.drops) {
      if (obj.tval !== TVal.GOLD) { // gold is already collected as au
        const nextObjId = chunk.objMax + 1;
        (chunk as { objMax: number }).objMax = nextObjId;
        (obj as { oidx: number }).oidx = nextObjId;
        chunk.objectList.set(nextObjId, obj);

        // Place on the grid — chain with any existing object
        const sq = chunk.squares[mon.grid.y]?.[mon.grid.x];
        if (sq) {
          if (sq.obj !== null) {
            const existing = chunk.objectList.get(sq.obj as number);
            if (existing) {
              (obj as { next: ObjectType | null }).next = existing;
            }
          }
          (sq as { obj: number | null }).obj = nextObjId;
        }
      }
    }

    // Clear monster from the grid (only if the square still references this
    // monster — another monster may have taken the square via KILL_BODY)
    const sq = chunk.squares[mon.grid.y]?.[mon.grid.x];
    if (sq && sq.mon === mon.midx) {
      (sq as { mon: number }).mon = 0;
    }

    // Decrement breeder count if this was a multiplying monster (B3 fix)
    if (mon.race.flags.has(MonsterRaceFlag.MULTIPLY)) {
      (chunk as { numRepro: number }).numRepro = Math.max(0, chunk.numRepro - 1);
      console.error(`[REPRO] Breeder died: ${mon.race.name} midx=${mon.midx}, numRepro=${chunk.numRepro}\n`);
    }

    // Null out the monster slot (do NOT splice — preserves midx invariant)
    (chunk.monsters as (Monster | null)[])[mon.midx] = null;
    (chunk as { monCnt: number }).monCnt = Math.max(0, chunk.monCnt - 1);

    // Note: combat.ts already adds "You have slain the X!" to the command result messages.
    // Don't duplicate here.
  }

  // Check for level-up after all XP has been awarded
  checkExperience(state);
}

// ── Experience and leveling ──

/**
 * Check if the player has gained enough experience to level up.
 * Port of check_experience() from player.c.
 */
function checkExperience(state: GameState): void {
  const player = state.player;
  const PY_MAX_LEVEL = 50;

  while (player.lev < PY_MAX_LEVEL) {
    // C uses: adv_exp(player->lev, expfact) = player_exp[lev-1] * expfact / 100
    // This gives the XP threshold to advance FROM current level.
    const needed = expForPlayerLevel(player, player.lev);
    if (needed <= 0 || player.exp < needed) {
      break;
    }

    player.lev++;
    console.error(`[LVL] LEVEL UP! CL${player.lev}: exp=${player.exp}, needed=${needed}\n`);

    // Recalculate HP
    if (player.playerHp && player.playerHp.length >= player.lev) {
      const conBonus = player.state?.statInd?.[Stat.CON] ?? 0;
      // Simplified HP calculation matching calcPlayerHP in calcs.ts
      const bonus = (conBonus >= 0 && conBonus < 40) ? (conBonus - 3) * 10 : 0;
      let mhp = (player.playerHp[player.lev - 1] ?? 10) + Math.floor((bonus * player.lev) / 100);
      if (mhp < player.lev + 1) mhp = player.lev + 1;
      player.mhp = mhp;
    }

    // Fully heal on level up
    player.chp = player.mhp;

    // Recalculate bonuses (skills improve with level)
    player.state = calcBonuses(player);

    addMessage(state, `Welcome to level ${player.lev}!`);
  }
}

// ── Main game loop ──

/**
 * Run the main game loop.
 *
 * This is the top-level async loop, a port of run_game_loop() from
 * game-world.c. The loop continues until the player dies or wins.
 *
 * Each iteration:
 * 1. Update FOV (field of view / visibility).
 * 2. Emit refresh event for the UI.
 * 3. If the player has enough energy, get input and execute a command.
 * 4. Process all monsters that have enough energy.
 * 5. Process world effects (regen, timers, hunger).
 * 6. Give energy to the player based on speed.
 * 7. Increment the turn counter.
 * 8. Check for level change (stairs).
 *
 * @param state    - The game state.
 * @param input    - The command input provider (async UI bridge).
 * @param monsters - Active monsters on the current level.
 */
export interface GameLoopOptions {
  /** Maximum consecutive idle (no-energy) iterations before aborting.
   *  Default 200.  AI input providers may need a higher value (e.g. 5000)
   *  when they legitimately send many non-energy commands. */
  maxIdleIterations?: number;
}

export async function runGameLoop(
  state: GameState,
  input: CommandInputProvider,
  options?: GameLoopOptions,
): Promise<void> {
  state.running = true;

  // Emit enter-world event
  state.eventBus.emit(GameEventType.ENTER_WORLD);

  // Give the player initial energy
  if (state.player.energy < MOVE_ENERGY) {
    state.player.energy = MOVE_ENERGY;
  }

  // Guard against infinite loops: if the player's command fails to use
  // energy repeatedly (e.g. walking into a wall), we break out after a
  // generous threshold.  This prevents AI or UI bugs from hanging the
  // game loop while still allowing legitimate multi-attempt sequences
  // (e.g. repeated direction queries).
  const MAX_IDLE_ITERATIONS = options?.maxIdleIterations ?? 200;
  let idleIterations = 0;

  while (!state.dead && !state.won) {
    // 1. Update FOV
    try {
      updateView(
        state.chunk,
        state.player.grid,
        MAX_VIEW_RADIUS,
        state.player.state.curLight,
        (state.player.timed[TimedEffect.BLIND] ?? 0) > 0,
        state.player.state.seeInfra ?? 0,
      );
    } catch {
      // FOV may fail if feature table is not initialized (e.g. in tests)
      // — continue without FOV update
    }

    // 1b. Update noise/scent heatmaps for monster AI
    updateNoise(state.chunk, state.player.grid);
    updateScent(state.chunk, state.player.grid, state.turn);

    // 2. Emit refresh event
    state.eventBus.emit(GameEventType.REFRESH);

    // 3. Player turn: if player has energy, get input and execute
    if (state.player.energy >= MOVE_ENERGY) {
      const usedEnergy = await processPlayer(state, input);

      // Clean up dead monsters (drops, exp, removal)
      processDeadMonsters(state);

      // Check for death after player's command
      if (state.player.isDead) {
        state.dead = true;
        break;
      }

      // Check for victory
      if (state.player.totalWinner) {
        state.won = true;
        break;
      }

      // If the command didn't use energy, continue to wait for input
      if (!usedEnergy) {
        idleIterations++;
        if (idleIterations >= MAX_IDLE_ITERATIONS) {
          addMessage(state, "Game loop: too many idle iterations, forcing turn advance.");
          break;
        }
        continue;
      }

      // Reset idle counter on successful action
      idleIterations = 0;
    }

    // 4. Process monsters
    processMonsters(state, state.monsters);

    // Clean up monsters killed by other monsters (KILL_BODY etc.)
    processDeadMonsters(state);

    // Check for death after monsters
    if (state.player.isDead) {
      state.dead = true;
      break;
    }

    // 5. Process world effects — C calls process_world() every 10 turns
    if (state.turn % 10 === 0) {
      processWorld(state);
    }

    // Check for death from world effects (poison, starvation, etc.)
    if (state.player.isDead) {
      state.dead = true;
      break;
    }

    // 6. Give the player energy based on speed
    state.player.energy += turnEnergy(state.player.state.speed);

    // 7. Increment turn counter
    state.turn++;

    // 8. Check for level change
    if (checkLevelChange(state)) {
      const newDepth = state.player.depth;
      changeLevel(state, newDepth);
      // state.monsters is updated by changeLevel()

      // Update noise/scent for the new level before any monster processing
      updateNoise(state.chunk, state.player.grid);
      updateScent(state.chunk, state.player.grid, state.turn);

      // Fast-monster pre-processing: on new level, fast monsters
      // (those with energy > player's) act before the player.
      // Port of C's process_monsters(cave, player, player->energy + 1).
      processMonsters(state, state.monsters, state.player.energy + 1);
    }
  }

  // Emit death or victory event
  if (state.dead) {
    state.eventBus.emit(GameEventType.ENTER_DEATH, {
      cause: state.player.diedFrom,
    });
    addMessage(state, `You have died. (${state.player.diedFrom})`, MessageType.URGENT);
  } else if (state.won) {
    state.eventBus.emit(GameEventType.LEAVE_WORLD);
    addMessage(state, "You have won the game!", MessageType.URGENT);
  }

  state.running = false;
}
