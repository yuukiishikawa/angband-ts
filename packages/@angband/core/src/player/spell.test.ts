/**
 * Tests for player/spell.ts — Spell casting system.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  spellByIndex,
  spellFailChance,
  canCastSpell,
  canStudySpell,
  castSpell,
  learnSpell,
  getAvailableSpells,
  getStudyableSpells,
  spellIsLearned,
  getCastingStat,
} from "./spell.js";
import {
  PY_SPELL_LEARNED,
  PY_SPELL_WORKED,
  TimedEffect,
  TMD_MAX,
  Stat,
  PlayerFlag,
} from "../types/index.js";
import type { Player, ClassSpell } from "../types/index.js";
import { RNG, BitFlag } from "../z/index.js";

// ── Test helpers ──

/** Create a minimal class spell for testing. */
function makeSpell(
  name: string,
  sidx: number,
  slevel: number,
  smana: number,
  sfail: number,
  sexp = 1,
  realm = "arcane",
): ClassSpell {
  return {
    name,
    text: `${name} spell`,
    sidx,
    bidx: 0,
    slevel,
    smana,
    sfail,
    sexp,
    realm,
  };
}

/**
 * Create a test player with a spell-casting class.
 */
function createTestPlayer(spells: ClassSpell[]): Player {
  const pflags = new BitFlag(20);
  const flags = new BitFlag(128);

  const totalSpells = spells.length;

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
      name: "Mage",
      cidx: 1,
      titles: [],
      statAdj: [0, 0, 0, 0, 0],
      skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      extraSkills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      hitDice: 6,
      expFactor: 30,
      flags: new BitFlag(128),
      pflags: new BitFlag(20),
      maxAttacks: 4,
      minWeight: 40,
      attMultiply: 2,
      startItems: [],
      magic: {
        spellFirst: 1,
        spellWeight: 300,
        numBooks: 1,
        books: [
          {
            tval: 90,
            sval: 0,
            dungeon: false,
            numSpells: totalSpells,
            realm: "arcane",
            spells,
          },
        ],
        totalSpells,
      },
    },
    grid: { x: 0, y: 0 },
    oldGrid: { x: 0, y: 0 },
    hitdie: 6,
    expfact: 130,
    age: 20,
    ht: 72,
    wt: 180,
    au: 0,
    maxDepth: 0,
    recallDepth: 0,
    depth: 0,
    maxLev: 10,
    lev: 10,
    maxExp: 0,
    exp: 0,
    expFrac: 0,
    mhp: 50,
    chp: 50,
    chpFrac: 0,
    msp: 30,
    csp: 30,
    cspFrac: 0,
    statMax: [10, 18, 10, 10, 10],
    statCur: [10, 18, 10, 10, 10],
    statMap: [0, 1, 2, 3, 4],
    timed: new Array(TMD_MAX).fill(0) as number[],
    wordRecall: 0,
    deepDescent: 0,
    energy: 0,
    totalEnergy: 0,
    restingTurn: 0,
    food: 0,
    unignoring: 0,
    spellFlags: new Array(totalSpells).fill(0) as number[],
    spellOrder: new Array(totalSpells).fill(99) as number[],
    fullName: "Test Mage",
    diedFrom: "",
    history: "",
    quests: [],
    totalWinner: false,
    noscore: 0,
    isDead: false,
    wizard: false,
    playerHp: [],
    auBirth: 0,
    statBirth: [10, 18, 10, 10, 10],
    htBirth: 72,
    wtBirth: 180,
    body: { name: "humanoid", count: 0, slots: [] },
    shape: null,
    state: {
      statAdd: [0, 0, 0, 0, 0],
      statInd: [10, 15, 10, 10, 10], // INT stat_ind = 15 for good casting
      statUse: [10, 18, 10, 10, 10],
      statTop: [10, 18, 10, 10, 10],
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
      statInd: [10, 15, 10, 10, 10],
      statUse: [10, 18, 10, 10, 10],
      statTop: [10, 18, 10, 10, 10],
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
      newSpells: 5,
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

describe("spellByIndex", () => {
  it("returns the correct spell by index", () => {
    const spells = [
      makeSpell("Magic Missile", 0, 1, 1, 22),
      makeSpell("Detect Monsters", 1, 1, 1, 23),
      makeSpell("Phase Door", 2, 1, 2, 24),
    ];
    const player = createTestPlayer(spells);

    const s0 = spellByIndex(player, 0);
    expect(s0).not.toBeNull();
    expect(s0!.name).toBe("Magic Missile");

    const s2 = spellByIndex(player, 2);
    expect(s2).not.toBeNull();
    expect(s2!.name).toBe("Phase Door");
  });

  it("returns null for out-of-range index", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);

    expect(spellByIndex(player, -1)).toBeNull();
    expect(spellByIndex(player, 5)).toBeNull();
  });
});

