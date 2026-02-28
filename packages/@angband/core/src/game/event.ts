/**
 * @file game/event.ts
 * @brief Game event system — decouples game logic from UI
 *
 * Port of game-event.c / game-event.h — allows the registering of handlers
 * to be told about game events.
 *
 * Copyright (c) 2007 Antony Sidwell
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

// ── Event types ──

/**
 * The various events we can send signals about.
 *
 * Matches the game_event_type enum in game-event.h.
 */
export const enum GameEventType {
  /** Some part of the map has changed. */
  MAP = 0,
  /** One or more of the stats. */
  STATS = 1,
  /** HP or MaxHP. */
  HP = 2,
  /** Mana or MaxMana. */
  MANA = 3,
  /** Armour Class. */
  AC = 4,
  /** Experience or MaxExperience. */
  EXPERIENCE = 5,
  /** Player's level has changed. */
  PLAYERLEVEL = 6,
  /** Player's title has changed. */
  PLAYERTITLE = 7,
  /** Player's gold amount. */
  GOLD = 8,
  /** Observed monster's health level. */
  MONSTERHEALTH = 9,
  /** Dungeon depth. */
  DUNGEONLEVEL = 10,
  /** Player's speed. */
  PLAYERSPEED = 11,
  /** Race or Class. */
  RACE_CLASS = 12,
  /** "Study" availability. */
  STUDYSTATUS = 13,
  /** Status. */
  STATUS = 14,
  /** Trap detection status. */
  DETECTIONSTATUS = 15,
  /** Object level feeling. */
  FEELING = 16,
  /** Light level. */
  LIGHT = 17,
  /** The two 'R's: Resting and Repeating. */
  STATE = 18,
  /** Player has moved. */
  PLAYERMOVED = 19,
  /** When the player would "see" floor objects. */
  SEEFLOOR = 20,
  /** Explosion visual effect. */
  EXPLOSION = 21,
  /** Bolt visual effect. */
  BOLT = 22,
  /** Missile visual effect. */
  MISSILE = 23,
  /** Inventory changed. */
  INVENTORY = 24,
  /** Equipment changed. */
  EQUIPMENT = 25,
  /** Item list updated. */
  ITEMLIST = 26,
  /** Monster list updated. */
  MONSTERLIST = 27,
  /** Monster target changed. */
  MONSTERTARGET = 28,
  /** Object target changed. */
  OBJECTTARGET = 29,
  /** A message to display. */
  MESSAGE = 30,
  /** A sound to play. */
  SOUND = 31,
  /** Ring the bell. */
  BELL = 32,
  /** Store interaction. */
  USE_STORE = 33,
  /** Store contents changed (buy/sell). */
  STORECHANGED = 34,
  /** Flush pending input. */
  INPUT_FLUSH = 35,
  /** Flush pending messages. */
  MESSAGE_FLUSH = 36,
  /** Check for user interrupt. */
  CHECK_INTERRUPT = 37,
  /** Refresh the display. */
  REFRESH = 38,
  /** New level display. */
  NEW_LEVEL_DISPLAY = 39,
  /** Command repeat. */
  COMMAND_REPEAT = 40,
  /** Animation tick. */
  ANIMATE = 41,
  /** Cheat death triggered. */
  CHEAT_DEATH = 42,
  /** New status message for initialisation. */
  INITSTATUS = 43,
  /** Change in birth points. */
  BIRTHPOINTS = 44,
  /** Entering init phase. */
  ENTER_INIT = 45,
  /** Leaving init phase. */
  LEAVE_INIT = 46,
  /** Entering birth phase. */
  ENTER_BIRTH = 47,
  /** Leaving birth phase. */
  LEAVE_BIRTH = 48,
  /** Entering game. */
  ENTER_GAME = 49,
  /** Leaving game. */
  LEAVE_GAME = 50,
  /** Entering world (dungeon play). */
  ENTER_WORLD = 51,
  /** Leaving world. */
  LEAVE_WORLD = 52,
  /** Entering a store. */
  ENTER_STORE = 53,
  /** Leaving a store. */
  LEAVE_STORE = 54,
  /** Entering death screen. */
  ENTER_DEATH = 55,
  /** Leaving death screen. */
  LEAVE_DEATH = 56,
  /** Dungeon generation: level start. */
  GEN_LEVEL_START = 57,
  /** Dungeon generation: level end. */
  GEN_LEVEL_END = 58,
  /** Dungeon generation: room start. */
  GEN_ROOM_START = 59,
  /** Dungeon generation: room choose size. */
  GEN_ROOM_CHOOSE_SIZE = 60,
  /** Dungeon generation: room choose subtype. */
  GEN_ROOM_CHOOSE_SUBTYPE = 61,
  /** Dungeon generation: room end. */
  GEN_ROOM_END = 62,
  /** Dungeon generation: tunnel finished. */
  GEN_TUNNEL_FINISHED = 63,
  /** Sent at the end of a series of events. */
  END = 64,
}

