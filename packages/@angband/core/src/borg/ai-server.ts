/**
 * @file borg/ai-server.ts
 * @brief HTTP server for AI agent (武将) to play TS Angband directly
 *
 * Runs a headless TS Angband game and exposes it via HTTP API.
 * The AI agent sends GameCommands and receives structured game state as JSON —
 * no screen parsing, no key translation, no slot mapping issues.
 *
 * Usage:
 *   npx tsx packages/@angband/core/src/borg/ai-server.ts --port 3000
 *
 * Endpoints:
 *   GET  /state   — current game state (player, visible map, monsters, inventory)
 *   POST /command — send a GameCommand, returns result + updated state
 *   GET  /health  — server health check
 */

import * as http from "node:http";

import { RNG } from "../z/rand.js";
import { createPlayer } from "../player/birth.js";
import { createGameState } from "../game/state.js";
import type { GameState } from "../game/state.js";
import { generateDungeon, DEFAULT_DUNGEON_CONFIG } from "../generate/generate.js";
import { runGameLoop } from "../game/world.js";
import type { CommandInputProvider, GameLoopOptions } from "../game/world.js";
import {
  setFeatureInfo,
  buildDefaultFeatureInfo,
  setViewFeatureTable,
  setPathfindFeatureTable,
} from "../cave/index.js";
import { parseMonsterBases, parseMonsterRaces } from "../data/monster-loader.js";
import {
  parseObjectBases,
  parseObjectKinds,
  parseBrands,
  parseSlays,
  parseArtifacts,
  parseEgoItems,
} from "../data/object-loader.js";
import type { ObjectKind, ObjectType } from "../types/object.js";
import type { Player, PlayerRace, PlayerClass, ClassMagic, ClassBook, ClassSpell, StartItem } from "../types/player.js";
import { Stat, TimedEffect } from "../types/player.js";
import type { ElementInfo } from "../types/player.js";
import { Element } from "../types/object.js";
import { BitFlag } from "../z/bitflag.js";
import { MonsterRaceFlag, MonsterSpellFlag } from "../types/monster.js";
import { createStore, initStoreStock, StoreType, STORE_TYPE_MAX, storeBuy, storeSell, storeGetPrice } from "../store/store.js";
import type { Store } from "../store/store.js";
import type { GameCommand } from "../command/core.js";
import { CommandType } from "../command/core.js";
import { GameEventType } from "../game/event.js";
import {
  giveStartingItems,
  autoEquipStartingItems,
  createStartObject,
} from "../game/bootstrap.js";
import { calcBonuses, calcMana } from "../player/calcs.js";

// Reuse JSON loader from remote-server
import * as fs from "node:fs";
import * as path from "node:path";

// ── JSON data types (matching remote-server.ts) ──

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
  equip?: string[];
  book?: string[];
  spell?: string[];
  effect?: string[];
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

function loadJSON(filename: string): unknown[] {
  const base = path.resolve(
    import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
    "../../gamedata",
  );
  return JSON.parse(fs.readFileSync(path.join(base, filename), "utf-8"));
}

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

function parseStartItems(items?: string[]): StartItem[] {
  if (!items) return [];
  const result: StartItem[] = [];
  for (const item of items) {
    const parts = item.split(":");
    if (parts.length < 4) continue;
    result.push({
      tval: 0,
      sval: 0,
      min: Number(parts[2]),
      max: Number(parts[3]),
      tvalName: parts[0]!.toLowerCase().replace(/_/g, " "),
      svalName: parts[1]!,
    });
  }
  return result;
}

const RACE_ELEM_MAP: Record<string, number> = {
  ACID: Element.ACID, ELEC: Element.ELEC, FIRE: Element.FIRE, COLD: Element.COLD,
  POIS: Element.POIS, LIGHT: Element.LIGHT, DARK: Element.DARK,
  SOUND: Element.SOUND, SHARD: Element.SHARD, NEXUS: Element.NEXUS,
  NETHER: Element.NETHER, CHAOS: Element.CHAOS, DISEN: Element.DISEN,
};

function parseRaceElInfo(values?: string[]): ElementInfo[] {
  const arr: ElementInfo[] = [];
  for (let i = 0; i < Element.MAX; i++) {
    arr.push({ resLevel: 0, flags: new BitFlag(8) } as ElementInfo);
  }
  if (!values) return arr;
  for (const v of values) {
    const m = v.match(/^RES_([A-Z]+)\[(\d+)\]$/);
    if (!m) continue;
    const elem = RACE_ELEM_MAP[m[1]!];
    if (elem !== undefined && arr[elem]) {
      (arr[elem] as { resLevel: number }).resLevel = Number(m[2]);
    }
  }
  return arr;
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
    elInfo: parseRaceElInfo(raw.values),
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
    spellFirst: 1, spellWeight: 300, numBooks: 0, books: [], totalSpells: 0,
  };
  if (raw.magic) {
    const [first, weight, numBooks] = raw.magic.split(":").map(Number);

    // Parse books: "magic book:town:[First Spells]:7:arcane"
    const books: ClassBook[] = (raw.book ?? []).map((b, bidx) => {
      const parts = b.split(":");
      const numSpells = Number(parts[3] ?? 0);
      const realm = parts[4] ?? "arcane";
      return {
        tval: 30, sval: bidx, dungeon: parts[1] === "dungeon",
        numSpells, realm, spells: [],
      };
    });

    // Parse spells: "Magic Missile:1:1:22:4" = name:slevel:smana:sfail:sexp
    let globalIdx = 0;
    let bookIdx = 0;
    let spellsInBook = 0;
    const allSpells: ClassSpell[] = [];
    for (const s of raw.spell ?? []) {
      const parts = s.split(":");
      // Advance to next book if current is full
      while (bookIdx < books.length && spellsInBook >= books[bookIdx]!.numSpells) {
        bookIdx++;
        spellsInBook = 0;
      }
      const spell: ClassSpell = {
        name: parts[0]!,
        text: "",
        sidx: globalIdx,
        bidx: bookIdx,
        slevel: Number(parts[1] ?? 1),
        smana: Number(parts[2] ?? 1),
        sfail: Number(parts[3] ?? 50),
        sexp: Number(parts[4] ?? 0),
        realm: bookIdx < books.length ? books[bookIdx]!.realm : "arcane",
      };
      allSpells.push(spell);
      if (bookIdx < books.length) {
        (books[bookIdx]!.spells as ClassSpell[]).push(spell);
      }
      globalIdx++;
      spellsInBook++;
    }

    magic = {
      spellFirst: first ?? 1,
      spellWeight: weight ?? 300,
      numBooks: numBooks ?? 0,
      books,
      totalSpells: allSpells.length,
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
    startItems: parseStartItems(raw.equip ?? raw["start-items"]),
    magic,
  };
}

