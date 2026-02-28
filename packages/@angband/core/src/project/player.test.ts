/**
 * Tests for project/player.ts — Projection effects on the player
 */
import { describe, it, expect } from "vitest";
import { projectPlayer } from "./player.js";
import { loc } from "../z/index.js";
import { RNG, BitFlag } from "../z/index.js";
import { Element } from "../types/index.js";
import type { Player, PlayerRace, PlayerClass, PlayerState, PlayerBody, PlayerUpkeep, ElementInfo } from "../types/index.js";
import { TMD_MAX, STAT_MAX, SKILL_MAX } from "../types/index.js";

// ── Test helpers ──

function createRNG(): RNG {
  const rng = new RNG();
  rng.stateInit(42);
  rng.quick = false;
  return rng;
}

function createElementInfo(resLevel: number): ElementInfo {
  return {
    resLevel,
    flags: new BitFlag(4),
  };
}

function createPlayerState(
  elInfoOverrides?: Map<Element, number>,
): PlayerState {
  const elInfo: ElementInfo[] = [];
  for (let i = 0; i < Element.MAX; i++) {
    const level = elInfoOverrides?.get(i as Element) ?? 0;
    elInfo.push(createElementInfo(level));
  }
  return {
    statAdd: new Array(STAT_MAX).fill(0),
    statInd: new Array(STAT_MAX).fill(0),
    statUse: new Array(STAT_MAX).fill(10),
    statTop: new Array(STAT_MAX).fill(18),
    skills: new Array(SKILL_MAX).fill(0),
    speed: 110,
    numBlows: 100,
    numShots: 10,
    numMoves: 0,
    ammoMult: 1,
    ammoTval: 0,
    ac: 10,
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
    flags: new BitFlag(40),
    pflags: new BitFlag(20),
    elInfo,
  };
}

function createMinimalRace(): PlayerRace {
  return {
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
    skills: new Array(SKILL_MAX).fill(0),
    flags: new BitFlag(40),
    pflags: new BitFlag(20),
    elInfo: [],
  };
}

function createMinimalClass(): PlayerClass {
  return {
    name: "Warrior",
    cidx: 0,
    titles: [],
    statAdj: [0, 0, 0, 0, 0],
    skills: new Array(SKILL_MAX).fill(0),
    extraSkills: new Array(SKILL_MAX).fill(0),
    hitDice: 9,
    expFactor: 0,
    flags: new BitFlag(40),
    pflags: new BitFlag(20),
    maxAttacks: 5,
    minWeight: 30,
    attMultiply: 5,
    startItems: [],
    magic: {
      spellFirst: 99,
      spellWeight: 0,
      numBooks: 0,
      books: [],
      totalSpells: 0,
    },
  };
}

function createMinimalBody(): PlayerBody {
  return {
    name: "humanoid",
    count: 0,
    slots: [],
  };
}

function createMinimalUpkeep(): PlayerUpkeep {
  return {
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
    pathDest: loc(0, 0),
  };
}

function createPlayer(
  hp: number,
  elInfoOverrides?: Map<Element, number>,
): Player {
  return {
    race: createMinimalRace(),
    class: createMinimalClass(),
    grid: loc(5, 5),
    oldGrid: loc(5, 5),
    hitdie: 10,
    expfact: 100,
    age: 20,
    ht: 72,
    wt: 180,
    au: 100,
    maxDepth: 0,
    recallDepth: 0,
    depth: 1,
    maxLev: 1,
    lev: 1,
    maxExp: 0,
    exp: 100,
    expFrac: 0,
    mhp: hp,
    chp: hp,
    chpFrac: 0,
    msp: 0,
    csp: 0,
    cspFrac: 0,
    statMax: [10, 10, 10, 10, 10],
    statCur: [10, 10, 10, 10, 10],
    statMap: [0, 1, 2, 3, 4],
    timed: new Array(TMD_MAX).fill(0),
    wordRecall: 0,
    deepDescent: 0,
    energy: 0,
    totalEnergy: 0,
    restingTurn: 0,
    food: 5000,
    unignoring: 0,
    spellFlags: [],
    spellOrder: [],
    fullName: "Test Hero",
    diedFrom: "",
    history: "",
    quests: [],
    totalWinner: false,
    noscore: 0,
    isDead: false,
    wizard: false,
    playerHp: [],
    auBirth: 100,
    statBirth: [10, 10, 10, 10, 10],
    htBirth: 72,
    wtBirth: 180,
    body: createMinimalBody(),
    shape: null,
    state: createPlayerState(elInfoOverrides),
    knownState: createPlayerState(elInfoOverrides),
    upkeep: createMinimalUpkeep(),
  };
}

// ── Tests ──

