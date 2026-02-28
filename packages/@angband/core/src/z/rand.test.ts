/**
 * Tests for z/rand.ts — WELL1024a RNG and utility functions.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  RNG,
  Aspect,
  randomValue,
  damcalc,
  mBonusCalc,
  randcalc,
  randcalcValid,
  randcalcVaries,
  randomChanceCheck,
  randomChanceScaled,
  MAX_RAND_DEPTH,
} from "./rand.js";

describe("RNG", () => {
  let rng: RNG;

  beforeEach(() => {
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);
  });

  describe("stateInit", () => {
    it("should produce deterministic output from same seed", () => {
      const a = rng.div(1000);

      const rng2 = new RNG();
      rng2.quick = false;
      rng2.stateInit(42);
      const b = rng2.div(1000);

      expect(a).toBe(b);
    });

    it("should produce different output from different seeds", () => {
      const vals1: number[] = [];
      for (let i = 0; i < 10; i++) vals1.push(rng.div(1000));

      const rng2 = new RNG();
      rng2.quick = false;
      rng2.stateInit(123);
      const vals2: number[] = [];
      for (let i = 0; i < 10; i++) vals2.push(rng2.div(1000));

      expect(vals1).not.toEqual(vals2);
    });
  });

  describe("div", () => {
    it("should return 0 for m <= 1", () => {
      expect(rng.div(0)).toBe(0);
      expect(rng.div(1)).toBe(0);
    });

    it("should return values in range [0, m)", () => {
      for (let i = 0; i < 1000; i++) {
        const v = rng.div(100);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(100);
      }
    });

    it("should produce a roughly uniform distribution", () => {
      const counts = new Array(10).fill(0) as number[];
      for (let i = 0; i < 10000; i++) {
        counts[rng.div(10)]!++;
      }
      // Each bucket should have ~1000 +/- 200
      for (const c of counts) {
        expect(c).toBeGreaterThan(700);
        expect(c).toBeLessThan(1300);
      }
    });
  });

  describe("quick mode (LCRNG)", () => {
    it("should produce deterministic output", () => {
      rng.quick = true;
      rng.quickValue = 12345;
      const vals: number[] = [];
      for (let i = 0; i < 10; i++) vals.push(rng.div(100));

      rng.quick = true;
      rng.quickValue = 12345;
      const vals2: number[] = [];
      for (let i = 0; i < 10; i++) vals2.push(rng.div(100));

      expect(vals).toEqual(vals2);
    });
  });

  describe("randint0 / randint1", () => {
    it("randint0(10) → 0..9", () => {
      for (let i = 0; i < 100; i++) {
        const v = rng.randint0(10);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(10);
      }
    });

    it("randint1(6) → 1..6", () => {
      for (let i = 0; i < 100; i++) {
        const v = rng.randint1(6);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(6);
      }
    });
  });

  describe("oneIn", () => {
    it("oneIn(1) should always be true", () => {
      for (let i = 0; i < 10; i++) {
        expect(rng.oneIn(1)).toBe(true);
      }
    });

    it("oneIn(2) should be roughly 50%", () => {
      let trueCount = 0;
      for (let i = 0; i < 10000; i++) {
        if (rng.oneIn(2)) trueCount++;
      }
      expect(trueCount).toBeGreaterThan(4500);
      expect(trueCount).toBeLessThan(5500);
    });
  });

  describe("range", () => {
    it("should return values in [A, B]", () => {
      for (let i = 0; i < 100; i++) {
        const v = rng.range(5, 15);
        expect(v).toBeGreaterThanOrEqual(5);
        expect(v).toBeLessThanOrEqual(15);
      }
    });

    it("range(X, X) should return X", () => {
      expect(rng.range(7, 7)).toBe(7);
    });
  });

  describe("spread", () => {
    it("should return values in [A-D, A+D]", () => {
      for (let i = 0; i < 100; i++) {
        const v = rng.spread(50, 10);
        expect(v).toBeGreaterThanOrEqual(40);
        expect(v).toBeLessThanOrEqual(60);
      }
    });
  });

  describe("normal", () => {
    it("should return mean when stand is 0", () => {
      expect(rng.normal(100, 0)).toBe(100);
    });

    it("should cluster around mean", () => {
      let sum = 0;
      const n = 10000;
      for (let i = 0; i < n; i++) sum += rng.normal(100, 10);
      const avg = sum / n;
      expect(avg).toBeGreaterThan(95);
      expect(avg).toBeLessThan(105);
    });
  });

  describe("damroll", () => {
    it("damroll(2, 6) → 2..12", () => {
      for (let i = 0; i < 100; i++) {
        const v = rng.damroll(2, 6);
        expect(v).toBeGreaterThanOrEqual(2);
        expect(v).toBeLessThanOrEqual(12);
      }
    });

    it("damroll(N, 0) → 0", () => {
      expect(rng.damroll(5, 0)).toBe(0);
    });
  });

  describe("fix / unfix", () => {
    it("fix(50) should return middle value", () => {
      rng.fix(50);
      // 50% of (m-1) = 50% of 99 ≈ 49
      expect(rng.div(100)).toBe(49);
      rng.unfix();
    });

    it("fix(0) should return 0", () => {
      rng.fix(0);
      expect(rng.div(100)).toBe(0);
      rng.unfix();
    });

    it("fix(100) should return m-1", () => {
      rng.fix(100);
      expect(rng.div(100)).toBe(99);
      rng.unfix();
    });
  });

  describe("state save/restore", () => {
    it("should reproduce output after restore", () => {
      const state = rng.getState();
      const vals1: number[] = [];
      for (let i = 0; i < 20; i++) vals1.push(rng.div(1000));

      rng.setState(state);
      const vals2: number[] = [];
      for (let i = 0; i < 20; i++) vals2.push(rng.div(1000));

      expect(vals1).toEqual(vals2);
    });
  });
});

describe("damcalc", () => {
  let rng: RNG;
  beforeEach(() => {
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(0);
  });

  it("MAXIMISE: num * sides", () => {
    expect(damcalc(rng, 3, 6, Aspect.MAXIMISE)).toBe(18);
  });

  it("MINIMISE: num", () => {
    expect(damcalc(rng, 3, 6, Aspect.MINIMISE)).toBe(3);
  });

  it("AVERAGE: num * (sides+1) / 2", () => {
    expect(damcalc(rng, 2, 6, Aspect.AVERAGE)).toBe(7);
  });
});

describe("mBonusCalc", () => {
  let rng: RNG;
  beforeEach(() => {
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(0);
  });

  it("MAXIMISE returns max", () => {
    expect(mBonusCalc(rng, 10, 50, Aspect.MAXIMISE)).toBe(10);
  });

  it("MINIMISE returns 0", () => {
    expect(mBonusCalc(rng, 10, 50, Aspect.MINIMISE)).toBe(0);
  });

  it("AVERAGE returns proportional to level", () => {
    expect(mBonusCalc(rng, 128, 64, Aspect.AVERAGE)).toBe(64);
  });
});

describe("randcalc", () => {
  let rng: RNG;
  beforeEach(() => {
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(0);
  });

  it("MINIMISE: base + dice + 0", () => {
    const v = randomValue(5, 2, 6, 10);
    expect(randcalc(rng, v, 0, Aspect.MINIMISE)).toBe(5 + 2 + 0);
  });

  it("MAXIMISE: base + dice*sides + max", () => {
    const v = randomValue(5, 2, 6, 10);
    expect(randcalc(rng, v, 0, Aspect.MAXIMISE)).toBe(5 + 12 + 10);
  });
});

describe("randcalcValid", () => {
  let rng: RNG;
  beforeEach(() => {
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(0);
  });

  it("should validate values within range", () => {
    const v = randomValue(5, 2, 6, 0);
    // min=5+2=7, max=5+12=17
    expect(randcalcValid(rng, v, 10)).toBe(true);
    expect(randcalcValid(rng, v, 6)).toBe(false);
    expect(randcalcValid(rng, v, 18)).toBe(false);
  });
});

describe("randcalcVaries", () => {
  let rng: RNG;
  beforeEach(() => {
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(0);
  });

  it("should detect varying values", () => {
    expect(randcalcVaries(rng, randomValue(5, 2, 6, 0))).toBe(true);
    expect(randcalcVaries(rng, randomValue(5, 0, 0, 0))).toBe(false);
  });
});

describe("randomChance", () => {
  let rng: RNG;
  beforeEach(() => {
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(0);
  });

  it("randomChanceScaled should scale correctly", () => {
    expect(randomChanceScaled({ numerator: 1, denominator: 2 }, 100)).toBe(50);
    expect(randomChanceScaled({ numerator: 7, denominator: 13 }, 1000)).toBe(538);
  });

  it("randomChanceCheck with 100% should always pass", () => {
    const c = { numerator: 10, denominator: 10 };
    for (let i = 0; i < 100; i++) {
      expect(randomChanceCheck(rng, c)).toBe(true);
    }
  });
});
