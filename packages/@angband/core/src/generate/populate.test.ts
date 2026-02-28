/**
 * Tests for generate/populate.ts — Monster, object, stair, and trap placement.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { RNG, loc, BitFlag } from "../z/index.js";
import {
  createChunk,
  chunkGetSquare,
  squareSetFeat,
  squareIsFloor,
  squareSetRoom,
} from "../cave/index.js";
import { Feat, SquareFlag } from "../types/index.js";
import type { MonsterRace, ObjectKind } from "../types/index.js";
import { setupTestFeatureInfo } from "./test-helpers.js";
import {
  populateMonsters,
  populateObjects,
  placeStairs,
  placeTraps,
} from "./populate.js";

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

/**
 * Create a small chunk with a carved-out floor area in the center.
 */
function makeChunkWithFloor(height: number, width: number): ReturnType<typeof createChunk> {
  const chunk = createChunk(height, width, 5);
  // Fill with permanent walls on border, granite inside
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
        squareSetFeat(chunk, loc(x, y), Feat.PERM);
      } else {
        squareSetFeat(chunk, loc(x, y), Feat.GRANITE);
      }
    }
  }
  // Carve a large floor area
  for (let y = 3; y < height - 3; y++) {
    for (let x = 3; x < width - 3; x++) {
      squareSetFeat(chunk, loc(x, y), Feat.FLOOR);
    }
  }
  return chunk;
}

/**
 * Create a minimal mock MonsterRace for testing.
 */
function makeMockRace(
  ridx: number,
  level: number,
  rarity: number,
): MonsterRace {
  return {
    ridx: ridx as number & { readonly __brand: "MonsterRaceId" },
    name: `test_race_${ridx}`,
    text: "",
    plural: null,
    base: {
      name: "test",
      text: "test",
      flags: new BitFlag(1),
      dChar: "t".charCodeAt(0),
    },
    avgHp: 10,
    ac: 5,
    sleep: 10,
    hearing: 20,
    smell: 20,
    speed: 110,
    light: 0,
    mexp: 10,
    freqInnate: 0,
    freqSpell: 0,
    spellPower: 0,
    flags: new BitFlag(1),
    spellFlags: new BitFlag(1),
    blows: [],
    level,
    rarity,
    dAttr: 0,
    dChar: "t".charCodeAt(0),
    maxNum: 10,
    curNum: 0,
    spellMsgs: [],
    drops: [],
    friends: [],
    friendsBase: [],
    mimicKinds: [],
    shapes: [],
    numShapes: 0,
  };
}

/**
 * Create a minimal mock ObjectKind for testing.
 */
function makeMockKind(kidx: number, level: number): ObjectKind {
  const flags = new BitFlag(39);
  const kindFlags = new BitFlag(15);
  const elInfo = Array.from({ length: 25 }, () => ({
    resLevel: 0,
    flags: new BitFlag(8),
  }));
  const modifiers = Array.from({ length: 16 }, () => ({
    base: 0, dice: 0, sides: 0, m_bonus: 0,
  }));
  return {
    name: `Mock Item ${kidx}`,
    text: "",
    base: null,
    kidx: kidx as any,
    tval: 9 as any,  // TVal.SWORD
    sval: kidx as any,
    pval: { base: 0, dice: 0, sides: 0, m_bonus: 0 },
    toH: { base: 0, dice: 0, sides: 0, m_bonus: 0 },
    toD: { base: 0, dice: 0, sides: 0, m_bonus: 0 },
    toA: { base: 0, dice: 0, sides: 0, m_bonus: 0 },
    ac: 0,
    dd: 1,
    ds: 4,
    weight: 30,
    cost: 10,
    flags,
    kindFlags,
    modifiers,
    elInfo,
    brands: null,
    slays: null,
    curses: null,
    dAttr: 1,
    dChar: "|",
    allocProb: 20,
    allocMin: 0,
    allocMax: 100,
    level,
    activation: null,
    effect: null,
    power: 0,
    effectMsg: null,
    visMsg: null,
    time: { base: 0, dice: 0, sides: 0, m_bonus: 0 },
    charge: { base: 0, dice: 0, sides: 0, m_bonus: 0 },
    genMultProb: 0,
    stackSize: { base: 1, dice: 0, sides: 0, m_bonus: 0 },
    flavor: null,
    noteAware: 0 as any,
    noteUnaware: 0 as any,
    aware: false,
    tried: false,
    ignore: 0,
    everseen: false,
  } as ObjectKind;
}

// ── Tests ──

