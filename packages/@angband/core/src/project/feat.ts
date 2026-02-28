/**
 * @file project/feat.ts
 * @brief Projection effects on terrain features
 *
 * Port of project-feat.c — applies elemental damage to terrain,
 * potentially transforming it (e.g. fire melts ice walls, acid destroys doors).
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Loc } from "../z/index.js";
import type { Chunk, FeatureType, FeatureId } from "../types/index.js";
import { Element, Feat, SquareFlag, TerrainFlag } from "../types/index.js";

// ── Result type ──

/** Result of applying an element to terrain at a grid location. */
export interface FeatResult {
  /** Whether the terrain was changed */
  readonly changed: boolean;
  /** The new terrain feature, if changed */
  readonly newFeat?: Feat;
  /** Descriptive message for the player, if any */
  readonly message?: string;
}

/** No change occurred. */
const NO_CHANGE: FeatResult = { changed: false };

// ── Helpers ──

/** Check if terrain has a given flag. */
function featHasFlag(
  table: FeatureType[],
  feat: FeatureId,
  flag: TerrainFlag,
): boolean {
  const f = table[feat];
  if (!f) return false;
  return f.flags.has(flag);
}

/** Check if terrain is a door (any kind). */
function isDoor(table: FeatureType[], feat: FeatureId): boolean {
  return featHasFlag(table, feat, TerrainFlag.DOOR_ANY);
}

/** Check if terrain is permanent (indestructible). */
function isPermanent(table: FeatureType[], feat: FeatureId): boolean {
  return featHasFlag(table, feat, TerrainFlag.PERMANENT);
}

/** Check if terrain is a wall. */
function isWall(table: FeatureType[], feat: FeatureId): boolean {
  return featHasFlag(table, feat, TerrainFlag.WALL);
}

/** Check if terrain is granite. */
function isGranite(table: FeatureType[], feat: FeatureId): boolean {
  return featHasFlag(table, feat, TerrainFlag.GRANITE);
}

/** Check if terrain is magma. */
function isMagma(table: FeatureType[], feat: FeatureId): boolean {
  return featHasFlag(table, feat, TerrainFlag.MAGMA);
}

/** Check if terrain is quartz. */
function isQuartz(table: FeatureType[], feat: FeatureId): boolean {
  return featHasFlag(table, feat, TerrainFlag.QUARTZ);
}

/** Check if terrain is a floor. */
function isFloor(table: FeatureType[], feat: FeatureId): boolean {
  return featHasFlag(table, feat, TerrainFlag.FLOOR);
}

/** Check if terrain is fiery (lava). */
function isFiery(table: FeatureType[], feat: FeatureId): boolean {
  return featHasFlag(table, feat, TerrainFlag.FIERY);
}

// ── Main function ──

/**
 * Apply elemental damage to terrain at a grid location.
 *
 * Different elements have different effects on terrain:
 * - Fire: destroys doors, melts ice features
 * - Cold: creates ice-like effects, no structural changes
 * - Acid: destroys doors
 * - Force / earthquake: destroys walls (non-permanent)
 * - Light/Dark: toggles illumination (cosmetic in this port)
 * - Kill Wall: destroys walls, rubble, doors (non-permanent)
 *
 * @param chunk   The dungeon level
 * @param g       Grid location to affect
 * @param element The element type
 * @param damage  Damage amount (used for threshold checks)
 * @param table   Feature type table
 * @returns Result describing any terrain change
 */
