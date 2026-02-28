/**
 * Tests for store/store.ts -- Store/shop system.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { BitFlag, RNG, randomValue } from "../z/index.js";
import type {
  ObjectType,
  ObjectKind,
  ObjectBase,
  Player,
} from "../types/index.js";
import {
  TVal,
  KindFlag,
  ObjectFlag,
  ObjectModifier,
} from "../types/index.js";
import {
  StoreType,
  DEFAULT_MAX_STOCK,
  HOME_MAX_STOCK,
  createStore,
  objectBaseValue,
  storeGetPrice,
  storeCarries,
  storeBuy,
  storeSell,
  initStoreStock,
  storeMaintenance,
  homeStore,
  homeRetrieve,
} from "./store.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeBase(overrides: Partial<ObjectBase> = {}): ObjectBase {
  return {
    name: "sword",
    tval: TVal.SWORD,
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
  const tval = (overrides.tval as TVal) ?? TVal.SWORD;
  return {
    name: "Test Sword",
    text: "",
    base: makeBase({ tval }),
    kidx: 1 as any,
    tval,
    sval: 1 as any,
    pval: randomValue(),
    toH: randomValue(),
    toD: randomValue(),
    toA: randomValue(),
    ac: 0,
    dd: 2,
    ds: 5,
    weight: 110,
    cost: 350,
    flags: new BitFlag(ObjectFlag.MAX),
    kindFlags: new BitFlag(KindFlag.MAX),
    modifiers: [],
    elInfo: [],
    brands: null,
    slays: null,
    curses: null,
    dAttr: 0,
    dChar: "|",
    allocProb: 10,
    allocMin: 0,
    allocMax: 100,
    level: 5,
    activation: null,
    effect: null,
    power: 0,
    effectMsg: null,
    visMsg: null,
    time: randomValue(),
    charge: randomValue(),
    genMultProb: 0,
    stackSize: randomValue(1),
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

function makeObj(
  tval: TVal,
  cost = 350,
  name = "test item",
): ObjectType {
  const kind = makeKind({ tval, name, cost });
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
    weight: 100,
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
    time: randomValue(),
    timeout: 0,
    number: 1,
    notice: 0,
    heldMIdx: 0,
    mimickingMIdx: 0,
    origin: 0 as any,
    originDepth: 0,
    originRace: null,
    note: 0,
  } as ObjectType;
}

function makePlayer(gold = 10000): Player {
  return {
    race: {} as any,
    class: {} as any,
    grid: { x: 0, y: 0 },
    oldGrid: { x: 0, y: 0 },
    hitdie: 10,
    expfact: 100,
    age: 20,
    ht: 72,
    wt: 180,
    au: gold,
    maxDepth: 0,
    recallDepth: 0,
    depth: 0,
    maxLev: 1,
    lev: 1,
    maxExp: 0,
    exp: 0,
    expFrac: 0,
    mhp: 100,
    chp: 100,
    chpFrac: 0,
    msp: 0,
    csp: 0,
    cspFrac: 0,
    statMax: [10, 10, 10, 10, 10],
    statCur: [10, 10, 10, 10, 10],
    statMap: [0, 1, 2, 3, 4],
    timed: [],
    wordRecall: 0,
    deepDescent: 0,
    energy: 0,
    totalEnergy: 0,
    restingTurn: 0,
    food: 0,
    unignoring: 0,
    spellFlags: [],
    spellOrder: [],
    fullName: "Test",
    diedFrom: "",
    history: "",
    quests: [],
    totalWinner: false,
    noscore: 0,
    isDead: false,
    wizard: false,
    playerHp: [],
    auBirth: 0,
    statBirth: [10, 10, 10, 10, 10],
    htBirth: 72,
    wtBirth: 180,
    body: { name: "humanoid", count: 12, slots: [] },
    shape: null,
    state: {} as any,
    knownState: {} as any,
    upkeep: {} as any,
  };
}

/** Create a seeded, deterministic RNG for tests. */
function makeRng(seed = 42): RNG {
  const rng = new RNG();
  rng.stateInit(seed);
  rng.quick = false;
  return rng;
}

