/**
 * @file types/index.ts
 * @brief Type definitions barrel export
 *
 * Re-exports all game-level type definitions (interfaces, enums, type aliases).
 * Other type modules will be added here as they are created.
 */

export {
  // Branded ID types
  type MonsterId,
  type ObjectId,
  type FeatureId,
  type TrapId,

  // Flag enums
  SquareFlag,
  TerrainFlag,
  Feat,
  GridLightLevel,
  Direction,

  // Generation enums
  AllocSet,
  AllocType,

  // Core data structures
  type Square,
  type Heatmap,
  type Connector,
  type Chunk,
  type FeatureType,
  type GridData,
} from "./cave.js";

export * from "./monster.js";
export * from "./player.js";
export * from "./option.js";

export {
  // Branded ID types (ObjectId from cave, MonsterRaceId from monster — not re-exported here)
  type ObjectKindId,
  type ArtifactId,
  type EgoItemId,
  type SVal,
  type ActivationId,
  type FlavorId,

  // Const enums
  Element,
  TVal,
  ObjectFlag,
  KindFlag,
  ObjectModifier,
  ObjectFlagType,
  ObjectFlagId,
  ObjPropertyType,
  ObjectOrigin,
  ElementInfoFlag,
  ObjectNotice,

  // Boundary constants
  ELEM_BASE_MIN,
  ELEM_BASE_MAX,
  ELEM_HIGH_MIN,
  ELEM_HIGH_MAX,
  OBJ_MOD_MIN_STAT,

  // Interfaces and supporting types
  type Effect,
  type Brand,
  type Slay,
  type Curse,
  type CurseData,
  type Activation,
  type ObjProperty,
  type Flavor,
  type ChestTrap,
  type ObjectBase,
  type ObjectKind,
  type Artifact,
  type ArtifactUpkeep,
  type PossItem,
  type EgoItem,
  type ObjectType,
} from "./object.js";
