/**
 * @file object/gear.ts
 * @brief Equipment and inventory management
 *
 * Port of obj-gear.c — functions for equipping items, managing the inventory
 * (backpack), and querying equipment slots.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 * Copyright (c) 2014 Nick McConnell
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { ObjectType, ObjectKind } from "../types/index.js";
import type { Player } from "../types/index.js";
import { TVal, EquipSlot } from "../types/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of inventory (backpack) slots. Matches z_info->pack_size. */
export const MAX_INVENTORY_SIZE = 23;

// ---------------------------------------------------------------------------
// EquipResult
// ---------------------------------------------------------------------------

/** Result of attempting to equip an item. */
export interface EquipResult {
  /** Whether the item was successfully equipped. */
  readonly success: boolean;
  /** The item that was previously in the slot, if any (returned to inventory). */
  readonly previousItem: ObjectType | null;
  /** Descriptive message about what happened. */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// TVal -> EquipSlot mapping  (port of wield_slot)
// ---------------------------------------------------------------------------

/**
 * Determine which equipment slot an object should go in, based on its tval.
 *
 * Returns `null` if the item cannot be equipped.
 */
export function findEquipSlotForItem(obj: ObjectType): EquipSlot | null {
  switch (obj.tval) {
    case TVal.BOW:
      return EquipSlot.BOW;
    case TVal.AMULET:
      return EquipSlot.AMULET;
    case TVal.CLOAK:
      return EquipSlot.CLOAK;
    case TVal.SHIELD:
      return EquipSlot.SHIELD;
    case TVal.GLOVES:
      return EquipSlot.GLOVES;
    case TVal.BOOTS:
      return EquipSlot.BOOTS;
    case TVal.LIGHT:
      return EquipSlot.LIGHT;
    case TVal.RING:
      return EquipSlot.RING;

    // Melee weapons
    case TVal.SWORD:
    case TVal.HAFTED:
    case TVal.POLEARM:
    case TVal.DIGGING:
      return EquipSlot.WEAPON;

    // Body armor
    case TVal.SOFT_ARMOR:
    case TVal.HARD_ARMOR:
    case TVal.DRAG_ARMOR:
      return EquipSlot.BODY_ARMOR;

    // Head armor
    case TVal.HELM:
    case TVal.CROWN:
      return EquipSlot.HAT;

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Equipment access
// ---------------------------------------------------------------------------

/**
 * Get the item currently equipped in a given slot.
 *
 * The player's equipment is stored as an array indexed by EquipSlot.
 */
export function getEquippedItem(
  player: Player,
  slot: EquipSlot,
): ObjectType | null {
  const equipment = (player as PlayerWithGear).equipment;
  if (!equipment) return null;
  return equipment[slot] ?? null;
}

/**
 * Equip an item in the appropriate slot.
 *
 * If the slot is already occupied, the previous item is unequipped
 * and returned as part of the result (caller is responsible for adding
 * it to inventory or dropping it).
 */
export function equipItem(
  player: Player,
  obj: ObjectType,
  slot: EquipSlot,
): EquipResult {
  const p = player as PlayerWithGear;
  ensureEquipment(p);

  if (slot === EquipSlot.NONE) {
    return { success: false, previousItem: null, message: "Invalid slot." };
  }

  const prev = p.equipment[slot] ?? null;
  p.equipment[slot] = obj;

  if (prev) {
    return {
      success: true,
      previousItem: prev,
      message: `You remove the previous item and equip the new one.`,
    };
  }

  return {
    success: true,
    previousItem: null,
    message: "Item equipped.",
  };
}

/**
 * Unequip an item from a slot, returning it.
 *
 * Returns `null` if the slot was already empty.
 */
export function unequipItem(
  player: Player,
  slot: EquipSlot,
): ObjectType | null {
  const p = player as PlayerWithGear;
  ensureEquipment(p);

  const item = p.equipment[slot] ?? null;
  if (item) {
    p.equipment[slot] = null;
  }
  return item;
}

// ---------------------------------------------------------------------------
// Inventory (backpack) management
// ---------------------------------------------------------------------------

/**
 * Add an object to the player's inventory (backpack).
 *
 * Returns `true` if the item was added, `false` if the inventory is full.
 */
export function addToInventory(
  player: Player,
  obj: ObjectType,
): boolean {
  const p = player as PlayerWithGear;
  ensureInventory(p);

  // Reuse a null slot left by removeFromInventory (stable slot indices)
  for (let i = 0; i < p.inventory.length; i++) {
    if (p.inventory[i] == null) {
      p.inventory[i] = obj;
      return true;
    }
  }

  if (p.inventory.length >= MAX_INVENTORY_SIZE) {
    return false;
  }

  p.inventory.push(obj);
  return true;
}

/**
 * Remove an object from the inventory by index.
 *
 * Returns the removed object, or `null` if the index is out of range.
 */
export function removeFromInventory(
  player: Player,
  index: number,
): ObjectType | null {
  const p = player as PlayerWithGear;
  ensureInventory(p);

  if (index < 0 || index >= p.inventory.length) {
    return null;
  }

  const removed = p.inventory[index]!;
  // Set slot to null instead of splice to keep stable slot indices.
  // C borg references items by slot index, and splice would shift all
  // subsequent items, causing slot mismatch on the next INVEN frame.
  (p.inventory as (ObjectType | null)[])[index] = null;
  return removed ?? null;
}

/**
 * Get the inventory item at a given index.
 */
export function getInventoryItem(
  player: Player,
  index: number,
): ObjectType | null {
  const p = player as PlayerWithGear;
  ensureInventory(p);

  if (index < 0 || index >= p.inventory.length) {
    return null;
  }
  return p.inventory[index] ?? null;
}

/**
 * Check whether the player's inventory is full.
 */
export function inventoryIsFull(player: Player): boolean {
  const p = player as PlayerWithGear;
  ensureInventory(p);
  // Check for null slots (freed by removeFromInventory)
  if (p.inventory.some((item) => item == null)) return false;
  return p.inventory.length >= MAX_INVENTORY_SIZE;
}

/**
 * Return the current number of items in the inventory.
 */
export function inventoryCount(player: Player): number {
  const p = player as PlayerWithGear;
  ensureInventory(p);
  return p.inventory.filter((item) => item != null).length;
}

// ---------------------------------------------------------------------------
// Internal helpers for Player extension
// ---------------------------------------------------------------------------

/**
 * Extended Player interface with mutable equipment and inventory arrays.
 * The Player type definition doesn't include these directly — they are
 * runtime extensions managed by the gear module.
 */
interface PlayerWithGear extends Player {
  equipment: (ObjectType | null)[];
  inventory: ObjectType[];
}

function ensureEquipment(p: PlayerWithGear): void {
  if (!p.equipment) {
    // Initialise an array with one slot per EquipSlot (12 total, index 0 = NONE is unused).
    p.equipment = new Array<ObjectType | null>(12).fill(null);
  }
}

function ensureInventory(p: PlayerWithGear): void {
  if (!p.inventory) {
    p.inventory = [];
  }
}
