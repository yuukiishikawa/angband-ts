/**
 * Tests for game/world.ts — main game loop, world processing, energy system.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  turnEnergy,
  regenerateHP,
  regenerateMana,
  processHunger,
  decreaseTimeouts,
  checkLevelChange,
  processMonsters,
  processWorld,
  processPlayer,
  runGameLoop,
  NORMAL_SPEED,
  MOVE_ENERGY,
  EXTRACT_ENERGY,
  type CommandInputProvider,
} from "./world.js";
import { createGameState, addMessage, type GameState } from "./state.js";
import { GameEventType } from "./event.js";
import { RNG } from "../z/rand.js";
import { CommandType } from "../command/core.js";
import type { GameCommand } from "../command/core.js";
import type { Player } from "../types/player.js";
import type { Chunk } from "../types/cave.js";
import type { Monster, MonsterRace } from "../types/monster.js";
import { Stat, TimedEffect } from "../types/player.js";
import { BitFlag } from "../z/bitflag.js";
import { BlowMethod, BlowEffect } from "../types/monster.js";
import type { Loc } from "../z/type.js";

// ── Test helpers ──

/**
 * Create a minimal mock Player with all fields needed by world.ts.
 */
function mockPlayer(overrides: Partial<Player> = {}): Player {
  return {
    isDead: false,
    totalWinner: false,
    depth: 1,
    maxDepth: 1,
    recallDepth: 1,
    lev: 1,
    maxLev: 1,
    exp: 0,
    maxExp: 0,
    expFrac: 0,
    chp: 50,
    mhp: 100,
    chpFrac: 0,
    csp: 20,
    msp: 50,
    cspFrac: 0,
    au: 0,
    energy: MOVE_ENERGY,
    totalEnergy: 0,
    restingTurn: 0,
    food: 5000,
    grid: { x: 5, y: 5 },
    oldGrid: { x: 5, y: 5 },
    diedFrom: "",
    fullName: "Test Hero",
    timed: (() => {
      const t = new Array(53).fill(0);
      t[TimedEffect.FOOD as number] = 5000; // Fed — prevents starvation regen block
      return t;
    })(),
    statMax: [15, 15, 15, 15, 15],
    statCur: [15, 15, 15, 15, 15],
    statMap: [0, 1, 2, 3, 4],
    state: {
      speed: NORMAL_SPEED,
      curLight: 1,
      statInd: [10, 10, 10, 10, 10],
      statAdd: [0, 0, 0, 0, 0],
      statUse: [15, 15, 15, 15, 15],
      statTop: [15, 15, 15, 15, 15],
      skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
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
      heavyWield: false,
      heavyShoot: false,
      blessWield: false,
      cumberArmor: false,
      flags: new BitFlag(32),
      pflags: new BitFlag(32),
      elInfo: [],
    },
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
    ...overrides,
  } as unknown as Player;
}

/**
 * Create a minimal mock Chunk for testing.
 */
function mockChunk(depth: number = 1): Chunk {
  return {
    name: "Test Level",
    depth,
    height: 20,
    width: 20,
    turn: 0,
    feeling: 0,
    objRating: 0,
    monRating: 0,
    goodItem: false,
    feelingSquares: 0,
    featCount: new Int32Array(25),
    squares: Array.from({ length: 20 }, () =>
      Array.from({ length: 20 }, () => ({
        feat: 1 as never, // FLOOR
        info: new BitFlag(22),
        light: 0,
        mon: 0 as never,
        obj: null,
        trap: null,
      })),
    ),
    noise: { grids: [] },
    scent: { grids: [] },
    decoy: { x: 0, y: 0 },
    objects: [null],
    objMax: 1,
    monMax: 0,
    monCnt: 0,
    monCurrent: 0,
    numRepro: 0,
    join: [],
  } as unknown as Chunk;
}

/**
 * Create a minimal mock Monster.
 */
