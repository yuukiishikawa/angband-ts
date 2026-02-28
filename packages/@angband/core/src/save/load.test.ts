/**
 * Tests for save/load.ts — deserializing save data back into game state.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadGame,
  loadGameFromJSON,
  loadPlayer,
  loadChunk,
  loadRngState,
  validateSaveData,
  deserializeBitFlag,
  SaveLoadError,
} from "./load.js";
import {
  saveGame,
  saveGameToJSON,
  serializeBitFlag,
  SAVE_VERSION,
  type SaveData,
} from "./save.js";
import {
  createGameState,
  addMessage,
  MessageType,
} from "../game/state.js";
import type { GameState } from "../game/state.js";
import { BitFlag } from "../z/bitflag.js";
import { RNG } from "../z/rand.js";
import type { Player } from "../types/player.js";
import type {
  Chunk,
  Square,
  FeatureId,
  MonsterId,
  ObjectId,
} from "../types/cave.js";
import type { Monster, MonsterRace } from "../types/monster.js";
import type { ObjectType } from "../types/object.js";

// ── Test helpers (same as save.test.ts) ──

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
    info: mockBitFlag(8, 1, 2), // MARK and GLOW set
    light: 3,
    mon: 0 as MonsterId,
    obj: null,
    trap: null,
  };
}

function mockChunk(
  height: number = 3,
  width: number = 3,
  depth: number = 5,
): Chunk {
  const squares: Square[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Square[] = [];
    for (let x = 0; x < width; x++) {
      row.push(mockSquare(y * width + x));
    }
    squares.push(row);
  }

  return {
    name: "Test Level",
    turn: 42,
    depth,
    feeling: 3,
    objRating: 100,
    monRating: 200,
    goodItem: true,
    height,
    width,
    feelingSquares: 5,
    featCount: new Int32Array(32),
    squares,
    noise: {
      grids: Array.from({ length: height }, () => new Uint16Array(width)),
    },
    scent: {
      grids: Array.from({ length: height }, () => new Uint16Array(width)),
    },
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
      name: "Elf",
      ridx: 2,
      hitDice: 8,
      expFactor: 120,
      baseAge: 75,
      modAge: 75,
      baseHeight: 60,
      modHeight: 4,
      baseWeight: 100,
      modWeight: 6,
      infra: 3,
      body: 0,
      statAdj: [-1, 2, 0, 1, -1],
      skills: [5, 5, 6, 6, 8, 3, 15, 25, 25, 0],
      flags: mockBitFlag(8),
      pflags: mockBitFlag(8),
      elInfo: [],
    },
    class: {
      name: "Mage",
      cidx: 1,
      titles: ["Apprentice", "Wizard"],
      statAdj: [-5, 3, 0, 1, -2],
      skills: [15, 20, 36, 30, 12, 2, 34, 20, 20, 0],
      extraSkills: [7, 13, 13, 9, 0, 0, 16, 15, 15, 0],
      hitDice: 0,
      expFactor: 30,
      flags: mockBitFlag(8),
      pflags: mockBitFlag(8, 6), // CHOOSE_SPELLS
      maxAttacks: 4,
      minWeight: 40,
      attMultiply: 2,
      startItems: [],
      magic: {
        spellFirst: 1,
        spellWeight: 300,
        numBooks: 0,
        books: [],
        totalSpells: 0,
      },
    },
    grid: { x: 15, y: 20 },
    oldGrid: { x: 1, y: 1 },
    hitdie: 8,
    expfact: 150,
    age: 100,
    ht: 60,
    wt: 100,
    au: 1200,
    maxDepth: 25,
    recallDepth: 20,
    depth: 20,
    maxLev: 22,
    lev: 22,
    maxExp: 50000,
    exp: 48000,
    expFrac: 123,
    mhp: 150,
    chp: 120,
    chpFrac: 456,
    msp: 80,
    csp: 60,
    cspFrac: 789,
    statMax: [12, 18, 14, 16, 10],
    statCur: [12, 18, 14, 16, 10],
    statMap: [0, 1, 2, 3, 4],
    timed: new Array(53).fill(0),
    wordRecall: 5,
    deepDescent: 3,
    energy: 90,
    totalEnergy: 20000,
    restingTurn: 10,
    food: 8000,
    unignoring: 1,
    spellFlags: [1, 2, 0, 4],
    spellOrder: [0, 3, 1, 2],
    fullName: "Gandalf",
    diedFrom: "",
    history: "A mighty wizard.",
    quests: [
      { index: 0, name: "Slay Morgoth", level: 100, curNum: 0, maxNum: 1 },
      { index: 1, name: "Slay Sauron", level: 99, curNum: 1, maxNum: 1 },
    ],
    totalWinner: false,
    noscore: 0,
    isDead: false,
    wizard: false,
    playerHp: new Array(50).fill(8),
    auBirth: 300,
    statBirth: [10, 16, 12, 14, 8],
    htBirth: 60,
    wtBirth: 100,
    body: {
      name: "humanoid",
      count: 3,
      slots: [
        { type: 1, name: "weapon" },
        { type: 6, name: "body" },
        { type: 5, name: "light" },
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
    kind: { name: "Long Sword" } as any,
    ego: { name: "of Flame" } as any,
    artifact: null,
    prev: null,
    next: null,
    known: null,
    oidx: 1 as any,
    grid: { x: 10, y: 15 },
    tval: 9 as any,
    sval: 5 as any,
    pval: 0,
    weight: 130,
    dd: 2,
    ds: 5,
    ac: 0,
    toA: 0,
    toH: 4,
    toD: 6,
    flags: mockBitFlag(8, 1, 3),
    modifiers: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    elInfo: [{ resLevel: 1, flags: mockBitFlag(4) }],
    brands: [false, true, false],
    slays: null,
    curses: null,
    effect: null,
    effectMsg: null,
    activation: null,
    time: { base: 0, dice: 0, sides: 0, m_bonus: 0 },
    timeout: 0,
    number: 1,
    notice: 2,
    heldMIdx: 0,
    mimickingMIdx: 0,
    origin: 10 as any,
    originDepth: 15,
    originRace: null,
    note: 0 as any,
  } as ObjectType;
}

/**
 * Build a complete GameState, save it, and return both.
 */