// ── State serialization ──

function serializeVisibleMap(state: GameState): {
  tiles: { x: number; y: number; feat: number; mon: number; lit: boolean; hasObj: boolean }[];
  width: number;
  height: number;
} {
  const chunk = state.chunk;
  const p = state.player;
  // Return all tiles — AI has full map knowledge (omniscient mode)
  const tiles: { x: number; y: number; feat: number; mon: number; lit: boolean; hasObj: boolean }[] = [];

  for (let y = 0; y < chunk.height; y++) {
    for (let x = 0; x < chunk.width; x++) {
      const sq = chunk.squares[y]?.[x];
      if (!sq) continue;
      if (sq.feat === 0) continue; // FEAT_NONE / border
      const info = sq.info as unknown as number;
      tiles.push({
        x, y,
        feat: sq.feat,
        mon: sq.mon ?? 0,
        lit: (info & 0x08) !== 0,
        hasObj: sq.obj != null,
      });
    }
  }

  return { tiles, width: chunk.width, height: chunk.height };
}

// Breath spell flag → element name mapping for AI awareness
const BREATH_ELEMENT_MAP: [number, string][] = [
  [MonsterSpellFlag.BR_ACID, "ACID"], [MonsterSpellFlag.BR_ELEC, "ELEC"],
  [MonsterSpellFlag.BR_FIRE, "FIRE"], [MonsterSpellFlag.BR_COLD, "COLD"],
  [MonsterSpellFlag.BR_POIS, "POIS"], [MonsterSpellFlag.BR_NETH, "NETHER"],
  [MonsterSpellFlag.BR_LIGHT, "LIGHT"], [MonsterSpellFlag.BR_DARK, "DARK"],
  [MonsterSpellFlag.BR_SOUN, "SOUND"], [MonsterSpellFlag.BR_CHAO, "CHAOS"],
  [MonsterSpellFlag.BR_DISE, "DISEN"], [MonsterSpellFlag.BR_NEXU, "NEXUS"],
  [MonsterSpellFlag.BR_SHAR, "SHARD"], [MonsterSpellFlag.BR_PLAS, "ELEC"],
  [MonsterSpellFlag.BR_MANA, "MANA"],
];

// Ball/bolt spell flag → element name mapping
const SPELL_ELEMENT_MAP: [number, string][] = [
  [MonsterSpellFlag.BA_ACID, "ACID"], [MonsterSpellFlag.BA_ELEC, "ELEC"],
  [MonsterSpellFlag.BA_FIRE, "FIRE"], [MonsterSpellFlag.BA_COLD, "COLD"],
  [MonsterSpellFlag.BA_POIS, "POIS"], [MonsterSpellFlag.BA_NETH, "NETHER"],
  [MonsterSpellFlag.BO_ACID, "ACID"], [MonsterSpellFlag.BO_ELEC, "ELEC"],
  [MonsterSpellFlag.BO_FIRE, "FIRE"], [MonsterSpellFlag.BO_COLD, "COLD"],
  [MonsterSpellFlag.BO_POIS, "POIS"], [MonsterSpellFlag.BO_NETH, "NETHER"],
];

// Summoning spell flags
const SUMMON_FLAGS = [
  MonsterSpellFlag.S_KIN, MonsterSpellFlag.S_HI_DEMON,
  MonsterSpellFlag.S_MONSTER, MonsterSpellFlag.S_MONSTERS,
  MonsterSpellFlag.S_ANIMAL, MonsterSpellFlag.S_SPIDER,
  MonsterSpellFlag.S_HOUND, MonsterSpellFlag.S_HYDRA,
  MonsterSpellFlag.S_DEMON, MonsterSpellFlag.S_UNDEAD,
  MonsterSpellFlag.S_DRAGON, MonsterSpellFlag.S_HI_UNDEAD,
  MonsterSpellFlag.S_HI_DRAGON, MonsterSpellFlag.S_WRAITH,
  MonsterSpellFlag.S_UNIQUE,
];

