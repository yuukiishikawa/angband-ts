/**
 * Tests for project/feat.ts — Projection effects on terrain
 */
import { describe, it, expect } from "vitest";
import { projectFeature } from "./feat.js";
import { loc } from "../z/index.js";
import { BitFlag } from "../z/index.js";
import type { Chunk, Square, FeatureType } from "../types/index.js";
import {
  SquareFlag,
  TerrainFlag,
  Feat,
  Element,
  type FeatureId,
  type MonsterId,
} from "../types/index.js";

// ── Test helpers ──

function makeFeature(
  fidx: number,
  name: string,
  ...flags: TerrainFlag[]
): FeatureType {
  const bf = new BitFlag(TerrainFlag.MAX);
  for (const f of flags) bf.on(f);
  return {
    name,
    desc: name,
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

function buildTestFeatureTable(): FeatureType[] {
  const table: FeatureType[] = [];
  table[Feat.NONE] = makeFeature(Feat.NONE, "nothing");
  table[Feat.FLOOR] = makeFeature(
    Feat.FLOOR,
    "open floor",
    TerrainFlag.LOS,
    TerrainFlag.PROJECT,
    TerrainFlag.PASSABLE,
    TerrainFlag.FLOOR,
  );
  table[Feat.CLOSED] = makeFeature(
    Feat.CLOSED,
    "closed door",
    TerrainFlag.DOOR_ANY,
    TerrainFlag.DOOR_CLOSED,
  );
  table[Feat.OPEN] = makeFeature(
    Feat.OPEN,
    "open door",
    TerrainFlag.LOS,
    TerrainFlag.PROJECT,
    TerrainFlag.PASSABLE,
    TerrainFlag.DOOR_ANY,
  );
  table[Feat.BROKEN] = makeFeature(
    Feat.BROKEN,
    "broken door",
    TerrainFlag.LOS,
    TerrainFlag.PROJECT,
    TerrainFlag.PASSABLE,
  );
  table[Feat.GRANITE] = makeFeature(
    Feat.GRANITE,
    "granite wall",
    TerrainFlag.WALL,
    TerrainFlag.ROCK,
    TerrainFlag.GRANITE,
  );
  table[Feat.PERM] = makeFeature(
    Feat.PERM,
    "permanent wall",
    TerrainFlag.WALL,
    TerrainFlag.ROCK,
    TerrainFlag.PERMANENT,
  );
  table[Feat.RUBBLE] = makeFeature(
    Feat.RUBBLE,
    "pile of rubble",
    TerrainFlag.ROCK,
  );
  table[Feat.MAGMA] = makeFeature(
    Feat.MAGMA,
    "magma vein",
    TerrainFlag.WALL,
    TerrainFlag.ROCK,
    TerrainFlag.MAGMA,
  );
  return table;
}

function createSquare(feat: Feat): Square {
  return {
    feat: feat as FeatureId,
    info: new BitFlag(SquareFlag.MAX),
    light: 0,
    mon: 0 as MonsterId,
    obj: null,
    trap: null,
  };
}

function createSingleGridChunk(feat: Feat): Chunk {
  const sq = createSquare(feat);
  return {
    name: "test",
    turn: 0,
    depth: 1,
    feeling: 0,
    objRating: 0,
    monRating: 0,
    goodItem: false,
    height: 1,
    width: 1,
    feelingSquares: 0,
    featCount: new Int32Array(Feat.MAX),
    squares: [[sq]],
    noise: { grids: [] },
    scent: { grids: [] },
    decoy: loc(0, 0),
    objects: [],
    objMax: 0,
    monMax: 0,
    monCnt: 0,
    monCurrent: 0,
    numRepro: 0,
    join: [],
  };
}

const table = buildTestFeatureTable();

// ── Tests ──

describe("projectFeature", () => {
  describe("fire element", () => {
    it("destroys closed doors", () => {
      const chunk = createSingleGridChunk(Feat.CLOSED);
      const result = projectFeature(chunk, loc(0, 0), Element.FIRE, 50, table);
      expect(result.changed).toBe(true);
      expect(result.newFeat).toBe(Feat.BROKEN);
      expect(chunk.squares[0]![0]!.feat).toBe(Feat.BROKEN as FeatureId);
      expect(result.message).toBeDefined();
    });

    it("does not affect open floor", () => {
      const chunk = createSingleGridChunk(Feat.FLOOR);
      const result = projectFeature(chunk, loc(0, 0), Element.FIRE, 50, table);
      expect(result.changed).toBe(false);
    });
  });

  describe("acid element", () => {
    it("destroys closed doors", () => {
      const chunk = createSingleGridChunk(Feat.CLOSED);
      const result = projectFeature(chunk, loc(0, 0), Element.ACID, 50, table);
      expect(result.changed).toBe(true);
      expect(result.newFeat).toBe(Feat.BROKEN);
    });

    it("does not affect granite walls", () => {
      const chunk = createSingleGridChunk(Feat.GRANITE);
      const result = projectFeature(chunk, loc(0, 0), Element.ACID, 50, table);
      expect(result.changed).toBe(false);
    });
  });

  describe("force element", () => {
    it("destroys closed doors", () => {
      const chunk = createSingleGridChunk(Feat.CLOSED);
      const result = projectFeature(chunk, loc(0, 0), Element.FORCE, 50, table);
      expect(result.changed).toBe(true);
      expect(result.newFeat).toBe(Feat.BROKEN);
    });

    it("destroys rubble", () => {
      const chunk = createSingleGridChunk(Feat.RUBBLE);
      const result = projectFeature(chunk, loc(0, 0), Element.FORCE, 50, table);
      expect(result.changed).toBe(true);
      expect(result.newFeat).toBe(Feat.FLOOR);
    });
  });

  describe("sound element", () => {
    it("destroys walls with high damage", () => {
      const chunk = createSingleGridChunk(Feat.GRANITE);
      const result = projectFeature(chunk, loc(0, 0), Element.SOUND, 50, table);
      expect(result.changed).toBe(true);
      expect(result.newFeat).toBe(Feat.RUBBLE);
    });

    it("does not destroy walls with low damage", () => {
      const chunk = createSingleGridChunk(Feat.GRANITE);
      const result = projectFeature(chunk, loc(0, 0), Element.SOUND, 20, table);
      expect(result.changed).toBe(false);
    });

    it("destroys rubble", () => {
      const chunk = createSingleGridChunk(Feat.RUBBLE);
      const result = projectFeature(chunk, loc(0, 0), Element.SOUND, 10, table);
      expect(result.changed).toBe(true);
      expect(result.newFeat).toBe(Feat.FLOOR);
    });
  });

  describe("mana element", () => {
    it("destroys walls", () => {
      const chunk = createSingleGridChunk(Feat.GRANITE);
      const result = projectFeature(chunk, loc(0, 0), Element.MANA, 100, table);
      expect(result.changed).toBe(true);
      expect(result.newFeat).toBe(Feat.FLOOR);
    });
  });

  describe("permanent walls", () => {
    it("are never affected", () => {
      const chunk = createSingleGridChunk(Feat.PERM);
      const result = projectFeature(chunk, loc(0, 0), Element.MANA, 999, table);
      expect(result.changed).toBe(false);
    });
  });

  describe("light element", () => {
    it("sets the GLOW flag", () => {
      const chunk = createSingleGridChunk(Feat.FLOOR);
      const result = projectFeature(chunk, loc(0, 0), Element.LIGHT, 50, table);
      expect(result.changed).toBe(true);
      expect(chunk.squares[0]![0]!.info.has(SquareFlag.GLOW)).toBe(true);
    });
  });

  describe("dark element", () => {
    it("clears the GLOW flag", () => {
      const chunk = createSingleGridChunk(Feat.FLOOR);
      chunk.squares[0]![0]!.info.on(SquareFlag.GLOW);
      const result = projectFeature(chunk, loc(0, 0), Element.DARK, 50, table);
      expect(result.changed).toBe(true);
      expect(chunk.squares[0]![0]!.info.has(SquareFlag.GLOW)).toBe(false);
    });
  });

  describe("cold element", () => {
    it("has no terrain effect", () => {
      const chunk = createSingleGridChunk(Feat.FLOOR);
      const result = projectFeature(chunk, loc(0, 0), Element.COLD, 50, table);
      expect(result.changed).toBe(false);
    });
  });

  describe("out of bounds", () => {
    it("returns no change for invalid coordinates", () => {
      const chunk = createSingleGridChunk(Feat.FLOOR);
      const result = projectFeature(chunk, loc(-1, 0), Element.FIRE, 50, table);
      expect(result.changed).toBe(false);
    });
  });
});