describe("projectPlayer", () => {
  describe("damage calculation", () => {
    it("deals full damage with no resistance", () => {
      const player = createPlayer(100);
      const rng = createRNG();
      const result = projectPlayer(player, Element.FIRE, 50, rng);
      expect(result.damage).toBe(50);
      expect(player.chp).toBe(50);
    });

    it("reduces damage with single resistance", () => {
      const overrides = new Map<Element, number>([[Element.FIRE, 1]]);
      const player = createPlayer(100, overrides);
      const rng = createRNG();
      const result = projectPlayer(player, Element.FIRE, 90, rng);
      // Single resist divides by 3
      expect(result.damage).toBe(30);
      expect(result.resisted).toBe(true);
    });

    it("deals zero damage with immunity (resist level 3)", () => {
      const overrides = new Map<Element, number>([[Element.ACID, 3]]);
      const player = createPlayer(100, overrides);
      const rng = createRNG();
      const result = projectPlayer(player, Element.ACID, 100, rng);
      expect(result.damage).toBe(0);
      expect(result.resisted).toBe(true);
      expect(player.chp).toBe(100);
    });

    it("increases damage with vulnerability (resist level -1)", () => {
      const overrides = new Map<Element, number>([[Element.COLD, -1]]);
      const player = createPlayer(100, overrides);
      const rng = createRNG();
      const result = projectPlayer(player, Element.COLD, 90, rng);
      // Vulnerable: 90 * 4/3 = 120
      expect(result.damage).toBe(120);
    });

    it("ICE uses COLD resistance", () => {
      const overrides = new Map<Element, number>([[Element.COLD, 1]]);
      const player = createPlayer(100, overrides);
      const rng = createRNG();
      const result = projectPlayer(player, Element.ICE, 90, rng);
      expect(result.damage).toBe(30);
      expect(result.resisted).toBe(true);
    });
  });

  describe("player death", () => {
    it("kills the player when damage exceeds HP", () => {
      const player = createPlayer(30);
      const rng = createRNG();
      const result = projectPlayer(player, Element.FIRE, 50, rng);
      expect(player.chp).toBe(0);
      expect(player.isDead).toBe(true);
      expect(result.sideEffects).toContain("You die.");
    });
  });

  describe("side effects", () => {
    it("applies poison side effect", () => {
      const player = createPlayer(100);
      const rng = createRNG();
      const result = projectPlayer(player, Element.POIS, 30, rng);
      expect(result.sideEffects).toContain("You are poisoned!");
      // TimedEffect.POISONED = 7
      expect(player.timed[7]).toBeGreaterThan(0);
    });

    it("drains experience with nether", () => {
      const player = createPlayer(100);
      player.exp = 100;
      const rng = createRNG();
      const result = projectPlayer(player, Element.NETHER, 20, rng);
      expect(result.sideEffects.some((s) => s.includes("life force"))).toBe(true);
      expect(player.exp).toBeLessThan(100);
    });

    it("drains experience with time attacks", () => {
      const player = createPlayer(100);
      player.exp = 100;
      const rng = createRNG();
      const result = projectPlayer(player, Element.TIME, 30, rng);
      expect(result.sideEffects.some((s) => s.includes("time"))).toBe(true);
      expect(player.exp).toBeLessThan(100);
    });

    it("notes equipment effects for acid", () => {
      const player = createPlayer(100);
      const rng = createRNG();
      const result = projectPlayer(player, Element.ACID, 30, rng);
      expect(result.sideEffects.some((s) => s.includes("equipment"))).toBe(true);
    });

    it("notes equipment effects for fire", () => {
      const player = createPlayer(100);
      const rng = createRNG();
      const result = projectPlayer(player, Element.FIRE, 30, rng);
      expect(result.sideEffects.some((s) => s.includes("belongings"))).toBe(true);
    });
  });

  describe("messages", () => {
    it("shows immune message for immunity", () => {
      const overrides = new Map<Element, number>([[Element.FIRE, 3]]);
      const player = createPlayer(100, overrides);
      const rng = createRNG();
      const result = projectPlayer(player, Element.FIRE, 50, rng);
      expect(result.message).toContain("immune");
    });

    it("shows resist message for resistance", () => {
      const overrides = new Map<Element, number>([[Element.FIRE, 1]]);
      const player = createPlayer(100, overrides);
      const rng = createRNG();
      const result = projectPlayer(player, Element.FIRE, 50, rng);
      expect(result.message).toContain("resist");
    });

    it("shows hit message for normal damage", () => {
      const player = createPlayer(100);
      const rng = createRNG();
      const result = projectPlayer(player, Element.FIRE, 50, rng);
      expect(result.message).toContain("hit");
    });
  });
});
