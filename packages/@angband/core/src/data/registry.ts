/**
 * @file data/registry.ts
 * @brief Central game data registry.
 *
 * Collects all parsed game data tables into a single GameData structure,
 * mirroring the role of the C `init_module` array and the global data
 * pointers (blow_methods, blow_effects, kb_info, etc.).
 *
 * Copyright (c) 2011 Elly <elly+angband@leptoquark.net>
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import {
  type BlowMethodDef,
  type BlowEffectDef,
  type ObjectBaseDef,
  loadBlowMethods,
  loadBlowEffects,
  loadObjectBases,
} from "./loader.js";

// ── GameData interface ──

/**
 * Central registry holding all loaded game data tables.
 *
 * Fields are populated by calling `loadAllGameData()` with a map of
 * filename-to-content pairs.  Start with the three data types we
 * currently have loaders for; additional tables will be added as
 * loaders are implemented.
 */
export interface GameData {
  blowMethods: BlowMethodDef[];
  blowEffects: BlowEffectDef[];
  objectBases: ObjectBaseDef[];
}

/**
 * Create an empty game data registry with all tables initialized
 * to empty arrays.
 */
export function createGameData(): GameData {
  return {
    blowMethods: [],
    blowEffects: [],
    objectBases: [],
  };
}

// ── File-to-loader mapping ──

/**
 * Maps a gamedata filename (without path, e.g. "blow_methods.txt")
 * to a function that parses the file contents and populates the
 * corresponding field on a GameData instance.
 */
type LoaderEntry = (data: GameData, content: string) => void;

const LOADERS: Record<string, LoaderEntry> = {
  "blow_methods.txt": (data, content) => {
    data.blowMethods = loadBlowMethods(content);
  },
  "blow_effects.txt": (data, content) => {
    data.blowEffects = loadBlowEffects(content);
  },
  "object_base.txt": (data, content) => {
    data.objectBases = loadObjectBases(content);
  },
};

/**
 * Load all game data from a map of filename -> file content strings.
 *
 * Only files with a registered loader are processed; unknown files
 * are silently ignored (future loaders will pick them up).
 *
 * The map keys should be bare filenames matching the names used in
 * the LOADERS table (e.g. `"blow_methods.txt"`).
 *
 * @param files Map of filename to raw text content
 * @returns Fully populated GameData registry
 */
export function loadAllGameData(files: Map<string, string>): GameData {
  const data = createGameData();

  for (const [filename, content] of files) {
    const loader = LOADERS[filename];
    if (loader) {
      loader(data, content);
    }
  }

  return data;
}