/** Helper to add an item to a player's inventory (like gear.addToInventory). */
function addToPlayerInventory(player: Player, obj: ObjectType): void {
  const p = player as any;
  if (!p.inventory) p.inventory = [];
  p.inventory.push(obj);
}

/** Helper to count items in a player's inventory. */
function playerInventoryCount(player: Player): number {
  const p = player as any;
  if (!p.inventory) return 0;
  return p.inventory.length;
}

/** Helper: create a set of object kinds for stock-generation tests. */
function makeKindPool(): ObjectKind[] {
  return [
    makeKind({ tval: TVal.SWORD, name: "Short Sword", cost: 100, level: 1, allocProb: 20 }),
    makeKind({ tval: TVal.SWORD, name: "Long Sword", cost: 300, level: 5, allocProb: 15 }),
    makeKind({ tval: TVal.SOFT_ARMOR, name: "Leather Armor", cost: 50, level: 1, allocProb: 25 }),
    makeKind({ tval: TVal.POTION, name: "Potion of Healing", cost: 200, level: 3, allocProb: 30 }),
    makeKind({ tval: TVal.SCROLL, name: "Scroll of Light", cost: 15, level: 1, allocProb: 40 }),
    makeKind({ tval: TVal.FOOD, name: "Ration of Food", cost: 5, level: 0, allocProb: 50 }),
    makeKind({ tval: TVal.MAGIC_BOOK, name: "Beginner's Handbook", cost: 25, level: 0, allocProb: 30 }),
    makeKind({ tval: TVal.BOOTS, name: "Pair of Leather Boots", cost: 30, level: 1, allocProb: 20 }),
  ];
}

// ---------------------------------------------------------------------------
// Store creation tests
// ---------------------------------------------------------------------------