describe("getCastingStat", () => {
  it("returns INT for arcane spells", () => {
    const spell = makeSpell("Bolt", 0, 1, 1, 22, 1, "arcane");
    expect(getCastingStat(spell)).toBe(Stat.INT);
  });

  it("returns WIS for divine spells", () => {
    const spell = makeSpell("Heal", 0, 1, 1, 22, 1, "divine");
    expect(getCastingStat(spell)).toBe(Stat.WIS);
  });

  it("returns WIS for prayer spells", () => {
    const spell = makeSpell("Bless", 0, 1, 1, 22, 1, "prayer");
    expect(getCastingStat(spell)).toBe(Stat.WIS);
  });
});

describe("spellFailChance", () => {
  it("returns 100 for non-spellcasting class", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);
    // Zero out total spells to simulate non-caster
    (player.class.magic as { totalSpells: number }).totalSpells = 0;

    expect(spellFailChance(player, spells[0]!)).toBe(100);
  });

  it("returns a reasonable failure chance for a basic spell", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);

    const chance = spellFailChance(player, spells[0]!);
    // Level 10 mage casting a level 1 spell with base fail 22
    // Adjusted by: -3*(10-1) = -27, minus stat adj
    // Should be low but clamped to minfail
    expect(chance).toBeGreaterThanOrEqual(0);
    expect(chance).toBeLessThanOrEqual(95);
  });

  it("increases failure when mana is insufficient", () => {
    const spells = [makeSpell("Fireball", 0, 5, 25, 40)];
    const player = createTestPlayer(spells);

    const normalChance = spellFailChance(player, spells[0]!);

    // Reduce mana below spell cost
    player.csp = 5;
    const lowManaChance = spellFailChance(player, spells[0]!);

    expect(lowManaChance).toBeGreaterThan(normalChance);
  });

  it("increases failure when stunned", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);

    const normalChance = spellFailChance(player, spells[0]!);

    // Apply heavy stun
    player.timed[TimedEffect.STUN] = 60;
    const stunnedChance = spellFailChance(player, spells[0]!);

    expect(stunnedChance).toBeGreaterThan(normalChance);
  });

  it("increases failure when afraid", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);

    const normalChance = spellFailChance(player, spells[0]!);

    player.timed[TimedEffect.AFRAID] = 10;
    const afraidChance = spellFailChance(player, spells[0]!);

    expect(afraidChance).toBeGreaterThan(normalChance);
  });

  it("amnesia makes spells very difficult", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);

    const normalChance = spellFailChance(player, spells[0]!);

    player.timed[TimedEffect.AMNESIA] = 10;
    const amnesiaChance = spellFailChance(player, spells[0]!);

    expect(amnesiaChance).toBeGreaterThan(normalChance);
  });

  it("never exceeds 95% failure", () => {
    // Very hard spell for a very weak caster
    const spells = [makeSpell("Mana Storm", 0, 50, 100, 99)];
    const player = createTestPlayer(spells);
    player.lev = 1;
    player.csp = 0;
    player.timed[TimedEffect.STUN] = 100;
    player.timed[TimedEffect.AMNESIA] = 100;

    const chance = spellFailChance(player, spells[0]!);
    expect(chance).toBeLessThanOrEqual(95);
  });
});

describe("canCastSpell / spellIsLearned", () => {
  it("returns false for unlearned spell", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);

    expect(canCastSpell(player, spells[0]!)).toBe(false);
    expect(spellIsLearned(player, 0)).toBe(false);
  });

  it("returns true for learned spell", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);
    player.spellFlags[0] = PY_SPELL_LEARNED;

    expect(canCastSpell(player, spells[0]!)).toBe(true);
    expect(spellIsLearned(player, 0)).toBe(true);
  });
});

describe("canStudySpell", () => {
  it("returns true for spell at or below player level that is not learned", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);

    expect(canStudySpell(player, 0)).toBe(true);
  });

  it("returns false for spell above player level", () => {
    const spells = [makeSpell("Mana Storm", 0, 50, 100, 99)];
    const player = createTestPlayer(spells);
    // Player level 10 < spell level 50

    expect(canStudySpell(player, 0)).toBe(false);
  });

  it("returns false for already-learned spell", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);
    player.spellFlags[0] = PY_SPELL_LEARNED;

    expect(canStudySpell(player, 0)).toBe(false);
  });
});

describe("learnSpell", () => {
  it("marks spell as learned and records in spell_order", () => {
    const spells = [
      makeSpell("Magic Missile", 0, 1, 1, 22),
      makeSpell("Phase Door", 1, 1, 2, 24),
    ];
    const player = createTestPlayer(spells);

    const messages = learnSpell(player, 0);

    expect(player.spellFlags[0]! & PY_SPELL_LEARNED).toBeTruthy();
    expect(player.spellOrder[0]).toBe(0);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toContain("Magic Missile");
  });

  it("decrements newSpells", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);
    player.upkeep.newSpells = 3;

    learnSpell(player, 0);
    expect(player.upkeep.newSpells).toBe(2);
  });

  it("records spells in order they are learned", () => {
    const spells = [
      makeSpell("Magic Missile", 0, 1, 1, 22),
      makeSpell("Phase Door", 1, 1, 2, 24),
      makeSpell("Light Area", 2, 2, 2, 25),
    ];
    const player = createTestPlayer(spells);

    learnSpell(player, 1);
    learnSpell(player, 0);

    expect(player.spellOrder[0]).toBe(1);
    expect(player.spellOrder[1]).toBe(0);
    expect(player.spellOrder[2]).toBe(99); // unlearned
  });
});

