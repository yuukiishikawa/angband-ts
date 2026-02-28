/**
 * Tests for game/event.ts — EventBus and event system.
 */
import { describe, it, expect, vi } from "vitest";
import {
  EventBus,
  GameEventType,
  type GameEvent,
  type EventHandler,
} from "./event.js";

describe("EventBus", () => {
  describe("on / emit", () => {
    it("should call a registered handler when the event is emitted", () => {
      const bus = new EventBus();
      const handler = vi.fn();

      bus.on(GameEventType.HP, handler);
      bus.emit(GameEventType.HP);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith({ type: GameEventType.HP, data: undefined });
    });

    it("should pass event data to the handler", () => {
      const bus = new EventBus();
      const handler = vi.fn();
      const data = { current: 50, max: 100 };

      bus.on(GameEventType.HP, handler);
      bus.emit(GameEventType.HP, data);

      expect(handler).toHaveBeenCalledWith({ type: GameEventType.HP, data });
    });

    it("should call multiple handlers in registration order", () => {
      const bus = new EventBus();
      const order: number[] = [];

      bus.on(GameEventType.MAP, () => order.push(1));
      bus.on(GameEventType.MAP, () => order.push(2));
      bus.on(GameEventType.MAP, () => order.push(3));
      bus.emit(GameEventType.MAP);

      expect(order).toEqual([1, 2, 3]);
    });

    it("should not call handlers for other event types", () => {
      const bus = new EventBus();
      const hpHandler = vi.fn();
      const manaHandler = vi.fn();

      bus.on(GameEventType.HP, hpHandler);
      bus.on(GameEventType.MANA, manaHandler);
      bus.emit(GameEventType.HP);

      expect(hpHandler).toHaveBeenCalledOnce();
      expect(manaHandler).not.toHaveBeenCalled();
    });

    it("should not throw when emitting with no handlers registered", () => {
      const bus = new EventBus();
      expect(() => bus.emit(GameEventType.GOLD)).not.toThrow();
    });
  });

  describe("off", () => {
    it("should remove a specific handler", () => {
      const bus = new EventBus();
      const handler = vi.fn();

      bus.on(GameEventType.AC, handler);
      bus.off(GameEventType.AC, handler);
      bus.emit(GameEventType.AC);

      expect(handler).not.toHaveBeenCalled();
    });

    it("should only remove the first matching handler reference", () => {
      const bus = new EventBus();
      const handler = vi.fn();

      bus.on(GameEventType.AC, handler);
      bus.on(GameEventType.AC, handler);
      bus.off(GameEventType.AC, handler);
      bus.emit(GameEventType.AC);

      // One was removed, one remains
      expect(handler).toHaveBeenCalledOnce();
    });

    it("should not throw when removing a handler that does not exist", () => {
      const bus = new EventBus();
      const handler = vi.fn();
      expect(() => bus.off(GameEventType.STATS, handler)).not.toThrow();
    });

    it("should leave other handlers intact when removing one", () => {
      const bus = new EventBus();
      const h1 = vi.fn();
      const h2 = vi.fn();

      bus.on(GameEventType.GOLD, h1);
      bus.on(GameEventType.GOLD, h2);
      bus.off(GameEventType.GOLD, h1);
      bus.emit(GameEventType.GOLD);

      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalledOnce();
    });
  });

  describe("once", () => {
    it("should call the handler only once", () => {
      const bus = new EventBus();
      const handler = vi.fn();

      bus.once(GameEventType.EXPERIENCE, handler);
      bus.emit(GameEventType.EXPERIENCE);
      bus.emit(GameEventType.EXPERIENCE);

      expect(handler).toHaveBeenCalledOnce();
    });

    it("should not interfere with regular handlers", () => {
      const bus = new EventBus();
      const onceHandler = vi.fn();
      const regularHandler = vi.fn();

      bus.once(GameEventType.PLAYERLEVEL, onceHandler);
      bus.on(GameEventType.PLAYERLEVEL, regularHandler);

      bus.emit(GameEventType.PLAYERLEVEL);
      bus.emit(GameEventType.PLAYERLEVEL);

      expect(onceHandler).toHaveBeenCalledOnce();
      expect(regularHandler).toHaveBeenCalledTimes(2);
    });

    it("should pass event data to once handler", () => {
      const bus = new EventBus();
      const handler = vi.fn();

      bus.once(GameEventType.MESSAGE, handler);
      bus.emit(GameEventType.MESSAGE, "hello");

      expect(handler).toHaveBeenCalledWith({
        type: GameEventType.MESSAGE,
        data: "hello",
      });
    });
  });

  describe("clear", () => {
    it("should remove all handlers for all event types", () => {
      const bus = new EventBus();
      const h1 = vi.fn();
      const h2 = vi.fn();

      bus.on(GameEventType.HP, h1);
      bus.on(GameEventType.MANA, h2);
      bus.clear();

      bus.emit(GameEventType.HP);
      bus.emit(GameEventType.MANA);

      expect(h1).not.toHaveBeenCalled();
      expect(h2).not.toHaveBeenCalled();
    });

    it("should allow re-registering handlers after clear", () => {
      const bus = new EventBus();
      const handler = vi.fn();

      bus.on(GameEventType.HP, handler);
      bus.clear();
      bus.on(GameEventType.HP, handler);
      bus.emit(GameEventType.HP);

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe("clearType", () => {
    it("should remove all handlers for a specific event type only", () => {
      const bus = new EventBus();
      const hpHandler = vi.fn();
      const manaHandler = vi.fn();

      bus.on(GameEventType.HP, hpHandler);
      bus.on(GameEventType.MANA, manaHandler);
      bus.clearType(GameEventType.HP);

      bus.emit(GameEventType.HP);
      bus.emit(GameEventType.MANA);

      expect(hpHandler).not.toHaveBeenCalled();
      expect(manaHandler).toHaveBeenCalledOnce();
    });
  });

  describe("listenerCount", () => {
    it("should return 0 for event types with no handlers", () => {
      const bus = new EventBus();
      expect(bus.listenerCount(GameEventType.BELL)).toBe(0);
    });

    it("should return the correct count after registration", () => {
      const bus = new EventBus();
      bus.on(GameEventType.SOUND, vi.fn());
      bus.on(GameEventType.SOUND, vi.fn());
      expect(bus.listenerCount(GameEventType.SOUND)).toBe(2);
    });

    it("should update after removal", () => {
      const bus = new EventBus();
      const handler = vi.fn();

      bus.on(GameEventType.REFRESH, handler);
      expect(bus.listenerCount(GameEventType.REFRESH)).toBe(1);

      bus.off(GameEventType.REFRESH, handler);
      expect(bus.listenerCount(GameEventType.REFRESH)).toBe(0);
    });

    it("should update after once handler fires", () => {
      const bus = new EventBus();
      bus.once(GameEventType.END, vi.fn());
      expect(bus.listenerCount(GameEventType.END)).toBe(1);

      bus.emit(GameEventType.END);
      expect(bus.listenerCount(GameEventType.END)).toBe(0);
    });
  });

  describe("synchronous behavior", () => {
    it("should block emit until all handlers complete", () => {
      const bus = new EventBus();
      let value = 0;

      bus.on(GameEventType.PLAYERTURN, () => {
        value = 1;
      });
      bus.on(GameEventType.PLAYERTURN, () => {
        value = 2;
      });

      bus.emit(GameEventType.PLAYERTURN);
      // After emit returns, all handlers have run
      expect(value).toBe(2);
    });

    it("should handle handler that registers a new handler during emit", () => {
      const bus = new EventBus();
      const lateHandler = vi.fn();

      bus.on(GameEventType.INVENTORY, () => {
        // Register a new handler during emit
        bus.on(GameEventType.INVENTORY, lateHandler);
      });

      bus.emit(GameEventType.INVENTORY);
      // Late handler should NOT be called during this emit (snapshot iteration)
      expect(lateHandler).not.toHaveBeenCalled();

      // But it should be called on the next emit
      bus.emit(GameEventType.INVENTORY);
      expect(lateHandler).toHaveBeenCalledOnce();
    });

    it("should handle handler that removes itself during emit", () => {
      const bus = new EventBus();
      const results: string[] = [];

      const selfRemover: EventHandler = () => {
        results.push("removed");
        bus.off(GameEventType.EQUIPMENT, selfRemover);
      };

      bus.on(GameEventType.EQUIPMENT, selfRemover);
      bus.on(GameEventType.EQUIPMENT, () => results.push("kept"));

      bus.emit(GameEventType.EQUIPMENT);
      expect(results).toEqual(["removed", "kept"]);

      // Second emit: selfRemover should be gone
      results.length = 0;
      bus.emit(GameEventType.EQUIPMENT);
      expect(results).toEqual(["kept"]);
    });
  });

  describe("GameEventType enum coverage", () => {
    it("should have MAP as 0", () => {
      expect(GameEventType.MAP).toBe(0);
    });

    it("should have END as the last event type", () => {
      expect(GameEventType.END).toBe(64);
    });

    it("should have state transition events", () => {
      // Verify a selection of important event types exist
      expect(GameEventType.ENTER_GAME).toBeDefined();
      expect(GameEventType.LEAVE_GAME).toBeDefined();
      expect(GameEventType.ENTER_WORLD).toBeDefined();
      expect(GameEventType.LEAVE_WORLD).toBeDefined();
      expect(GameEventType.ENTER_STORE).toBeDefined();
      expect(GameEventType.LEAVE_STORE).toBeDefined();
      expect(GameEventType.ENTER_DEATH).toBeDefined();
      expect(GameEventType.LEAVE_DEATH).toBeDefined();
    });
  });
});
