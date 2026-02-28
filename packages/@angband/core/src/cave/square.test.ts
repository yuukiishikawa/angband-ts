/**
 * Tests for cave/square.ts — Square query and manipulation functions.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loc } from "../z/index.js";
import { BitFlag } from "../z/index.js";
import { createChunk, chunkGetSquare } from "./chunk.js";
import {
  setFeatureInfo,
  squareIsFloor,
  squareIsWall,
  squareIsGranite,
  squareIsClosedDoor,
  squareIsOpenDoor,
  squareIsOpen,
  squareIsPassable,
  squareIsProjectable,
  squareAllowsLOS,
  squareIsMark,
  squareIsGlow,
  squareIsVault,
  squareIsRoom,
  squareIsSeen,
  squareIsView,
  squareIsFeel,
  squareSetMark,
  squareClearMark,
  squareSetGlow,
  squareClearGlow,
  squareSetVault,
  squareSetRoom,
  squareSetSeen,
  squareSetView,
  squareSetFeel,
  squareClearFeel,
  squareSetFeat,
  squareHasMonster,
  squareHasObject,
} from "./square.js";
import type { FeatureType, FeatureId, MonsterId, ObjectId } from "../types/index.js";
import { Feat, TerrainFlag } from "../types/index.js";

// ── Test feature info table ──

/**
 * Build a minimal feature info table for testing.
 * This provides the built-in features with their terrain flags set
 * to match the C source's terrain.txt definitions.
 */