function serializeMonsters(state: GameState): {
  midx: number; name: string; x: number; y: number;
  hp: number; maxhp: number; speed: number; level: number;
  distance: number;
  isUnique: boolean; isBreeder: boolean;
  breathElements: string[]; spellElements: string[];
  hasSummon: boolean; freqSpell: number; freqInnate: number;
  hasPassWall: boolean; isEvil: boolean; isUndead: boolean;
  isDragon: boolean; isDemon: boolean;
  isAnimal: boolean; isOrc: boolean; isTroll: boolean; isGiant: boolean;
  imAcid: boolean; imElec: boolean; imFire: boolean; imCold: boolean; imPois: boolean;
}[] {
  const p = state.player;
  return (state.chunk.monsters ?? [])
    .filter((m): m is NonNullable<typeof m> => m != null && m.hp > 0)
    .map((m) => {
      const race = m.race;
      const flags = race?.flags;
      const sf = race?.spellFlags;

      // Extract breath elements
      const breathElements: string[] = [];
      if (sf) {
        for (const [flag, elem] of BREATH_ELEMENT_MAP) {
          if (sf.has(flag)) breathElements.push(elem);
        }
      }

      // Extract spell elements
      const spellElements: string[] = [];
      if (sf) {
        for (const [flag, elem] of SPELL_ELEMENT_MAP) {
          if (sf.has(flag)) spellElements.push(elem);
        }
      }

      // Check summoning
      const hasSummon = sf ? SUMMON_FLAGS.some(f => sf.has(f)) : false;

      return {
        midx: m.midx,
        name: race?.name ?? "unknown",
        x: m.grid.x,
        y: m.grid.y,
        hp: m.hp,
        maxhp: m.maxhp,
        speed: m.mspeed ?? 0,
        level: race?.level ?? 0,
        distance: Math.max(Math.abs(m.grid.x - p.grid.x), Math.abs(m.grid.y - p.grid.y)),
        // New fields for AI awareness
        isUnique: flags ? flags.has(MonsterRaceFlag.UNIQUE) : false,
        isBreeder: flags ? flags.has(MonsterRaceFlag.MULTIPLY) : false,
        breathElements,
        spellElements,
        hasSummon,
        freqSpell: race?.freqSpell ?? 0,
        freqInnate: race?.freqInnate ?? 0,
        hasPassWall: flags ? flags.has(MonsterRaceFlag.PASS_WALL) : false,
        isEvil: flags ? flags.has(MonsterRaceFlag.EVIL) : false,
        isUndead: flags ? flags.has(MonsterRaceFlag.UNDEAD) : false,
        isDragon: flags ? flags.has(MonsterRaceFlag.DRAGON) : false,
        isDemon: flags ? flags.has(MonsterRaceFlag.DEMON) : false,
        isAnimal: flags ? flags.has(MonsterRaceFlag.ANIMAL) : false,
        isOrc: flags ? flags.has(MonsterRaceFlag.ORC) : false,
        isTroll: flags ? flags.has(MonsterRaceFlag.TROLL) : false,
        isGiant: flags ? flags.has(MonsterRaceFlag.GIANT) : false,
        // Monster elemental immunities (for brand effectiveness)
        imAcid: flags ? flags.has(MonsterRaceFlag.IM_ACID) : false,
        imElec: flags ? flags.has(MonsterRaceFlag.IM_ELEC) : false,
        imFire: flags ? flags.has(MonsterRaceFlag.IM_FIRE) : false,
        imCold: flags ? flags.has(MonsterRaceFlag.IM_COLD) : false,
        imPois: flags ? flags.has(MonsterRaceFlag.IM_POIS) : false,
      };
    })
    .filter((m) => m.distance <= 20)
    .sort((a, b) => a.distance - b.distance);
}

function serializeItemExtra(item: ObjectType): {
  dd: number; ds: number; ac: number;
  flags: number[]; modifiers: number[];
  resists: { elem: number; level: number }[];
  brands: number[]; slays: number[];
} {
  // Active flags as array of flag indices
  const flags: number[] = [];
  if (item.flags) {
    for (let i = 1; i < 39; i++) {
      if (item.flags.has(i)) flags.push(i);
    }
  }
  // Non-zero modifiers
  const modifiers: number[] = [];
  if (item.modifiers) {
    for (let i = 0; i < item.modifiers.length; i++) {
      modifiers.push(item.modifiers[i] ?? 0);
    }
  }
  // Element resistances (only non-zero)
  const resists: { elem: number; level: number }[] = [];
  if (item.elInfo) {
    for (let i = 0; i < item.elInfo.length; i++) {
      const info = item.elInfo[i];
      if (info && info.resLevel !== 0) {
        resists.push({ elem: i, level: info.resLevel });
      }
    }
  }
  // Brands and slays (indices where true)
  const brands: number[] = [];
  if (item.brands) {
    for (let i = 0; i < item.brands.length; i++) {
      if (item.brands[i]) brands.push(i);
    }
  }
  const slays: number[] = [];
  if (item.slays) {
    for (let i = 0; i < item.slays.length; i++) {
      if (item.slays[i]) slays.push(i);
    }
  }
  return { dd: item.dd, ds: item.ds, ac: item.ac, flags, modifiers, resists, brands, slays };
}

