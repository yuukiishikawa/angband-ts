/**
 * Tests for monster/spell.ts — Monster spell casting and selection.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { RNG, BitFlag, loc } from "../z/index.js";
import {
  type Monster,
  type MonsterRace,
  MonsterSpellFlag,
  MonsterRaceFlag,
  MonsterTimedEffect,
} from "../types/index.js";
import {
  monsterSpellFailrate,
  monsterHasSpell,
  isBreathSpell,
  isSummonSpell,
  isInnateSpell,
  isDamageSpell,
  isBoltSpell,
  isBallSpell,
  breathDamage,
  getSpellDamage,
  monsterChooseSpell,
  monsterCastSpell,
} from "./spell.js";

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
    avgHp: 200,
    ac: 10,
    sleep: 0,
    hearing: 20,
    smell: 20,
    speed: 110,
    light: 0,
    mexp: 10,
    freqInnate: 20,
    freqSpell: 20,
    spellPower: 50,
    flags: new BitFlag(MonsterRaceFlag.RF_MAX),
    spellFlags: new BitFlag(MonsterSpellFlag.RSF_MAX),
    blows: [],
    level: 30,
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
    hp: 200,
    maxhp: 200,
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

describe("monster/spell", () => {
  let rng: RNG;

  beforeEach(() => {
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);
  });

  describe("spell type predicates", () => {
    it("isBreathSpell identifies breath attacks", () => {
      expect(isBreathSpell(MonsterSpellFlag.BR_FIRE)).toBe(true);
      expect(isBreathSpell(MonsterSpellFlag.BR_ACID)).toBe(true);
      expect(isBreathSpell(MonsterSpellFlag.BR_MANA)).toBe(true);
      expect(isBreathSpell(MonsterSpellFlag.BO_FIRE)).toBe(false);
      expect(isBreathSpell(MonsterSpellFlag.HEAL)).toBe(false);
    });

    it("isSummonSpell identifies summon spells", () => {
      expect(isSummonSpell(MonsterSpellFlag.S_MONSTER)).toBe(true);
      expect(isSummonSpell(MonsterSpellFlag.S_DRAGON)).toBe(true);
      expect(isSummonSpell(MonsterSpellFlag.S_UNIQUE)).toBe(true);
      expect(isSummonSpell(MonsterSpellFlag.BA_FIRE)).toBe(false);
      expect(isSummonSpell(MonsterSpellFlag.HEAL)).toBe(false);
    });

    it("isInnateSpell identifies innate attacks", () => {
      expect(isInnateSpell(MonsterSpellFlag.SHRIEK)).toBe(true);
      expect(isInnateSpell(MonsterSpellFlag.BR_FIRE)).toBe(true);
      expect(isInnateSpell(MonsterSpellFlag.SHOT)).toBe(true);
      expect(isInnateSpell(MonsterSpellFlag.BA_FIRE)).toBe(false);
      expect(isInnateSpell(MonsterSpellFlag.HEAL)).toBe(false);
    });

    it("isDamageSpell identifies damaging spells", () => {
      expect(isDamageSpell(MonsterSpellFlag.BR_FIRE)).toBe(true);
      expect(isDamageSpell(MonsterSpellFlag.BA_ACID)).toBe(true);
      expect(isDamageSpell(MonsterSpellFlag.BO_COLD)).toBe(true);
      expect(isDamageSpell(MonsterSpellFlag.WOUND)).toBe(true);
      expect(isDamageSpell(MonsterSpellFlag.HEAL)).toBe(false);
      expect(isDamageSpell(MonsterSpellFlag.SCARE)).toBe(false);
    });

    it("isBoltSpell identifies bolt spells", () => {
      expect(isBoltSpell(MonsterSpellFlag.BO_FIRE)).toBe(true);
      expect(isBoltSpell(MonsterSpellFlag.MISSILE)).toBe(true);
      expect(isBoltSpell(MonsterSpellFlag.BA_FIRE)).toBe(false);
    });

    it("isBallSpell identifies ball/beam spells", () => {
      expect(isBallSpell(MonsterSpellFlag.BA_FIRE)).toBe(true);
      expect(isBallSpell(MonsterSpellFlag.STORM)).toBe(true);
      expect(isBallSpell(MonsterSpellFlag.BE_ELEC)).toBe(true);
      expect(isBallSpell(MonsterSpellFlag.BO_FIRE)).toBe(false);
    });
  });

  describe("monsterHasSpell", () => {
    it("should return true when race has the spell", () => {
      const spellFlags = new BitFlag(MonsterSpellFlag.RSF_MAX);
      spellFlags.on(MonsterSpellFlag.BR_FIRE);
      const race = makeMinimalRace({ spellFlags });
      expect(monsterHasSpell(race, MonsterSpellFlag.BR_FIRE)).toBe(true);
    });

    it("should return false when race lacks the spell", () => {
      const race = makeMinimalRace();
      expect(monsterHasSpell(race, MonsterSpellFlag.BR_FIRE)).toBe(false);
    });
  });

  describe("breathDamage", () => {
    it("should calculate damage as hp / divisor for fire breath", () => {
      // BR_FIRE: divisor = 3, cap = 1600
      expect(breathDamage(MonsterSpellFlag.BR_FIRE, 300)).toBe(100);
    });

    it("should cap damage at the maximum", () => {
      // BR_FIRE: cap = 1600, divisor = 3
      expect(breathDamage(MonsterSpellFlag.BR_FIRE, 10000)).toBe(1600);
    });

    it("should use different divisors for different elements", () => {
      // BR_NETH: divisor = 6
      expect(breathDamage(MonsterSpellFlag.BR_NETH, 300)).toBe(50);
    });

    it("should return 0 for non-breath spells", () => {
      expect(breathDamage(MonsterSpellFlag.BA_FIRE, 300)).toBe(0);
    });
  });

  describe("getSpellDamage", () => {
    it("should use breath formula for breath spells", () => {
      const race = makeMinimalRace({ avgHp: 300 });
      const dam = getSpellDamage(MonsterSpellFlag.BR_FIRE, race, rng);
      expect(dam).toBe(100); // 300 / 3
    });

    it("should use dice for non-breath spells", () => {
      const race = makeMinimalRace({ spellPower: 50 });
      const dam = getSpellDamage(MonsterSpellFlag.BO_FIRE, race, rng);
      expect(dam).toBeGreaterThan(0);
    });

    it("should return 0 for non-damaging spells", () => {
      const race = makeMinimalRace();
      const dam = getSpellDamage(MonsterSpellFlag.HEAL, race, rng);
      expect(dam).toBe(0);
    });
  });

  describe("monsterSpellFailrate", () => {
    it("should return 0 for stupid monsters", () => {
      const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
      flags.on(MonsterRaceFlag.STUPID);
      const mon = makeMinimalMonster({ flags });
      expect(monsterSpellFailrate(mon)).toBe(0);
    });

    it("should increase failrate with fear", () => {
      const mon = makeMinimalMonster();
      const baseFail = monsterSpellFailrate(mon);
      mon.mTimed[MonsterTimedEffect.FEAR] = 10;
      const fearFail = monsterSpellFailrate(mon);
      expect(fearFail).toBe(baseFail + 20);
    });

    it("should increase failrate with confusion", () => {
      const mon = makeMinimalMonster();
      const baseFail = monsterSpellFailrate(mon);
      mon.mTimed[MonsterTimedEffect.CONF] = 10;
      const confFail = monsterSpellFailrate(mon);
      expect(confFail).toBe(baseFail + 50);
    });

    it("should be non-negative", () => {
      const mon = makeMinimalMonster({ spellPower: 200 });
      expect(monsterSpellFailrate(mon)).toBeGreaterThanOrEqual(0);
    });
  });

  describe("monsterChooseSpell", () => {
    it("should return null when no spells available", () => {
      const mon = makeMinimalMonster();
      const result = monsterChooseSpell(mon, mon.race, rng);
      expect(result).toBeNull();
    });

    it("should choose from available spells", () => {
      const spellFlags = new BitFlag(MonsterSpellFlag.RSF_MAX);
      spellFlags.on(MonsterSpellFlag.BR_FIRE);
      spellFlags.on(MonsterSpellFlag.BO_COLD);
      const mon = makeMinimalMonster({ spellFlags });

      const chosen = monsterChooseSpell(mon, mon.race, rng);
      expect(chosen).not.toBeNull();
      expect([MonsterSpellFlag.BR_FIRE, MonsterSpellFlag.BO_COLD]).toContain(chosen);
    });

    it("should filter out HEAL when at full HP", () => {
      const spellFlags = new BitFlag(MonsterSpellFlag.RSF_MAX);
      spellFlags.on(MonsterSpellFlag.HEAL);
      const mon = makeMinimalMonster({ spellFlags });
      mon.hp = mon.maxhp;

      // HEAL is the only spell, but it gets filtered
      const chosen = monsterChooseSpell(mon, mon.race, rng);
      expect(chosen).toBeNull();
    });

    it("should allow HEAL when HP is below max", () => {
      const spellFlags = new BitFlag(MonsterSpellFlag.RSF_MAX);
      spellFlags.on(MonsterSpellFlag.HEAL);
      const mon = makeMinimalMonster({ spellFlags });
      mon.hp = Math.floor(mon.maxhp / 2);

      const chosen = monsterChooseSpell(mon, mon.race, rng);
      expect(chosen).toBe(MonsterSpellFlag.HEAL);
    });

    it("should filter out HASTE when already well-hasted", () => {
      const spellFlags = new BitFlag(MonsterSpellFlag.RSF_MAX);
      spellFlags.on(MonsterSpellFlag.HASTE);
      const mon = makeMinimalMonster({ spellFlags });
      mon.mTimed[MonsterTimedEffect.FAST] = 20;

      const chosen = monsterChooseSpell(mon, mon.race, rng);
      expect(chosen).toBeNull();
    });
  });

  describe("monsterCastSpell", () => {
    it("should return a result with damage for damaging spells", () => {
      const mon = makeMinimalMonster();
      const result = monsterCastSpell(mon, MonsterSpellFlag.BR_FIRE, loc(5, 6), rng);
      expect(result.spell).toBe(MonsterSpellFlag.BR_FIRE);
      expect(result.damage).toBeGreaterThan(0);
      expect(result.message).toContain("breathe fire");
    });

    it("should return 0 damage for non-damaging spells", () => {
      const mon = makeMinimalMonster();
      const result = monsterCastSpell(mon, MonsterSpellFlag.HEAL, loc(5, 5), rng);
      expect(result.spell).toBe(MonsterSpellFlag.HEAL);
      expect(result.damage).toBe(0);
    });

    it("should set radius for ball spells", () => {
      const mon = makeMinimalMonster();
      const result = monsterCastSpell(mon, MonsterSpellFlag.BA_FIRE, loc(5, 6), rng);
      expect(result.radius).toBe(2);
    });

    it("should set larger radius for STORM", () => {
      const mon = makeMinimalMonster();
      const result = monsterCastSpell(mon, MonsterSpellFlag.STORM, loc(5, 6), rng);
      expect(result.radius).toBe(3);
    });

    it("should set radius 0 for bolt spells", () => {
      const mon = makeMinimalMonster();
      const result = monsterCastSpell(mon, MonsterSpellFlag.BO_FIRE, loc(5, 6), rng);
      expect(result.radius).toBe(0);
    });

    it("innate spells should never fail", () => {
      // Give monster high confusion/fear to increase failrate
      const mon = makeMinimalMonster();
      mon.mTimed[MonsterTimedEffect.CONF] = 30;
      mon.mTimed[MonsterTimedEffect.FEAR] = 30;

      let succeeded = 0;
      for (let i = 0; i < 50; i++) {
        const result = monsterCastSpell(mon, MonsterSpellFlag.BR_FIRE, loc(5, 6), rng);
        if (result.damage > 0) succeeded++;
      }
      // All should succeed (innate spells never fail)
      expect(succeeded).toBe(50);
    });

    it("non-innate spells may fail", () => {
      // Give monster conditions that increase failrate drastically
      const mon = makeMinimalMonster({ spellPower: 1 });
      mon.mTimed[MonsterTimedEffect.CONF] = 30;
      mon.mTimed[MonsterTimedEffect.FEAR] = 30;

      let failures = 0;
      for (let i = 0; i < 100; i++) {
        const result = monsterCastSpell(mon, MonsterSpellFlag.BA_FIRE, loc(5, 6), rng);
        if (result.damage === 0 && result.message.includes("fails")) failures++;
      }
      // Should see some failures with a very high failrate
      expect(failures).toBeGreaterThan(0);
    });
  });
});
