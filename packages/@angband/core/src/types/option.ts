/**
 * @file types/option.ts
 * @brief Game option type definitions
 *
 * Port of option.h and list-options.h.
 *
 * Copyright (c) 1997 Ben Harrison
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

// ── Option categories ──

/** Option category types. Matches C `OP_*` enum in option.h. */
export const enum OptionCategory {
  INTERFACE = 0,
  BIRTH = 1,
  CHEAT = 2,
  SCORE = 3,
  SPECIAL = 4,
}

/** Total number of option categories. */
export const OP_MAX = 5;

// ── Option indexes ──

/**
 * Individual option indexes. Matches the order in list-options.h.
 * Used as indexes into `GameOptions.opt[]`.
 */
export const enum OptionIndex {
  NONE = 0,
  /** Use the roguelike command keyset. */
  ROGUE_LIKE_COMMANDS = 1,
  /** Use autoexplore commands. */
  AUTOEXPLORE_COMMANDS = 2,
  /** Use sound. */
  USE_SOUND = 3,
  /** Show damage player deals to monsters. */
  SHOW_DAMAGE = 4,
  /** Use old target by default. */
  USE_OLD_TARGET = 5,
  /** Always pickup items. */
  PICKUP_ALWAYS = 6,
  /** Always pickup items matching inventory. */
  PICKUP_INVEN = 7,
  /** Show flavors in object descriptions. */
  SHOW_FLAVORS = 8,
  /** Highlight target with cursor. */
  SHOW_TARGET = 9,
  /** Highlight player with cursor between turns. */
  HIGHLIGHT_PLAYER = 10,
  /** Disturb whenever viewable monster moves. */
  DISTURB_NEAR = 11,
  /** Show walls as solid blocks. */
  SOLID_WALLS = 12,
  /** Show walls with shaded background. */
  HYBRID_WALLS = 13,
  /** Illuminate torchlight in yellow. */
  VIEW_YELLOW_LIGHT = 14,
  /** Shimmer multi-colored things. */
  ANIMATE_FLICKER = 15,
  /** Center map continuously. */
  CENTER_PLAYER = 16,
  /** Show unique monsters in purple. */
  PURPLE_UNIQUES = 17,
  /** Automatically clear '-more-' prompts. */
  AUTO_MORE = 18,
  /** Player color indicates % hit points. */
  HP_CHANGES_COLOR = 19,
  /** Allow mouse clicks to move the player. */
  MOUSE_MOVEMENT = 20,
  /** Notify on object recharge. */
  NOTIFY_RECHARGE = 21,
  /** Show effective speed as multiplier. */
  EFFECTIVE_SPEED = 22,
  /** Cheat: Peek into monster creation. */
  CHEAT_HEAR = 23,
  /** Score: Peek into monster creation. */
  SCORE_HEAR = 24,
  /** Cheat: Peek into dungeon creation. */
  CHEAT_ROOM = 25,
  /** Score: Peek into dungeon creation. */
  SCORE_ROOM = 26,
  /** Cheat: Peek into something else. */
  CHEAT_XTRA = 27,
  /** Score: Peek into something else. */
  SCORE_XTRA = 28,
  /** Cheat: Allow player to avoid death. */
  CHEAT_LIVE = 29,
  /** Score: Allow player to avoid death. */
  SCORE_LIVE = 30,
  /** Generate a new, random artifact set. */
  BIRTH_RANDARTS = 31,
  /** Generate connected stairs. */
  BIRTH_CONNECT_STAIRS = 32,
  /** Force player descent (never make up stairs). */
  BIRTH_FORCE_DESCEND = 33,
  /** Word of Recall has no effect. */
  BIRTH_NO_RECALL = 34,
  /** Restrict creation of artifacts. */
  BIRTH_NO_ARTIFACTS = 35,
  /** Stack objects on the floor. */
  BIRTH_STACKING = 36,
  /** Lose artifacts when leaving level. */
  BIRTH_LOSE_ARTS = 37,
  /** Show level feelings. */
  BIRTH_FEELINGS = 38,
  /** Increase gold drops but disable selling. */
  BIRTH_NO_SELLING = 39,
  /** Start with a kit of useful gear. */
  BIRTH_START_KIT = 40,
  /** Monsters learn from their mistakes. */
  BIRTH_AI_LEARN = 41,
  /** Know all runes on birth. */
  BIRTH_KNOW_RUNES = 42,
  /** Know all flavors on birth. */
  BIRTH_KNOW_FLAVORS = 43,
  /** Persistent levels (experimental). */
  BIRTH_LEVELS_PERSIST = 44,
  /** To-damage is a percentage of dice (experimental). */
  BIRTH_PERCENT_DAMAGE = 45,
}

