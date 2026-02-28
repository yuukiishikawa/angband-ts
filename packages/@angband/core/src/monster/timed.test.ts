/**
 * Tests for monster/timed.ts — Monster timed effects.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { RNG, BitFlag } from "../z/index.js";
import {
  MonsterTimedEffect,
  MonsterRaceFlag,
  type Monster,
  type MonsterRace,
} from "../types/index.js";
import {
  setMonsterTimedEffect,
  incMonsterTimedEffect,
  decMonsterTimedEffect,
  clearMonsterTimedEffect,
  monsterEffectLevel,
  monsterIsConfused,
  monsterIsAsleep,
  monsterIsAfraid,
  monsterIsStunned,
  monsterIsHeld,
  monsterIsSlowed,
  monsterIsHasted,
} from "./timed.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMinimalRace(overrides: Partial<MonsterRace> = {}): MonsterRace {
  return {
    ridx: 1 as any,
    name: "Test Monster",
    text: "",
    plural: null,
    base: { name: "test", text: "test", flags: new BitFlag(MonsterRaceFlag.RF_MAX), dChar: 0x54 },
    avgHp: 100,
    ac: 10,
    sleep: 0,
    hearing: 20,
    smell: 20,
    speed: 110,
    light: 0,
    mexp: 10,
    freqInnate: 0,
    freqSpell: 0,
    spellPower: 10,
    flags: new BitFlag(MonsterRaceFlag.RF_MAX),
    spellFlags: new BitFlag(1),
    blows: [],
    level: 10,
    rarity: 1,
    dAttr: 0,
    dChar: 0x54,
    maxNum: 10,
    curNum: 0,
    spellMsgs: [],
    drops: [],
    friends: [],
    friendsBase: [],
    mimicKinds: [],
    shapes: [],
    numShapes: 0,
    ...overrides,
  } as MonsterRace;
}

function makeMinimalMonster(raceOverrides: Partial<MonsterRace> = {}): Monster {
  const race = makeMinimalRace(raceOverrides);
  return {
    race,
    originalRace: null,
    midx: 1 as any,
    grid: { x: 5, y: 5 },
    hp: 100,
    maxhp: 100,
    mTimed: new Int16Array(MonsterTimedEffect.MON_TMD_MAX),
    mspeed: 110,
    energy: 0,
    cdis: 5,
    mflag: new BitFlag(16),
    mimickedObjIdx: 0,
    heldObjIdx: 0,
    attr: 0,
    target: { grid: { x: 0, y: 0 }, midx: 0 as any },
    groupInfo: [],
    minRange: 1,
    bestRange: 3,
  } as Monster;
}

describe("monster/timed", () => {
  let rng: RNG;

  beforeEach(() => {
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);
  });

  describe("setMonsterTimedEffect", () => {
    it("should set a timer from 0 to a positive value", () => {
      const mon = makeMinimalMonster();
      const result = setMonsterTimedEffect(mon, MonsterTimedEffect.STUN, 10, rng, true);
      expect(result).toBe(true);
      expect(mon.mTimed[MonsterTimedEffect.STUN]).toBe(10);
    });

    it("should return false for no change (same value)", () => {
      const mon = makeMinimalMonster();
      mon.mTimed[MonsterTimedEffect.STUN] = 10;
      const result = setMonsterTimedEffect(mon, MonsterTimedEffect.STUN, 10, rng, true);
      expect(result).toBe(false);
    });

    it("should clamp to max timer", () => {
      const mon = makeMinimalMonster();
      // STUN maxTimer = 50
      const result = setMonsterTimedEffect(mon, MonsterTimedEffect.STUN, 100, rng, true);
      expect(result).toBe(true);
      expect(mon.mTimed[MonsterTimedEffect.STUN]).toBe(50);
    });

    it("should clear the timer when set to 0", () => {
      const mon = makeMinimalMonster();
      mon.mTimed[MonsterTimedEffect.CONF] = 20;
      const result = setMonsterTimedEffect(mon, MonsterTimedEffect.CONF, 0, rng);
      expect(result).toBe(true);
      expect(mon.mTimed[MonsterTimedEffect.CONF]).toBe(0);
    });

    it("should respect flag-based resistance", () => {
      const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
      flags.on(MonsterRaceFlag.NO_STUN);
      const mon = makeMinimalMonster({ flags });

      const result = setMonsterTimedEffect(mon, MonsterTimedEffect.STUN, 10, rng);
      expect(result).toBe(false);
      expect(mon.mTimed[MonsterTimedEffect.STUN]).toBe(0);
    });

    it("should bypass resistance with nofail", () => {
      const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
      flags.on(MonsterRaceFlag.NO_STUN);
      const mon = makeMinimalMonster({ flags });

      const result = setMonsterTimedEffect(mon, MonsterTimedEffect.STUN, 10, rng, true);
      expect(result).toBe(true);
      expect(mon.mTimed[MonsterTimedEffect.STUN]).toBe(10);
    });
  });

  describe("incMonsterTimedEffect", () => {
    it("should apply minimum turns for new effects", () => {
      const mon = makeMinimalMonster();
      const result = incMonsterTimedEffect(mon, MonsterTimedEffect.STUN, 1, rng, true);
      expect(result).toBe(true);
      // MON_INC_MIN_TURNS = 2
      expect(mon.mTimed[MonsterTimedEffect.STUN]).toBe(2);
    });

    it("should use MAX stacking for STUN", () => {
      const mon = makeMinimalMonster();
      mon.mTimed[MonsterTimedEffect.STUN] = 30;
      const result = incMonsterTimedEffect(mon, MonsterTimedEffect.STUN, 20, rng, true);
      // MAX(30, 20) = 30, no change
      expect(result).toBe(false);
    });

    it("should use MAX stacking for STUN when new > old", () => {
      const mon = makeMinimalMonster();
      mon.mTimed[MonsterTimedEffect.STUN] = 10;
      const result = incMonsterTimedEffect(mon, MonsterTimedEffect.STUN, 30, rng, true);
      expect(result).toBe(true);
      expect(mon.mTimed[MonsterTimedEffect.STUN]).toBe(30);
    });

    it("should use INCR stacking for FEAR", () => {
      const mon = makeMinimalMonster();
      mon.mTimed[MonsterTimedEffect.FEAR] = 10;
      incMonsterTimedEffect(mon, MonsterTimedEffect.FEAR, 5, rng, true);
      expect(mon.mTimed[MonsterTimedEffect.FEAR]).toBe(15);
    });

    it("should use NO stacking for SLEEP (does not increase existing)", () => {
      const mon = makeMinimalMonster();
      mon.mTimed[MonsterTimedEffect.SLEEP] = 10;
      const result = incMonsterTimedEffect(mon, MonsterTimedEffect.SLEEP, 20, rng, true);
      // NO stacking means the value stays at 10 — no change
      expect(result).toBe(false);
      expect(mon.mTimed[MonsterTimedEffect.SLEEP]).toBe(10);
    });

    it("should return false for 0 or negative amount", () => {
      const mon = makeMinimalMonster();
      expect(incMonsterTimedEffect(mon, MonsterTimedEffect.STUN, 0, rng, true)).toBe(false);
      expect(incMonsterTimedEffect(mon, MonsterTimedEffect.STUN, -5, rng, true)).toBe(false);
    });
  });

  describe("decMonsterTimedEffect", () => {
    it("should decrease the timer", () => {
      const mon = makeMinimalMonster();
      mon.mTimed[MonsterTimedEffect.CONF] = 20;
      const result = decMonsterTimedEffect(mon, MonsterTimedEffect.CONF, 5, rng);
      expect(result).toBe(true);
      expect(mon.mTimed[MonsterTimedEffect.CONF]).toBe(15);
    });

    it("should clamp to 0 (not negative)", () => {
      const mon = makeMinimalMonster();
      mon.mTimed[MonsterTimedEffect.CONF] = 3;
      const result = decMonsterTimedEffect(mon, MonsterTimedEffect.CONF, 10, rng);
      expect(result).toBe(true);
      expect(mon.mTimed[MonsterTimedEffect.CONF]).toBe(0);
    });

    it("should return false if already 0", () => {
      const mon = makeMinimalMonster();
      const result = decMonsterTimedEffect(mon, MonsterTimedEffect.STUN, 5, rng);
      expect(result).toBe(false);
    });

    it("should return false for 0 or negative amount", () => {
      const mon = makeMinimalMonster();
      mon.mTimed[MonsterTimedEffect.STUN] = 10;
      expect(decMonsterTimedEffect(mon, MonsterTimedEffect.STUN, 0, rng)).toBe(false);
      expect(decMonsterTimedEffect(mon, MonsterTimedEffect.STUN, -5, rng)).toBe(false);
    });
  });

  describe("clearMonsterTimedEffect", () => {
    it("should clear a non-zero timer", () => {
      const mon = makeMinimalMonster();
      mon.mTimed[MonsterTimedEffect.FEAR] = 15;
      const result = clearMonsterTimedEffect(mon, MonsterTimedEffect.FEAR, rng);
      expect(result).toBe(true);
      expect(mon.mTimed[MonsterTimedEffect.FEAR]).toBe(0);
    });

    it("should return false if timer is already 0", () => {
      const mon = makeMinimalMonster();
      const result = clearMonsterTimedEffect(mon, MonsterTimedEffect.FEAR, rng);
      expect(result).toBe(false);
    });
  });

  describe("monsterEffectLevel", () => {
    it("should return 0 for unaffected monsters", () => {
      const mon = makeMinimalMonster();
      expect(monsterEffectLevel(mon, MonsterTimedEffect.STUN)).toBe(0);
    });

    it("should return 1 for low timer", () => {
      const mon = makeMinimalMonster();
      mon.mTimed[MonsterTimedEffect.STUN] = 1;
      expect(monsterEffectLevel(mon, MonsterTimedEffect.STUN)).toBe(1);
    });

    it("should return 5 at max timer", () => {
      const mon = makeMinimalMonster();
      mon.mTimed[MonsterTimedEffect.STUN] = 50;
      expect(monsterEffectLevel(mon, MonsterTimedEffect.STUN)).toBe(5);
    });

    it("should scale linearly between 1 and 5", () => {
      const mon = makeMinimalMonster();
      // STUN maxTimer = 50, divisor = max(50/5, 1) = 10
      mon.mTimed[MonsterTimedEffect.STUN] = 25;
      const level = monsterEffectLevel(mon, MonsterTimedEffect.STUN);
      expect(level).toBeGreaterThanOrEqual(2);
      expect(level).toBeLessThanOrEqual(3);
    });
  });

  describe("convenience predicates", () => {
    it("monsterIsConfused returns correct value", () => {
      const mon = makeMinimalMonster();
      expect(monsterIsConfused(mon)).toBe(false);
      mon.mTimed[MonsterTimedEffect.CONF] = 5;
      expect(monsterIsConfused(mon)).toBe(true);
    });

    it("monsterIsAsleep returns correct value", () => {
      const mon = makeMinimalMonster();
      expect(monsterIsAsleep(mon)).toBe(false);
      mon.mTimed[MonsterTimedEffect.SLEEP] = 100;
      expect(monsterIsAsleep(mon)).toBe(true);
    });

    it("monsterIsAfraid returns correct value", () => {
      const mon = makeMinimalMonster();
      expect(monsterIsAfraid(mon)).toBe(false);
      mon.mTimed[MonsterTimedEffect.FEAR] = 10;
      expect(monsterIsAfraid(mon)).toBe(true);
    });

    it("monsterIsStunned returns correct value", () => {
      const mon = makeMinimalMonster();
      expect(monsterIsStunned(mon)).toBe(false);
      mon.mTimed[MonsterTimedEffect.STUN] = 3;
      expect(monsterIsStunned(mon)).toBe(true);
    });

    it("monsterIsHeld returns correct value", () => {
      const mon = makeMinimalMonster();
      expect(monsterIsHeld(mon)).toBe(false);
      mon.mTimed[MonsterTimedEffect.HOLD] = 1;
      expect(monsterIsHeld(mon)).toBe(true);
    });

    it("monsterIsSlowed returns correct value", () => {
      const mon = makeMinimalMonster();
      expect(monsterIsSlowed(mon)).toBe(false);
      mon.mTimed[MonsterTimedEffect.SLOW] = 5;
      expect(monsterIsSlowed(mon)).toBe(true);
    });

    it("monsterIsHasted returns correct value", () => {
      const mon = makeMinimalMonster();
      expect(monsterIsHasted(mon)).toBe(false);
      mon.mTimed[MonsterTimedEffect.FAST] = 10;
      expect(monsterIsHasted(mon)).toBe(true);
    });
  });
});
