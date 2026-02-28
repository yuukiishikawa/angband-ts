/**
 * @file birth-screen.ts
 * @brief Character creation screen
 *
 * Classic Angband-style character creation rendered on the 80x24 terminal.
 * Flow: Race → Class → Name → Confirm.
 */

import { BitFlag } from "@angband/core/z/bitflag.js";
import type { PlayerRace, PlayerClass, ClassMagic, StartItem } from "@angband/core/types/player.js";

import { Terminal, TERM_COLS, TERM_ROWS } from "./terminal.js";
import { CanvasRenderer } from "./canvas-renderer.js";
import {
  COLOUR_WHITE,
  COLOUR_YELLOW,
  COLOUR_L_GREEN,
  COLOUR_L_BLUE,
  COLOUR_SLATE,
  COLOUR_ORANGE,
  COLOUR_L_RED,
  COLOUR_DARK,
  COLOUR_GREEN,
} from "./color-palette.js";

// ── JSON data types ──

interface RaceJSON {
  name: string;
  stats: string;
  hitdie: string;
  exp: string;
  infravision: string;
  age: string;
  height: string;
  weight: string;
  "skill-disarm-phys": string;
  "skill-disarm-magic": string;
  "skill-device": string;
  "skill-save": string;
  "skill-stealth": string;
  "skill-search": string;
  "skill-melee": string;
  "skill-shoot": string;
  "skill-throw": string;
  "skill-dig": string;
  "obj-flags"?: string;
  "player-flags"?: string;
  values?: string[];
}

interface ClassJSON {
  name: string;
  stats: string;
  hitdie: string;
  "max-attacks": string;
  "min-weight": string;
  "strength-multiplier": string;
  title?: string[];
  magic?: string;
  "player-flags"?: string;
  "start-items"?: string[];
  "skill-disarm-phys": string;
  "skill-disarm-magic": string;
  "skill-device": string;
  "skill-save": string;
  "skill-stealth": string;
  "skill-search": string;
  "skill-melee": string;
  "skill-shoot": string;
  "skill-throw": string;
  "skill-dig": string;
}

// ── Parse helpers ──

function parseStats(s: string): number[] {
  return s.split(":").map(Number);
}

function parseBasemod(s: string): [number, number] {
  const parts = s.split(":");
  return [Number(parts[0]), Number(parts[1] ?? 0)];
}

function parseSkillPair(s: string): [number, number] {
  const parts = s.split(":");
  return [Number(parts[0]), Number(parts[1] ?? 0)];
}

function raceFromJSON(raw: RaceJSON, idx: number): PlayerRace {
  const stats = parseStats(raw.stats);
  const [baseAge, modAge] = parseBasemod(raw.age);
  const [baseHeight, modHeight] = parseBasemod(raw.height);
  const [baseWeight, modWeight] = parseBasemod(raw.weight);

  return {
    name: raw.name,
    ridx: idx,
    hitDice: Number(raw.hitdie),
    expFactor: Number(raw.exp),
    baseAge, modAge,
    baseHeight, modHeight,
    baseWeight, modWeight,
    infra: Number(raw.infravision),
    body: 0,
    statAdj: stats as [number, number, number, number, number],
    skills: [
      Number(raw["skill-disarm-phys"]),
      Number(raw["skill-disarm-magic"]),
      Number(raw["skill-device"]),
      Number(raw["skill-save"]),
      Number(raw["skill-stealth"]),
      Number(raw["skill-search"]),
      Number(raw["skill-melee"]),
      Number(raw["skill-shoot"]),
      Number(raw["skill-throw"]),
      Number(raw["skill-dig"]),
    ],
    flags: new BitFlag(40),
    pflags: new BitFlag(18),
    elInfo: [],
  };
}