describe("createStore", () => {
  it("should create each store type with correct defaults", () => {
    const storeTypes = [
      StoreType.GENERAL,
      StoreType.ARMORY,
      StoreType.WEAPON,
      StoreType.TEMPLE,
      StoreType.ALCHEMY,
      StoreType.MAGIC,
      StoreType.BLACKMARKET,
      StoreType.HOME,
      StoreType.BOOKSHOP,
    ];

    for (const type of storeTypes) {
      const store = createStore(type);
      expect(store.type).toBe(type);
      expect(store.stock).toEqual([]);
      expect(store.name).toBeTruthy();
      expect(store.owner).toBeDefined();
      expect(store.owner.name).toBeTruthy();
    }
  });

  it("should give home a max stock of HOME_MAX_STOCK", () => {
    const home = createStore(StoreType.HOME);
    expect(home.maxStock).toBe(HOME_MAX_STOCK);
    expect(home.maxStock).toBe(24);
  });

  it("should give non-home stores a max stock of DEFAULT_MAX_STOCK", () => {
    const general = createStore(StoreType.GENERAL);
    expect(general.maxStock).toBe(DEFAULT_MAX_STOCK);
  });

  it("should give home zero turnover", () => {
    const home = createStore(StoreType.HOME);
    expect(home.turnover).toBe(0);
  });

  it("should give non-home stores positive turnover", () => {
    const armory = createStore(StoreType.ARMORY);
    expect(armory.turnover).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Price calculation tests
// ---------------------------------------------------------------------------

describe("storeGetPrice", () => {
  it("should return 0 for home store regardless of item", () => {
    const home = createStore(StoreType.HOME);
    const obj = makeObj(TVal.SWORD, 500);
    expect(storeGetPrice(home, obj, false)).toBe(0);
    expect(storeGetPrice(home, obj, true)).toBe(0);
  });

  it("should apply buy markup for general store (130%)", () => {
    const store = createStore(StoreType.GENERAL);
    const obj = makeObj(TVal.FOOD, 100);
    const price = storeGetPrice(store, obj, false);
    // 100 * 130 / 100 = 130
    expect(price).toBe(130);
  });

  it("should apply buy markup for specialist store (110%)", () => {
    const store = createStore(StoreType.WEAPON);
    const obj = makeObj(TVal.SWORD, 100);
    const price = storeGetPrice(store, obj, false);
    // 100 * 110 / 100 = 110
    expect(price).toBe(110);
  });

  it("should apply buy markup for black market (150%)", () => {
    const store = createStore(StoreType.BLACKMARKET);
    const obj = makeObj(TVal.SWORD, 100);
    const price = storeGetPrice(store, obj, false);
    // 100 * 150 / 100 = 150
    expect(price).toBe(150);
  });

  it("should apply sell markdown for general store (50%)", () => {
    const store = createStore(StoreType.GENERAL);
    const obj = makeObj(TVal.FOOD, 100);
    const price = storeGetPrice(store, obj, true);
    // 100 * 50 / 100 = 50
    expect(price).toBe(50);
  });

  it("should apply sell markdown for specialist store (75%)", () => {
    const store = createStore(StoreType.WEAPON);
    const obj = makeObj(TVal.SWORD, 100);
    const price = storeGetPrice(store, obj, true);
    // 100 * 75 / 100 = 75
    expect(price).toBe(75);
  });

  it("should apply sell markdown for black market (50%)", () => {
    const store = createStore(StoreType.BLACKMARKET);
    const obj = makeObj(TVal.SWORD, 100);
    const price = storeGetPrice(store, obj, true);
    // 100 * 50 / 100 = 50
    expect(price).toBe(50);
  });

  it("should never return 0 for non-worthless items when buying", () => {
    const store = createStore(StoreType.GENERAL);
    const obj = makeObj(TVal.FOOD, 1);
    const price = storeGetPrice(store, obj, false);
    expect(price).toBeGreaterThanOrEqual(1);
  });

  it("should return 0 for worthless items when selling", () => {
    const store = createStore(StoreType.GENERAL);
    const obj = makeObj(TVal.FOOD, 0);
    const price = storeGetPrice(store, obj, true);
    expect(price).toBe(0);
  });

  it("should return 1 for worthless items when store is selling", () => {
    const store = createStore(StoreType.GENERAL);
    const obj = makeObj(TVal.FOOD, 0);
    const price = storeGetPrice(store, obj, false);
    expect(price).toBe(1);
  });

  it("should cap sell price at owner's maxCost", () => {
    const store = createStore(StoreType.GENERAL);
    // General store owner maxCost is 5000
    const obj = makeObj(TVal.FOOD, 100000);
    const price = storeGetPrice(store, obj, true);
    expect(price).toBeLessThanOrEqual(store.owner.maxCost);
  });

  it("should include toH/toD/toA bonuses in base value", () => {
    const store = createStore(StoreType.WEAPON);
    const obj = makeObj(TVal.SWORD, 100);
    const basePriceNoBonus = storeGetPrice(store, obj, false);

    const objBoosted = makeObj(TVal.SWORD, 100);
    objBoosted.toH = 5;
    objBoosted.toD = 3;
    const boostedPrice = storeGetPrice(store, objBoosted, false);

    expect(boostedPrice).toBeGreaterThan(basePriceNoBonus);
  });
});

// ---------------------------------------------------------------------------
// objectBaseValue tests
// ---------------------------------------------------------------------------

describe("objectBaseValue", () => {
  it("should return 0 for objects with no kind", () => {
    const obj = makeObj(TVal.SWORD, 100);
    (obj as any).kind = null;
    expect(objectBaseValue(obj)).toBe(0);
  });

  it("should return kind cost for basic items", () => {
    const obj = makeObj(TVal.SWORD, 200);
    expect(objectBaseValue(obj)).toBe(200);
  });

  it("should add toH bonus value", () => {
    const obj = makeObj(TVal.SWORD, 100);
    obj.toH = 5;
    expect(objectBaseValue(obj)).toBe(150); // 100 + 5*10
  });

  it("should not add negative toH to value", () => {
    const obj = makeObj(TVal.SWORD, 100);
    obj.toH = -3;
    expect(objectBaseValue(obj)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Store item filtering tests
// ---------------------------------------------------------------------------

describe("storeCarries", () => {
  it("should accept everything at home", () => {
    const home = createStore(StoreType.HOME);
    expect(storeCarries(home, makeObj(TVal.SWORD))).toBe(true);
    expect(storeCarries(home, makeObj(TVal.POTION))).toBe(true);
    expect(storeCarries(home, makeObj(TVal.FOOD))).toBe(true);
    expect(storeCarries(home, makeObj(TVal.GOLD))).toBe(true);
  });

  it("should accept weapons at weapon shop", () => {
    const weapon = createStore(StoreType.WEAPON);
    expect(storeCarries(weapon, makeObj(TVal.SWORD))).toBe(true);
    expect(storeCarries(weapon, makeObj(TVal.HAFTED))).toBe(true);
    expect(storeCarries(weapon, makeObj(TVal.POLEARM))).toBe(true);
    expect(storeCarries(weapon, makeObj(TVal.BOW))).toBe(true);
  });

  it("should reject potions at weapon shop", () => {
    const weapon = createStore(StoreType.WEAPON);
    expect(storeCarries(weapon, makeObj(TVal.POTION))).toBe(false);
  });

  it("should accept armor at armory", () => {
    const armory = createStore(StoreType.ARMORY);
    expect(storeCarries(armory, makeObj(TVal.SOFT_ARMOR))).toBe(true);
    expect(storeCarries(armory, makeObj(TVal.HARD_ARMOR))).toBe(true);
    expect(storeCarries(armory, makeObj(TVal.BOOTS))).toBe(true);
    expect(storeCarries(armory, makeObj(TVal.HELM))).toBe(true);
  });

  it("should reject weapons at armory", () => {
    const armory = createStore(StoreType.ARMORY);
    expect(storeCarries(armory, makeObj(TVal.SWORD))).toBe(false);
  });

  it("should accept potions at alchemy shop", () => {
    const alchemy = createStore(StoreType.ALCHEMY);
    expect(storeCarries(alchemy, makeObj(TVal.POTION))).toBe(true);
    expect(storeCarries(alchemy, makeObj(TVal.SCROLL))).toBe(true);
  });

  it("should reject food at alchemy shop", () => {
    const alchemy = createStore(StoreType.ALCHEMY);
    expect(storeCarries(alchemy, makeObj(TVal.FOOD))).toBe(false);
  });

  it("should accept food at general store", () => {
    const general = createStore(StoreType.GENERAL);
    expect(storeCarries(general, makeObj(TVal.FOOD))).toBe(true);
    expect(storeCarries(general, makeObj(TVal.LIGHT))).toBe(true);
    expect(storeCarries(general, makeObj(TVal.FLASK))).toBe(true);
  });

  it("should accept books at bookshop", () => {
    const bookshop = createStore(StoreType.BOOKSHOP);
    expect(storeCarries(bookshop, makeObj(TVal.MAGIC_BOOK))).toBe(true);
    expect(storeCarries(bookshop, makeObj(TVal.PRAYER_BOOK))).toBe(true);
  });

  it("should reject swords at bookshop", () => {
    const bookshop = createStore(StoreType.BOOKSHOP);
    expect(storeCarries(bookshop, makeObj(TVal.SWORD))).toBe(false);
  });

  it("should accept most items at black market", () => {
    const bm = createStore(StoreType.BLACKMARKET);
    expect(storeCarries(bm, makeObj(TVal.SWORD))).toBe(true);
    expect(storeCarries(bm, makeObj(TVal.POTION))).toBe(true);
    expect(storeCarries(bm, makeObj(TVal.SOFT_ARMOR))).toBe(true);
    expect(storeCarries(bm, makeObj(TVal.MAGIC_BOOK))).toBe(true);
  });

  it("should accept magic items at magic shop", () => {
    const magic = createStore(StoreType.MAGIC);
    expect(storeCarries(magic, makeObj(TVal.RING))).toBe(true);
    expect(storeCarries(magic, makeObj(TVal.AMULET))).toBe(true);
    expect(storeCarries(magic, makeObj(TVal.WAND))).toBe(true);
    expect(storeCarries(magic, makeObj(TVal.STAFF))).toBe(true);
    expect(storeCarries(magic, makeObj(TVal.ROD))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Buy transaction tests
// ---------------------------------------------------------------------------

describe("storeBuy", () => {
  let store: ReturnType<typeof createStore>;
  let player: Player;

  beforeEach(() => {
    store = createStore(StoreType.WEAPON);
    player = makePlayer(10000);
  });

  it("should succeed when player can afford the item", () => {
    const obj = makeObj(TVal.SWORD, 100);
    store.stock.push(obj);

    const result = storeBuy(store, player, 0);
    expect(result.success).toBe(true);
    expect(result.price).toBeGreaterThan(0);
  });

  it("should deduct gold from player", () => {
    const obj = makeObj(TVal.SWORD, 100);
    store.stock.push(obj);
    const initialGold = player.au;

    const result = storeBuy(store, player, 0);
    expect(player.au).toBe(initialGold - result.price);
  });

  it("should remove item from store stock", () => {
    const obj = makeObj(TVal.SWORD, 100);
    store.stock.push(obj);

    storeBuy(store, player, 0);
    expect(store.stock.length).toBe(0);
  });

  it("should add item to player inventory", () => {
    const obj = makeObj(TVal.SWORD, 100);
    store.stock.push(obj);

    storeBuy(store, player, 0);
    expect(playerInventoryCount(player)).toBe(1);
  });

  it("should fail when player cannot afford the item", () => {
    const obj = makeObj(TVal.SWORD, 100000);
    store.stock.push(obj);
    player.au = 10;

    const result = storeBuy(store, player, 0);
    expect(result.success).toBe(false);
    expect(result.price).toBe(0);
    expect(player.au).toBe(10); // unchanged
    expect(store.stock.length).toBe(1); // still there
  });

  it("should fail with invalid item index", () => {
    const result = storeBuy(store, player, 0);
    expect(result.success).toBe(false);
  });

  it("should fail with negative index", () => {
    store.stock.push(makeObj(TVal.SWORD, 100));
    const result = storeBuy(store, player, -1);
    expect(result.success).toBe(false);
  });

  it("should fail when player inventory is full", () => {
    const obj = makeObj(TVal.SWORD, 10);
    store.stock.push(obj);

    // Fill inventory to max (23 items)
    for (let i = 0; i < 23; i++) {
      addToPlayerInventory(player, makeObj(TVal.POTION, 1));
    }

    const result = storeBuy(store, player, 0);
    expect(result.success).toBe(false);
    expect(store.stock.length).toBe(1); // item still in store
  });

  it("should fail for home store (use homeRetrieve instead)", () => {
    const home = createStore(StoreType.HOME);
    home.stock.push(makeObj(TVal.SWORD, 100));
    const result = storeBuy(home, player, 0);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sell transaction tests
// ---------------------------------------------------------------------------

describe("storeSell", () => {
  let store: ReturnType<typeof createStore>;
  let player: Player;

  beforeEach(() => {
    store = createStore(StoreType.WEAPON);
    player = makePlayer(100);
  });

  it("should succeed when selling an accepted item", () => {
    const obj = makeObj(TVal.SWORD, 200);
    addToPlayerInventory(player, obj);

    const result = storeSell(store, player, obj);
    expect(result.success).toBe(true);
    expect(result.price).toBeGreaterThan(0);
  });

  it("should add gold to player", () => {
    const obj = makeObj(TVal.SWORD, 200);
    addToPlayerInventory(player, obj);
    const initialGold = player.au;

    const result = storeSell(store, player, obj);
    expect(player.au).toBe(initialGold + result.price);
  });

  it("should remove item from player inventory", () => {
    const obj = makeObj(TVal.SWORD, 200);
    addToPlayerInventory(player, obj);

    storeSell(store, player, obj);
    expect(playerInventoryCount(player)).toBe(0);
  });

  it("should add item to store stock", () => {
    const obj = makeObj(TVal.SWORD, 200);
    addToPlayerInventory(player, obj);

    storeSell(store, player, obj);
    expect(store.stock.length).toBe(1);
  });

  it("should fail when store does not carry the item type", () => {
    const potion = makeObj(TVal.POTION, 100);
    addToPlayerInventory(player, potion);

    const result = storeSell(store, player, potion);
    expect(result.success).toBe(false);
    expect(playerInventoryCount(player)).toBe(1); // still has it
  });

  it("should fail when store is full", () => {
    // Fill the store
    for (let i = 0; i < DEFAULT_MAX_STOCK; i++) {
      store.stock.push(makeObj(TVal.SWORD, 100));
    }

    const obj = makeObj(TVal.SWORD, 200);
    addToPlayerInventory(player, obj);

    const result = storeSell(store, player, obj);
    expect(result.success).toBe(false);
  });

  it("should fail when item is not in player inventory", () => {
    const obj = makeObj(TVal.SWORD, 200);
    // Note: NOT added to player inventory

    const result = storeSell(store, player, obj);
    expect(result.success).toBe(false);
  });

  it("should fail for home store (use homeStore instead)", () => {
    const home = createStore(StoreType.HOME);
    const obj = makeObj(TVal.SWORD, 100);
    addToPlayerInventory(player, obj);

    const result = storeSell(home, player, obj);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Stock management tests
// ---------------------------------------------------------------------------

describe("initStoreStock", () => {
  it("should populate store with items", () => {
    const store = createStore(StoreType.WEAPON);
    const kinds = makeKindPool();
    const rng = makeRng();

    initStoreStock(store, 10, kinds, rng);
    expect(store.stock.length).toBeGreaterThan(0);
    expect(store.stock.length).toBeLessThanOrEqual(store.maxStock);
  });

  it("should not populate home", () => {
    const home = createStore(StoreType.HOME);
    const kinds = makeKindPool();
    const rng = makeRng();

    initStoreStock(home, 10, kinds, rng);
    expect(home.stock.length).toBe(0);
  });

  it("should only stock items the store carries", () => {
    const store = createStore(StoreType.WEAPON);
    const kinds = makeKindPool();
    const rng = makeRng();

    initStoreStock(store, 10, kinds, rng);

    for (const obj of store.stock) {
      expect(storeCarries(store, obj)).toBe(true);
    }
  });

  it("should not exceed max stock", () => {
    const store = createStore(StoreType.GENERAL);
    const kinds = makeKindPool();
    const rng = makeRng();

    // Run init multiple times to stress test
    initStoreStock(store, 50, kinds, rng);
    expect(store.stock.length).toBeLessThanOrEqual(store.maxStock);
  });
});

describe("storeMaintenance", () => {
  it("should change stock (remove old, add new)", () => {
    const store = createStore(StoreType.WEAPON);
    const kinds = makeKindPool();
    const rng = makeRng();

    // Initial stock
    initStoreStock(store, 10, kinds, rng);
    const initialCount = store.stock.length;
    expect(initialCount).toBeGreaterThan(0);

    // Take a snapshot
    const stockBefore = [...store.stock];

    // Maintain
    storeMaintenance(store, 10, kinds, rng);

    // Stock might have changed -- should still be within limits
    expect(store.stock.length).toBeLessThanOrEqual(store.maxStock);
    expect(store.stock.length).toBeGreaterThanOrEqual(0);

    // At least some items should have been swapped (probabilistic but
    // with turnover=4 and initial stock, the chance of zero changes is tiny)
    // We just verify the mechanism works without error
  });

  it("should not modify home", () => {
    const home = createStore(StoreType.HOME);
    home.stock.push(makeObj(TVal.SWORD, 100));
    const kinds = makeKindPool();
    const rng = makeRng();

    storeMaintenance(home, 10, kinds, rng);
    expect(home.stock.length).toBe(1); // unchanged
  });

  it("should work on empty store", () => {
    const store = createStore(StoreType.WEAPON);
    const kinds = makeKindPool();
    const rng = makeRng();

    // Should not throw
    storeMaintenance(store, 10, kinds, rng);
    expect(store.stock.length).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Home storage / retrieval tests
// ---------------------------------------------------------------------------

describe("homeStore", () => {
  let home: ReturnType<typeof createStore>;
  let player: Player;

  beforeEach(() => {
    home = createStore(StoreType.HOME);
    player = makePlayer();
  });

  it("should store item from player inventory to home", () => {
    const obj = makeObj(TVal.SWORD, 100);
    addToPlayerInventory(player, obj);

    const result = homeStore(home, player, obj);
    expect(result).toBe(true);
    expect(home.stock.length).toBe(1);
    expect(home.stock[0]).toBe(obj);
    expect(playerInventoryCount(player)).toBe(0);
  });

  it("should fail when home is full", () => {
    for (let i = 0; i < HOME_MAX_STOCK; i++) {
      home.stock.push(makeObj(TVal.POTION, 10));
    }

    const obj = makeObj(TVal.SWORD, 100);
    addToPlayerInventory(player, obj);

    const result = homeStore(home, player, obj);
    expect(result).toBe(false);
    expect(playerInventoryCount(player)).toBe(1); // still has it
  });

  it("should fail when item not in player inventory", () => {
    const obj = makeObj(TVal.SWORD, 100);
    const result = homeStore(home, player, obj);
    expect(result).toBe(false);
  });

  it("should fail when store is not home", () => {
    const weapon = createStore(StoreType.WEAPON);
    const obj = makeObj(TVal.SWORD, 100);
    addToPlayerInventory(player, obj);

    const result = homeStore(weapon, player, obj);
    expect(result).toBe(false);
  });

  it("should accept any item type", () => {
    const potion = makeObj(TVal.POTION, 100);
    const sword = makeObj(TVal.SWORD, 200);
    const food = makeObj(TVal.FOOD, 5);

    addToPlayerInventory(player, potion);
    addToPlayerInventory(player, sword);
    addToPlayerInventory(player, food);

    expect(homeStore(home, player, potion)).toBe(true);
    expect(homeStore(home, player, sword)).toBe(true);
    expect(homeStore(home, player, food)).toBe(true);
    expect(home.stock.length).toBe(3);
  });
});

describe("homeRetrieve", () => {
  let home: ReturnType<typeof createStore>;
  let player: Player;

  beforeEach(() => {
    home = createStore(StoreType.HOME);
    player = makePlayer();
  });

  it("should retrieve item from home to player inventory", () => {
    const obj = makeObj(TVal.SWORD, 100);
    home.stock.push(obj);

    const retrieved = homeRetrieve(home, player, 0);
    expect(retrieved).toBe(obj);
    expect(home.stock.length).toBe(0);
    expect(playerInventoryCount(player)).toBe(1);
  });

  it("should return null for invalid index", () => {
    expect(homeRetrieve(home, player, 0)).toBeNull();
    expect(homeRetrieve(home, player, -1)).toBeNull();
    expect(homeRetrieve(home, player, 99)).toBeNull();
  });

  it("should return null when player inventory is full", () => {
    for (let i = 0; i < 23; i++) {
      addToPlayerInventory(player, makeObj(TVal.POTION, 1));
    }

    const obj = makeObj(TVal.SWORD, 100);
    home.stock.push(obj);

    const retrieved = homeRetrieve(home, player, 0);
    expect(retrieved).toBeNull();
    expect(home.stock.length).toBe(1); // still in home
  });

  it("should return null for non-home store", () => {
    const weapon = createStore(StoreType.WEAPON);
    weapon.stock.push(makeObj(TVal.SWORD, 100));

    const retrieved = homeRetrieve(weapon, player, 0);
    expect(retrieved).toBeNull();
  });

  it("should retrieve correct item when multiple stored", () => {
    const obj1 = makeObj(TVal.SWORD, 100, "sword");
    const obj2 = makeObj(TVal.POTION, 50, "potion");
    const obj3 = makeObj(TVal.FOOD, 5, "food");
    home.stock.push(obj1, obj2, obj3);

    const retrieved = homeRetrieve(home, player, 1);
    expect(retrieved).toBe(obj2);
    expect(home.stock.length).toBe(2);
    // Remaining should be obj1 and obj3
    expect(home.stock[0]).toBe(obj1);
    expect(home.stock[1]).toBe(obj3);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("should handle buying when player has exact gold amount", () => {
    const store = createStore(StoreType.WEAPON);
    const obj = makeObj(TVal.SWORD, 100);
    store.stock.push(obj);

    // Price will be 110 (100 * 110%)
    const price = storeGetPrice(store, obj, false);
    const player = makePlayer(price);

    const result = storeBuy(store, player, 0);
    expect(result.success).toBe(true);
    expect(player.au).toBe(0);
  });

  it("should handle buying when player has one gold less than needed", () => {
    const store = createStore(StoreType.WEAPON);
    const obj = makeObj(TVal.SWORD, 100);
    store.stock.push(obj);

    const price = storeGetPrice(store, obj, false);
    const player = makePlayer(price - 1);

    const result = storeBuy(store, player, 0);
    expect(result.success).toBe(false);
  });

  it("should handle selling worthless items", () => {
    const store = createStore(StoreType.WEAPON);
    const obj = makeObj(TVal.SWORD, 0);
    const player = makePlayer(100);
    addToPlayerInventory(player, obj);

    const result = storeSell(store, player, obj);
    // Should succeed but with price 0
    expect(result.success).toBe(true);
    expect(result.price).toBe(0);
    expect(player.au).toBe(100); // unchanged
  });

  it("should handle multiple sequential buy/sell transactions", () => {
    const store = createStore(StoreType.WEAPON);
    const player = makePlayer(50000);

    // Stock the store
    for (let i = 0; i < 5; i++) {
      store.stock.push(makeObj(TVal.SWORD, 100, `sword_${i}`));
    }

    // Buy 3 items
    for (let i = 0; i < 3; i++) {
      const result = storeBuy(store, player, 0);
      expect(result.success).toBe(true);
    }
    expect(store.stock.length).toBe(2);
    expect(playerInventoryCount(player)).toBe(3);

    // Sell 2 back
    const inv = (player as any).inventory;
    storeSell(store, player, inv[0]);
    storeSell(store, player, inv[0]); // [0] again since splice shifted
    expect(store.stock.length).toBe(4);
    expect(playerInventoryCount(player)).toBe(1);
  });

  it("should handle empty kind pool for stock init", () => {
    const store = createStore(StoreType.WEAPON);
    const rng = makeRng();
    // Empty pool
    initStoreStock(store, 10, [], rng);
    expect(store.stock.length).toBe(0);
  });

  it("should handle kind pool with no matching items", () => {
    const store = createStore(StoreType.WEAPON);
    const rng = makeRng();
    // Only potions, but weapon store does not carry them
    const kinds = [makeKind({ tval: TVal.POTION, name: "Potion", cost: 50, allocProb: 10 })];
    initStoreStock(store, 10, kinds, rng);
    expect(store.stock.length).toBe(0);
  });
});