function buildAndSave(opts?: {
  monsters?: Monster[];
  objects?: ObjectType[];
}): { state: GameState; save: SaveData; rng: RNG } {
  const rng = new RNG();
  rng.stateInit(54321);
  const state = createGameState(mockPlayer(), mockChunk(), rng);
  state.turn = 500;
  state.depth = 20;
  addMessage(state, "You enter the dungeon.", MessageType.GENERIC);
  addMessage(state, "The orc attacks!", MessageType.COMBAT);

  const save = saveGame(state, opts?.monsters ?? [], opts?.objects ?? []);
  return { state, save, rng };
}

// ── Tests ──

describe("deserializeBitFlag", () => {
  it("should reconstruct a BitFlag from a number array", () => {
    const original = mockBitFlag(16, 1, 5, 9, 12);
    const serialized = serializeBitFlag(original);
    const restored = deserializeBitFlag(serialized);

    expect(restored.has(1)).toBe(true);
    expect(restored.has(5)).toBe(true);
    expect(restored.has(9)).toBe(true);
    expect(restored.has(12)).toBe(true);
    expect(restored.has(2)).toBe(false);
    expect(restored.has(6)).toBe(false);
  });

  it("should produce a BitFlag identical to the original", () => {
    const original = mockBitFlag(32, 1, 8, 16, 24);
    const serialized = serializeBitFlag(original);
    const restored = deserializeBitFlag(serialized);

    expect(restored.isEqual(original)).toBe(true);
  });
});

