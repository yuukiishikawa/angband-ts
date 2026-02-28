/**
 * Tests for game/state.ts — GameState, messages, and state management.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createGameState,
  addMessage,
  getRecentMessages,
  MessageType,
  DEFAULT_MAX_MESSAGES,
  type GameState,
} from "./state.js";
import { GameEventType } from "./event.js";
import { RNG } from "../z/rand.js";
import type { Player } from "../types/player.js";
import type { Chunk } from "../types/cave.js";

// ── Test helpers ──

/**
 * Create a minimal mock Player for testing.
 * Only the fields needed by GameState are stubbed.
 */
function mockPlayer(): Player {
  return {
    isDead: false,
    totalWinner: false,
    depth: 1,
    lev: 1,
    exp: 0,
    chp: 100,
    mhp: 100,
    au: 0,
  } as unknown as Player;
}

/**
 * Create a minimal mock Chunk for testing.
 */
function mockChunk(depth: number = 1): Chunk {
  return {
    name: "Test Level",
    depth,
    height: 10,
    width: 10,
    turn: 0,
  } as unknown as Chunk;
}

describe("createGameState", () => {
  it("should create a game state with correct initial values", () => {
    const player = mockPlayer();
    const chunk = mockChunk(5);
    const rng = new RNG();

    const state = createGameState(player, chunk, rng);

    expect(state.player).toBe(player);
    expect(state.chunk).toBe(chunk);
    expect(state.depth).toBe(5);
    expect(state.turn).toBe(0);
    expect(state.running).toBe(false);
    expect(state.resting).toBe(0);
    expect(state.dead).toBe(false);
    expect(state.won).toBe(false);
    expect(state.messages).toEqual([]);
    expect(state.maxMessages).toBe(DEFAULT_MAX_MESSAGES);
    expect(state.eventBus).toBeDefined();
    expect(state.rng).toBe(rng);
  });

  it("should accept a custom maxMessages value", () => {
    const state = createGameState(mockPlayer(), mockChunk(), new RNG(), 100);
    expect(state.maxMessages).toBe(100);
  });

  it("should create an independent event bus per state", () => {
    const s1 = createGameState(mockPlayer(), mockChunk(), new RNG());
    const s2 = createGameState(mockPlayer(), mockChunk(), new RNG());
    expect(s1.eventBus).not.toBe(s2.eventBus);
  });
});

describe("addMessage", () => {
  let state: GameState;

  beforeEach(() => {
    state = createGameState(mockPlayer(), mockChunk(), new RNG());
  });

  it("should add a message to the log", () => {
    addMessage(state, "You hit the orc.");
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]!.text).toBe("You hit the orc.");
    expect(state.messages[0]!.type).toBe(MessageType.GENERIC);
    expect(state.messages[0]!.turn).toBe(0);
  });

  it("should use the specified message type", () => {
    addMessage(state, "Critical hit!", MessageType.COMBAT);
    expect(state.messages[0]!.type).toBe(MessageType.COMBAT);
  });

  it("should record the current game turn", () => {
    state.turn = 42;
    addMessage(state, "Turn 42 message");
    expect(state.messages[0]!.turn).toBe(42);
  });

  it("should append messages in order", () => {
    addMessage(state, "first");
    addMessage(state, "second");
    addMessage(state, "third");

    expect(state.messages).toHaveLength(3);
    expect(state.messages[0]!.text).toBe("first");
    expect(state.messages[1]!.text).toBe("second");
    expect(state.messages[2]!.text).toBe("third");
  });

  it("should emit a MESSAGE event on the event bus", () => {
    const handler = vi.fn();
    state.eventBus.on(GameEventType.MESSAGE, handler);

    addMessage(state, "You found gold!");

    expect(handler).toHaveBeenCalledOnce();
    const event = handler.mock.calls[0]![0]!;
    expect(event.type).toBe(GameEventType.MESSAGE);
    expect(event.data).toEqual({
      text: "You found gold!",
      type: MessageType.GENERIC,
      turn: 0,
    });
  });

  describe("ring buffer behavior", () => {
    it("should trim old messages when exceeding maxMessages", () => {
      const smallState = createGameState(
        mockPlayer(),
        mockChunk(),
        new RNG(),
        5,
      );

      for (let i = 0; i < 10; i++) {
        addMessage(smallState, `msg${i}`);
      }

      expect(smallState.messages).toHaveLength(5);
      expect(smallState.messages[0]!.text).toBe("msg5");
      expect(smallState.messages[4]!.text).toBe("msg9");
    });

    it("should retain exactly maxMessages after overflow", () => {
      const smallState = createGameState(
        mockPlayer(),
        mockChunk(),
        new RNG(),
        3,
      );

      addMessage(smallState, "a");
      addMessage(smallState, "b");
      addMessage(smallState, "c");
      addMessage(smallState, "d");

      expect(smallState.messages).toHaveLength(3);
      expect(smallState.messages[0]!.text).toBe("b");
      expect(smallState.messages[1]!.text).toBe("c");
      expect(smallState.messages[2]!.text).toBe("d");
    });

    it("should handle maxMessages of 1", () => {
      const smallState = createGameState(
        mockPlayer(),
        mockChunk(),
        new RNG(),
        1,
      );

      addMessage(smallState, "first");
      addMessage(smallState, "second");

      expect(smallState.messages).toHaveLength(1);
      expect(smallState.messages[0]!.text).toBe("second");
    });
  });
});

