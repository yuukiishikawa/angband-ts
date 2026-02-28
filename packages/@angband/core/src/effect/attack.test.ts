/**
 * Tests for effect/attack.ts — attack-related effect handlers.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { RNG, Dice, BitFlag } from "../z/index.js";
import type { Player, Chunk } from "../types/index.js";
import { TMD_MAX, Stat, Element } from "../types/index.js";
import { createChunk } from "../cave/chunk.js";
import type { EffectContext } from "./handler.js";

import {
  effectDamage,
  effectBolt,
  effectBeam,
  effectBall,
  effectBreath,
  effectDrainLife,
  effectDrainStat,
  effectDrainMana,
  effectStar,
} from "./attack.js";

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
    grid: { x: 5, y: 5 },
    oldGrid: { x: 0, y: 0 },
    hitdie: 10, expfact: 100,
    age: 20, ht: 72, wt: 180, au: 0,
    maxDepth: 10, recallDepth: 10, depth: 5,
    maxLev: 10, lev: 10,
    maxExp: 1000, exp: 1000, expFrac: 0,
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

describe("effectDamage", () => {
  it("deals damage from a monster to the player", () => {
    const ctx = createCtx({ source: "monster" });
    const dice = makeDice("10");
    const result = effectDamage(ctx, dice);

    expect(result.success).toBe(true);
    expect(result.damage).toBe(10);
    expect(ctx.player.chp).toBe(70);
    expect(result.ident).toBe(true);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("reduces HP to zero on lethal damage", () => {
    const ctx = createCtx({ source: "trap" });
    const dice = makeDice("200");
    const result = effectDamage(ctx, dice);

    expect(result.success).toBe(true);
    expect(ctx.player.chp).toBe(0);
    expect(result.messages).toContain("You die.");
  });

  it("handles player source gracefully", () => {
    const ctx = createCtx({ source: "player" });
    const dice = makeDice("10");
    const result = effectDamage(ctx, dice);

    expect(result.success).toBe(true);
    // Player-sourced damage is a no-op
    expect(ctx.player.chp).toBe(80);
  });
});

describe("effectBolt", () => {
  it("calculates damage with dice", () => {
    const ctx = createCtx({ subtype: Element.FIRE });
    const dice = makeDice("3d6");
    const result = effectBolt(ctx, dice);

    expect(result.success).toBe(true);
    expect(result.damage).toBeGreaterThan(0);
    expect(result.damage).toBeLessThanOrEqual(18);
    expect(result.ident).toBe(true);
    expect(result.messages[0]).toContain("bolt of fire");
  });

  it("applies device boost", () => {
    const rng = createTestRng();
    rng.fix(50);
    const ctx = createCtx({ subtype: Element.COLD, boost: 100, rng });
    const dice = makeDice("10");
    const result = effectBolt(ctx, dice);

    // 10 * (100 + 100) / 100 = 20
    expect(result.damage).toBe(20);
    rng.unfix();
  });
});

describe("effectBeam", () => {
  it("returns damage and mentions beam in message", () => {
    const ctx = createCtx({ subtype: Element.ELEC });
    const dice = makeDice("8");
    const result = effectBeam(ctx, dice);

    expect(result.success).toBe(true);
    expect(result.damage).toBe(8);
    expect(result.messages[0]).toContain("beam of lightning");
  });
});

describe("effectBall", () => {
  it("uses specified radius in message", () => {
    const ctx = createCtx({ subtype: Element.ACID, radius: 3 });
    const dice = makeDice("20");
    const result = effectBall(ctx, dice);

    expect(result.success).toBe(true);
    expect(result.damage).toBe(20);
    expect(result.messages[0]).toContain("radius 3");
    expect(result.messages[0]).toContain("acid");
  });

  it("defaults to radius 2 when not specified", () => {
    const ctx = createCtx({ subtype: Element.FIRE });
    const dice = makeDice("15");
    const result = effectBall(ctx, dice);

    expect(result.messages[0]).toContain("radius 2");
  });
});

describe("effectBreath", () => {
  it("calculates breath damage without boost", () => {
    const ctx = createCtx({ subtype: Element.COLD, boost: 50 });
    const dice = makeDice("30");
    const result = effectBreath(ctx, dice);

    // Breath does NOT apply boost
    expect(result.damage).toBe(30);
    expect(result.messages[0]).toContain("breathe cold");
  });
});

describe("effectDrainLife", () => {
  it("deals damage and heals the player", () => {
    const ctx = createCtx();
    const dice = makeDice("40");
    const result = effectDrainLife(ctx, dice);

    expect(result.success).toBe(true);
    expect(result.damage).toBe(40);
    // Heals 40/4 = 10, from 80 to 90
    expect(ctx.player.chp).toBe(90);
    expect(result.messages.length).toBe(2);
    expect(result.messages[1]).toContain("+10 HP");
  });

  it("does not heal past max HP", () => {
    const ctx = createCtx();
    ctx.player.chp = 98;
    const dice = makeDice("40");
    const result = effectDrainLife(ctx, dice);

    // Would heal 10 but capped at mhp=100
    expect(ctx.player.chp).toBe(100);
  });

  it("does not heal when already at full HP", () => {
    const ctx = createCtx();
    ctx.player.chp = 100;
    const dice = makeDice("20");
    const result = effectDrainLife(ctx, dice);

    expect(result.messages).toHaveLength(1); // Only the damage message
    expect(ctx.player.chp).toBe(100);
  });
});

describe("effectDrainStat", () => {
  it("reduces the target stat by 1", () => {
    const ctx = createCtx({ subtype: Stat.STR });
    const result = effectDrainStat(ctx);

    expect(result.success).toBe(true);
    expect(ctx.player.statCur[Stat.STR]).toBe(14);
    expect(result.ident).toBe(true);
  });

  it("does not reduce below 3", () => {
    const ctx = createCtx({ subtype: Stat.DEX });
    ctx.player.statCur[Stat.DEX] = 3;
    const result = effectDrainStat(ctx);

    expect(result.success).toBe(true);
    expect(ctx.player.statCur[Stat.DEX]).toBe(3);
    expect(result.messages[0]).toContain("sustained");
  });

  it("fails for invalid stat index", () => {
    const ctx = createCtx({ subtype: 99 });
    const result = effectDrainStat(ctx);

    expect(result.success).toBe(false);
  });
});

describe("effectDrainMana", () => {
  it("drains mana from the player", () => {
    const ctx = createCtx();
    const dice = makeDice("15");
    const result = effectDrainMana(ctx, dice);

    expect(result.success).toBe(true);
    expect(ctx.player.csp).toBe(25); // was 40, drained 15
    expect(result.messages[0]).toContain("15 mana");
  });

  it("handles draining more mana than available", () => {
    const ctx = createCtx();
    ctx.player.csp = 5;
    const dice = makeDice("20");
    const result = effectDrainMana(ctx, dice);

    expect(ctx.player.csp).toBe(0);
    expect(result.messages[0]).toContain("5 mana");
  });

  it("handles zero mana gracefully", () => {
    const ctx = createCtx();
    ctx.player.csp = 0;
    const dice = makeDice("10");
    const result = effectDrainMana(ctx, dice);

    expect(result.messages[0]).toContain("no mana");
  });
});

describe("effectStar", () => {
  it("fires beams in all directions", () => {
    const ctx = createCtx({ subtype: Element.LIGHT });
    const dice = makeDice("12");
    const result = effectStar(ctx, dice);

    expect(result.success).toBe(true);
    expect(result.damage).toBe(12);
    expect(result.messages[0]).toContain("all directions");
    expect(result.messages[0]).toContain("light");
  });
});
