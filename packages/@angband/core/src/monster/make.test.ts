/**
 * Tests for monster/make.ts — Monster creation, placement, and deletion
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loc, RNG, BitFlag } from "../z/index.js";
import type {
  Chunk,
  Square,
  FeatureType,
  MonsterRace,
  MonsterBase,
  MonsterBlow,
} from "../types/index.js";
import {
  SquareFlag,
  TerrainFlag,
  Feat,
  MonsterRaceFlag,
  MonsterTimedEffect,
  type FeatureId,
  type MonsterId,
  type MonsterRaceId,
} from "../types/index.js";
import { setFeatureInfo } from "../cave/index.js";
import {
  isValidSpawnPoint,
  findSpawnPoint,
  createMonster,
  placeNewMonster,
  pickMonsterRace,
  placeMonsterGroup,
  deleteMonster,
} from "./make.js";

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
  table[Feat.GRANITE] = makeFeature(
    Feat.GRANITE,
    "granite wall",
    TerrainFlag.WALL,
    TerrainFlag.ROCK,
    TerrainFlag.GRANITE,
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
        default:
          feat = Feat.FLOOR as FeatureId;
      }
      row.push({
        feat,
        info: new BitFlag(SquareFlag.MAX),
        light: 0,
        mon: 0 as MonsterId,
        obj: null,
        trap: null,
      });
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
    monMax: 1,
    monCnt: 0,
    monCurrent: -1,
    numRepro: 0,
    join: [],
  };
}

function createTestBase(): MonsterBase {
  return {
    name: "test",
    text: "Test monster",
    flags: new BitFlag(MonsterRaceFlag.RF_MAX),
    dChar: "t".charCodeAt(0),
  };
}

function createTestRace(overrides: Partial<MonsterRace> = {}): MonsterRace {
  const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
  const spellFlags = new BitFlag(128);

  return {
    ridx: 1 as MonsterRaceId,
    name: "Test Monster",
    text: "A test monster.",
    plural: null,
    base: createTestBase(),
    avgHp: 20,
    ac: 10,
    sleep: 5,
    hearing: 20,
    smell: 20,
    speed: 110,
    light: 0,
    mexp: 10,
    freqInnate: 0,
    freqSpell: 0,
    spellPower: 0,
    flags,
    spellFlags,
    blows: [],
    level: 1,
    rarity: 1,
    dAttr: 0,
    dChar: "t".charCodeAt(0),
    maxNum: 100,
    curNum: 0,
    spellMsgs: [],
    drops: [],
    friends: [],
    friendsBase: [],
    mimicKinds: [],
    shapes: [],
    numShapes: 0,
    ...overrides,
  };
}

let rng: RNG;

beforeEach(() => {
  setFeatureInfo(buildTestFeatureTable());
  rng = new RNG();
  rng.stateInit(42);
  rng.quick = false;
});

// ── isValidSpawnPoint ──

describe("isValidSpawnPoint", () => {
  it("should accept a valid floor square", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    expect(isValidSpawnPoint(chunk, loc(2, 2))).toBe(true);
  });

  it("should reject wall squares", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    expect(isValidSpawnPoint(chunk, loc(0, 0))).toBe(false);
  });

  it("should reject border squares", () => {
    const chunk = createTestChunk([
      "...",
      "...",
      "...",
    ]);
    // Border locations: x=0, x=2, y=0, y=2
    expect(isValidSpawnPoint(chunk, loc(0, 1))).toBe(false);
    expect(isValidSpawnPoint(chunk, loc(2, 1))).toBe(false);
  });

  it("should reject occupied squares", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    chunk.squares[2]![2]!.mon = 1 as MonsterId;
    expect(isValidSpawnPoint(chunk, loc(2, 2))).toBe(false);
  });

  it("should reject MON_RESTRICT squares", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    chunk.squares[2]![2]!.info.on(SquareFlag.MON_RESTRICT);
    expect(isValidSpawnPoint(chunk, loc(2, 2))).toBe(false);
  });
});

// ── createMonster ──

describe("createMonster", () => {
  it("should create a monster with stats from the race", () => {
    const race = createTestRace({ avgHp: 100, speed: 120 });
    const mon = createMonster(race, rng);

    expect(mon.race).toBe(race);
    expect(mon.originalRace).toBeNull();
    expect(mon.mspeed).toBe(120);
    expect(mon.hp).toBeGreaterThan(0);
    expect(mon.hp).toBe(mon.maxhp);
  });

  it("should randomise HP around the average", () => {
    const race = createTestRace({ avgHp: 100 });
    const hps = new Set<number>();

    for (let i = 0; i < 20; i++) {
      const mon = createMonster(race, rng);
      hps.add(mon.hp);
    }

    // With 20 rolls and a spread of 12, we should get multiple distinct values
    expect(hps.size).toBeGreaterThan(1);
  });

  it("should apply sleep from race", () => {
    const race = createTestRace({ sleep: 10 });
    const mon = createMonster(race, rng);

    expect(mon.mTimed[MonsterTimedEffect.SLEEP]).toBeGreaterThan(0);
  });

  it("should set zero sleep for race.sleep = 0", () => {
    const race = createTestRace({ sleep: 0 });
    const mon = createMonster(race, rng);

    expect(mon.mTimed[MonsterTimedEffect.SLEEP]).toBe(0);
  });
});

// ── placeNewMonster ──

describe("placeNewMonster", () => {
  it("should place a monster and update the chunk", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    const race = createTestRace();
    const mon = placeNewMonster(chunk, loc(2, 2), race, false, false, 0, rng);

    expect(mon).not.toBeNull();
    expect(mon!.grid).toEqual(loc(2, 2));
    expect(chunk.squares[2]![2]!.mon).toBe(mon!.midx);
    expect(chunk.monCnt).toBe(1);
    expect(race.curNum).toBe(1);
  });

  it("should return null for invalid location", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    const race = createTestRace();
    const mon = placeNewMonster(chunk, loc(0, 0), race, false, false, 0, rng);

    expect(mon).toBeNull();
    expect(chunk.monCnt).toBe(0);
  });

  it("should put the monster to sleep when sleep=true", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    const race = createTestRace({ sleep: 20 });
    const mon = placeNewMonster(chunk, loc(2, 2), race, true, false, 0, rng);

    expect(mon).not.toBeNull();
    expect(mon!.mTimed[MonsterTimedEffect.SLEEP]).toBeGreaterThan(0);
  });

  it("should force sleep for FORCE_SLEEP races", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
    flags.on(MonsterRaceFlag.FORCE_SLEEP);
    const race = createTestRace({ flags, sleep: 15 });
    const mon = placeNewMonster(chunk, loc(2, 2), race, false, false, 0, rng);

    expect(mon).not.toBeNull();
    expect(mon!.mTimed[MonsterTimedEffect.SLEEP]).toBeGreaterThan(0);
  });
});

// ── pickMonsterRace ──

describe("pickMonsterRace", () => {
  it("should pick a race appropriate for the depth", () => {
    const races = [
      createTestRace({ ridx: 1 as MonsterRaceId, level: 1, rarity: 1, name: "Shallow" }),
      createTestRace({ ridx: 2 as MonsterRaceId, level: 5, rarity: 1, name: "Mid" }),
      createTestRace({ ridx: 3 as MonsterRaceId, level: 50, rarity: 1, name: "Deep" }),
    ];

    // At depth 3, only the shallow monster should be eligible
    const picked = pickMonsterRace(3, races, rng);
    expect(picked).not.toBeNull();
    expect(picked!.level).toBeLessThanOrEqual(3 + 5); // allow for OOD boost
  });

  it("should return null when no races are appropriate", () => {
    const races = [
      createTestRace({ ridx: 1 as MonsterRaceId, level: 50, rarity: 1 }),
    ];

    const picked = pickMonsterRace(1, races, rng);
    expect(picked).toBeNull();
  });

  it("should skip races with rarity 0", () => {
    const races = [
      createTestRace({ ridx: 1 as MonsterRaceId, level: 1, rarity: 0 }),
    ];

    const picked = pickMonsterRace(5, races, rng);
    expect(picked).toBeNull();
  });

  it("should respect UNIQUE max count", () => {
    const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
    flags.on(MonsterRaceFlag.UNIQUE);
    const race = createTestRace({
      ridx: 1 as MonsterRaceId,
      level: 1,
      rarity: 1,
      flags,
      maxNum: 1,
      curNum: 1,
    });

    const picked = pickMonsterRace(5, [race], rng);
    expect(picked).toBeNull();
  });

  it("should respect FORCE_DEPTH", () => {
    const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
    flags.on(MonsterRaceFlag.FORCE_DEPTH);
    const race = createTestRace({
      ridx: 1 as MonsterRaceId,
      level: 10,
      rarity: 1,
      flags,
    });

    // Generated level might be boosted up to ~14, but current_level is 5
    // FORCE_DEPTH checks race.level > depth (current_level)
    const picked = pickMonsterRace(5, [race], rng);
    expect(picked).toBeNull();
  });
});

// ── placeMonsterGroup ──

describe("placeMonsterGroup", () => {
  it("should place multiple monsters of the same race", () => {
    const chunk = createTestChunk([
      "#########",
      "#.......#",
      "#.......#",
      "#.......#",
      "#.......#",
      "#.......#",
      "#.......#",
      "#.......#",
      "#########",
    ]);
    const race = createTestRace();
    const placed = placeMonsterGroup(chunk, loc(4, 4), race, 3, rng);

    expect(placed.length).toBeGreaterThan(0);
    expect(placed.length).toBeLessThanOrEqual(3);

    // All should be on valid squares
    for (const mon of placed) {
      expect(chunk.squares[mon.grid.y]![mon.grid.x]!.mon).toBe(mon.midx);
    }
  });

  it("should place fewer members when space is limited", () => {
    const chunk = createTestChunk([
      "#####",
      "#.#.#",
      "#...#",
      "#.#.#",
      "#####",
    ]);
    const race = createTestRace();
    // Center (2,2) with limited adjacent floor squares
    // Walls at (2,1), (2,3) block some spots
    const placed = placeMonsterGroup(chunk, loc(2, 2), race, 10, rng);

    // Should place some but definitely fewer than requested 10
    // Only 4 open adjacent squares: (1,1), (3,1), (1,3), (3,3) minus any occupied
    expect(placed.length).toBeLessThan(10);
    expect(placed.length).toBeGreaterThan(0);

    // All placed monsters should be on valid floor squares
    for (const mon of placed) {
      const sq = chunk.squares[mon.grid.y]![mon.grid.x]!;
      expect(sq.feat).toBe(Feat.FLOOR as FeatureId);
    }
  });
});

// ── deleteMonster ──

describe("deleteMonster", () => {
  it("should remove a monster from the chunk", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    const race = createTestRace();
    const mon = placeNewMonster(chunk, loc(2, 2), race, false, false, 0, rng)!;

    expect(chunk.monCnt).toBe(1);
    expect(chunk.squares[2]![2]!.mon).toBe(mon.midx);

    deleteMonster(chunk, mon);

    expect(chunk.monCnt).toBe(0);
    expect(chunk.squares[2]![2]!.mon).toBe(0);
    expect(race.curNum).toBe(0);
  });

  it("should decrement breeder count for MULTIPLY monsters", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
    flags.on(MonsterRaceFlag.MULTIPLY);
    const race = createTestRace({ flags });
    const mon = placeNewMonster(chunk, loc(2, 2), race, false, false, 0, rng)!;

    expect(chunk.numRepro).toBe(1);

    deleteMonster(chunk, mon);

    expect(chunk.numRepro).toBe(0);
  });
});
