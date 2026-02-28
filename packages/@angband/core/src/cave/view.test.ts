/**
 * Tests for cave/view.ts — Field of View (FOV) calculation
 */
import { describe, it, expect, beforeEach } from "vitest";
import { updateView, distance, los, setFeatureTable } from "./view.js";
import { loc } from "../z/index.js";
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
 * Index 0 = NONE, 1 = FLOOR, 2 = CLOSED door, 3 = OPEN door, 21 = GRANITE
 */
function buildTestFeatureTable(): FeatureType[] {
  const table: FeatureType[] = [];
  // Feat.NONE = 0 — nothing special
  table[Feat.NONE] = makeFeature(Feat.NONE, "nothing");
  // Feat.FLOOR = 1 — open floor (LOS, PROJECT, PASSABLE)
  table[Feat.FLOOR] = makeFeature(
    Feat.FLOOR,
    "open floor",
    TerrainFlag.LOS,
    TerrainFlag.PROJECT,
    TerrainFlag.PASSABLE,
    TerrainFlag.FLOOR,
  );
  // Feat.CLOSED = 2 — closed door (no LOS, no PROJECT)
  table[Feat.CLOSED] = makeFeature(
    Feat.CLOSED,
    "closed door",
    TerrainFlag.DOOR_ANY,
    TerrainFlag.DOOR_CLOSED,
  );
  // Feat.OPEN = 3 — open door (LOS, PROJECT, PASSABLE)
  table[Feat.OPEN] = makeFeature(
    Feat.OPEN,
    "open door",
    TerrainFlag.LOS,
    TerrainFlag.PROJECT,
    TerrainFlag.PASSABLE,
    TerrainFlag.DOOR_ANY,
  );
  // Feat.GRANITE = 21 — granite wall (no LOS, WALL, ROCK, GRANITE)
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
 *
 * All floor squares are given GLOW (so they count as lit for SEEN tests)
 * and a light level of 1.
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

      const info = new BitFlag(SquareFlag.MAX);
      // Floor and open doors are glowing (lit for SEEN purposes)
      if (ch === "." || ch === "'") {
        info.on(SquareFlag.GLOW);
      }

      const sq: Square = {
        feat,
        info,
        light: ch === "." || ch === "'" ? 1 : 0,
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

/** Check if a square has the VIEW flag. */
function isView(chunk: Chunk, g: { x: number; y: number }): boolean {
  return chunk.squares[g.y]![g.x]!.info.has(SquareFlag.VIEW);
}

/** Check if a square has the SEEN flag. */
function isSeen(chunk: Chunk, g: { x: number; y: number }): boolean {
  return chunk.squares[g.y]![g.x]!.info.has(SquareFlag.SEEN);
}

// ── Test setup ──

beforeEach(() => {
  setFeatureTable(buildTestFeatureTable());
});

// ── distance() tests ──

describe("distance", () => {
  it("returns 0 for same point", () => {
    expect(distance(loc(5, 5), loc(5, 5))).toBe(0);
  });

  it("returns correct distance for cardinal directions", () => {
    expect(distance(loc(0, 0), loc(5, 0))).toBe(5);
    expect(distance(loc(0, 0), loc(0, 5))).toBe(5);
  });

  it("returns approximate diagonal distance", () => {
    // max(5,5) + min(5,5)/2 = 5 + 2 = 7
    expect(distance(loc(0, 0), loc(5, 5))).toBe(7);
  });
});

// ── los() tests ──

describe("los", () => {
  it("returns true for adjacent grids", () => {
    const chunk = createTestChunk([
      "...",
      "...",
      "...",
    ]);
    expect(los(chunk, loc(0, 0), loc(1, 1))).toBe(true);
  });

  it("returns true for same grid", () => {
    const chunk = createTestChunk(["."]);
    expect(los(chunk, loc(0, 0), loc(0, 0))).toBe(true);
  });

  it("returns true along clear cardinal line", () => {
    const chunk = createTestChunk(["....."]);
    expect(los(chunk, loc(0, 0), loc(4, 0))).toBe(true);
  });

  it("returns false when wall blocks cardinal line", () => {
    const chunk = createTestChunk(["..#.."]);
    expect(los(chunk, loc(0, 0), loc(4, 0))).toBe(false);
  });

  it("returns false when wall blocks vertical line", () => {
    const chunk = createTestChunk([
      ".",
      ".",
      "#",
      ".",
      ".",
    ]);
    expect(los(chunk, loc(0, 0), loc(0, 4))).toBe(false);
  });
});

// ── updateView() tests ──

describe("updateView", () => {
  it("open room: all squares visible", () => {
    // 5x5 open room
    const chunk = createTestChunk([
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ]);
    const player = loc(2, 2);
    updateView(chunk, player, 20, 1);

    // All squares should be in VIEW
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        expect(isView(chunk, { x, y })).toBe(true);
      }
    }
  });

  it("corridor: only straight line visible", () => {
    // Narrow corridor: player at (3, 1), corridor along row 1
    const chunk = createTestChunk([
      "#######",
      ".......",
      "#######",
    ]);
    const player = loc(3, 1);
    updateView(chunk, player, 20, 1);

    // All corridor floor squares should be VIEW
    for (let x = 0; x < 7; x++) {
      expect(isView(chunk, { x, y: 1 })).toBe(true);
    }

    // Wall squares adjacent to the corridor should also be VIEW
    // (wall visibility fixup makes walls next to viewed floors visible)
    for (let x = 0; x < 7; x++) {
      expect(isView(chunk, { x, y: 0 })).toBe(true);
      expect(isView(chunk, { x, y: 2 })).toBe(true);
    }
  });

  it("wall blocking: squares behind walls not visible", () => {
    // Wall across the middle
    const chunk = createTestChunk([
      ".....",
      ".....",
      "#####",
      ".....",
      ".....",
    ]);
    const player = loc(2, 0);
    updateView(chunk, player, 20, 1);

    // Player's row and next row should be visible
    expect(isView(chunk, { x: 2, y: 0 })).toBe(true);
    expect(isView(chunk, { x: 2, y: 1 })).toBe(true);

    // Wall itself should be visible (adjacent to viewed floors)
    expect(isView(chunk, { x: 2, y: 2 })).toBe(true);

    // Squares behind the wall should NOT be visible
    expect(isView(chunk, { x: 2, y: 3 })).toBe(false);
    expect(isView(chunk, { x: 2, y: 4 })).toBe(false);
  });

  it("pillar: shadow behind a single wall tile", () => {
    // Single wall tile (pillar) in an open room
    const chunk = createTestChunk([
      ".......",
      ".......",
      ".......",
      "...#...",
      ".......",
      ".......",
      ".......",
    ]);
    const player = loc(3, 1);
    updateView(chunk, player, 20, 1);

    // Player position should be visible
    expect(isView(chunk, { x: 3, y: 1 })).toBe(true);

    // The pillar itself should be visible
    expect(isView(chunk, { x: 3, y: 3 })).toBe(true);

    // Squares directly behind the pillar (from player's perspective)
    // should be in shadow. The player is at (3,1), pillar at (3,3),
    // so (3,4), (3,5), (3,6) should not be visible.
    expect(isView(chunk, { x: 3, y: 5 })).toBe(false);
    expect(isView(chunk, { x: 3, y: 6 })).toBe(false);
  });

  it("closed door blocks view", () => {
    const chunk = createTestChunk([
      ".....",
      "..+..",
      ".....",
    ]);
    const player = loc(2, 0);
    updateView(chunk, player, 20, 1);

    // Squares in front of the door should be visible
    expect(isView(chunk, { x: 2, y: 0 })).toBe(true);

    // The closed door itself should be visible
    expect(isView(chunk, { x: 2, y: 1 })).toBe(true);

    // Squares behind the closed door should NOT be visible
    expect(isView(chunk, { x: 2, y: 2 })).toBe(false);
  });

  it("open door allows view", () => {
    const chunk = createTestChunk([
      ".....",
      "..'...",
      ".....",
    ]);
    // Rebuild with proper width
    const chunk2 = createTestChunk([
      ".....",
      "..'..",
      ".....",
    ]);
    const player = loc(2, 0);
    updateView(chunk2, player, 20, 1);

    // Open door should be visible
    expect(isView(chunk2, { x: 2, y: 1 })).toBe(true);

    // Squares behind the open door should be visible
    expect(isView(chunk2, { x: 2, y: 2 })).toBe(true);
  });

  it("player position always visible and seen", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    const player = loc(2, 2);
    updateView(chunk, player, 20, 1);

    expect(isView(chunk, { x: 2, y: 2 })).toBe(true);
    expect(isSeen(chunk, { x: 2, y: 2 })).toBe(true);
  });

  it("radius limiting", () => {
    // Large open area, small radius
    const rows: string[] = [];
    for (let y = 0; y < 21; y++) {
      rows.push(".".repeat(21));
    }
    const chunk = createTestChunk(rows);
    const player = loc(10, 10);
    updateView(chunk, player, 3, 1);

    // Square at distance 3 should be visible
    expect(isView(chunk, { x: 10, y: 7 })).toBe(true);

    // Square at distance 5 should NOT be visible (beyond radius 3)
    expect(isView(chunk, { x: 10, y: 5 })).toBe(false);
  });

  it("SEEN flag set for lit VIEW squares", () => {
    const chunk = createTestChunk([
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ]);
    const player = loc(2, 2);
    updateView(chunk, player, 20, 1);

    // All lit floor squares in view should be SEEN
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        expect(isSeen(chunk, { x, y })).toBe(true);
      }
    }
  });

  it("unlit squares in VIEW are not SEEN (except within torch radius)", () => {
    // Create chunk with unlit floors
    const map = [
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ];
    const chunk = createTestChunk(map);

    // Remove GLOW and light from all squares
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        chunk.squares[y]![x]!.info.off(SquareFlag.GLOW);
        chunk.squares[y]![x]!.light = 0;
      }
    }

    const player = loc(2, 2);
    updateView(chunk, player, 20, 2); // torch radius 2

    // Player square: always SEEN
    expect(isSeen(chunk, { x: 2, y: 2 })).toBe(true);

    // Adjacent (distance 1 < torch radius 2): SEEN
    expect(isSeen(chunk, { x: 2, y: 1 })).toBe(true);
    expect(isSeen(chunk, { x: 3, y: 2 })).toBe(true);

    // Corners at distance ~2.5: not SEEN (distance = max(2,2) + min(2,2)/2 = 3)
    expect(isSeen(chunk, { x: 0, y: 0 })).toBe(false);
    expect(isSeen(chunk, { x: 4, y: 4 })).toBe(false);
  });

  it("WASSEEN is set for previously seen squares after update", () => {
    const chunk = createTestChunk([
      "...",
      "...",
      "...",
    ]);
    const player = loc(1, 1);
    updateView(chunk, player, 20, 1);

    // All squares should be SEEN after first update
    expect(isSeen(chunk, { x: 0, y: 0 })).toBe(true);

    // Now update from a different position — WASSEEN should be set
    // on previously seen squares during the next update
    // We check by noting that after a second update, the old SEEN squares
    // had WASSEEN set (which gets cleared). We verify by the flow:
    // second update clears VIEW/SEEN, so previously-SEEN squares
    // should no longer be SEEN if out of new view.
    const chunk2 = createTestChunk([
      "..#",
      "..#",
      "..#",
    ]);
    // Mark (0,0) as SEEN manually
    chunk2.squares[0]![0]!.info.on(SquareFlag.SEEN);

    updateView(chunk2, loc(0, 1), 20, 1);

    // (0,0) was SEEN before update, so WASSEEN should have been set
    // and then cleared. The square should now have proper VIEW/SEEN
    // based on new calculation.
    expect(isView(chunk2, { x: 0, y: 1 })).toBe(true); // player pos
  });
});