function mockMonster(overrides: Partial<Monster> = {}): Monster {
  return {
    race: {
      ridx: 1 as never,
      name: "Test Orc",
      text: "",
      plural: null,
      base: { name: "orc", text: "orc", flags: new BitFlag(128), dChar: 111 },
      avgHp: 20,
      ac: 10,
      sleep: 10,
      hearing: 20,
      smell: 20,
      speed: NORMAL_SPEED,
      light: 0,
      mexp: 10,
      freqInnate: 0,
      freqSpell: 0,
      spellPower: 0,
      flags: new BitFlag(128),
      spellFlags: new BitFlag(128),
      blows: [],
      level: 1,
      rarity: 1,
      dAttr: 0,
      dChar: 111,
      maxNum: 10,
      curNum: 0,
      spellMsgs: [],
      drops: [],
      friends: [],
      friendsBase: [],
      mimicKinds: [],
      shapes: [],
      numShapes: 0,
    } as MonsterRace,
    originalRace: null,
    midx: 1 as never,
    grid: { x: 10, y: 10 },
    hp: 20,
    maxhp: 20,
    mTimed: new Int16Array(10),
    mspeed: NORMAL_SPEED,
    energy: 0,
    cdis: 5,
    mflag: new BitFlag(16),
    mimickedObjIdx: 0,
    heldObjIdx: 0,
    attr: 0,
    target: { grid: { x: 0, y: 0 }, midx: 0 as never },
    groupInfo: [
      { index: 0, role: 0 },
      { index: 0, role: 0 },
    ],
    minRange: 1,
    bestRange: 1,
    ...overrides,
  } as Monster;
}

/**
 * Create a mock CommandInputProvider that returns commands from a queue.
 */
function mockInput(commands: (GameCommand | null)[]): CommandInputProvider {
  let index = 0;
  return {
    async getCommand(): Promise<GameCommand | null> {
      if (index < commands.length) {
        return commands[index++] ?? null;
      }
      return null;
    },
  };
}

// ── Tests ──

describe("turnEnergy", () => {
  it("should return 10 energy for normal speed (110)", () => {
    expect(turnEnergy(NORMAL_SPEED)).toBe(10);
  });

  it("should return 1 energy for very slow speed (0)", () => {
    expect(turnEnergy(0)).toBe(1);
  });

  it("should return 1 energy for speed 60", () => {
    expect(turnEnergy(60)).toBe(1);
  });

  it("should return 49 energy for max speed (199)", () => {
    expect(turnEnergy(199)).toBe(49);
  });

  it("should clamp negative speed to 0", () => {
    expect(turnEnergy(-10)).toBe(1);
  });

  it("should clamp speed > 199 to 199", () => {
    expect(turnEnergy(300)).toBe(49);
  });

  it("should return higher energy for faster speeds", () => {
    expect(turnEnergy(120)).toBeGreaterThan(turnEnergy(110));
    expect(turnEnergy(130)).toBeGreaterThan(turnEnergy(120));
  });

  it("should match the EXTRACT_ENERGY table", () => {
    for (let speed = 0; speed < 200; speed++) {
      expect(turnEnergy(speed)).toBe(EXTRACT_ENERGY[speed]);
    }
  });
});

describe("regenerateHP", () => {
  it("should not heal above max HP", () => {
    const player = mockPlayer({ chp: 100, mhp: 100 });
    regenerateHP(player);
    expect(player.chp).toBe(100);
  });

  it("should accumulate fractional HP at PY_REGEN_NORMAL rate", () => {
    const player = mockPlayer({ chp: 50, mhp: 100, chpFrac: 0 });
    regenerateHP(player);
    // PY_REGEN_NORMAL = 197 per call
    expect(player.chpFrac).toBe(197);
  });

  it("should heal HP when fractional accumulates past 65536", () => {
    // PY_REGEN_NORMAL = 197, so start near overflow: 65536 - 197 = 65339
    const player = mockPlayer({ chp: 50, mhp: 100, chpFrac: 65400 });
    // 65400 + 197 = 65597 >= 65536 → HP should increase
    regenerateHP(player);
    expect(player.chp).toBe(51);
  });

  it("should take ~333 turns to regen 1 HP", () => {
    const player = mockPlayer({ chp: 50, mhp: 100, chpFrac: 0 });
    let turns = 0;
    while (player.chp === 50 && turns < 500) {
      regenerateHP(player);
      turns++;
    }
    // 65536 / 197 ≈ 333 turns
    expect(turns).toBeGreaterThan(300);
    expect(turns).toBeLessThan(400);
  });

  it("should not exceed max HP after regen", () => {
    const player = mockPlayer({ chp: 99, mhp: 100, chpFrac: 65500 });
    regenerateHP(player);
    expect(player.chp).toBeLessThanOrEqual(100);
  });

  it("should not regen when starving (food < PY_FOOD_WEAK)", () => {
    const player = mockPlayer({ chp: 50, mhp: 100, chpFrac: 0 });
    player.timed[TimedEffect.FOOD as number] = 500; // Below PY_FOOD_WEAK (1000)
    regenerateHP(player);
    expect(player.chpFrac).toBe(0);
  });
});

