/**
 * @file player/index.ts
 * @brief Player layer barrel export
 *
 * Player systems: character creation, stat calculations, timed effects,
 * spell casting, and utility functions.
 */

export { rollStats, rollHP, createPlayer } from "./birth.js";

export {
  modifyStatValue,
  adjStatToIndex,
  calcBonuses,
  calcMeleeBonus,
  calcRangedBonus,
  calcAC,
  calcSpeed,
  calcHP,
  calcMana,
  calcBlows,
  calcStatBonusDam,
  calcStatBonusHitDex,
  calcStatBonusHitStr,
  calcStatBonusAC,
  adjStrTd,
  adjDexTh,
  adjStrHold,
  adjStrBlow,
} from "./calcs.js";

export {
  // Timed effect data types
  type TimedEffectGrade,
  type TimedEffectData,
  type TimedEffectResult,
  TMD_FLAG_NONSTACKING,

  // Food constants
  PY_FOOD_MAX,
  PY_FOOD_FULL,
  PY_FOOD_HUNGRY,
  PY_FOOD_WEAK,
  PY_FOOD_FAINT,
  PY_FOOD_STARVE,

  // Timed effect operations
  setTimedEffect,
  incTimedEffect,
  decTimedEffect,
  clearTimedEffect,
  clearAllTimedEffects,
  playerHasTimedEffect,
  getTimedEffectDuration,
  playerTimedGradeEq,

  // Data management
  setTimedEffectData,
  getTimedEffectData,
} from "./timed.js";

export {
  // Spell result type
  type SpellResult,

  // Spell lookup
  spellByIndex,

  // Casting stat helper
  getCastingStat,

  // Failure chance
  spellFailChance,

  // Availability checks
  spellIsLearned,
  canCastSpell,
  canStudySpell,

  // Casting and learning
  castSpell,
  learnSpell,

  // Spell lists
  getAvailableSpells,
  getStudyableSpells,
} from "./spell.js";

export {
  // Experience table
  PLAYER_EXP,
  expForLevel,
  expForPlayerLevel,

  // LOS checks
  playerHasLOS,
  playerCanSee,

  // Race checks
  playerOfRace,

  // Flag checks
  playerHasFlag,

  // Stat adjustments
  adjustStatByRace,
  adjustStatByRaceAndClass,
} from "./util.js";
