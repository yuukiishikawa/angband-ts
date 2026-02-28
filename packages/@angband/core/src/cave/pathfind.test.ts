/**
 * Tests for cave/pathfind.ts — A* pathfinding
 */
import { describe, it, expect, beforeEach } from "vitest";
import { findPath, setFeatureTable } from "./pathfind.js";
import { loc, locEq } from "../z/index.js";
import { BitFlag } from "../z/index.js";
import type { Chunk, Square, FeatureType } from "../types/index.js";
import {
  SquareFlag,
  TerrainFlag,
  Feat,
  type FeatureId,
  type MonsterId,
} from "../types/index.js";

// ── Test helpers ──

/**
 * Build a minimal FeatureType with the specified flags.
 */
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

/**
 * Build the minimal feature table used by all tests.
 */
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
  table[Feat.GRANITE] = makeFeature(
    Feat.GRANITE,
    "granite wall",
    TerrainFlag.WALL,
    TerrainFlag.ROCK,
    TerrainFlag.GRANITE,
  );
  return table;
}

/**
 * Create a test chunk from ASCII art.
 *
 * Characters:
 *   `.` = floor (Feat.FLOOR)
 *   `#` = granite wall (Feat.GRANITE)
 *   `+` = closed door (Feat.CLOSED)
 *   `'` = open door (Feat.OPEN)
 */
function createTestChunk(map: string[]): Chunk {
  const height = map.length;
  const width = map[0]!.length;

  const squares: Square[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Square[] = [];
    for (let x = 0; x < width; x++) {
      const ch = map[y]![x];
      let feat: FeatureId;
      switch (ch) {
        case ".":
          feat = Feat.FLOOR as FeatureId;
          break;
        case "#":
          feat = Feat.GRANITE as FeatureId;
          break;
        case "+":
          feat = Feat.CLOSED as FeatureId;
          break;
        case "'":
          feat = Feat.OPEN as FeatureId;
          break;
        default:
          feat = Feat.FLOOR as FeatureId;
      }

      const sq: Square = {
        feat,
        info: new BitFlag(SquareFlag.MAX),
        light: 0,
        mon: 0 as MonsterId,
        obj: null,
        trap: null,
      };
      row.push(sq);
    }
    squares.push(row);
  }

  return {
    name: "test",
    turn: 0,
    depth: 1,
    feeling: 0,
    objRating: 0,
    monRating: 0,
    goodItem: false,
    height,
    width,
    feelingSquares: 0,
    featCount: new Int32Array(Feat.MAX),
    squares,
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

// ── Test setup ──

beforeEach(() => {
  setFeatureTable(buildTestFeatureTable());
});

// ── findPath() tests ──

describe("findPath", () => {
  it("direct path in open room", () => {
    const chunk = createTestChunk([
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ]);
    const path = findPath(chunk, loc(0, 0), loc(4, 4));

    // Path should exist
    expect(path.length).toBeGreaterThan(0);

    // Start and end match
    expect(locEq(path[0]!, loc(0, 0))).toBe(true);
    expect(locEq(path[path.length - 1]!, loc(4, 4))).toBe(true);

    // Optimal diagonal path length should be 5 (distance = max(4,4) = 4 steps + start)
    expect(path.length).toBe(5);
  });

  it("path around wall", () => {
    const chunk = createTestChunk([
      "..#..",
      "..#..",
      "..#..",
      ".....",
      ".....",
    ]);
    const path = findPath(chunk, loc(0, 0), loc(4, 0));

    // Path should exist
    expect(path.length).toBeGreaterThan(0);

    // Start and end match
    expect(locEq(path[0]!, loc(0, 0))).toBe(true);
    expect(locEq(path[path.length - 1]!, loc(4, 0))).toBe(true);

    // Path should go around the wall (must be longer than straight 5)
    expect(path.length).toBeGreaterThan(5);

    // Verify no square in path is a wall
    for (const p of path) {
      const sq = chunk.squares[p.y]![p.x]!;
      expect(sq.feat).not.toBe(Feat.GRANITE as FeatureId);
    }
  });

  it("no path (completely blocked)", () => {
    const chunk = createTestChunk([
      "..#..",
      "..#..",
      "#####",
      "..#..",
      "..#..",
    ]);
    const path = findPath(chunk, loc(0, 0), loc(4, 4));
    expect(path).toEqual([]);
  });

  it("path through open door", () => {
    const chunk = createTestChunk([
      "..#..",
      "..'..",
      "..#..",
    ]);
    const path = findPath(chunk, loc(0, 1), loc(4, 1));

    // Path should exist (goes through the open door)
    expect(path.length).toBeGreaterThan(0);
    expect(locEq(path[0]!, loc(0, 1))).toBe(true);
    expect(locEq(path[path.length - 1]!, loc(4, 1))).toBe(true);
  });

  it("closed door blocks path", () => {
    // Closed door is not passable, so the path must go around
    const chunk = createTestChunk([
      "#####",
      "..+..",
      "#####",
    ]);
    const path = findPath(chunk, loc(0, 1), loc(4, 1));

    // No path possible — completely walled off with a closed door
    expect(path).toEqual([]);
  });

  it("max steps limit", () => {
    const chunk = createTestChunk([
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ]);
    // With maxSteps=2, we can only go 2 steps from start.
    // loc(0,0) to loc(4,4) requires 4 steps, so it should fail.
    const path = findPath(chunk, loc(0, 0), loc(4, 4), 2);
    expect(path).toEqual([]);
  });

  it("same start and end", () => {
    const chunk = createTestChunk([
      "...",
      "...",
      "...",
    ]);
    const path = findPath(chunk, loc(1, 1), loc(1, 1));
    expect(path).toHaveLength(1);
    expect(locEq(path[0]!, loc(1, 1))).toBe(true);
  });

  it("path along corridor", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#####",
    ]);
    const path = findPath(chunk, loc(1, 1), loc(3, 1));

    // Straight line: 3 tiles
    expect(path).toHaveLength(3);
    expect(locEq(path[0]!, loc(1, 1))).toBe(true);
    expect(locEq(path[1]!, loc(2, 1))).toBe(true);
    expect(locEq(path[2]!, loc(3, 1))).toBe(true);
  });

  it("path consistency: each step is adjacent", () => {
    const chunk = createTestChunk([
      ".........",
      ".#.#.#.#.",
      ".........",
      ".#.#.#.#.",
      ".........",
    ]);
    const path = findPath(chunk, loc(0, 0), loc(8, 4));
    expect(path.length).toBeGreaterThan(0);

    for (let i = 1; i < path.length; i++) {
      const dx = Math.abs(path[i]!.x - path[i - 1]!.x);
      const dy = Math.abs(path[i]!.y - path[i - 1]!.y);
      // Each step should be to an adjacent cell (cardinal or diagonal)
      expect(dx).toBeLessThanOrEqual(1);
      expect(dy).toBeLessThanOrEqual(1);
      expect(dx + dy).toBeGreaterThan(0);
    }
  });
});