describe("validateSaveData", () => {
  it("should accept valid save data", () => {
    const { save } = buildAndSave();
    expect(validateSaveData(save)).toBe(true);
  });

  it("should reject null", () => {
    expect(validateSaveData(null)).toBe(false);
  });

  it("should reject undefined", () => {
    expect(validateSaveData(undefined)).toBe(false);
  });

  it("should reject a non-object", () => {
    expect(validateSaveData("not an object")).toBe(false);
    expect(validateSaveData(42)).toBe(false);
  });

  it("should reject data with missing version", () => {
    const { save } = buildAndSave();
    const bad = { ...save } as Record<string, unknown>;
    delete bad["version"];
    expect(validateSaveData(bad)).toBe(false);
  });

  it("should reject data with incompatible major version", () => {
    const { save } = buildAndSave();
    const bad = { ...save, version: "2.0.0" };
    expect(validateSaveData(bad)).toBe(false);
  });

  it("should reject data with future minor version", () => {
    const { save } = buildAndSave();
    const bad = { ...save, version: "1.999.0" };
    expect(validateSaveData(bad)).toBe(false);
  });

  it("should accept data with same major and lower minor version", () => {
    const { save } = buildAndSave();
    const ok = { ...save, version: "1.0.0" };
    expect(validateSaveData(ok)).toBe(true);
  });

  it("should reject data with invalid version format", () => {
    const { save } = buildAndSave();
    const bad = { ...save, version: "not-a-version" };
    expect(validateSaveData(bad)).toBe(false);
  });

  it("should reject data with missing player section", () => {
    const { save } = buildAndSave();
    const bad = { ...save } as Record<string, unknown>;
    delete bad["player"];
    expect(validateSaveData(bad)).toBe(false);
  });

  it("should reject data with missing dungeon section", () => {
    const { save } = buildAndSave();
    const bad = { ...save } as Record<string, unknown>;
    delete bad["dungeon"];
    expect(validateSaveData(bad)).toBe(false);
  });

  it("should reject data with missing rngState", () => {
    const { save } = buildAndSave();
    const bad = { ...save } as Record<string, unknown>;
    delete bad["rngState"];
    expect(validateSaveData(bad)).toBe(false);
  });

  it("should reject data with messages not an array", () => {
    const { save } = buildAndSave();
    const bad = { ...save, messages: "not-an-array" };
    expect(validateSaveData(bad)).toBe(false);
  });
});

