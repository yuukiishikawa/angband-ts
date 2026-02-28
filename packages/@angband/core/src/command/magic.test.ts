/**
 * Tests for command/magic.ts — Spell/magic command layer.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cmdCast, cmdStudy, cmdBrowse } from "./magic.js";
import type { CommandResult, SpellInfo, BrowseResult } from "./magic.js";
import {
  PY_SPELL_LEARNED,
  PY_SPELL_WORKED,
  TimedEffect,
  TMD_MAX,
} from "../types/index.js";
import type { Player, ClassSpell } from "../types/index.js";
import { RNG, BitFlag } from "../z/index.js";

// ── Test helpers ──

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

describe("cmdCast", () => {
  let rng: RNG;

  beforeEach(() => {
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);
  });

  it("fails when the player has no spells", () => {
    const player = createTestPlayer([]);
    const result = cmdCast(player, 0, null, rng);

    expect(result.success).toBe(false);
    expect(result.energyCost).toBe(0);
    expect(result.messages).toContain("You cannot cast spells!");
  });

  it("fails for an invalid spell index", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);
    player.spellFlags[0] = PY_SPELL_LEARNED;

    const result = cmdCast(player, 99, null, rng);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("That spell does not exist.");
  });

  it("fails when the spell has not been learned", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);

    const result = cmdCast(player, 0, null, rng);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You have not learned that spell.");
  });

  it("fails when paralyzed", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);
    player.spellFlags[0] = PY_SPELL_LEARNED;
    player.timed[TimedEffect.PARALYZED] = 10;

    const result = cmdCast(player, 0, null, rng);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You are paralyzed!");
  });

  it("fails when confused", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);
    player.spellFlags[0] = PY_SPELL_LEARNED;
    player.timed[TimedEffect.CONFUSED] = 10;

    const result = cmdCast(player, 0, null, rng);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You are too confused to cast spells!");
  });

  it("fails when blind", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);
    player.spellFlags[0] = PY_SPELL_LEARNED;
    player.timed[TimedEffect.BLIND] = 10;

    const result = cmdCast(player, 0, null, rng);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You cannot see!");
  });

  it("succeeds when casting a learned spell with fixed RNG", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 5)];
    const player = createTestPlayer(spells);
    player.spellFlags[0] = PY_SPELL_LEARNED;

    rng.fix(100); // Always succeed
    const result = cmdCast(player, 0, null, rng);
    rng.unfix();

    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
  });

  it("consumes mana on cast", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 5, 5)];
    const player = createTestPlayer(spells);
    player.spellFlags[0] = PY_SPELL_LEARNED;

    rng.fix(100);
    cmdCast(player, 0, null, rng);
    rng.unfix();

    expect(player.csp).toBe(25); // 30 - 5
  });

  it("uses reduced energy when fast casting is active", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 5)];
    const player = createTestPlayer(spells);
    player.spellFlags[0] = PY_SPELL_LEARNED;
    player.timed[TimedEffect.FASTCAST] = 10;

    rng.fix(100);
    const result = cmdCast(player, 0, null, rng);
    rng.unfix();

    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(75); // Fast cast = 3/4 energy
  });

  it("warns when mana is insufficient but still attempts", () => {
    const spells = [makeSpell("Fireball", 0, 5, 25, 30)];
    const player = createTestPlayer(spells);
    player.spellFlags[0] = PY_SPELL_LEARNED;
    player.csp = 10;

    rng.fix(100);
    const result = cmdCast(player, 0, null, rng);
    rng.unfix();

    expect(result.messages.some((m) => m.includes("not have enough mana"))).toBe(true);
    expect(result.energyCost).toBe(100); // Still costs energy
  });
});

describe("cmdStudy", () => {
  it("fails when the player has no spell system", () => {
    const player = createTestPlayer([]);
    const result = cmdStudy(player, 0);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You cannot learn spells!");
  });

  it("fails when no new spells are available", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);
    player.upkeep.newSpells = 0;

    const result = cmdStudy(player, 0);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You cannot learn any more spells.");
  });

  it("fails when paralyzed", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);
    player.timed[TimedEffect.PARALYZED] = 10;

    const result = cmdStudy(player, 0);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You are paralyzed!");
  });

  it("fails when confused", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);
    player.timed[TimedEffect.CONFUSED] = 10;

    const result = cmdStudy(player, 0);

    expect(result.success).toBe(false);
  });

  it("fails when blind", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);
    player.timed[TimedEffect.BLIND] = 10;

    const result = cmdStudy(player, 0);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You cannot see!");
  });

  it("fails for an already-learned spell", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);
    player.spellFlags[0] = PY_SPELL_LEARNED;

    const result = cmdStudy(player, 0);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You already know that spell.");
  });

  it("fails for a spell above the player's level", () => {
    const spells = [makeSpell("Mana Storm", 0, 50, 100, 99)];
    const player = createTestPlayer(spells);

    const result = cmdStudy(player, 0);

    expect(result.success).toBe(false);
    expect(result.messages).toContain(
      "You are not experienced enough to learn that spell.",
    );
  });

  it("succeeds for a valid, learnable spell", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);

    const result = cmdStudy(player, 0);

    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    expect(player.spellFlags[0]! & PY_SPELL_LEARNED).toBeTruthy();
    expect(result.messages.some((m) => m.includes("Magic Missile"))).toBe(true);
  });

  it("decrements newSpells on successful study", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);
    player.upkeep.newSpells = 3;

    cmdStudy(player, 0);

    expect(player.upkeep.newSpells).toBe(2);
  });
});

describe("cmdBrowse", () => {
  it("returns null for invalid book index", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);

    expect(cmdBrowse(player, -1)).toBeNull();
    expect(cmdBrowse(player, 99)).toBeNull();
  });

  it("returns spell info for a valid book", () => {
    const spells = [
      makeSpell("Magic Missile", 0, 1, 1, 22),
      makeSpell("Phase Door", 1, 1, 2, 24),
    ];
    const player = createTestPlayer(spells);
    player.spellFlags[0] = PY_SPELL_LEARNED | PY_SPELL_WORKED;

    const result = cmdBrowse(player, 0);

    expect(result).not.toBeNull();
    expect(result!.spells).toHaveLength(2);

    // First spell is learned and worked
    expect(result!.spells[0]!.name).toBe("Magic Missile");
    expect(result!.spells[0]!.known).toBe(true);
    expect(result!.spells[0]!.worked).toBe(true);
    expect(result!.spells[0]!.level).toBe(1);
    expect(result!.spells[0]!.manaCost).toBe(1);

    // Second spell is not learned
    expect(result!.spells[1]!.name).toBe("Phase Door");
    expect(result!.spells[1]!.known).toBe(false);
    expect(result!.spells[1]!.worked).toBe(false);
  });

  it("shows failure chance for each spell", () => {
    const spells = [makeSpell("Magic Missile", 0, 1, 1, 22)];
    const player = createTestPlayer(spells);

    const result = cmdBrowse(player, 0);

    expect(result).not.toBeNull();
    expect(result!.spells[0]!.failChance).toBeGreaterThanOrEqual(0);
    expect(result!.spells[0]!.failChance).toBeLessThanOrEqual(95);
  });
});
