/**
 * Tests for display.ts — game display renderer
 */
import { describe, it, expect } from "vitest";
import {
  getTerrainChar,
  getMonsterChar,
  getObjectChar,
  getGridDisplay,
  renderMap,
  renderMessages,
  renderStatusLine,
  renderSidebar,
  DEFAULT_DISPLAY_CONFIG,
  FEAT,
  SQUARE_FLAG,
} from "./display.js";
import { Terminal } from "./terminal.js";
import {
  COLOUR_WHITE,
  COLOUR_DARK,
  COLOUR_RED,
  COLOUR_GREEN,
  COLOUR_L_UMBER,
  COLOUR_YELLOW,
  COLOUR_L_GREEN,
  COLOUR_L_DARK,
  COLOUR_ORANGE,
  BitFlag,
  loc,
} from "@angband/core";
import type { RenderChunk, RenderPlayer, RenderMonsterRace } from "./display.js";

// ── SquareFlag.MAX from core (needed for BitFlag sizing) ──
const SQUARE_FLAG_MAX = 22;

// ── Helper: create a minimal Square ──

function makeSquare(feat: number, flags?: number[]) {
  const info = new BitFlag(SQUARE_FLAG_MAX);
  if (flags) {
    for (const f of flags) info.on(f);
  }
  return {
    feat,
    info,
    light: 0,
    mon: 0,
    obj: null,
    trap: null,
  };
}

// ── Helper: create a minimal Chunk ──

function makeChunk(width: number, height: number, defaultFeat: number = FEAT.FLOOR): RenderChunk {
  const squares: ReturnType<typeof makeSquare>[][] = [];
  for (let y = 0; y < height; y++) {
    const row: ReturnType<typeof makeSquare>[] = [];
    for (let x = 0; x < width; x++) {
      row.push(makeSquare(defaultFeat, [SQUARE_FLAG.SEEN, SQUARE_FLAG.MARK]));
    }
    squares.push(row);
  }
  return {
    height,
    width,
    squares,
  };
}

// ── Helper: create a minimal Player ──

function makePlayer(x: number, y: number): RenderPlayer {
  return {
    grid: loc(x, y),
    fullName: "TestHero",
    race: { name: "Human" },
    class: { name: "Warrior" },
    lev: 15,
    maxLev: 15,
    exp: 5000,
    maxExp: 5000,
    au: 500,
    depth: 5,
    mhp: 200,
    chp: 200,
    msp: 50,
    csp: 50,
    statMax: [18, 16, 14, 17, 18],
    statCur: [18, 16, 14, 17, 18],
    timed: Array(53).fill(0),
    state: {
      speed: 110,
      ac: 50,
      toA: 10,
    },
  };
}

// ── Tests ──

describe("getTerrainChar", () => {
  it("should return '.' for FLOOR", () => {
    const tc = getTerrainChar(FEAT.FLOOR);
    expect(tc.char).toBe(".");
    expect(tc.color).toBe(COLOUR_WHITE);
  });

  it("should return '#' for GRANITE", () => {
    const tc = getTerrainChar(FEAT.GRANITE);
    expect(tc.char).toBe("#");
  });

  it("should return '+' for CLOSED door", () => {
    const tc = getTerrainChar(FEAT.CLOSED);
    expect(tc.char).toBe("+");
    expect(tc.color).toBe(COLOUR_L_UMBER);
  });

  it("should return '<' for LESS (up stairs)", () => {
    expect(getTerrainChar(FEAT.LESS).char).toBe("<");
  });

  it("should return '>' for MORE (down stairs)", () => {
    expect(getTerrainChar(FEAT.MORE).char).toBe(">");
  });

  it("should return \"'\" for OPEN door", () => {
    expect(getTerrainChar(FEAT.OPEN).char).toBe("'");
  });

  it("should return '#' for unknown feature", () => {
    expect(getTerrainChar(999).char).toBe("#");
  });

  it("should use FeatureType when provided", () => {
    const ft = { dChar: "X", dAttr: COLOUR_RED };
    const tc = getTerrainChar(FEAT.FLOOR, ft);
    expect(tc.char).toBe("X");
    expect(tc.color).toBe(COLOUR_RED);
  });
});

