/**
 * Tests for player/birth.ts — character creation system.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { RNG } from "../z/rand.js";
import { BitFlag } from "../z/bitflag.js";
import { rollStats, rollHP, createPlayer } from "./birth.js";
import type { PlayerRace, PlayerClass, ClassMagic } from "../types/player.js";
import { STAT_MAX, PY_MAX_LEVEL, Stat, TimedEffect } from "../types/player.js";

// ── Test helpers ──

function makeTestRace(): PlayerRace {
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
    skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    flags: new BitFlag(40),
    pflags: new BitFlag(18),
    elInfo: [],
  };
}

function makeTestMagic(): ClassMagic {
  return {
    spellFirst: 1,
    spellWeight: 300,
    numBooks: 0,
    books: [],
    totalSpells: 0,
  };
}

function makeTestClass(): PlayerClass {
  return {
    name: "Warrior",
    cidx: 0,
    titles: [],
    statAdj: [3, -2, -2, 2, 2],
    skills: [25, 25, 18, 18, 14, 1, 70, 55, 55, 0],
    extraSkills: [12, 12, 7, 10, 0, 0, 45, 45, 45, 0],
    hitDice: 9,
    expFactor: 0,
    flags: new BitFlag(40),
    pflags: new BitFlag(18),
    maxAttacks: 6,
    minWeight: 30,
    attMultiply: 5,
    startItems: [],
    magic: makeTestMagic(),
  };
}

// ── Tests ──

describe("rollStats", () => {
  let rng: RNG;

  beforeEach(() => {
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);
  });

  it("should return STAT_MAX stats", () => {
    const stats = rollStats(rng);
    expect(stats).toHaveLength(STAT_MAX);
  });

  it("should return stats in a reasonable range", () => {
    const stats = rollStats(rng);
    for (const s of stats) {
      // Each stat = 5 + 1d3 + 1d4 + 1d5
      // Min = 5 + 1 + 1 + 1 = 8
      // Max = 5 + 3 + 4 + 5 = 17
      expect(s).toBeGreaterThanOrEqual(8);
      expect(s).toBeLessThanOrEqual(17);
    }
  });

  it("should produce deterministic output from the same seed", () => {
    const stats1 = rollStats(rng);

    const rng2 = new RNG();
    rng2.quick = false;
    rng2.stateInit(42);
    const stats2 = rollStats(rng2);

    expect(stats1).toEqual(stats2);
  });

  it("should produce different output from different seeds", () => {
    const stats1 = rollStats(rng);

    const rng2 = new RNG();
    rng2.quick = false;
    rng2.stateInit(999);
    const stats2 = rollStats(rng2);

    // It is theoretically possible for them to be the same, but extremely unlikely
    expect(stats1).not.toEqual(stats2);
  });

  it("total of all stats should satisfy the constraint (7*STAT_MAX < total < 9*STAT_MAX)", () => {
    // Run multiple times to check the constraint indirectly.
    // The constraint is on the raw dice sum, not the final stats.
    // But we can verify the stat range is reasonable.
    for (let trial = 0; trial < 20; trial++) {
      const stats = rollStats(rng);
      const total = stats.reduce((a, b) => a + b, 0);
      // 5 is added to each stat beyond the dice, so total = 5*STAT_MAX + dice_sum
      // dice_sum in (7*STAT_MAX, 9*STAT_MAX) means:
      // total in (5*STAT_MAX + 7*STAT_MAX, 5*STAT_MAX + 9*STAT_MAX)
      // = (12*STAT_MAX, 14*STAT_MAX) = (60, 70)
      expect(total).toBeGreaterThan(12 * STAT_MAX);
      expect(total).toBeLessThan(14 * STAT_MAX);
    }
  });
});

describe("rollHP", () => {
  let rng: RNG;

  beforeEach(() => {
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);
  });

  it("should return PY_MAX_LEVEL entries", () => {
    const hp = rollHP(19, rng);
    expect(hp).toHaveLength(PY_MAX_LEVEL);
  });

  it("should have level 1 HP equal to hitdie", () => {
    const hitdie = 19;
    const hp = rollHP(hitdie, rng);
    expect(hp[0]).toBe(hitdie);
  });

  it("should be monotonically increasing", () => {
    const hp = rollHP(19, rng);
    for (let i = 1; i < PY_MAX_LEVEL; i++) {
      expect(hp[i]!).toBeGreaterThan(hp[i - 1]!);
    }
  });

  it("should satisfy min/max constraints at highest level", () => {
    const hitdie = 19;
    const minValue =
      Math.floor((PY_MAX_LEVEL * (hitdie - 1) * 3) / 8) + PY_MAX_LEVEL;
    const maxValue =
      Math.floor((PY_MAX_LEVEL * (hitdie - 1) * 5) / 8) + PY_MAX_LEVEL;

    const hp = rollHP(hitdie, rng);
    expect(hp[PY_MAX_LEVEL - 1]!).toBeGreaterThanOrEqual(minValue);
    expect(hp[PY_MAX_LEVEL - 1]!).toBeLessThanOrEqual(maxValue);
  });

  it("should produce deterministic results from same seed", () => {
    const hp1 = rollHP(19, rng);

    const rng2 = new RNG();
    rng2.quick = false;
    rng2.stateInit(42);
    const hp2 = rollHP(19, rng2);

    expect(hp1).toEqual(hp2);
  });
});

describe("createPlayer", () => {
  let rng: RNG;
  let race: PlayerRace;
  let cls: PlayerClass;

  beforeEach(() => {
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);
    race = makeTestRace();
    cls = makeTestClass();
  });

  it("should create a player with the given name", () => {
    const player = createPlayer("Gandalf", race, cls, rng);
    expect(player.fullName).toBe("Gandalf");
  });

  it("should set race and class", () => {
    const player = createPlayer("Gandalf", race, cls, rng);
    expect(player.race).toBe(race);
    expect(player.class).toBe(cls);
  });

  it("should start at level 1", () => {
    const player = createPlayer("Gandalf", race, cls, rng);
    expect(player.lev).toBe(1);
    expect(player.maxLev).toBe(1);
  });

  it("should compute correct hitdie from race + class", () => {
    const player = createPlayer("Gandalf", race, cls, rng);
    expect(player.hitdie).toBe(race.hitDice + cls.hitDice);
  });

  it("should compute correct experience factor", () => {
    const player = createPlayer("Gandalf", race, cls, rng);
    expect(player.expfact).toBe(race.expFactor + cls.expFactor);
  });

  it("should have STAT_MAX stats in statMax and statCur", () => {
    const player = createPlayer("Gandalf", race, cls, rng);
    expect(player.statMax).toHaveLength(STAT_MAX);
    expect(player.statCur).toHaveLength(STAT_MAX);
  });

  it("should start fully healed (chp === mhp)", () => {
    const player = createPlayer("Gandalf", race, cls, rng);
    expect(player.chp).toBe(player.mhp);
  });

  it("should start not dead", () => {
    const player = createPlayer("Gandalf", race, cls, rng);
    expect(player.isDead).toBe(false);
  });

  it("should have PY_MAX_LEVEL entries in playerHp", () => {
    const player = createPlayer("Gandalf", race, cls, rng);
    expect(player.playerHp).toHaveLength(PY_MAX_LEVEL);
  });

  it("should have food set (not starving)", () => {
    const player = createPlayer("Gandalf", race, cls, rng);
    expect(player.timed[TimedEffect.FOOD]).toBeGreaterThan(0);
  });

  it("should have positive age, height, weight", () => {
    const player = createPlayer("Gandalf", race, cls, rng);
    expect(player.age).toBeGreaterThan(0);
    // Height and weight come from normal distribution; in extreme cases
    // they could theoretically be zero, but with reasonable parameters they
    // should be positive.
    expect(player.ht).toBeGreaterThan(0);
    expect(player.wt).toBeGreaterThan(0);
  });

  it("should save birth values", () => {
    const player = createPlayer("Gandalf", race, cls, rng);
    expect(player.statBirth).toEqual(player.statMax);
    expect(player.htBirth).toBe(player.ht);
    expect(player.wtBirth).toBe(player.wt);
  });

  it("should have stat_map as identity", () => {
    const player = createPlayer("Gandalf", race, cls, rng);
    expect(player.statMap).toEqual([0, 1, 2, 3, 4]);
  });
});
