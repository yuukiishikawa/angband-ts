/**
 * Tests for monster/move.ts — Monster movement AI
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loc, RNG, BitFlag } from "../z/index.js";
import type {
  Chunk,
  Square,
  FeatureType,
  MonsterRace,
  MonsterBase,
  Monster,
} from "../types/index.js";
import {
  SquareFlag,
  TerrainFlag,
  Feat,
  MonsterRaceFlag,
  MonsterTimedEffect,
  MonsterTempFlag,
  MonsterGroupRole,
  type FeatureId,
  type MonsterId,
  type MonsterRaceId,
} from "../types/index.js";
import { setFeatureInfo } from "../cave/index.js";
import { createMonster, placeNewMonster } from "./make.js";
import {
  monsterCanMove,
  monsterFindPath,
  monsterMove,
  monsterTakeTurn,
  type MonsterAction,
} from "./move.js";

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
        case "+":
          feat = Feat.CLOSED as FeatureId;
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

function createTestRace(overrides: Partial<MonsterRace> = {}): MonsterRace {
  const flags = overrides.flags ?? new BitFlag(MonsterRaceFlag.RF_MAX);
  const spellFlags = new BitFlag(128);

  return {
    ridx: 1 as MonsterRaceId,
    name: "Test Monster",
    text: "A test monster.",
    plural: null,
    base: {
      name: "test",
      text: "Test monster",
      flags: new BitFlag(MonsterRaceFlag.RF_MAX),
      dChar: "t".charCodeAt(0),
    },
    avgHp: 20,
    ac: 10,
    sleep: 0,
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

/** Place a monster directly onto a chunk and return it. */
function placeMonster(
  chunk: Chunk,
  monLoc: { x: number; y: number },
  race: MonsterRace,
  rng: RNG,
): Monster {
  const mon = placeNewMonster(chunk, loc(monLoc.x, monLoc.y), race, false, false, 0, rng);
  if (!mon) throw new Error(`Failed to place monster at (${monLoc.x}, ${monLoc.y})`);
  // Ensure the monster is awake for tests
  mon.mTimed[MonsterTimedEffect.SLEEP] = 0;
  return mon;
}

let rng: RNG;

beforeEach(() => {
  setFeatureInfo(buildTestFeatureTable());
  rng = new RNG();
  rng.stateInit(42);
  rng.quick = false;
});

// ── monsterCanMove ──

describe("monsterCanMove", () => {
  it("should allow movement to passable squares", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    const race = createTestRace();
    const mon = placeMonster(chunk, { x: 2, y: 2 }, race, rng);

    expect(monsterCanMove(chunk, mon, loc(2, 1))).toBe(true);
    expect(monsterCanMove(chunk, mon, loc(3, 2))).toBe(true);
  });

  it("should reject movement to wall squares", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    const race = createTestRace();
    const mon = placeMonster(chunk, { x: 1, y: 1 }, race, rng);

    expect(monsterCanMove(chunk, mon, loc(0, 0))).toBe(false);
    expect(monsterCanMove(chunk, mon, loc(1, 0))).toBe(false);
  });

  it("should allow PASS_WALL monsters through walls", () => {
    const chunk = createTestChunk([
      "#######",
      "#.....#",
      "#.#...#",
      "#.....#",
      "#.....#",
      "#.....#",
      "#######",
    ]);
    const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
    flags.on(MonsterRaceFlag.PASS_WALL);
    const race = createTestRace({ flags });
    const mon = placeMonster(chunk, { x: 1, y: 2 }, race, rng);

    // Interior wall at (2,2) should be passable for PASS_WALL
    expect(monsterCanMove(chunk, mon, loc(2, 2))).toBe(true);
    // Border wall should still be rejected (not fully in bounds)
    expect(monsterCanMove(chunk, mon, loc(0, 2))).toBe(false);
  });

  it("should prevent NEVER_MOVE monsters from moving", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
    flags.on(MonsterRaceFlag.NEVER_MOVE);
    const race = createTestRace({ flags });
    const mon = placeMonster(chunk, { x: 2, y: 2 }, race, rng);

    expect(monsterCanMove(chunk, mon, loc(2, 1))).toBe(false);
    expect(monsterCanMove(chunk, mon, loc(3, 2))).toBe(false);
  });

  it("should allow OPEN_DOOR monsters to move to closed doors", () => {
    const chunk = createTestChunk([
      "#####",
      "#.+.#",
      "#...#",
      "#####",
    ]);
    const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
    flags.on(MonsterRaceFlag.OPEN_DOOR);
    const race = createTestRace({ flags });
    const mon = placeMonster(chunk, { x: 1, y: 1 }, race, rng);

    expect(monsterCanMove(chunk, mon, loc(2, 1))).toBe(true);
  });

  it("should reject movement to out-of-bounds", () => {
    const chunk = createTestChunk([
      "...",
      "...",
      "...",
    ]);
    const race = createTestRace();
    const mon = placeMonster(chunk, { x: 1, y: 1 }, race, rng);

    expect(monsterCanMove(chunk, mon, loc(-1, 1))).toBe(false);
    expect(monsterCanMove(chunk, mon, loc(1, -1))).toBe(false);
    expect(monsterCanMove(chunk, mon, loc(3, 1))).toBe(false);
  });
});