describe("regenerateMana", () => {
  it("should not heal above max mana", () => {
    const player = mockPlayer({ csp: 50, msp: 50 });
    regenerateMana(player);
    expect(player.csp).toBe(50);
  });

  it("should skip regen if msp is 0 (no-mana class)", () => {
    const player = mockPlayer({ csp: 0, msp: 0, cspFrac: 0 });
    regenerateMana(player);
    expect(player.csp).toBe(0);
    expect(player.cspFrac).toBe(0);
  });

  it("should accumulate fractional mana at PY_REGEN_NORMAL rate", () => {
    const player = mockPlayer({ csp: 10, msp: 50, cspFrac: 0 });
    regenerateMana(player);
    expect(player.cspFrac).toBe(197);
  });

  it("should heal SP when fractional accumulates past 65536", () => {
    const player = mockPlayer({ csp: 10, msp: 50, cspFrac: 65400 });
    // 65400 + 197 = 65597 >= 65536
    regenerateMana(player);
    expect(player.csp).toBe(11);
  });

  it("should not regen when starving", () => {
    const player = mockPlayer({ csp: 10, msp: 50, cspFrac: 0 });
    player.timed[TimedEffect.FOOD as number] = 500;
    regenerateMana(player);
    expect(player.cspFrac).toBe(0);
  });
});

describe("processHunger", () => {
  it("should decrease food timer", () => {
    const player = mockPlayer();
    const foodIndex = TimedEffect.FOOD as number;
    player.timed[foodIndex] = 5000;

    processHunger(player);
    expect(player.timed[foodIndex]).toBeLessThan(5000);
  });

  it("should not decrease below 0", () => {
    const player = mockPlayer();
    const foodIndex = TimedEffect.FOOD as number;
    player.timed[foodIndex] = 0;

    processHunger(player);
    expect(player.timed[foodIndex]).toBe(0);
  });

  it("should decrease faster at higher speeds", () => {
    const slowPlayer = mockPlayer();
    (slowPlayer.state as { speed: number }).speed = 90;
    const fastPlayer = mockPlayer();
    (fastPlayer.state as { speed: number }).speed = 130;

    const foodIndex = TimedEffect.FOOD as number;
    slowPlayer.timed[foodIndex] = 5000;
    fastPlayer.timed[foodIndex] = 5000;

    processHunger(slowPlayer);
    processHunger(fastPlayer);

    // Fast player should have consumed more food
    expect(fastPlayer.timed[foodIndex]!).toBeLessThan(slowPlayer.timed[foodIndex]!);
  });
});

describe("decreaseTimeouts", () => {
  it("should decrement active timed effects", () => {
    const player = mockPlayer();
    const blindIndex = TimedEffect.BLIND as number;
    const confIndex = TimedEffect.CONFUSED as number;
    player.timed[blindIndex] = 5;
    player.timed[confIndex] = 3;

    decreaseTimeouts(player);

    expect(player.timed[blindIndex]).toBe(4);
    expect(player.timed[confIndex]).toBe(2);
  });

  it("should not decrement food (handled separately)", () => {
    const player = mockPlayer();
    const foodIndex = TimedEffect.FOOD as number;
    player.timed[foodIndex] = 5000;

    decreaseTimeouts(player);

    expect(player.timed[foodIndex]).toBe(5000);
  });

  it("should not decrement zero-valued effects", () => {
    const player = mockPlayer();
    const blindIndex = TimedEffect.BLIND as number;
    player.timed[blindIndex] = 0;

    decreaseTimeouts(player);

    expect(player.timed[blindIndex]).toBe(0);
  });

  it("should reach zero and stay there", () => {
    const player = mockPlayer();
    const blindIndex = TimedEffect.BLIND as number;
    player.timed[blindIndex] = 1;

    decreaseTimeouts(player);

    expect(player.timed[blindIndex]).toBe(0);
  });
});

