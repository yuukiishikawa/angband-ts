/**
 * Tests for project/monster.ts — Projection effects on monsters
 */
import { describe, it, expect } from "vitest";
import { projectMonster } from "./monster.js";
import { loc } from "../z/index.js";
import { RNG, BitFlag } from "../z/index.js";
import type { Chunk, Square, Monster, MonsterRace, MonsterBase } from "../types/index.js";
import {
  SquareFlag,
  Feat,
  Element,
  MonsterRaceFlag,
  type FeatureId,
  type MonsterId,
  type MonsterRaceId,
} from "../types/index.js";

// ── Test helpers ──

function createRNG(): RNG {
  const rng = new RNG();
  rng.stateInit(42);
  rng.quick = false;
  return rng;
}

function createSquare(feat: Feat, mon: number = 0): Square {
  return {
    feat: feat as FeatureId,
    info: new BitFlag(SquareFlag.MAX),
    light: 0,
    mon: mon as MonsterId,
    obj: null,
    trap: null,
  };
}

function createSingleGridChunk(feat: Feat, mon: number = 0): Chunk {
  const sq = createSquare(feat, mon);
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

function createMonsterBase(): MonsterBase {
  return {
    name: "test_base",
    text: "Test base",
    flags: new BitFlag(MonsterRaceFlag.RF_MAX),
    dChar: 0x54, // 'T'
  };
}

function createMonsterRace(
  ...flags: MonsterRaceFlag[]
): MonsterRace {
  const bf = new BitFlag(MonsterRaceFlag.RF_MAX);
  for (const f of flags) bf.on(f);
  return {
    ridx: 1 as MonsterRaceId,
    name: "Test Monster",
    text: "A test monster.",
    plural: null,
    base: createMonsterBase(),
    avgHp: 100,
    ac: 10,
    sleep: 0,
    hearing: 20,
    smell: 20,
    speed: 110,
    light: 0,
    mexp: 50,
    freqInnate: 0,
    freqSpell: 0,
    spellPower: 0,
    flags: bf,
    spellFlags: new BitFlag(1),
    blows: [],
    level: 1,
    rarity: 1,
    dAttr: 0,
    dChar: 0x54,
    maxNum: 10,
    curNum: 1,
    spellMsgs: [],
    drops: [],
    friends: [],
    friendsBase: [],
    mimicKinds: [],
    shapes: [],
    numShapes: 0,
  };
}

function createMonster(
  hp: number,
  ...flags: MonsterRaceFlag[]
): Monster {
  const race = createMonsterRace(...flags);
  return {
    race,
    originalRace: null,
    midx: 1 as MonsterId,
    grid: loc(0, 0),
    hp,
    maxhp: hp,
    mTimed: new Int16Array(10),
    mspeed: 110,
    energy: 0,
    cdis: 0,
    mflag: new BitFlag(16),
    mimickedObjIdx: 0,
    heldObjIdx: 0,
    attr: 0,
    target: { grid: loc(0, 0), midx: 0 as MonsterId },
    groupInfo: [],
    minRange: 0,
    bestRange: 0,
  };
}

// ── Tests ──

describe("projectMonster", () => {
  it("returns no damage when there is no monster", () => {
    const chunk = createSingleGridChunk(Feat.FLOOR, 0);
    const rng = createRNG();
    const result = projectMonster(chunk, loc(0, 0), Element.FIRE, 50, loc(5, 5), rng);
    expect(result.damage).toBe(0);
    expect(result.killed).toBe(false);
  });

  it("applies base damage without monster reference", () => {
    const chunk = createSingleGridChunk(Feat.FLOOR, 1);
    const rng = createRNG();
    const result = projectMonster(chunk, loc(0, 0), Element.FIRE, 50, loc(5, 5), rng);
    // Without a monster reference, just returns base damage
    expect(result.damage).toBe(50);
    expect(result.killed).toBe(false);
  });

  it("deals normal damage to a monster without resistances", () => {
    const chunk = createSingleGridChunk(Feat.FLOOR, 1);
    const rng = createRNG();
    const monster = createMonster(100);
    const result = projectMonster(
      chunk, loc(0, 0), Element.FIRE, 50, loc(5, 5), rng, monster,
    );
    expect(result.damage).toBe(50);
    expect(result.killed).toBe(false);
    expect(monster.hp).toBe(50);
  });

  it("deals zero damage to an immune monster", () => {
    const chunk = createSingleGridChunk(Feat.FLOOR, 1);
    const rng = createRNG();
    const monster = createMonster(100, MonsterRaceFlag.IM_FIRE);
    const result = projectMonster(
      chunk, loc(0, 0), Element.FIRE, 50, loc(5, 5), rng, monster,
    );
    expect(result.damage).toBe(0);
    expect(result.resisted).toBe(true);
    expect(monster.hp).toBe(100);
  });

  it("deals double damage to a vulnerable monster", () => {
    const chunk = createSingleGridChunk(Feat.FLOOR, 1);
    const rng = createRNG();
    const monster = createMonster(200, MonsterRaceFlag.HURT_FIRE);
    const result = projectMonster(
      chunk, loc(0, 0), Element.FIRE, 50, loc(5, 5), rng, monster,
    );
    expect(result.damage).toBe(100);
    expect(monster.hp).toBe(100);
  });

  it("kills a monster when damage exceeds HP", () => {
    const chunk = createSingleGridChunk(Feat.FLOOR, 1);
    const rng = createRNG();
    const monster = createMonster(30);
    const result = projectMonster(
      chunk, loc(0, 0), Element.FIRE, 50, loc(5, 5), rng, monster,
    );
    expect(result.killed).toBe(true);
    expect(monster.hp).toBe(0);
    // Monster should be cleared from the square
    expect(chunk.squares[0]![0]!.mon).toBe(0);
  });

  it("handles acid immunity", () => {
    const chunk = createSingleGridChunk(Feat.FLOOR, 1);
    const rng = createRNG();
    const monster = createMonster(100, MonsterRaceFlag.IM_ACID);
    const result = projectMonster(
      chunk, loc(0, 0), Element.ACID, 50, loc(5, 5), rng, monster,
    );
    expect(result.damage).toBe(0);
    expect(result.resisted).toBe(true);
  });

  it("handles cold vulnerability", () => {
    const chunk = createSingleGridChunk(Feat.FLOOR, 1);
    const rng = createRNG();
    const monster = createMonster(200, MonsterRaceFlag.HURT_COLD);
    const result = projectMonster(
      chunk, loc(0, 0), Element.COLD, 50, loc(5, 5), rng, monster,
    );
    expect(result.damage).toBe(100);
  });

  it("handles holy orb extra damage to evil monsters", () => {
    const chunk = createSingleGridChunk(Feat.FLOOR, 1);
    const rng = createRNG();
    const monster = createMonster(500, MonsterRaceFlag.EVIL);
    const result = projectMonster(
      chunk, loc(0, 0), Element.HOLY_ORB, 50, loc(5, 5), rng, monster,
    );
    // Evil monsters take double damage from holy orb
    expect(result.damage).toBe(100);
  });

  it("handles elements with no immunity flag gracefully", () => {
    const chunk = createSingleGridChunk(Feat.FLOOR, 1);
    const rng = createRNG();
    const monster = createMonster(100);
    const result = projectMonster(
      chunk, loc(0, 0), Element.MISSILE, 50, loc(5, 5), rng, monster,
    );
    expect(result.damage).toBe(50);
    expect(result.resisted).toBe(false);
  });
});
