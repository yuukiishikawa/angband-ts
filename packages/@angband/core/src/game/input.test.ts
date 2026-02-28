/**
 * Tests for game/input.ts — Input request/response types and InputProvider.
 */
import { describe, it, expect, vi } from "vitest";
import type {
  InputRequest,
  InputResponse,
  InputProvider,
  DirectionRequest,
  TargetRequest,
  ItemRequest,
  ConfirmRequest,
  StringRequest,
  DirectionResponse,
  TargetResponse,
  ItemResponse,
  ConfirmResponse,
  StringResponse,
} from "./input.js";
import type { Loc } from "../z/type.js";
import type { ObjectType } from "../types/object.js";

// ── Helper: Mock InputProvider ──

/**
 * Creates a mock InputProvider that returns a predetermined response.
 */
function mockProvider(response: InputResponse): InputProvider {
  return {
    request: vi.fn().mockResolvedValue(response),
  };
}

describe("InputRequest discriminated union", () => {
  it("should discriminate direction requests by type", () => {
    const req: InputRequest = { type: "direction", prompt: "Which direction?" };
    expect(req.type).toBe("direction");
    if (req.type === "direction") {
      expect(req.prompt).toBe("Which direction?");
    }
  });

  it("should discriminate target requests by type", () => {
    const req: InputRequest = { type: "target", prompt: "Select target" };
    expect(req.type).toBe("target");
  });

  it("should discriminate item requests by type", () => {
    const filter = (_obj: ObjectType) => true;
    const req: InputRequest = {
      type: "item",
      prompt: "Choose an item",
      filter,
    };
    expect(req.type).toBe("item");
    if (req.type === "item") {
      expect(req.filter).toBe(filter);
    }
  });

  it("should allow item requests without a filter", () => {
    const req: InputRequest = { type: "item", prompt: "Choose an item" };
    expect(req.type).toBe("item");
    if (req.type === "item") {
      expect(req.filter).toBeUndefined();
    }
  });

  it("should discriminate confirm requests by type", () => {
    const req: InputRequest = { type: "confirm", prompt: "Are you sure?" };
    expect(req.type).toBe("confirm");
  });

  it("should discriminate string requests by type", () => {
    const req: InputRequest = {
      type: "string",
      prompt: "Enter name",
      maxLen: 32,
    };
    expect(req.type).toBe("string");
    if (req.type === "string") {
      expect(req.maxLen).toBe(32);
    }
  });
});

describe("InputResponse discriminated union", () => {
  it("should handle direction response with a value", () => {
    const resp: InputResponse = { type: "direction", direction: 6 };
    expect(resp.type).toBe("direction");
    if (resp.type === "direction") {
      expect(resp.direction).toBe(6);
    }
  });

  it("should handle cancelled direction response", () => {
    const resp: InputResponse = { type: "direction", direction: null };
    if (resp.type === "direction") {
      expect(resp.direction).toBeNull();
    }
  });

  it("should handle target response with a location", () => {
    const target: Loc = { x: 10, y: 20 };
    const resp: InputResponse = { type: "target", target };
    if (resp.type === "target") {
      expect(resp.target).toEqual({ x: 10, y: 20 });
    }
  });

  it("should handle cancelled target response", () => {
    const resp: InputResponse = { type: "target", target: null };
    if (resp.type === "target") {
      expect(resp.target).toBeNull();
    }
  });

  it("should handle item response", () => {
    const item = { kind: "test" } as unknown as ObjectType;
    const resp: InputResponse = { type: "item", item };
    if (resp.type === "item") {
      expect(resp.item).toBe(item);
    }
  });

  it("should handle cancelled item response", () => {
    const resp: InputResponse = { type: "item", item: null };
    if (resp.type === "item") {
      expect(resp.item).toBeNull();
    }
  });

  it("should handle confirm response", () => {
    const resp: InputResponse = { type: "confirm", confirmed: true };
    if (resp.type === "confirm") {
      expect(resp.confirmed).toBe(true);
    }
  });

  it("should handle denied confirm response", () => {
    const resp: InputResponse = { type: "confirm", confirmed: false };
    if (resp.type === "confirm") {
      expect(resp.confirmed).toBe(false);
    }
  });

  it("should handle string response", () => {
    const resp: InputResponse = { type: "string", text: "Gandalf" };
    if (resp.type === "string") {
      expect(resp.text).toBe("Gandalf");
    }
  });

  it("should handle cancelled string response", () => {
    const resp: InputResponse = { type: "string", text: null };
    if (resp.type === "string") {
      expect(resp.text).toBeNull();
    }
  });
});

describe("InputProvider", () => {
  it("should resolve direction requests", async () => {
    const provider = mockProvider({ type: "direction", direction: 8 });
    const req: DirectionRequest = { type: "direction", prompt: "Direction?" };

    const resp = await provider.request(req);
    expect(resp.type).toBe("direction");
    if (resp.type === "direction") {
      expect(resp.direction).toBe(8);
    }
    expect(provider.request).toHaveBeenCalledWith(req);
  });

  it("should resolve target requests", async () => {
    const target: Loc = { x: 5, y: 3 };
    const provider = mockProvider({ type: "target", target });
    const req: TargetRequest = { type: "target", prompt: "Target?" };

    const resp = await provider.request(req);
    if (resp.type === "target") {
      expect(resp.target).toEqual({ x: 5, y: 3 });
    }
  });

  it("should resolve item requests", async () => {
    const item = { kind: "potion" } as unknown as ObjectType;
    const provider = mockProvider({ type: "item", item });
    const req: ItemRequest = { type: "item", prompt: "Which item?" };

    const resp = await provider.request(req);
    if (resp.type === "item") {
      expect(resp.item).toBe(item);
    }
  });

  it("should resolve confirm requests", async () => {
    const provider = mockProvider({ type: "confirm", confirmed: true });
    const req: ConfirmRequest = { type: "confirm", prompt: "Really quit?" };

    const resp = await provider.request(req);
    if (resp.type === "confirm") {
      expect(resp.confirmed).toBe(true);
    }
  });

  it("should resolve string requests", async () => {
    const provider = mockProvider({ type: "string", text: "Frodo" });
    const req: StringRequest = {
      type: "string",
      prompt: "Name?",
      maxLen: 32,
    };

    const resp = await provider.request(req);
    if (resp.type === "string") {
      expect(resp.text).toBe("Frodo");
    }
  });

  it("should support async behavior (the input is a promise)", async () => {
    // Simulate delayed input
    const provider: InputProvider = {
      request: vi.fn().mockImplementation(
        () =>
          new Promise<InputResponse>((resolve) => {
            setTimeout(() => {
              resolve({ type: "direction", direction: 2 });
            }, 10);
          }),
      ),
    };

    const resp = await provider.request({
      type: "direction",
      prompt: "Go?",
    });
    expect(resp.type).toBe("direction");
    if (resp.type === "direction") {
      expect(resp.direction).toBe(2);
    }
  });
});
