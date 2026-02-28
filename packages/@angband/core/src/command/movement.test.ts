/**
 * Tests for command/movement.ts — Movement and terrain interaction commands.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loc } from "../z/index.js";
import { RNG } from "../z/index.js";
import { BitFlag } from "../z/index.js";
import { createChunk, chunkGetSquare, setFeatureInfo } from "../cave/index.js";
import { Feat, TerrainFlag, SquareFlag } from "../types/index.js";
import type { FeatureType, FeatureId, MonsterId, Player } from "../types/index.js";
import {
  directionOffset,
  isValidDirection,
  cmdWalk,
  cmdRun,
  cmdOpen,
  cmdClose,
  cmdTunnel,
  cmdDisarm,
  cmdSearch,
  cmdGoUp,
  cmdGoDown,
} from "./movement.js";

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

describe("directionOffset", () => {
  it("returns correct offsets for cardinal directions", () => {
    // 8 = North (dy=-1)
    expect(directionOffset(8)).toEqual(loc(0, -1));
    // 2 = South (dy=+1)
    expect(directionOffset(2)).toEqual(loc(0, 1));
    // 4 = West (dx=-1)
    expect(directionOffset(4)).toEqual(loc(-1, 0));
    // 6 = East (dx=+1)
    expect(directionOffset(6)).toEqual(loc(1, 0));
  });

  it("returns correct offsets for diagonal directions", () => {
    // 7 = NW
    expect(directionOffset(7)).toEqual(loc(-1, -1));
    // 9 = NE
    expect(directionOffset(9)).toEqual(loc(1, -1));
    // 1 = SW
    expect(directionOffset(1)).toEqual(loc(-1, 1));
    // 3 = SE
    expect(directionOffset(3)).toEqual(loc(1, 1));
  });

  it("returns (0,0) for direction 5 (stay in place)", () => {
    expect(directionOffset(5)).toEqual(loc(0, 0));
  });

  it("returns (0,0) for out-of-range directions", () => {
    expect(directionOffset(-1)).toEqual(loc(0, 0));
    expect(directionOffset(10)).toEqual(loc(0, 0));
    expect(directionOffset(99)).toEqual(loc(0, 0));
  });
});

describe("isValidDirection", () => {
  it("returns true for valid directions 1-9", () => {
    for (let d = 1; d <= 9; d++) {
      expect(isValidDirection(d)).toBe(true);
    }
  });

  it("returns false for invalid directions", () => {
    expect(isValidDirection(0)).toBe(false);
    expect(isValidDirection(-1)).toBe(false);
    expect(isValidDirection(10)).toBe(false);
  });
});

describe("cmdWalk", () => {
  it("moves player to an adjacent floor tile", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.FLOOR as FeatureId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdWalk(player, chunk, 6, rng); // East
    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    expect(player.grid).toEqual(loc(3, 2));
  });

  it("direction 5 stays in place", () => {
    const chunk = createChunk(10, 10, 1);
    const player = makeTestPlayer(5, 5);
    const rng = makeRng();

    const result = cmdWalk(player, chunk, 5, rng);
    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    expect(result.messages).toContain("You stay in place.");
    expect(player.grid).toEqual(loc(5, 5));
  });

  it("fails when walking into a wall", () => {
    const chunk = createChunk(10, 10, 1);
    // Default squares are Feat.NONE which has no PASSABLE flag
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.GRANITE as FeatureId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdWalk(player, chunk, 6, rng); // East into granite
    expect(result.success).toBe(false);
    expect(result.energyCost).toBe(0);
    expect(player.grid).toEqual(loc(2, 2)); // Didn't move
  });

  it("auto-opens closed doors", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.CLOSED as FeatureId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdWalk(player, chunk, 6, rng); // East into closed door
    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    // Door should be opened
    expect(chunkGetSquare(chunk, loc(3, 2)).feat).toBe(Feat.OPEN);
  });

  it("attacks monster when walking into occupied square", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.FLOOR as FeatureId;
    chunkGetSquare(chunk, loc(3, 2)).mon = 1 as MonsterId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdWalk(player, chunk, 6, rng); // East into monster
    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    // Player should NOT have moved (attack, not move)
    expect(player.grid).toEqual(loc(2, 2));
  });

  it("fails for invalid direction", () => {
    const chunk = createChunk(10, 10, 1);
    const player = makeTestPlayer(5, 5);
    const rng = makeRng();

    const result = cmdWalk(player, chunk, 0, rng);
    expect(result.success).toBe(false);
    expect(result.messages[0]).toContain("Invalid direction");
  });

  it("fails when walking out of bounds", () => {
    const chunk = createChunk(5, 5, 1);
    const player = makeTestPlayer(0, 0);
    const rng = makeRng();

    const result = cmdWalk(player, chunk, 7, rng); // NW from (0,0) -> (-1, -1)
    expect(result.success).toBe(false);
  });
});

describe("cmdRun", () => {
  it("moves player and sets running state", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.FLOOR as FeatureId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdRun(player, chunk, 6, rng); // East
    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    expect(player.grid).toEqual(loc(3, 2));
    expect(player.upkeep.running).toBe(1);
    expect(player.upkeep.runningFirstStep).toBe(true);
  });

  it("fails for direction 5 (cannot run in place)", () => {
    const chunk = createChunk(10, 10, 1);
    const player = makeTestPlayer(5, 5);
    const rng = makeRng();

    const result = cmdRun(player, chunk, 5, rng);
    expect(result.success).toBe(false);
    expect(result.messages[0]).toContain("cannot run in place");
  });

  it("fails when confused", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.FLOOR as FeatureId;
    const player = makeTestPlayer(2, 2);
    player.timed[4] = 10; // TimedEffect.CONFUSED = 4
    const rng = makeRng();

    const result = cmdRun(player, chunk, 6, rng);
    expect(result.success).toBe(false);
    expect(result.messages[0]).toContain("confused");
  });

  it("fails when running into a monster", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.FLOOR as FeatureId;
    chunkGetSquare(chunk, loc(3, 2)).mon = 1 as MonsterId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdRun(player, chunk, 6, rng);
    expect(result.success).toBe(false);
    expect(result.messages[0]).toContain("monster in the way");
  });

  it("fails when running into a wall", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.GRANITE as FeatureId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdRun(player, chunk, 6, rng);
    expect(result.success).toBe(false);
  });
});

describe("cmdOpen", () => {
  it("opens a closed door", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.CLOSED as FeatureId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdOpen(player, chunk, 6, rng); // East
    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    expect(chunkGetSquare(chunk, loc(3, 2)).feat).toBe(Feat.OPEN);
    expect(result.messages[0]).toContain("open the door");
  });

  it("fails when no closed door in direction", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.FLOOR as FeatureId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdOpen(player, chunk, 6, rng);
    expect(result.success).toBe(false);
    expect(result.messages[0]).toContain("nothing there to open");
  });

  it("fails when monster is in the way", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.CLOSED as FeatureId;
    chunkGetSquare(chunk, loc(3, 2)).mon = 1 as MonsterId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdOpen(player, chunk, 6, rng);
    expect(result.success).toBe(false);
    expect(result.messages[0]).toContain("monster in the way");
  });
});

describe("cmdClose", () => {
  it("closes an open door", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.OPEN as FeatureId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdClose(player, chunk, 6, rng);
    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    expect(chunkGetSquare(chunk, loc(3, 2)).feat).toBe(Feat.CLOSED);
    expect(result.messages[0]).toContain("close the door");
  });

  it("reports broken door", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.BROKEN as FeatureId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdClose(player, chunk, 6, rng);
    expect(result.success).toBe(true);
    expect(result.messages[0]).toContain("broken");
  });

  it("fails when nothing to close", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.FLOOR as FeatureId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdClose(player, chunk, 6, rng);
    expect(result.success).toBe(false);
    expect(result.messages[0]).toContain("nothing there to close");
  });

  it("fails when monster is in the way", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.OPEN as FeatureId;
    chunkGetSquare(chunk, loc(3, 2)).mon = 1 as MonsterId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdClose(player, chunk, 6, rng);
    expect(result.success).toBe(false);
    expect(result.messages[0]).toContain("monster in the way");
  });
});

describe("cmdTunnel", () => {
  it("attempts to tunnel into granite", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.GRANITE as FeatureId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdTunnel(player, chunk, 6, rng);
    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("fails on permanent walls", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.PERM as FeatureId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdTunnel(player, chunk, 6, rng);
    expect(result.success).toBe(false);
    expect(result.messages[0]).toContain("permanent rock");
  });

  it("fails when nothing to tunnel", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.FLOOR as FeatureId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdTunnel(player, chunk, 6, rng);
    expect(result.success).toBe(false);
    expect(result.messages[0]).toContain("nothing there to tunnel");
  });

  it("attempts to tunnel rubble", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.RUBBLE as FeatureId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdTunnel(player, chunk, 6, rng);
    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
  });

  it("fails when monster is in the way", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.GRANITE as FeatureId;
    chunkGetSquare(chunk, loc(3, 2)).mon = 1 as MonsterId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdTunnel(player, chunk, 6, rng);
    expect(result.success).toBe(false);
    expect(result.messages[0]).toContain("monster in the way");
  });
});

describe("cmdDisarm", () => {
  it("attempts to disarm a trap", () => {
    const chunk = createChunk(10, 10, 1);
    const sq = chunkGetSquare(chunk, loc(3, 2));
    sq.feat = Feat.FLOOR as FeatureId;
    sq.trap = {} as never; // Non-null trap
    sq.info.on(SquareFlag.TRAP);
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdDisarm(player, chunk, 6, rng);
    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("fails when no trap present", () => {
    const chunk = createChunk(10, 10, 1);
    chunkGetSquare(chunk, loc(3, 2)).feat = Feat.FLOOR as FeatureId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdDisarm(player, chunk, 6, rng);
    expect(result.success).toBe(false);
    expect(result.messages[0]).toContain("nothing there to disarm");
  });

  it("fails when monster is in the way", () => {
    const chunk = createChunk(10, 10, 1);
    const sq = chunkGetSquare(chunk, loc(3, 2));
    sq.feat = Feat.FLOOR as FeatureId;
    sq.trap = {} as never;
    sq.mon = 1 as MonsterId;
    const player = makeTestPlayer(2, 2);
    const rng = makeRng();

    const result = cmdDisarm(player, chunk, 6, rng);
    expect(result.success).toBe(false);
    expect(result.messages[0]).toContain("monster in the way");
  });
});

describe("cmdSearch", () => {
  it("finds nothing on empty floor", () => {
    const chunk = createChunk(10, 10, 1);
    // Set some floor around the player
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        chunkGetSquare(chunk, loc(5 + dx, 5 + dy)).feat = Feat.FLOOR as FeatureId;
      }
    }
    const player = makeTestPlayer(5, 5);
    const rng = makeRng();

    const result = cmdSearch(player, chunk, rng);
    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    expect(result.messages).toContain("You found nothing.");
  });

  it("can find secret doors", () => {
    const chunk = createChunk(10, 10, 1);
    // Set floor around the player except one secret door
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        chunkGetSquare(chunk, loc(5 + dx, 5 + dy)).feat = Feat.FLOOR as FeatureId;
      }
    }
    // Place a secret door adjacent
    chunkGetSquare(chunk, loc(6, 5)).feat = Feat.SECRET as FeatureId;
    const player = makeTestPlayer(5, 5);

    // Use a fixed RNG and try multiple times — searchSkill = 30, so 30% chance per search
    // With seed 42, we should find it within a few tries
    let found = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const rng = new RNG();
      rng.stateInit(42 + attempt);
      const result = cmdSearch(player, chunk, rng);
      if (result.messages.some(m => m.includes("secret door"))) {
        found = true;
        // Verify the door was changed from SECRET to CLOSED
        expect(chunkGetSquare(chunk, loc(6, 5)).feat).toBe(Feat.CLOSED);
        break;
      }
      // Reset for next attempt
      chunkGetSquare(chunk, loc(6, 5)).feat = Feat.SECRET as FeatureId;
    }
    expect(found).toBe(true);
  });

  it("can reveal hidden traps", () => {
    const chunk = createChunk(10, 10, 1);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        chunkGetSquare(chunk, loc(5 + dx, 5 + dy)).feat = Feat.FLOOR as FeatureId;
      }
    }
    // Place hidden trap adjacent
    const sq = chunkGetSquare(chunk, loc(6, 5));
    sq.info.on(SquareFlag.INVIS);
    const player = makeTestPlayer(5, 5);

    let found = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const rng = new RNG();
      rng.stateInit(42 + attempt);
      const result = cmdSearch(player, chunk, rng);
      if (result.messages.some(m => m.includes("found a trap"))) {
        found = true;
        break;
      }
      // Reset for next attempt
      sq.info.on(SquareFlag.INVIS);
      sq.info.off(SquareFlag.TRAP);
    }
    expect(found).toBe(true);
  });
});

describe("cmdGoUp", () => {
  it("goes up when standing on up staircase", () => {
    const chunk = createChunk(10, 10, 5);
    chunkGetSquare(chunk, loc(5, 5)).feat = Feat.LESS as FeatureId;
    const player = makeTestPlayer(5, 5);
    player.depth = 5;

    const result = cmdGoUp(player, chunk);
    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    expect(player.depth).toBe(4);
    expect(player.upkeep.createDownStair).toBe(true);
    expect(player.upkeep.createUpStair).toBe(false);
  });

  it("fails when not on up staircase", () => {
    const chunk = createChunk(10, 10, 5);
    chunkGetSquare(chunk, loc(5, 5)).feat = Feat.FLOOR as FeatureId;
    const player = makeTestPlayer(5, 5);
    player.depth = 5;

    const result = cmdGoUp(player, chunk);
    expect(result.success).toBe(false);
    expect(result.messages[0]).toContain("no up staircase");
  });

  it("fails at surface level (depth 0)", () => {
    const chunk = createChunk(10, 10, 0);
    chunkGetSquare(chunk, loc(5, 5)).feat = Feat.LESS as FeatureId;
    const player = makeTestPlayer(5, 5);
    player.depth = 0;

    const result = cmdGoUp(player, chunk);
    expect(result.success).toBe(false);
    expect(result.messages[0]).toContain("can't go up");
  });
});

describe("cmdGoDown", () => {
  it("goes down when standing on down staircase", () => {
    const chunk = createChunk(10, 10, 3);
    chunkGetSquare(chunk, loc(5, 5)).feat = Feat.MORE as FeatureId;
    const player = makeTestPlayer(5, 5);
    player.depth = 3;

    const result = cmdGoDown(player, chunk);
    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    expect(player.depth).toBe(4);
    expect(player.upkeep.createUpStair).toBe(true);
    expect(player.upkeep.createDownStair).toBe(false);
  });

  it("fails when not on down staircase", () => {
    const chunk = createChunk(10, 10, 3);
    chunkGetSquare(chunk, loc(5, 5)).feat = Feat.FLOOR as FeatureId;
    const player = makeTestPlayer(5, 5);
    player.depth = 3;

    const result = cmdGoDown(player, chunk);
    expect(result.success).toBe(false);
    expect(result.messages[0]).toContain("no down staircase");
  });
});
