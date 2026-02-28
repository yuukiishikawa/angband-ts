/**
 * @file monster/index.ts
 * @brief Monster layer barrel export
 *
 * Monster creation, movement AI, lore, combat, spells, and timed effects.
 */

export {
  // Spawn point helpers
  isValidSpawnPoint,
  findSpawnPoint,

  // Monster creation
  createMonster,

  // Monster placement
  placeNewMonster,

  // Race selection
  pickMonsterRace,

  // Group placement
  placeMonsterGroup,

  // Monster deletion
  deleteMonster,
} from "./make.js";

export {
  // Types
  type MonsterAction,

  // Movement validation
  monsterCanMove,

  // Pathfinding
  monsterFindPath,

  // Movement execution
  monsterMove,

  // Main AI decision
  monsterTakeTurn,

  // Multiplication
  monsterMultiply,
} from "./move.js";

export {
  // Lore creation
  createLore,

  // Lore updates
  updateLoreOnSight,
  updateLoreOnKill,
  updateLoreOnAttack,

  // Lore queries
  loreFlagKnown,
} from "./lore.js";

export {
  // Monster melee combat
  type StatusEffect,
  type BlowEffectResult,
  type AttackResult,
  testHit,
  chanceOfMonsterHitBase,
  adjustDamArmor,
  monsterCritical,
  calculateBlowDamage,
  resolveBlowMethod,
  resolveBlowEffect,
  monsterAttackPlayer,
} from "./attack.js";

export {
  // Monster spell casting
  type SpellCastResult,
  monsterSpellFailrate,
  monsterHasSpell,
  isBreathSpell,
  isSummonSpell,
  isInnateSpell,
  isDamageSpell,
  isBoltSpell,
  isBallSpell,
  breathDamage,
  getSpellDamage,
  monsterChooseSpell,
  monsterCastSpell,
} from "./spell.js";

export {
  // Monster timed effects
  STUN_HIT_REDUCTION,
  STUN_DAM_REDUCTION,
  CONF_HIT_REDUCTION,
  setMonsterTimedEffect,
  incMonsterTimedEffect,
  decMonsterTimedEffect,
  clearMonsterTimedEffect,
  monsterEffectLevel,
  monsterIsConfused,
  monsterIsAsleep,
  monsterIsAfraid,
  monsterIsStunned,
  monsterIsHeld,
  monsterIsSlowed,
  monsterIsHasted,
} from "./timed.js";