function buildTestFeatureInfo(): FeatureType[] {
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

  // FEAT_NONE (0) — empty/unknown
  features[Feat.NONE] = makeFeat(Feat.NONE, "nothing", []);

  // FEAT_FLOOR (1) — open floor
  features[Feat.FLOOR] = makeFeat(Feat.FLOOR, "open floor", [
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE,
    TerrainFlag.EASY, TerrainFlag.TRAP, TerrainFlag.OBJECT,
    TerrainFlag.TORCH, TerrainFlag.FLOOR,
  ]);

  // FEAT_CLOSED (2) — closed door
  features[Feat.CLOSED] = makeFeat(Feat.CLOSED, "closed door", [
    TerrainFlag.DOOR_ANY, TerrainFlag.DOOR_CLOSED,
    TerrainFlag.INTERESTING,
  ]);

  // FEAT_OPEN (3) — open door
  features[Feat.OPEN] = makeFeat(Feat.OPEN, "open door", [
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE,
    TerrainFlag.EASY, TerrainFlag.DOOR_ANY, TerrainFlag.CLOSABLE,
    TerrainFlag.OBJECT, TerrainFlag.INTERESTING,
  ]);

  // FEAT_BROKEN (4) — broken door
  features[Feat.BROKEN] = makeFeat(Feat.BROKEN, "broken door", [
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE,
    TerrainFlag.EASY, TerrainFlag.DOOR_ANY, TerrainFlag.OBJECT,
    TerrainFlag.INTERESTING,
  ]);

  // FEAT_LESS (5) — up staircase
  features[Feat.LESS] = makeFeat(Feat.LESS, "up staircase", [
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE,
    TerrainFlag.EASY, TerrainFlag.STAIR, TerrainFlag.UPSTAIR,
    TerrainFlag.INTERESTING,
  ]);

  // FEAT_MORE (6) — down staircase
  features[Feat.MORE] = makeFeat(Feat.MORE, "down staircase", [
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE,
    TerrainFlag.EASY, TerrainFlag.STAIR, TerrainFlag.DOWNSTAIR,
    TerrainFlag.INTERESTING,
  ]);

  // Fill in store entries (7-14) as simple passable
  for (let i = Feat.STORE_GENERAL; i <= Feat.HOME; i++) {
    features[i] = makeFeat(i, `store ${i}`, [
      TerrainFlag.SHOP, TerrainFlag.PASSABLE, TerrainFlag.INTERESTING,
    ]);
  }

  // FEAT_SECRET (15) — secret door (looks like granite)
  features[Feat.SECRET] = makeFeat(Feat.SECRET, "secret door", [
    TerrainFlag.ROCK, TerrainFlag.DOOR_ANY, TerrainFlag.GRANITE,
  ]);

  // FEAT_RUBBLE (16)
  features[Feat.RUBBLE] = makeFeat(Feat.RUBBLE, "pile of rubble", [
    TerrainFlag.ROCK, TerrainFlag.NO_SCENT, TerrainFlag.NO_FLOW,
    TerrainFlag.INTERESTING, TerrainFlag.OBJECT,
  ]);

  // FEAT_MAGMA (17)
  features[Feat.MAGMA] = makeFeat(Feat.MAGMA, "magma vein", [
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.NO_SCENT,
    TerrainFlag.NO_FLOW, TerrainFlag.MAGMA,
  ]);

  // FEAT_QUARTZ (18)
  features[Feat.QUARTZ] = makeFeat(Feat.QUARTZ, "quartz vein", [
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.NO_SCENT,
    TerrainFlag.NO_FLOW, TerrainFlag.QUARTZ,
  ]);

  // FEAT_MAGMA_K (19)
  features[Feat.MAGMA_K] = makeFeat(Feat.MAGMA_K, "magma vein with treasure", [
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.NO_SCENT,
    TerrainFlag.NO_FLOW, TerrainFlag.MAGMA, TerrainFlag.GOLD,
    TerrainFlag.INTERESTING,
  ]);

  // FEAT_QUARTZ_K (20)
  features[Feat.QUARTZ_K] = makeFeat(Feat.QUARTZ_K, "quartz vein with treasure", [
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.NO_SCENT,
    TerrainFlag.NO_FLOW, TerrainFlag.QUARTZ, TerrainFlag.GOLD,
    TerrainFlag.INTERESTING,
  ]);

  // FEAT_GRANITE (21)
  features[Feat.GRANITE] = makeFeat(Feat.GRANITE, "granite wall", [
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.NO_SCENT,
    TerrainFlag.NO_FLOW, TerrainFlag.GRANITE,
  ]);

  // FEAT_PERM (22)
  features[Feat.PERM] = makeFeat(Feat.PERM, "permanent wall", [
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.PERMANENT,
    TerrainFlag.NO_SCENT, TerrainFlag.NO_FLOW,
  ]);

  // FEAT_LAVA (23)
  features[Feat.LAVA] = makeFeat(Feat.LAVA, "lava", [
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE,
    TerrainFlag.NO_SCENT, TerrainFlag.FIERY, TerrainFlag.BRIGHT,
  ]);

  // FEAT_PASS_RUBBLE (24)
  features[Feat.PASS_RUBBLE] = makeFeat(Feat.PASS_RUBBLE, "pass rubble", [
    TerrainFlag.ROCK, TerrainFlag.PASSABLE, TerrainFlag.OBJECT,
    TerrainFlag.INTERESTING,
  ]);

  return features;
}

// ── Setup ──

beforeAll(() => {
  setFeatureInfo(buildTestFeatureInfo());
});

// ── Feature query tests ──

