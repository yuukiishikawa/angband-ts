/**
 * Tests for monster/lore.ts — Monster knowledge / lore system
 */
import { describe, it, expect } from "vitest";
import { loc, RNG, BitFlag } from "../z/index.js";
import type {
  MonsterRace,
  MonsterBase,
  MonsterBlow,
  MonsterLore,
  Monster,
} from "../types/index.js";
import {
  MonsterRaceFlag,
  MonsterTimedEffect,
  MonsterTempFlag,
  MonsterGroupRole,
  BlowMethod,
  BlowEffect,
  type FeatureId,
  type MonsterId,
  type MonsterRaceId,
} from "../types/index.js";
import {
  createLore,
  updateLoreOnSight,
  updateLoreOnKill,
  updateLoreOnAttack,
  loreFlagKnown,
} from "./lore.js";

// ── Test helpers ──

function createTestRace(overrides: Partial<MonsterRace> = {}): MonsterRace {
  const flags = overrides.flags ?? new BitFlag(MonsterRaceFlag.RF_MAX);
  const spellFlags = new BitFlag(128);

  const defaultBlows: MonsterBlow[] = [
    {
      method: BlowMethod.HIT,
      effect: BlowEffect.HURT,
      dice: { base: 0, dice: 2, sides: 6, m_bonus: 0 },
      timesSeen: 0,
    },
    {
      method: BlowMethod.CLAW,
      effect: BlowEffect.HURT,
      dice: { base: 0, dice: 1, sides: 4, m_bonus: 0 },
      timesSeen: 0,
    },
  ];

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
    sleep: 5,
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
    blows: overrides.blows ?? defaultBlows,
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

function createTestMonster(race: MonsterRace): Monster {
  return {
    race,
    originalRace: null,
    midx: 1 as MonsterId,
    grid: loc(0, 0),
    hp: race.avgHp,
    maxhp: race.avgHp,
    mTimed: new Int16Array(MonsterTimedEffect.MON_TMD_MAX),
    mspeed: race.speed,
    energy: 0,
    cdis: 0,
    mflag: new BitFlag(MonsterTempFlag.MFLAG_MAX),
    mimickedObjIdx: 0,
    heldObjIdx: 0,
    attr: race.dAttr,
    target: { grid: loc(0, 0), midx: 0 as MonsterId },
    groupInfo: [
      { index: 0, role: MonsterGroupRole.MEMBER },
      { index: 0, role: MonsterGroupRole.MEMBER },
    ],
    minRange: 1,
    bestRange: 1,
  };
}

// ── createLore ──

describe("createLore", () => {
  it("should create an empty lore entry for a race", () => {
    const race = createTestRace();
    const lore = createLore(race);

    expect(lore.ridx).toBe(race.ridx);
    expect(lore.sights).toBe(0);
    expect(lore.deaths).toBe(0);
    expect(lore.pkills).toBe(0);
    expect(lore.tkills).toBe(0);
    expect(lore.allKnown).toBe(false);
    expect(lore.armourKnown).toBe(false);
    expect(lore.dropKnown).toBe(false);
    expect(lore.sleepKnown).toBe(false);
  });

  it("should mirror the race's blow structure", () => {
    const race = createTestRace();
    const lore = createLore(race);

    expect(lore.blows.length).toBe(race.blows.length);
    for (let i = 0; i < lore.blows.length; i++) {
      expect(lore.blows[i]!.method).toBe(race.blows[i]!.method);
      expect(lore.blows[i]!.effect).toBe(race.blows[i]!.effect);
      expect(lore.blows[i]!.timesSeen).toBe(0);
    }
  });

  it("should initialise blow known array to all false", () => {
    const race = createTestRace();
    const lore = createLore(race);

    expect(lore.blowKnown.length).toBe(race.blows.length);
    for (const known of lore.blowKnown) {
      expect(known).toBe(false);
    }
  });

  it("should initialise empty flags", () => {
    const race = createTestRace();
    const lore = createLore(race);

    expect(lore.flags.has(MonsterRaceFlag.UNIQUE)).toBe(false);
    expect(lore.flags.has(MonsterRaceFlag.EVIL)).toBe(false);
  });
});

// ── updateLoreOnSight ──

describe("updateLoreOnSight", () => {
  it("should increment sighting count", () => {
    const race = createTestRace();
    const mon = createTestMonster(race);
    const lore = createLore(race);

    updateLoreOnSight(lore, mon);
    expect(lore.sights).toBe(1);

    updateLoreOnSight(lore, mon);
    expect(lore.sights).toBe(2);
  });

  it("should learn UNIQUE flag on first sight", () => {
    const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
    flags.on(MonsterRaceFlag.UNIQUE);
    const race = createTestRace({ flags });
    const mon = createTestMonster(race);
    const lore = createLore(race);

    expect(loreFlagKnown(lore, MonsterRaceFlag.UNIQUE)).toBe(false);

    updateLoreOnSight(lore, mon);
    expect(loreFlagKnown(lore, MonsterRaceFlag.UNIQUE)).toBe(true);
  });

  it("should learn MALE/FEMALE flag on first sight", () => {
    const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
    flags.on(MonsterRaceFlag.FEMALE);
    const race = createTestRace({ flags });
    const mon = createTestMonster(race);
    const lore = createLore(race);

    updateLoreOnSight(lore, mon);
    expect(loreFlagKnown(lore, MonsterRaceFlag.FEMALE)).toBe(true);
    expect(loreFlagKnown(lore, MonsterRaceFlag.MALE)).toBe(false);
  });

  it("should learn NEVER_MOVE after 5 sightings", () => {
    const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
    flags.on(MonsterRaceFlag.NEVER_MOVE);
    const race = createTestRace({ flags });
    const mon = createTestMonster(race);
    const lore = createLore(race);

    for (let i = 0; i < 4; i++) {
      updateLoreOnSight(lore, mon);
    }
    expect(loreFlagKnown(lore, MonsterRaceFlag.NEVER_MOVE)).toBe(false);

    updateLoreOnSight(lore, mon);
    expect(loreFlagKnown(lore, MonsterRaceFlag.NEVER_MOVE)).toBe(true);
  });

  it("should learn racial flags after 10 sightings", () => {
    const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
    flags.on(MonsterRaceFlag.ORC);
    flags.on(MonsterRaceFlag.EVIL);
    const race = createTestRace({ flags });
    const mon = createTestMonster(race);
    const lore = createLore(race);

    for (let i = 0; i < 9; i++) {
      updateLoreOnSight(lore, mon);
    }
    expect(loreFlagKnown(lore, MonsterRaceFlag.ORC)).toBe(false);

    updateLoreOnSight(lore, mon);
    expect(loreFlagKnown(lore, MonsterRaceFlag.ORC)).toBe(true);
    expect(loreFlagKnown(lore, MonsterRaceFlag.EVIL)).toBe(true);
  });

  it("should not set flags the race does not have", () => {
    const race = createTestRace(); // No special flags
    const mon = createTestMonster(race);
    const lore = createLore(race);

    for (let i = 0; i < 20; i++) {
      updateLoreOnSight(lore, mon);
    }

    expect(loreFlagKnown(lore, MonsterRaceFlag.UNIQUE)).toBe(false);
    expect(loreFlagKnown(lore, MonsterRaceFlag.EVIL)).toBe(false);
    expect(loreFlagKnown(lore, MonsterRaceFlag.ORC)).toBe(false);
  });

  it("should cap sightings at 32767", () => {
    const race = createTestRace();
    const mon = createTestMonster(race);
    const lore = createLore(race);
    lore.sights = 32767;

    updateLoreOnSight(lore, mon);
    expect(lore.sights).toBe(32767);
  });
});

// ── updateLoreOnKill ──

describe("updateLoreOnKill", () => {
  it("should increment kill counts", () => {
    const race = createTestRace();
    const mon = createTestMonster(race);
    const lore = createLore(race);

    updateLoreOnKill(lore, mon);
    expect(lore.pkills).toBe(1);
    expect(lore.tkills).toBe(1);

    updateLoreOnKill(lore, mon);
    expect(lore.pkills).toBe(2);
    expect(lore.tkills).toBe(2);
  });

  it("should learn HURT_LIGHT after first kill", () => {
    const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
    flags.on(MonsterRaceFlag.HURT_LIGHT);
    const race = createTestRace({ flags });
    const mon = createTestMonster(race);
    const lore = createLore(race);

    updateLoreOnKill(lore, mon);
    expect(loreFlagKnown(lore, MonsterRaceFlag.HURT_LIGHT)).toBe(true);
  });

  it("should learn drops after 3 kills", () => {
    const race = createTestRace();
    const mon = createTestMonster(race);
    const lore = createLore(race);

    for (let i = 0; i < 2; i++) {
      updateLoreOnKill(lore, mon);
    }
    expect(lore.dropKnown).toBe(false);

    updateLoreOnKill(lore, mon);
    expect(lore.dropKnown).toBe(true);
  });

  it("should learn sleep after 5 kills", () => {
    const race = createTestRace();
    const mon = createTestMonster(race);
    const lore = createLore(race);

    for (let i = 0; i < 5; i++) {
      updateLoreOnKill(lore, mon);
    }
    expect(lore.sleepKnown).toBe(true);
  });

  it("should learn AC after 10 kills", () => {
    const race = createTestRace();
    const mon = createTestMonster(race);
    const lore = createLore(race);

    for (let i = 0; i < 10; i++) {
      updateLoreOnKill(lore, mon);
    }
    expect(lore.armourKnown).toBe(true);
  });
});

// ── updateLoreOnAttack ──

describe("updateLoreOnAttack", () => {
  it("should increment blow observation count", () => {
    const race = createTestRace();
    const lore = createLore(race);

    updateLoreOnAttack(lore, 0);
    expect(lore.blows[0]!.timesSeen).toBe(1);

    updateLoreOnAttack(lore, 0);
    expect(lore.blows[0]!.timesSeen).toBe(2);
  });

  it("should mark blow as known after 10 observations", () => {
    const race = createTestRace();
    const lore = createLore(race);

    for (let i = 0; i < 10; i++) {
      updateLoreOnAttack(lore, 0);
    }
    expect(lore.blowKnown[0]).toBe(true);
    expect(lore.blowKnown[1]).toBe(false); // Second blow not observed
  });

  it("should handle out-of-range blow index gracefully", () => {
    const race = createTestRace();
    const lore = createLore(race);

    // Should not throw
    updateLoreOnAttack(lore, 99);
    expect(lore.blows.length).toBe(2);
  });

  it("should cap observations at 255", () => {
    const race = createTestRace();
    const lore = createLore(race);

    // Set to near cap
    lore.blows[0]!.timesSeen = 255;
    updateLoreOnAttack(lore, 0);
    expect(lore.blows[0]!.timesSeen).toBe(255);
  });
});

// ── loreFlagKnown ──

describe("loreFlagKnown", () => {
  it("should return false for unknown flags", () => {
    const race = createTestRace();
    const lore = createLore(race);

    expect(loreFlagKnown(lore, MonsterRaceFlag.UNIQUE)).toBe(false);
    expect(loreFlagKnown(lore, MonsterRaceFlag.EVIL)).toBe(false);
  });

  it("should return true for known flags", () => {
    const race = createTestRace();
    const lore = createLore(race);

    lore.flags.on(MonsterRaceFlag.EVIL);
    expect(loreFlagKnown(lore, MonsterRaceFlag.EVIL)).toBe(true);
  });
});

// ── allKnown ──

describe("allKnown", () => {
  it("should be true when all knowledge thresholds are met", () => {
    const race = createTestRace();
    const mon = createTestMonster(race);
    const lore = createLore(race);

    // Kill enough times to learn AC, drops, sleep
    for (let i = 0; i < 10; i++) {
      updateLoreOnKill(lore, mon);
    }

    // Learn all blows
    for (let b = 0; b < race.blows.length; b++) {
      for (let i = 0; i < 10; i++) {
        updateLoreOnAttack(lore, b);
      }
    }

    // The check happens in updateLoreOnKill, so trigger it again
    updateLoreOnKill(lore, mon);
    expect(lore.allKnown).toBe(true);
  });

  it("should remain false if blows are not yet known", () => {
    const race = createTestRace();
    const mon = createTestMonster(race);
    const lore = createLore(race);

    // Kill enough for AC/drops/sleep
    for (let i = 0; i < 10; i++) {
      updateLoreOnKill(lore, mon);
    }

    // But don't observe blows
    expect(lore.allKnown).toBe(false);
  });
});
