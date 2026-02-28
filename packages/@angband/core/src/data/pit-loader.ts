/**
 * @file data/pit-loader.ts
 * @brief Pit/Nest template parser
 *
 * Parses pit.json into PitDefinition objects for use by the room generator.
 *
 * Copyright (c) 2024 Angband-TS Contributors
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import { MonsterRaceFlag, MonsterSpellFlag } from "../types/index.js";

// ── Types ──

/** Pit room type. */
export const enum PitRoomType {
  PIT = 1,
  NEST = 2,
}

/** A pit/nest definition loaded from pit.json. */
export interface PitDefinition {
  /** Pit/nest name (e.g. "Orc", "Dragon"). */
  readonly name: string;
  /** Room type: 1 = pit, 2 = nest. */
  readonly roomType: PitRoomType;
  /** Minimum depth for this pit to appear. */
  readonly minDepth: number;
  /** Maximum depth (0 = unlimited). */
  readonly maxDepth: number;
  /** Object rarity modifier (0 = normal). */
  readonly objRarity: number;
  /** Required monster base name(s) (e.g. ["orc", "troll"]). */
  readonly monBases: readonly string[];
  /** Required monster race flags (all must be present). */
  readonly flagsReq: readonly MonsterRaceFlag[];
  /** Banned monster race flags (none may be present). */
  readonly flagsBan: readonly MonsterRaceFlag[];
  /** Required monster spell flags (all must be present). */
  readonly spellReq: readonly MonsterSpellFlag[];
  /** Banned monster spell flags (none may be present). */
  readonly spellBan: readonly MonsterSpellFlag[];
}

// ── Flag name mappings ──

const RACE_FLAG_MAP: Record<string, MonsterRaceFlag> = {
  UNIQUE: MonsterRaceFlag.UNIQUE,
  MALE: MonsterRaceFlag.MALE,
  FEMALE: MonsterRaceFlag.FEMALE,
  MULTIPLY: MonsterRaceFlag.MULTIPLY,
  ORC: MonsterRaceFlag.ORC,
  TROLL: MonsterRaceFlag.TROLL,
  GIANT: MonsterRaceFlag.GIANT,
  DRAGON: MonsterRaceFlag.DRAGON,
  DEMON: MonsterRaceFlag.DEMON,
  ANIMAL: MonsterRaceFlag.ANIMAL,
  EVIL: MonsterRaceFlag.EVIL,
  UNDEAD: MonsterRaceFlag.UNDEAD,
  NONLIVING: MonsterRaceFlag.NONLIVING,
  METAL: MonsterRaceFlag.METAL,
  HURT_LIGHT: MonsterRaceFlag.HURT_LIGHT,
  HURT_FIRE: MonsterRaceFlag.HURT_FIRE,
  HURT_COLD: MonsterRaceFlag.HURT_COLD,
  KILL_BODY: MonsterRaceFlag.KILL_BODY,
  PASS_WALL: MonsterRaceFlag.PASS_WALL,
  INVISIBLE: MonsterRaceFlag.INVISIBLE,
  COLD_BLOOD: MonsterRaceFlag.COLD_BLOOD,
  SMART: MonsterRaceFlag.SMART,
  POWERFUL: MonsterRaceFlag.POWERFUL,
  NO_FEAR: MonsterRaceFlag.NO_FEAR,
  NO_STUN: MonsterRaceFlag.NO_STUN,
  NO_CONF: MonsterRaceFlag.NO_CONF,
  NO_SLEEP: MonsterRaceFlag.NO_SLEEP,
};

const SPELL_FLAG_MAP: Record<string, MonsterSpellFlag> = {
  BR_ACID: MonsterSpellFlag.BR_ACID,
  BR_ELEC: MonsterSpellFlag.BR_ELEC,
  BR_FIRE: MonsterSpellFlag.BR_FIRE,
  BR_COLD: MonsterSpellFlag.BR_COLD,
  BR_POIS: MonsterSpellFlag.BR_POIS,
  BR_NETH: MonsterSpellFlag.BR_NETH,
  BR_LIGHT: MonsterSpellFlag.BR_LIGHT,
  BR_DARK: MonsterSpellFlag.BR_DARK,
  BR_SOUN: MonsterSpellFlag.BR_SOUN,
  BR_CHAO: MonsterSpellFlag.BR_CHAO,
  BR_DISE: MonsterSpellFlag.BR_DISE,
  BR_NEXU: MonsterSpellFlag.BR_NEXU,
  BR_TIME: MonsterSpellFlag.BR_TIME,
  BR_INER: MonsterSpellFlag.BR_INER,
  BR_GRAV: MonsterSpellFlag.BR_GRAV,
  BR_SHAR: MonsterSpellFlag.BR_SHAR,
  BR_PLAS: MonsterSpellFlag.BR_PLAS,
  BR_WALL: MonsterSpellFlag.BR_WALL,
  BR_MANA: MonsterSpellFlag.BR_MANA,
};

// ── Helper ──

function parseFlags<T>(str: string | undefined, map: Record<string, T>): T[] {
  if (!str) return [];
  return str.split("|").map(s => s.trim()).filter(s => s.length > 0)
    .map(s => map[s]).filter((v): v is T => v !== undefined);
}

// ── Parser ──

/**
 * Parse pit.json into an array of PitDefinition objects.
 */
export function parsePits(raw: unknown[]): PitDefinition[] {
  const defs: PitDefinition[] = [];

  for (const entry of raw) {
    const e = entry as Record<string, unknown>;
    const name = String(e.name ?? "");
    const roomType = Number(e.room ?? 1) as PitRoomType;

    // Parse alloc: "min:max"
    const allocStr = String(e.alloc ?? "0:100");
    const allocParts = allocStr.split(":");
    const minDepth = Number(allocParts[0] ?? 0);
    const maxDepth = Number(allocParts[1] ?? 100);

    const objRarity = Number(e["obj-rarity"] ?? 0);

    // Parse mon-base: string or string[]
    const rawBase = e["mon-base"];
    const monBases: string[] = Array.isArray(rawBase)
      ? rawBase.map(String)
      : rawBase ? [String(rawBase)] : [];

    // Parse flags
    const flagsReq = parseFlags(e["flags-req"] as string | undefined, RACE_FLAG_MAP);
    const flagsBan = parseFlags(e["flags-ban"] as string | undefined, RACE_FLAG_MAP);
    const spellReq = parseFlags(e["spell-req"] as string | undefined, SPELL_FLAG_MAP);
    const spellBan = parseFlags(e["spell-ban"] as string | undefined, SPELL_FLAG_MAP);

    defs.push({
      name, roomType, minDepth, maxDepth, objRarity,
      monBases, flagsReq, flagsBan, spellReq, spellBan,
    });
  }

  return defs;
}
