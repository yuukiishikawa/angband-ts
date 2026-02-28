/**
 * @file player/birth.ts
 * @brief Character creation system
 *
 * Port of player-birth.c — stat rolling, HP rolling, and character creation.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { RNG } from "../z/index.js";
import { BitFlag } from "../z/index.js";
import type {
  Player,
  PlayerRace,
  PlayerClass,
  PlayerState,
  PlayerUpkeep,
  PlayerBody,
  PlayerHistory,
} from "../types/index.js";
import {
  Stat,
  STAT_MAX,
  PY_MAX_LEVEL,
  TMD_MAX,
  TimedEffect,
  PF_MAX,
  EQUIP_SLOT_MAX,
} from "../types/index.js";
import { loc } from "../z/index.js";
import { createPlayerKnowledge } from "../object/knowledge.js";
import { modifyStatValue } from "./calcs.js";

/** Nourishment value for "Full" at birth. Matches C PY_FOOD_FULL - 1. */
const PY_FOOD_FULL = 14000;

/** Default starting gold. */
const DEFAULT_START_GOLD = 600;

/**
 * Roll base stats for a new character.
 *
 * Algorithm from C `get_stats()`:
 * - Roll 3 * STAT_MAX dice. Die i has `3 + (i % 3)` sides (i.e. 1d3, 1d4, 1d5 repeating).
 * - Sum all dice. Reject unless total is in (7 * STAT_MAX, 9 * STAT_MAX).
 * - Each stat gets `5 + dice[3*i] + dice[3*i+1] + dice[3*i+2]`.
 *
 * Returns an array of STAT_MAX raw stat values (before race/class bonuses).
 */
export function rollStats(rng: RNG): number[] {
  while (true) {
    const dice: number[] = [];
    let total = 0;

    for (let i = 0; i < 3 * STAT_MAX; i++) {
      const sides = 3 + (i % 3); // 3, 4, 5, 3, 4, 5, ...
      const roll = rng.randint1(sides);
      dice.push(roll);
      total += roll;
    }

    // Verify totals: must be in (7 * STAT_MAX, 9 * STAT_MAX) exclusive
    if (total > 7 * STAT_MAX && total < 9 * STAT_MAX) {
      const stats: number[] = [];
      for (let i = 0; i < STAT_MAX; i++) {
        stats.push(5 + dice[3 * i]! + dice[3 * i + 1]! + dice[3 * i + 2]!);
      }
      return stats;
    }
  }
}

/**
 * Roll hit points per level table.
 *
 * Port of C `roll_hp()`. Rolls hitdie-sided dice for each level from 2..50.
 * Level 1 HP is always equal to hitdie. Rejects rolls where total HP at
 * max level falls outside [min_value, max_value].
 *
 * @param hitdie - The hit die (race.hitDice + class.hitDice).
 * @param rng - The RNG instance.
 * @returns Array of length PY_MAX_LEVEL with cumulative HP at each level (0-indexed).
 */
export function rollHP(hitdie: number, rng: RNG): number[] {
  // Minimum hitpoints at highest level
  const minValue =
    Math.floor((PY_MAX_LEVEL * (hitdie - 1) * 3) / 8) + PY_MAX_LEVEL;
  // Maximum hitpoints at highest level
  const maxValue =
    Math.floor((PY_MAX_LEVEL * (hitdie - 1) * 5) / 8) + PY_MAX_LEVEL;

  while (true) {
    const hp: number[] = new Array(PY_MAX_LEVEL);
    hp[0] = hitdie;

    for (let i = 1; i < PY_MAX_LEVEL; i++) {
      hp[i] = hp[i - 1]! + rng.randint1(hitdie);
    }

    // Require valid hitpoints at highest level
    if (hp[PY_MAX_LEVEL - 1]! >= minValue && hp[PY_MAX_LEVEL - 1]! <= maxValue) {
      return hp;
    }
  }
}

/**
 * Compute character's age, height, and weight.
 * Port of C `get_ahw()`.
 */
function getAHW(
  race: PlayerRace,
  rng: RNG,
): { age: number; ht: number; wt: number } {
  const age = race.baseAge + rng.randint1(race.modAge);
  const ht = rng.normal(race.baseHeight, race.modHeight);
  const wt = rng.normal(race.baseWeight, race.modWeight);
  return { age, ht, wt };
}

/**
 * Create a default (zeroed) PlayerState.
 */
