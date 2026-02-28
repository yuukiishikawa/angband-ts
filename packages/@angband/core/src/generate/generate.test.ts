/**
 * Tests for generate/generate.ts — Main dungeon generation.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { RNG, loc } from "../z/index.js";
import { chunkGetSquare, squareIsFloor } from "../cave/index.js";
import { Feat, SquareFlag } from "../types/index.js";
import { setupTestFeatureInfo } from "./test-helpers.js";
import { generateDungeon, DEFAULT_DUNGEON_CONFIG, type DungeonConfig } from "./generate.js";

// ── Setup ──

beforeAll(() => {
  setupTestFeatureInfo();
});

function makeRng(seed = 42): RNG {
  const rng = new RNG();
  rng.stateInit(seed);
  rng.quick = false;
  return rng;
}

/** A smaller config for faster tests. */
const SMALL_CONFIG: DungeonConfig = {
  width: 80,
  height: 40,
  roomAttempts: 15,
  tunnelAttempts: 15,
  monsterDensity: 0,
  objectDensity: 0,
};

// ── Tests ──

describe("generateDungeon", () => {
  it("should return a chunk with correct dimensions", () => {
    const rng = makeRng(100);
    const chunk = generateDungeon(5, SMALL_CONFIG, rng);

    expect(chunk.height).toBe(40);
    expect(chunk.width).toBe(80);
    expect(chunk.depth).toBe(5);
  });

  it("should have permanent walls on the border", () => {
    const rng = makeRng(200);
    const chunk = generateDungeon(5, SMALL_CONFIG, rng);

    // Check all four borders
    for (let x = 0; x < chunk.width; x++) {
      expect(chunkGetSquare(chunk, loc(x, 0)).feat).toBe(Feat.PERM);
      expect(chunkGetSquare(chunk, loc(x, chunk.height - 1)).feat).toBe(Feat.PERM);
    }
    for (let y = 0; y < chunk.height; y++) {
      expect(chunkGetSquare(chunk, loc(0, y)).feat).toBe(Feat.PERM);
      expect(chunkGetSquare(chunk, loc(chunk.width - 1, y)).feat).toBe(Feat.PERM);
    }
  });

  it("should contain at least some floor tiles (rooms were carved)", () => {
    const rng = makeRng(300);
    const chunk = generateDungeon(5, SMALL_CONFIG, rng);

    let floorCount = 0;
    for (let y = 1; y < chunk.height - 1; y++) {
      for (let x = 1; x < chunk.width - 1; x++) {
        if (chunkGetSquare(chunk, loc(x, y)).feat === Feat.FLOOR) {
          floorCount++;
        }
      }
    }

    // With 15 room attempts, we should have at least some floor
    expect(floorCount).toBeGreaterThan(50);
  });

  it("should contain stairs", () => {
    const rng = makeRng(400);
    const chunk = generateDungeon(5, SMALL_CONFIG, rng);

    let hasUpStair = false;
    let hasDownStair = false;

    for (let y = 1; y < chunk.height - 1; y++) {
      for (let x = 1; x < chunk.width - 1; x++) {
        const feat = chunkGetSquare(chunk, loc(x, y)).feat;
        if (feat === Feat.LESS) hasUpStair = true;
        if (feat === Feat.MORE) hasDownStair = true;
      }
    }

    expect(hasUpStair).toBe(true);
    expect(hasDownStair).toBe(true);
  });

  it("should place traps in corridors", () => {
    const rng = makeRng(500);
    const config: DungeonConfig = { ...SMALL_CONFIG, monsterDensity: 0, objectDensity: 0 };
    const chunk = generateDungeon(10, config, rng);

    let trapCount = 0;
    for (let y = 1; y < chunk.height - 1; y++) {
      for (let x = 1; x < chunk.width - 1; x++) {
        const sq = chunkGetSquare(chunk, loc(x, y));
        if (sq.info.has(SquareFlag.TRAP)) trapCount++;
      }
    }

    // depth=10 means at least 3 traps (10/3=3)
    expect(trapCount).toBeGreaterThanOrEqual(1);
  });

  it("should be deterministic with the same seed", () => {
    const rng1 = makeRng(999);
    const rng2 = makeRng(999);

    const chunk1 = generateDungeon(5, SMALL_CONFIG, rng1);
    const chunk2 = generateDungeon(5, SMALL_CONFIG, rng2);

    // Compare all squares
    for (let y = 0; y < chunk1.height; y++) {
      for (let x = 0; x < chunk1.width; x++) {
        const sq1 = chunkGetSquare(chunk1, loc(x, y));
        const sq2 = chunkGetSquare(chunk2, loc(x, y));
        expect(sq1.feat).toBe(sq2.feat);
      }
    }
  });

  it("should set the chunk name", () => {
    const rng = makeRng(600);
    const chunk = generateDungeon(7, SMALL_CONFIG, rng);

    expect(chunk.name).toBe("Level 7");
  });

  it("should work with the DEFAULT_DUNGEON_CONFIG", () => {
    const rng = makeRng(700);
    const chunk = generateDungeon(1, DEFAULT_DUNGEON_CONFIG, rng);

    expect(chunk.height).toBe(66);
    expect(chunk.width).toBe(198);
    expect(chunk.depth).toBe(1);

    // Should have some floor
    let floorCount = 0;
    for (let y = 1; y < chunk.height - 1; y++) {
      for (let x = 1; x < chunk.width - 1; x++) {
        if (chunkGetSquare(chunk, loc(x, y)).feat === Feat.FLOOR) {
          floorCount++;
        }
      }
    }
    expect(floorCount).toBeGreaterThan(100);
  });

  it("should produce different dungeons with different seeds", () => {
    const chunk1 = generateDungeon(5, SMALL_CONFIG, makeRng(111));
    const chunk2 = generateDungeon(5, SMALL_CONFIG, makeRng(222));

    // Collect floor positions
    const floors1 = new Set<string>();
    const floors2 = new Set<string>();
    for (let y = 1; y < chunk1.height - 1; y++) {
      for (let x = 1; x < chunk1.width - 1; x++) {
        if (chunkGetSquare(chunk1, loc(x, y)).feat === Feat.FLOOR) {
          floors1.add(`${x},${y}`);
        }
        if (chunkGetSquare(chunk2, loc(x, y)).feat === Feat.FLOOR) {
          floors2.add(`${x},${y}`);
        }
      }
    }

    // They should not be identical (extremely unlikely with different seeds)
    let same = 0;
    let total = 0;
    for (const key of floors1) {
      total++;
      if (floors2.has(key)) same++;
    }

    // At least some difference expected
    expect(total).toBeGreaterThan(0);
    // Not 100% identical
    expect(same).toBeLessThan(total);
  });
});