describe("getMonsterChar", () => {
  it("should use the race dChar and dAttr", () => {
    const race: RenderMonsterRace = {
      dChar: "D".codePointAt(0)!,
      dAttr: COLOUR_RED,
    };
    const mc = getMonsterChar(race);
    expect(mc.char).toBe("D");
    expect(mc.color).toBe(COLOUR_RED);
  });
});

describe("getObjectChar", () => {
  it("should use dChar/dAttr when provided", () => {
    const oc = getObjectChar({ tval: 15, dChar: "?", dAttr: COLOUR_GREEN });
    expect(oc.char).toBe("?");
    expect(oc.color).toBe(COLOUR_GREEN);
  });

  it("should fall back to tval-based lookup", () => {
    const oc = getObjectChar({ tval: 100 }); // TV_GOLD
    expect(oc.char).toBe("$");
    expect(oc.color).toBe(COLOUR_YELLOW);
  });

  it("should return '&' for unknown tval", () => {
    const oc = getObjectChar({ tval: 9999 });
    expect(oc.char).toBe("&");
  });
});

describe("getGridDisplay", () => {
  it("should show '@' at the player's position", () => {
    const chunk = makeChunk(10, 10);
    const player = makePlayer(5, 5);
    const result = getGridDisplay(chunk, 5, 5, player);
    expect(result.char).toBe("@");
    expect(result.fg).toBe(COLOUR_WHITE);
  });

  it("should show terrain for an empty seen square", () => {
    const chunk = makeChunk(10, 10, FEAT.FLOOR);
    const player = makePlayer(0, 0);
    const result = getGridDisplay(chunk, 5, 5, player);
    expect(result.char).toBe(".");
    expect(result.fg).toBe(COLOUR_WHITE);
  });

  it("should show nothing for unseen squares", () => {
    const chunk = makeChunk(10, 10);
    // Remove SEEN and MARK flags
    (chunk.squares[5]![5]! as any).info.off(SQUARE_FLAG.SEEN);
    (chunk.squares[5]![5]! as any).info.off(SQUARE_FLAG.MARK);
    const player = makePlayer(0, 0);
    const result = getGridDisplay(chunk, 5, 5, player);
    expect(result.char).toBe(" ");
    expect(result.fg).toBe(COLOUR_DARK);
  });

  it("should darken memorized-but-not-seen squares", () => {
    const chunk = makeChunk(10, 10);
    // Keep MARK but remove SEEN
    (chunk.squares[5]![5]! as any).info.off(SQUARE_FLAG.SEEN);
    const player = makePlayer(0, 0);
    const result = getGridDisplay(chunk, 5, 5, player);
    expect(result.char).toBe(".");
    expect(result.fg).toBe(COLOUR_L_DARK);
  });

  it("should return blank for out-of-bounds coordinates", () => {
    const chunk = makeChunk(10, 10);
    const player = makePlayer(0, 0);
    const result = getGridDisplay(chunk, -1, -1, player);
    expect(result.char).toBe(" ");
    expect(result.fg).toBe(COLOUR_DARK);
  });

  it("should prioritize player over terrain", () => {
    const chunk = makeChunk(10, 10, FEAT.GRANITE);
    const player = makePlayer(3, 3);
    const result = getGridDisplay(chunk, 3, 3, player);
    expect(result.char).toBe("@"); // Player, not '#'
  });

  it("should show monster when present", () => {
    const chunk = makeChunk(10, 10);
    (chunk.squares[5]![5]! as any).mon = 1;
    const monsters = new Map<number, RenderMonsterRace>();
    monsters.set(1, { dChar: "D".codePointAt(0)!, dAttr: COLOUR_RED });
    const player = makePlayer(0, 0);
    const result = getGridDisplay(chunk, 5, 5, player, monsters);
    expect(result.char).toBe("D");
    expect(result.fg).toBe(COLOUR_RED);
  });

  it("should show object marker when object present", () => {
    const chunk = makeChunk(10, 10);
    (chunk.squares[5]![5]! as any).obj = 1; // non-null object reference
    const player = makePlayer(0, 0);
    const result = getGridDisplay(chunk, 5, 5, player);
    expect(result.char).toBe("&");
    expect(result.fg).toBe(COLOUR_YELLOW);
  });
});

