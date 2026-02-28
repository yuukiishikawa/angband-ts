/**
 * @file command/index.ts
 * @brief Command layer barrel export
 *
 * Core dispatcher, movement, combat, spellcasting, and item usage commands.
 */

// ── Core dispatcher ──

export {
  // Constants
  STANDARD_ENERGY,

  // Enums
  CommandType,

  // Types
  type CommandResult,
  type GameCommand,

  // Result helpers
  successResult,
  failResult,

  // Command info
  COMMAND_INFO,
  commandVerb,

  // Main dispatcher
  executeCommand,
} from "./core.js";

// ── Movement ──

export {
  // Direction utilities
  directionOffset,
  isValidDirection,

  // Movement commands
  cmdWalk,
  cmdRun,
  cmdOpen,
  cmdClose,
  cmdTunnel,
  cmdDisarm,
  cmdSearch,
  cmdGoUp,
  cmdGoDown,
} from "./movement.js";

// ── Combat ──

export {
  // Attack result type
  type AttackResult,

  // Hit chance calculations
  chanceOfMeleeHitBase,
  chanceOfMeleeHit,
  playerMeleeHit,
  calculatePlayerDamage,
  chanceOfMissileHitBase,

  // Combat resolution
  playerAttackMonster,

  // Combat commands
  cmdAttack,
  cmdFire,
  cmdThrow,
} from "./combat.js";

// ── Magic (from existing module) ──

export {
  type SpellInfo,
  type BrowseResult,

  cmdCast,
  cmdStudy,
  cmdBrowse,
} from "./magic.js";

// ── Items (from existing module) ──

export {
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
