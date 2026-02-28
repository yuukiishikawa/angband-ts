/**
 * Tests for player/util.ts — Player utility functions.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  expForLevel,
  expForPlayerLevel,
  PLAYER_EXP,
  playerHasLOS,
  playerCanSee,
  playerOfRace,
  playerHasFlag,
  adjustStatByRace,
  adjustStatByRaceAndClass,
} from "./util.js";
import {
  TimedEffect,
  TMD_MAX,
  Stat,
  PlayerFlag,
  PY_MAX_LEVEL,
  SquareFlag,
  TerrainFlag,
  Feat,
  type FeatureId,
  type MonsterId,
} from "../types/index.js";
import type { Player, PlayerRace, Chunk, Square, FeatureType } from "../types/index.js";
import { BitFlag, loc } from "../z/index.js";
import { setFeatureTable } from "../cave/view.js";

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

function buildTestFeatureTable(): FeatureType[] {
  const table: FeatureType[] = [];
  table[Feat.NONE] = makeFeature(Feat.NONE, "nothing");
  table[Feat.FLOOR] = makeFeature(
    Feat.FLOOR, "open floor",
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE, TerrainFlag.FLOOR,
  );
  table[Feat.GRANITE] = makeFeature(
    Feat.GRANITE, "granite wall",
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.GRANITE,
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
      const feat = (ch === "#" ? Feat.GRANITE : Feat.FLOOR) as FeatureId;
      const info = new BitFlag(SquareFlag.MAX);
      if (ch === ".") info.on(SquareFlag.GLOW);
      row.push({
        feat,
        info,
        light: ch === "." ? 1 : 0,
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
    monMax: 0,
    monCnt: 0,
    monCurrent: 0,
    numRepro: 0,
    join: [],
  };
}

function createTestPlayer(overrides?: Partial<{ lev: number; expfact: number }>): Player {
  const pflags = new BitFlag(20);
  const flags = new BitFlag(128);

  return {
    race: {
      name: "Human",
      ridx: 0,
      hitDice: 10,
      expFactor: 100,
      baseAge: 14,
      modAge: 6,
      baseHeight: 72,
      modHeight: 6,
      baseWeight: 180,
      modWeight: 25,
      infra: 0,
      body: 0,
      statAdj: [0, 0, 0, 0, 0],
      skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      flags,
      pflags,
      elInfo: [],
    },
    class: {
      name: "Warrior",
      cidx: 0,
      titles: [],
      statAdj: [3, -2, -2, 2, 2],
      skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      extraSkills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      hitDice: 9,
      expFactor: 0,
      flags: new BitFlag(128),
      pflags: new BitFlag(20),
      maxAttacks: 5,
      minWeight: 30,
      attMultiply: 5,
      startItems: [],
      magic: {
        spellFirst: 1,
        spellWeight: 300,
        numBooks: 0,
        books: [],
        totalSpells: 0,
      },
    },
    grid: { x: 3, y: 3 },
    oldGrid: { x: 0, y: 0 },
    hitdie: 10,
    expfact: overrides?.expfact ?? 100,
    age: 20,
    ht: 72,
    wt: 180,
    au: 0,
    maxDepth: 0,
    recallDepth: 0,
    depth: 0,
    maxLev: overrides?.lev ?? 1,
    lev: overrides?.lev ?? 1,
    maxExp: 0,
    exp: 0,
    expFrac: 0,
    mhp: 100,
    chp: 100,
    chpFrac: 0,
    msp: 0,
    csp: 0,
    cspFrac: 0,
    statMax: [10, 10, 10, 10, 10],
    statCur: [10, 10, 10, 10, 10],
    statMap: [0, 1, 2, 3, 4],
    timed: new Array(TMD_MAX).fill(0) as number[],
    wordRecall: 0,
    deepDescent: 0,
    energy: 0,
    totalEnergy: 0,
    restingTurn: 0,
    food: 0,
    unignoring: 0,
    spellFlags: [],
    spellOrder: [],
    fullName: "Test",
    diedFrom: "",
    history: "",
    quests: [],
    totalWinner: false,
    noscore: 0,
    isDead: false,
    wizard: false,
    playerHp: [],
    auBirth: 0,
    statBirth: [10, 10, 10, 10, 10],
    htBirth: 72,
    wtBirth: 180,
    body: { name: "humanoid", count: 0, slots: [] },
    shape: null,
    state: {
      statAdd: [0, 0, 0, 0, 0],
      statInd: [10, 10, 10, 10, 10],
      statUse: [10, 10, 10, 10, 10],
      statTop: [10, 10, 10, 10, 10],
      skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      speed: 110,
      numBlows: 100,
      numShots: 10,
      numMoves: 0,
      ammoMult: 0,
      ammoTval: 0,
      ac: 0,
      damRed: 0,
      percDamRed: 0,
      toA: 0,
      toH: 0,
      toD: 0,
      seeInfra: 0,
      curLight: 1,
      heavyWield: false,
      heavyShoot: false,
      blessWield: false,
      cumberArmor: false,
      flags: new BitFlag(128),
      pflags: new BitFlag(20),
      elInfo: [],
    },
    knownState: {
      statAdd: [0, 0, 0, 0, 0],
      statInd: [10, 10, 10, 10, 10],
      statUse: [10, 10, 10, 10, 10],
      statTop: [10, 10, 10, 10, 10],
      skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      speed: 110,
      numBlows: 100,
      numShots: 10,
      numMoves: 0,
      ammoMult: 0,
      ammoTval: 0,
      ac: 0,
      damRed: 0,
      percDamRed: 0,
      toA: 0,
      toH: 0,
      toD: 0,
      seeInfra: 0,
      curLight: 1,
      heavyWield: false,
      heavyShoot: false,
      blessWield: false,
      cumberArmor: false,
      flags: new BitFlag(128),
      pflags: new BitFlag(20),
      elInfo: [],
    },
    upkeep: {
      playing: true,
      autosave: false,
      generateLevel: false,
      onlyPartial: false,
      dropping: false,
      energyUse: 0,
      newSpells: 0,
      notice: 0,
      update: 0,
      redraw: 0,
      commandWrk: 0,
      createUpStair: false,
      createDownStair: false,
      lightLevel: false,
      arenaLevel: false,
      resting: 0,
      running: 0,
      runningFirstStep: false,
      totalWeight: 0,
      invenCnt: 0,
      equipCnt: 0,
      quiverCnt: 0,
      rechargePow: 0,
      stepCount: 0,
      pathDest: { x: 0, y: 0 },
    },
  };
}

// ── Tests ──

describe("PLAYER_EXP table", () => {
  it("has PY_MAX_LEVEL entries", () => {
    expect(PLAYER_EXP).toHaveLength(PY_MAX_LEVEL);
  });

  it("is in strictly ascending order", () => {
    for (let i = 1; i < PLAYER_EXP.length; i++) {
      expect(PLAYER_EXP[i]!).toBeGreaterThan(PLAYER_EXP[i - 1]!);
    }
  });

  it("first entry is 10 (level 1 base XP)", () => {
    expect(PLAYER_EXP[0]).toBe(10);
  });

  it("last entry is 5000000 (level 50 base XP)", () => {
    expect(PLAYER_EXP[49]).toBe(5000000);
  });
});

describe("expForLevel", () => {
  it("returns base XP for level 1", () => {
    expect(expForLevel(1)).toBe(10);
  });

  it("returns base XP for level 50", () => {
    expect(expForLevel(50)).toBe(5000000);
  });

  it("returns 0 for invalid levels", () => {
    expect(expForLevel(0)).toBe(0);
    expect(expForLevel(-1)).toBe(0);
    expect(expForLevel(51)).toBe(0);
  });
});

describe("expForPlayerLevel", () => {
  it("returns base XP when expfact is 100", () => {
    const player = createTestPlayer({ expfact: 100 });
    expect(expForPlayerLevel(player, 1)).toBe(10);
    expect(expForPlayerLevel(player, 50)).toBe(5000000);
  });

  it("scales by expfact", () => {
    const player = createTestPlayer({ expfact: 130 });
    // 10 * 130 / 100 = 13
    expect(expForPlayerLevel(player, 1)).toBe(13);
  });

  it("truncates fractional values", () => {
    const player = createTestPlayer({ expfact: 110 });
    // 10 * 110 / 100 = 11
    expect(expForPlayerLevel(player, 1)).toBe(11);
  });
});

describe("playerHasLOS", () => {
  beforeEach(() => {
    setFeatureTable(buildTestFeatureTable());
  });

  it("returns true for clear line to adjacent square", () => {
    const chunk = createTestChunk([
      ".......",
      ".......",
      ".......",
      ".......",
      ".......",
      ".......",
      ".......",
    ]);
    const player = createTestPlayer();
    player.grid = { x: 3, y: 3 };

    expect(playerHasLOS(player, chunk, loc(4, 3))).toBe(true);
  });

  it("returns false when wall blocks the path", () => {
    const chunk = createTestChunk([
      ".......",
      ".......",
      ".......",
      "...#...",
      ".......",
      ".......",
      ".......",
    ]);
    const player = createTestPlayer();
    player.grid = { x: 3, y: 1 };

    expect(playerHasLOS(player, chunk, loc(3, 5))).toBe(false);
  });

  it("returns true for same square", () => {
    const chunk = createTestChunk(["."]);
    const player = createTestPlayer();
    player.grid = { x: 0, y: 0 };

    expect(playerHasLOS(player, chunk, loc(0, 0))).toBe(true);
  });
});

describe("playerCanSee", () => {
  beforeEach(() => {
    setFeatureTable(buildTestFeatureTable());
  });

  it("returns true when player has LOS and is not blind", () => {
    const chunk = createTestChunk([
      "...",
      "...",
      "...",
    ]);
    const player = createTestPlayer();
    player.grid = { x: 1, y: 1 };

    expect(playerCanSee(player, chunk, loc(2, 1))).toBe(true);
  });

  it("returns false when player is blind", () => {
    const chunk = createTestChunk([
      "...",
      "...",
      "...",
    ]);
    const player = createTestPlayer();
    player.grid = { x: 1, y: 1 };
    player.timed[TimedEffect.BLIND] = 10;

    expect(playerCanSee(player, chunk, loc(2, 1))).toBe(false);
  });
});

describe("playerOfRace", () => {
  it("returns true when race matches", () => {
    const player = createTestPlayer();
    expect(playerOfRace(player, 0)).toBe(true);
  });

  it("returns false when race does not match", () => {
    const player = createTestPlayer();
    expect(playerOfRace(player, 5)).toBe(false);
  });
});

describe("playerHasFlag", () => {
  it("returns false when flag is not set", () => {
    const player = createTestPlayer();
    expect(playerHasFlag(player, PlayerFlag.ZERO_FAIL)).toBe(false);
  });

  it("returns true when flag is set", () => {
    const player = createTestPlayer();
    player.state.pflags.on(PlayerFlag.ZERO_FAIL);
    expect(playerHasFlag(player, PlayerFlag.ZERO_FAIL)).toBe(true);
  });
});

describe("adjustStatByRace", () => {
  it("returns base when race has no modifier", () => {
    const race: PlayerRace = {
      name: "Human",
      ridx: 0,
      hitDice: 10,
      expFactor: 100,
      baseAge: 14,
      modAge: 6,
      baseHeight: 72,
      modHeight: 6,
      baseWeight: 180,
      modWeight: 25,
      infra: 0,
      body: 0,
      statAdj: [0, 0, 0, 0, 0],
      skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      flags: new BitFlag(128),
      pflags: new BitFlag(20),
      elInfo: [],
    };

    expect(adjustStatByRace(10, race, Stat.STR)).toBe(10);
  });

  it("adds racial modifier", () => {
    const race: PlayerRace = {
      name: "Dwarf",
      ridx: 3,
      hitDice: 11,
      expFactor: 120,
      baseAge: 35,
      modAge: 15,
      baseHeight: 48,
      modHeight: 3,
      baseWeight: 150,
      modWeight: 10,
      infra: 5,
      body: 0,
      statAdj: [2, -3, 2, -2, 2],
      skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      flags: new BitFlag(128),
      pflags: new BitFlag(20),
      elInfo: [],
    };

    expect(adjustStatByRace(10, race, Stat.STR)).toBe(12);
    expect(adjustStatByRace(10, race, Stat.INT)).toBe(7);
    expect(adjustStatByRace(10, race, Stat.CON)).toBe(12);
  });

  it("returns base for invalid stat", () => {
    const race: PlayerRace = {
      name: "Human",
      ridx: 0,
      hitDice: 10,
      expFactor: 100,
      baseAge: 14,
      modAge: 6,
      baseHeight: 72,
      modHeight: 6,
      baseWeight: 180,
      modWeight: 25,
      infra: 0,
      body: 0,
      statAdj: [0, 0, 0, 0, 0],
      skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      flags: new BitFlag(128),
      pflags: new BitFlag(20),
      elInfo: [],
    };

    expect(adjustStatByRace(10, race, -1 as Stat)).toBe(10);
    expect(adjustStatByRace(10, race, 99 as Stat)).toBe(10);
  });
});

describe("adjustStatByRaceAndClass", () => {
  it("combines race and class modifiers", () => {
    const player = createTestPlayer();
    // Race statAdj = [0,0,0,0,0], Class statAdj = [3,-2,-2,2,2]
    expect(adjustStatByRaceAndClass(10, player, Stat.STR)).toBe(13);
    expect(adjustStatByRaceAndClass(10, player, Stat.INT)).toBe(8);
    expect(adjustStatByRaceAndClass(10, player, Stat.DEX)).toBe(12);
  });
});
