/**
 * @file store/store.ts
 * @brief Store/shop system
 *
 * Port of store.c / store.h -- haggle-free store mechanics for buying,
 * selling, pricing, stock management, and the player's home.
 *
 * Copyright (c) 1997 Robert A. Koeneke, James E. Wilson, Ben Harrison
 * Copyright (c) 2007 Andi Sidwell
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { ObjectType, ObjectKind } from "../types/index.js";
import { TVal } from "../types/index.js";
import type { Player } from "../types/index.js";
import { BitFlag, type RNG } from "../z/index.js";

// ---------------------------------------------------------------------------
// Store types (matching Angband's 9 store types)
// ---------------------------------------------------------------------------

/** Store type identifiers. Matches store.txt ordering. */
export const enum StoreType {
  GENERAL = 0,
  ARMORY = 1,
  WEAPON = 2,
  TEMPLE = 3,
  ALCHEMY = 4,
  MAGIC = 5,
  BLACKMARKET = 6,
  HOME = 7,
  BOOKSHOP = 8,
}

/** Total number of store types. */
export const STORE_TYPE_MAX = 9;

// ---------------------------------------------------------------------------
// Store owner
// ---------------------------------------------------------------------------

/** A store owner with a name and spending limit. */
export interface StoreOwner {
  /** Display name of the store owner. */
  readonly name: string;
  /** Maximum amount the owner will pay for a single item. */
  readonly maxCost: number;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/** Default maximum stock for most stores. */
export const DEFAULT_MAX_STOCK = 24;

/** Maximum slots in the player's home. */
export const HOME_MAX_STOCK = 24;

/** A store instance. */
export interface Store {
  /** What kind of store this is. */
  readonly type: StoreType;
  /** Display name. */
  readonly name: string;
  /** Current stock of items. */
  stock: ObjectType[];
  /** Maximum number of items this store can hold. */
  readonly maxStock: number;
  /** Current owner. */
  owner: StoreOwner;
  /** Owner's purse limit (shortcut for owner.maxCost). */
  readonly purse: number;
  /** Number of items to turn over during maintenance. */
  readonly turnover: number;
}

// ---------------------------------------------------------------------------
// Transaction results
// ---------------------------------------------------------------------------

/** Result of a buy transaction. */
export interface BuyResult {
  /** Whether the purchase succeeded. */
  readonly success: boolean;
  /** The price paid (0 if failed). */
  readonly price: number;
  /** A human-readable message describing the outcome. */
  readonly message: string;
}

/** Result of a sell transaction. */
export interface SellResult {
  /** Whether the sale succeeded. */
  readonly success: boolean;
  /** The price received (0 if failed). */
  readonly price: number;
  /** A human-readable message describing the outcome. */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Store name table
// ---------------------------------------------------------------------------

/** Default store names indexed by StoreType. */
const STORE_NAMES: Record<number, string> = {
  [StoreType.GENERAL]: "General Store",
  [StoreType.ARMORY]: "Armory",
  [StoreType.WEAPON]: "Weapon Smiths",
  [StoreType.TEMPLE]: "Temple",
  [StoreType.ALCHEMY]: "Alchemy Shop",
  [StoreType.MAGIC]: "Magic Shop",
  [StoreType.BLACKMARKET]: "Black Market",
  [StoreType.HOME]: "Your Home",
  [StoreType.BOOKSHOP]: "Bookstore",
};

/** Default store owners indexed by StoreType. */
const DEFAULT_OWNERS: Record<number, StoreOwner> = {
  [StoreType.GENERAL]: { name: "Bilbo the Friendly", maxCost: 5000 },
  [StoreType.ARMORY]: { name: "Kon-Dar the Ugly", maxCost: 10000 },
  [StoreType.WEAPON]: { name: "Odo the Miser", maxCost: 25000 },
  [StoreType.TEMPLE]: { name: "Ludwig the Humble", maxCost: 15000 },
  [StoreType.ALCHEMY]: { name: "Gagrin Fireblade", maxCost: 10000 },
  [StoreType.MAGIC]: { name: "Ariel the Sorceress", maxCost: 20000 },
  [StoreType.BLACKMARKET]: { name: "Gary Gygax", maxCost: 30000 },
  [StoreType.HOME]: { name: "You", maxCost: 0 },
  [StoreType.BOOKSHOP]: { name: "Randolph Carter", maxCost: 15000 },
};

// ---------------------------------------------------------------------------
// Markup / markdown tables
// ---------------------------------------------------------------------------

/**
 * Buy markup factor (percentage the store charges above base value).
 * Higher = more expensive for the player.
 */
const BUY_MARKUP: Record<number, number> = {
  [StoreType.GENERAL]: 130,
  [StoreType.ARMORY]: 110,
  [StoreType.WEAPON]: 110,
  [StoreType.TEMPLE]: 110,
  [StoreType.ALCHEMY]: 110,
  [StoreType.MAGIC]: 110,
  [StoreType.BLACKMARKET]: 150,
  [StoreType.HOME]: 100,
  [StoreType.BOOKSHOP]: 110,
};

/**
 * Sell markdown factor (percentage of base value the store pays).
 * Lower = less gold for the player.
 */
const SELL_MARKDOWN: Record<number, number> = {
  [StoreType.GENERAL]: 50,
  [StoreType.ARMORY]: 75,
  [StoreType.WEAPON]: 75,
  [StoreType.TEMPLE]: 75,
  [StoreType.ALCHEMY]: 75,
  [StoreType.MAGIC]: 75,
  [StoreType.BLACKMARKET]: 50,
  [StoreType.HOME]: 100,
  [StoreType.BOOKSHOP]: 75,
};

// ---------------------------------------------------------------------------
// Store carries table  (which TVal categories a store accepts)
// ---------------------------------------------------------------------------

/**
 * TVal sets that each store type will buy or stock.
 * This approximates the C store buy-lists from store.txt.
 */
const STORE_TVALS: Record<number, ReadonlySet<TVal>> = {
  [StoreType.GENERAL]: new Set<TVal>([
    TVal.FOOD,
    TVal.MUSHROOM,
    TVal.LIGHT,
    TVal.FLASK,
    TVal.DIGGING,
    TVal.CLOAK,
    TVal.SHOT,
    TVal.ARROW,
    TVal.BOLT,
  ]),
  [StoreType.ARMORY]: new Set<TVal>([
    TVal.BOOTS,
    TVal.GLOVES,
    TVal.HELM,
    TVal.CROWN,
    TVal.SHIELD,
    TVal.CLOAK,
    TVal.SOFT_ARMOR,
    TVal.HARD_ARMOR,
    TVal.DRAG_ARMOR,
  ]),
  [StoreType.WEAPON]: new Set<TVal>([
    TVal.SWORD,
    TVal.HAFTED,
    TVal.POLEARM,
    TVal.BOW,
    TVal.SHOT,
    TVal.ARROW,
    TVal.BOLT,
    TVal.DIGGING,
  ]),
  [StoreType.TEMPLE]: new Set<TVal>([
    TVal.SCROLL,
    TVal.POTION,
    TVal.PRAYER_BOOK,
    TVal.HAFTED,
  ]),
  [StoreType.ALCHEMY]: new Set<TVal>([TVal.SCROLL, TVal.POTION]),
  [StoreType.MAGIC]: new Set<TVal>([
    TVal.RING,
    TVal.AMULET,
    TVal.WAND,
    TVal.STAFF,
    TVal.ROD,
    TVal.MAGIC_BOOK,
    TVal.SCROLL,
    TVal.POTION,
  ]),
  // Black market buys almost everything
  [StoreType.BLACKMARKET]: new Set<TVal>([
    TVal.SWORD,
    TVal.HAFTED,
    TVal.POLEARM,
    TVal.BOW,
    TVal.SHOT,
    TVal.ARROW,
    TVal.BOLT,
    TVal.DIGGING,
    TVal.BOOTS,
    TVal.GLOVES,
    TVal.HELM,
    TVal.CROWN,
    TVal.SHIELD,
    TVal.CLOAK,
    TVal.SOFT_ARMOR,
    TVal.HARD_ARMOR,
    TVal.DRAG_ARMOR,
    TVal.LIGHT,
    TVal.AMULET,
    TVal.RING,
    TVal.STAFF,
    TVal.WAND,
    TVal.ROD,
    TVal.SCROLL,
    TVal.POTION,
    TVal.FLASK,
    TVal.FOOD,
    TVal.MUSHROOM,
    TVal.MAGIC_BOOK,
    TVal.PRAYER_BOOK,
    TVal.NATURE_BOOK,
    TVal.SHADOW_BOOK,
    TVal.OTHER_BOOK,
  ]),
  // Home accepts everything
  [StoreType.HOME]: new Set<TVal>(),
  [StoreType.BOOKSHOP]: new Set<TVal>([
    TVal.MAGIC_BOOK,
    TVal.PRAYER_BOOK,
    TVal.NATURE_BOOK,
    TVal.SHADOW_BOOK,
    TVal.OTHER_BOOK,
  ]),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create an empty store of the given type.
 */
export function createStore(type: StoreType): Store {
  const owner = DEFAULT_OWNERS[type] ?? { name: "Unknown", maxCost: 5000 };
  return {
    type,
    name: STORE_NAMES[type] ?? "Store",
    stock: [],
    maxStock: type === StoreType.HOME ? HOME_MAX_STOCK : DEFAULT_MAX_STOCK,
    owner,
    purse: owner.maxCost,
    turnover: type === StoreType.HOME ? 0 : 4,
  };
}

/**
 * Get the base value of an object for store pricing purposes.
 *
 * Uses the object's kind cost plus bonuses.  This is a simplified version
 * of `object_value` in the C source.  For objects whose kind is null the
 * value is 0.
 */
export function objectBaseValue(obj: ObjectType): number {
  if (!obj.kind) return 0;
  let value = obj.kind.cost;

  // Bonus for combat enchantments
  if (obj.toH > 0) value += obj.toH * 10;
  if (obj.toD > 0) value += obj.toD * 10;
  if (obj.toA > 0) value += obj.toA * 10;

  // Artifacts and ego items are worth more
  if (obj.artifact) value = Math.max(value, obj.artifact.cost);
  if (obj.ego) value += obj.ego.cost;

  return Math.max(0, value);
}

/**
 * Calculate the price of a single item in a store context.
 *
 * @param store  - The store instance.
 * @param obj    - The item being priced.
 * @param selling - `true` when the player is selling TO the store
 *                  (store is buying); `false` when the player is buying
 *                  FROM the store (store is selling).
 * @returns The calculated price (always >= 1 for valued items, 0 for
 *          worthless items when selling).
 */
export function storeGetPrice(
  store: Store,
  obj: ObjectType,
  selling: boolean,
): number {
  // Home has no pricing
  if (store.type === StoreType.HOME) return 0;

  const baseValue = objectBaseValue(obj);

  // Worthless items
  if (baseValue <= 0) {
    return selling ? 0 : 1;
  }

  let price: number;

  if (selling) {
    // Player sells to store -- store pays a markdown
    const markdown = SELL_MARKDOWN[store.type] ?? 50;
    price = Math.floor((baseValue * markdown) / 100);

    // Cap at the owner's purse limit
    if (price > store.owner.maxCost) {
      price = store.owner.maxCost;
    }
  } else {
    // Player buys from store -- store charges a markup
    const markup = BUY_MARKUP[store.type] ?? 130;
    price = Math.floor((baseValue * markup) / 100);
  }

  // Never free for non-worthless items
  if (price <= 0) price = 1;

  return price;
}

/**
 * Check whether a store type carries (or would buy) a given item.
 *
 * The home accepts everything.
 */
export function storeCarries(store: Store, obj: ObjectType): boolean {
  // Home accepts everything
  if (store.type === StoreType.HOME) return true;

  const tvals = STORE_TVALS[store.type];
  if (!tvals) return false;

  return tvals.has(obj.tval);
}

/**
 * Player buys an item from the store.
 *
 * @param store     - The store selling the item.
 * @param player    - The player buying.
 * @param itemIndex - Index into store.stock.
 * @returns BuyResult with success/failure and the price paid.
 */
export function storeBuy(
  store: Store,
  player: Player,
  itemIndex: number,
): BuyResult {
  // Home has no buying -- use homeRetrieve instead
  if (store.type === StoreType.HOME) {
    return { success: false, price: 0, message: "Use home retrieval instead." };
  }

  // Validate index
  if (itemIndex < 0 || itemIndex >= store.stock.length) {
    return { success: false, price: 0, message: "Invalid item index." };
  }

  const obj = store.stock[itemIndex]!;
  const price = storeGetPrice(store, obj, false);

  // Check if the player can afford it
  if (player.au < price) {
    return {
      success: false,
      price: 0,
      message: `You cannot afford that (${price} gold required, you have ${player.au}).`,
    };
  }

  // Check if player inventory is full
  const pGear = player as PlayerWithGear;
  ensureInventory(pGear);
  if (pGear.inventory.length >= MAX_PLAYER_INVENTORY) {
    return {
      success: false,
      price: 0,
      message: "Your inventory is full.",
    };
  }

  // Execute the transaction
  player.au -= price;
  store.stock.splice(itemIndex, 1);
  pGear.inventory.push(obj);

  return {
    success: true,
    price,
    message: `You bought ${obj.kind?.name ?? "an item"} for ${price} gold.`,
  };
}

/**
 * Player sells an item to the store.
 *
 * @param store  - The store buying the item.
 * @param player - The player selling.
 * @param obj    - The object being sold (must be in the player's inventory).
 * @returns SellResult with success/failure and the price received.
 */
export function storeSell(
  store: Store,
  player: Player,
  obj: ObjectType,
): SellResult {
  // Home has no selling -- use homeStore instead
  if (store.type === StoreType.HOME) {
    return {
      success: false,
      price: 0,
      message: "Use home storage instead.",
    };
  }

  // Check if this store carries this kind of item
  if (!storeCarries(store, obj)) {
    return {
      success: false,
      price: 0,
      message: "The store does not buy that kind of item.",
    };
  }

  // Check if the store has room
  if (store.stock.length >= store.maxStock) {
    return {
      success: false,
      price: 0,
      message: "The store is full.",
    };
  }

  const price = storeGetPrice(store, obj, true);

  // Remove from player's inventory
  const pGear = player as PlayerWithGear;
  ensureInventory(pGear);
  const idx = pGear.inventory.indexOf(obj);
  if (idx === -1) {
    return {
      success: false,
      price: 0,
      message: "Item not found in your inventory.",
    };
  }

  pGear.inventory.splice(idx, 1);
  player.au += price;
  store.stock.push(obj);

  return {
    success: true,
    price,
    message: `You sold ${obj.kind?.name ?? "an item"} for ${price} gold.`,
  };
}

/**
 * Populate a store's initial inventory from a set of object kinds.
 *
 * @param store - The store to populate.
 * @param depth - Dungeon level for item generation (affects quality).
 * @param kinds - Pool of available object kinds to select from.
 * @param rng   - Random number generator.
 */
export function initStoreStock(
  store: Store,
  depth: number,
  kinds: readonly ObjectKind[],
  rng: RNG,
): void {
  // Home starts empty
  if (store.type === StoreType.HOME) return;

  // Filter kinds to those this store would carry
  const validKinds = kinds.filter((k) => {
    const tvals = STORE_TVALS[store.type];
    if (!tvals) return false;
    return tvals.has(k.tval) && k.allocProb > 0 && k.level <= depth + 10;
  });

  if (validKinds.length === 0) return;

  // Stock between half and full capacity
  const targetStock = Math.max(
    1,
    Math.floor(store.maxStock / 2) + rng.randint0(Math.floor(store.maxStock / 2) + 1),
  );

  for (let i = 0; i < targetStock && store.stock.length < store.maxStock; i++) {
    const kind = validKinds[rng.randint0(validKinds.length)]!;
    const obj = createStoreObject(kind);
    store.stock.push(obj);
  }
}

/**
 * Perform store maintenance: remove some old items and add new ones.
 *
 * @param store - The store to maintain.
 * @param depth - Dungeon level for new items.
 * @param kinds - Pool of available object kinds.
 * @param rng   - Random number generator.
 */
export function storeMaintenance(
  store: Store,
  depth: number,
  kinds: readonly ObjectKind[],
  rng: RNG,
): void {
  // Home never has maintenance
  if (store.type === StoreType.HOME) return;

  const turnover = store.turnover;

  // Remove some items
  const removeCount = Math.min(turnover, store.stock.length);
  for (let i = 0; i < removeCount; i++) {
    const idx = rng.randint0(store.stock.length);
    store.stock.splice(idx, 1);
  }

  // Add some new items
  const validKinds = kinds.filter((k) => {
    const tvals = STORE_TVALS[store.type];
    if (!tvals) return false;
    return tvals.has(k.tval) && k.allocProb > 0 && k.level <= depth + 10;
  });

  if (validKinds.length === 0) return;

  const addCount = Math.min(
    turnover,
    store.maxStock - store.stock.length,
  );

  for (let i = 0; i < addCount; i++) {
    const kind = validKinds[rng.randint0(validKinds.length)]!;
    const obj = createStoreObject(kind);
    store.stock.push(obj);
  }
}

/**
 * Store an item in the player's home.
 *
 * @param store  - The home store.
 * @param player - The player.
 * @param obj    - The item to stash.
 */
export function homeStore(
  store: Store,
  player: Player,
  obj: ObjectType,
): boolean {
  if (store.type !== StoreType.HOME) return false;

  if (store.stock.length >= store.maxStock) return false;

  // Remove from player inventory
  const pGear = player as PlayerWithGear;
  ensureInventory(pGear);
  const idx = pGear.inventory.indexOf(obj);
  if (idx === -1) return false;

  pGear.inventory.splice(idx, 1);
  store.stock.push(obj);
  return true;
}

/**
 * Retrieve an item from the player's home.
 *
 * @param store  - The home store.
 * @param player - The player.
 * @param index  - Index of the item in home stock.
 * @returns The retrieved object, or null if the operation failed.
 */
export function homeRetrieve(
  store: Store,
  player: Player,
  index: number,
): ObjectType | null {
  if (store.type !== StoreType.HOME) return null;

  if (index < 0 || index >= store.stock.length) return null;

  // Check if player inventory is full
  const pGear = player as PlayerWithGear;
  ensureInventory(pGear);
  if (pGear.inventory.length >= MAX_PLAYER_INVENTORY) return null;

  const obj = store.stock[index]!;
  store.stock.splice(index, 1);
  pGear.inventory.push(obj);
  return obj;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Matches MAX_INVENTORY_SIZE from gear.ts. */
const MAX_PLAYER_INVENTORY = 23;

/**
 * Extended Player with mutable inventory array.
 * Mirrors the PlayerWithGear pattern from gear.ts.
 */
interface PlayerWithGear extends Player {
  inventory: ObjectType[];
}

function ensureInventory(p: PlayerWithGear): void {
  if (!p.inventory) {
    p.inventory = [];
  }
}

/**
 * Create a minimal store-quality object from a kind template.
 *
 * In the full game this would call makeObject / applyMagic; here we
 * produce a lightweight item sufficient for store mechanics.
 */
function createStoreObject(kind: ObjectKind): ObjectType {
  return {
    kind,
    ego: null,
    artifact: null,
    prev: null,
    next: null,
    known: null,
    oidx: 0 as any,
    grid: { x: 0, y: 0 },
    tval: kind.tval,
    sval: kind.sval,
    pval: 0,
    weight: kind.weight,
    dd: kind.dd,
    ds: kind.ds,
    ac: kind.ac,
    toA: 0,
    toH: 0,
    toD: 0,
    flags: new BitFlag(39),
    modifiers: new Array(16).fill(0),
    elInfo: [],
    brands: null,
    slays: null,
    curses: null,
    effect: kind.effect,
    effectMsg: kind.effectMsg,
    activation: kind.activation,
    time: kind.time,
    timeout: 0,
    number: 1,
    notice: 0,
    heldMIdx: 0,
    mimickingMIdx: 0,
    origin: 16 as any, // ObjectOrigin.STORE
    originDepth: 0,
    originRace: null,
    note: 0,
  } as ObjectType;
}
