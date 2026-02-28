/**
 * @file monster/lore.ts
 * @brief Monster knowledge / lore system
 *
 * Port of mon-lore.c — tracks player's accumulated knowledge about
 * monster races through observation (sighting, combat, kills).
 *
 * Copyright (c) 1997-2007 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import { BitFlag } from "../z/index.js";
import type {
  MonsterRace,
  MonsterRaceFlag,
  MonsterLore,
  Monster,
  MonsterBlow,
} from "../types/index.js";
import {
  MonsterRaceFlag as RF,
} from "../types/index.js";

// ── Lore creation ──

/**
 * Create an empty lore entry for a monster race.
 *
 * Initialises all counters to zero and all knowledge flags to empty.
 * The blow array mirrors the race's blows structure with timesSeen = 0.
 */
export function createLore(race: MonsterRace): MonsterLore {
  // Create blank blow knowledge entries matching the race's blow count
  const blows: MonsterBlow[] = race.blows.map((blow) => ({
    method: blow.method,
    effect: blow.effect,
    dice: { ...blow.dice },
    timesSeen: 0,
  }));

  const blowKnown: boolean[] = new Array(race.blows.length).fill(false);

  return {
    ridx: race.ridx,

    sights: 0,
    deaths: 0,

    pkills: 0,
    thefts: 0,
    tkills: 0,

    wake: 0,
    ignore: 0,

    dropGold: 0,
    dropItem: 0,

    castInnate: 0,
    castSpell: 0,

    blows,
    flags: new BitFlag(RF.RF_MAX),
    spellFlags: new BitFlag(128), // large enough for MonsterSpellFlag.RSF_MAX

    drops: [],
    friends: [],
    friendsBase: [],
    mimicKinds: [],

    allKnown: false,
    blowKnown,
    armourKnown: false,
    dropKnown: false,
    sleepKnown: false,
    spellFreqKnown: false,
    innateFreqKnown: false,
  };
}

// ── Lore update functions ──

/**
 * Update lore when the player sees a monster.
 *
 * Increments the sighting counter. After enough sightings, various
 * obvious flags become known (sex, unique status, etc.).
 *
 * Port of the sighting-related updates from mon-lore.c.
 */
export function updateLoreOnSight(lore: MonsterLore, mon: Monster): void {
  // Increment sighting count (cap at a reasonable maximum)
  if (lore.sights < 32767) {
    lore.sights++;
  }

  const race = mon.originalRace ?? mon.race;

  // After first sighting, learn obvious flags
  if (lore.sights === 1) {
    // Unique status is always obvious
    if (race.flags.has(RF.UNIQUE)) {
      lore.flags.on(RF.UNIQUE);
    }

    // Sex is obvious
    if (race.flags.has(RF.MALE)) {
      lore.flags.on(RF.MALE);
    }
    if (race.flags.has(RF.FEMALE)) {
      lore.flags.on(RF.FEMALE);
    }
  }

  // After several sightings, learn more
  if (lore.sights >= 3) {
    // Force depth becomes obvious after a few encounters
    if (race.flags.has(RF.FORCE_DEPTH)) {
      lore.flags.on(RF.FORCE_DEPTH);
    }
  }

  // Speed and some behavioral traits become known with more sightings
  if (lore.sights >= 5) {
    if (race.flags.has(RF.NEVER_MOVE)) {
      lore.flags.on(RF.NEVER_MOVE);
    }
    if (race.flags.has(RF.NEVER_BLOW)) {
      lore.flags.on(RF.NEVER_BLOW);
    }
  }

  // Racial type flags are learned over time
  if (lore.sights >= 10) {
    const racialFlags: RF[] = [
      RF.ORC, RF.TROLL, RF.GIANT, RF.DRAGON, RF.DEMON,
      RF.ANIMAL, RF.EVIL, RF.UNDEAD, RF.NONLIVING, RF.METAL,
    ];
    for (const flag of racialFlags) {
      if (race.flags.has(flag)) {
        lore.flags.on(flag);
      }
    }
  }
}

/**
 * Update lore when the player kills a monster.
 *
 * Increments kill counters. After enough kills, drop and sleep info
 * become known.
 *
 * Port of the kill-related updates from mon-lore.c.
 */
export function updateLoreOnKill(lore: MonsterLore, mon: Monster): void {
  // Increment kill counts
  if (lore.pkills < 32767) {
    lore.pkills++;
  }
  if (lore.tkills < 32767) {
    lore.tkills++;
  }

  const race = mon.originalRace ?? mon.race;

  // After first kill, learn some vulnerability flags
  if (lore.pkills === 1) {
    if (race.flags.has(RF.HURT_LIGHT)) {
      lore.flags.on(RF.HURT_LIGHT);
    }
    if (race.flags.has(RF.HURT_ROCK)) {
      lore.flags.on(RF.HURT_ROCK);
    }
  }

  // After several kills, learn drop characteristics
  if (lore.tkills >= 3) {
    lore.dropKnown = true;
  }

  // After many kills, learn sleep
  if (lore.tkills >= 5) {
    lore.sleepKnown = true;
  }

  // After lots of kills, learn AC
  if (lore.tkills >= 10) {
    lore.armourKnown = true;
  }

  // Check if everything is now known
  checkAllKnown(lore, race);
}

/**
 * Update lore when the player observes a monster's melee attack.
 *
 * Tracks the number of times each blow slot has been observed.
 * After enough observations, the blow is considered fully known.
 *
 * @param lore      - The lore entry to update
 * @param blowIndex - Index of the blow in the race's blows array
 */
export function updateLoreOnAttack(
  lore: MonsterLore,
  blowIndex: number,
): void {
  const blow = lore.blows[blowIndex];
  if (!blow) return;

  // Increment observation count (cap at 255)
  if (blow.timesSeen < 255) {
    blow.timesSeen++;
  }

  // After 10 observations, the blow is considered known
  if (blow.timesSeen >= 10) {
    if (blowIndex < lore.blowKnown.length) {
      lore.blowKnown[blowIndex] = true;
    }
  }
}

// ── Lore queries ──

/**
 * Check if a particular race flag is known to the player.
 *
 * A flag is "known" if the corresponding bit in the lore's flags
 * bitfield is set (meaning the player has learned about it).
 */
export function loreFlagKnown(
  lore: MonsterLore,
  flag: MonsterRaceFlag,
): boolean {
  return lore.flags.has(flag);
}

// ── Internal helpers ──

/**
 * Check if everything about a race is now known.
 */
function checkAllKnown(lore: MonsterLore, race: MonsterRace): void {
  // Simple heuristic: if we know AC, drops, sleep, spell freq, and all blows
  if (!lore.armourKnown) return;
  if (!lore.dropKnown) return;
  if (!lore.sleepKnown) return;

  for (let i = 0; i < lore.blowKnown.length; i++) {
    if (!lore.blowKnown[i]) return;
  }

  lore.allKnown = true;
}
