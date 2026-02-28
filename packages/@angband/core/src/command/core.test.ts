/**
 * Tests for command/core.ts — Command dispatcher.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loc } from "../z/index.js";
import { RNG } from "../z/index.js";
import { BitFlag } from "../z/index.js";
import { createChunk, chunkGetSquare, setFeatureInfo } from "../cave/index.js";
import { Feat, TerrainFlag, SquareFlag } from "../types/index.js";
import type { FeatureType, FeatureId, MonsterId, Player, Chunk } from "../types/index.js";
import {
  CommandType,
  executeCommand,
  commandVerb,
  COMMAND_INFO,
  successResult,
  failResult,
} from "./core.js";
import type { GameCommand } from "./core.js";

// ── Test helpers ──

function buildTestFeatureInfo(): FeatureType[] {
  const features: FeatureType[] = [];

  function makeFeat(
    fidx: number,
    name: string,
    flags: TerrainFlag[],
  ): FeatureType {
    const bf = new BitFlag(TerrainFlag.MAX);
    for (const f of flags) bf.on(f);
    return {
      name, desc: "", fidx: fidx as FeatureId, mimic: null,
      priority: 0, shopnum: 0, dig: 0, flags: bf,
      dAttr: 0, dChar: ".", walkMsg: "", runMsg: "",
      hurtMsg: "", dieMsg: "", confusedMsg: "",
      lookPrefix: "", lookInPreposition: "", resistFlag: -1,
    };
  }

  features[Feat.NONE] = makeFeat(Feat.NONE, "nothing", []);
  features[Feat.FLOOR] = makeFeat(Feat.FLOOR, "open floor", [
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE,
    TerrainFlag.EASY, TerrainFlag.TRAP, TerrainFlag.OBJECT,
    TerrainFlag.TORCH, TerrainFlag.FLOOR,
  ]);
  features[Feat.CLOSED] = makeFeat(Feat.CLOSED, "closed door", [
    TerrainFlag.DOOR_ANY, TerrainFlag.DOOR_CLOSED, TerrainFlag.INTERESTING,
  ]);
  features[Feat.OPEN] = makeFeat(Feat.OPEN, "open door", [
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE,
    TerrainFlag.EASY, TerrainFlag.DOOR_ANY, TerrainFlag.CLOSABLE,
    TerrainFlag.OBJECT, TerrainFlag.INTERESTING,
  ]);
  features[Feat.BROKEN] = makeFeat(Feat.BROKEN, "broken door", [
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE,
    TerrainFlag.EASY, TerrainFlag.DOOR_ANY, TerrainFlag.OBJECT,
    TerrainFlag.INTERESTING,
  ]);
  features[Feat.LESS] = makeFeat(Feat.LESS, "up staircase", [
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE,
    TerrainFlag.EASY, TerrainFlag.STAIR, TerrainFlag.UPSTAIR,
    TerrainFlag.INTERESTING,
  ]);
  features[Feat.MORE] = makeFeat(Feat.MORE, "down staircase", [
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE,
    TerrainFlag.EASY, TerrainFlag.STAIR, TerrainFlag.DOWNSTAIR,
    TerrainFlag.INTERESTING,
  ]);
  for (let i = Feat.STORE_GENERAL; i <= Feat.HOME; i++) {
    features[i] = makeFeat(i, `store ${i}`, [
      TerrainFlag.SHOP, TerrainFlag.PASSABLE, TerrainFlag.INTERESTING,
    ]);
  }
  features[Feat.SECRET] = makeFeat(Feat.SECRET, "secret door", [
    TerrainFlag.ROCK, TerrainFlag.DOOR_ANY, TerrainFlag.GRANITE,
  ]);
  features[Feat.RUBBLE] = makeFeat(Feat.RUBBLE, "pile of rubble", [
    TerrainFlag.ROCK, TerrainFlag.NO_SCENT, TerrainFlag.NO_FLOW,
    TerrainFlag.INTERESTING, TerrainFlag.OBJECT,
  ]);
  features[Feat.MAGMA] = makeFeat(Feat.MAGMA, "magma vein", [
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.NO_SCENT,
    TerrainFlag.NO_FLOW, TerrainFlag.MAGMA,
  ]);
  features[Feat.QUARTZ] = makeFeat(Feat.QUARTZ, "quartz vein", [
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.NO_SCENT,
    TerrainFlag.NO_FLOW, TerrainFlag.QUARTZ,
  ]);
  features[Feat.MAGMA_K] = makeFeat(Feat.MAGMA_K, "magma vein with treasure", [
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.NO_SCENT,
    TerrainFlag.NO_FLOW, TerrainFlag.MAGMA, TerrainFlag.GOLD,
    TerrainFlag.INTERESTING,
  ]);
  features[Feat.QUARTZ_K] = makeFeat(Feat.QUARTZ_K, "quartz vein with treasure", [
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.NO_SCENT,
    TerrainFlag.NO_FLOW, TerrainFlag.QUARTZ, TerrainFlag.GOLD,
    TerrainFlag.INTERESTING,
  ]);
  features[Feat.GRANITE] = makeFeat(Feat.GRANITE, "granite wall", [
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.NO_SCENT,
    TerrainFlag.NO_FLOW, TerrainFlag.GRANITE,
  ]);
  features[Feat.PERM] = makeFeat(Feat.PERM, "permanent wall", [
    TerrainFlag.WALL, TerrainFlag.ROCK, TerrainFlag.PERMANENT,
    TerrainFlag.NO_SCENT, TerrainFlag.NO_FLOW,
  ]);
  features[Feat.LAVA] = makeFeat(Feat.LAVA, "lava", [
    TerrainFlag.LOS, TerrainFlag.PROJECT, TerrainFlag.PASSABLE,
    TerrainFlag.NO_SCENT, TerrainFlag.FIERY, TerrainFlag.BRIGHT,
  ]);
  features[Feat.PASS_RUBBLE] = makeFeat(Feat.PASS_RUBBLE, "pass rubble", [
    TerrainFlag.ROCK, TerrainFlag.PASSABLE, TerrainFlag.OBJECT,
    TerrainFlag.INTERESTING,
  ]);

  return features;
}

function makeTestPlayer(x: number, y: number): Player {
  const bf = new BitFlag(32);
  const elInfo = Array.from({ length: 5 }, () => ({ resLevel: 0, flags: new BitFlag(4) }));
  const skills = [30, 20, 20, 40, 30, 5, 50, 40, 30, 20]; // 10 skills
  const state = {
    statAdd: [0, 0, 0, 0, 0], statInd: [0, 0, 0, 0, 0],
    statUse: [16, 14, 14, 16, 16], statTop: [18, 18, 18, 18, 18],
    skills, speed: 110, numBlows: 200, numShots: 10, numMoves: 0,
    ammoMult: 2, ammoTval: 0, ac: 10, damRed: 0, percDamRed: 0,
    toA: 5, toH: 10, toD: 5, seeInfra: 2, curLight: 1,
    heavyWield: false, heavyShoot: false, blessWield: false, cumberArmor: false,
    flags: bf, pflags: new BitFlag(20), elInfo,
  };
  const upkeep = {
    playing: true, autosave: false, generateLevel: false, onlyPartial: false,
    dropping: false, energyUse: 0, newSpells: 0, notice: 0, update: 0,
    redraw: 0, commandWrk: 0, createUpStair: false, createDownStair: false,
    lightLevel: false, arenaLevel: false, resting: 0, running: 0,
    runningFirstStep: false, totalWeight: 100, invenCnt: 0, equipCnt: 0,
    quiverCnt: 0, rechargePow: 0, stepCount: 0, pathDest: loc(0, 0),
  };
  return {
    race: {} as Player["race"],
    class: { magic: { totalSpells: 0 } } as Player["class"],
    grid: loc(x, y), oldGrid: loc(x, y),
    hitdie: 10, expfact: 100, age: 20, ht: 70, wt: 180,
    au: 100, maxDepth: 0, recallDepth: 0, depth: 1,
    maxLev: 1, lev: 10, maxExp: 0, exp: 0, expFrac: 0,
    mhp: 50, chp: 50, chpFrac: 0, msp: 20, csp: 20, cspFrac: 0,
    statMax: [16, 14, 14, 16, 16], statCur: [16, 14, 14, 16, 16],
    statMap: [0, 1, 2, 3, 4],
    timed: new Array(53).fill(0),
    wordRecall: 0, deepDescent: 0,
    energy: 100, totalEnergy: 0, restingTurn: 0, food: 5000,
    unignoring: 0, spellFlags: [], spellOrder: [],
    fullName: "Test", diedFrom: "", history: "",
    quests: [], totalWinner: false, noscore: 0,
    isDead: false, wizard: false, playerHp: new Array(50).fill(10),
    auBirth: 100, statBirth: [16, 14, 14, 16, 16],
    htBirth: 70, wtBirth: 180,
    body: { name: "humanoid", count: 2, slots: [] },
    shape: null, state, knownState: state, upkeep,
  } as unknown as Player;
}

function makeRng(): RNG {
  const rng = new RNG();
  rng.stateInit(42);
  return rng;
}

// ── Setup ──

beforeAll(() => {
  setFeatureInfo(buildTestFeatureInfo());
});

// ── Tests ──

describe("commandVerb", () => {
  it("returns the correct verb for each command type", () => {
    expect(commandVerb(CommandType.WALK)).toBe("walk");
    expect(commandVerb(CommandType.ATTACK)).toBe("attack");
    expect(commandVerb(CommandType.GO_UP)).toBe("go up");
    expect(commandVerb(CommandType.SEARCH)).toBe("search");
  });
});

describe("successResult / failResult", () => {
  it("successResult creates a success result", () => {
    const r = successResult(100, ["hello"]);
    expect(r.success).toBe(true);
    expect(r.energyCost).toBe(100);
    expect(r.messages).toEqual(["hello"]);
  });

  it("failResult creates a failure with zero energy cost", () => {
    const r = failResult(["error"]);
    expect(r.success).toBe(false);
    expect(r.energyCost).toBe(0);
    expect(r.messages).toEqual(["error"]);
  });
});

describe("executeCommand", () => {
  it("dispatches WALK command", () => {
    const chunk = createChunk(10, 10, 1);
    // Make the destination floor
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.FLOOR as FeatureId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const cmd: GameCommand = { type: CommandType.WALK, direction: 6 };
    const result = executeCommand(cmd, player, chunk, rng);
    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    expect(player.grid).toEqual(loc(3, 2));
  });

  it("dispatches GO_UP command on upstairs", () => {
    const chunk = createChunk(10, 10, 5);
    chunkGetSquare(chunk, loc(2, 2)).feat = Feat.LESS as FeatureId;
    const player = makeTestPlayer(2, 2);
    player.depth = 5;
    const rng = makeRng();

    const cmd: GameCommand = { type: CommandType.GO_UP };
    const result = executeCommand(cmd, player, chunk, rng);
    expect(result.success).toBe(true);
    expect(player.depth).toBe(4);
  });

  it("dispatches SEARCH command", () => {
    const chunk = createChunk(10, 10, 1);
    const player = makeTestPlayer(5, 5);
    const rng = makeRng();

    const cmd: GameCommand = { type: CommandType.SEARCH };
    const result = executeCommand(cmd, player, chunk, rng);
    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("dispatches ATTACK command", () => {
    const chunk = createChunk(10, 10, 1);
    // Place a monster
    chunkGetSquare(chunk, loc(3, 2)).mon = 1 as MonsterId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const cmd: GameCommand = { type: CommandType.ATTACK, target: loc(3, 2) };
    const result = executeCommand(cmd, player, chunk, rng);
    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
  });

  it("returns failure for browse (UI-only command)", () => {
    const chunk = createChunk(10, 10, 1);
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const cmd: GameCommand = { type: CommandType.BROWSE, itemIndex: 0 };
    const result = executeCommand(cmd, player, chunk, rng);
    expect(result.success).toBe(false);
    expect(result.messages[0]).toContain("UI layer");
  });
});

describe("COMMAND_INFO", () => {
  it("has entries for all command types", () => {
    // Verify a sample of entries
    expect(COMMAND_INFO[CommandType.WALK].verb).toBe("walk");
    expect(COMMAND_INFO[CommandType.WALK].repeatAllowed).toBe(true);
    expect(COMMAND_INFO[CommandType.WALK].canUseEnergy).toBe(true);

    expect(COMMAND_INFO[CommandType.BROWSE].canUseEnergy).toBe(false);
    expect(COMMAND_INFO[CommandType.INSCRIBE].canUseEnergy).toBe(false);
  });
});