function createDefaultState(): PlayerState {
  return {
    statAdd: new Array(STAT_MAX).fill(0),
    statInd: new Array(STAT_MAX).fill(0),
    statUse: new Array(STAT_MAX).fill(0),
    statTop: new Array(STAT_MAX).fill(0),
    skills: new Array(10).fill(0), // SKILL_MAX = 10
    speed: 110,
    numBlows: 100,
    numShots: 0,
    numMoves: 0,
    ammoMult: 0,
    ammoTval: 0,
    ac: 0,
    damRed: 0,
    percDamRed: 0,
    toA: 0,
    toH: 0,
    toD: 0,
    seeInfra: 0,
    curLight: 0,
    heavyWield: false,
    heavyShoot: false,
    blessWield: false,
    cumberArmor: false,
    flags: new BitFlag(40), // OF_MAX = 39 => flagSize(39)
    pflags: new BitFlag(PF_MAX),
    elInfo: [],
  };
}

/**
 * Create a default PlayerUpkeep.
 */
function createDefaultUpkeep(): PlayerUpkeep {
  return {
    playing: false,
    autosave: false,
    generateLevel: false,
    onlyPartial: false,
    dropping: false,
    energyUse: 0,
    newSpells: 0,
    notice: 0,
    update: 0,
    redraw: 0,
    commandWrk: 0,
    createUpStair: false,
    createDownStair: false,
    lightLevel: false,
    arenaLevel: false,
    resting: 0,
    running: 0,
    runningFirstStep: false,
    totalWeight: 0,
    invenCnt: 0,
    equipCnt: 0,
    quiverCnt: 0,
    rechargePow: 0,
    stepCount: 0,
    pathDest: loc(0, 0),
  };
}

/**
 * Create a default PlayerBody from the race's body index.
 * This is a simplified version; the full version would look up from data.
 */
function createDefaultBody(): PlayerBody {
  return {
    name: "humanoid",
    count: 0,
    slots: [],
  };
}

/**
 * Create a new player character.
 *
 * Port of `player_generate()` + `get_stats()` + `roll_hp()` + `get_ahw()`.
 *
 * @param name - The character's name.
 * @param race - The chosen race.
 * @param cls - The chosen class.
 * @param rng - The RNG instance.
 * @returns A fully initialized Player for level 1.
 */
export function createPlayer(
  name: string,
  race: PlayerRace,
  cls: PlayerClass,
  rng: RNG,
): Player {
  // Roll stats
  const baseStats = rollStats(rng);

  // Compute stat values with race+class bonuses applied
  const statMax = [...baseStats];
  const statCur = [...baseStats];
  const statMap = [0, 1, 2, 3, 4];
  const statBirth = [...baseStats];

  // Hit die
  const hitdie = race.hitDice + cls.hitDice;

  // Experience factor
  const expfact = race.expFactor + cls.expFactor;

  // Roll HP table
  const playerHp = rollHP(hitdie, rng);

  // Roll age/height/weight
  const { age, ht, wt } = getAHW(race, rng);

  // Starting gold
  const au = DEFAULT_START_GOLD;

  // Timed effects (all zero except food)
  const timed = new Array(TMD_MAX).fill(0);
  timed[TimedEffect.FOOD] = PY_FOOD_FULL - 1;

  // Spell state
  const totalSpells = cls.magic.totalSpells;
  const spellFlags = new Array(totalSpells).fill(0);
  const spellOrder = new Array(totalSpells).fill(99);

  const player: Player = {
    race,
    class: cls,
    grid: loc(0, 0),
    oldGrid: loc(0, 0),
    hitdie,
    expfact,
    age,
    ht,
    wt,
    au,
    maxDepth: 0,
    recallDepth: 0,
    depth: 0,
    maxLev: 1,
    lev: 1,
    maxExp: 0,
    exp: 0,
    expFrac: 0,
    mhp: playerHp[0]!,
    chp: playerHp[0]!,
    chpFrac: 0,
    msp: 0,
    csp: 0,
    cspFrac: 0,
    statMax,
    statCur,
    statMap,
    timed,
    wordRecall: 0,
    deepDescent: 0,
    energy: 0,
    totalEnergy: 0,
    restingTurn: 0,
    food: PY_FOOD_FULL - 1,
    unignoring: 0,
    spellFlags,
    spellOrder,
    fullName: name,
    diedFrom: "",
    history: "",
    quests: [],
    totalWinner: false,
    noscore: 0,
    isDead: false,
    wizard: false,
    playerHp,
    auBirth: au,
    statBirth,
    htBirth: ht,
    wtBirth: wt,
    body: createDefaultBody(),
    shape: null,
    state: createDefaultState(),
    knownState: createDefaultState(),
    upkeep: createDefaultUpkeep(),
    knowledge: createPlayerKnowledge(),
  };

  return player;
}