describe("populateMonsters", () => {
  it("should place monsters on floor squares", () => {
    const chunk = makeChunkWithFloor(30, 40);
    const rng = makeRng(100);
    const races = [makeMockRace(1, 3, 1), makeMockRace(2, 5, 2)];

    const placed = populateMonsters(chunk, 5, 5, races, rng);

    expect(placed.length).toBeGreaterThan(0);
    expect(placed.length).toBeLessThanOrEqual(5);

    // All placed monsters should have valid grid positions with sq.mon set
    for (const mon of placed) {
      const sq = chunkGetSquare(chunk, mon.grid);
      expect(sq.mon).not.toBe(0);
      expect(mon.hp).toBeGreaterThan(0);
      expect(mon.race).toBeDefined();
    }
  });

  it("should return empty array when no races provided", () => {
    const chunk = makeChunkWithFloor(30, 40);
    const rng = makeRng(101);

    const placed = populateMonsters(chunk, 5, 5, [], rng);

    expect(placed.length).toBe(0);
  });

  it("should respect density parameter", () => {
    const chunk = makeChunkWithFloor(30, 40);
    const rng = makeRng(102);
    const races = [makeMockRace(1, 3, 1)];

    const placed = populateMonsters(chunk, 5, 10, races, rng);

    expect(placed.length).toBeLessThanOrEqual(10);
    expect(placed.length).toBeGreaterThan(0);
  });

  it("should increment monMax and monCnt", () => {
    const chunk = makeChunkWithFloor(30, 40);
    const rng = makeRng(103);
    const races = [makeMockRace(1, 3, 1)];

    const initialMonMax = chunk.monMax;
    const placed = populateMonsters(chunk, 5, 3, races, rng);

    expect(chunk.monMax).toBe(initialMonMax + placed.length);
    expect(chunk.monCnt).toBe(placed.length);
  });
});

describe("populateObjects", () => {
  it("should place objects on floor squares", () => {
    const chunk = makeChunkWithFloor(30, 40);
    const rng = makeRng(200);
    const kinds = [makeMockKind(1, 3), makeMockKind(2, 5)];

    const placed = populateObjects(chunk, 5, 5, kinds, rng);

    expect(placed.length).toBeGreaterThan(0);
    expect(placed.length).toBeLessThanOrEqual(5);

    // All placed squares should have an object
    for (const pos of placed) {
      const sq = chunkGetSquare(chunk, pos);
      expect(sq.obj).not.toBeNull();
    }
  });

  it("should return empty array when no kinds provided", () => {
    const chunk = makeChunkWithFloor(30, 40);
    const rng = makeRng(201);

    const placed = populateObjects(chunk, 5, 5, [], rng);

    expect(placed.length).toBe(0);
  });
});

describe("placeStairs", () => {
  it("should place up and down stairs", () => {
    const chunk = makeChunkWithFloor(30, 40);
    const upLoc = loc(10, 10);
    const downLoc = loc(30, 20);

    placeStairs(chunk, upLoc, downLoc);

    expect(chunkGetSquare(chunk, upLoc).feat).toBe(Feat.LESS);
    expect(chunkGetSquare(chunk, downLoc).feat).toBe(Feat.MORE);
  });

  it("should not crash when placing stairs at border", () => {
    const chunk = makeChunkWithFloor(30, 40);
    // These are on the permanent wall border — chunkContainsFully returns false,
    // so they should be silently skipped
    placeStairs(chunk, loc(0, 0), loc(39, 29));

    // Border squares should remain PERM
    expect(chunkGetSquare(chunk, loc(0, 0)).feat).toBe(Feat.PERM);
    expect(chunkGetSquare(chunk, loc(39, 29)).feat).toBe(Feat.PERM);
  });
});

describe("placeTraps", () => {
  it("should place traps with TRAP and INVIS flags", () => {
    const chunk = makeChunkWithFloor(30, 40);
    const rng = makeRng(300);

    // Need some corridor (non-room) floor for traps
    // By default our makeChunkWithFloor doesn't set ROOM flag,
    // so all floor is "corridor"
    const placed = placeTraps(chunk, 5, 5, rng);

    expect(placed.length).toBeGreaterThan(0);

    for (const pos of placed) {
      const sq = chunkGetSquare(chunk, pos);
      expect(sq.info.has(SquareFlag.TRAP)).toBe(true);
      expect(sq.info.has(SquareFlag.INVIS)).toBe(true);
    }
  });

  it("should not place traps in room squares", () => {
    const chunk = makeChunkWithFloor(30, 40);
    const rng = makeRng(301);

    // Mark all floor as room
    for (let y = 3; y < 27; y++) {
      for (let x = 3; x < 37; x++) {
        squareSetRoom(chunk, loc(x, y));
      }
    }

    const placed = placeTraps(chunk, 5, 3, rng);

    // Should not find corridor squares, so no traps placed
    expect(placed.length).toBe(0);
  });
});