describe("renderMap", () => {
  it("should render terrain into the terminal", () => {
    const chunk = makeChunk(20, 20, FEAT.FLOOR);
    // Place a wall
    (chunk.squares[5]![5]! as any).feat = FEAT.GRANITE;
    const player = makePlayer(10, 10);
    const term = new Terminal(80, 24);
    renderMap(term, chunk, player, 0, 1, DEFAULT_DISPLAY_CONFIG);

    // The map should have been written to the terminal
    // Find the player '@' somewhere in the map area
    let foundPlayer = false;
    for (let y = 1; y < 1 + DEFAULT_DISPLAY_CONFIG.mapHeight; y++) {
      for (let x = 0; x < DEFAULT_DISPLAY_CONFIG.mapWidth; x++) {
        if (term.getCell(x, y).char === "@") {
          foundPlayer = true;
        }
      }
    }
    expect(foundPlayer).toBe(true);
  });

  it("should render a small map entirely visible", () => {
    const chunk = makeChunk(5, 5, FEAT.FLOOR);
    const player = makePlayer(2, 2);
    const term = new Terminal(80, 24);
    const config = { ...DEFAULT_DISPLAY_CONFIG, mapWidth: 5, mapHeight: 5 };
    renderMap(term, chunk, player, 0, 0, config);

    // Player at center
    expect(term.getCell(2, 2).char).toBe("@");
    // Floor tiles
    expect(term.getCell(0, 0).char).toBe(".");
    expect(term.getCell(4, 4).char).toBe(".");
  });
});

describe("renderMessages", () => {
  it("should display messages in the message area", () => {
    const term = new Terminal(80, 5);
    renderMessages(term, ["You see a dragon!", "It breathes fire!"], 2);

    // Newest message at bottom of message area (row 1), next above (row 0)
    expect(term.getCell(0, 1).char).toBe("Y"); // "You see a dragon!"
    expect(term.getCell(0, 0).char).toBe("I"); // "It breathes fire!"
  });

  it("should clear the message area before rendering", () => {
    const term = new Terminal(80, 3);
    term.putString(0, 0, "Old message that should be cleared");
    renderMessages(term, ["New message"], 2);

    // Row 1 should have the new message
    expect(term.getCell(0, 1).char).toBe("N");
  });

  it("should handle empty message list", () => {
    const term = new Terminal(80, 3);
    renderMessages(term, [], 1);
    // Should just be blank
    expect(term.getCell(0, 0).char).toBe(" ");
  });
});

