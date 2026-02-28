/**
 * Tests for cave/chunk.ts — Chunk creation and utility functions.
 */
import { describe, it, expect } from "vitest";
import { loc } from "../z/index.js";
import {
  createSquare,
  createChunk,
  chunkValidate,
  chunkContains,
  chunkContainsFully,
  chunkGetSquare,
  chunkSetSquare,
} from "./chunk.js";
import type { FeatureId, MonsterId } from "../types/index.js";
import { SquareFlag } from "../types/index.js";

describe("createSquare", () => {
  it("should create a square with default values", () => {
    const sq = createSquare();

    expect(sq.feat).toBe(0);
    expect(sq.light).toBe(0);
    expect(sq.mon).toBe(0);
    expect(sq.obj).toBeNull();
    expect(sq.trap).toBeNull();
    expect(sq.info.isEmpty()).toBe(true);
  });

  it("should allocate independent info bitflags per square", () => {
    const sq1 = createSquare();
    const sq2 = createSquare();

    sq1.info.on(SquareFlag.MARK);
    expect(sq1.info.has(SquareFlag.MARK)).toBe(true);
    expect(sq2.info.has(SquareFlag.MARK)).toBe(false);
  });
});

describe("createChunk", () => {
  it("should create a chunk with correct dimensions", () => {
    const chunk = createChunk(10, 20, 5);

    expect(chunk.height).toBe(10);
    expect(chunk.width).toBe(20);
    expect(chunk.depth).toBe(5);
    expect(chunk.squares.length).toBe(10);
    expect(chunk.squares[0]!.length).toBe(20);
  });

  it("should initialize all squares", () => {
    const chunk = createChunk(5, 5, 0);

    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const sq = chunk.squares[y]![x]!;
        expect(sq).toBeDefined();
        expect(sq.feat).toBe(0);
        expect(sq.info.isEmpty()).toBe(true);
      }
    }
  });

  it("should initialize heatmaps", () => {
    const chunk = createChunk(3, 4, 1);

    expect(chunk.noise.grids.length).toBe(3);
    expect(chunk.noise.grids[0]!.length).toBe(4);
    expect(chunk.scent.grids.length).toBe(3);
    expect(chunk.scent.grids[0]!.length).toBe(4);
  });

  it("should initialize feat count array", () => {
    const chunk = createChunk(5, 5, 0);

    expect(chunk.featCount.length).toBeGreaterThan(0);
    // All counts should start at zero
    for (let i = 0; i < chunk.featCount.length; i++) {
      expect(chunk.featCount[i]).toBe(0);
    }
  });

  it("should initialize object pool and monster tracking", () => {
    const chunk = createChunk(5, 5, 0);

    expect(chunk.objMax).toBeGreaterThan(0);
    expect(chunk.monMax).toBe(1);
    expect(chunk.monCnt).toBe(0);
    expect(chunk.monCurrent).toBe(-1);
  });

  it("should set default metadata", () => {
    const chunk = createChunk(10, 10, 3);

    expect(chunk.name).toBe("");
    expect(chunk.turn).toBe(0);
    expect(chunk.feeling).toBe(0);
    expect(chunk.goodItem).toBe(false);
    expect(chunk.decoy).toEqual({ x: 0, y: 0 });
  });
});

describe("chunkValidate", () => {
  it("should return true for a properly created chunk", () => {
    const chunk = createChunk(10, 20, 1);
    expect(chunkValidate(chunk)).toBe(true);
  });

  it("should return false for invalid dimensions", () => {
    const chunk = createChunk(5, 5, 0);
    // Force invalid state
    (chunk as { height: number }).height = 0;
    expect(chunkValidate(chunk)).toBe(false);
  });

  it("should return false for mismatched squares array length", () => {
    const chunk = createChunk(5, 5, 0);
    // Force mismatch by truncating
    chunk.squares.length = 3;
    expect(chunkValidate(chunk)).toBe(false);
  });
});

describe("chunkContains", () => {
  const chunk = createChunk(10, 20, 0);

  it("should return true for valid locations", () => {
    expect(chunkContains(chunk, loc(0, 0))).toBe(true);
    expect(chunkContains(chunk, loc(19, 9))).toBe(true);
    expect(chunkContains(chunk, loc(10, 5))).toBe(true);
  });

  it("should return false for out-of-bounds locations", () => {
    expect(chunkContains(chunk, loc(-1, 0))).toBe(false);
    expect(chunkContains(chunk, loc(0, -1))).toBe(false);
    expect(chunkContains(chunk, loc(20, 0))).toBe(false);
    expect(chunkContains(chunk, loc(0, 10))).toBe(false);
    expect(chunkContains(chunk, loc(20, 10))).toBe(false);
  });
});

describe("chunkContainsFully", () => {
  const chunk = createChunk(10, 20, 0);

  it("should return true for interior locations", () => {
    expect(chunkContainsFully(chunk, loc(1, 1))).toBe(true);
    expect(chunkContainsFully(chunk, loc(18, 8))).toBe(true);
    expect(chunkContainsFully(chunk, loc(10, 5))).toBe(true);
  });

  it("should return false for border locations", () => {
    expect(chunkContainsFully(chunk, loc(0, 0))).toBe(false);
    expect(chunkContainsFully(chunk, loc(19, 0))).toBe(false);
    expect(chunkContainsFully(chunk, loc(0, 9))).toBe(false);
    expect(chunkContainsFully(chunk, loc(19, 9))).toBe(false);
  });
});

describe("chunkGetSquare / chunkSetSquare", () => {
  it("should get the square at a position", () => {
    const chunk = createChunk(5, 5, 0);
    const sq = chunkGetSquare(chunk, loc(2, 3));

    expect(sq).toBeDefined();
    expect(sq.feat).toBe(0);
  });

  it("should return the same square object as the grid", () => {
    const chunk = createChunk(5, 5, 0);
    const sq = chunkGetSquare(chunk, loc(2, 3));

    sq.info.on(SquareFlag.GLOW);
    const sq2 = chunkGetSquare(chunk, loc(2, 3));
    expect(sq2.info.has(SquareFlag.GLOW)).toBe(true);
  });

  it("should replace a square at a position", () => {
    const chunk = createChunk(5, 5, 0);
    const newSq = createSquare();
    newSq.feat = 1 as FeatureId;
    newSq.mon = 42 as MonsterId;

    chunkSetSquare(chunk, loc(1, 2), newSq);

    const retrieved = chunkGetSquare(chunk, loc(1, 2));
    expect(retrieved.feat).toBe(1);
    expect(retrieved.mon).toBe(42);
  });

  it("should not affect other squares when setting one", () => {
    const chunk = createChunk(5, 5, 0);
    const newSq = createSquare();
    newSq.feat = 5 as FeatureId;

    chunkSetSquare(chunk, loc(0, 0), newSq);

    expect(chunkGetSquare(chunk, loc(0, 0)).feat).toBe(5);
    expect(chunkGetSquare(chunk, loc(1, 0)).feat).toBe(0);
    expect(chunkGetSquare(chunk, loc(0, 1)).feat).toBe(0);
  });
});