// ── monsterFindPath ──

describe("monsterFindPath", () => {
  it("should find a step toward the target", () => {
    const chunk = createTestChunk([
      "#######",
      "#.....#",
      "#.....#",
      "#.....#",
      "#.....#",
      "#.....#",
      "#######",
    ]);
    const race = createTestRace();
    const mon = placeMonster(chunk, { x: 1, y: 1 }, race, rng);

    const next = monsterFindPath(chunk, mon, loc(5, 5));
    expect(next).not.toBeNull();

    // The step should be closer to (5,5) than the current position
    const oldDist = Math.max(Math.abs(1 - 5), Math.abs(1 - 5));
    const newDist = Math.max(Math.abs(next!.x - 5), Math.abs(next!.y - 5));
    expect(newDist).toBeLessThan(oldDist);
  });

  it("should return null when completely stuck", () => {
    const chunk = createTestChunk([
      "###",
      "#.#",
      "###",
    ]);
    const race = createTestRace();
    const mon = placeMonster(chunk, { x: 1, y: 1 }, race, rng);

    const next = monsterFindPath(chunk, mon, loc(0, 0));
    expect(next).toBeNull();
  });

  it("should be adjacent to the monster's current position", () => {
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
    const mon = placeMonster(chunk, { x: 4, y: 4 }, race, rng);

    const next = monsterFindPath(chunk, mon, loc(1, 1));
    expect(next).not.toBeNull();

    const dx = Math.abs(next!.x - 4);
    const dy = Math.abs(next!.y - 4);
    expect(dx).toBeLessThanOrEqual(1);
    expect(dy).toBeLessThanOrEqual(1);
  });
});

// ── monsterMove ──

describe("monsterMove", () => {
  it("should update monster position and square references", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    const race = createTestRace();
    const mon = placeMonster(chunk, { x: 2, y: 2 }, race, rng);
    const midx = mon.midx;

    monsterMove(chunk, mon, loc(3, 2));

    // Old square should be cleared
    expect(chunk.squares[2]![2]!.mon).toBe(0);
    // New square should reference the monster
    expect(chunk.squares[2]![3]!.mon).toBe(midx);
    // Monster's grid should be updated
    expect(mon.grid).toEqual(loc(3, 2));
  });
});

// ── monsterTakeTurn ──