/** Total number of option indexes. */
export const OPT_MAX = 46;

// ── Default option values ──

/**
 * Default values for each option. Matches the `normal` column in list-options.h.
 * Indexed by OptionIndex.
 */
export const OPTION_DEFAULTS: readonly boolean[] = [
  /* NONE */                  false,
  /* ROGUE_LIKE_COMMANDS */   false,
  /* AUTOEXPLORE_COMMANDS */  false,
  /* USE_SOUND */             false,
  /* SHOW_DAMAGE */           false,
  /* USE_OLD_TARGET */        false,
  /* PICKUP_ALWAYS */         false,
  /* PICKUP_INVEN */          true,
  /* SHOW_FLAVORS */          false,
  /* SHOW_TARGET */           true,
  /* HIGHLIGHT_PLAYER */      false,
  /* DISTURB_NEAR */          true,
  /* SOLID_WALLS */           false,
  /* HYBRID_WALLS */          false,
  /* VIEW_YELLOW_LIGHT */     false,
  /* ANIMATE_FLICKER */       false,
  /* CENTER_PLAYER */         false,
  /* PURPLE_UNIQUES */        false,
  /* AUTO_MORE */             false,
  /* HP_CHANGES_COLOR */      true,
  /* MOUSE_MOVEMENT */        true,
  /* NOTIFY_RECHARGE */       false,
  /* EFFECTIVE_SPEED */       false,
  /* CHEAT_HEAR */            false,
  /* SCORE_HEAR */            false,
  /* CHEAT_ROOM */            false,
  /* SCORE_ROOM */            false,
  /* CHEAT_XTRA */            false,
  /* SCORE_XTRA */            false,
  /* CHEAT_LIVE */            false,
  /* SCORE_LIVE */            false,
  /* BIRTH_RANDARTS */        false,
  /* BIRTH_CONNECT_STAIRS */  true,
  /* BIRTH_FORCE_DESCEND */   false,
  /* BIRTH_NO_RECALL */       false,
  /* BIRTH_NO_ARTIFACTS */    false,
  /* BIRTH_STACKING */        true,
  /* BIRTH_LOSE_ARTS */       false,
  /* BIRTH_FEELINGS */        true,
  /* BIRTH_NO_SELLING */      true,
  /* BIRTH_START_KIT */       true,
  /* BIRTH_AI_LEARN */        true,
  /* BIRTH_KNOW_RUNES */      false,
  /* BIRTH_KNOW_FLAVORS */    false,
  /* BIRTH_LEVELS_PERSIST */  false,
  /* BIRTH_PERCENT_DAMAGE */  false,
];

/**
 * Category assignment for each option. Indexed by OptionIndex.
 */