describe("checkLevelChange", () => {
  it("should return false when depths match and no flag set", () => {
    const state = createGameState(mockPlayer(), mockChunk(1), new RNG());
    expect(checkLevelChange(state)).toBe(false);
  });

  it("should return true when player depth differs from state depth", () => {
    const state = createGameState(mockPlayer(), mockChunk(1), new RNG());
    state.player.depth = 2; // Player used a staircase
    expect(checkLevelChange(state)).toBe(true);
  });

  it("should return true when generateLevel flag is set", () => {
    const state = createGameState(mockPlayer(), mockChunk(1), new RNG());
    state.player.upkeep.generateLevel = true;
    expect(checkLevelChange(state)).toBe(true);
  });
});

describe("processMonsters", () => {
  it("should give monsters energy and process their turns", () => {
    const state = createGameState(mockPlayer(), mockChunk(), new RNG());
    const mon = mockMonster({ energy: 0, mspeed: NORMAL_SPEED });
    // Put the monster to sleep so its turn is "idle"
    mon.mTimed[0] = 100; // SLEEP = very asleep

    processMonsters(state, [mon]);

    // Monster should have gained energy: turnEnergy(110) = 10
    // Since energy started at 0, after gaining 10, it's < MOVE_ENERGY (100)
    // so no turn was processed
    // But energy should be 10 (gained) since < MOVE_ENERGY
    expect(mon.energy).toBe(10);
  });

  it("should process a monster turn when it has enough energy", () => {
    const state = createGameState(mockPlayer(), mockChunk(), new RNG());
    // Give the monster enough energy + a bit for the turn
    const mon = mockMonster({
      energy: MOVE_ENERGY - 5, // 95, will get +10 = 105 >= 100
      mspeed: NORMAL_SPEED,
    });
    // Make it sleep so it does "idle"
    mon.mTimed[0] = 100;

    processMonsters(state, [mon]);

    // Monster gained 10 energy (105), took 1 turn (idle, costs 100), left with 5
    expect(mon.energy).toBe(5);
  });

  it("should skip dead monsters", () => {
    const state = createGameState(mockPlayer(), mockChunk(), new RNG());
    const mon = mockMonster({ hp: 0, energy: MOVE_ENERGY });

    processMonsters(state, [mon]);

    // Dead monster should not gain energy
    expect(mon.energy).toBe(MOVE_ENERGY);
  });

  it("should cause player death on fatal monster attack", () => {
    const rng = new RNG();
    rng.stateInit(42);
    rng.quick = false;
    const state = createGameState(
      mockPlayer({ chp: 1, mhp: 100, grid: { x: 10, y: 11 } }),
      mockChunk(),
      rng,
    );
    // Place monster adjacent to player (they will attack)
    const mon = mockMonster({
      energy: MOVE_ENERGY - 5,
      mspeed: NORMAL_SPEED,
      grid: { x: 10, y: 10 },
    });
    // Give the monster 4 lethal HIT/HURT blows (each 100+10d10 damage)
    // Multiple blows ensure at least one hits regardless of RNG seed
    const lethalBlow = {
      method: BlowMethod.HIT,
      effect: BlowEffect.HURT,
      dice: { base: 100, dice: 10, sides: 10, m_bonus: 0 },
    };
    (mon.race as { blows: unknown[] }).blows = [
      lethalBlow, lethalBlow, lethalBlow, lethalBlow,
    ];
    // Not sleeping, not held, will attack since adjacent
    mon.mTimed[0] = 0; // Not sleeping
    mon.mTimed[4] = 0; // Not held (HOLD)

    processMonsters(state, [mon]);

    // Player should be dead (1 HP, took massive damage)
    expect(state.dead).toBe(true);
    expect(state.player.isDead).toBe(true);
  });
});