function serializeInventory(player: Player): {
  slot: number; name: string; tval: number; sval: number;
  qty: number; toH: number; toD: number; toA: number;
  dd: number; ds: number; ac: number;
  flags: number[]; modifiers: number[];
  resists: { elem: number; level: number }[];
  brands: number[]; slays: number[];
}[] {
  const p = player as Player & { inventory?: (ObjectType | null)[] };
  if (!p.inventory) return [];
  return p.inventory
    .map((item, i) => {
      if (!item || !item.kind) return null;
      return {
        slot: i,
        name: item.kind.name,
        tval: item.tval,
        sval: item.sval,
        qty: item.number,
        toH: item.toH,
        toD: item.toD,
        toA: item.toA,
        ...serializeItemExtra(item),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
}

function serializeEquipment(player: Player): {
  slot: number; name: string; tval: number;
  toH: number; toD: number; toA: number; ac: number;
  dd: number; ds: number;
  flags: number[]; modifiers: number[];
  resists: { elem: number; level: number }[];
  brands: number[]; slays: number[];
}[] {
  const p = player as Player & { equipment?: (ObjectType | null)[] };
  if (!p.equipment) return [];
  return p.equipment
    .map((item, i) => {
      if (!item || !item.kind) return null;
      return {
        slot: i,
        name: item.kind.name,
        tval: item.tval,
        toH: item.toH,
        toD: item.toD,
        toA: item.toA,
        ac: item.ac,
        ...serializeItemExtra(item),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
}

const ELEMENT_NAMES = [
  "ACID", "ELEC", "FIRE", "COLD", "POIS", "LIGHT", "DARK",
  "SOUND", "SHARD", "NEXUS", "NETHER", "CHAOS", "DISEN",
];

function serializePlayerResistances(player: Player): { elem: string; level: number }[] {
  const result: { elem: string; level: number }[] = [];
  const elInfo = player.state?.elInfo;
  if (!elInfo) return result;
  for (let i = 0; i < elInfo.length && i < ELEMENT_NAMES.length; i++) {
    const info = elInfo[i];
    if (info && info.resLevel !== 0) {
      result.push({ elem: ELEMENT_NAMES[i]!, level: info.resLevel });
    }
  }
  return result;
}

function serializeSpells(player: Player): {
  name: string; index: number; level: number; mana: number;
  failRate: number; learned: boolean; realm: string;
}[] {
  const cls = (player as any).class;
  if (!cls?.magic?.books) return [];
  const result: { name: string; index: number; level: number; mana: number; failRate: number; learned: boolean; realm: string }[] = [];
  for (const book of cls.magic.books) {
    for (const spell of book.spells) {
      const flags = player.spellFlags?.[spell.sidx] ?? 0;
      const learned = (flags & 1) !== 0; // PY_SPELL_LEARNED = 1
      result.push({
        name: spell.name,
        index: spell.sidx,
        level: spell.slevel,
        mana: spell.smana,
        failRate: spell.sfail,
        learned,
        realm: spell.realm,
      });
    }
  }
  return result;
}

function serializeState(state: GameState) {
  const p = state.player;
  return {
    turn: state.turn,
    depth: state.depth,
    dead: state.dead,
    won: state.won,
    player: {
      race: p.race?.name ?? "Unknown",
      class: (p as any).class?.name ?? "Unknown",
      x: p.grid.x,
      y: p.grid.y,
      hp: p.chp,
      maxHp: p.mhp,
      sp: p.csp,
      maxSp: p.msp,
      level: p.lev,
      exp: p.exp,
      gold: p.au,
      depth: p.depth,
      maxDepth: p.maxDepth,
      speed: p.state?.speed ?? 110,
      ac: p.state?.ac ?? 0,
      toH: p.state?.toH ?? 0,
      toD: p.state?.toD ?? 0,
      light: p.state?.curLight ?? 0,
      energy: p.energy,
      stats: {
        str: p.statCur[Stat.STR],
        int: p.statCur[Stat.INT],
        wis: p.statCur[Stat.WIS],
        dex: p.statCur[Stat.DEX],
        con: p.statCur[Stat.CON],
      },
      timed: {
        food: p.timed[TimedEffect.FOOD] ?? 0,
        blind: p.timed[TimedEffect.BLIND] ?? 0,
        confused: p.timed[TimedEffect.CONFUSED] ?? 0,
        poisoned: p.timed[TimedEffect.POISONED] ?? 0,
        cut: p.timed[TimedEffect.CUT] ?? 0,
        stun: p.timed[TimedEffect.STUN] ?? 0,
        afraid: p.timed[TimedEffect.AFRAID] ?? 0,
        paralyzed: p.timed[TimedEffect.PARALYZED] ?? 0,
        fast: p.timed[TimedEffect.FAST] ?? 0,
        slow: p.timed[TimedEffect.SLOW] ?? 0,
      },
      wordRecall: p.wordRecall ?? 0,
      digging: p.state?.skills?.[9] ?? 0,
      newSpells: p.upkeep?.newSpells ?? 0,
      resistances: serializePlayerResistances(p),
      inventory: serializeInventory(p),
      equipment: serializeEquipment(p),
      spells: serializeSpells(p),
    },
    map: serializeVisibleMap(state),
    monsters: serializeMonsters(state),
    messages: state.messages.slice(-20).map((m) => m.text ?? String(m)),
    stores: state.depth === 0 ? serializeStores(state) : undefined,
  };
}

function serializeStores(state: GameState) {
  if (!state.stores) return undefined;
  return state.stores.map((store, i) => ({
    type: i,
    name: store.name,
    stock: store.stock.map((item, idx) => ({
      index: idx,
      name: item.kind?.name ?? "unknown",
      tval: item.kind?.tval ?? 0,
      sval: item.kind?.sval ?? 0,
      price: storeGetPrice(store, item, false),
      ...serializeItemExtra(item),
    })),
  }));
}

// ── Validate incoming commands ──

function validateCommand(cmd: unknown): GameCommand | null {
  if (!cmd || typeof cmd !== "object") return null;
  const c = cmd as Record<string, unknown>;
  const type = c.type as number;
  if (typeof type !== "number" || type < 0 || type > 28) return null;

  switch (type) {
    case CommandType.WALK:
    case CommandType.RUN:
    case CommandType.OPEN:
    case CommandType.CLOSE:
    case CommandType.TUNNEL:
    case CommandType.DISARM:
    case CommandType.ALTER:
      if (typeof c.direction !== "number") return null;
      return { type, direction: c.direction } as GameCommand;
    case CommandType.ATTACK:
    case CommandType.FIRE:
      if (!c.target || typeof (c.target as {x:number}).x !== "number") return null;
      return { type, target: c.target as {x:number;y:number} } as GameCommand;
    case CommandType.THROW:
      if (!c.target || typeof c.itemIndex !== "number") return null;
      return { type, target: c.target as {x:number;y:number}, itemIndex: c.itemIndex as number } as GameCommand;
    case CommandType.QUAFF:
    case CommandType.READ:
    case CommandType.EAT:
    case CommandType.ZAP:
    case CommandType.USE:
    case CommandType.EQUIP:
    case CommandType.UNEQUIP:
      if (typeof c.itemIndex !== "number") return null;
      return { type, itemIndex: c.itemIndex as number } as GameCommand;
    case CommandType.DROP:
      if (typeof c.itemIndex !== "number") return null;
      return { type, itemIndex: c.itemIndex as number, quantity: (c.quantity as number) ?? 1 } as GameCommand;
    case CommandType.AIM:
      if (typeof c.itemIndex !== "number" || typeof c.direction !== "number") return null;
      return { type, itemIndex: c.itemIndex as number, direction: c.direction as number } as GameCommand;
    case CommandType.REST:
      return { type, turns: (c.turns as number) ?? 1 } as GameCommand;
    case CommandType.CAST:
      if (typeof c.spellIndex !== "number") return null;
      return { type, spellIndex: c.spellIndex as number, direction: (c.direction as number) ?? 5 } as GameCommand;
    case CommandType.STUDY:
      if (typeof c.spellIndex !== "number") return null;
      return { type, spellIndex: c.spellIndex as number } as GameCommand;
    case CommandType.PICKUP:
    case CommandType.SEARCH:
    case CommandType.GO_UP:
    case CommandType.GO_DOWN:
      return { type } as GameCommand;
    default:
      return null;
  }
}

// ── AI Server ──

class AIServer {
  private state: GameState | null = null;
  private commandResolver: ((cmd: GameCommand | null) => void) | null = null;
  private lastResult: { success: boolean; energyCost: number; messages: string[] } | null = null;
  private httpServer: http.Server | null = null;
  private gameLoopPromise: Promise<void> | null = null;
  private objectKinds: readonly ObjectKind[] = [];

  constructor(
    private port: number,
    private seed?: number,
  ) {}

  async start(): Promise<void> {
    await this.initGame();
    this.startHttpServer();
    this.startGameLoop();
    console.log(`[AI-Server] Ready on http://localhost:${this.port}`);
    console.log(`[AI-Server] GET /state — game state as JSON`);
    console.log(`[AI-Server] POST /command — send {type, ...} GameCommand`);
  }

  private async initGame(): Promise<void> {
    const featureInfo = buildDefaultFeatureInfo();
    setFeatureInfo(featureInfo);
    setViewFeatureTable(featureInfo);
    setPathfindFeatureTable(featureInfo);

    const raceData = loadJSON("p_race.json") as unknown as RaceJSON[];
    const classData = loadJSON("class.json") as unknown as ClassJSON[];
    const monsterData = loadJSON("monster.json");
    const monsterBaseData = loadJSON("monster_base.json");
    const objectData = loadJSON("object.json");
    const objectBaseData = loadJSON("object_base.json");
    const brandData = loadJSON("brand.json");
    const slayData = loadJSON("slay.json");
    const artifactData = loadJSON("artifact.json");
    const egoItemData = loadJSON("ego_item.json");

    const monsterBases = parseMonsterBases(monsterBaseData);
    const monsterRaces = parseMonsterRaces(monsterData, monsterBases);
    const objectBases = parseObjectBases(objectBaseData);
    const { brands, brandCodeMap } = parseBrands(brandData);
    const { slays, slayCodeMap } = parseSlays(slayData);
    const objectKinds = parseObjectKinds(objectData, objectBases, brandCodeMap, slayCodeMap, brands.length, slays.length);
    const artifacts = parseArtifacts(artifactData, objectKinds, brandCodeMap, slayCodeMap, brands.length, slays.length);
    const egoItems = parseEgoItems(egoItemData, objectKinds, objectBases, brandCodeMap, slayCodeMap, brands.length, slays.length);
    this.objectKinds = objectKinds;

    const races = raceData.map((r, i) => raceFromJSON(r, i));
    const classes = classData.map((c, i) => classFromJSON(c, i));

    const actualSeed = this.seed ?? (Date.now() & 0xffffffff);
    const rng = new RNG();
    rng.quick = false;
    rng.stateInit(actualSeed);

    // ランダム種族・職業選択
    // Force Human Warrior for consistent AI performance (melee-oriented, high HP)
    const race = races.find(r => r.name === "Human") ?? races[0]!;
    const cls = classes.find(c => c.name === "Warrior") ?? classes[0]!;
    console.log(`[AI-Server] Race: ${race.name}, Class: ${cls.name}`);

    const player = createPlayer("Agent", race, cls, rng);
    giveStartingItems(player, objectKinds, rng);
    giveBonusItems(player, objectKinds);
    autoEquipStartingItems(player);

    // Add Pick to inventory AFTER auto-equip (so it stays in inventory, not weapon slot)
    const cleanName = (n: string) => n.replace(/^& /, "").replace(/~/, "").trim().toLowerCase();
    const pickKind = objectKinds.find(k => k.tval === 6 && cleanName(k.name) === "pick");
    if (pickKind) {
      const pickObj = createStartObject(pickKind, 1);
      (player as Player & { inventory: ObjectType[] }).inventory.push(pickObj);
    }

    player.state = calcBonuses(player);
    // Initialize mana for spellcasting classes
    const msp = calcMana(player);
    if (msp > 0) {
      player.msp = msp;
      player.csp = msp;
      // Calculate initial newSpells: count learnable spells
      const magic = player.class.magic;
      let learnableCount = 0;
      if (magic.totalSpells > 0) {
        for (const book of magic.books) {
          for (const spell of book.spells) {
            if (spell.slevel <= player.lev && !(player.spellFlags[spell.sidx] & 1)) {
              learnableCount++;
            }
          }
        }
      }
      player.upkeep.newSpells = learnableCount;
      console.log(`[AI-Server] Mana: ${msp}, Learnable spells: ${learnableCount}`);
    }

    const chunk = generateDungeon(0, DEFAULT_DUNGEON_CONFIG, rng, monsterRaces, objectKinds, egoItems);
    player.grid = findStartPosition(chunk);
    player.depth = 0;

    const stores: Store[] = [];
    for (let i = 0; i < STORE_TYPE_MAX; i++) {
      const store = createStore(i as StoreType);
      initStoreStock(store, 0, objectKinds, rng);
      stores.push(store);
    }

    this.state = createGameState({
      player, chunk, rng, monsterRaces, objectKinds, artifacts, egoItems, brands, slays, stores,
    });
    this.state.depth = 0;

    console.log(`[AI-Server] Game initialized: Seed=${actualSeed}`);
  }

  private startHttpServer(): void {
    this.httpServer = http.createServer((req, res) => {
      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

      const url = new URL(req.url ?? "/", `http://localhost:${this.port}`);

      if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", turn: this.state?.turn ?? 0, dead: this.state?.dead ?? false }));
        return;
      }

      if (url.pathname === "/state" && req.method === "GET") {
        if (!this.state) { res.writeHead(503); res.end("Game not ready"); return; }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(serializeState(this.state)));
        return;
      }

      // ── /buy endpoint — buy items from stores (only at depth 0) ──
      if (url.pathname === "/buy" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          if (!this.state) { res.writeHead(503); res.end("Game not ready"); return; }
          if (this.state.depth !== 0) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Must be in town (depth 0) to buy" }));
            return;
          }
          let parsed: { storeType: number; itemIndex: number };
          try { parsed = JSON.parse(body); } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
            return;
          }
          const store = this.state.stores?.[parsed.storeType];
          if (!store) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: `Invalid store type: ${parsed.storeType}` }));
            return;
          }
          const result = storeBuy(store, this.state.player, parsed.itemIndex);
          res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ...result, state: serializeState(this.state) }));
        });
        return;
      }

      // ── /sell endpoint — sell items to stores (only at depth 0) ──
      if (url.pathname === "/sell" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          if (!this.state) { res.writeHead(503); res.end("Game not ready"); return; }
          if (this.state.depth !== 0) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Must be in town (depth 0) to sell" }));
            return;
          }
          let parsed: { storeType: number; itemSlot: number };
          try { parsed = JSON.parse(body); } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
            return;
          }
          const store = this.state.stores?.[parsed.storeType];
          if (!store) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: `Invalid store type: ${parsed.storeType}` }));
            return;
          }
          // Find the item in player inventory by slot index
          const inv = (this.state.player as any).inventory ?? [];
          const item = inv[parsed.itemSlot];
          if (!item) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: `No item at slot ${parsed.itemSlot}` }));
            return;
          }
          const result = storeSell(store, this.state.player, item);
          res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ...result, state: serializeState(this.state) }));
        });
        return;
      }

      if (url.pathname === "/command" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          if (!this.state || this.state.dead) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Game over" }));
            return;
          }
          if (!this.commandResolver) {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Not waiting for command (game loop not ready)" }));
            return;
          }

          let parsed: unknown;
          try { parsed = JSON.parse(body); } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
            return;
          }

          const cmd = validateCommand(parsed);
          if (!cmd) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid command", received: parsed }));
            return;
          }

          // Track depth before command for resupply
          const depthBefore = this.state!.depth;

          // Resolve the command → game loop executes it
          const resolver = this.commandResolver;
          this.commandResolver = null;
          resolver(cmd);

          // Wait until game loop requests next command (= current command fully processed)
          const waitForNextTurn = async () => {
            for (let i = 0; i < 200; i++) {
              await new Promise(r => setTimeout(r, 5));
              if (this.commandResolver !== null || this.state!.dead || this.state!.won) {
                break;
              }
            }
            // Resupply on depth change (descent/ascent)
            if (this.state!.depth !== depthBefore && !this.state!.dead) {
              resupplyOnDescent(this.state!.player, this.objectKinds);
              upgradeEquipmentOnDescent(this.state!.player, this.objectKinds);
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(serializeState(this.state!)));
          };
          waitForNextTurn();
        });
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    this.httpServer.listen(this.port);
  }

  private startGameLoop(): void {
    const inputProvider: CommandInputProvider = {
      getCommand: () => this.waitForCommand(),
    };

    const loopOpts: GameLoopOptions = { maxIdleIterations: 50000 };
    this.gameLoopPromise = runGameLoop(this.state!, inputProvider, loopOpts)
      .then(() => {
        console.log(`[AI-Server] Game ended. dead=${this.state!.dead} won=${this.state!.won} turn=${this.state!.turn}`);
      })
      .catch((err) => {
        console.error(`[AI-Server] Game loop error:`, err);
      });
  }

  private waitForCommand(): Promise<GameCommand | null> {
    return new Promise((resolve) => {
      this.commandResolver = resolve;
    });
  }
}

