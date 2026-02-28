/**
 * @file game/state.ts
 * @brief Game state management
 *
 * Central game state container, message log, and state initialization.
 * Combines information from game-world.c (turn, depth, running/resting)
 * with the event bus for UI notification.
 *
 * Copyright (c) 1997 Ben Harrison, James E. Wilson, Robert A. Koeneke
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Player } from "../types/player.js";
import type { Chunk } from "../types/cave.js";
import type { Monster, MonsterRace } from "../types/monster.js";
import type { ObjectKind, Artifact, EgoItem, Brand, Slay } from "../types/object.js";
import type { Store } from "../store/store.js";
import type { RNG } from "../z/rand.js";
import { EventBus, GameEventType } from "./event.js";

// ── Message types ──

/**
 * Category of a game message, for filtering and styling.
 */
export const enum MessageType {
  /** General information. */
  GENERIC = 0,
  /** Combat-related messages. */
  COMBAT = 1,
  /** Magic/spell messages. */
  MAGIC = 2,
  /** Monster-related messages. */
  MONSTER = 3,
  /** Item-related messages. */
  ITEM = 4,
  /** Urgent / critical messages. */
  URGENT = 5,
}

// ── Game message ──

/**
 * A single message in the game message log.
 */
export interface GameMessage {
  /** The message text. */
  readonly text: string;
  /** The category of this message. */
  readonly type: MessageType;
  /** The game turn when this message was generated. */
  readonly turn: number;
}

// ── Game state ──

/** Default maximum number of messages stored in the ring buffer. */
export const DEFAULT_MAX_MESSAGES = 2048;

/**
 * Complete game state. Mutable — modified in place during the game loop.
 *
 * Combines information from various C globals (turn, player, cave)
 * into a single coherent state object.
 */
export interface GameState {
  /** The player character. */
  player: Player;
  /** Current dungeon level (chunk). */
  chunk: Chunk;
  /** Current dungeon depth (0 = town). */
  depth: number;
  /** Current game turn counter. */
  turn: number;
  /** Whether the game loop is currently running. */
  running: boolean;
  /** Number of rest turns remaining (0 = not resting). */
  resting: number;
  /** Whether the player is dead. */
  dead: boolean;
  /** Whether the player has won the game. */
  won: boolean;
  /** Message log (ring buffer). */
  messages: GameMessage[];
  /** Maximum number of messages to retain. */
  maxMessages: number;
  /** Event bus for decoupling game logic from UI. */
  eventBus: EventBus;
  /** The random number generator. */
  rng: RNG;
  /** Live monster instances on the current level. */
  monsters: Monster[];
  /** All loaded monster race templates (for dungeon generation). */
  monsterRaces: readonly MonsterRace[];
  /** All loaded object kind templates (for item generation). */
  objectKinds: readonly ObjectKind[];
  /** All loaded artifact definitions. */
  artifacts: readonly Artifact[];
  /** All loaded ego item templates. */
  egoItems: readonly EgoItem[];
  /** All loaded brand definitions. */
  brands: readonly Brand[];
  /** All loaded slay definitions. */
  slays: readonly Slay[];
  /** Town store instances. */
  stores: Store[];
}

/** Options for creating a new GameState. */
export interface CreateGameStateOptions {
  player: Player;
  chunk: Chunk;
  rng: RNG;
  maxMessages?: number;
  monsterRaces?: readonly MonsterRace[];
  objectKinds?: readonly ObjectKind[];
  artifacts?: readonly Artifact[];
  egoItems?: readonly EgoItem[];
  brands?: readonly Brand[];
  slays?: readonly Slay[];
  stores?: Store[];
}

/**
 * Create and initialize a new game state.
 *
 * Accepts either the new options object or the legacy positional arguments
 * for backwards compatibility.
 */
export function createGameState(
  playerOrOpts: Player | CreateGameStateOptions,
  chunk?: Chunk,
  rng?: RNG,
  maxMessages: number = DEFAULT_MAX_MESSAGES,
  monsterRaces: readonly MonsterRace[] = [],
): GameState {
  // Support both call signatures
  let opts: CreateGameStateOptions;
  if ("player" in playerOrOpts && "chunk" in playerOrOpts && "rng" in playerOrOpts) {
    opts = playerOrOpts as CreateGameStateOptions;
  } else {
    opts = {
      player: playerOrOpts as Player,
      chunk: chunk!,
      rng: rng!,
      maxMessages,
      monsterRaces,
    };
  }

  return {
    player: opts.player,
    chunk: opts.chunk,
    depth: opts.chunk.depth,
    turn: 0,
    running: false,
    resting: 0,
    dead: false,
    won: false,
    messages: [],
    maxMessages: opts.maxMessages ?? DEFAULT_MAX_MESSAGES,
    eventBus: new EventBus(),
    rng: opts.rng,
    monsters: opts.chunk.monsters ?? [],
    monsterRaces: opts.monsterRaces ?? [],
    objectKinds: opts.objectKinds ?? [],
    artifacts: opts.artifacts ?? [],
    egoItems: opts.egoItems ?? [],
    brands: opts.brands ?? [],
    slays: opts.slays ?? [],
    stores: opts.stores ?? [],
  };
}

/**
 * Add a message to the game message log.
 *
 * Messages are stored in a ring buffer: when the buffer exceeds maxMessages,
 * the oldest messages are discarded. After adding the message, a MESSAGE
 * event is emitted on the event bus.
 *
 * @param state - The current game state.
 * @param text - The message text.
 * @param type - The message category (defaults to GENERIC).
 */
export function addMessage(
  state: GameState,
  text: string,
  type: MessageType = MessageType.GENERIC,
): void {
  const message: GameMessage = {
    text,
    type,
    turn: state.turn,
  };

  state.messages.push(message);

  // Ring buffer: trim from the front if we exceed the max
  if (state.messages.length > state.maxMessages) {
    state.messages.splice(0, state.messages.length - state.maxMessages);
  }

  // Notify the UI that a new message is available
  state.eventBus.emit(GameEventType.MESSAGE, message);
}

/**
 * Get the most recent messages from the game log.
 *
 * @param state - The current game state.
 * @param count - Maximum number of messages to return.
 * @returns An array of the most recent messages, newest last.
 */
export function getRecentMessages(
  state: GameState,
  count: number,
): GameMessage[] {
  if (count <= 0) return [];
  const start = Math.max(0, state.messages.length - count);
  return state.messages.slice(start);
}