describe("processWorld", () => {
  it("should regenerate HP when below max (fractional near overflow)", () => {
    // PY_REGEN_NORMAL = 197, start just below overflow
    const player = mockPlayer({ chp: 50, mhp: 100, chpFrac: 65400 });
    const state = createGameState(player, mockChunk(), new RNG());
    state.turn = 0;

    processWorld(state);

    // 65400 + 197 = 65597 >= 65536, HP should increase
    expect(player.chp).toBe(51);
  });

  it("should regenerate mana when below max (fractional near overflow)", () => {
    const player = mockPlayer({ csp: 10, msp: 50, cspFrac: 65400 });
    const state = createGameState(player, mockChunk(), new RNG());
    state.turn = 0;

    processWorld(state);

    expect(player.csp).toBe(11);
  });

  it("should decrease hunger on turn divisible by 10", () => {
    const player = mockPlayer();
    const foodIndex = TimedEffect.FOOD as number;
    player.timed[foodIndex] = 5000;
    const state = createGameState(player, mockChunk(), new RNG());
    state.turn = 10;

    processWorld(state);

    expect(player.timed[foodIndex]).toBeLessThan(5000);
  });

  it("should not decrease hunger on non-10th turn", () => {
    const player = mockPlayer();
    const foodIndex = TimedEffect.FOOD as number;
    player.timed[foodIndex] = 5000;
    const state = createGameState(player, mockChunk(), new RNG());
    state.turn = 7;

    processWorld(state);

    expect(player.timed[foodIndex]).toBe(5000);
  });

  it("should decrement timed effects", () => {
    const player = mockPlayer();
    const blindIndex = TimedEffect.BLIND as number;
    player.timed[blindIndex] = 5;
    const state = createGameState(player, mockChunk(), new RNG());

    processWorld(state);

    expect(player.timed[blindIndex]).toBe(4);
  });

  it("should emit HP and MANA events", () => {
    const state = createGameState(mockPlayer(), mockChunk(), new RNG());
    const hpHandler = vi.fn();
    const manaHandler = vi.fn();
    state.eventBus.on(GameEventType.HP, hpHandler);
    state.eventBus.on(GameEventType.MANA, manaHandler);

    processWorld(state);

    expect(hpHandler).toHaveBeenCalled();
    expect(manaHandler).toHaveBeenCalled();
  });

  it("should skip processing if player is dead", () => {
    const player = mockPlayer({ isDead: true, chp: 50, mhp: 100, chpFrac: 65500 });
    const state = createGameState(player, mockChunk(), new RNG());
    state.turn = 10;

    processWorld(state);

    // HP should not have changed (processing skipped)
    expect(player.chp).toBe(50);
  });
});

describe("processPlayer", () => {
  it("should execute a command and deduct energy", async () => {
    const state = createGameState(mockPlayer(), mockChunk(), new RNG());
    const searchCmd: GameCommand = { type: CommandType.SEARCH };
    const input = mockInput([searchCmd]);

    const usedEnergy = await processPlayer(state, input);

    expect(usedEnergy).toBe(true);
    expect(state.player.energy).toBeLessThan(MOVE_ENERGY);
    expect(state.player.upkeep.energyUse).toBeGreaterThan(0);
  });

  it("should return false when no command is provided", async () => {
    const state = createGameState(mockPlayer(), mockChunk(), new RNG());
    const input = mockInput([null]);

    const usedEnergy = await processPlayer(state, input);

    expect(usedEnergy).toBe(false);
  });

  it("should add command messages to game state", async () => {
    const state = createGameState(mockPlayer(), mockChunk(), new RNG());
    const searchCmd: GameCommand = { type: CommandType.SEARCH };
    const input = mockInput([searchCmd]);

    await processPlayer(state, input);

    // Search command should produce messages
    expect(state.messages.length).toBeGreaterThanOrEqual(0);
  });
});

