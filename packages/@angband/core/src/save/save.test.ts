/**
 * Tests for save/save.ts — serializing game state to JSON-compatible structures.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  saveGame,
  saveGameToJSON,
  serializeBitFlag,
  SAVE_VERSION,
  SAVE_MAX_MESSAGES,
  type SaveData,
} from "./save.js";
import { createGameState, addMessage, MessageType } from "../game/state.js";
import type { GameState } from "../game/state.js";
import { BitFlag } from "../z/bitflag.js";
import { RNG } from "../z/rand.js";
import type { Player } from "../types/player.js";
import type { Chunk, Square, FeatureId, MonsterId, ObjectId } from "../types/cave.js";
import type { Monster, MonsterRace } from "../types/monster.js";
import type { ObjectType } from "../types/object.js";

// ── Test helpers ──

function mockBitFlag(numFlags: number, ...setFlags: number[]): BitFlag {
  const bf = new BitFlag(numFlags);
  for (const f of setFlags) {
    bf.on(f);
  }
  return bf;
}

function mockSquare(feat: number = 1): Square {
  return {
    feat: feat as FeatureId,
    info: mockBitFlag(8),
    light: 0,
    mon: 0 as MonsterId,
    obj: null,
    trap: null,
  };
}

function mockChunk(height: number = 3, width: number = 3, depth: number = 5): Chunk {
  const squares: Square[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Square[] = [];
    for (let x = 0; x < width; x++) {
      row.push(mockSquare(1));
    }
    squares.push(row);
  }

  return {
    name: "Test Level",
    turn: 0,
    depth,
    feeling: 0,
    objRating: 0,
    monRating: 0,
    goodItem: false,
    height,
    width,
    feelingSquares: 0,
    featCount: new Int32Array(32),
    squares,
    noise: { grids: Array.from({ length: height }, () => new Uint16Array(width)) },
    scent: { grids: Array.from({ length: height }, () => new Uint16Array(width)) },
    decoy: { x: 0, y: 0 },
    objects: [],
    objMax: 0,
    monMax: 0,
    monCnt: 0,
    monCurrent: 0,
    numRepro: 0,
    join: [],
  } as Chunk;
}

function mockPlayer(): Player {
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
      baseWeight: 150,
      modWeight: 20,
      infra: 0,
      body: 0,
      statAdj: [0, 0, 0, 0, 0],
      skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      flags: mockBitFlag(8),
      pflags: mockBitFlag(8),
      elInfo: [],
    },
    class: {
      name: "Warrior",
      cidx: 0,
      titles: ["Rookie", "Veteran"],
      statAdj: [3, -2, -2, 2, 2],
      skills: [25, 15, 18, 18, 14, 1, 70, 55, 55, 0],
      extraSkills: [10, 7, 7, 10, 0, 0, 45, 45, 45, 0],
      hitDice: 9,
      expFactor: 0,
      flags: mockBitFlag(8),
      pflags: mockBitFlag(8),
      maxAttacks: 6,
      minWeight: 30,
      attMultiply: 5,
      startItems: [],
      magic: { spellFirst: 0, spellWeight: 0, numBooks: 0, books: [], totalSpells: 0 },
    },
    grid: { x: 5, y: 10 },
    oldGrid: { x: 0, y: 0 },
    hitdie: 10,
    expfact: 100,
    age: 20,
    ht: 72,
    wt: 150,
    au: 500,
    maxDepth: 10,
    recallDepth: 5,
    depth: 5,
    maxLev: 12,
    lev: 12,
    maxExp: 2000,
    exp: 2000,
    expFrac: 0,
    mhp: 100,
    chp: 85,
    chpFrac: 0,
    msp: 20,
    csp: 15,
    cspFrac: 0,
    statMax: [18, 14, 12, 16, 17],
    statCur: [18, 14, 12, 16, 17],
    statMap: [0, 1, 2, 3, 4],
    timed: new Array(53).fill(0),
    wordRecall: 0,
    deepDescent: 0,
    energy: 100,
    totalEnergy: 5000,
    restingTurn: 0,
    food: 5000,
    unignoring: 0,
    spellFlags: [],
    spellOrder: [],
    fullName: "TestHero",
    diedFrom: "",
    history: "Born in a test file.",
    quests: [{ index: 0, name: "Kill Sauron", level: 99, curNum: 0, maxNum: 1 }],
    totalWinner: false,
    noscore: 0,
    isDead: false,
    wizard: false,
    playerHp: new Array(50).fill(10),
    auBirth: 200,
    statBirth: [15, 12, 10, 14, 13],
    htBirth: 72,
    wtBirth: 150,
    body: {
      name: "humanoid",
      count: 2,
      slots: [
        { type: 1, name: "weapon" },
        { type: 6, name: "body" },
      ],
    },
    shape: null,
    state: {
      statAdd: [],
      statInd: [],
      statUse: [],
      statTop: [],
      skills: [],
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
      curLight: 0,
      heavyWield: false,
      heavyShoot: false,
      blessWield: false,
      cumberArmor: false,
      flags: mockBitFlag(8),
      pflags: mockBitFlag(8),
      elInfo: [],
    },
    knownState: {
      statAdd: [],
      statInd: [],
      statUse: [],
      statTop: [],
      skills: [],
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
      curLight: 0,
      heavyWield: false,
      heavyShoot: false,
      blessWield: false,
      cumberArmor: false,
      flags: mockBitFlag(8),
      pflags: mockBitFlag(8),
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
  } as Player;
}

function mockMonster(): Monster {
  return {
    race: {
      ridx: 42,
      name: "Cave Orc",
      text: "An orc",
      plural: null,
      base: { name: "orc", text: "Orc", flags: mockBitFlag(8), dChar: 111 },
      avgHp: 20,
      ac: 12,
      sleep: 40,
      hearing: 20,
      smell: 20,
      speed: 110,
      light: 0,
      mexp: 15,
      freqInnate: 0,
      freqSpell: 0,
      spellPower: 0,
      flags: mockBitFlag(16),
      spellFlags: mockBitFlag(16),
      blows: [],
      level: 5,
      rarity: 1,
      dAttr: 2,
      dChar: 111,
      maxNum: 10,
      curNum: 1,
      spellMsgs: [],
      drops: [],
      friends: [],
      friendsBase: [],
      mimicKinds: [],
      shapes: [],
      numShapes: 0,
    } as MonsterRace,
    originalRace: null,
    midx: 1 as any,
    grid: { x: 3, y: 7 },
    hp: 18,
    maxhp: 20,
    mTimed: new Int16Array(10),
    mspeed: 110,
    energy: 50,
    cdis: 5,
    mflag: mockBitFlag(8),
    mimickedObjIdx: 0,
    heldObjIdx: 0,
    attr: 2,
    target: { grid: { x: 0, y: 0 }, midx: 0 as any },
    groupInfo: [
      { index: 0, role: 0 },
      { index: 0, role: 0 },
    ],
    minRange: 1,
    bestRange: 1,
  } as Monster;
}

function mockObject(): ObjectType {
  return {
    kind: { name: "Short Sword" } as any,
    ego: null,
    artifact: null,
    prev: null,
    next: null,
    known: null,
    oidx: 1 as any,
    grid: { x: 5, y: 10 },
    tval: 9 as any,
    sval: 3 as any,
    pval: 0,
    weight: 30,
    dd: 1,
    ds: 7,
    ac: 0,
    toA: 0,
    toH: 2,
    toD: 3,
    flags: mockBitFlag(8),
    modifiers: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    elInfo: [],
    brands: null,
    slays: null,
    curses: null,
    effect: null,
    effectMsg: null,
    activation: null,
    time: { base: 0, dice: 0, sides: 0, m_bonus: 0 },
    timeout: 0,
    number: 1,
    notice: 0,
    heldMIdx: 0,
    mimickingMIdx: 0,
    origin: 1 as any,
    originDepth: 5,
    originRace: null,
    note: 0 as any,
  } as ObjectType;
}

// ── Tests ──

describe("serializeBitFlag", () => {
  it("should convert BitFlag to a number array of raw bytes", () => {
    const bf = new BitFlag(16);
    bf.on(1);
    bf.on(3);
    bf.on(9);

    const result = serializeBitFlag(bf);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(bf.size);
    // Verify the raw bytes preserve the bit pattern
    const reconstructed = new BitFlag(new Uint8Array(result));
    expect(reconstructed.has(1)).toBe(true);
    expect(reconstructed.has(3)).toBe(true);
    expect(reconstructed.has(9)).toBe(true);
    expect(reconstructed.has(2)).toBe(false);
  });

  it("should handle an empty BitFlag", () => {
    const bf = new BitFlag(8);
    const result = serializeBitFlag(bf);
    expect(result.every((v) => v === 0)).toBe(true);
  });
});

describe("saveGame", () => {
  let state: GameState;
  let rng: RNG;

  beforeEach(() => {
    rng = new RNG();
    rng.stateInit(12345);
    state = createGameState(mockPlayer(), mockChunk(), rng);
    state.turn = 100;
    state.depth = 5;
  });

  it("should produce a SaveData with the correct version", () => {
    const save = saveGame(state);
    expect(save.version).toBe(SAVE_VERSION);
  });

  it("should preserve player name and stats", () => {
    const save = saveGame(state);
    expect(save.player.fullName).toBe("TestHero");
    expect(save.player.lev).toBe(12);
    expect(save.player.chp).toBe(85);
    expect(save.player.mhp).toBe(100);
    expect(save.player.au).toBe(500);
    expect(save.player.raceName).toBe("Human");
    expect(save.player.className).toBe("Warrior");
  });

  it("should preserve player position", () => {
    const save = saveGame(state);
    expect(save.player.grid).toEqual({ x: 5, y: 10 });
  });

  it("should preserve player stat arrays", () => {
    const save = saveGame(state);
    expect(save.player.statMax).toEqual([18, 14, 12, 16, 17]);
    expect(save.player.statCur).toEqual([18, 14, 12, 16, 17]);
    expect(save.player.statBirth).toEqual([15, 12, 10, 14, 13]);
  });

  it("should preserve player timed effects", () => {
    state.player.timed[0] = 10; // FAST
    state.player.timed[7] = 5; // POISONED
    const save = saveGame(state);
    expect(save.player.timed[0]).toBe(10);
    expect(save.player.timed[7]).toBe(5);
  });

  it("should preserve quest data", () => {
    const save = saveGame(state);
    expect(save.player.quests).toHaveLength(1);
    expect(save.player.quests[0]!.name).toBe("Kill Sauron");
    expect(save.player.quests[0]!.level).toBe(99);
  });

  it("should preserve player body layout", () => {
    const save = saveGame(state);
    expect(save.player.body.name).toBe("humanoid");
    expect(save.player.body.count).toBe(2);
    expect(save.player.body.slots).toHaveLength(2);
  });

  it("should preserve turn and depth", () => {
    const save = saveGame(state);
    expect(save.turn).toBe(100);
    expect(save.depth).toBe(5);
  });

  it("should preserve dungeon dimensions and metadata", () => {
    const save = saveGame(state);
    expect(save.dungeon.height).toBe(3);
    expect(save.dungeon.width).toBe(3);
    expect(save.dungeon.name).toBe("Test Level");
    expect(save.dungeon.depth).toBe(5);
  });

  it("should serialize terrain grid correctly", () => {
    const save = saveGame(state);
    expect(save.dungeon.squares).toHaveLength(3);
    expect(save.dungeon.squares[0]).toHaveLength(3);
    expect(save.dungeon.squares[0]![0]!.feat).toBe(1);
  });

  it("should preserve RNG state", () => {
    const save = saveGame(state);
    expect(save.rngState).toBeDefined();
    expect(save.rngState.STATE).toHaveLength(32);
    expect(typeof save.rngState.state_i).toBe("number");
  });

  it("should preserve game status flags", () => {
    state.running = true;
    state.resting = 50;
    state.dead = false;
    state.won = false;
    const save = saveGame(state);
    expect(save.running).toBe(true);
    expect(save.resting).toBe(50);
    expect(save.dead).toBe(false);
    expect(save.won).toBe(false);
  });

  it("should serialize monsters when provided", () => {
    const monsters = [mockMonster()];
    const save = saveGame(state, monsters);
    expect(save.dungeon.monsters).toHaveLength(1);
    expect(save.dungeon.monsters[0]!.raceName).toBe("Cave Orc");
    expect(save.dungeon.monsters[0]!.hp).toBe(18);
    expect(save.dungeon.monsters[0]!.grid).toEqual({ x: 3, y: 7 });
  });

  it("should serialize objects when provided", () => {
    const objects = [mockObject()];
    const save = saveGame(state, [], objects);
    expect(save.dungeon.objects).toHaveLength(1);
    expect(save.dungeon.objects[0]!.kindName).toBe("Short Sword");
    expect(save.dungeon.objects[0]!.toH).toBe(2);
    expect(save.dungeon.objects[0]!.toD).toBe(3);
  });

  it("should strip transient fields (no eventBus, upkeep, computed state)", () => {
    const save = saveGame(state);
    const json = JSON.stringify(save);
    expect(json).not.toContain("eventBus");
    expect(json).not.toContain("upkeep");
    expect(json).not.toContain('"state"'); // PlayerState is excluded
    expect(json).not.toContain("knownState");
  });

  it("should handle shape being null", () => {
    const save = saveGame(state);
    expect(save.player.shapeName).toBeNull();
  });
});

describe("saveGame — messages", () => {
  it("should preserve recent messages", () => {
    const rng = new RNG();
    rng.stateInit(12345);
    const state = createGameState(mockPlayer(), mockChunk(), rng);
    addMessage(state, "You hit the orc.", MessageType.COMBAT);
    addMessage(state, "The orc dies.", MessageType.MONSTER);

    const save = saveGame(state);
    expect(save.messages).toHaveLength(2);
    expect(save.messages[0]!.text).toBe("You hit the orc.");
    expect(save.messages[0]!.type).toBe(MessageType.COMBAT);
    expect(save.messages[1]!.text).toBe("The orc dies.");
  });

  it("should trim to SAVE_MAX_MESSAGES", () => {
    const rng = new RNG();
    rng.stateInit(12345);
    const state = createGameState(mockPlayer(), mockChunk(), rng);

    for (let i = 0; i < SAVE_MAX_MESSAGES + 50; i++) {
      addMessage(state, `msg${i}`);
    }

    const save = saveGame(state);
    expect(save.messages).toHaveLength(SAVE_MAX_MESSAGES);
    // Should keep the most recent messages
    expect(save.messages[SAVE_MAX_MESSAGES - 1]!.text).toBe(
      `msg${SAVE_MAX_MESSAGES + 49}`,
    );
  });
});

describe("saveGameToJSON", () => {
  it("should produce valid JSON string", () => {
    const rng = new RNG();
    rng.stateInit(12345);
    const state = createGameState(mockPlayer(), mockChunk(), rng);

    const json = saveGameToJSON(state);
    const parsed = JSON.parse(json);

    expect(parsed.version).toBe(SAVE_VERSION);
    expect(parsed.player.fullName).toBe("TestHero");
  });

  it("should produce formatted (indented) JSON", () => {
    const rng = new RNG();
    rng.stateInit(12345);
    const state = createGameState(mockPlayer(), mockChunk(), rng);

    const json = saveGameToJSON(state);
    // Indented JSON has newlines
    expect(json).toContain("\n");
    // And has 2-space indentation
    expect(json).toContain('  "version"');
  });

  it("should be parseable back to an equivalent SaveData", () => {
    const rng = new RNG();
    rng.stateInit(12345);
    const state = createGameState(mockPlayer(), mockChunk(), rng);
    addMessage(state, "Test round-trip");

    const json = saveGameToJSON(state);
    const parsed = JSON.parse(json) as SaveData;

    expect(parsed.version).toBe(SAVE_VERSION);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]!.text).toBe("Test round-trip");
  });
});