function classFromJSON(raw: ClassJSON, idx: number): PlayerClass {
  const stats = parseStats(raw.stats);
  const skills: number[] = [];
  const extraSkills: number[] = [];
  const skillKeys = [
    "skill-disarm-phys", "skill-disarm-magic", "skill-device",
    "skill-save", "skill-stealth", "skill-search",
    "skill-melee", "skill-shoot", "skill-throw", "skill-dig",
  ] as const;

  for (const key of skillKeys) {
    const [base, extra] = parseSkillPair(raw[key]);
    skills.push(base);
    extraSkills.push(extra);
  }

  let magic: ClassMagic = {
    spellFirst: 1,
    spellWeight: 300,
    numBooks: 0,
    books: [],
    totalSpells: 0,
  };
  if (raw.magic) {
    const [first, weight, numBooks] = raw.magic.split(":").map(Number);
    magic = {
      spellFirst: first ?? 1,
      spellWeight: weight ?? 300,
      numBooks: numBooks ?? 0,
      books: [],
      totalSpells: 0,
    };
  }

  return {
    name: raw.name,
    cidx: idx,
    titles: raw.title ?? [],
    statAdj: stats as [number, number, number, number, number],
    skills,
    extraSkills,
    hitDice: Number(raw.hitdie),
    expFactor: 0,
    flags: new BitFlag(40),
    pflags: new BitFlag(18),
    maxAttacks: Number(raw["max-attacks"]),
    minWeight: Number(raw["min-weight"]),
    attMultiply: Number(raw["strength-multiplier"]),
    startItems: parseStartItems(raw["start-items"]),
    magic,
  };
}

/**
 * Parse start-items strings like "food:Ration of Food:1:3:none"
 * into StartItem objects.
 */
function parseStartItems(items?: string[]): StartItem[] {
  if (!items) return [];
  const result: StartItem[] = [];
  for (const item of items) {
    const parts = item.split(":");
    if (parts.length < 4) continue;
    const tvalName = parts[0]!.toLowerCase().replace(/_/g, " ");
    const svalName = parts[1]!;
    const min = Number(parts[2]);
    const max = Number(parts[3]);
    result.push({
      tval: 0,  // Resolved at runtime from objectKinds
      sval: 0,
      min,
      max,
      tvalName,
      svalName,
    });
  }
  return result;
}

// ── Birth result ──

export interface BirthResult {
  name: string;
  race: PlayerRace;
  class: PlayerClass;
}

// ── Birth screen ──

const STAT_NAMES = ["STR", "INT", "WIS", "DEX", "CON"];

export async function runBirthScreen(
  canvas: HTMLCanvasElement,
  raceData: RaceJSON[],
  classData: ClassJSON[],
): Promise<BirthResult> {
  const terminal = new Terminal(TERM_COLS, TERM_ROWS);
  const renderer = new CanvasRenderer(canvas);
  renderer.resize(TERM_COLS, TERM_ROWS);

  const races = raceData.map((r, i) => raceFromJSON(r, i));
  const classes = classData.map((c, i) => classFromJSON(c, i));

  function render(): void {
    renderer.render(terminal);
  }

  function waitKey(): Promise<KeyboardEvent> {
    return new Promise((resolve) => {
      const handler = (e: KeyboardEvent): void => {
        e.preventDefault();
        document.removeEventListener("keydown", handler);
        resolve(e);
      };
      document.addEventListener("keydown", handler);
    });
  }

  // ── Phase 0: Title ──
  terminal.clear();
  drawTitle(terminal);
  terminal.putString(25, 14, "Press any key to begin", COLOUR_SLATE);
  render();
  await waitKey();

  // ── Phase 1: Race selection ──
  const race = await selectFromList(
    terminal, render, waitKey,
    "Choose your race:", races,
    (r) => r.name,
    (r) => drawRaceInfo(terminal, r),
  );

  // ── Phase 2: Class selection ──
  const cls = await selectFromList(
    terminal, render, waitKey,
    "Choose your class:", classes,
    (c) => c.name,
    (c) => drawClassInfo(terminal, c, race),
  );

  // ── Phase 3: Name entry ──
  const name = await enterName(terminal, render, waitKey, race, cls);

  return { name, race, class: cls };
}

// ── Title ──

function drawTitle(term: Terminal): void {
  const title = [
    "     ###                   ##                           ##",
    "    ## ##                  ##                            ##",
    "   ##   ##  #####   ##### ######   ####  #####   ####   ##",
    "   ##   ## ##   ## ##   ## ##  ## ##  ## ##   ## ##  ##  ##",
    "   ####### ##   ## ##   ## ##  ## ##  ## ##   ## ##  ##  ##",
    "   ##   ## ##   ## ##  ## ##  ##  ##### ##   ##  ##### ###",
    "   ##   ## ##   ##  ####  ####   ##     ##   ##  ##",
    "                    ##           #####          ####",
  ];
  for (let i = 0; i < title.length; i++) {
    term.putString(10, 3 + i, title[i]!, COLOUR_ORANGE);
  }
  term.putString(25, 12, "TypeScript Edition", COLOUR_YELLOW);
}