describe("loadGame — round-trip", () => {
  it("should reconstruct player name and level", () => {
    const { save } = buildAndSave();
    const rng = new RNG();
    const loaded = loadGame(save, rng);

    expect(loaded.player.fullName).toBe("Gandalf");
    expect(loaded.player.lev).toBe(22);
    expect(loaded.player.raceName ?? loaded.player.race.name).toBe("Elf");
  });

  it("should reconstruct player HP and mana", () => {
    const { save } = buildAndSave();
    const rng = new RNG();
    const loaded = loadGame(save, rng);

    expect(loaded.player.mhp).toBe(150);
    expect(loaded.player.chp).toBe(120);
    expect(loaded.player.chpFrac).toBe(456);
    expect(loaded.player.msp).toBe(80);
    expect(loaded.player.csp).toBe(60);
    expect(loaded.player.cspFrac).toBe(789);
  });

  it("should reconstruct player position", () => {
    const { save } = buildAndSave();
    const rng = new RNG();
    const loaded = loadGame(save, rng);

    expect(loaded.player.grid).toEqual({ x: 15, y: 20 });
    expect(loaded.player.oldGrid).toEqual({ x: 1, y: 1 });
  });

  it("should reconstruct player stat arrays", () => {
    const { save } = buildAndSave();
    const rng = new RNG();
    const loaded = loadGame(save, rng);

    expect(loaded.player.statMax).toEqual([12, 18, 14, 16, 10]);
    expect(loaded.player.statCur).toEqual([12, 18, 14, 16, 10]);
    expect(loaded.player.statBirth).toEqual([10, 16, 12, 14, 8]);
  });

  it("should reconstruct player inventory data (gold, spells)", () => {
    const { save } = buildAndSave();
    const rng = new RNG();
    const loaded = loadGame(save, rng);

    expect(loaded.player.au).toBe(1200);
    expect(loaded.player.spellFlags).toEqual([1, 2, 0, 4]);
    expect(loaded.player.spellOrder).toEqual([0, 3, 1, 2]);
  });

  it("should reconstruct quest data", () => {
    const { save } = buildAndSave();
    const rng = new RNG();
    const loaded = loadGame(save, rng);

    expect(loaded.player.quests).toHaveLength(2);
    expect(loaded.player.quests[0]!.name).toBe("Slay Morgoth");
    expect(loaded.player.quests[1]!.name).toBe("Slay Sauron");
    expect(loaded.player.quests[1]!.curNum).toBe(1);
  });

  it("should reconstruct player body layout", () => {
    const { save } = buildAndSave();
    const rng = new RNG();
    const loaded = loadGame(save, rng);

    expect(loaded.player.body.name).toBe("humanoid");
    expect(loaded.player.body.count).toBe(3);
    expect(loaded.player.body.slots).toHaveLength(3);
    expect(loaded.player.body.slots[2]!.name).toBe("light");
  });

  it("should reconstruct turn and depth", () => {
    const { save } = buildAndSave();
    const rng = new RNG();
    const loaded = loadGame(save, rng);

    expect(loaded.turn).toBe(500);
    expect(loaded.depth).toBe(20);
  });

  it("should reconstruct dungeon terrain", () => {
    const { save } = buildAndSave();
    const rng = new RNG();
    const loaded = loadGame(save, rng);

    expect(loaded.chunk.height).toBe(3);
    expect(loaded.chunk.width).toBe(3);
    expect(loaded.chunk.squares).toHaveLength(3);
    // The mock creates feat = y * width + x
    expect(loaded.chunk.squares[0]![0]!.feat).toBe(0);
    expect(loaded.chunk.squares[1]![2]!.feat).toBe(5);
    expect(loaded.chunk.squares[2]![2]!.feat).toBe(8);
  });

  it("should reconstruct dungeon square info flags", () => {
    const { save } = buildAndSave();
    const rng = new RNG();
    const loaded = loadGame(save, rng);

    // Our mockSquare sets flags 1 (MARK) and 2 (GLOW)
    const sq = loaded.chunk.squares[0]![0]!;
    expect(sq.info.has(1)).toBe(true);
    expect(sq.info.has(2)).toBe(true);
    expect(sq.info.has(3)).toBe(false);
  });

  it("should reconstruct dungeon square light level", () => {
    const { save } = buildAndSave();
    const rng = new RNG();
    const loaded = loadGame(save, rng);

    expect(loaded.chunk.squares[0]![0]!.light).toBe(3);
  });

  it("should reconstruct dungeon metadata", () => {
    const { save } = buildAndSave();
    const rng = new RNG();
    const loaded = loadGame(save, rng);

    expect(loaded.chunk.name).toBe("Test Level");
    expect(loaded.chunk.depth).toBe(5);
    expect(loaded.chunk.feeling).toBe(3);
    expect(loaded.chunk.objRating).toBe(100);
    expect(loaded.chunk.monRating).toBe(200);
    expect(loaded.chunk.goodItem).toBe(true);
  });

  it("should reconstruct messages", () => {
    const { save } = buildAndSave();
    const rng = new RNG();
    const loaded = loadGame(save, rng);

    expect(loaded.messages).toHaveLength(2);
    expect(loaded.messages[0]!.text).toBe("You enter the dungeon.");
    expect(loaded.messages[0]!.type).toBe(MessageType.GENERIC);
    expect(loaded.messages[1]!.text).toBe("The orc attacks!");
    expect(loaded.messages[1]!.type).toBe(MessageType.COMBAT);
  });

  it("should create a fresh eventBus", () => {
    const { save } = buildAndSave();
    const rng = new RNG();
    const loaded = loadGame(save, rng);

    expect(loaded.eventBus).toBeDefined();
    expect(loaded.eventBus.listenerCount(0)).toBe(0); // Fresh, no listeners
  });

  it("should reconstruct game status flags", () => {
    const rng = new RNG();
    rng.stateInit(54321);
    const state = createGameState(mockPlayer(), mockChunk(), rng);
    state.running = true;
    state.resting = 25;
    state.dead = false;
    state.won = false;
    const save = saveGame(state);

    const loadRng = new RNG();
    const loaded = loadGame(save, loadRng);

    expect(loaded.running).toBe(true);
    expect(loaded.resting).toBe(25);
    expect(loaded.dead).toBe(false);
    expect(loaded.won).toBe(false);
  });
});

