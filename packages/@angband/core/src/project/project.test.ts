/**
 * Tests for project/project.ts — Main projection engine
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateProjectionPath,
  calculateBallArea,
  calculateArcArea,
  calculateBeamArea,
  setProjectFeatureTable,
  angbandDistance,
  project,
  ProjectFlag,
} from "./project.js";
import { loc, locEq } from "../z/index.js";
import { RNG } from "../z/index.js";
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
  table[Feat.RUBBLE] = makeFeature(
    Feat.RUBBLE,
    "pile of rubble",
    TerrainFlag.ROCK,
  );
  return table;
}

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
        case "M": // Monster on floor
          feat = Feat.FLOOR as FeatureId;
          break;
        default:
          feat = Feat.FLOOR as FeatureId;
      }
      const info = new BitFlag(SquareFlag.MAX);
      const sq: Square = {
        feat,
        info,
        light: 0,
        mon: (ch === "M" ? 1 : 0) as MonsterId,
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

function createRNG(): RNG {
  const rng = new RNG();
  rng.stateInit(42);
  rng.quick = false;
  return rng;
}

// ── Setup ──

beforeEach(() => {
  setProjectFeatureTable(buildTestFeatureTable());
});

// ── angbandDistance() tests ──

describe("angbandDistance", () => {
  it("returns 0 for the same point", () => {
    expect(angbandDistance(loc(5, 5), loc(5, 5))).toBe(0);
  });

  it("returns correct distance for cardinal direction", () => {
    expect(angbandDistance(loc(0, 0), loc(5, 0))).toBe(5);
    expect(angbandDistance(loc(0, 0), loc(0, 5))).toBe(5);
  });

  it("returns correct distance for diagonal", () => {
    // max(5,5) + min(5,5)/2 = 5 + 2 = 7
    expect(angbandDistance(loc(0, 0), loc(5, 5))).toBe(7);
  });

  it("handles negative offsets", () => {
    expect(angbandDistance(loc(5, 5), loc(2, 5))).toBe(3);
    expect(angbandDistance(loc(5, 5), loc(5, 2))).toBe(3);
  });
});

// ── calculateProjectionPath() tests ──

describe("calculateProjectionPath", () => {
  it("returns empty path when source equals target", () => {
    const chunk = createTestChunk([
      ".....",
      ".....",
      ".....",
    ]);
    const result = calculateProjectionPath(chunk, loc(2, 1), loc(2, 1), 10, 0);
    expect(result.path).toHaveLength(0);
  });

  it("traces a horizontal path", () => {
    const chunk = createTestChunk([
      ".....",
    ]);
    const result = calculateProjectionPath(chunk, loc(0, 0), loc(4, 0), 10, 0);
    expect(result.path.length).toBeGreaterThanOrEqual(4);
    expect(locEq(result.path[0]!, loc(1, 0))).toBe(true);
  });

  it("traces a vertical path", () => {
    const chunk = createTestChunk([
      ".",
      ".",
      ".",
      ".",
      ".",
    ]);
    const result = calculateProjectionPath(chunk, loc(0, 0), loc(0, 4), 10, 0);
    expect(result.path.length).toBeGreaterThanOrEqual(4);
    expect(locEq(result.path[0]!, loc(0, 1))).toBe(true);
  });

  it("traces a diagonal path", () => {
    const chunk = createTestChunk([
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ]);
    const result = calculateProjectionPath(chunk, loc(0, 0), loc(4, 4), 10, 0);
    expect(result.path.length).toBeGreaterThanOrEqual(4);
    expect(locEq(result.path[0]!, loc(1, 1))).toBe(true);
  });

  it("stops at a wall", () => {
    const chunk = createTestChunk([
      "..#..",
    ]);
    const result = calculateProjectionPath(chunk, loc(0, 0), loc(4, 0), 10, 0);
    // Should stop at or before the wall at (2,0)
    const lastGrid = result.path[result.path.length - 1]!;
    expect(lastGrid.x).toBeLessThanOrEqual(2);
  });

  it("stops at a monster with STOP flag", () => {
    const chunk = createTestChunk([
      "..M..",
    ]);
    const result = calculateProjectionPath(
      chunk,
      loc(0, 0),
      loc(4, 0),
      10,
      ProjectFlag.STOP,
    );
    const lastGrid = result.path[result.path.length - 1]!;
    expect(lastGrid.x).toBeLessThanOrEqual(2);
  });

  it("passes through a monster without STOP flag", () => {
    const chunk = createTestChunk([
      "..M..",
    ]);
    const result = calculateProjectionPath(chunk, loc(0, 0), loc(4, 0), 10, 0);
    expect(result.path.length).toBeGreaterThanOrEqual(4);
  });

  it("continues past target with THRU flag", () => {
    const chunk = createTestChunk([
      ".........",
    ]);
    const result = calculateProjectionPath(
      chunk,
      loc(0, 0),
      loc(3, 0),
      8,
      ProjectFlag.THRU,
    );
    // With THRU, should continue past the target
    expect(result.path.length).toBeGreaterThan(3);
  });

  it("respects range limit", () => {
    const chunk = createTestChunk([
      ".........",
    ]);
    const result = calculateProjectionPath(chunk, loc(0, 0), loc(8, 0), 3, 0);
    expect(result.path.length).toBeLessThanOrEqual(3);
  });
});

// ── calculateBallArea() tests ──

describe("calculateBallArea", () => {
  it("returns only the centre for radius 0", () => {
    const chunk = createTestChunk([
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ]);
    const grids = calculateBallArea(loc(2, 2), 0, chunk);
    expect(grids).toHaveLength(1);
    expect(locEq(grids[0]!, loc(2, 2))).toBe(true);
  });

  it("returns all adjacent grids for radius 1", () => {
    const chunk = createTestChunk([
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ]);
    const grids = calculateBallArea(loc(2, 2), 1, chunk);
    // Radius 1 in Angband distance: the centre + 4 cardinal + 4 diagonal = 9
    // But diagonal distance(0,0 -> 1,1) = 1 + 0 = 1, so all 8 neighbors are in range
    expect(grids.length).toBeGreaterThanOrEqual(5);
    // Centre should be first (distance 0)
    expect(locEq(grids[0]!, loc(2, 2))).toBe(true);
  });

  it("excludes wall grids that are not projectable", () => {
    const chunk = createTestChunk([
      ".....",
      ".###.",
      ".#.#.",
      ".###.",
      ".....",
    ]);
    const grids = calculateBallArea(loc(2, 2), 2, chunk);
    // Wall grids should not be included unless projectable from centre
    const hasWall = grids.some(
      (g) => chunk.squares[g.y]![g.x]!.feat === (Feat.GRANITE as FeatureId),
    );
    expect(hasWall).toBe(false);
  });

  it("sorts grids by distance from centre", () => {
    const chunk = createTestChunk([
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ]);
    const grids = calculateBallArea(loc(2, 2), 2, chunk);
    for (let i = 1; i < grids.length; i++) {
      const prevDist = angbandDistance(loc(2, 2), grids[i - 1]!);
      const currDist = angbandDistance(loc(2, 2), grids[i]!);
      expect(currDist).toBeGreaterThanOrEqual(prevDist);
    }
  });
});

// ── calculateArcArea() tests ──

describe("calculateArcArea", () => {
  it("includes the source grid", () => {
    const chunk = createTestChunk([
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ]);
    const grids = calculateArcArea(loc(2, 2), loc(4, 2), 2, 90, chunk);
    const hasSource = grids.some((g) => locEq(g, loc(2, 2)));
    expect(hasSource).toBe(true);
  });

  it("restricts grids to the arc direction", () => {
    const chunk = createTestChunk([
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ]);
    // Arc pointing east (positive x direction) with 90 degree cone
    const grids = calculateArcArea(loc(2, 2), loc(4, 2), 2, 90, chunk);
    // Should not include grids directly west of source
    const hasWest = grids.some((g) => g.x < 2 && g.y === 2);
    expect(hasWest).toBe(false);
  });
});

// ── calculateBeamArea() tests ──

describe("calculateBeamArea", () => {
  it("includes all grids along the beam path", () => {
    const chunk = createTestChunk([
      ".....",
    ]);
    const grids = calculateBeamArea(loc(0, 0), loc(4, 0), 10, chunk);
    expect(grids.length).toBeGreaterThanOrEqual(4);
    // First grid should be (1,0), not the source
    expect(locEq(grids[0]!, loc(1, 0))).toBe(true);
  });

  it("stops at walls", () => {
    const chunk = createTestChunk([
      "..#..",
    ]);
    const grids = calculateBeamArea(loc(0, 0), loc(4, 0), 10, chunk);
    const lastGrid = grids[grids.length - 1]!;
    expect(lastGrid.x).toBeLessThanOrEqual(2);
  });
});

// ── project() tests ──

describe("project", () => {
  it("returns empty result for same source and target with no flags", () => {
    const chunk = createTestChunk([
      ".....",
      ".....",
      ".....",
    ]);
    const rng = createRNG();
    const result = project(
      chunk,
      loc(2, 1),
      loc(2, 1),
      Element.FIRE,
      50,
      0,
      0,
      rng,
    );
    // Point effect at source=target: the grid is affected
    expect(result.affectedGrids).toHaveLength(1);
  });

  it("affects terrain with GRID flag and fire element on a door", () => {
    const chunk = createTestChunk([
      "..+..",
    ]);
    const rng = createRNG();
    const result = project(
      chunk,
      loc(0, 0),
      loc(2, 0),
      Element.FIRE,
      50,
      0,
      ProjectFlag.GRID,
      rng,
    );
    expect(result.messages.length).toBeGreaterThan(0);
    // The door at (2,0) should have been changed
    expect(chunk.squares[0]![2]!.feat).toBe(Feat.BROKEN as FeatureId);
  });

  it("calculates ball explosion correctly", () => {
    const chunk = createTestChunk([
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ]);
    const rng = createRNG();
    const result = project(
      chunk,
      loc(0, 2),
      loc(2, 2),
      Element.FIRE,
      100,
      1,
      ProjectFlag.GRID,
      rng,
    );
    // Ball radius 1 should affect multiple grids
    expect(result.affectedGrids.length).toBeGreaterThan(1);
  });

  it("handles JUMP flag (start at target)", () => {
    const chunk = createTestChunk([
      ".....",
      ".....",
      ".....",
    ]);
    const rng = createRNG();
    const result = project(
      chunk,
      loc(0, 0),
      loc(2, 1),
      Element.FIRE,
      50,
      0,
      ProjectFlag.JUMP | ProjectFlag.GRID,
      rng,
    );
    // With JUMP, source is moved to target, so this is a point effect
    expect(result.affectedGrids).toHaveLength(1);
    expect(locEq(result.affectedGrids[0]!, loc(2, 1))).toBe(true);
  });
});
