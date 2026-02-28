/**
 * Tests for effect/general.ts — general / utility effect handlers.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { RNG, Dice, BitFlag } from "../z/index.js";
import type { Player, Chunk } from "../types/index.js";
import { TMD_MAX, TimedEffect, Stat } from "../types/index.js";
import { createChunk } from "../cave/chunk.js";
import type { EffectContext } from "./handler.js";

import {
  effectHeal,
  effectNourish,
  effectRestoreStat,
  effectCure,
  effectTimedInc,
  effectTimedDec,
  effectTeleport,
  effectDetectTraps,
  effectDetectDoors,
  effectDetectMonsters,
  effectDetectObjects,
  effectMapArea,
  effectLightArea,
  effectDarkenArea,
  effectIdentify,
  effectRecall,
  effectHaste,
  effectSlow,
  effectRestoreExp,
  effectRestoreMana,
} from "./general.js";

// ── Test helpers ──

function createTestRng(seed = 42): RNG {
  const rng = new RNG();
  rng.stateInit(seed);
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
    grid: { x: 10, y: 10 },
    oldGrid: { x: 0, y: 0 },
    hitdie: 10, expfact: 100,
    age: 20, ht: 72, wt: 180, au: 0,
    maxDepth: 10, recallDepth: 10, depth: 5,
    maxLev: 10, lev: 10,
    maxExp: 1000, exp: 800, expFrac: 0,
    mhp: 100, chp: 60, chpFrac: 0,
    msp: 50, csp: 30, cspFrac: 0,
    statMax: [18, 16, 14, 17, 15],
    statCur: [15, 14, 14, 15, 13],
    statMap: [0, 1, 2, 3, 4],
    timed: new Array(TMD_MAX).fill(0) as number[],
    wordRecall: 0, deepDescent: 0,
    energy: 0, totalEnergy: 0, restingTurn: 0,
    food: 5000, unignoring: 0,
    spellFlags: [], spellOrder: [],
    fullName: "Test", diedFrom: "", history: "",
    quests: [], totalWinner: false, noscore: 0,
    isDead: false, wizard: false,
    playerHp: [], auBirth: 0, statBirth: [18, 16, 14, 17, 15],
    htBirth: 72, wtBirth: 180,
    body: { name: "humanoid", count: 0, slots: [] },
    shape: null,
    state: {
      statAdd: [0, 0, 0, 0, 0], statInd: [15, 14, 14, 15, 13],
      statUse: [15, 14, 14, 15, 13], statTop: [18, 16, 14, 17, 15],
      skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      speed: 110, numBlows: 100, numShots: 10, numMoves: 0,
      ammoMult: 0, ammoTval: 0,
      ac: 0, damRed: 0, percDamRed: 0, toA: 0, toH: 0, toD: 0,
      seeInfra: 0, curLight: 1,
      heavyWield: false, heavyShoot: false, blessWield: false, cumberArmor: false,
      flags: new BitFlag(128), pflags: new BitFlag(20), elInfo: [],
    },
    knownState: {
      statAdd: [0, 0, 0, 0, 0], statInd: [15, 14, 14, 15, 13],
      statUse: [15, 14, 14, 15, 13], statTop: [18, 16, 14, 17, 15],
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
  return createChunk(30, 30, 5);
}

function createCtx(overrides: Partial<EffectContext> = {}): EffectContext {
  return {
    source: "player",
    player: createTestPlayer(),
    chunk: createTestChunk(),
    rng: createTestRng(),
    ...overrides,
  };
}

function makeDice(str: string): Dice {
  const d = new Dice();
  d.parseString(str);
  return d;
}

// ── Tests ──

describe("effectHeal", () => {
  it("heals the player", () => {
    const ctx = createCtx();
    const dice = makeDice("30");
    const result = effectHeal(ctx, dice);

    expect(result.success).toBe(true);
    expect(result.ident).toBe(true);
    expect(ctx.player.chp).toBeGreaterThan(60);
    expect(ctx.player.chp).toBeLessThanOrEqual(100);
  });

  it("returns early when already at full HP", () => {
    const ctx = createCtx();
    ctx.player.chp = 100;
    const dice = makeDice("30");
    const result = effectHeal(ctx, dice);

    expect(result.success).toBe(true);
    expect(result.messages[0]).toContain("already at full");
  });

  it("produces appropriate message for small heal", () => {
    const ctx = createCtx();
    ctx.player.chp = 97;
    const dice = makeDice("3");
    const result = effectHeal(ctx, dice);

    expect(result.success).toBe(true);
    expect(result.messages[0]).toContain("little better");
  });

  it("produces appropriate message for large heal", () => {
    const ctx = createCtx();
    ctx.player.chp = 10;
    const dice = makeDice("50");
    const result = effectHeal(ctx, dice);

    expect(result.success).toBe(true);
    expect(result.messages[0]).toContain("very good");
  });

  it("does not heal past max HP", () => {
    const ctx = createCtx();
    ctx.player.chp = 95;
    const dice = makeDice("20");
    const result = effectHeal(ctx, dice);

    expect(ctx.player.chp).toBe(100);
  });
});

describe("effectNourish", () => {
  it("increases food by amount (INC_BY mode)", () => {
    const ctx = createCtx({ subtype: 0 });
    const dice = makeDice("2000");
    const result = effectNourish(ctx, dice);

    expect(result.success).toBe(true);
    expect(ctx.player.food).toBe(7000);
    expect(result.messages[0]).toContain("less hungry");
  });

  it("decreases food by amount (DEC_BY mode)", () => {
    const ctx = createCtx({ subtype: 1 });
    const dice = makeDice("1000");
    const result = effectNourish(ctx, dice);

    expect(result.success).toBe(true);
    expect(ctx.player.food).toBe(4000);
    expect(result.messages[0]).toContain("hungrier");
  });

  it("sets food to amount (SET_TO mode)", () => {
    const ctx = createCtx({ subtype: 2 });
    const dice = makeDice("8000");
    const result = effectNourish(ctx, dice);

    expect(result.success).toBe(true);
    expect(ctx.player.food).toBe(8000);
  });

  it("increases food to amount if below (INC_TO mode)", () => {
    const ctx = createCtx({ subtype: 3 });
    const dice = makeDice("10000");
    const result = effectNourish(ctx, dice);

    expect(result.success).toBe(true);
    expect(ctx.player.food).toBe(10000);
  });

  it("does not decrease food in INC_TO mode", () => {
    const ctx = createCtx({ subtype: 3 });
    ctx.player.food = 12000;
    const dice = makeDice("8000");
    const result = effectNourish(ctx, dice);

    expect(ctx.player.food).toBe(12000);
    expect(result.messages[0]).toContain("not hungry");
  });

  it("clamps food to PY_FOOD_MAX", () => {
    const ctx = createCtx({ subtype: 0 });
    ctx.player.food = 14000;
    const dice = makeDice("5000");
    const result = effectNourish(ctx, dice);

    expect(ctx.player.food).toBe(15000);
  });

  it("fails for unknown nourish mode", () => {
    const ctx = createCtx({ subtype: 99 });
    const dice = makeDice("100");
    const result = effectNourish(ctx, dice);

    expect(result.success).toBe(false);
  });
});

describe("effectRestoreStat", () => {
  it("restores a drained stat", () => {
    const ctx = createCtx({ subtype: Stat.STR });
    // STR: cur=15, max=18
    const result = effectRestoreStat(ctx);

    expect(result.success).toBe(true);
    expect(ctx.player.statCur[Stat.STR]).toBe(18);
    expect(result.messages[0]).toContain("strength returning");
  });

  it("reports when stat is already at max", () => {
    const ctx = createCtx({ subtype: Stat.WIS });
    // WIS: cur=14, max=14 (already equal)
    const result = effectRestoreStat(ctx);

    expect(result.success).toBe(true);
    expect(result.messages[0]).toContain("already at its maximum");
  });

  it("fails for invalid stat index", () => {
    const ctx = createCtx({ subtype: 77 });
    const result = effectRestoreStat(ctx);

    expect(result.success).toBe(false);
  });
});

describe("effectCure", () => {
  it("clears a timed effect", () => {
    const ctx = createCtx({ subtype: TimedEffect.POISONED });
    ctx.player.timed[TimedEffect.POISONED] = 50;

    const result = effectCure(ctx);

    expect(result.success).toBe(true);
    expect(ctx.player.timed[TimedEffect.POISONED]).toBe(0);
  });

  it("returns unchanged when effect is not active", () => {
    const ctx = createCtx({ subtype: TimedEffect.BLIND });
    const result = effectCure(ctx);

    expect(result.ident).toBe(false); // changed=false => ident=false
    expect(ctx.player.timed[TimedEffect.BLIND]).toBe(0);
  });
});

describe("effectTimedInc", () => {
  it("increases a timed effect duration", () => {
    const ctx = createCtx({ subtype: TimedEffect.FAST });
    const dice = makeDice("20");
    const result = effectTimedInc(ctx, dice);

    expect(result.success).toBe(true);
    expect(ctx.player.timed[TimedEffect.FAST]).toBe(20);
  });

  it("stacks duration for stackable effects", () => {
    const ctx = createCtx({ subtype: TimedEffect.BLIND });
    ctx.player.timed[TimedEffect.BLIND] = 10;
    const dice = makeDice("15");
    const result = effectTimedInc(ctx, dice);

    expect(ctx.player.timed[TimedEffect.BLIND]).toBe(25);
  });
});

describe("effectTimedDec", () => {
  it("decreases a timed effect duration", () => {
    const ctx = createCtx({ subtype: TimedEffect.POISONED });
    ctx.player.timed[TimedEffect.POISONED] = 50;
    const dice = makeDice("20");
    const result = effectTimedDec(ctx, dice);

    expect(result.success).toBe(true);
    expect(ctx.player.timed[TimedEffect.POISONED]).toBe(30);
  });

  it("clears effect when decreased below zero", () => {
    const ctx = createCtx({ subtype: TimedEffect.SLOW });
    ctx.player.timed[TimedEffect.SLOW] = 5;
    const dice = makeDice("20");
    const result = effectTimedDec(ctx, dice);

    expect(ctx.player.timed[TimedEffect.SLOW]).toBe(0);
  });
});

describe("effectTeleport", () => {
  it("moves the player to a new position", () => {
    const ctx = createCtx();
    const origX = ctx.player.grid.x;
    const origY = ctx.player.grid.y;
    const dice = makeDice("10");

    const result = effectTeleport(ctx, dice);

    expect(result.success).toBe(true);
    expect(result.messages[0]).toContain("teleport");
    // Position should change (probabilistic, but with range=10 it's very likely)
    const moved = ctx.player.grid.x !== origX || ctx.player.grid.y !== origY;
    expect(moved).toBe(true);
  });

  it("clamps to chunk bounds", () => {
    const ctx = createCtx();
    const dice = makeDice("100");

    effectTeleport(ctx, dice);

    expect(ctx.player.grid.x).toBeGreaterThanOrEqual(0);
    expect(ctx.player.grid.x).toBeLessThan(ctx.chunk.width);
    expect(ctx.player.grid.y).toBeGreaterThanOrEqual(0);
    expect(ctx.player.grid.y).toBeLessThan(ctx.chunk.height);
  });

  it("fails with zero range", () => {
    const ctx = createCtx();
    const dice = makeDice("0");
    const result = effectTeleport(ctx, dice);

    expect(result.success).toBe(false);
  });
});

describe("effectDetectTraps", () => {
  it("reports no traps when none exist", () => {
    const ctx = createCtx();
    const result = effectDetectTraps(ctx);

    expect(result.success).toBe(true);
    expect(result.messages[0]).toContain("no traps");
  });
});

describe("effectDetectDoors", () => {
  it("generates detection message", () => {
    const ctx = createCtx();
    const result = effectDetectDoors(ctx);

    expect(result.success).toBe(true);
    expect(result.messages[0]).toContain("doors");
  });
});

describe("effectDetectMonsters", () => {
  it("reports no monsters when none exist", () => {
    const ctx = createCtx();
    const result = effectDetectMonsters(ctx);

    expect(result.success).toBe(true);
    expect(result.messages[0]).toContain("no monsters");
  });
});

describe("effectDetectObjects", () => {
  it("reports no objects when none exist", () => {
    const ctx = createCtx();
    const result = effectDetectObjects(ctx);

    expect(result.success).toBe(true);
    expect(result.messages[0]).toContain("no objects");
  });
});

describe("effectMapArea", () => {
  it("maps the area and reports success", () => {
    const ctx = createCtx({ radius: 3 });
    const result = effectMapArea(ctx);

    expect(result.success).toBe(true);
    expect(result.messages[0]).toContain("mapped");
  });
});

describe("effectLightArea", () => {
  it("lights the area", () => {
    const ctx = createCtx({ radius: 2 });
    const dice = makeDice("2d8");
    const result = effectLightArea(ctx, dice);

    expect(result.success).toBe(true);
    expect(result.messages[0]).toContain("lit up");
  });
});

describe("effectDarkenArea", () => {
  it("darkens the area", () => {
    const ctx = createCtx();
    const result = effectDarkenArea(ctx);

    expect(result.success).toBe(true);
    expect(result.messages[0]).toContain("Darkness");
  });
});

describe("effectIdentify", () => {
  it("identifies an item", () => {
    const ctx = createCtx();
    const result = effectIdentify(ctx);

    expect(result.success).toBe(true);
    expect(result.messages[0]).toContain("identify");
  });
});

describe("effectRecall", () => {
  it("starts word of recall countdown", () => {
    const ctx = createCtx();
    const result = effectRecall(ctx);

    expect(result.success).toBe(true);
    expect(ctx.player.wordRecall).toBeGreaterThanOrEqual(15);
    expect(ctx.player.wordRecall).toBeLessThanOrEqual(25);
    expect(result.messages[0]).toContain("charged");
  });

  it("cancels existing recall", () => {
    const ctx = createCtx();
    ctx.player.wordRecall = 20;
    const result = effectRecall(ctx);

    expect(result.success).toBe(true);
    expect(ctx.player.wordRecall).toBe(0);
    expect(result.messages[0]).toContain("tension leaves");
  });
});

describe("effectHaste", () => {
  it("increases haste timed effect", () => {
    const ctx = createCtx();
    const dice = makeDice("30");
    const result = effectHaste(ctx, dice);

    expect(result.success).toBe(true);
    expect(ctx.player.timed[TimedEffect.FAST]).toBe(30);
  });
});

describe("effectSlow", () => {
  it("increases slow timed effect", () => {
    const ctx = createCtx();
    const dice = makeDice("20");
    const result = effectSlow(ctx, dice);

    expect(result.success).toBe(true);
    expect(ctx.player.timed[TimedEffect.SLOW]).toBe(20);
  });
});

describe("effectRestoreExp", () => {
  it("restores lost experience", () => {
    const ctx = createCtx();
    // exp=800, maxExp=1000
    const result = effectRestoreExp(ctx);

    expect(result.success).toBe(true);
    expect(ctx.player.exp).toBe(1000);
    expect(result.messages[0]).toContain("life energies returning");
  });

  it("reports when experience is already at max", () => {
    const ctx = createCtx();
    ctx.player.exp = ctx.player.maxExp;
    const result = effectRestoreExp(ctx);

    expect(result.success).toBe(true);
    expect(result.messages[0]).toContain("already at their peak");
  });
});

describe("effectRestoreMana", () => {
  it("restores mana to max", () => {
    const ctx = createCtx();
    // csp=30, msp=50
    const result = effectRestoreMana(ctx);

    expect(result.success).toBe(true);
    expect(ctx.player.csp).toBe(50);
    expect(result.messages[0]).toContain("head clear");
  });

  it("reports when mana is already full", () => {
    const ctx = createCtx();
    ctx.player.csp = 50;
    const result = effectRestoreMana(ctx);

    expect(result.success).toBe(true);
    expect(result.messages[0]).toContain("already at its maximum");
  });
});