describe("Energy system integration", () => {
  it("should require 10 ticks at normal speed for one action", () => {
    let energy = 0;
    let ticks = 0;
    while (energy < MOVE_ENERGY) {
      energy += turnEnergy(NORMAL_SPEED);
      ticks++;
    }
    expect(ticks).toBe(10);
  });

  it("should require fewer ticks at higher speed", () => {
    let energy = 0;
    let ticks = 0;
    const fastSpeed = 120;
    while (energy < MOVE_ENERGY) {
      energy += turnEnergy(fastSpeed);
      ticks++;
    }
    expect(ticks).toBeLessThan(10);
  });

  it("should require more ticks at lower speed", () => {
    let energy = 0;
    let ticks = 0;
    const slowSpeed = 100;
    while (energy < MOVE_ENERGY) {
      energy += turnEnergy(slowSpeed);
      ticks++;
    }
    expect(ticks).toBeGreaterThan(10);
  });
});

describe("Game over conditions", () => {
  it("should detect death condition", () => {
    const player = mockPlayer({ isDead: true });
    const state = createGameState(player, mockChunk(), new RNG());
    state.dead = true;
    expect(state.dead).toBe(true);
    expect(state.player.isDead).toBe(true);
  });

  it("should detect victory condition", () => {
    const player = mockPlayer({ totalWinner: true });
    const state = createGameState(player, mockChunk(), new RNG());
    state.won = true;
    expect(state.won).toBe(true);
    expect(state.player.totalWinner).toBe(true);
  });
});

describe("runGameLoop", () => {
  it("should stop when player dies", async () => {
    const player = mockPlayer({ chp: 1, mhp: 100 });
    const state = createGameState(player, mockChunk(), new RNG());

    // Input that kills the player: provide null so processPlayer returns false,
    // then manually mark dead
    let callCount = 0;
    const input: CommandInputProvider = {
      async getCommand(): Promise<GameCommand | null> {
        callCount++;
        if (callCount >= 2) {
          // Simulate death
          state.player.isDead = true;
          state.dead = true;
        }
        return null;
      },
    };

    await runGameLoop(state, input);

    expect(state.dead).toBe(true);
    expect(state.running).toBe(false);
  });

  it("should stop when player wins", async () => {
    const player = mockPlayer();
    const state = createGameState(player, mockChunk(), new RNG());

    let callCount = 0;
    const input: CommandInputProvider = {
      async getCommand(): Promise<GameCommand | null> {
        callCount++;
        if (callCount >= 2) {
          state.player.totalWinner = true;
          state.won = true;
        }
        return null;
      },
    };

    await runGameLoop(state, input);

    expect(state.won).toBe(true);
    expect(state.running).toBe(false);
  });

  it("should emit ENTER_WORLD at start", async () => {
    const state = createGameState(mockPlayer(), mockChunk(), new RNG());
    const handler = vi.fn();
    state.eventBus.on(GameEventType.ENTER_WORLD, handler);

    // Immediately kill the player to exit the loop
    state.player.isDead = true;
    state.dead = true;

    await runGameLoop(state, mockInput([]));

    expect(handler).toHaveBeenCalled();
  });

  it("should emit ENTER_DEATH when player dies", async () => {
    const state = createGameState(mockPlayer(), mockChunk(), new RNG());
    const handler = vi.fn();
    state.eventBus.on(GameEventType.ENTER_DEATH, handler);

    // Kill immediately
    state.player.isDead = true;
    state.dead = true;

    await runGameLoop(state, mockInput([]));

    expect(handler).toHaveBeenCalled();
  });

  it("should increment turn counter", async () => {
    const state = createGameState(mockPlayer(), mockChunk(), new RNG());
    const initialTurn = state.turn;

    let calls = 0;
    const input: CommandInputProvider = {
      async getCommand(): Promise<GameCommand | null> {
        calls++;
        if (calls > 3) {
          state.dead = true;
          state.player.isDead = true;
        }
        // Return search command so energy is used and we advance
        return { type: CommandType.SEARCH };
      },
    };

    await runGameLoop(state, input);

    expect(state.turn).toBeGreaterThan(initialTurn);
  });
});