describe("loadGame — RNG state preservation", () => {
  it("should restore RNG state so next random value matches", () => {
    const rng1 = new RNG();
    rng1.stateInit(99999);
    // Switch out of quick (LCRNG) mode into WELL mode
    rng1.quick = false;
    const state = createGameState(mockPlayer(), mockChunk(), rng1);
    state.turn = 1;

    // Generate some random values to advance the state
    rng1.randint0(100);
    rng1.randint0(100);

    // Save the state AFTER generating random values
    const save = saveGame(state);

    // Now generate the next value from the original RNG
    const expectedNext = rng1.randint0(1000);

    // Load into a new RNG and switch to WELL mode
    const rng2 = new RNG();
    rng2.quick = false;
    loadGame(save, rng2);

    // The loaded RNG should produce the same next value
    const actualNext = rng2.randint0(1000);
    expect(actualNext).toBe(expectedNext);
  });

  it("should restore the full WELL state array", () => {
    const rng = new RNG();
    rng.stateInit(42);
    const state = createGameState(mockPlayer(), mockChunk(), rng);

    const originalState = rng.getState();
    const save = saveGame(state);

    const newRng = new RNG();
    loadRngState(newRng, save.rngState);
    const restoredState = newRng.getState();

    expect(Array.from(restoredState.STATE)).toEqual(
      Array.from(originalState.STATE),
    );
    expect(restoredState.state_i).toBe(originalState.state_i);
  });
});

describe("loadGame — monster serialization round-trip", () => {
  it("should preserve monster data in save", () => {
    const { save } = buildAndSave({ monsters: [mockMonster()] });

    expect(save.dungeon.monsters).toHaveLength(1);
    expect(save.dungeon.monsters[0]!.raceName).toBe("Cave Orc");
    expect(save.dungeon.monsters[0]!.hp).toBe(18);
    expect(save.dungeon.monsters[0]!.maxhp).toBe(20);
    expect(save.dungeon.monsters[0]!.grid).toEqual({ x: 3, y: 7 });
    expect(save.dungeon.monsters[0]!.mspeed).toBe(110);
    expect(save.dungeon.monsters[0]!.mTimed).toHaveLength(10);
  });
});

describe("loadGame — object serialization round-trip", () => {
  it("should preserve object data in save", () => {
    const { save } = buildAndSave({ objects: [mockObject()] });

    expect(save.dungeon.objects).toHaveLength(1);
    const obj = save.dungeon.objects[0]!;
    expect(obj.kindName).toBe("Long Sword");
    expect(obj.egoName).toBe("of Flame");
    expect(obj.artifactName).toBeNull();
    expect(obj.toH).toBe(4);
    expect(obj.toD).toBe(6);
    expect(obj.dd).toBe(2);
    expect(obj.ds).toBe(5);
    expect(obj.grid).toEqual({ x: 10, y: 15 });
    expect(obj.brands).toEqual([false, true, false]);
    expect(obj.modifiers[9]).toBe(1); // SPEED modifier
    expect(obj.notice).toBe(2);
    expect(obj.origin).toBe(10); // DROP
    expect(obj.originDepth).toBe(15);
  });

  it("should preserve object element info", () => {
    const { save } = buildAndSave({ objects: [mockObject()] });
    const obj = save.dungeon.objects[0]!;
    expect(obj.elInfo).toHaveLength(1);
    expect(obj.elInfo[0]!.resLevel).toBe(1);
  });

  it("should preserve object flags via BitFlag serialization", () => {
    const { save } = buildAndSave({ objects: [mockObject()] });
    const obj = save.dungeon.objects[0]!;
    const flags = deserializeBitFlag(obj.flags);
    expect(flags.has(1)).toBe(true);
    expect(flags.has(3)).toBe(true);
    expect(flags.has(2)).toBe(false);
  });
});

