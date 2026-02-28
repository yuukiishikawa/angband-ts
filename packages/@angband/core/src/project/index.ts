/**
 * @file project/index.ts
 * @brief Projectile system barrel export
 *
 * Re-exports all projection-related functions and types.
 */

export {
  // Main projection engine
  project,
  calculateProjectionPath,
  calculateBallArea,
  calculateArcArea,
  calculateBeamArea,
  setProjectFeatureTable,
  angbandDistance,

  // Flag enum
  ProjectFlag,

  // Types
  type ProjectResult,
  type ProjectionPath,
  type MonsterHit,
} from "./project.js";

export {
  projectFeature,
  type FeatResult,
} from "./feat.js";

export {
  projectMonster,
  type MonsterProjectResult,
} from "./monster.js";

export {
  projectPlayer,
  type PlayerProjectResult,
} from "./player.js";
