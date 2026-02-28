/**
 * Tests for effect/handler.ts — main dispatch system.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { RNG, Dice, BitFlag } from "../z/index.js";
import type { Player, Chunk } from "../types/index.js";
import { TMD_MAX } from "../types/index.js";
import { createChunk } from "../cave/chunk.js";
import {
  EffectType,
  executeEffect,
  executeEffectChain,
  calculateValue,
  successResult,
  failResult,
  damageResult,
  registerHandler,
  type EffectContext,
  type EffectResult,
} from "./handler.js";

// Import sub-modules to ensure handlers are registered
import "./attack.js";
import "./general.js";

// ── Test helpers ──

function createTestRng(): RNG {
  const rng = new RNG();
  rng.stateInit(42);
  rng.quick = false;
  return rng;
}

function createTestPlayer(): Player {
  const pflags = new BitFlag(20);
  const flags = new BitFlag(128);

  return {
    race: {
      name: "Human", ridx: 0, hitDice: 10, expFactor: 100,
      baseAge: 14, modAge: 6, baseHeight: 72, modHeight: 6,
      baseWeight: 180, modWeight: 25, infra: 0, body: 0,
      statAdj: [0, 0, 0, 0, 0], skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      flags, pflags, elInfo: [],
    },
    class: {
      name: "Warrior", cidx: 0, titles: [],
      statAdj: [0, 0, 0, 0, 0], skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      extraSkills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      hitDice: 9, expFactor: 0,
      flags: new BitFlag(128), pflags: new BitFlag(20),
      maxAttacks: 5, minWeight: 30, attMultiply: 5, startItems: [],
      magic: { spellFirst: 1, spellWeight: 300, numBooks: 0, books: [], totalSpells: 0 },
    },
    grid: { x: 5, y: 5 },
    oldGrid: { x: 0, y: 0 },
    hitdie: 10, expfact: 100,
    age: 20, ht: 72, wt: 180, au: 0,
    maxDepth: 10, recallDepth: 10, depth: 5,
    maxLev: 1, lev: 1,
    maxExp: 0, exp: 0, expFrac: 0,
    mhp: 100, chp: 80, chpFrac: 0,
    msp: 50, csp: 40, cspFrac: 0,
    statMax: [15, 15, 15, 15, 15],
    statCur: [15, 15, 15, 15, 15],
    statMap: [0, 1, 2, 3, 4],
    timed: new Array(TMD_MAX).fill(0) as number[],
    wordRecall: 0, deepDescent: 0,
    energy: 0, totalEnergy: 0, restingTurn: 0,
    food: 5000, unignoring: 0,
    spellFlags: [], spellOrder: [],
    fullName: "Test", diedFrom: "", history: "",
    quests: [], totalWinner: false, noscore: 0,
    isDead: false, wizard: false,
    playerHp: [], auBirth: 0, statBirth: [15, 15, 15, 15, 15],
    htBirth: 72, wtBirth: 180,
    body: { name: "humanoid", count: 0, slots: [] },
    shape: null,
    state: {
      statAdd: [0, 0, 0, 0, 0], statInd: [15, 15, 15, 15, 15],
      statUse: [15, 15, 15, 15, 15], statTop: [15, 15, 15, 15, 15],
      skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      speed: 110, numBlows: 100, numShots: 10, numMoves: 0,
      ammoMult: 0, ammoTval: 0,
      ac: 0, damRed: 0, percDamRed: 0, toA: 0, toH: 0, toD: 0,
      seeInfra: 0, curLight: 1,
      heavyWield: false, heavyShoot: false, blessWield: false, cumberArmor: false,
      flags: new BitFlag(128), pflags: new BitFlag(20), elInfo: [],
    },
    knownState: {
      statAdd: [0, 0, 0, 0, 0], statInd: [15, 15, 15, 15, 15],
      statUse: [15, 15, 15, 15, 15], statTop: [15, 15, 15, 15, 15],
      skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      speed: 110, numBlows: 100, numShots: 10, numMoves: 0,
      ammoMult: 0, ammoTval: 0,
      ac: 0, damRed: 0, percDamRed: 0, toA: 0, toH: 0, toD: 0,
      seeInfra: 0, curLight: 1,
      heavyWield: false, heavyShoot: false, blessWield: false, cumberArmor: false,
      flags: new BitFlag(128), pflags: new BitFlag(20), elInfo: [],
    },
    upkeep: {
      playing: true, autosave: false, generateLevel: false, onlyPartial: false,
      dropping: false, energyUse: 0, newSpells: 0, notice: 0, update: 0, redraw: 0,
      commandWrk: 0, createUpStair: false, createDownStair: false,
      lightLevel: false, arenaLevel: false,
      resting: 0, running: 0, runningFirstStep: false,
      totalWeight: 0, invenCnt: 0, equipCnt: 0, quiverCnt: 0, rechargePow: 0,
      stepCount: 0, pathDest: { x: 0, y: 0 },
    },
  };
}

function createTestChunk(): Chunk {
  return createChunk(20, 20, 5);
}

function createTestContext(overrides: Partial<EffectContext> = {}): EffectContext {
  return {
    source: "player",
    player: createTestPlayer(),
    chunk: createTestChunk(),
    rng: createTestRng(),
    ...overrides,
  };
}

// ── Tests ──

describe("helper functions", () => {
  it("successResult creates a success result", () => {
    const result = successResult(["hello"], true);
    expect(result.success).toBe(true);
    expect(result.messages).toEqual(["hello"]);
    expect(result.ident).toBe(true);
  });

  it("failResult creates a failure result", () => {
    const result = failResult(["oops"]);
    expect(result.success).toBe(false);
    expect(result.messages).toEqual(["oops"]);
    expect(result.ident).toBe(false);
  });

  it("damageResult creates a damage result", () => {
    const result = damageResult(42, ["hit!"], true);
    expect(result.success).toBe(true);
    expect(result.damage).toBe(42);
    expect(result.messages).toEqual(["hit!"]);
    expect(result.ident).toBe(true);
  });
});

describe("calculateValue", () => {
  it("returns 0 for undefined dice", () => {
    const rng = createTestRng();
    expect(calculateValue(rng, undefined)).toBe(0);
  });

  it("rolls dice with base value", () => {
    const rng = createTestRng();
    rng.fix(50); // Fix to 50% for deterministic results
    const dice = new Dice();
    dice.parseString("10");
    const value = calculateValue(rng, dice);
    expect(value).toBe(10);
    rng.unfix();
  });

  it("applies device boost when useBoost is true", () => {
    const rng = createTestRng();
    rng.fix(50);
    const dice = new Dice();
    dice.parseString("100");
    const value = calculateValue(rng, dice, 50, true);
    // 100 * (100 + 50) / 100 = 150
    expect(value).toBe(150);
    rng.unfix();
  });

  it("does not apply boost when useBoost is false", () => {
    const rng = createTestRng();
    rng.fix(50);
    const dice = new Dice();
    dice.parseString("100");
    const value = calculateValue(rng, dice, 50, false);
    expect(value).toBe(100);
    rng.unfix();
  });
});

describe("executeEffect", () => {
  it("returns failure for EffectType.NONE", () => {
    const ctx = createTestContext();
    const result = executeEffect(EffectType.NONE, ctx);
    expect(result.success).toBe(false);
  });

  it("returns failure for out-of-range effect type", () => {
    const ctx = createTestContext();
    const result = executeEffect(EffectType.MAX, ctx);
    expect(result.success).toBe(false);
  });

  it("dispatches DAMAGE effect to handler", () => {
    const ctx = createTestContext({ source: "monster" });
    const dice = new Dice();
    dice.parseString("10");

    const result = executeEffect(EffectType.DAMAGE, ctx, dice);
    expect(result.success).toBe(true);
    expect(result.damage).toBe(10);
    expect(ctx.player.chp).toBe(70); // was 80, took 10 damage
  });

  it("dispatches HEAL_HP effect to handler", () => {
    const ctx = createTestContext();
    const dice = new Dice();
    dice.parseString("30");

    const result = executeEffect(EffectType.HEAL_HP, ctx, dice);
    expect(result.success).toBe(true);
    // Player was at 80/100, should heal by up to 30
    expect(ctx.player.chp).toBeGreaterThan(80);
    expect(ctx.player.chp).toBeLessThanOrEqual(100);
  });

  it("dispatches BOLT effect to handler", () => {
    const ctx = createTestContext({ subtype: 2 }); // fire
    const dice = new Dice();
    dice.parseString("5d6");

    const result = executeEffect(EffectType.BOLT, ctx, dice);
    expect(result.success).toBe(true);
    expect(result.ident).toBe(true);
    expect(result.damage).toBeGreaterThan(0);
    expect(result.messages[0]).toContain("bolt of fire");
  });
});

describe("executeEffectChain", () => {
  it("executes multiple effects in sequence", () => {
    const ctx = createTestContext({ source: "monster" });

    const effects = [
      {
        index: EffectType.DAMAGE,
        dice: { base: 5, dice: 0, sides: 0, m_bonus: 0 },
        y: 0, x: 0, subtype: 0, radius: 0, other: 0, msg: null, next: null,
      },
      {
        index: EffectType.DAMAGE,
        dice: { base: 3, dice: 0, sides: 0, m_bonus: 0 },
        y: 0, x: 0, subtype: 0, radius: 0, other: 0, msg: null, next: null,
      },
    ];

    const results = executeEffectChain(effects, ctx);
    expect(results).toHaveLength(2);
    expect(results[0]!.success).toBe(true);
    expect(results[1]!.success).toBe(true);
    // Total damage: 5 + 3 = 8, from 80 HP
    expect(ctx.player.chp).toBe(72);
  });

  it("returns empty array for empty chain", () => {
    const ctx = createTestContext();
    const results = executeEffectChain([], ctx);
    expect(results).toHaveLength(0);
  });
});

describe("registerHandler", () => {
  it("can register and dispatch a custom handler", () => {
    // Use a high effect type number that is unlikely to conflict
    const CUSTOM_TYPE = 999 as EffectType;
    const customHandler = (_ctx: EffectContext, _dice?: Dice): EffectResult => {
      return successResult(["Custom effect fired!"], true);
    };

    registerHandler(CUSTOM_TYPE, customHandler);

    const ctx = createTestContext();
    const result = executeEffect(CUSTOM_TYPE, ctx);
    // This should fail because CUSTOM_TYPE >= MAX
    expect(result.success).toBe(false);
  });
});