describe("monsterTakeTurn", () => {
  it("sleeping monsters should idle", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    const race = createTestRace();
    const mon = placeMonster(chunk, { x: 2, y: 2 }, race, rng);
    mon.mTimed[MonsterTimedEffect.SLEEP] = 5;

    const action = monsterTakeTurn(chunk, mon, loc(1, 1), rng);
    expect(action.type).toBe("idle");
    expect(mon.mTimed[MonsterTimedEffect.SLEEP]).toBe(4);
  });

  it("held monsters should idle", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    const race = createTestRace();
    const mon = placeMonster(chunk, { x: 2, y: 2 }, race, rng);
    mon.mTimed[MonsterTimedEffect.HOLD] = 3;

    const action = monsterTakeTurn(chunk, mon, loc(1, 1), rng);
    expect(action.type).toBe("idle");
    expect(mon.mTimed[MonsterTimedEffect.HOLD]).toBe(2);
  });

  it("adjacent awake monsters should attack the player", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    const race = createTestRace();
    const mon = placeMonster(chunk, { x: 2, y: 2 }, race, rng);
    const playerLoc = loc(2, 1);

    const action = monsterTakeTurn(chunk, mon, playerLoc, rng);
    expect(action.type).toBe("attack");
    if (action.type === "attack") {
      expect(action.target).toEqual(playerLoc);
    }
  });

  it("distant awake monsters should move toward the player", () => {
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
    const mon = placeMonster(chunk, { x: 6, y: 6 }, race, rng);
    const playerLoc = loc(1, 1);

    const action = monsterTakeTurn(chunk, mon, playerLoc, rng);
    expect(action.type).toBe("move");
    if (action.type === "move") {
      // The move should bring it closer
      const oldDist = Math.max(Math.abs(6 - 1), Math.abs(6 - 1));
      const newDist = Math.max(
        Math.abs(action.target.x - 1),
        Math.abs(action.target.y - 1),
      );
      expect(newDist).toBeLessThan(oldDist);
    }
  });

  it("NEVER_BLOW adjacent monsters should try to flee", () => {
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
    const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
    flags.on(MonsterRaceFlag.NEVER_BLOW);
    const race = createTestRace({ flags });
    const mon = placeMonster(chunk, { x: 2, y: 2 }, race, rng);
    const playerLoc = loc(2, 1);

    const action = monsterTakeTurn(chunk, mon, playerLoc, rng);
    // Should flee rather than attack
    expect(action.type).not.toBe("attack");
  });

  it("frightened monsters should flee", () => {
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
    const mon = placeMonster(chunk, { x: 4, y: 4 }, race, rng);
    mon.mTimed[MonsterTimedEffect.FEAR] = 10;
    const playerLoc = loc(3, 3);

    const action = monsterTakeTurn(chunk, mon, playerLoc, rng);
    if (action.type === "move") {
      // Should move away from player
      const oldDist = Math.max(Math.abs(4 - 3), Math.abs(4 - 3));
      const newDist = Math.max(
        Math.abs(action.target.x - 3),
        Math.abs(action.target.y - 3),
      );
      expect(newDist).toBeGreaterThanOrEqual(oldDist);
    }
    // Idle is also acceptable if there is no valid flee direction
    expect(["move", "idle"]).toContain(action.type);
  });

  it("confused monsters should move randomly", () => {
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
    const mon = placeMonster(chunk, { x: 4, y: 4 }, race, rng);
    mon.mTimed[MonsterTimedEffect.CONF] = 5;

    const action = monsterTakeTurn(chunk, mon, loc(1, 1), rng);
    // Should move (not attack directly) or idle
    expect(["move", "idle"]).toContain(action.type);
    // Confusion should be decremented
    expect(mon.mTimed[MonsterTimedEffect.CONF]).toBe(4);
  });

  it("NEVER_MOVE monsters adjacent to player should attack", () => {
    const chunk = createTestChunk([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
    const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
    flags.on(MonsterRaceFlag.NEVER_MOVE);
    const race = createTestRace({ flags });
    const mon = placeMonster(chunk, { x: 2, y: 2 }, race, rng);
    const playerLoc = loc(2, 1);

    const action = monsterTakeTurn(chunk, mon, playerLoc, rng);
    expect(action.type).toBe("attack");
  });

  it("NEVER_MOVE monsters far from player should idle", () => {
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
    const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
    flags.on(MonsterRaceFlag.NEVER_MOVE);
    const race = createTestRace({ flags });
    const mon = placeMonster(chunk, { x: 6, y: 6 }, race, rng);
    const playerLoc = loc(1, 1);

    const action = monsterTakeTurn(chunk, mon, playerLoc, rng);
    expect(action.type).toBe("idle");
  });
});
