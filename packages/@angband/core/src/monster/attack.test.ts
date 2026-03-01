/**
 * Tests for monster/attack.ts — Monster melee combat.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { RNG, BitFlag, randomValue } from "../z/index.js";
import {
  type Monster,
  type MonsterRace,
  type MonsterBlow,
  type Player,
  type PlayerState,
  BlowMethod,
  BlowEffect,
  MonsterRaceFlag,
  MonsterTimedEffect,
} from "../types/index.js";
import {
  testHit,
  chanceOfMonsterHitBase,
  adjustDamArmor,
  monsterCritical,
  calculateBlowDamage,
  resolveBlowMethod,
  resolveBlowEffect,
  monsterAttackPlayer,
} from "./attack.js";

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

function makeMinimalMonster(
  raceOverrides: Partial<MonsterRace> = {},
  blows: MonsterBlow[] = [],
): Monster {
  const race = makeMinimalRace({ ...raceOverrides, blows });
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
    cdis: 1,
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

function makeMinimalPlayer(ac = 50, toA = 10): Player {
  const state: PlayerState = {
    statAdd: [0, 0, 0, 0, 0],
    statInd: [0, 0, 0, 0, 0],
    statUse: [0, 0, 0, 0, 0],
    statTop: [0, 0, 0, 0, 0],
    skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    speed: 110,
    numBlows: 100,
    numShots: 10,
    numMoves: 0,
    ammoMult: 1,
    ammoTval: 0,
    ac,
    damRed: 0,
    percDamRed: 0,
    toA,
    toH: 0,
    toD: 0,
    seeInfra: 0,
    curLight: 0,
    heavyWield: false,
    heavyShoot: false,
    blessWield: false,
    cumberArmor: false,
    flags: new BitFlag(1),
    pflags: new BitFlag(1),
    elInfo: [],
  };

  return {
    race: {} as any,
    class: {} as any,
    grid: { x: 5, y: 6 },
    oldGrid: { x: 0, y: 0 },
    hitdie: 10,
    expfact: 100,
    age: 20,
    ht: 72,
    wt: 180,
    au: 1000,
    maxDepth: 0,
    recallDepth: 0,
    depth: 0,
    maxLev: 1,
    lev: 10,
    maxExp: 0,
    exp: 0,
    expFrac: 0,
    mhp: 100,
    chp: 100,
    chpFrac: 0,
    msp: 0,
    csp: 0,
    cspFrac: 0,
    statMax: [15, 15, 15, 15, 15],
    statCur: [15, 15, 15, 15, 15],
    statMap: [0, 1, 2, 3, 4],
    timed: new Array(53).fill(0),
    wordRecall: 0,
    deepDescent: 0,
    energy: 0,
    totalEnergy: 0,
    restingTurn: 0,
    food: 0,
    unignoring: 0,
    spellFlags: [],
    spellOrder: [],
    fullName: "Tester",
    diedFrom: "",
    history: "",
    quests: [],
    totalWinner: false,
    noscore: 0,
    isDead: false,
    wizard: false,
    playerHp: [],
    auBirth: 0,
    statBirth: [],
    htBirth: 0,
    wtBirth: 0,
    body: { name: "humanoid", count: 0, slots: [] },
    shape: null,
    state,
    knownState: state,
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
  } as Player;
}

function makeBlow(
  method: BlowMethod,
  effect: BlowEffect,
  dice = 3,
  sides = 6,
): MonsterBlow {
  return {
    method,
    effect,
    dice: randomValue(0, dice, sides, 0),
    timesSeen: 0,
  };
}

describe("monster/attack", () => {
  let rng: RNG;

  beforeEach(() => {
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);
  });

  describe("testHit", () => {
    it("should almost always hit with very high toHit vs low AC", () => {
      let hits = 0;
      for (let i = 0; i < 200; i++) {
        if (testHit(1000, 1, rng)) hits++;
      }
      // C formula: 95% hit rate (12% auto-hit, 5% auto-miss, ~83% normal)
      expect(hits).toBeGreaterThan(170);
      expect(hits).toBeLessThanOrEqual(200);
    });

    it("should sometimes miss with low toHit vs high AC", () => {
      let hits = 0;
      for (let i = 0; i < 200; i++) {
        if (testHit(5, 200, rng)) hits++;
      }
      // C formula: 12% hit rate (only auto-hit, normal roll always fails)
      expect(hits).toBeLessThan(50);
      expect(hits).toBeGreaterThan(0); // 12% auto-hit
    });
  });

  describe("chanceOfMonsterHitBase", () => {
    it("should return level*3 + effect power", () => {
      const race = makeMinimalRace({ level: 20 });
      // HURT has power 60
      expect(chanceOfMonsterHitBase(race, BlowEffect.HURT)).toBe(20 * 3 + 60);
    });

    it("should use minimum level of 1", () => {
      const race = makeMinimalRace({ level: 0 });
      expect(chanceOfMonsterHitBase(race, BlowEffect.HURT)).toBe(1 * 3 + 60);
    });
  });

  describe("adjustDamArmor", () => {
    it("should reduce damage based on AC", () => {
      // dam - (dam * min(ac, 240) / 400)
      // 100 - (100 * 100 / 400) = 100 - 25 = 75
      expect(adjustDamArmor(100, 100)).toBe(75);
    });

    it("should return 0 for 0 damage", () => {
      expect(adjustDamArmor(0, 100)).toBe(0);
    });

    it("should cap AC at 240", () => {
      const dam240 = adjustDamArmor(100, 240);
      const dam400 = adjustDamArmor(100, 400);
      expect(dam240).toBe(dam400);
    });
  });

  describe("monsterCritical", () => {
    it("should return 0 when damage is below 95% of max", () => {
      const dice = randomValue(0, 3, 6, 0); // max = 18
      // 95% of 18 = 17.1, so damage of 10 should not crit
      expect(monsterCritical(dice, 10, 10, rng)).toBe(0);
    });

    it("should return > 0 for near-maximum damage", () => {
      // Fix RNG so weak blow check passes
      rng.fix(0); // randint0(100) returns 0, which is < dam for dam >= 1
      const dice = randomValue(0, 3, 6, 0); // max = 18
      const result = monsterCritical(dice, 10, 18, rng);
      rng.unfix();
      expect(result).toBeGreaterThan(0);
    });
  });

  describe("calculateBlowDamage", () => {
    it("should roll damage from blow dice", () => {
      const blow = makeBlow(BlowMethod.HIT, BlowEffect.HURT, 3, 6);
      const mon = makeMinimalMonster({}, [blow]);

      const damages: number[] = [];
      for (let i = 0; i < 100; i++) {
        damages.push(calculateBlowDamage(blow, 10, mon, rng));
      }

      // 3d6: min 3, max 18
      expect(Math.min(...damages)).toBeGreaterThanOrEqual(3);
      expect(Math.max(...damages)).toBeLessThanOrEqual(18);
    });

    it("should reduce damage when stunned", () => {
      const blow = makeBlow(BlowMethod.HIT, BlowEffect.HURT, 10, 10);
      const mon = makeMinimalMonster({}, [blow]);

      // Get a baseline without stun (fixed RNG for consistency)
      rng.fix(50);
      const normalDmg = calculateBlowDamage(blow, 10, mon, rng);
      rng.unfix();

      // Stun the monster
      mon.mTimed[MonsterTimedEffect.STUN] = 10;
      rng.fix(50);
      const stunnedDmg = calculateBlowDamage(blow, 10, mon, rng);
      rng.unfix();

      expect(stunnedDmg).toBeLessThan(normalDmg);
    });
  });

  describe("resolveBlowMethod", () => {
    it("should always hit for NONE effect", () => {
      const mon = makeMinimalMonster();
      for (let i = 0; i < 20; i++) {
        expect(resolveBlowMethod(BlowMethod.HIT, BlowEffect.NONE, mon, 200, rng)).toBe(true);
      }
    });

    it("should resolve hits based on toHit vs AC", () => {
      const mon = makeMinimalMonster({ level: 50 });
      let hits = 0;
      for (let i = 0; i < 100; i++) {
        if (resolveBlowMethod(BlowMethod.HIT, BlowEffect.HURT, mon, 10, rng)) hits++;
      }
      // Level 50 monster vs AC 10 should hit most of the time
      expect(hits).toBeGreaterThan(80);
    });
  });

  describe("resolveBlowEffect", () => {
    it("should apply AC reduction for HURT", () => {
      const result = resolveBlowEffect(BlowEffect.HURT, 100, 100);
      expect(result.damage).toBe(75); // 100 - (100 * 100 / 400)
      expect(result.statusEffect).toBeNull();
    });

    it("should return status effect for POISON", () => {
      const result = resolveBlowEffect(BlowEffect.POISON, 10, 0);
      expect(result.damage).toBe(10);
      expect(result.statusEffect).not.toBeNull();
      expect(result.statusEffect!.kind).toBe("poison");
    });

    it("should return status effect for stat drain", () => {
      const result = resolveBlowEffect(BlowEffect.LOSE_STR, 5, 0);
      expect(result.statusEffect).not.toBeNull();
      expect(result.statusEffect!.kind).toBe("drain_str");
    });

    it("should return null status for HURT", () => {
      const result = resolveBlowEffect(BlowEffect.HURT, 50, 0);
      expect(result.statusEffect).toBeNull();
    });

    it("should never produce negative damage", () => {
      const result = resolveBlowEffect(BlowEffect.HURT, 0, 999);
      expect(result.damage).toBeGreaterThanOrEqual(0);
    });
  });

  describe("monsterAttackPlayer", () => {
    it("should return empty array for NEVER_BLOW monsters", () => {
      const flags = new BitFlag(MonsterRaceFlag.RF_MAX);
      flags.on(MonsterRaceFlag.NEVER_BLOW);
      const mon = makeMinimalMonster({ flags }, []);
      const player = makeMinimalPlayer();

      const results = monsterAttackPlayer(mon, player, rng);
      expect(results).toHaveLength(0);
    });

    it("should process all blow slots", () => {
      const blows: MonsterBlow[] = [
        makeBlow(BlowMethod.HIT, BlowEffect.HURT, 3, 6),
        makeBlow(BlowMethod.CLAW, BlowEffect.HURT, 2, 4),
      ];
      const mon = makeMinimalMonster({ level: 30 }, blows);
      const player = makeMinimalPlayer(10, 0);

      const results = monsterAttackPlayer(mon, player, rng);
      expect(results).toHaveLength(2);
    });

    it("should stop at NONE method blow", () => {
      const blows: MonsterBlow[] = [
        makeBlow(BlowMethod.HIT, BlowEffect.HURT, 3, 6),
        makeBlow(BlowMethod.NONE, BlowEffect.NONE, 0, 0),
        makeBlow(BlowMethod.CLAW, BlowEffect.HURT, 2, 4),
      ];
      const mon = makeMinimalMonster({ level: 30 }, blows);
      const player = makeMinimalPlayer();

      const results = monsterAttackPlayer(mon, player, rng);
      expect(results).toHaveLength(1);
    });

    it("should generate hit/miss messages", () => {
      const blows: MonsterBlow[] = [
        makeBlow(BlowMethod.HIT, BlowEffect.HURT, 3, 6),
      ];
      const mon = makeMinimalMonster({ level: 50 }, blows);
      const player = makeMinimalPlayer(10, 0);

      const results = monsterAttackPlayer(mon, player, rng);
      expect(results).toHaveLength(1);
      expect(results[0]!.message).toBeTruthy();
    });

    it("should produce damage > 0 on hits", () => {
      const blows: MonsterBlow[] = [
        makeBlow(BlowMethod.HIT, BlowEffect.HURT, 5, 8),
      ];
      // High level so hits are almost guaranteed
      const mon = makeMinimalMonster({ level: 50 }, blows);
      const player = makeMinimalPlayer(0, 0);

      let sawDamage = false;
      for (let i = 0; i < 50; i++) {
        const results = monsterAttackPlayer(mon, player, rng);
        if (results[0]?.hit && results[0].damage > 0) {
          sawDamage = true;
          break;
        }
      }
      expect(sawDamage).toBe(true);
    });
  });
});