export const OPTION_CATEGORIES: readonly OptionCategory[] = [
  /* NONE */                  OptionCategory.SPECIAL,
  /* ROGUE_LIKE_COMMANDS */   OptionCategory.INTERFACE,
  /* AUTOEXPLORE_COMMANDS */  OptionCategory.INTERFACE,
  /* USE_SOUND */             OptionCategory.INTERFACE,
  /* SHOW_DAMAGE */           OptionCategory.INTERFACE,
  /* USE_OLD_TARGET */        OptionCategory.INTERFACE,
  /* PICKUP_ALWAYS */         OptionCategory.INTERFACE,
  /* PICKUP_INVEN */          OptionCategory.INTERFACE,
  /* SHOW_FLAVORS */          OptionCategory.INTERFACE,
  /* SHOW_TARGET */           OptionCategory.INTERFACE,
  /* HIGHLIGHT_PLAYER */      OptionCategory.INTERFACE,
  /* DISTURB_NEAR */          OptionCategory.INTERFACE,
  /* SOLID_WALLS */           OptionCategory.INTERFACE,
  /* HYBRID_WALLS */          OptionCategory.INTERFACE,
  /* VIEW_YELLOW_LIGHT */     OptionCategory.INTERFACE,
  /* ANIMATE_FLICKER */       OptionCategory.INTERFACE,
  /* CENTER_PLAYER */         OptionCategory.INTERFACE,
  /* PURPLE_UNIQUES */        OptionCategory.INTERFACE,
  /* AUTO_MORE */             OptionCategory.INTERFACE,
  /* HP_CHANGES_COLOR */      OptionCategory.INTERFACE,
  /* MOUSE_MOVEMENT */        OptionCategory.INTERFACE,
  /* NOTIFY_RECHARGE */       OptionCategory.INTERFACE,
  /* EFFECTIVE_SPEED */       OptionCategory.INTERFACE,
  /* CHEAT_HEAR */            OptionCategory.CHEAT,
  /* SCORE_HEAR */            OptionCategory.SCORE,
  /* CHEAT_ROOM */            OptionCategory.CHEAT,
  /* SCORE_ROOM */            OptionCategory.SCORE,
  /* CHEAT_XTRA */            OptionCategory.CHEAT,
  /* SCORE_XTRA */            OptionCategory.SCORE,
  /* CHEAT_LIVE */            OptionCategory.CHEAT,
  /* SCORE_LIVE */            OptionCategory.SCORE,
  /* BIRTH_RANDARTS */        OptionCategory.BIRTH,
  /* BIRTH_CONNECT_STAIRS */  OptionCategory.BIRTH,
  /* BIRTH_FORCE_DESCEND */   OptionCategory.BIRTH,
  /* BIRTH_NO_RECALL */       OptionCategory.BIRTH,
  /* BIRTH_NO_ARTIFACTS */    OptionCategory.BIRTH,
  /* BIRTH_STACKING */        OptionCategory.BIRTH,
  /* BIRTH_LOSE_ARTS */       OptionCategory.BIRTH,
  /* BIRTH_FEELINGS */        OptionCategory.BIRTH,
  /* BIRTH_NO_SELLING */      OptionCategory.BIRTH,
  /* BIRTH_START_KIT */       OptionCategory.BIRTH,
  /* BIRTH_AI_LEARN */        OptionCategory.BIRTH,
  /* BIRTH_KNOW_RUNES */      OptionCategory.BIRTH,
  /* BIRTH_KNOW_FLAVORS */    OptionCategory.BIRTH,
  /* BIRTH_LEVELS_PERSIST */  OptionCategory.BIRTH,
  /* BIRTH_PERCENT_DAMAGE */  OptionCategory.BIRTH,
];

// ── Game options structure ──

/**
 * All game options for a player. Corresponds to C `struct player_options`.
 */
export interface GameOptions {
  /** Boolean option flags indexed by OptionIndex. Length = OPT_MAX. */
  opt: boolean[];

  /** Hitpoint warning threshold (0 to 9). Warn when HP% falls below this * 10%. */
  hitpointWarn: number;

  /** Delay in centiseconds before lazy movement allows another keypress. */
  lazymoveDelay: number;

  /** Display delay factor (0 to 9). Controls animation speed. */
  delayFactor: number;

  /** Numeric suffix appended to player name for disambiguation. */
  nameSuffix: number;
}

/**
 * Metadata for a single option entry.
 */
export interface OptionDescriptor {
  /** Option index (OptionIndex value). */
  readonly index: OptionIndex;
  /** Internal name (snake_case, matches C identifier). */
  readonly name: string;
  /** Human-readable description. */
  readonly description: string;
  /** Option category. */
  readonly category: OptionCategory;
  /** Default value. */
  readonly defaultValue: boolean;
}

/** Maximum option page visible in the options UI (excludes score page). */
export const OPT_PAGE_MAX = OptionCategory.SCORE;

/** Index of the birth options page. */
export const OPT_PAGE_BIRTH = 1;
