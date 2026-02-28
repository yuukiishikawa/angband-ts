/**
 * @file object/pile.ts
 * @brief Object pile management (stacking, floor piles)
 *
 * Port of obj-pile.c — linked-list piles of objects with stacking support.
 * Piles live on dungeon floor squares and are also used for monster inventories.
 *
 * In TypeScript we use a doubly-linked list through ObjectType.prev/next,
 * matching the C implementation. The ObjectPile interface tracks the head
 * of the list and provides a count cache for O(1) size queries.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { ObjectType, ObjectKind } from "../types/index.js";
import { TVal, ObjectFlag, Element } from "../types/index.js";

// ---------------------------------------------------------------------------
// ObjectPile interface
// ---------------------------------------------------------------------------

/**
 * A pile (collection) of objects at a single location.
 *
 * Objects in the pile are connected via their `prev`/`next` fields
 * (doubly-linked list). The pile keeps a reference to the head object
 * and a cached count for convenience.
 */
export interface ObjectPile {
  /** Head of the linked list (first item in the pile). */
  head: ObjectType | null;
  /** Number of distinct object stacks in the pile. */
  count: number;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new, empty object pile.
 */
export function createPile(): ObjectPile {
  return { head: null, count: 0 };
}

// ---------------------------------------------------------------------------
// Add / Insert
// ---------------------------------------------------------------------------

/**
 * Add an object to the front of a pile.
 *
 * The object must not already belong to another pile (its prev/next should
 * be null). This is equivalent to C `pile_insert`.
 */
export function pileAdd(pile: ObjectPile, obj: ObjectType): void {
  // Detach the object from any previous linkage
  obj.prev = null;
  obj.next = null;

  if (pile.head) {
    obj.next = pile.head;
    pile.head.prev = obj;
  }

  pile.head = obj;
  pile.count++;
}

/**
 * Add an object to the end of a pile.
 *
 * Equivalent to C `pile_insert_end`.
 */
export function pileAddEnd(pile: ObjectPile, obj: ObjectType): void {
  obj.prev = null;
  obj.next = null;

  if (!pile.head) {
    pile.head = obj;
  } else {
    let last: ObjectType = pile.head;
    while (last.next) {
      last = last.next;
    }
    last.next = obj;
    obj.prev = last;
  }

  pile.count++;
}

// ---------------------------------------------------------------------------
// Remove / Excise
// ---------------------------------------------------------------------------

/**
 * Remove a specific object from the pile.
 *
 * Returns `true` if the object was found and removed, `false` otherwise.
 * Equivalent to C `pile_excise`.
 */
export function pileRemove(pile: ObjectPile, obj: ObjectType): boolean {
  if (!pileContains(pile, obj)) return false;

  const prev = obj.prev;
  const next = obj.next;

  if (pile.head === obj) {
    pile.head = next;
  }

  if (prev) {
    prev.next = next;
  }

  if (next) {
    next.prev = prev;
  }

  obj.prev = null;
  obj.next = null;
  pile.count--;

  return true;
}

// ---------------------------------------------------------------------------
// Contains / Count
// ---------------------------------------------------------------------------

/**
 * Check whether the pile contains a specific object (by reference).
 */
export function pileContains(pile: ObjectPile, obj: ObjectType): boolean {
  let current = pile.head;
  while (current) {
    if (current === obj) return true;
    current = current.next;
  }
  return false;
}

/**
 * Return the number of distinct object stacks in the pile.
 */
export function pileCount(pile: ObjectPile): number {
  return pile.count;
}

// ---------------------------------------------------------------------------
// Stacking  (port of object_similar / object_stackable / object_mergeable)
// ---------------------------------------------------------------------------

/**
 * Determine if two objects can be stacked (combined into one stack).
 *
 * Objects stack if they have the same kind, same bonuses, same flags,
 * same ego, neither is an artifact, neither is a chest, and their
 * element info matches.
 *
 * This is a simplified port of `object_similar` from obj-pile.c.
 */
export function canStack(a: ObjectType, b: ObjectType): boolean {
  // Must not be the same object
  if (a === b) return false;

  // Must have identical kinds
  if (a.kind !== b.kind) return false;
  if (!a.kind) return false;

  // Artifacts never stack
  if (a.artifact || b.artifact) return false;

  // Chests never stack
  if (a.tval === TVal.CHEST) return false;

  // Different flags do not stack
  if (!a.flags.isEqual(b.flags)) return false;

  // Different element info does not stack
  for (let i = 0; i < Element.MAX; i++) {
    const aEl = a.elInfo[i];
    const bEl = b.elInfo[i];
    if (aEl && bEl) {
      if (aEl.resLevel !== bEl.resLevel) return false;
    }
  }

  // For weapons, armor, jewelry, lights: require identical stats
  if (
    tvalIsWeapon(a.tval) ||
    tvalIsArmor(a.tval) ||
    tvalIsJewelry(a.tval) ||
    a.tval === TVal.LIGHT
  ) {
    if (a.ac !== b.ac) return false;
    if (a.dd !== b.dd) return false;
    if (a.ds !== b.ds) return false;
    if (a.toH !== b.toH) return false;
    if (a.toD !== b.toD) return false;
    if (a.toA !== b.toA) return false;
    if (a.ego !== b.ego) return false;

    // Never stack recharging wearables (except lights)
    if ((a.timeout || b.timeout) && a.tval !== TVal.LIGHT) return false;

    // Lights must have same fuel
    if (a.tval === TVal.LIGHT && a.timeout !== b.timeout) return false;

    // Require identical modifiers
    for (let i = 0; i < a.modifiers.length; i++) {
      if ((a.modifiers[i] ?? 0) !== (b.modifiers[i] ?? 0)) return false;
    }
  }

  // Wands/staves: charges must not overflow (MAX_PVAL = 32767)
  if (tvalCanHaveCharges(a.tval)) {
    if (a.pval + b.pval > 32767) return false;
  }

  // Compatible inscriptions (both have none, or same)
  if (a.note && b.note && a.note !== b.note) return false;

  return true;
}

/**
 * Try to merge an object into an existing item in the pile (stacking).
 *
 * If a compatible item is found, increases its `number` count by `obj.number`
 * (up to the kind's max_stack) and returns `true`. The caller should then
 * discard / free `obj`.
 *
 * Returns `false` if no compatible item was found.
 */
export function pileMerge(pile: ObjectPile, obj: ObjectType): boolean {
  let current = pile.head;
  while (current) {
    if (canStack(current, obj)) {
      const maxStack = current.kind?.base?.maxStack ?? 40;
      const total = current.number + obj.number;
      current.number = Math.min(total, maxStack);

      // Merge charges for staves/wands
      if (current.kind && tvalCanHaveCharges(current.tval)) {
        current.pval = Math.min(current.pval + obj.pval, 32767);
      }

      // Merge rod timeouts
      if (current.tval === TVal.ROD) {
        current.timeout += obj.timeout;
      }

      // Prefer a non-zero inscription
      if (obj.note && !current.note) {
        current.note = obj.note;
      }

      return true;
    }
    current = current.next;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Iterator
// ---------------------------------------------------------------------------

/**
 * Iterate over all objects in a pile.
 */
export function* pileIterator(pile: ObjectPile): IterableIterator<ObjectType> {
  let current = pile.head;
  while (current) {
    // Capture next before yielding in case the caller modifies the list
    const next = current.next;
    yield current;
    current = next;
  }
}

// ---------------------------------------------------------------------------
// Last item helper
// ---------------------------------------------------------------------------

/**
 * Return the last item in the pile, or null if empty.
 */
export function pileLastItem(pile: ObjectPile): ObjectType | null {
  if (!pile.head) return null;
  let obj: ObjectType = pile.head;
  while (obj.next) {
    obj = obj.next;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Internal TVal helpers (duplicated from desc.ts to avoid circular deps)
// ---------------------------------------------------------------------------

function tvalIsWeapon(tval: TVal): boolean {
  return (
    tval === TVal.SWORD ||
    tval === TVal.HAFTED ||
    tval === TVal.POLEARM ||
    tval === TVal.DIGGING ||
    tval === TVal.BOW
  );
}

function tvalIsArmor(tval: TVal): boolean {
  return (
    tval === TVal.BOOTS ||
    tval === TVal.GLOVES ||
    tval === TVal.HELM ||
    tval === TVal.CROWN ||
    tval === TVal.SHIELD ||
    tval === TVal.CLOAK ||
    tval === TVal.SOFT_ARMOR ||
    tval === TVal.HARD_ARMOR ||
    tval === TVal.DRAG_ARMOR
  );
}

function tvalIsJewelry(tval: TVal): boolean {
  return tval === TVal.RING || tval === TVal.AMULET;
}

function tvalCanHaveCharges(tval: TVal): boolean {
  return tval === TVal.STAFF || tval === TVal.WAND;
}
