/**
 * Tests for command/item.ts — Item usage command layer.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  cmdUseItem,
  cmdEat,
  cmdQuaff,
  cmdRead,
  cmdAim,
  cmdZap,
  cmdPickup,
  cmdDrop,
  cmdEquip,
  cmdUnequip,
  cmdRest,
  cmdInscribe,
} from "./item.js";
import {
  TVal,
  TimedEffect,
  TMD_MAX,
  EquipSlot,
  ObjectFlag,
  KindFlag,
  ObjectModifier,
} from "../types/index.js";
import type { Player, ObjectType, ObjectKind, ObjectBase } from "../types/index.js";
import { RNG, BitFlag } from "../z/index.js";
import { addToInventory, getInventoryItem, inventoryCount } from "../object/index.js";

// ── Test helpers ──

function makeBase(overrides: Partial<ObjectBase> = {}): ObjectBase {
  return {
    name: "test",
    tval: TVal.NULL,
    attr: 0,
    flags: new BitFlag(ObjectFlag.MAX),
    kindFlags: new BitFlag(KindFlag.MAX),
    elInfo: [],
    breakPerc: 0,
    maxStack: 40,
    numSvals: 1,
    ...overrides,
  };
}

function makeKind(overrides: Partial<ObjectKind> = {}): ObjectKind {
  return {
    name: "Test Item",
    text: "",
    base: makeBase(),
    kidx: 1 as any,
    tval: TVal.NULL,
    sval: 1 as any,
    pval: { base: 0, dice: 0, sides: 0, m_bonus: 0 },
    toH: { base: 0, dice: 0, sides: 0, m_bonus: 0 },
    toD: { base: 0, dice: 0, sides: 0, m_bonus: 0 },
    toA: { base: 0, dice: 0, sides: 0, m_bonus: 0 },
    ac: 0,
    dd: 1,
    ds: 1,
    weight: 10,
    cost: 0,
    flags: new BitFlag(ObjectFlag.MAX),
    kindFlags: new BitFlag(KindFlag.MAX),
    modifiers: [],
    elInfo: [],
    brands: null,
    slays: null,
    curses: null,
    dAttr: 0,
    dChar: "?",
    allocProb: 0,
    allocMin: 0,
    allocMax: 0,
    level: 0,
    activation: null,
    effect: null,
    power: 0,
    effectMsg: null,
    visMsg: null,
    time: { base: 0, dice: 0, sides: 0, m_bonus: 0 },
    charge: { base: 0, dice: 0, sides: 0, m_bonus: 0 },
    genMultProb: 0,
    stackSize: { base: 1, dice: 0, sides: 0, m_bonus: 0 },
    flavor: null,
    noteAware: 0,
    noteUnaware: 0,
    aware: true,
    tried: false,
    ignore: 0,
    everseen: false,
    ...overrides,
  } as ObjectKind;
}

function makeObj(tval: TVal, name = "Test Item", overrides: Partial<ObjectType> = {}): ObjectType {
  const kind = makeKind({ tval, name });
  return {
    kind,
    ego: null,
    artifact: null,
    prev: null,
    next: null,
    known: null,
    oidx: 0 as any,
    grid: { x: 0, y: 0 },
    tval,
    sval: 1 as any,
    pval: 0,
    weight: 10,
    dd: 1,
    ds: 1,
    ac: 0,
    toA: 0,
    toH: 0,
    toD: 0,
    flags: new BitFlag(ObjectFlag.MAX),
    modifiers: new Array(ObjectModifier.MAX).fill(0),
    elInfo: [],
    brands: null,
    slays: null,
    curses: null,
    effect: null,
    effectMsg: null,
    activation: null,
    time: { base: 0, dice: 0, sides: 0, m_bonus: 0 } as any,
    timeout: 0,
    number: 1,
    notice: 0,
    heldMIdx: 0,
    mimickingMIdx: 0,
    origin: 0 as any,
    originDepth: 0,
    originRace: null,
    note: 0,
    ...overrides,
  } as ObjectType;
}

function makePlayer(): Player {
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
      flags: new BitFlag(128),
      pflags: new BitFlag(20),
      elInfo: [],
    },
    class: {
      name: "Warrior",
      cidx: 0,
      titles: [],
      statAdj: [0, 0, 0, 0, 0],
      skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      extraSkills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      hitDice: 10,
      expFactor: 0,
      flags: new BitFlag(128),
      pflags: new BitFlag(20),
      maxAttacks: 6,
      minWeight: 30,
      attMultiply: 5,
      startItems: [],
      magic: {
        spellFirst: 99,
        spellWeight: 0,
        numBooks: 0,
        books: [],
        totalSpells: 0,
      },
    },
    grid: { x: 5, y: 5 },
    oldGrid: { x: 0, y: 0 },
    hitdie: 10,
    expfact: 100,
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
    mhp: 100,
    chp: 50,
    chpFrac: 0,
    msp: 0,
    csp: 0,
    cspFrac: 0,
    statMax: [18, 10, 10, 14, 16],
    statCur: [18, 10, 10, 14, 16],
    statMap: [0, 1, 2, 3, 4],
    timed: new Array(TMD_MAX).fill(0) as number[],
    wordRecall: 0,
    deepDescent: 0,
    energy: 0,
    totalEnergy: 0,
    restingTurn: 0,
    food: 5000,
    unignoring: 0,
    spellFlags: [],
    spellOrder: [],
    fullName: "Test Warrior",
    diedFrom: "",
    history: "",
    quests: [],
    totalWinner: false,
    noscore: 0,
    isDead: false,
    wizard: false,
    playerHp: [],
    auBirth: 0,
    statBirth: [18, 10, 10, 14, 16],
    htBirth: 72,
    wtBirth: 180,
    body: { name: "humanoid", count: 12, slots: [] },
    shape: null,
    state: {
      statAdd: [0, 0, 0, 0, 0],
      statInd: [15, 10, 10, 12, 14],
      statUse: [18, 10, 10, 14, 16],
      statTop: [18, 10, 10, 14, 16],
      skills: [0, 0, 30, 0, 0, 0, 0, 0, 0, 0], // skill[2] = DEVICE = 30
      speed: 110,
      numBlows: 200,
      numShots: 10,
      numMoves: 0,
      ammoMult: 0,
      ammoTval: 0,
      ac: 10,
      damRed: 0,
      percDamRed: 0,
      toA: 5,
      toH: 5,
      toD: 5,
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
      statInd: [15, 10, 10, 12, 14],
      statUse: [18, 10, 10, 14, 16],
      statTop: [18, 10, 10, 14, 16],
      skills: [0, 0, 30, 0, 0, 0, 0, 0, 0, 0],
      speed: 110,
      numBlows: 200,
      numShots: 10,
      numMoves: 0,
      ammoMult: 0,
      ammoTval: 0,
      ac: 10,
      damRed: 0,
      percDamRed: 0,
      toA: 5,
      toH: 5,
      toD: 5,
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
  };
}

// ── Tests ──

describe("cmdEat", () => {
  let player: Player;
  let rng: RNG;

  beforeEach(() => {
    player = makePlayer();
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);
  });

  it("eats food and increases food timer", () => {
    const food = makeObj(TVal.FOOD, "Ration of Food", { pval: 5000 });
    addToInventory(player, food);

    const result = cmdEat(player, 0, rng);

    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    expect(result.messages.some((m) => m.includes("eat"))).toBe(true);
  });

  it("consumes the food item", () => {
    const food = makeObj(TVal.FOOD, "Ration of Food", { pval: 5000 });
    addToInventory(player, food);

    cmdEat(player, 0, rng);

    expect(inventoryCount(player)).toBe(0);
  });

  it("decrements stack count when eating from a stack", () => {
    const food = makeObj(TVal.FOOD, "Rations", { pval: 5000, number: 3 });
    addToInventory(player, food);

    cmdEat(player, 0, rng);

    expect(food.number).toBe(2);
    expect(inventoryCount(player)).toBe(1);
  });

  it("eats mushrooms", () => {
    const mushroom = makeObj(TVal.MUSHROOM, "Mushroom", { pval: 1000 });
    addToInventory(player, mushroom);

    const result = cmdEat(player, 0, rng);

    expect(result.success).toBe(true);
  });

  it("fails when trying to eat a non-food item", () => {
    const sword = makeObj(TVal.SWORD, "Sword");
    addToInventory(player, sword);

    const result = cmdEat(player, 0, rng);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You cannot eat that!");
  });

  it("fails when paralyzed", () => {
    const food = makeObj(TVal.FOOD, "Food");
    addToInventory(player, food);
    player.timed[TimedEffect.PARALYZED] = 10;

    const result = cmdEat(player, 0, rng);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You are paralyzed!");
  });

  it("fails with invalid item index", () => {
    const result = cmdEat(player, 99, rng);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You have no food to eat.");
  });
});

describe("cmdQuaff", () => {
  let player: Player;
  let rng: RNG;

  beforeEach(() => {
    player = makePlayer();
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);
  });

  it("quaffs a potion and heals HP", () => {
    const potion = makeObj(TVal.POTION, "Potion of Healing", { pval: 20 });
    addToInventory(player, potion);
    player.chp = 30;

    const result = cmdQuaff(player, 0, rng);

    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    expect(player.chp).toBe(50); // 30 + 20
  });

  it("does not heal above max HP", () => {
    const potion = makeObj(TVal.POTION, "Potion of Healing", { pval: 200 });
    addToInventory(player, potion);
    player.chp = 90;

    cmdQuaff(player, 0, rng);

    expect(player.chp).toBe(100); // mhp is 100
  });

  it("consumes the potion", () => {
    const potion = makeObj(TVal.POTION, "Potion", { pval: 10 });
    addToInventory(player, potion);

    cmdQuaff(player, 0, rng);

    expect(inventoryCount(player)).toBe(0);
  });

  it("fails on non-potion items", () => {
    const food = makeObj(TVal.FOOD, "Food");
    addToInventory(player, food);

    const result = cmdQuaff(player, 0, rng);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You cannot quaff that!");
  });

  it("fails when paralyzed", () => {
    const potion = makeObj(TVal.POTION, "Potion");
    addToInventory(player, potion);
    player.timed[TimedEffect.PARALYZED] = 10;

    const result = cmdQuaff(player, 0, rng);

    expect(result.success).toBe(false);
  });
});

describe("cmdRead", () => {
  let player: Player;
  let rng: RNG;

  beforeEach(() => {
    player = makePlayer();
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);
  });

  it("reads a scroll successfully", () => {
    const scroll = makeObj(TVal.SCROLL, "Scroll of Light");
    addToInventory(player, scroll);

    const result = cmdRead(player, 0, rng);

    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
  });

  it("consumes the scroll", () => {
    const scroll = makeObj(TVal.SCROLL, "Scroll");
    addToInventory(player, scroll);

    cmdRead(player, 0, rng);

    expect(inventoryCount(player)).toBe(0);
  });

  it("fails when blind", () => {
    const scroll = makeObj(TVal.SCROLL, "Scroll");
    addToInventory(player, scroll);
    player.timed[TimedEffect.BLIND] = 10;

    const result = cmdRead(player, 0, rng);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You cannot see!");
  });

  it("fails when confused", () => {
    const scroll = makeObj(TVal.SCROLL, "Scroll");
    addToInventory(player, scroll);
    player.timed[TimedEffect.CONFUSED] = 10;

    const result = cmdRead(player, 0, rng);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You are too confused to read!");
  });

  it("fails on non-scroll items", () => {
    const food = makeObj(TVal.FOOD, "Food");
    addToInventory(player, food);

    const result = cmdRead(player, 0, rng);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You cannot read that!");
  });
});

describe("cmdAim", () => {
  let player: Player;
  let rng: RNG;

  beforeEach(() => {
    player = makePlayer();
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);
  });

  it("aims a wand with charges", () => {
    const wand = makeObj(TVal.WAND, "Wand of Light", { pval: 5 });
    addToInventory(player, wand);

    rng.fix(100); // ensure device check passes
    const result = cmdAim(player, 0, 5, rng);
    rng.unfix();

    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    expect(wand.pval).toBe(4); // one charge used
  });

  it("fails when wand has no charges", () => {
    const wand = makeObj(TVal.WAND, "Wand", { pval: 0 });
    addToInventory(player, wand);

    const result = cmdAim(player, 0, 5, rng);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("That wand has no charges.");
  });

  it("fails when aiming a non-wand", () => {
    const food = makeObj(TVal.FOOD, "Food");
    addToInventory(player, food);

    const result = cmdAim(player, 0, 5, rng);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("That is not a wand!");
  });

  it("shows remaining charges after use", () => {
    const wand = makeObj(TVal.WAND, "Wand", { pval: 3 });
    addToInventory(player, wand);

    rng.fix(100);
    const result = cmdAim(player, 0, 5, rng);
    rng.unfix();

    expect(result.messages.some((m) => m.includes("2 charges remaining"))).toBe(true);
  });
});

describe("cmdZap", () => {
  let player: Player;
  let rng: RNG;

  beforeEach(() => {
    player = makePlayer();
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);
  });

  it("zaps a rod successfully", () => {
    const rod = makeObj(TVal.ROD, "Rod of Detection", {
      timeout: 0,
      time: { base: 10, dice: 0, sides: 0, m_bonus: 0 } as any,
    });
    addToInventory(player, rod);

    rng.fix(100);
    const result = cmdZap(player, 0, rng);
    rng.unfix();

    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    expect(rod.timeout).toBeGreaterThan(0); // rod is now charging
  });

  it("fails when rod is still charging", () => {
    const rod = makeObj(TVal.ROD, "Rod", {
      timeout: 5,
      time: { base: 10, dice: 0, sides: 0, m_bonus: 0 } as any,
    });
    addToInventory(player, rod);

    const result = cmdZap(player, 0, rng);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("That rod is still charging.");
  });

  it("fails on non-rod items", () => {
    const food = makeObj(TVal.FOOD, "Food");
    addToInventory(player, food);

    const result = cmdZap(player, 0, rng);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("That is not a rod!");
  });
});

describe("cmdDrop", () => {
  let player: Player;

  beforeEach(() => {
    player = makePlayer();
  });

  it("drops an item from inventory", () => {
    const sword = makeObj(TVal.SWORD, "Long Sword");
    addToInventory(player, sword);

    const result = cmdDrop(player, 0, 0);

    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(50); // half energy
    expect(inventoryCount(player)).toBe(0);
  });

  it("drops partial stack", () => {
    const arrows = makeObj(TVal.ARROW, "Arrows", { number: 10 });
    addToInventory(player, arrows);

    const result = cmdDrop(player, 0, 3);

    expect(result.success).toBe(true);
    expect(arrows.number).toBe(7);
    expect(inventoryCount(player)).toBe(1); // still has remaining
  });

  it("drops entire stack when count is 0", () => {
    const arrows = makeObj(TVal.ARROW, "Arrows", { number: 10 });
    addToInventory(player, arrows);

    const result = cmdDrop(player, 0, 0);

    expect(result.success).toBe(true);
    expect(inventoryCount(player)).toBe(0);
  });

  it("fails with invalid item index", () => {
    const result = cmdDrop(player, 99, 0);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You have nothing to drop.");
  });

  it("fails when paralyzed", () => {
    const item = makeObj(TVal.SWORD, "Sword");
    addToInventory(player, item);
    player.timed[TimedEffect.PARALYZED] = 10;

    const result = cmdDrop(player, 0, 0);

    expect(result.success).toBe(false);
  });
});

describe("cmdEquip", () => {
  let player: Player;

  beforeEach(() => {
    player = makePlayer();
  });

  it("equips a weapon from inventory", () => {
    const sword = makeObj(TVal.SWORD, "Long Sword");
    addToInventory(player, sword);

    const result = cmdEquip(player, 0);

    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(50);
    expect(inventoryCount(player)).toBe(0); // removed from inventory
  });

  it("fails for non-equippable items", () => {
    const food = makeObj(TVal.FOOD, "Rations");
    addToInventory(player, food);

    const result = cmdEquip(player, 0);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You cannot equip that item.");
  });

  it("returns previously equipped item to inventory", () => {
    // First equip a sword
    const sword1 = makeObj(TVal.SWORD, "Short Sword");
    addToInventory(player, sword1);
    cmdEquip(player, 0);

    // Now equip another sword
    const sword2 = makeObj(TVal.SWORD, "Long Sword");
    addToInventory(player, sword2);
    const result = cmdEquip(player, 0);

    expect(result.success).toBe(true);
    // Previous sword should be back in inventory
    expect(inventoryCount(player)).toBe(1);
  });

  it("fails when paralyzed", () => {
    const sword = makeObj(TVal.SWORD, "Sword");
    addToInventory(player, sword);
    player.timed[TimedEffect.PARALYZED] = 10;

    const result = cmdEquip(player, 0);

    expect(result.success).toBe(false);
  });

  it("fails with invalid item index", () => {
    const result = cmdEquip(player, 99);

    expect(result.success).toBe(false);
  });
});

describe("cmdUnequip", () => {
  let player: Player;

  beforeEach(() => {
    player = makePlayer();
  });

  it("unequips an item and puts it in inventory", () => {
    // Equip first
    const sword = makeObj(TVal.SWORD, "Sword");
    addToInventory(player, sword);
    cmdEquip(player, 0);

    const result = cmdUnequip(player, EquipSlot.WEAPON);

    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(50);
    expect(inventoryCount(player)).toBe(1); // back in inventory
  });

  it("fails for empty slot", () => {
    const result = cmdUnequip(player, EquipSlot.WEAPON);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("Nothing is equipped in that slot.");
  });

  it("fails for EquipSlot.NONE", () => {
    const result = cmdUnequip(player, EquipSlot.NONE);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("Invalid equipment slot.");
  });

  it("fails when paralyzed", () => {
    const sword = makeObj(TVal.SWORD, "Sword");
    addToInventory(player, sword);
    cmdEquip(player, 0);
    player.timed[TimedEffect.PARALYZED] = 10;

    const result = cmdUnequip(player, EquipSlot.WEAPON);

    expect(result.success).toBe(false);
  });
});

describe("cmdRest", () => {
  let player: Player;

  beforeEach(() => {
    player = makePlayer();
  });

  it("sets resting for a specific number of turns", () => {
    const result = cmdRest(player, 50);

    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(100);
    expect(player.upkeep.resting).toBe(50);
  });

  it("sets resting until healed when turns is 0", () => {
    const result = cmdRest(player, 0);

    expect(result.success).toBe(true);
    expect(player.upkeep.resting).toBe(-2);
    expect(result.messages.some((m) => m.includes("until healed"))).toBe(true);
  });

  it("fails with negative turns", () => {
    const result = cmdRest(player, -5);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("Invalid rest duration.");
  });

  it("fails when paralyzed", () => {
    player.timed[TimedEffect.PARALYZED] = 10;

    const result = cmdRest(player, 10);

    expect(result.success).toBe(false);
  });
});

describe("cmdInscribe", () => {
  let player: Player;

  beforeEach(() => {
    player = makePlayer();
  });

  it("inscribes an item with text", () => {
    const sword = makeObj(TVal.SWORD, "Long Sword");
    addToInventory(player, sword);

    const result = cmdInscribe(player, 0, "!k");

    expect(result.success).toBe(true);
    expect(result.energyCost).toBe(0); // inscribing is free
    expect(sword.note).not.toBe(0); // note should be set
  });

  it("fails with empty inscription", () => {
    const sword = makeObj(TVal.SWORD, "Sword");
    addToInventory(player, sword);

    const result = cmdInscribe(player, 0, "");

    expect(result.success).toBe(false);
    expect(result.messages).toContain("No inscription provided.");
  });

  it("fails with whitespace-only inscription", () => {
    const sword = makeObj(TVal.SWORD, "Sword");
    addToInventory(player, sword);

    const result = cmdInscribe(player, 0, "   ");

    expect(result.success).toBe(false);
  });

  it("fails with invalid item index", () => {
    const result = cmdInscribe(player, 99, "test");

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You have nothing to inscribe.");
  });

  it("fails when paralyzed", () => {
    const sword = makeObj(TVal.SWORD, "Sword");
    addToInventory(player, sword);
    player.timed[TimedEffect.PARALYZED] = 10;

    const result = cmdInscribe(player, 0, "test");

    expect(result.success).toBe(false);
  });
});

describe("cmdUseItem", () => {
  let player: Player;
  let rng: RNG;

  beforeEach(() => {
    player = makePlayer();
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);
  });

  it("dispatches potion to cmdQuaff", () => {
    const potion = makeObj(TVal.POTION, "Potion", { pval: 10 });
    addToInventory(player, potion);
    player.chp = 50;

    const result = cmdUseItem(player, 0, null, rng);

    expect(result.success).toBe(true);
    expect(player.chp).toBe(60); // healed
  });

  it("dispatches food to cmdEat", () => {
    const food = makeObj(TVal.FOOD, "Food", { pval: 3000 });
    addToInventory(player, food);

    const result = cmdUseItem(player, 0, null, rng);

    expect(result.success).toBe(true);
    expect(inventoryCount(player)).toBe(0);
  });

  it("dispatches scroll to cmdRead", () => {
    const scroll = makeObj(TVal.SCROLL, "Scroll");
    addToInventory(player, scroll);

    const result = cmdUseItem(player, 0, null, rng);

    expect(result.success).toBe(true);
    expect(inventoryCount(player)).toBe(0);
  });

  it("fails for non-usable items", () => {
    const gold = makeObj(TVal.GOLD, "Gold");
    addToInventory(player, gold);

    const result = cmdUseItem(player, 0, null, rng);

    expect(result.success).toBe(false);
  });

  it("fails with invalid item index", () => {
    const result = cmdUseItem(player, 99, null, rng);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You have nothing to use.");
  });

  it("fails when paralyzed", () => {
    const potion = makeObj(TVal.POTION, "Potion");
    addToInventory(player, potion);
    player.timed[TimedEffect.PARALYZED] = 10;

    const result = cmdUseItem(player, 0, null, rng);

    expect(result.success).toBe(false);
  });
});

describe("cmdPickup", () => {
  let player: Player;
  let rng: RNG;

  beforeEach(() => {
    player = makePlayer();
    rng = new RNG();
    rng.quick = false;
    rng.stateInit(42);
  });

  it("returns failure when no chunk is provided", () => {
    const result = cmdPickup(player, null, rng);

    expect(result.success).toBe(false);
    expect(result.messages.some((m) => m.includes("nothing"))).toBe(true);
  });

  it("fails when paralyzed", () => {
    player.timed[TimedEffect.PARALYZED] = 10;

    const result = cmdPickup(player, null, rng);

    expect(result.success).toBe(false);
    expect(result.messages).toContain("You are paralyzed!");
  });
});