describe("loadGameFromJSON", () => {
  it("should parse JSON and reconstruct game state", () => {
    const rng = new RNG();
    rng.stateInit(54321);
    const state = createGameState(mockPlayer(), mockChunk(), rng);
    state.turn = 200;
    addMessage(state, "JSON round-trip test");

    const json = saveGameToJSON(state);
    const loadRng = new RNG();
    const loaded = loadGameFromJSON(json, loadRng);

    expect(loaded.turn).toBe(200);
    expect(loaded.player.fullName).toBe("Gandalf");
    expect(loaded.messages).toHaveLength(1);
    expect(loaded.messages[0]!.text).toBe("JSON round-trip test");
  });

  it("should throw SaveLoadError for malformed JSON", () => {
    const rng = new RNG();
    expect(() => loadGameFromJSON("not valid json {{{", rng)).toThrow(
      SaveLoadError,
    );
    expect(() => loadGameFromJSON("not valid json {{{", rng)).toThrow(
      "Malformed JSON",
    );
  });

  it("should throw SaveLoadError for valid JSON with invalid structure", () => {
    const rng = new RNG();
    expect(() => loadGameFromJSON('{"hello": "world"}', rng)).toThrow(
      SaveLoadError,
    );
    expect(() => loadGameFromJSON('{"hello": "world"}', rng)).toThrow(
      "failed validation",
    );
  });

  it("should throw SaveLoadError for incompatible version", () => {
    const { save } = buildAndSave();
    const bad = { ...save, version: "9.0.0" };
    const json = JSON.stringify(bad);
    const rng = new RNG();
    expect(() => loadGameFromJSON(json, rng)).toThrow(SaveLoadError);
  });
});

describe("loadGame — corrupt data handling", () => {
  it("should throw on invalid save data structure", () => {
    const rng = new RNG();
    expect(() => loadGame({} as SaveData, rng)).toThrow(SaveLoadError);
  });

  it("should throw on null passed as save data", () => {
    const rng = new RNG();
    expect(() => loadGame(null as unknown as SaveData, rng)).toThrow(
      SaveLoadError,
    );
  });
});

describe("loadPlayer", () => {
  it("should reconstruct player fields from saved data", () => {
    const { save } = buildAndSave();
    const player = loadPlayer(save.player);

    expect(player.fullName).toBe("Gandalf");
    expect(player.lev).toBe(22);
    expect(player.race.name).toBe("Elf");
    expect(player.class.name).toBe("Mage");
    expect(player.grid).toEqual({ x: 15, y: 20 });
  });

  it("should use custom race/class resolvers when provided", () => {
    const { save } = buildAndSave();

    const customRace = {
      name: "Custom Elf",
      ridx: 2,
    } as any;

    const customClass = {
      name: "Custom Mage",
      cidx: 1,
    } as any;

    const player = loadPlayer(
      save.player,
      () => customRace,
      () => customClass,
    );

    expect(player.race.name).toBe("Custom Elf");
    expect(player.class.name).toBe("Custom Mage");
  });

  it("should create default (zeroed) state and upkeep", () => {
    const { save } = buildAndSave();
    const player = loadPlayer(save.player);

    expect(player.state).toBeDefined();
    expect(player.state.speed).toBe(110);
    expect(player.upkeep).toBeDefined();
    expect(player.upkeep.playing).toBe(true);
  });
});