describe("getRecentMessages", () => {
  let state: GameState;

  beforeEach(() => {
    state = createGameState(mockPlayer(), mockChunk(), new RNG());
    addMessage(state, "msg1");
    addMessage(state, "msg2");
    addMessage(state, "msg3");
    addMessage(state, "msg4");
    addMessage(state, "msg5");
  });

  it("should return the most recent N messages", () => {
    const recent = getRecentMessages(state, 3);
    expect(recent).toHaveLength(3);
    expect(recent[0]!.text).toBe("msg3");
    expect(recent[1]!.text).toBe("msg4");
    expect(recent[2]!.text).toBe("msg5");
  });

  it("should return all messages if count exceeds total", () => {
    const recent = getRecentMessages(state, 100);
    expect(recent).toHaveLength(5);
    expect(recent[0]!.text).toBe("msg1");
    expect(recent[4]!.text).toBe("msg5");
  });

  it("should return an empty array for count of 0", () => {
    const recent = getRecentMessages(state, 0);
    expect(recent).toHaveLength(0);
  });

  it("should return an empty array for negative count", () => {
    const recent = getRecentMessages(state, -1);
    expect(recent).toHaveLength(0);
  });

  it("should return an empty array for empty log", () => {
    const emptyState = createGameState(mockPlayer(), mockChunk(), new RNG());
    const recent = getRecentMessages(emptyState, 5);
    expect(recent).toHaveLength(0);
  });

  it("should return a copy (not a reference to internal array)", () => {
    const recent = getRecentMessages(state, 3);
    recent.pop();
    // Internal state should be unaffected
    expect(state.messages).toHaveLength(5);
  });
});

describe("MessageType enum", () => {
  it("should have all expected message types", () => {
    expect(MessageType.GENERIC).toBe(0);
    expect(MessageType.COMBAT).toBe(1);
    expect(MessageType.MAGIC).toBe(2);
    expect(MessageType.MONSTER).toBe(3);
    expect(MessageType.ITEM).toBe(4);
    expect(MessageType.URGENT).toBe(5);
  });
});

describe("GameState mutability", () => {
  it("should allow mutable updates to game state fields", () => {
    const state = createGameState(mockPlayer(), mockChunk(), new RNG());

    state.turn = 100;
    state.depth = 10;
    state.running = true;
    state.resting = 50;
    state.dead = true;
    state.won = true;

    expect(state.turn).toBe(100);
    expect(state.depth).toBe(10);
    expect(state.running).toBe(true);
    expect(state.resting).toBe(50);
    expect(state.dead).toBe(true);
    expect(state.won).toBe(true);
  });
});
