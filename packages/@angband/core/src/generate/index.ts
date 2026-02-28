/**
 * @file generate/index.ts
 * @brief Dungeon generation barrel export
 *
 * Top-level dungeon generation, room builders, tunnel carving, and population.
 */

export {
  // Main generation
  generateDungeon,
  type DungeonConfig,
  DEFAULT_DUNGEON_CONFIG,
} from "./generate.js";

export {
  // Room types and builders
  RoomType,
  type RoomTemplate,
  type Room,
  generateSimpleRoom,
  generateOverlappingRoom,
  generateCrossRoom,
  generateCircularRoom,
  generateLargeRoom,
  placeRoom,
  generateVaultRoom,
  pickVault,
  generatePitRoom,
  generateNestRoom,
  pickPit,
  filterPitRaces,
} from "./room.js";

export {
  // Tunnel carving
  digTunnel,
} from "./tunnel.js";

export {
  // Population (monsters, objects, stairs, traps)
  populateMonsters,
  populateObjects,
  placeStairs,
  placeTraps,
} from "./populate.js";

export {
  // Town generation
  generateTown,
} from "./town.js";