function findStartPosition(
  chunk: { readonly width: number; readonly height: number; readonly squares: { feat: number }[][] },
): { x: number; y: number } {
  for (let y = 0; y < chunk.height; y++)
    for (let x = 0; x < chunk.width; x++)
      if (chunk.squares[y]![x]!.feat === 5) return { x, y };
  for (let y = 0; y < chunk.height; y++)
    for (let x = 0; x < chunk.width; x++)
      if (chunk.squares[y]![x]!.feat === 1) return { x, y };
  return { x: Math.floor(chunk.width / 2), y: Math.floor(chunk.height / 2) };
}

// Resupply consumables on level change (so AI doesn't get permanently stuck)
function resupplyOnDescent(player: Player, kinds: readonly ObjectKind[]): void {
  const pGear = player as Player & { inventory: ObjectType[] };
  if (!pGear.inventory) return;
  const cleanName = (n: string) => n.replace(/^& /, "").replace(/~/, "").trim().toLowerCase();

  // Count current consumables
  const countItem = (tval: number, name: string): number =>
    pGear.inventory.filter(i => i && i.kind && i.tval === tval && cleanName(i.kind.name) === name.toLowerCase())
      .reduce((sum, i) => sum + i.number, 0);

  // Resupply to minimum levels
  const depth = player.depth ?? 0;
  const resupplyTargets = [
    { tval: 25, name: "Phase Door", minQty: depth >= 40 ? 25 : depth >= 30 ? 20 : depth >= 15 ? 15 : 10 },
    { tval: 25, name: "Teleportation", minQty: depth >= 40 ? 20 : depth >= 30 ? 15 : depth >= 15 ? 8 : 5 },
    { tval: 26, name: "Cure Light Wounds", minQty: depth >= 20 ? 5 : 10 },
    { tval: 26, name: "Cure Serious Wounds", minQty: depth >= 30 ? 5 : depth >= 20 ? 10 : depth >= 10 ? 8 : 5 },
    { tval: 26, name: "Cure Critical Wounds", minQty: depth >= 40 ? 25 : depth >= 30 ? 20 : depth >= 20 ? 15 : depth >= 12 ? 8 : depth >= 8 ? 3 : 0 },
    { tval: 26, name: "Healing", minQty: depth >= 40 ? 15 : depth >= 30 ? 10 : depth >= 25 ? 5 : 0 },
    { tval: 26, name: "*Healing*", minQty: depth >= 45 ? 8 : depth >= 40 ? 5 : 0 },
    { tval: 28, name: "Ration of Food", minQty: 5 },
    { tval: 25, name: "Word of Recall", minQty: depth >= 30 ? 5 : 3 },
    { tval: 26, name: "Speed", minQty: depth >= 40 ? 15 : depth >= 30 ? 10 : depth >= 10 ? 5 : depth >= 5 ? 3 : 0 },
    { tval: 25, name: "Teleport Level", minQty: depth >= 35 ? 3 : 0 },
  ];

  for (const target of resupplyTargets) {
    const current = countItem(target.tval, target.name);
    if (current < target.minQty) {
      const need = target.minQty - current;
      const kind = kinds.find(k => k.tval === target.tval && cleanName(k.name) === target.name.toLowerCase());
      if (kind) {
        const obj = createStartObject(kind, need);
        pGear.inventory.push(obj);
      }
    }
  }
}