describe("square feature predicates", () => {
  it("squareIsFloor should identify floor squares", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(2, 2);

    // Default feat is NONE — not floor
    expect(squareIsFloor(c, pos)).toBe(false);

    // Set to FLOOR
    chunkGetSquare(c, pos).feat = Feat.FLOOR as FeatureId;
    expect(squareIsFloor(c, pos)).toBe(true);

    // Set to GRANITE — not floor
    chunkGetSquare(c, pos).feat = Feat.GRANITE as FeatureId;
    expect(squareIsFloor(c, pos)).toBe(false);
  });

  it("squareIsWall should identify wall squares", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(1, 1);

    chunkGetSquare(c, pos).feat = Feat.GRANITE as FeatureId;
    expect(squareIsWall(c, pos)).toBe(true);

    chunkGetSquare(c, pos).feat = Feat.MAGMA as FeatureId;
    expect(squareIsWall(c, pos)).toBe(true);

    chunkGetSquare(c, pos).feat = Feat.FLOOR as FeatureId;
    expect(squareIsWall(c, pos)).toBe(false);
  });

  it("squareIsGranite should identify granite walls", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(1, 1);

    chunkGetSquare(c, pos).feat = Feat.GRANITE as FeatureId;
    expect(squareIsGranite(c, pos)).toBe(true);

    chunkGetSquare(c, pos).feat = Feat.MAGMA as FeatureId;
    expect(squareIsGranite(c, pos)).toBe(false);
  });

  it("squareIsClosedDoor should identify closed doors", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(2, 2);

    chunkGetSquare(c, pos).feat = Feat.CLOSED as FeatureId;
    expect(squareIsClosedDoor(c, pos)).toBe(true);

    chunkGetSquare(c, pos).feat = Feat.OPEN as FeatureId;
    expect(squareIsClosedDoor(c, pos)).toBe(false);

    chunkGetSquare(c, pos).feat = Feat.FLOOR as FeatureId;
    expect(squareIsClosedDoor(c, pos)).toBe(false);
  });

  it("squareIsOpenDoor should identify open doors", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(2, 2);

    chunkGetSquare(c, pos).feat = Feat.OPEN as FeatureId;
    expect(squareIsOpenDoor(c, pos)).toBe(true);

    chunkGetSquare(c, pos).feat = Feat.CLOSED as FeatureId;
    expect(squareIsOpenDoor(c, pos)).toBe(false);

    // Broken door is not closable, so not "open door"
    chunkGetSquare(c, pos).feat = Feat.BROKEN as FeatureId;
    expect(squareIsOpenDoor(c, pos)).toBe(false);
  });
});

describe("square behavior predicates", () => {
  it("squareIsOpen should be true for unoccupied floor", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(2, 2);

    chunkGetSquare(c, pos).feat = Feat.FLOOR as FeatureId;
    expect(squareIsOpen(c, pos)).toBe(true);

    // Place a monster — no longer open
    chunkGetSquare(c, pos).mon = 1 as MonsterId;
    expect(squareIsOpen(c, pos)).toBe(false);
  });

  it("squareIsPassable should identify passable terrain", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(1, 1);

    chunkGetSquare(c, pos).feat = Feat.FLOOR as FeatureId;
    expect(squareIsPassable(c, pos)).toBe(true);

    chunkGetSquare(c, pos).feat = Feat.OPEN as FeatureId;
    expect(squareIsPassable(c, pos)).toBe(true);

    chunkGetSquare(c, pos).feat = Feat.GRANITE as FeatureId;
    expect(squareIsPassable(c, pos)).toBe(false);

    chunkGetSquare(c, pos).feat = Feat.CLOSED as FeatureId;
    expect(squareIsPassable(c, pos)).toBe(false);
  });

  it("squareIsProjectable should check projection passage", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(2, 2);

    chunkGetSquare(c, pos).feat = Feat.FLOOR as FeatureId;
    expect(squareIsProjectable(c, pos)).toBe(true);

    chunkGetSquare(c, pos).feat = Feat.GRANITE as FeatureId;
    expect(squareIsProjectable(c, pos)).toBe(false);

    // Out of bounds returns false
    expect(squareIsProjectable(c, loc(-1, 0))).toBe(false);
  });

  it("squareAllowsLOS should check line of sight", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(2, 2);

    chunkGetSquare(c, pos).feat = Feat.FLOOR as FeatureId;
    expect(squareAllowsLOS(c, pos)).toBe(true);

    chunkGetSquare(c, pos).feat = Feat.OPEN as FeatureId;
    expect(squareAllowsLOS(c, pos)).toBe(true);

    chunkGetSquare(c, pos).feat = Feat.GRANITE as FeatureId;
    expect(squareAllowsLOS(c, pos)).toBe(false);

    chunkGetSquare(c, pos).feat = Feat.CLOSED as FeatureId;
    expect(squareAllowsLOS(c, pos)).toBe(false);
  });
});

// ── Flag query / setter tests ──

