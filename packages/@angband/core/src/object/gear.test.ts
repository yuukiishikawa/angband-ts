/**
 * Tests for object/gear.ts — Equipment and inventory management.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { BitFlag } from "../z/index.js";
import type { ObjectType, ObjectKind, ObjectBase, Player } from "../types/index.js";
import {
  TVal,
  KindFlag,
  ObjectFlag,
  ObjectModifier,
  EquipSlot,
} from "../types/index.js";
import {
  MAX_INVENTORY_SIZE,
  findEquipSlotForItem,
  getEquippedItem,
  equipItem,
  unequipItem,
  addToInventory,
  removeFromInventory,
  getInventoryItem,
  inventoryIsFull,
  inventoryCount,
} from "./gear.js";

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
  return {
    name: "Test Sword",
    text: "",
    base: makeBase(),
    kidx: 1 as any,
    tval: TVal.SWORD,
    sval: 1 as any,
    pval: { base: 0, dice: 0, sides: 0, mBonus: 0 } as any,
    toH: { base: 0, dice: 0, sides: 0, mBonus: 0 } as any,
    toD: { base: 0, dice: 0, sides: 0, mBonus: 0 } as any,
    toA: { base: 0, dice: 0, sides: 0, mBonus: 0 } as any,
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
    allocProb: 0,
    allocMin: 0,
    allocMax: 0,
    level: 0,
    activation: null,
    effect: null,
    power: 0,
    effectMsg: null,
    visMsg: null,
    time: { base: 0, dice: 0, sides: 0, mBonus: 0 } as any,
    charge: { base: 0, dice: 0, sides: 0, mBonus: 0 } as any,
    genMultProb: 0,
    stackSize: { base: 1, dice: 0, sides: 0, mBonus: 0 } as any,
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

function makeObj(tval: TVal, name = "test"): ObjectType {
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
    time: { base: 0, dice: 0, sides: 0, mBonus: 0 } as any,
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

/** Create a minimal Player for testing. The gear functions extend it with equipment/inventory. */
function makePlayer(): Player {
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
    au: 0,
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

// ---------------------------------------------------------------------------
// findEquipSlotForItem tests
// ---------------------------------------------------------------------------

describe("findEquipSlotForItem", () => {
  it("should return WEAPON for swords", () => {
    expect(findEquipSlotForItem(makeObj(TVal.SWORD))).toBe(EquipSlot.WEAPON);
  });

  it("should return WEAPON for hafted weapons", () => {
    expect(findEquipSlotForItem(makeObj(TVal.HAFTED))).toBe(EquipSlot.WEAPON);
  });

  it("should return WEAPON for polearms", () => {
    expect(findEquipSlotForItem(makeObj(TVal.POLEARM))).toBe(EquipSlot.WEAPON);
  });

  it("should return WEAPON for digging tools", () => {
    expect(findEquipSlotForItem(makeObj(TVal.DIGGING))).toBe(EquipSlot.WEAPON);
  });

  it("should return BOW for bows", () => {
    expect(findEquipSlotForItem(makeObj(TVal.BOW))).toBe(EquipSlot.BOW);
  });

  it("should return RING for rings", () => {
    expect(findEquipSlotForItem(makeObj(TVal.RING))).toBe(EquipSlot.RING);
  });

  it("should return AMULET for amulets", () => {
    expect(findEquipSlotForItem(makeObj(TVal.AMULET))).toBe(EquipSlot.AMULET);
  });

  it("should return LIGHT for light sources", () => {
    expect(findEquipSlotForItem(makeObj(TVal.LIGHT))).toBe(EquipSlot.LIGHT);
  });

  it("should return BODY_ARMOR for soft armor", () => {
    expect(findEquipSlotForItem(makeObj(TVal.SOFT_ARMOR))).toBe(EquipSlot.BODY_ARMOR);
  });

  it("should return BODY_ARMOR for hard armor", () => {
    expect(findEquipSlotForItem(makeObj(TVal.HARD_ARMOR))).toBe(EquipSlot.BODY_ARMOR);
  });

  it("should return BODY_ARMOR for dragon armor", () => {
    expect(findEquipSlotForItem(makeObj(TVal.DRAG_ARMOR))).toBe(EquipSlot.BODY_ARMOR);
  });

  it("should return CLOAK for cloaks", () => {
    expect(findEquipSlotForItem(makeObj(TVal.CLOAK))).toBe(EquipSlot.CLOAK);
  });

  it("should return SHIELD for shields", () => {
    expect(findEquipSlotForItem(makeObj(TVal.SHIELD))).toBe(EquipSlot.SHIELD);
  });

  it("should return HAT for helms", () => {
    expect(findEquipSlotForItem(makeObj(TVal.HELM))).toBe(EquipSlot.HAT);
  });

  it("should return HAT for crowns", () => {
    expect(findEquipSlotForItem(makeObj(TVal.CROWN))).toBe(EquipSlot.HAT);
  });

  it("should return GLOVES for gloves", () => {
    expect(findEquipSlotForItem(makeObj(TVal.GLOVES))).toBe(EquipSlot.GLOVES);
  });

  it("should return BOOTS for boots", () => {
    expect(findEquipSlotForItem(makeObj(TVal.BOOTS))).toBe(EquipSlot.BOOTS);
  });

  it("should return null for non-equippable items", () => {
    expect(findEquipSlotForItem(makeObj(TVal.FOOD))).toBeNull();
    expect(findEquipSlotForItem(makeObj(TVal.POTION))).toBeNull();
    expect(findEquipSlotForItem(makeObj(TVal.SCROLL))).toBeNull();
    expect(findEquipSlotForItem(makeObj(TVal.GOLD))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Equipment tests
// ---------------------------------------------------------------------------

describe("equipment management", () => {
  let player: Player;

  beforeEach(() => {
    player = makePlayer();
  });

  it("should equip an item successfully", () => {
    const sword = makeObj(TVal.SWORD);
    const result = equipItem(player, sword, EquipSlot.WEAPON);
    expect(result.success).toBe(true);
    expect(result.previousItem).toBeNull();
  });

  it("should return the equipped item", () => {
    const sword = makeObj(TVal.SWORD);
    equipItem(player, sword, EquipSlot.WEAPON);
    expect(getEquippedItem(player, EquipSlot.WEAPON)).toBe(sword);
  });

  it("should return null for empty slot", () => {
    expect(getEquippedItem(player, EquipSlot.WEAPON)).toBeNull();
  });

  it("should return previous item when replacing", () => {
    const sword1 = makeObj(TVal.SWORD, "sword1");
    const sword2 = makeObj(TVal.SWORD, "sword2");
    equipItem(player, sword1, EquipSlot.WEAPON);
    const result = equipItem(player, sword2, EquipSlot.WEAPON);
    expect(result.success).toBe(true);
    expect(result.previousItem).toBe(sword1);
    expect(getEquippedItem(player, EquipSlot.WEAPON)).toBe(sword2);
  });

  it("should unequip an item", () => {
    const sword = makeObj(TVal.SWORD);
    equipItem(player, sword, EquipSlot.WEAPON);
    const removed = unequipItem(player, EquipSlot.WEAPON);
    expect(removed).toBe(sword);
    expect(getEquippedItem(player, EquipSlot.WEAPON)).toBeNull();
  });

  it("should return null when unequipping empty slot", () => {
    const removed = unequipItem(player, EquipSlot.WEAPON);
    expect(removed).toBeNull();
  });

  it("should reject EquipSlot.NONE", () => {
    const sword = makeObj(TVal.SWORD);
    const result = equipItem(player, sword, EquipSlot.NONE);
    expect(result.success).toBe(false);
  });

  it("should equip multiple different slots independently", () => {
    const sword = makeObj(TVal.SWORD);
    const shield = makeObj(TVal.SHIELD);
    const boots = makeObj(TVal.BOOTS);

    equipItem(player, sword, EquipSlot.WEAPON);
    equipItem(player, shield, EquipSlot.SHIELD);
    equipItem(player, boots, EquipSlot.BOOTS);

    expect(getEquippedItem(player, EquipSlot.WEAPON)).toBe(sword);
    expect(getEquippedItem(player, EquipSlot.SHIELD)).toBe(shield);
    expect(getEquippedItem(player, EquipSlot.BOOTS)).toBe(boots);
  });
});

// ---------------------------------------------------------------------------
// Inventory tests
// ---------------------------------------------------------------------------

describe("inventory management", () => {
  let player: Player;

  beforeEach(() => {
    player = makePlayer();
  });

  it("should start with empty inventory", () => {
    expect(inventoryCount(player)).toBe(0);
    expect(inventoryIsFull(player)).toBe(false);
  });

  it("should add an item to inventory", () => {
    const potion = makeObj(TVal.POTION);
    expect(addToInventory(player, potion)).toBe(true);
    expect(inventoryCount(player)).toBe(1);
  });

  it("should retrieve item by index", () => {
    const potion = makeObj(TVal.POTION);
    addToInventory(player, potion);
    expect(getInventoryItem(player, 0)).toBe(potion);
  });

  it("should return null for out of range index", () => {
    expect(getInventoryItem(player, 0)).toBeNull();
    expect(getInventoryItem(player, -1)).toBeNull();
    expect(getInventoryItem(player, 100)).toBeNull();
  });

  it("should remove item from inventory", () => {
    const potion = makeObj(TVal.POTION);
    addToInventory(player, potion);
    const removed = removeFromInventory(player, 0);
    expect(removed).toBe(potion);
    expect(inventoryCount(player)).toBe(0);
  });

  it("should return null when removing invalid index", () => {
    expect(removeFromInventory(player, 0)).toBeNull();
    expect(removeFromInventory(player, -1)).toBeNull();
  });

  it("should report full when at max capacity", () => {
    for (let i = 0; i < MAX_INVENTORY_SIZE; i++) {
      expect(addToInventory(player, makeObj(TVal.POTION))).toBe(true);
    }
    expect(inventoryIsFull(player)).toBe(true);
  });

  it("should refuse to add when full", () => {
    for (let i = 0; i < MAX_INVENTORY_SIZE; i++) {
      addToInventory(player, makeObj(TVal.POTION));
    }
    expect(addToInventory(player, makeObj(TVal.POTION))).toBe(false);
    expect(inventoryCount(player)).toBe(MAX_INVENTORY_SIZE);
  });

  it("should allow adding after removing an item", () => {
    for (let i = 0; i < MAX_INVENTORY_SIZE; i++) {
      addToInventory(player, makeObj(TVal.POTION));
    }
    removeFromInventory(player, 0);
    expect(addToInventory(player, makeObj(TVal.SCROLL))).toBe(true);
  });
});