// ── List selection ──

async function selectFromList<T>(
  term: Terminal,
  render: () => void,
  waitKey: () => Promise<KeyboardEvent>,
  prompt: string,
  items: T[],
  getName: (item: T) => string,
  drawInfo: (item: T) => void,
): Promise<T> {
  let cursor = 0;

  function draw(): void {
    term.clear();

    // Header
    term.putString(2, 1, prompt, COLOUR_WHITE);

    // List (left column)
    const listTop = 3;
    const maxVisible = Math.min(items.length, TERM_ROWS - 6);
    let scrollOffset = 0;
    if (cursor >= maxVisible) {
      scrollOffset = cursor - maxVisible + 1;
    }

    for (let i = 0; i < maxVisible; i++) {
      const idx = i + scrollOffset;
      if (idx >= items.length) break;
      const item = items[idx]!;
      const name = getName(item);
      const y = listTop + i;

      if (idx === cursor) {
        // Highlighted
        term.putString(2, y, ">", COLOUR_YELLOW);
        term.putString(4, y, name, COLOUR_YELLOW);
      } else {
        term.putString(4, y, name, COLOUR_L_GREEN);
      }
    }

    // Info panel (right column)
    drawInfo(items[cursor]!);

    // Footer
    term.putString(2, TERM_ROWS - 1, "Up/Down to select, Enter to confirm", COLOUR_SLATE);

    render();
  }

  draw();

  for (;;) {
    const e = await waitKey();

    if (e.key === "ArrowUp" || e.key === "k") {
      cursor = (cursor - 1 + items.length) % items.length;
      draw();
    } else if (e.key === "ArrowDown" || e.key === "j") {
      cursor = (cursor + 1) % items.length;
      draw();
    } else if (e.key === "Enter" || e.key === " ") {
      return items[cursor]!;
    }
  }
}

// ── Race info panel ──

function drawRaceInfo(term: Terminal, race: PlayerRace): void {
  const col = 28;
  let row = 3;

  term.putString(col, row++, race.name, COLOUR_WHITE);
  row++;

  // Stat adjustments
  term.putString(col, row++, "Stat Modifiers:", COLOUR_SLATE);
  for (let i = 0; i < STAT_NAMES.length; i++) {
    const val = race.statAdj[i]!;
    const sign = val >= 0 ? "+" : "";
    const color = val > 0 ? COLOUR_L_GREEN : val < 0 ? COLOUR_L_RED : COLOUR_WHITE;
    term.putString(col + 2, row, `${STAT_NAMES[i]!}:`, COLOUR_SLATE);
    term.putString(col + 8, row, `${sign}${val}`, color);
    row++;
  }
  row++;

  // Other stats
  term.putString(col, row, "Hit Die:", COLOUR_SLATE);
  term.putString(col + 12, row++, String(race.hitDice), COLOUR_WHITE);

  term.putString(col, row, "Exp Factor:", COLOUR_SLATE);
  const expColor = race.expFactor > 100 ? COLOUR_L_RED : race.expFactor < 100 ? COLOUR_L_GREEN : COLOUR_WHITE;
  term.putString(col + 12, row++, `${race.expFactor}%`, expColor);

  term.putString(col, row, "Infravision:", COLOUR_SLATE);
  term.putString(col + 13, row++, race.infra > 0 ? `${race.infra * 10}'` : "None", COLOUR_WHITE);
}

// ── Class info panel ──

