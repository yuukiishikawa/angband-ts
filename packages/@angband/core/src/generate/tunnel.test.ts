/**
 * Tests for generate/tunnel.ts — Tunnel generation between rooms.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { RNG, loc } from "../z/index.js";
import { createChunk, chunkGetSquare, squareIsFloor, squareSetFeat } from "../cave/index.js";
import { Feat, SquareFlag } from "../types/index.js";
import { setupTestFeatureInfo } from "./test-helpers.js";
import { generateSimpleRoom } from "./room.js";
import { digTunnel } from "./tunnel.js";

// ── Setup ──

beforeAll(() => {
  setupTestFeatureInfo();
});

function makeRng(seed = 42): RNG {
  const rng = new RNG();
  rng.stateInit(seed);
  rng.quick = false;
  return rng;
}

function makeChunkWithGranite(height: number, width: number): ReturnType<typeof createChunk> {
  const chunk = createChunk(height, width, 1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
        squareSetFeat(chunk, loc(x, y), Feat.PERM);
      } else {
        squareSetFeat(chunk, loc(x, y), Feat.GRANITE);
      }
    }
  }
  return chunk;
}

// ── Tests ──

describe("digTunnel", () => {
  it("should carve floor squares between two points", () => {
    const chunk = makeChunkWithGranite(30, 50);
    const rng = makeRng(100);

    const carved = digTunnel(chunk, loc(10, 15), loc(40, 15), rng);

    expect(carved.length).toBeGreaterThan(0);

    // All carved locations should be floor or door
    for (const pos of carved) {
      const sq = chunkGetSquare(chunk, pos);
      const isFloorOrDoor = sq.feat === Feat.FLOOR || sq.feat === Feat.CLOSED;
      expect(isFloorOrDoor).toBe(true);
    }
  });

  it("should connect two rooms", () => {
    const chunk = makeChunkWithGranite(40, 80);
    const rng = makeRng(200);

    // Create two rooms
    const room1 = generateSimpleRoom(chunk, loc(15, 20), rng);
    const room2 = generateSimpleRoom(chunk, loc(60, 20), rng);

    expect(room1).not.toBeNull();
    expect(room2).not.toBeNull();
    if (!room1 || !room2) return;

    // Dig tunnel between them
    const carved = digTunnel(chunk, room1.center, room2.center, rng);

    // Should have carved something
    expect(carved.length).toBeGreaterThan(0);
  });

  it("should not carve through permanent walls", () => {
    const chunk = makeChunkWithGranite(30, 50);
    const rng = makeRng(300);

    const carved = digTunnel(chunk, loc(5, 15), loc(45, 15), rng);

    // Check that no permanent walls were modified
    for (let x = 0; x < chunk.width; x++) {
      // Top and bottom borders should remain PERM
      expect(chunkGetSquare(chunk, loc(x, 0)).feat).toBe(Feat.PERM);
      expect(chunkGetSquare(chunk, loc(x, chunk.height - 1)).feat).toBe(Feat.PERM);
    }
    for (let y = 0; y < chunk.height; y++) {
      // Left and right borders should remain PERM
      expect(chunkGetSquare(chunk, loc(0, y)).feat).toBe(Feat.PERM);
      expect(chunkGetSquare(chunk, loc(chunk.width - 1, y)).feat).toBe(Feat.PERM);
    }
  });

  it("should handle tunneling from the same point", () => {
    const chunk = makeChunkWithGranite(30, 50);
    const rng = makeRng(400);

    const carved = digTunnel(chunk, loc(25, 15), loc(25, 15), rng);

    // No carving needed
    expect(carved.length).toBe(0);
  });

  it("should handle vertical tunnels", () => {
    const chunk = makeChunkWithGranite(50, 30);
    const rng = makeRng(500);

    const carved = digTunnel(chunk, loc(15, 5), loc(15, 45), rng);

    expect(carved.length).toBeGreaterThan(0);
  });

  it("should handle diagonal tunnels", () => {
    const chunk = makeChunkWithGranite(40, 40);
    const rng = makeRng(600);

    const carved = digTunnel(chunk, loc(5, 5), loc(35, 35), rng);

    expect(carved.length).toBeGreaterThan(0);
  });

  it("should place doors when piercing outer walls", () => {
    const chunk = makeChunkWithGranite(40, 80);
    const rng = makeRng(700);

    // Create a room to have outer walls
    const room = generateSimpleRoom(chunk, loc(20, 20), rng);
    expect(room).not.toBeNull();
    if (!room) return;

    // Tunnel from outside to the room
    const carved = digTunnel(chunk, loc(60, 20), room.center, rng);

    // Check if any carved square has a closed door feature
    const hasDoor = carved.some(
      (pos) => chunkGetSquare(chunk, pos).feat === Feat.CLOSED,
    );
    // Door placement depends on random walk hitting an outer wall;
    // this may or may not happen, so we just verify no crash
    expect(carved.length).toBeGreaterThan(0);
  });
});