describe("square flag predicates and setters", () => {
  it("squareSetMark / squareIsMark", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(1, 1);

    expect(squareIsMark(c, pos)).toBe(false);
    squareSetMark(c, pos);
    expect(squareIsMark(c, pos)).toBe(true);
    squareClearMark(c, pos);
    expect(squareIsMark(c, pos)).toBe(false);
  });

  it("squareSetGlow / squareIsGlow", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(3, 3);

    expect(squareIsGlow(c, pos)).toBe(false);
    squareSetGlow(c, pos);
    expect(squareIsGlow(c, pos)).toBe(true);
    squareClearGlow(c, pos);
    expect(squareIsGlow(c, pos)).toBe(false);
  });

  it("squareSetVault / squareIsVault", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(2, 2);

    expect(squareIsVault(c, pos)).toBe(false);
    squareSetVault(c, pos);
    expect(squareIsVault(c, pos)).toBe(true);
  });

  it("squareSetRoom / squareIsRoom", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(2, 2);

    expect(squareIsRoom(c, pos)).toBe(false);
    squareSetRoom(c, pos);
    expect(squareIsRoom(c, pos)).toBe(true);
  });

  it("squareSetSeen / squareIsSeen", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(2, 2);

    expect(squareIsSeen(c, pos)).toBe(false);
    squareSetSeen(c, pos);
    expect(squareIsSeen(c, pos)).toBe(true);
  });

  it("squareSetView / squareIsView", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(2, 2);

    expect(squareIsView(c, pos)).toBe(false);
    squareSetView(c, pos);
    expect(squareIsView(c, pos)).toBe(true);
  });

  it("squareSetFeel / squareIsFeel", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(2, 2);

    expect(squareIsFeel(c, pos)).toBe(false);
    squareSetFeel(c, pos);
    expect(squareIsFeel(c, pos)).toBe(true);
    squareClearFeel(c, pos);
    expect(squareIsFeel(c, pos)).toBe(false);
  });

  it("flags are independent per square", () => {
    const c = createChunk(5, 5, 0);
    const pos1 = loc(1, 1);
    const pos2 = loc(2, 2);

    squareSetMark(c, pos1);
    squareSetGlow(c, pos2);

    expect(squareIsMark(c, pos1)).toBe(true);
    expect(squareIsGlow(c, pos1)).toBe(false);
    expect(squareIsMark(c, pos2)).toBe(false);
    expect(squareIsGlow(c, pos2)).toBe(true);
  });
});

// ── Feature setter tests ──

describe("squareSetFeat", () => {
  it("should change the terrain of a square", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(2, 2);

    squareSetFeat(c, pos, Feat.FLOOR);
    expect(chunkGetSquare(c, pos).feat).toBe(Feat.FLOOR);

    squareSetFeat(c, pos, Feat.GRANITE);
    expect(chunkGetSquare(c, pos).feat).toBe(Feat.GRANITE);
  });

  it("should update feat counts", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(2, 2);

    squareSetFeat(c, pos, Feat.FLOOR);
    expect(c.featCount[Feat.FLOOR]).toBe(1);

    squareSetFeat(c, pos, Feat.GRANITE);
    expect(c.featCount[Feat.FLOOR]).toBe(0);
    expect(c.featCount[Feat.GRANITE]).toBe(1);
  });

  it("should track multiple feature placements", () => {
    const c = createChunk(5, 5, 0);

    squareSetFeat(c, loc(0, 0), Feat.FLOOR);
    squareSetFeat(c, loc(1, 0), Feat.FLOOR);
    squareSetFeat(c, loc(2, 0), Feat.GRANITE);

    expect(c.featCount[Feat.FLOOR]).toBe(2);
    expect(c.featCount[Feat.GRANITE]).toBe(1);
  });
});

// ── Monster / Object query tests ──

describe("monster and object queries", () => {
  it("squareHasMonster should detect monster presence", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(2, 2);

    expect(squareHasMonster(c, pos)).toBe(false);

    // Place a monster
    chunkGetSquare(c, pos).mon = 5 as MonsterId;
    expect(squareHasMonster(c, pos)).toBe(true);

    // Place the player (negative mon index)
    chunkGetSquare(c, pos).mon = -1 as MonsterId;
    expect(squareHasMonster(c, pos)).toBe(true);
  });

  it("squareHasObject should detect object presence", () => {
    const c = createChunk(5, 5, 0);
    const pos = loc(3, 3);

    expect(squareHasObject(c, pos)).toBe(false);

    // Place an object reference
    chunkGetSquare(c, pos).obj = 1 as ObjectId;
    expect(squareHasObject(c, pos)).toBe(true);
  });
});