export function projectFeature(
  chunk: Chunk,
  g: Loc,
  element: Element,
  damage: number,
  table: FeatureType[],
): FeatResult {
  if (g.y < 0 || g.y >= chunk.height || g.x < 0 || g.x >= chunk.width) {
    return NO_CHANGE;
  }

  const sq = chunk.squares[g.y]![g.x]!;
  const feat = sq.feat;

  // Permanent features are never affected
  if (isPermanent(table, feat)) {
    return NO_CHANGE;
  }

  switch (element) {
    case Element.FIRE: {
      // Fire destroys doors
      if (isDoor(table, feat)) {
        sq.feat = Feat.BROKEN as FeatureId;
        return { changed: true, newFeat: Feat.BROKEN, message: "The door is consumed by fire!" };
      }
      // Fire on floor (no effect besides cosmetic)
      return NO_CHANGE;
    }

    case Element.COLD: {
      // Cold has limited terrain effects — currently no ice feature to create
      // Could freeze water in an expanded feature set
      return NO_CHANGE;
    }

    case Element.ACID: {
      // Acid destroys doors
      if (isDoor(table, feat)) {
        sq.feat = Feat.BROKEN as FeatureId;
        return { changed: true, newFeat: Feat.BROKEN, message: "The door dissolves!" };
      }
      return NO_CHANGE;
    }

    case Element.ELEC: {
      // Electricity has no terrain effects
      return NO_CHANGE;
    }

    case Element.FORCE: {
      // Force destroys doors
      if (isDoor(table, feat)) {
        sq.feat = Feat.BROKEN as FeatureId;
        return { changed: true, newFeat: Feat.BROKEN, message: "The door shatters!" };
      }
      // Force can destroy rubble
      if (feat === (Feat.RUBBLE as FeatureId)) {
        sq.feat = Feat.FLOOR as FeatureId;
        return { changed: true, newFeat: Feat.FLOOR, message: "The rubble crumbles!" };
      }
      return NO_CHANGE;
    }

    case Element.SOUND:
    case Element.SHARD: {
      // Earthquake-like effects: destroy non-permanent walls with high damage
      if (damage >= 40 && isWall(table, feat) && !isPermanent(table, feat)) {
        if (isGranite(table, feat) || isMagma(table, feat) || isQuartz(table, feat)) {
          sq.feat = Feat.RUBBLE as FeatureId;
          return { changed: true, newFeat: Feat.RUBBLE, message: "The wall crumbles!" };
        }
      }
      // Destroy rubble
      if (feat === (Feat.RUBBLE as FeatureId)) {
        sq.feat = Feat.FLOOR as FeatureId;
        return { changed: true, newFeat: Feat.FLOOR, message: "The rubble is blown apart!" };
      }
      // Destroy doors
      if (isDoor(table, feat)) {
        sq.feat = Feat.BROKEN as FeatureId;
        return { changed: true, newFeat: Feat.BROKEN, message: "The door is destroyed!" };
      }
      return NO_CHANGE;
    }

    case Element.PLASMA: {
      // Plasma destroys doors
      if (isDoor(table, feat)) {
        sq.feat = Feat.BROKEN as FeatureId;
        return { changed: true, newFeat: Feat.BROKEN, message: "The door is vaporized!" };
      }
      return NO_CHANGE;
    }

    case Element.METEOR: {
      // Meteor destroys rubble and doors
      if (feat === (Feat.RUBBLE as FeatureId)) {
        sq.feat = Feat.FLOOR as FeatureId;
        return { changed: true, newFeat: Feat.FLOOR, message: "The rubble is pulverized!" };
      }
      if (isDoor(table, feat)) {
        sq.feat = Feat.BROKEN as FeatureId;
        return { changed: true, newFeat: Feat.BROKEN, message: "The door is obliterated!" };
      }
      return NO_CHANGE;
    }

    case Element.GRAVITY: {
      // Gravity can collapse walls with enough damage
      if (damage >= 60 && feat === (Feat.RUBBLE as FeatureId)) {
        sq.feat = Feat.FLOOR as FeatureId;
        return { changed: true, newFeat: Feat.FLOOR, message: "The rubble collapses!" };
      }
      return NO_CHANGE;
    }

    case Element.MANA: {
      // Pure mana destroys doors
      if (isDoor(table, feat)) {
        sq.feat = Feat.BROKEN as FeatureId;
        return { changed: true, newFeat: Feat.BROKEN, message: "The door is blasted open!" };
      }
      // Mana can destroy walls
      if (isWall(table, feat) && !isPermanent(table, feat)) {
        sq.feat = Feat.FLOOR as FeatureId;
        return { changed: true, newFeat: Feat.FLOOR, message: "The wall turns into mud!" };
      }
      return NO_CHANGE;
    }

    case Element.LIGHT: {
      // Light illuminates — toggle glow flag on
      sq.info.on(SquareFlag.GLOW);
      return { changed: true, message: "The area is lit up." };
    }

    case Element.DARK: {
      // Darkness extinguishes — toggle glow flag off
      sq.info.off(SquareFlag.GLOW);
      return { changed: true, message: "Darkness surrounds the area." };
    }

    default:
      return NO_CHANGE;
  }
}