function drawClassInfo(term: Terminal, cls: PlayerClass, race: PlayerRace): void {
  const col = 28;
  let row = 3;

  term.putString(col, row++, cls.name, COLOUR_WHITE);
  row++;

  // Stat adjustments (combined with race)
  term.putString(col, row++, "Stat Modifiers (Race+Class):", COLOUR_SLATE);
  for (let i = 0; i < STAT_NAMES.length; i++) {
    const raceVal = race.statAdj[i]!;
    const clsVal = cls.statAdj[i]!;
    const total = raceVal + clsVal;
    const sign = total >= 0 ? "+" : "";
    const color = total > 0 ? COLOUR_L_GREEN : total < 0 ? COLOUR_L_RED : COLOUR_WHITE;
    term.putString(col + 2, row, `${STAT_NAMES[i]!}:`, COLOUR_SLATE);
    term.putString(col + 8, row, `${sign}${total}`, color);
    row++;
  }
  row++;

  // Class stats
  term.putString(col, row, "Hit Die:", COLOUR_SLATE);
  term.putString(col + 12, row++, String(race.hitDice + cls.hitDice), COLOUR_WHITE);

  term.putString(col, row, "Max Attacks:", COLOUR_SLATE);
  term.putString(col + 13, row++, String(cls.maxAttacks), COLOUR_WHITE);

  const hasMagic = cls.magic.numBooks > 0;
  term.putString(col, row, "Magic:", COLOUR_SLATE);
  term.putString(col + 12, row++, hasMagic ? "Yes" : "No", hasMagic ? COLOUR_L_BLUE : COLOUR_SLATE);

  if (cls.titles.length > 0) {
    row++;
    term.putString(col, row++, "Titles:", COLOUR_SLATE);
    for (let i = 0; i < Math.min(cls.titles.length, 5); i++) {
      term.putString(col + 2, row++, cls.titles[i]!, COLOUR_GREEN);
    }
  }
}

// ── Name entry ──

async function enterName(
  term: Terminal,
  render: () => void,
  waitKey: () => Promise<KeyboardEvent>,
  race: PlayerRace,
  cls: PlayerClass,
): Promise<string> {
  let name = "";
  const maxLen = 20;

  function draw(): void {
    term.clear();

    term.putString(2, 1, "Enter your name:", COLOUR_WHITE);

    // Summary
    term.putString(2, 3, `Race:  ${race.name}`, COLOUR_L_GREEN);
    term.putString(2, 4, `Class: ${cls.name}`, COLOUR_L_BLUE);

    // Name input
    term.putString(2, 7, "Name: ", COLOUR_SLATE);
    term.putString(8, 7, name, COLOUR_YELLOW);
    term.putString(8 + name.length, 7, "_", COLOUR_WHITE);

    // Clear rest of line
    for (let x = 8 + name.length + 1; x < TERM_COLS; x++) {
      term.putChar(x, 7, " ", COLOUR_DARK);
    }

    term.putString(2, TERM_ROWS - 1, "Type name, Enter to confirm (empty = random)", COLOUR_SLATE);

    render();
  }

  draw();

  for (;;) {
    const e = await waitKey();

    if (e.key === "Enter") {
      if (name.length === 0) {
        name = generateRandomName();
      }
      return name;
    } else if (e.key === "Backspace") {
      if (name.length > 0) {
        name = name.slice(0, -1);
        draw();
      }
    } else if (e.key === "Escape") {
      name = "";
      draw();
    } else if (e.key.length === 1 && name.length < maxLen) {
      // Accept printable characters
      const code = e.key.charCodeAt(0);
      if (code >= 32 && code < 127) {
        name += e.key;
        draw();
      }
    }
  }
}

// ── Random name generator ──

const NAME_PARTS_START = [
  "Ar", "Bal", "Cel", "Dur", "Eld", "Fal", "Gar", "Hal", "Ith",
  "Kel", "Lor", "Mor", "Nar", "Or", "Per", "Ral", "Sar", "Thr",
  "Ul", "Val", "Wor", "Zan",
];

const NAME_PARTS_MID = [
  "ag", "an", "el", "en", "ig", "in", "ol", "on", "or", "ul", "ar", "al",
];

const NAME_PARTS_END = [
  "ach", "ain", "and", "ath", "iel", "ien", "ion", "ith", "orn",
  "oth", "uin", "wen", "wyn", "dur", "mir", "nor", "ric", "gar",
];

function generateRandomName(): string {
  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
  const useMid = Math.random() > 0.5;
  let name = pick(NAME_PARTS_START);
  if (useMid) name += pick(NAME_PARTS_MID);
  name += pick(NAME_PARTS_END);
  return name;
}