/** Total number of game event types. */
export const N_GAME_EVENTS = GameEventType.END + 1;

// ── Event data ──

/**
 * Data carried by a game event.
 *
 * In the C original this is a union; in TypeScript we use a generic payload.
 */
export interface GameEvent {
  /** The event that occurred. */
  readonly type: GameEventType;
  /** Optional event data. */
  readonly data?: unknown;
}

// ── Handler types ──

/**
 * A function called when a game event occurs.
 *
 * Corresponds to `game_event_handler` in game-event.h.
 */
export type EventHandler = (event: GameEvent) => void;

// ── EventBus ──

/**
 * Synchronous publish/subscribe event bus.
 *
 * Port of the static event_handlers[] system in game-event.c.
 * Emit blocks until all handlers for the event type have completed.
 */
export class EventBus {
  /**
   * Map from event type to the list of registered handlers.
   * Uses a Map rather than a fixed-length array for sparse efficiency.
   */
  private handlers = new Map<GameEventType, EventHandler[]>();

  /**
   * Set of one-shot handlers that should be removed after firing.
   * We track (type, handler) references to identify which to remove.
   */
  private onceHandlers = new Set<EventHandler>();

  /**
   * Subscribe to an event type.
   *
   * Corresponds to `event_add_handler` in game-event.c.
   */
  on(type: GameEventType, handler: EventHandler): void {
    let list = this.handlers.get(type);
    if (list === undefined) {
      list = [];
      this.handlers.set(type, list);
    }
    list.push(handler);
  }

  /**
   * Unsubscribe a handler from an event type.
   *
   * Corresponds to `event_remove_handler` in game-event.c.
   * Removes the first matching handler reference.
   */
  off(type: GameEventType, handler: EventHandler): void {
    const list = this.handlers.get(type);
    if (list === undefined) return;

    const idx = list.indexOf(handler);
    if (idx !== -1) {
      list.splice(idx, 1);
      if (list.length === 0) {
        this.handlers.delete(type);
      }
    }
    this.onceHandlers.delete(handler);
  }

  /**
   * Emit an event, calling all registered handlers synchronously.
   *
   * Corresponds to `game_event_dispatch` in game-event.c.
   * Handlers are called in registration order. Emit blocks until
   * all handlers have returned.
   */
  emit(type: GameEventType, data?: unknown): void {
    const list = this.handlers.get(type);
    if (list === undefined) return;

    const event: GameEvent = { type, data };

    // Iterate over a snapshot to allow safe removal during iteration
    const snapshot = [...list];
    for (const handler of snapshot) {
      handler(event);
      if (this.onceHandlers.has(handler)) {
        this.off(type, handler);
      }
    }
  }

  /**
   * Subscribe to an event type for a single firing only.
   *
   * The handler is automatically removed after the first time it is called.
   */
  once(type: GameEventType, handler: EventHandler): void {
    this.onceHandlers.add(handler);
    this.on(type, handler);
  }

  /**
   * Remove all listeners for all event types.
   *
   * Corresponds to `event_remove_all_handlers` in game-event.c.
   */
  clear(): void {
    this.handlers.clear();
    this.onceHandlers.clear();
  }

  /**
   * Remove all listeners for a specific event type.
   *
   * Corresponds to `event_remove_handler_type` in game-event.c.
   */
  clearType(type: GameEventType): void {
    const list = this.handlers.get(type);
    if (list !== undefined) {
      for (const handler of list) {
        this.onceHandlers.delete(handler);
      }
    }
    this.handlers.delete(type);
  }

  /**
   * Get the number of handlers registered for a given event type.
   * Useful for testing and diagnostics.
   */
  listenerCount(type: GameEventType): number {
    const list = this.handlers.get(type);
    return list !== undefined ? list.length : 0;
  }
}
