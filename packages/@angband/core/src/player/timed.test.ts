/**
 * Tests for player/timed.ts — Timed effect management.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  setTimedEffect,
  incTimedEffect,
  decTimedEffect,
  clearTimedEffect,
  clearAllTimedEffects,
  playerHasTimedEffect,
  getTimedEffectDuration,
  playerTimedGradeEq,
  PY_FOOD_FULL,
  PY_FOOD_HUNGRY,
  PY_FOOD_STARVE,
  TMD_FLAG_NONSTACKING,
  setTimedEffectData,
  type TimedEffectData,
} from "./timed.js";
import { TimedEffect, TMD_MAX } from "../types/index.js";
import { BitFlag } from "../z/index.js";
import type { Player } from "../types/index.js";

// ── Test helpers ──

/**
 * Create a minimal Player with zeroed timed effects and minimal state.
 */
function createTestPlayer(): Player {
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
      statAdj: [0, 0, 0, 0, 0],
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
    grid: { x: 0, y: 0 },
    oldGrid: { x: 0, y: 0 },
    hitdie: 10,
    expfact: 100,
    age: 20,
    ht: 72,
    wt: 180,
    au: 0,
    maxDepth: 0,
    recallDepth: 0,
    depth: 0,
    maxLev: 1,
    lev: 1,
    maxExp: 0,
    exp: 0,
    expFrac: 0,
    mhp: 100,
    chp: 100,
    chpFrac: 0,
    msp: 50,
    csp: 50,
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

describe("timed effect basics", () => {
  let player: Player;

  beforeEach(() => {
    player = createTestPlayer();
  });

  it("player starts with no timed effects", () => {
    for (let i = 0; i < TMD_MAX; i++) {
      expect(playerHasTimedEffect(player, i as TimedEffect)).toBe(false);
    }
  });

  it("getTimedEffectDuration returns 0 for inactive effects", () => {
    expect(getTimedEffectDuration(player, TimedEffect.FAST)).toBe(0);
  });
});

describe("setTimedEffect", () => {
  let player: Player;

  beforeEach(() => {
    player = createTestPlayer();
  });

  it("sets an effect and returns changed=true", () => {
    const result = setTimedEffect(player, TimedEffect.FAST, 100, true);
    expect(result.changed).toBe(true);
    expect(player.timed[TimedEffect.FAST]).toBe(100);
    expect(playerHasTimedEffect(player, TimedEffect.FAST)).toBe(true);
  });

  it("generates on-increase message when notify is true", () => {
    const result = setTimedEffect(player, TimedEffect.FAST, 100, true);
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.messages[0]).toContain("faster");
  });

  it("returns changed=false when setting same value", () => {
    setTimedEffect(player, TimedEffect.FAST, 100, true);
    const result = setTimedEffect(player, TimedEffect.FAST, 100, true);
    expect(result.changed).toBe(false);
    expect(result.messages).toHaveLength(0);
  });

  it("generates on-end message when clearing", () => {
    setTimedEffect(player, TimedEffect.FAST, 100, false);
    const result = setTimedEffect(player, TimedEffect.FAST, 0, true);
    expect(result.changed).toBe(true);
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.messages[0]).toContain("slow down");
  });

  it("clamps to max grade duration", () => {
    setTimedEffect(player, TimedEffect.FAST, 99999, true);
    // Should be clamped to 32767 (max grade)
    expect(player.timed[TimedEffect.FAST]).toBe(32767);
  });
});

describe("incTimedEffect", () => {
  let player: Player;

  beforeEach(() => {
    player = createTestPlayer();
  });

  it("increases an effect's duration", () => {
    incTimedEffect(player, TimedEffect.BLIND, 50, true);
    expect(player.timed[TimedEffect.BLIND]).toBe(50);

    incTimedEffect(player, TimedEffect.BLIND, 30, true);
    expect(player.timed[TimedEffect.BLIND]).toBe(80);
  });

  it("blocks increase for nonstacking effects that are already active", () => {
    incTimedEffect(player, TimedEffect.PARALYZED, 10, true);
    expect(player.timed[TimedEffect.PARALYZED]).toBe(10);

    const result = incTimedEffect(player, TimedEffect.PARALYZED, 20, true);
    expect(result.changed).toBe(false);
    // Duration should not have changed
    expect(player.timed[TimedEffect.PARALYZED]).toBe(10);
  });

  it("allows setting nonstacking effect when not active", () => {
    const result = incTimedEffect(player, TimedEffect.PARALYZED, 10, true);
    expect(result.changed).toBe(true);
    expect(player.timed[TimedEffect.PARALYZED]).toBe(10);
  });
});

