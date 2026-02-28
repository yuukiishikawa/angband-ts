/**
 * @file cave/features.ts
 * @brief Default feature info table builder
 *
 * Builds the FeatureType[] table mapping Feat enum values to their
 * terrain flags. Used by the game runtime and tests alike.
 *
 * In a full data-driven setup this would be loaded from terrain.txt;
 * for now the table is hardcoded to match the C source definitions.
 */

import { BitFlag } from "../z/index.js";
import type { FeatureType, FeatureId } from "../types/index.js";
import { Feat, TerrainFlag } from "../types/index.js";

/**
 * Build the default feature info table for the game.
 */
export function buildDefaultFeatureInfo(): FeatureType[] {
  const features: FeatureType[] = [];

  function makeFeat(
    fidx: number,
    name: string,
    flags: TerrainFlag[],
  ): FeatureType {
    const bf = new BitFlag(TerrainFlag.MAX);
    for (const f of flags) {
      bf.on(f);
    }
    return {
      name,
      desc: "",
      fidx: fidx as FeatureId,
      mimic: null,
      priority: 0,
      shopnum: 0,
      dig: 0,
      flags: bf,
      dAttr: 0,
      dChar: ".",
      walkMsg: "",
      runMsg: "",
      hurtMsg: "",
      dieMsg: "",
      confusedMsg: "",
      lookPrefix: "",
      lookInPreposition: "",
      resistFlag: -1,
    };
  }

  features[Feat.NONE] = makeFeat(Feat.NONE, "nothing", []);

  features[Feat.FLOOR] = makeFeat(Feat.FLOOR, "open floor", [
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE,
    TerrainFlag.EASY, TerrainFlag.TRAP, TerrainFlag.OBJECT,
    TerrainFlag.TORCH, TerrainFlag.FLOOR,
  ]);

  features[Feat.CLOSED] = makeFeat(Feat.CLOSED, "closed door", [
    TerrainFlag.DOOR_ANY, TerrainFlag.DOOR_CLOSED,
    TerrainFlag.INTERESTING,
  ]);

  features[Feat.OPEN] = makeFeat(Feat.OPEN, "open door", [
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE,
    TerrainFlag.EASY, TerrainFlag.DOOR_ANY, TerrainFlag.CLOSABLE,
    TerrainFlag.OBJECT, TerrainFlag.INTERESTING,
  ]);

  features[Feat.BROKEN] = makeFeat(Feat.BROKEN, "broken door", [
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE,
    TerrainFlag.EASY, TerrainFlag.DOOR_ANY, TerrainFlag.OBJECT,
    TerrainFlag.INTERESTING,
  ]);

  features[Feat.LESS] = makeFeat(Feat.LESS, "up staircase", [
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE,
    TerrainFlag.EASY, TerrainFlag.STAIR, TerrainFlag.UPSTAIR,
    TerrainFlag.INTERESTING,
  ]);

  features[Feat.MORE] = makeFeat(Feat.MORE, "down staircase", [
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE,
    TerrainFlag.EASY, TerrainFlag.STAIR, TerrainFlag.DOWNSTAIR,
    TerrainFlag.INTERESTING,
  ]);

  for (let i = Feat.STORE_GENERAL; i <= Feat.HOME; i++) {
    features[i] = makeFeat(i, `store ${i}`, [
      TerrainFlag.SHOP, TerrainFlag.PASSABLE, TerrainFlag.INTERESTING,
    ]);
  }

  features[Feat.SECRET] = makeFeat(Feat.SECRET, "secret door", [
    TerrainFlag.ROCK, TerrainFlag.DOOR_ANY, TerrainFlag.GRANITE,
  ]);

  features[Feat.RUBBLE] = makeFeat(Feat.RUBBLE, "pile of rubble", [
    TerrainFlag.ROCK, TerrainFlag.NO_SCENT, TerrainFlag.NO_FLOW,
    TerrainFlag.INTERESTING, TerrainFlag.OBJECT,
  ]);

  features[Feat.MAGMA] = makeFeat(Feat.MAGMA, "magma vein", [
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.NO_SCENT,
    TerrainFlag.NO_FLOW, TerrainFlag.MAGMA,
  ]);

  features[Feat.QUARTZ] = makeFeat(Feat.QUARTZ, "quartz vein", [
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.NO_SCENT,
    TerrainFlag.NO_FLOW, TerrainFlag.QUARTZ,
  ]);

  features[Feat.MAGMA_K] = makeFeat(Feat.MAGMA_K, "magma vein with treasure", [
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.NO_SCENT,
    TerrainFlag.NO_FLOW, TerrainFlag.MAGMA, TerrainFlag.GOLD,
    TerrainFlag.INTERESTING,
  ]);

  features[Feat.QUARTZ_K] = makeFeat(Feat.QUARTZ_K, "quartz vein with treasure", [
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.NO_SCENT,
    TerrainFlag.NO_FLOW, TerrainFlag.QUARTZ, TerrainFlag.GOLD,
    TerrainFlag.INTERESTING,
  ]);

  features[Feat.GRANITE] = makeFeat(Feat.GRANITE, "granite wall", [
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.NO_SCENT,
    TerrainFlag.NO_FLOW, TerrainFlag.GRANITE,
  ]);

  features[Feat.PERM] = makeFeat(Feat.PERM, "permanent wall", [
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.PERMANENT,
    TerrainFlag.NO_SCENT, TerrainFlag.NO_FLOW,
  ]);

  features[Feat.LAVA] = makeFeat(Feat.LAVA, "lava", [
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE,
    TerrainFlag.NO_SCENT, TerrainFlag.FIERY, TerrainFlag.BRIGHT,
  ]);

  features[Feat.PASS_RUBBLE] = makeFeat(Feat.PASS_RUBBLE, "pass rubble", [
    TerrainFlag.ROCK, TerrainFlag.PASSABLE, TerrainFlag.OBJECT,
    TerrainFlag.INTERESTING,
  ]);

  return features;
}