describe("renderStatusLine", () => {
  it("should show depth on the status line", () => {
    const term = new Terminal(80, 24);
    const player = makePlayer(0, 0);
    renderStatusLine(term, player);

    // Find "250'" in the bottom row (depth 5 * 50 = 250)
    let found = false;
    const y = 23;
    for (let x = 0; x < term.width - 3; x++) {
      const s = term.getCell(x, y).char + term.getCell(x + 1, y).char + term.getCell(x + 2, y).char;
      if (s === "250") {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("should show Town for depth 0", () => {
    const term = new Terminal(80, 24);
    const player = makePlayer(0, 0);
    (player as any).depth = 0;
    renderStatusLine(term, player);

    let found = false;
    const y = 23;
    for (let x = 0; x < term.width - 3; x++) {
      const s = term.getCell(x, y).char + term.getCell(x + 1, y).char +
        term.getCell(x + 2, y).char + term.getCell(x + 3, y).char;
      if (s === "Town") {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("should show speed when not normal (110)", () => {
    const term = new Terminal(80, 24);
    const player = makePlayer(0, 0);
    (player as any).state = { ...player.state, speed: 120 };
    renderStatusLine(term, player);

    // Find "Fast" in the bottom row
    let found = false;
    const y = 23;
    for (let x = 0; x < term.width - 3; x++) {
      const s = term.getCell(x, y).char + term.getCell(x + 1, y).char +
        term.getCell(x + 2, y).char + term.getCell(x + 3, y).char;
      if (s === "Fast") {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("should show timed effects", () => {
    const term = new Terminal(80, 24);
    const player = makePlayer(0, 0);
    // Set poisoned timer (TimedEffect.POISONED = 7)
    player.timed[7] = 10;
    renderStatusLine(term, player);

    // Find "Poisoned" in the bottom row
    let found = false;
    const y = 23;
    for (let x = 0; x < term.width - 7; x++) {
      let s = "";
      for (let i = 0; i < 8; i++) {
        s += term.getCell(x + i, y).char;
      }
      if (s === "Poisoned") {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

describe("renderSidebar", () => {
  it("should render player name in the sidebar", () => {
    const term = new Terminal(80, 24);
    const player = makePlayer(5, 5);
    renderSidebar(term, player);

    // Player name should appear at x=67 (80-13), y=1
    const name = "TestHero";
    for (let i = 0; i < name.length; i++) {
      expect(term.getCell(67 + i, 1).char).toBe(name[i]);
    }
  });

  it("should render HP values", () => {
    const term = new Terminal(80, 24);
    const player = makePlayer(5, 5);
    renderSidebar(term, player);

    // HP should appear on line y=16 (y_start=1 + 15)
    // Find "200" somewhere on that line
    let found200 = false;
    for (let x = 67; x < 80; x++) {
      const s = term.getCell(x, 16).char + term.getCell(x + 1, 16).char + term.getCell(x + 2, 16).char;
      if (s === "200") {
        found200 = true;
        break;
      }
    }
    expect(found200).toBe(true);
  });

  it("should render stat labels", () => {
    const term = new Terminal(80, 24);
    const player = makePlayer(5, 5);
    renderSidebar(term, player);

    // STR should appear at y=9 (y_start=1 + 8)
    const strLabel = term.getCell(67, 9).char + term.getCell(68, 9).char + term.getCell(69, 9).char;
    expect(strLabel).toBe("STR");
  });

  it("should render level info", () => {
    const term = new Terminal(80, 24);
    const player = makePlayer(5, 5);
    renderSidebar(term, player);

    // "Lev:" should appear at y=5 (y_start=1 + 4)
    const levLabel = term.getCell(67, 5).char + term.getCell(68, 5).char +
      term.getCell(69, 5).char + term.getCell(70, 5).char;
    expect(levLabel).toBe("Lev:");
  });
});

describe("DEFAULT_DISPLAY_CONFIG", () => {
  it("should have standard Angband dimensions", () => {
    expect(DEFAULT_DISPLAY_CONFIG.mapWidth).toBe(66);
    expect(DEFAULT_DISPLAY_CONFIG.mapHeight).toBe(21);
    expect(DEFAULT_DISPLAY_CONFIG.sidebarWidth).toBe(13);
    expect(DEFAULT_DISPLAY_CONFIG.messageLines).toBe(1);
    expect(DEFAULT_DISPLAY_CONFIG.statusLines).toBe(2);
    // Total: sidebar + map = 13 + 66 = 79 (fits in 80 cols)
    expect(DEFAULT_DISPLAY_CONFIG.sidebarWidth + DEFAULT_DISPLAY_CONFIG.mapWidth).toBeLessThanOrEqual(80);
  });
});