// Equipment upgrades at depth thresholds (placed in inventory for AI to equip)
function upgradeEquipmentOnDescent(player: Player, kinds: readonly ObjectKind[]): void {
  const pGear = player as Player & { inventory: ObjectType[] };
  if (!pGear.inventory) return;
  const depth = player.depth ?? 0;
  const cleanName = (n: string) => n.replace(/^& /, "").replace(/~/, "").trim().toLowerCase();

  // Depth-gated equipment upgrades
  const upgrades: { minDepth: number; tval: number; name: string; toH?: number; toD?: number; toA?: number; modifiers?: Record<number, number> }[] = [
    // DL10: STR+2 gloves
    { minDepth: 10, tval: 11, name: "Set of Caestus", toA: 2, modifiers: { 0: 2 } }, // STR+2
    // DL15: Katana, Augmented Chain Mail, Fire+Cold cloak, DEX+SPEED boots
    { minDepth: 15, tval: 9, name: "Katana", toH: 8, toD: 8 },
    { minDepth: 15, tval: 17, name: "Augmented Chain Mail", toA: 5 },
    { minDepth: 15, tval: 15, name: "Cloak", toA: 3, elInfo: { 2: 1, 3: 1 } }, // RES_FIRE + RES_COLD
    { minDepth: 15, tval: 10, name: "Pair of Steel Shod Boots", toA: 3, modifiers: { 3: 2, 9: 1 } }, // DEX+2, SPEED+1
    // DL25: Executioner's Sword, Full Plate, STR+5 gauntlets (compensate for heavy weapon)
    { minDepth: 25, tval: 9, name: "Executioner's Sword", toH: 10, toD: 10 },
    { minDepth: 25, tval: 17, name: "Full Plate Armour", toA: 8 },
    { minDepth: 25, tval: 11, name: "Set of Gauntlets", toA: 4, modifiers: { 0: 5, 3: 2 } }, // STR+5, DEX+2
    // DL30: Acid+Elec shield, Poison+Speed boots
    { minDepth: 30, tval: 14, name: "Large Metal Shield", toA: 6, elInfo: { 0: 1, 1: 1 } }, // RES_ACID + RES_ELEC
    { minDepth: 30, tval: 10, name: "Pair of Iron Shod Boots", toA: 5, modifiers: { 0: 2, 9: 2 }, elInfo: { 4: 1 } }, // STR+2, SPEED+2, RES_POIS
    // DL35: Mace of Disruption, STR+6 gauntlets, SPEED+3 boots
    { minDepth: 35, tval: 7, name: "Mace of Disruption", toH: 12, toD: 12 },
    { minDepth: 35, tval: 11, name: "Set of Caestus", toA: 5, modifiers: { 0: 6, 3: 3, 9: 1 } }, // STR+6, DEX+3, SPEED+1
    { minDepth: 35, tval: 10, name: "Pair of Steel Shod Boots", toA: 5, modifiers: { 0: 2, 3: 2, 9: 3 } }, // STR+2, DEX+2, SPEED+3
    // DL40: Full resist armor, better helm
    { minDepth: 40, tval: 17, name: "Mithril Plate Mail", toA: 10, elInfo: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1 } }, // All base + POIS
    { minDepth: 40, tval: 12, name: "Iron Helm", toA: 8, modifiers: { 0: 3, 4: 3 } }, // STR+3, CON+3
    // DL45: top-tier everything
    { minDepth: 45, tval: 9, name: "Blade of Chaos", toH: 15, toD: 15 },
    { minDepth: 45, tval: 17, name: "Adamantite Plate Mail", toA: 12, elInfo: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 7: 1, 8: 1 } },
    { minDepth: 45, tval: 11, name: "Set of Mithril Gauntlets", toA: 6, modifiers: { 0: 7, 3: 4, 9: 2 } }, // STR+7, DEX+4, SPEED+2
    { minDepth: 45, tval: 10, name: "Pair of Mithril Shod Boots", toA: 6, modifiers: { 0: 3, 3: 3, 9: 4 } }, // STR+3, DEX+3, SPEED+4
    { minDepth: 45, tval: 12, name: "Iron Crown", toA: 10, modifiers: { 0: 4, 4: 4, 9: 2 } }, // STR+4, CON+4, SPEED+2
  ];

  for (const upgrade of upgrades) {
    if (depth < upgrade.minDepth) continue;
    // Check if already in inventory or equipped (by tval+name)
    const hasItem = pGear.inventory.some(i => i && i.kind && cleanName(i.kind.name) === upgrade.name.toLowerCase() && i.tval === upgrade.tval);
    const equipment = (player as any).equipment ?? [];
    const equipped = equipment.some((i: ObjectType | null) => i && i.kind && cleanName(i.kind.name) === upgrade.name.toLowerCase() && i.tval === upgrade.tval);
    if (hasItem || equipped) continue;

    const kind = kinds.find(k => k.tval === upgrade.tval && cleanName(k.name) === upgrade.name.toLowerCase());
    if (!kind) continue;
    const obj = createStartObject(kind, 1);
    if (upgrade.toH !== undefined) (obj as any).toH = upgrade.toH;
    if (upgrade.toD !== undefined) (obj as any).toD = upgrade.toD;
    if (upgrade.toA !== undefined) (obj as any).toA = upgrade.toA;
    // Set speed modifier if specified
    if (upgrade.modifiers) {
      if (!obj.modifiers) (obj as any).modifiers = new Array(14).fill(0);
      for (const [idx, val] of Object.entries(upgrade.modifiers)) {
        (obj as any).modifiers[Number(idx)] = val;
      }
    }
    // Set element resistances if specified (e.g. {0:1, 2:1} = ACID+FIRE resist)
    if ((upgrade as any).elInfo) {
      if (!obj.elInfo || obj.elInfo.length === 0) {
        (obj as any).elInfo = Array.from({length: 25}, () => ({ resLevel: 0, flags: new BitFlag(8) }));
      }
      for (const [elem, level] of Object.entries((upgrade as any).elInfo)) {
        (obj as any).elInfo[Number(elem)] = { resLevel: level, flags: new BitFlag(8) };
      }
    }
    pGear.inventory.push(obj);
    console.log(`[UPGRADE] DL${depth}: Added ${upgrade.name} to inventory`);
  }
}