describe("loadChunk", () => {
  it("should reconstruct chunk dimensions", () => {
    const { save } = buildAndSave();
    const chunk = loadChunk(save.dungeon);

    expect(chunk.height).toBe(3);
    expect(chunk.width).toBe(3);
    expect(chunk.name).toBe("Test Level");
    expect(chunk.depth).toBe(5);
  });

  it("should reconstruct the terrain grid", () => {
    const { save } = buildAndSave();
    const chunk = loadChunk(save.dungeon);

    expect(chunk.squares).toHaveLength(3);
    expect(chunk.squares[0]).toHaveLength(3);
    // Our mock uses feat = y * width + x
    expect(chunk.squares[0]![0]!.feat).toBe(0);
    expect(chunk.squares[2]![2]!.feat).toBe(8);
  });

  it("should create empty heatmaps (rebuilt at runtime)", () => {
    const { save } = buildAndSave();
    const chunk = loadChunk(save.dungeon);

    expect(chunk.noise.grids).toHaveLength(3);
    expect(chunk.scent.grids).toHaveLength(3);
  });
});

describe("full round-trip: save -> JSON -> load -> compare", () => {
  it("should preserve all critical game state through JSON round-trip", () => {
    const rng = new RNG();
    rng.stateInit(77777);
    const state = createGameState(mockPlayer(), mockChunk(), rng);
    state.turn = 1000;
    state.depth = 20;
    state.running = false;
    state.resting = 0;
    addMessage(state, "You feel a sense of dread.", MessageType.URGENT);
    addMessage(state, "Something lurks in the shadows.", MessageType.MONSTER);

    // Set some timed effects
    state.player.timed[0] = 15; // FAST
    state.player.timed[8] = 3; // CUT

    const json = saveGameToJSON(state);
    const loadRng = new RNG();
    const loaded = loadGameFromJSON(json, loadRng);

    // Compare critical fields
    expect(loaded.turn).toBe(state.turn);
    expect(loaded.depth).toBe(state.depth);
    expect(loaded.running).toBe(state.running);
    expect(loaded.resting).toBe(state.resting);
    expect(loaded.dead).toBe(state.dead);
    expect(loaded.won).toBe(state.won);

    // Player
    expect(loaded.player.fullName).toBe(state.player.fullName);
    expect(loaded.player.lev).toBe(state.player.lev);
    expect(loaded.player.chp).toBe(state.player.chp);
    expect(loaded.player.mhp).toBe(state.player.mhp);
    expect(loaded.player.csp).toBe(state.player.csp);
    expect(loaded.player.msp).toBe(state.player.msp);
    expect(loaded.player.au).toBe(state.player.au);
    expect(loaded.player.grid).toEqual(state.player.grid);
    expect(loaded.player.statMax).toEqual(state.player.statMax);
    expect(loaded.player.statCur).toEqual(state.player.statCur);
    expect(loaded.player.timed[0]).toBe(15);
    expect(loaded.player.timed[8]).toBe(3);

    // Dungeon
    expect(loaded.chunk.height).toBe(state.chunk.height);
    expect(loaded.chunk.width).toBe(state.chunk.width);
    expect(loaded.chunk.name).toBe(state.chunk.name);
    expect(loaded.chunk.depth).toBe(state.chunk.depth);

    // Messages
    expect(loaded.messages).toHaveLength(2);
    expect(loaded.messages[0]!.text).toBe("You feel a sense of dread.");
    expect(loaded.messages[0]!.type).toBe(MessageType.URGENT);
    expect(loaded.messages[1]!.text).toBe(
      "Something lurks in the shadows.",
    );

    // RNG determinism
    const nextFromOriginal = rng.randint0(1000);
    const nextFromLoaded = loadRng.randint0(1000);
    expect(nextFromLoaded).toBe(nextFromOriginal);
  });
});
