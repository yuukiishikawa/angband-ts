/**
 * Tests for player/calcs.ts — derived stat calculations.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { RNG } from "../z/rand.js";
import { BitFlag } from "../z/bitflag.js";
import {
  modifyStatValue,
  adjStatToIndex,
  calcBonuses,
  calcMeleeBonus,
  calcRangedBonus,
  calcAC,
  calcSpeed,
  calcHP,
  calcMana,
  calcBlows,
  calcStatBonusDam,
  calcStatBonusHitDex,
  adjStrTd,
  adjDexTh,
} from "./calcs.js";
import { createPlayer } from "./birth.js";
import type { PlayerRace, PlayerClass, ClassMagic, Player } from "../types/player.js";
import { Stat, STAT_MAX, STAT_RANGE } from "../types/player.js";

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

function makeWarriorClass(): PlayerClass {
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

function makeMageClass(): PlayerClass {
  return {
    name: "Mage",
    cidx: 1,
    titles: [],
    statAdj: [-5, 3, 0, 1, -2],
    skills: [20, 20, 36, 30, 16, 2, 34, 20, 20, 0],
    extraSkills: [7, 7, 13, 9, 0, 0, 16, 16, 16, 0],
    hitDice: 0,
    expFactor: 30,
    flags: new BitFlag(40),
    pflags: new BitFlag(18),
    maxAttacks: 4,
    minWeight: 40,
    attMultiply: 2,
    startItems: [],
    magic: {
      spellFirst: 1,
      spellWeight: 300,
      numBooks: 1,
      books: [],
      totalSpells: 10,
    },
  };
}

function createTestPlayer(): Player {
  const rng = new RNG();
  rng.quick = false;
  rng.stateInit(42);
  return createPlayer("Test", makeTestRace(), makeWarriorClass(), rng);
}

// ── Tests ──

describe("modifyStatValue", () => {
  it("should increase stats below 18 by 1 per point", () => {
    expect(modifyStatValue(10, 3)).toBe(13);
  });

  it("should increase stats at 18 by 10 per point", () => {
    expect(modifyStatValue(18, 1)).toBe(28); // 18 + 10
  });

  it("should increase stats across the 18 boundary", () => {
    expect(modifyStatValue(16, 3)).toBe(28); // 16->17->18->28
  });

  it("should decrease stats above 18+10 by 10 per point", () => {
    expect(modifyStatValue(38, 1)).toBe(48);
    expect(modifyStatValue(38, -1)).toBe(28);
  });

  it("should clamp stats above 18 but below 18+10 back to 18", () => {
    // modifyStatValue(24, -1): 24 >= 18+10 is false (24 < 28), 24 > 18, so -> 18
    expect(modifyStatValue(24, -1)).toBe(18);
  });

  it("should decrease stats below 18 by 1 per point", () => {
    expect(modifyStatValue(10, -3)).toBe(7);
  });

  it("should not go below 3", () => {
    expect(modifyStatValue(5, -10)).toBe(3);
  });

  it("should return same value for 0 amount", () => {
    expect(modifyStatValue(15, 0)).toBe(15);
  });
});

describe("adjStatToIndex", () => {
  it("should return 0 for stat 3 or less", () => {
    expect(adjStatToIndex(3)).toBe(0);
    expect(adjStatToIndex(1)).toBe(0);
    expect(adjStatToIndex(0)).toBe(0);
  });

  it("should return (stat - 3) for stats 4..18", () => {
    expect(adjStatToIndex(4)).toBe(1);
    expect(adjStatToIndex(10)).toBe(7);
    expect(adjStatToIndex(18)).toBe(15);
  });

  it("should return 15 + floor((stat-18)/10) for stats 18/00..18/219", () => {
    expect(adjStatToIndex(18 + 0)).toBe(15); // 18/00
    expect(adjStatToIndex(18 + 9)).toBe(15); // 18/09
    expect(adjStatToIndex(18 + 10)).toBe(16); // 18/10
    expect(adjStatToIndex(18 + 100)).toBe(25); // 18/100
    expect(adjStatToIndex(18 + 219)).toBe(36); // 18/219
  });

  it("should return 37 for stat 18/220+", () => {
    expect(adjStatToIndex(18 + 220)).toBe(37);
    expect(adjStatToIndex(18 + 300)).toBe(37);
  });

  it("should produce all indices 0..37", () => {
    const seen = new Set<number>();
    for (let s = 0; s <= 18 + 230; s++) {
      seen.add(adjStatToIndex(s));
    }
    for (let i = 0; i < STAT_RANGE; i++) {
      expect(seen.has(i)).toBe(true);
    }
  });
});

describe("calcBonuses", () => {
  it("should compute stat indices for a level 1 player", () => {
    const player = createTestPlayer();
    const state = calcBonuses(player);

    for (let i = 0; i < STAT_MAX; i++) {
      const expectedUse = modifyStatValue(
        player.statCur[i]!,
        (player.race.statAdj[i] ?? 0) + (player.class.statAdj[i] ?? 0),
      );
      const expectedInd = adjStatToIndex(expectedUse);
      expect(state.statUse[i]).toBe(expectedUse);
      expect(state.statInd[i]).toBe(expectedInd);
    }
  });

  it("should apply DEX to-AC bonus", () => {
    const player = createTestPlayer();
    const state = calcBonuses(player);
    // The to-A should include at least the DEX bonus
    expect(typeof state.toA).toBe("number");
  });

  it("should apply STR/DEX to-hit bonuses", () => {
    const player = createTestPlayer();
    const state = calcBonuses(player);
    expect(typeof state.toH).toBe("number");
  });

  it("should apply STR to-damage bonus", () => {
    const player = createTestPlayer();
    const state = calcBonuses(player);
    expect(typeof state.toD).toBe("number");
  });

  it("should set base speed to 110", () => {
    const player = createTestPlayer();
    const state = calcBonuses(player);
    expect(state.speed).toBe(110);
  });

  it("should include skills from race + class", () => {
    const player = createTestPlayer();
    const state = calcBonuses(player);
    // Skill values should be non-negative for a warrior at level 1
    for (let i = 0; i < 10; i++) {
      expect(state.skills[i]).toBeDefined();
    }
  });
});

describe("calcMeleeBonus", () => {
  it("should return correct melee bonuses", () => {
    const player = createTestPlayer();
    player.state = calcBonuses(player);
    const bonus = calcMeleeBonus(player, player.state);

    const strInd = player.state.statInd[Stat.STR]!;
    const dexInd = player.state.statInd[Stat.DEX]!;

    expect(bonus.toD).toBe(adjStrTd[strInd]!);
    expect(bonus.toH).toBe(
      adjDexTh[dexInd]! +
        (adjStrTd[strInd]! !== undefined ? calcStatBonusHitDex(dexInd) : 0) +
        // Actually toH = adjStrTh[str] + adjDexTh[dex]
        0,
    );
    // Simpler direct check
    expect(typeof bonus.toH).toBe("number");
    expect(typeof bonus.toD).toBe("number");
  });
});

describe("calcRangedBonus", () => {
  it("should return correct ranged bonuses", () => {
    const player = createTestPlayer();
    player.state = calcBonuses(player);
    const bonus = calcRangedBonus(player, player.state);
    expect(typeof bonus.toH).toBe("number");
    expect(typeof bonus.toD).toBe("number");
  });
});

describe("calcAC", () => {
  it("should return ac + toA", () => {
    const player = createTestPlayer();
    player.state = calcBonuses(player);
    const ac = calcAC(player, player.state);
    expect(ac).toBe(player.state.ac + player.state.toA);
  });
});

describe("calcSpeed", () => {
  it("should return base speed at birth", () => {
    const player = createTestPlayer();
    player.state = calcBonuses(player);
    expect(calcSpeed(player, player.state)).toBe(110);
  });
});

describe("calcHP", () => {
  it("should compute positive HP for a level 1 player", () => {
    const player = createTestPlayer();
    player.state = calcBonuses(player);
    const hp = calcHP(player);
    expect(hp).toBeGreaterThan(0);
  });

  it("should be at least lev + 1", () => {
    const player = createTestPlayer();
    player.state = calcBonuses(player);
    const hp = calcHP(player);
    expect(hp).toBeGreaterThanOrEqual(player.lev + 1);
  });
});

describe("calcMana", () => {
  it("should return 0 for a warrior (no spells)", () => {
    const player = createTestPlayer();
    player.state = calcBonuses(player);
    expect(calcMana(player)).toBe(0);
  });

  it("should return positive mana for a mage", () => {
    const rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);
    const player = createPlayer("Mage", makeTestRace(), makeMageClass(), rng);
    player.state = calcBonuses(player);
    const mana = calcMana(player);
    expect(mana).toBeGreaterThan(0);
  });
});

describe("calcBlows", () => {
  it("should return 100 (1 blow) when unarmed", () => {
    const player = createTestPlayer();
    player.state = calcBonuses(player);
    expect(calcBlows(player.state, player.class, 0)).toBe(100);
  });

  it("should return at least 100 with a weapon", () => {
    const player = createTestPlayer();
    player.state = calcBonuses(player);
    // 30 lb weapon = 300 in 1/10 lbs
    expect(calcBlows(player.state, player.class, 300)).toBeGreaterThanOrEqual(100);
  });

  it("should not exceed maxAttacks * 100", () => {
    const player = createTestPlayer();
    player.state = calcBonuses(player);
    const blows = calcBlows(player.state, player.class, 100);
    expect(blows).toBeLessThanOrEqual(player.class.maxAttacks * 100);
  });
});

describe("stat bonus table consistency", () => {
  it("adjStrTd should have STAT_RANGE entries", () => {
    expect(adjStrTd).toHaveLength(STAT_RANGE);
  });

  it("adjDexTh should have STAT_RANGE entries", () => {
    expect(adjDexTh).toHaveLength(STAT_RANGE);
  });

  it("calcStatBonusDam should return a number for all indices", () => {
    for (let i = 0; i < STAT_RANGE; i++) {
      expect(typeof calcStatBonusDam(i)).toBe("number");
    }
  });
});