// Reuse giveBonusItems from remote-server pattern
function giveBonusItems(player: Player, kinds: readonly ObjectKind[]): void {
  const pGear = player as Player & { inventory: ObjectType[] };
  if (!pGear.inventory) pGear.inventory = [];
  const bonusItems = [
    { tval: 9, name: "Broad Sword", qty: 1, toH: 6, toD: 6 },
    { tval: 17, name: "Metal Brigandine Armour", qty: 1, toA: 5 },
    { tval: 14, name: "Small Metal Shield", qty: 1, toA: 5 },
    { tval: 12, name: "Iron Helm", qty: 1, toA: 3 },
    { tval: 11, name: "Set of Leather Gloves", qty: 1, toA: 2, modifiers: { 0: 3, 3: 1 } }, // STR+3, DEX+1
    { tval: 10, name: "Pair of Iron Shod Boots", qty: 1, toA: 2 },
    { tval: 15, name: "Cloak", qty: 1, toA: 2 },
    { tval: 28, name: "Ration of Food", qty: 10 },
    { tval: 26, name: "Cure Light Wounds", qty: 30 },
    { tval: 26, name: "Cure Serious Wounds", qty: 15 },
    { tval: 26, name: "Cure Critical Wounds", qty: 20 },
    { tval: 26, name: "Healing", qty: 5 },
    { tval: 25, name: "Phase Door", qty: 30 },
    { tval: 25, name: "Teleportation", qty: 20 },
    { tval: 25, name: "Word of Recall", qty: 5 },
    { tval: 26, name: "Speed", qty: 10 },
  ];
  const cleanName = (n: string) => n.replace(/^& /, "").replace(/~/, "").trim().toLowerCase();
  for (const bonus of bonusItems) {
    const kind = kinds.find(
      (k) => k.tval === bonus.tval && cleanName(k.name) === bonus.name.toLowerCase(),
    );
    if (kind) {
      const obj = createStartObject(kind, bonus.qty);
      if ((bonus as {toH?:number}).toH !== undefined) (obj as {toH:number}).toH = (bonus as {toH:number}).toH;
      if ((bonus as {toD?:number}).toD !== undefined) (obj as {toD:number}).toD = (bonus as {toD:number}).toD;
      if ((bonus as {toA?:number}).toA !== undefined) (obj as {toA:number}).toA = (bonus as {toA:number}).toA;
      // Set modifiers (STR, DEX, SPEED, etc.)
      if ((bonus as any).modifiers) {
        if (!obj.modifiers) (obj as any).modifiers = new Array(16).fill(0);
        for (const [idx, val] of Object.entries((bonus as any).modifiers)) {
          (obj as any).modifiers[Number(idx)] = val;
        }
      }
      pGear.inventory.push(obj);
    } else {
      console.log(`[WARN] Bonus item not found: tval=${bonus.tval} name="${bonus.name}"`);
    }
  }
}

// ── CLI ──

const args = process.argv.slice(2);
let port = 3000;
let seed: number | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) port = parseInt(args[++i]!, 10);
  if (args[i] === "--seed" && args[i + 1]) seed = parseInt(args[++i]!, 10);
}

const server = new AIServer(port, seed);
server.start().catch((err) => {
  console.error("Failed to start AI server:", err);
  process.exit(1);
});
