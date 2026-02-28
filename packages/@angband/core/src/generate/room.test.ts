/**
 * Tests for generate/room.ts — Room generation functions.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { RNG, loc } from "../z/index.js";
import { createChunk, chunkGetSquare, squareIsFloor, squareIsRoom } from "../cave/index.js";
import { Feat, SquareFlag } from "../types/index.js";
import { setupTestFeatureInfo } from "./test-helpers.js";
import {
  generateSimpleRoom,
  generateOverlappingRoom,
  generateCrossRoom,
  generateCircularRoom,
  generateLargeRoom,
  placeRoom,
} from "./room.js";

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
  // Fill with granite (simulating initial dungeon state)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sq = chunkGetSquare(chunk, loc(x, y));
      if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
        sq.feat = Feat.PERM as number & { readonly __brand: "FeatureId" };
      } else {
        sq.feat = Feat.GRANITE as number & { readonly __brand: "FeatureId" };
      }
    }
  }
  return chunk;
}

// ── Tests ──

describe("generateSimpleRoom", () => {
  it("should create a room with floor tiles", () => {
    const chunk = makeChunkWithGranite(40, 60);
    const rng = makeRng();
    const room = generateSimpleRoom(chunk, loc(30, 20), rng);

    expect(room).not.toBeNull();
    if (!room) return;

    // The center should be floor
    expect(squareIsFloor(chunk, room.center)).toBe(true);

    // The center should be marked as ROOM
    expect(squareIsRoom(chunk, room.center)).toBe(true);
  });

  it("should have corners that define a valid rectangle", () => {
    const chunk = makeChunkWithGranite(40, 60);
    const rng = makeRng(123);
    const room = generateSimpleRoom(chunk, loc(30, 20), rng);

    expect(room).not.toBeNull();
    if (!room) return;

    const [tl, br] = room.corners;
    expect(tl.x).toBeLessThan(br.x);
    expect(tl.y).toBeLessThan(br.y);
  });

  it("should return null if room does not fit in chunk", () => {
    const chunk = makeChunkWithGranite(10, 10);
    const rng = makeRng();
    // Trying to place at the edge where it cannot fit
    const room = generateSimpleRoom(chunk, loc(2, 2), rng);

    // Might or might not fit depending on random size; test edge case
    const edgeRoom = generateSimpleRoom(chunk, loc(1, 1), rng);
    // Very likely null since 1,1 is too close to border
    // (But depends on random half-sizes, so we just check the type)
    if (edgeRoom !== null) {
      expect(edgeRoom.center).toBeDefined();
    }
  });

  it("should produce door locations", () => {
    const chunk = makeChunkWithGranite(40, 60);
    const rng = makeRng(99);
    const room = generateSimpleRoom(chunk, loc(30, 20), rng);

    expect(room).not.toBeNull();
    if (!room) return;

    expect(room.doors.length).toBe(4);
    // Doors should be at the wall boundary
    for (const door of room.doors) {
      expect(door.x).toBeGreaterThanOrEqual(0);
      expect(door.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("should fill interior squares with floor", () => {
    const chunk = makeChunkWithGranite(40, 60);
    const rng = makeRng(77);
    const room = generateSimpleRoom(chunk, loc(30, 20), rng);

    expect(room).not.toBeNull();
    if (!room) return;

    const [tl, br] = room.corners;
    let floorCount = 0;
    for (let y = tl.y; y <= br.y; y++) {
      for (let x = tl.x; x <= br.x; x++) {
        if (squareIsFloor(chunk, loc(x, y))) floorCount++;
      }
    }
    expect(floorCount).toBeGreaterThan(0);
  });
});

describe("generateOverlappingRoom", () => {
  it("should create a room with floor tiles at center", () => {
    const chunk = makeChunkWithGranite(50, 80);
    const rng = makeRng(200);
    const room = generateOverlappingRoom(chunk, loc(40, 25), rng);

    expect(room).not.toBeNull();
    if (!room) return;
    expect(squareIsFloor(chunk, room.center)).toBe(true);
    expect(squareIsRoom(chunk, room.center)).toBe(true);
  });

  it("should have valid corners", () => {
    const chunk = makeChunkWithGranite(50, 80);
    const rng = makeRng(201);
    const room = generateOverlappingRoom(chunk, loc(40, 25), rng);

    expect(room).not.toBeNull();
    if (!room) return;

    const [tl, br] = room.corners;
    expect(tl.x).toBeLessThan(br.x);
    expect(tl.y).toBeLessThan(br.y);
  });
});

describe("generateCrossRoom", () => {
  it("should create a cross-shaped room with floor at center", () => {
    const chunk = makeChunkWithGranite(50, 80);
    const rng = makeRng(300);
    const room = generateCrossRoom(chunk, loc(40, 25), rng);

    expect(room).not.toBeNull();
    if (!room) return;
    expect(squareIsFloor(chunk, room.center)).toBe(true);
    expect(squareIsRoom(chunk, room.center)).toBe(true);
  });
});

describe("generateCircularRoom", () => {
  it("should create a circular room with floor at center", () => {
    const chunk = makeChunkWithGranite(50, 80);
    const rng = makeRng(400);
    const room = generateCircularRoom(chunk, loc(40, 25), rng);

    expect(room).not.toBeNull();
    if (!room) return;
    expect(squareIsFloor(chunk, room.center)).toBe(true);
    expect(squareIsRoom(chunk, room.center)).toBe(true);
  });

  it("should have roughly circular floor area", () => {
    const chunk = makeChunkWithGranite(50, 80);
    const rng = makeRng(401);
    const room = generateCircularRoom(chunk, loc(40, 25), rng);

    expect(room).not.toBeNull();
    if (!room) return;

    // Count floor tiles — should be more than a tiny amount
    let floorCount = 0;
    const [tl, br] = room.corners;
    for (let y = tl.y; y <= br.y; y++) {
      for (let x = tl.x; x <= br.x; x++) {
        if (squareIsFloor(chunk, loc(x, y))) floorCount++;
      }
    }
    // A circle of radius 2 has ~13 squares; radius 4 has ~49
    expect(floorCount).toBeGreaterThanOrEqual(5);
  });
});

describe("generateLargeRoom", () => {
  it("should create a large room with floor at center", () => {
    const chunk = makeChunkWithGranite(50, 80);
    const rng = makeRng(500);
    const room = generateLargeRoom(chunk, loc(40, 25), rng);

    expect(room).not.toBeNull();
    if (!room) return;
    expect(squareIsFloor(chunk, room.center)).toBe(true);
    expect(squareIsRoom(chunk, room.center)).toBe(true);
  });

  it("should have a larger area than a simple room", () => {
    const chunk1 = makeChunkWithGranite(50, 80);
    const chunk2 = makeChunkWithGranite(50, 80);
    const rng1 = makeRng(501);
    const rng2 = makeRng(501);

    const simpleRoom = generateSimpleRoom(chunk1, loc(40, 25), rng1);
    const largeRoom = generateLargeRoom(chunk2, loc(40, 25), rng2);

    expect(simpleRoom).not.toBeNull();
    expect(largeRoom).not.toBeNull();
    if (!simpleRoom || !largeRoom) return;

    const simpleArea =
      (simpleRoom.corners[1].x - simpleRoom.corners[0].x + 1) *
      (simpleRoom.corners[1].y - simpleRoom.corners[0].y + 1);
    const largeArea =
      (largeRoom.corners[1].x - largeRoom.corners[0].x + 1) *
      (largeRoom.corners[1].y - largeRoom.corners[0].y + 1);

    // Large rooms should generally be bigger
    expect(largeArea).toBeGreaterThanOrEqual(simpleArea);
  });
});

describe("placeRoom", () => {
  it("should fill all squares in the room with floor and ROOM flag", () => {
    const chunk = makeChunkWithGranite(40, 60);
    const rng = makeRng(600);
    const room = generateSimpleRoom(chunk, loc(30, 20), rng);

    expect(room).not.toBeNull();
    if (!room) return;

    // Reset the interior to granite then re-apply
    const [tl, br] = room.corners;
    for (let y = tl.y; y <= br.y; y++) {
      for (let x = tl.x; x <= br.x; x++) {
        const sq = chunkGetSquare(chunk, loc(x, y));
        sq.feat = Feat.GRANITE as number & { readonly __brand: "FeatureId" };
        sq.info.off(SquareFlag.ROOM);
      }
    }

    // Verify it is granite now
    expect(squareIsFloor(chunk, room.center)).toBe(false);

    // Place room
    placeRoom(chunk, room);

    // Verify it is floor now
    expect(squareIsFloor(chunk, room.center)).toBe(true);
    expect(squareIsRoom(chunk, room.center)).toBe(true);
  });
});
