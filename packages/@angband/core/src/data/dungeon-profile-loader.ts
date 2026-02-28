/**
 * @file data/dungeon-profile-loader.ts
 * @brief Dungeon profile parser
 *
 * Parses dungeon_profile.json into DungeonProfile objects that drive
 * level generation parameters and room type selection.
 *
 * Copyright (c) 2024 Angband-TS Contributors
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

// ── Types ──

/** A room type entry within a dungeon profile. */
export interface ProfileRoomEntry {
  /** Room type name (e.g. "simple room", "monster pit"). */
  readonly name: string;
  /** Sub-type index (for "room template" variants). */
  readonly subType: number;
  /** Minimum height of the room. */
  readonly minHeight: number;
  /** Maximum height of the room. */
  readonly maxHeight: number;
  /** Room level rating. */
  readonly rating: number;
  /** Aspect ratio flag. */
  readonly aspect: number;
  /** Number of sub-rooms / special parameter. */
  readonly special: number;
  /** Cumulative weight (0-100). Higher = more likely to be selected. */
  readonly cumulativeWeight: number;
}

/** A dungeon generation profile. */
export interface DungeonProfile {
  /** Profile name. */
  readonly name: string;
  /** Allocation priority (higher = more likely to be selected for a level). */
  readonly alloc: number;
  /** Minimum dungeon depth for this profile (0 = any). */
  readonly minLevel: number;
  /** Room attempts parameter. */
  readonly roomAttempts: number;
  /** Level width. */
  readonly width: number;
  /** Level height. */
  readonly height: number;
  /** Room type entries with cumulative weights. */
  readonly rooms: readonly ProfileRoomEntry[];
}

// ── Parser ──

/**
 * Parse a single room entry string.
 *
 * Format: "name:subType:minHeight:maxHeight:rating:aspect:special:cumulativeWeight"
 * Example: "simple room:0:11:33:1:0:0:100"
 */
function parseRoomEntry(str: string): ProfileRoomEntry | null {
  const parts = str.split(":");
  if (parts.length < 8) return null;

  return {
    name: parts[0]!.trim(),
    subType: Number(parts[1] ?? 0),
    minHeight: Number(parts[2] ?? 0),
    maxHeight: Number(parts[3] ?? 0),
    rating: Number(parts[4] ?? 0),
    aspect: Number(parts[5] ?? 0),
    special: Number(parts[6] ?? 0),
    cumulativeWeight: Number(parts[7] ?? 0),
  };
}

/**
 * Parse dungeon_profile.json into an array of DungeonProfile objects.
 */
export function parseDungeonProfiles(raw: unknown[]): DungeonProfile[] {
  const profiles: DungeonProfile[] = [];

  for (const entry of raw) {
    const e = entry as Record<string, unknown>;
    const name = String(e.name ?? "");
    const alloc = Number(e.alloc ?? 0);
    const minLevel = Number(e["min-level"] ?? 0);

    // Parse params: "roomAttempts:X:width:height" or "minRoomSize:roomAttempts:width:height"
    const paramsStr = String(e.params ?? "11:50:198:66");
    const pp = paramsStr.split(":");
    const roomAttempts = Number(pp[1] ?? 50);
    const width = Number(pp[2] ?? 198);
    // height: the 4th param is often just a multiplier
    const heightParam = Number(pp[3] ?? 66);
    // Standard Angband uses 66 rows, use that as default
    const height = heightParam > 2 ? heightParam : 66;

    // Parse room entries
    const rawRooms = (e.room ?? []) as string[];
    const rooms: ProfileRoomEntry[] = [];
    for (const rs of rawRooms) {
      const re = parseRoomEntry(rs);
      if (re) rooms.push(re);
    }

    // Skip profiles with negative allocation (disabled)
    if (alloc < 0) continue;

    profiles.push({ name, alloc, minLevel, roomAttempts, width, height, rooms });
  }

  return profiles;
}

/**
 * Select a dungeon profile for the given depth.
 *
 * Uses weighted random selection based on allocation values.
 * Profiles with higher alloc values are more likely to be selected.
 *
 * @param profiles Available profiles
 * @param depth    Current dungeon depth
 * @param rng      Random number generator (uses randint0)
 * @returns Selected profile, or null if none available
 */
export function selectProfile(
  profiles: readonly DungeonProfile[],
  depth: number,
  rng: { randint0(n: number): number },
): DungeonProfile | null {
  // Filter eligible profiles
  const eligible = profiles.filter(
    (p) => p.alloc > 0 && depth >= p.minLevel,
  );
  if (eligible.length === 0) return null;

  // Weighted random selection
  const totalWeight = eligible.reduce((sum, p) => sum + p.alloc, 0);
  let roll = rng.randint0(totalWeight);
  for (const p of eligible) {
    roll -= p.alloc;
    if (roll < 0) return p;
  }

  // Fallback (shouldn't happen)
  return eligible[eligible.length - 1]!;
}

/**
 * Pick a room type name from a profile's room entries using the
 * cumulative weight system.
 *
 * @param rooms The profile's room entries
 * @param roll  Random value 0-99
 * @returns The room type name to generate
 */
export function pickRoomType(
  rooms: readonly ProfileRoomEntry[],
  roll: number,
): string {
  for (const entry of rooms) {
    if (roll < entry.cumulativeWeight) {
      return entry.name;
    }
  }
  // Fallback to last entry
  return rooms.length > 0 ? rooms[rooms.length - 1]!.name : "simple room";
}