describe("decTimedEffect", () => {
  let player: Player;

  beforeEach(() => {
    player = createTestPlayer();
  });

  it("decreases an effect's duration", () => {
    setTimedEffect(player, TimedEffect.POISONED, 100, false);
    decTimedEffect(player, TimedEffect.POISONED, 30, false);
    expect(player.timed[TimedEffect.POISONED]).toBe(70);
  });

  it("always notifies when going to zero", () => {
    setTimedEffect(player, TimedEffect.POISONED, 10, false);
    const result = decTimedEffect(player, TimedEffect.POISONED, 20, false);
    expect(result.changed).toBe(true);
    expect(player.timed[TimedEffect.POISONED]).toBe(0);
  });

  it("generates on-end message when reaching zero", () => {
    setTimedEffect(player, TimedEffect.POISONED, 10, false);
    const result = decTimedEffect(player, TimedEffect.POISONED, 10, true);
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.messages[0]).toContain("no longer poisoned");
  });
});

describe("clearTimedEffect", () => {
  let player: Player;

  beforeEach(() => {
    player = createTestPlayer();
  });

  it("clears an active effect", () => {
    setTimedEffect(player, TimedEffect.CONFUSED, 50, false);
    const result = clearTimedEffect(player, TimedEffect.CONFUSED, true);
    expect(result.changed).toBe(true);
    expect(player.timed[TimedEffect.CONFUSED]).toBe(0);
    expect(result.messages[0]).toContain("no longer confused");
  });

  it("returns changed=false for already-clear effect", () => {
    const result = clearTimedEffect(player, TimedEffect.CONFUSED, true);
    expect(result.changed).toBe(false);
  });
});

describe("clearAllTimedEffects", () => {
  let player: Player;

  beforeEach(() => {
    player = createTestPlayer();
  });

  it("clears all timed effects at once", () => {
    setTimedEffect(player, TimedEffect.FAST, 100, false);
    setTimedEffect(player, TimedEffect.BLIND, 50, false);
    setTimedEffect(player, TimedEffect.POISONED, 200, false);

    clearAllTimedEffects(player);

    for (let i = 0; i < TMD_MAX; i++) {
      expect(player.timed[i]).toBe(0);
    }
  });
});

describe("playerTimedGradeEq (food grades)", () => {
  let player: Player;

  beforeEach(() => {
    player = createTestPlayer();
  });

  it("returns false when effect is not active", () => {
    expect(playerTimedGradeEq(player, TimedEffect.FOOD, "Fed")).toBe(false);
  });

  it("matches 'Hungry' grade correctly", () => {
    player.timed[TimedEffect.FOOD] = PY_FOOD_HUNGRY - 1;
    expect(playerTimedGradeEq(player, TimedEffect.FOOD, "Hungry")).toBe(true);
  });

  it("matches 'Fed' grade correctly", () => {
    player.timed[TimedEffect.FOOD] = PY_FOOD_FULL - 1;
    expect(playerTimedGradeEq(player, TimedEffect.FOOD, "Fed")).toBe(true);
  });

  it("matches 'Starving' grade correctly", () => {
    player.timed[TimedEffect.FOOD] = PY_FOOD_STARVE - 1;
    expect(playerTimedGradeEq(player, TimedEffect.FOOD, "Starving")).toBe(true);
  });

  it("does not match wrong grade", () => {
    player.timed[TimedEffect.FOOD] = PY_FOOD_FULL + 100;
    expect(playerTimedGradeEq(player, TimedEffect.FOOD, "Hungry")).toBe(false);
  });
});

describe("custom effect data", () => {
  let player: Player;

  beforeEach(() => {
    player = createTestPlayer();
  });

  it("respects lowerBound", () => {
    // Create a custom effect with lower bound of 5
    const custom: TimedEffectData[] = new Array(TMD_MAX);
    for (let i = 0; i < TMD_MAX; i++) {
      custom[i] = {
        name: `TMD_${i}`,
        desc: null,
        onEnd: null,
        onIncrease: null,
        onDecrease: null,
        grades: [
          { grade: 0, max: 0, name: null, upMsg: null, downMsg: null },
          { grade: 1, max: 32767, name: null, upMsg: "on", downMsg: null },
        ],
        flags: 0,
        lowerBound: i === TimedEffect.FOOD ? 5 : 0,
      };
    }
    setTimedEffectData(custom);

    // Set FOOD to 3 — should be clamped to lower bound of 5
    setTimedEffect(player, TimedEffect.FOOD, 3, false);
    expect(player.timed[TimedEffect.FOOD]).toBe(5);

    // Clear it — should stay at lower bound, not go to 0
    clearTimedEffect(player, TimedEffect.FOOD, false);
    expect(player.timed[TimedEffect.FOOD]).toBe(5);

    // Restore default data
    setTimedEffectData([]);
  });
});
