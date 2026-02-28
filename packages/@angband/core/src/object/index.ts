/**
 * @file object/index.ts
 * @brief Object layer barrel export
 *
 * Object description, gear management, and pile system.
 */

export {
  // Description
  DescMode,
  nameFormat,
  objectDescName,
  objectDescBase,
  objectDescModifiers,
  objectDescInscrip,
} from "./desc.js";

export {
  // Gear / equipment / inventory
  MAX_INVENTORY_SIZE,
  type EquipResult,
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

export {
  // Pile system
  type ObjectPile,
  createPile,
  pileAdd,
  pileAddEnd,
  pileRemove,
  pileContains,
  pileCount,
  canStack,
  pileMerge,
  pileIterator,
  pileLastItem,
} from "./pile.js";

export {
  // Slay / brand damage
  type SlayResult,
  findBestMultiplier,
  applySlayBrand,
} from "./slays.js";

export {
  // Rune identification / knowledge
  RuneCategory,
  type PlayerKnowledge,
  createPlayerKnowledge,
  learnRune,
  runeIsKnown,
  learnObjectRunes,
  identifyObject,
  learnWieldRunes,
  objectIsFullyKnown,
  objectPropertyIsKnown,
} from "./knowledge.js";