describe("castSpell", () => {
  let rng: RNG;

  beforeEach(() => {
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);
  });

  it("deducts mana on cast", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 5, 22)];
    const player = createTestPlayer(spells);
    player.spellFlags[0] = PY_SPELL_LEARNED;

    const result = castSpell(player, spells[0]!, rng);
    expect(result.manaCost).toBe(5);
    expect(player.csp).toBeLessThanOrEqual(25); // 30 - 5
  });

  it("succeeds with fixed RNG at 100% (0% failure)", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 5)]; // low fail
    const player = createTestPlayer(spells);
    player.spellFlags[0] = PY_SPELL_LEARNED;

    // Fix RNG to always roll 99 (>= any failure chance)
    rng.fix(100);
    const result = castSpell(player, spells[0]!, rng);
    expect(result.success).toBe(true);
    rng.unfix();
  });

  it("fails with fixed RNG at 0% (always fails when fail chance > 0)", () => {
    // Spell with guaranteed high failure for a level 1 caster
    const spells = [makeSpell("Mana Storm", 0, 45, 100, 90)];
    const player = createTestPlayer(spells);
    player.lev = 1;
    player.spellFlags[0] = PY_SPELL_LEARNED;

    rng.fix(0);
    const result = castSpell(player, spells[0]!, rng);
    expect(result.success).toBe(false);
    expect(result.messages).toContain("You failed to concentrate hard enough!");
    rng.unfix();
  });

  it("grants experience on first successful cast", () => {
    const spells = [makeSpell("Magic Missile", 0, 3, 1, 5, 10)];
    const player = createTestPlayer(spells);
    player.spellFlags[0] = PY_SPELL_LEARNED;
    player.exp = 100;
    player.maxExp = 100;

    rng.fix(100); // guarantee success
    castSpell(player, spells[0]!, rng);
    rng.unfix();

    // sexp=10 * slevel=3 = 30 experience
    expect(player.exp).toBe(130);
    expect(player.spellFlags[0]! & PY_SPELL_WORKED).toBeTruthy();
  });

  it("does not grant experience on subsequent casts", () => {
    const spells = [makeSpell("Magic Missile", 0, 3, 1, 5, 10)];
    const player = createTestPlayer(spells);
    player.spellFlags[0] = PY_SPELL_LEARNED | PY_SPELL_WORKED;
    player.exp = 100;

    rng.fix(100);
    castSpell(player, spells[0]!, rng);
    rng.unfix();

    expect(player.exp).toBe(100); // unchanged
  });

  it("handles over-exertion when mana is insufficient", () => {
    const spells = [makeSpell("Fireball", 0, 5, 25, 30)];
    const player = createTestPlayer(spells);
    player.spellFlags[0] = PY_SPELL_LEARNED;
    player.csp = 10; // not enough for 25

    rng.fix(100);
    const result = castSpell(player, spells[0]!, rng);
    rng.unfix();

    expect(player.csp).toBe(0);
    expect(player.cspFrac).toBe(0);
    expect(result.messages.some((m) => m.includes("faint"))).toBe(true);
  });
});

describe("getAvailableSpells", () => {
  it("returns only learned spells", () => {
    const spells = [
      makeSpell("Magic Missile", 0, 1, 1, 22),
      makeSpell("Phase Door", 1, 1, 2, 24),
      makeSpell("Light Area", 2, 2, 2, 25),
    ];
    const player = createTestPlayer(spells);
    player.spellFlags[0] = PY_SPELL_LEARNED;
    player.spellFlags[2] = PY_SPELL_LEARNED;

    const available = getAvailableSpells(player);
    expect(available).toHaveLength(2);
    expect(available[0]!.name).toBe("Magic Missile");
    expect(available[1]!.name).toBe("Light Area");
  });

  it("returns empty for non-caster", () => {
    const player = createTestPlayer([]);
    expect(getAvailableSpells(player)).toHaveLength(0);
  });
});

describe("getStudyableSpells", () => {
  it("returns spells at or below player level that are not learned", () => {
    const spells = [
      makeSpell("Magic Missile", 0, 1, 1, 22),
      makeSpell("Fireball", 1, 20, 15, 50),
      makeSpell("Phase Door", 2, 5, 2, 24),
    ];
    const player = createTestPlayer(spells);
    player.lev = 10;
    player.spellFlags[0] = PY_SPELL_LEARNED; // already learned

    const studyable = getStudyableSpells(player);
    // Only Phase Door (level 5, not learned) should be available
    // Magic Missile is already learned, Fireball requires level 20
    expect(studyable).toHaveLength(1);
    expect(studyable[0]!.name).toBe("Phase Door");
  });
});
