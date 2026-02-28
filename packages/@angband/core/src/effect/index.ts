/**
 * @file effect/index.ts
 * @brief Barrel export for the effect system
 *
 * Importing this module will register all effect handlers via
 * side-effects in the attack and general modules.
 */

export {
  EffectType,
  type EffectSource,
  type EffectContext,
  type EffectResult,
  type EffectHandler,
  registerHandler,
  executeEffect,
  executeEffectChain,
  successResult,
  failResult,
  damageResult,
  calculateValue,
} from "./handler.js";

// Import sub-modules for handler registration side-effects
export {
  effectDamage,
  effectBolt,
  effectBeam,
  effectBall,
  effectBreath,
  effectDrainLife,
  effectDrainStat,
  effectDrainMana,
  effectStar,
} from "./attack.js";

export {
  effectHeal,
  effectNourish,
  effectRestoreStat,
  effectCure,
  effectTimedInc,
  effectTimedDec,
  effectTeleport,
  effectDetectTraps,
  effectDetectDoors,
  effectDetectMonsters,
  effectDetectObjects,
  effectMapArea,
  effectLightArea,
  effectDarkenArea,
  effectIdentify,
  effectRecall,
  effectHaste,
  effectSlow,
  effectRestoreExp,
  effectRestoreMana,
} from "./general.js";
