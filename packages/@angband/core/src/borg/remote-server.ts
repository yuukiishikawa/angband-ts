/**
 * @file borg/remote-server.ts
 * @brief TCP server for remote C borg play of TS Angband
 *
 * Runs a headless TS Angband game and exposes it over TCP using a
 * simple text-based protocol. The C borg connects, receives screen
 * frames (FRAME/ROW/CURSOR/STAT/END), and sends back keypresses
 * (KEY <code> <mods>).
 *
 * Usage:
 *   npx tsx packages/@angband/core/src/borg/remote-server.ts --port 9876
 */

import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

import { RNG } from "../z/rand.js";
import { BitFlag } from "../z/bitflag.js";
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
import type { Player, PlayerRace, PlayerClass, ClassMagic, StartItem } from "../types/player.js";
import { Stat } from "../types/player.js";
import { createStore, initStoreStock, StoreType, STORE_TYPE_MAX } from "../store/store.js";
import type { Store } from "../store/store.js";
import type { GameCommand } from "../command/core.js";
import { GameEventType } from "../game/event.js";
import { EquipSlot } from "../types/player.js";
import { equipItem } from "../object/gear.js";
import { calcBonuses } from "../player/calcs.js";

import { ScreenBuffer, ScreenRenderer, TERM_COLS, TERM_ROWS } from "./screen-renderer.js";
import { KeyTranslator } from "./key-translator.js";

// ── JSON data types and parse helpers (from headless.ts) ──

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
    spellFirst: 1, spellWeight: 300, numBooks: 0, books: [], totalSpells: 0,
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

// ── Starting equipment ──

const TVAL_NAME_MAP: Record<string, number> = {
  chest: 1, shot: 2, arrow: 3, bolt: 4,
  bow: 5, digger: 6, hafted: 7, polearm: 8, sword: 9,
  boots: 10, gloves: 11, helm: 12, crown: 13,
  shield: 14, cloak: 15,
  "soft armor": 16, "soft armour": 16,
  "hard armor": 17, "hard armour": 17,
  "dragon armor": 18,
  light: 19, amulet: 20, ring: 21,
  staff: 22, wand: 23, rod: 24,
  scroll: 25, potion: 26, flask: 27,
  food: 28, mushroom: 29,
  "magic book": 30, "prayer book": 31,
  "nature book": 32, "shadow book": 33,
};

function findStartItemKind(
  item: StartItem,
  kinds: readonly ObjectKind[],
): ObjectKind | null {
  if (!item.tvalName || !item.svalName) return null;
  const tval = TVAL_NAME_MAP[item.tvalName];
  if (tval === undefined) return null;
  const svalLower = item.svalName.replace(/^\[|\]$/g, "").toLowerCase();
  return kinds.find((k) => k.tval === tval && k.name.toLowerCase() === svalLower) ?? null;
}

function createStartObject(kind: ObjectKind, quantity: number): ObjectType {
  return {
    kind,
    ego: null,
    artifact: null,
    prev: null,
    next: null,
    known: null,
    oidx: 0 as never,
    grid: { x: 0, y: 0 },
    tval: kind.tval,
    sval: kind.sval,
    pval: 0,
    weight: kind.weight,
    dd: kind.dd,
    ds: kind.ds,
    ac: kind.ac,
    toA: 0,
    toH: 0,
    toD: 0,
    flags: new BitFlag(39),
    modifiers: new Array(16).fill(0) as number[],
    elInfo: [],
    brands: null,
    slays: null,
    curses: null,
    effect: kind.effect,
    effectMsg: kind.effectMsg,
    activation: kind.activation,
    time: kind.time,
    timeout: 0,
    number: quantity,
    notice: 0,
    heldMIdx: 0,
    mimickingMIdx: 0,
    origin: 0 as never,
    originDepth: 0,
    originRace: null,
    note: 0,
  } as ObjectType;
}

function giveStartingItems(
  player: Player,
  kinds: readonly ObjectKind[],
  rng: { randint0(n: number): number },
): void {
  const pGear = player as Player & { inventory: ObjectType[] };
  if (!pGear.inventory) pGear.inventory = [];
  for (const item of player.class.startItems) {
    const kind = findStartItemKind(item, kinds);
    if (!kind) continue;
    const quantity = item.min + (item.max > item.min ? rng.randint0(item.max - item.min + 1) : 0);
    if (quantity <= 0) continue;
    pGear.inventory.push(createStartObject(kind, quantity));
  }
}

/**
 * Give bonus healing potions for borg testing.
 * The C borg normally buys these from town stores, but the TS remote server
 * doesn't support store interaction. Give potions to enable deeper exploration.
 */
function giveBonusPotions(
  player: Player,
  kinds: readonly ObjectKind[],
): void {
  const pGear = player as Player & { inventory: ObjectType[] };
  if (!pGear.inventory) pGear.inventory = [];

  const POTION_TVAL = 26; // TVal.POTION
  const bonusItems = [
    { name: "Cure Light Wounds", qty: 10 },
    { name: "Cure Serious Wounds", qty: 5 },
    { name: "Speed", qty: 2 },
  ];

  for (const bonus of bonusItems) {
    const kind = kinds.find(
      (k) => k.tval === POTION_TVAL && k.name === bonus.name,
    );
    if (kind) {
      pGear.inventory.push(createStartObject(kind, bonus.qty));
    }
  }
}

/** Map tval to EquipSlot for auto-equipping starting items. */
const TVAL_TO_EQUIP_SLOT: Record<number, EquipSlot> = {
  6: EquipSlot.WEAPON,   // digger
  7: EquipSlot.WEAPON,   // hafted
  8: EquipSlot.WEAPON,   // polearm
  9: EquipSlot.WEAPON,   // sword
  5: EquipSlot.BOW,      // bow
  10: EquipSlot.BOOTS,   // boots
  11: EquipSlot.GLOVES,  // gloves
  12: EquipSlot.HAT,     // helm
  13: EquipSlot.HAT,     // crown
  14: EquipSlot.SHIELD,  // shield
  15: EquipSlot.CLOAK,   // cloak
  16: EquipSlot.BODY_ARMOR, // soft armour
  17: EquipSlot.BODY_ARMOR, // hard armour
  18: EquipSlot.BODY_ARMOR, // dragon armor
  19: EquipSlot.LIGHT,   // light
  20: EquipSlot.AMULET,  // amulet
  21: EquipSlot.RING,    // ring
};

function autoEquipStartingItems(player: Player): void {
  const pGear = player as Player & { inventory: ObjectType[] };
  if (!pGear.inventory) return;

  const toRemove: number[] = [];
  for (let i = 0; i < pGear.inventory.length; i++) {
    const item = pGear.inventory[i]!;
    const slot = TVAL_TO_EQUIP_SLOT[item.tval];
    if (slot !== undefined) {
      const result = equipItem(player, item, slot);
      if (result.success) {
        toRemove.push(i);
      }
    }
  }
  // Remove equipped items from inventory (reverse order to keep indices valid)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    pGear.inventory.splice(toRemove[i]!, 1);
  }
}

function findStartPosition(
  chunk: { readonly width: number; readonly height: number; readonly squares: { feat: number }[][] },
): { x: number; y: number } {
  for (let y = 0; y < chunk.height; y++) {
    for (let x = 0; x < chunk.width; x++) {
      if (chunk.squares[y]![x]!.feat === 5) return { x, y };
    }
  }
  for (let y = 0; y < chunk.height; y++) {
    for (let x = 0; x < chunk.width; x++) {
      if (chunk.squares[y]![x]!.feat === 1) return { x, y };
    }
  }
  return { x: Math.floor(chunk.width / 2), y: Math.floor(chunk.height / 2) };
}

function loadJSON(name: string): unknown[] {
  const gamedataDir = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../../gamedata",
  );
  const filePath = path.join(gamedataDir, name);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as unknown[];
}

// ── Protocol serialization ──

/**
 * Serialize the screen buffer into the FRAME protocol text.
 *
 * Format:
 *   FRAME
 *   ROW <y> <hex_chars> <hex_attrs>
 *   ... (24 rows)
 *   CURSOR <x> <y>
 *   STAT hp=<n> mhp=<n> sp=<n> msp=<n> lev=<n> depth=<n> speed=<n> dead=<0|1>
 *   STAT str=<n> int=<n> wis=<n> dex=<n> con=<n>
 *   END
 */
function serializeFrame(screen: ScreenBuffer, state: GameState, renderer: ScreenRenderer): string {
  const lines: string[] = ["FRAME"];

  for (let y = 0; y < TERM_ROWS; y++) {
    let hexChars = "";
    let hexAttrs = "";
    for (let x = 0; x < TERM_COLS; x++) {
      const cell = screen.cells[y]![x]!;
      // Encode character as 2-digit hex of ASCII code
      hexChars += cell.ch.charCodeAt(0).toString(16).padStart(2, "0");
      // Encode attribute as 1-digit hex (lower nibble of color index)
      hexAttrs += (cell.attr & 0xf).toString(16);
    }
    lines.push(`ROW ${y} ${hexChars} ${hexAttrs}`);
  }

  lines.push(`CURSOR ${screen.cursorX} ${screen.cursorY}`);

  const p = state.player;
  const speed = p.state.speed;
  const dead = state.dead ? 1 : 0;
  lines.push(
    `STAT hp=${p.chp} mhp=${p.mhp} sp=${p.csp} msp=${p.msp} lev=${p.lev} depth=${state.depth} speed=${speed} dead=${dead}`
  );
  lines.push(
    `STAT str=${p.statCur[Stat.STR]} int=${p.statCur[Stat.INT]} wis=${p.statCur[Stat.WIS]} dex=${p.statCur[Stat.DEX]} con=${p.statCur[Stat.CON]}`
  );
  // Camera offset and player position for C borg's coordinate mapping
  lines.push(
    `STAT wx=${renderer.getCameraX()} wy=${renderer.getCameraY()} px=${p.grid.x} py=${p.grid.y}`
  );

  // Inventory and equipment for C borg's borg_items[]
  // Format: INVEN <slot> <tval> <sval> <qty> <toH> <toD> <toA> <dd> <ds> <ac> <weight> <name>
  const pGear = p as Player & { inventory?: ObjectType[]; equipment?: (ObjectType | null)[] };

  // Pack inventory (slots 0..22)
  if (pGear.inventory) {
    for (let i = 0; i < pGear.inventory.length && i < 23; i++) {
      const item = pGear.inventory[i]!;
      if (!item.kind) continue;
      const name = item.kind.name.replace(/ /g, "_");
      lines.push(`INVEN ${i} ${item.tval} ${item.sval} ${item.number} ${item.toH} ${item.toD} ${item.toA} ${item.dd} ${item.ds} ${item.ac} ${item.weight} ${name}`);
    }
  }

  // Equipment (slots 23..34, matching C INVEN_WIELD=23 etc.)
  if (pGear.equipment) {
    for (let slot = 0; slot < pGear.equipment.length; slot++) {
      const item = pGear.equipment[slot];
      if (!item || !item.kind) continue;
      const cSlot = 23 + slot; // INVEN_WIELD = pack_size = 23
      const name = item.kind.name.replace(/ /g, "_");
      lines.push(`INVEN ${cSlot} ${item.tval} ${item.sval} ${item.number} ${item.toH} ${item.toD} ${item.toA} ${item.dd} ${item.ds} ${item.ac} ${item.weight} ${name}`);
    }
  }

  lines.push("END");

  return lines.join("\n") + "\n";
}

// ── Remote Borg Server ──

export class RemoteBorgServer {
  private screen: ScreenBuffer;
  private renderer: ScreenRenderer;
  private keyTranslator: KeyTranslator;
  private state: GameState | null = null;
  private keyResolver: ((cmd: GameCommand | null) => void) | null = null;
  private pendingCommands: GameCommand[] = [];
  private server: net.Server | null = null;
  private client: net.Socket | null = null;

  constructor(
    private port: number,
    private raceName: string = "Human",
    private className: string = "Warrior",
    private seed?: number,
  ) {
    this.screen = new ScreenBuffer();
    this.renderer = new ScreenRenderer(this.screen);
    this.keyTranslator = new KeyTranslator();
  }

  async start(): Promise<void> {
    // Initialize game data (same as headless.ts)
    const featureInfo = buildDefaultFeatureInfo();
    setFeatureInfo(featureInfo);
    setViewFeatureTable(featureInfo);
    setPathfindFeatureTable(featureInfo);

    const raceData = loadJSON("p_race.json") as RaceJSON[];
    const classData = loadJSON("class.json") as ClassJSON[];
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
    const objectKinds = parseObjectKinds(
      objectData, objectBases, brandCodeMap, slayCodeMap, brands.length, slays.length,
    );
    const artifacts = parseArtifacts(
      artifactData, objectKinds, brandCodeMap, slayCodeMap, brands.length, slays.length,
    );
    const egoItems = parseEgoItems(
      egoItemData, objectKinds, objectBases, brandCodeMap, slayCodeMap, brands.length, slays.length,
    );

    const races = raceData.map((r, i) => raceFromJSON(r, i));
    const classes = classData.map((c, i) => classFromJSON(c, i));

    const race = races.find((r) => r.name.toLowerCase() === this.raceName.toLowerCase());
    if (!race) throw new Error(`Race "${this.raceName}" not found`);
    const cls = classes.find((c) => c.name.toLowerCase() === this.className.toLowerCase());
    if (!cls) throw new Error(`Class "${this.className}" not found`);

    const actualSeed = this.seed ?? (Date.now() & 0xffffffff);
    const rng = new RNG();
    rng.quick = false;
    rng.stateInit(actualSeed);

    const player = createPlayer("Borg", race, cls, rng);
    giveStartingItems(player, objectKinds, rng);
    giveBonusPotions(player, objectKinds);
    autoEquipStartingItems(player);
    player.state = calcBonuses(player);

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

    console.log(`[RemoteBorg] Game initialized: Race=${this.raceName} Class=${this.className} Seed=${actualSeed}`);
    console.log(`[RemoteBorg] Waiting for C borg connection on port ${this.port}...`);

    // Wait for TCP client connection
    await this.waitForClient();

    console.log(`[RemoteBorg] Client connected, starting game loop`);

    // Create input provider that waits for TCP keys
    const inputProvider: CommandInputProvider = {
      getCommand: () => this.getCommandFromTCP(),
    };

    // Track REFRESH events for logging (don't send frames here —
    // frames are sent from getCommandFromTCP to maintain 1-frame-per-key sync)
    let frameCount = 0;
    this.state.eventBus.on(GameEventType.REFRESH, () => {
      frameCount++;
      if (frameCount <= 5 || frameCount % 100 === 0) {
        console.log(`[RemoteBorg] REFRESH #${frameCount}, turn=${this.state!.turn}, dead=${this.state!.dead}`);
      }
      // Dump screen on first frame for debugging
      if (frameCount === 1) {
        this.renderer.render(this.state!);
        console.log("[RemoteBorg] === SCREEN DUMP (frame 1) ===");
        for (let y = 0; y < TERM_ROWS; y++) {
          let line = "";
          for (let x = 0; x < TERM_COLS; x++) {
            line += this.screen.cells[y]![x]!.ch;
          }
          console.log(`[SCR ${String(y).padStart(2)}] ${line}`);
        }
        console.log(`[RemoteBorg] Player at (${this.state!.player.grid.x}, ${this.state!.player.grid.y})`);
        console.log(`[RemoteBorg] Camera: (${this.renderer.getCameraX()}, ${this.renderer.getCameraY()})`);
        console.log("[RemoteBorg] === END SCREEN DUMP ===");
      }
      // Don't sendScreenFrame here — sent from getCommandFromTCP instead
    });

    console.log(`[RemoteBorg] About to enter runGameLoop`);

    // Run game loop — use high idle limit since borg sends many non-energy commands
    const loopOpts: GameLoopOptions = { maxIdleIterations: 5000 };
    try {
      await runGameLoop(this.state, inputProvider, loopOpts);
    } catch (err: unknown) {
      console.error(`[RemoteBorg] Game loop error:`, err);
    }

    console.log(`[RemoteBorg] Game loop exited. dead=${this.state.dead} won=${this.state.won} turn=${this.state.turn} frames=${frameCount}`);

    // Send final frame (death/victory)
    this.sendScreenFrame();

    // Send DEAD message
    if (this.state.dead) {
      const reason = this.state.player.diedFrom || "unknown";
      this.sendLine(`DEAD ${reason}`);
      console.log(`[RemoteBorg] Player died: ${reason}`);
    }

    // Clean up
    this.client?.end();
    this.server?.close();
    console.log(`[RemoteBorg] Server shut down`);
  }

  private waitForClient(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        if (this.client) {
          socket.end("ERROR already connected\n");
          return;
        }
        this.client = socket;
        this.setupClientHandlers(socket);
        resolve();
      });

      this.server.on("error", (err) => {
        reject(err);
      });

      this.server.listen(this.port, "0.0.0.0");
    });
  }

  private setupClientHandlers(socket: net.Socket): void {
    const rl = readline.createInterface({ input: socket, crlfDelay: Infinity });

    rl.on("line", (line: string) => {
      this.handleClientLine(line.trim());
    });

    socket.on("close", () => {
      console.log(`[RemoteBorg] Client disconnected`);
      // Resolve any pending key wait with null (end game)
      if (this.keyResolver) {
        this.keyResolver(null);
        this.keyResolver = null;
      }
    });

    socket.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNRESET") {
        console.log(`[RemoteBorg] Client disconnected (reset)`);
      } else {
        console.error(`[RemoteBorg] Socket error:`, err);
      }
    });

    rl.on("error", () => {
      // Ignore readline errors on disconnect
    });
  }

  private handleClientLine(line: string): void {
    if (line.startsWith("KEY ")) {
      const parts = line.split(" ");
      const keyCode = parseInt(parts[1]!, 10);
      const mods = parseInt(parts[2] ?? "0", 10);

      if (isNaN(keyCode)) return;

      const cmd = this.keyTranslator.translate(keyCode, mods);
      if (cmd !== null) {
        if (this.keyResolver) {
          this.keyResolver(cmd);
          this.keyResolver = null;
        } else {
          // Buffer command — C borg may send multiple keys per frame
          this.pendingCommands.push(cmd);
        }
      } else {
        // Partial command (translator needs more keys) — send an
        // echo frame so the C borg doesn't block waiting for a
        // frame that never comes. The frame contains the unchanged
        // screen (no game state change occurred).
        this.sendScreenFrame();
      }
    } else if (line === "QUIT") {
      console.log(`[RemoteBorg] Client sent QUIT`);
      if (this.state) {
        this.state.dead = true;
        this.state.player.isDead = true;
      }
      if (this.keyResolver) {
        this.keyResolver(null);
        this.keyResolver = null;
      }
    }
  }

  /**
   * Called by the CommandInputProvider. Waits for a complete GameCommand
   * from the TCP key stream. Checks the pending buffer first.
   */
  private getCommandFromTCP(): Promise<GameCommand | null> {
    // Check if we already have a buffered command from a previous burst
    if (this.pendingCommands.length > 0) {
      const cmd = this.pendingCommands.shift()!;
      console.log(`[RemoteBorg] Got buffered command: type=${cmd.type} (${this.pendingCommands.length} remaining)`);
      return Promise.resolve(cmd);
    }

    // Send a screen frame BEFORE waiting for input.
    // This ensures 1-frame-per-command sync: the C borg receives a
    // frame reflecting the CURRENT game state (after all game events
    // like monster turns have been processed), then sends one key.
    this.sendScreenFrame();

    return new Promise((resolve) => {
      this.keyResolver = (cmd) => {
        if (cmd) {
          console.log(`[RemoteBorg] Got command: type=${cmd.type}`);
        } else {
          console.log(`[RemoteBorg] Got null command (disconnect?)`);
        }
        resolve(cmd);
      };
    });
  }

  /**
   * Render the current state and send a FRAME to the TCP client.
   */
  private sendScreenFrame(): void {
    if (!this.client || !this.state) return;
    this.renderer.render(this.state);
    const frame = serializeFrame(this.screen, this.state, this.renderer);
    this.sendLine(frame);
  }

  private sendLine(data: string): void {
    if (!this.client || this.client.destroyed) return;
    try {
      this.client.write(data.endsWith("\n") ? data : data + "\n");
    } catch {
      // Socket may have closed
    }
  }
}

// ── CLI entry point ──

function parseArgs(argv: string[]): { port: number; race: string; class: string; seed: number | undefined } {
  const opts: { port: number; race: string; class: string; seed: number | undefined } = { port: 9876, race: "Human", class: "Warrior", seed: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1] ?? "";
    switch (arg) {
      case "--port": opts.port = Number(next); i++; break;
      case "--race": opts.race = next; i++; break;
      case "--class": opts.class = next; i++; break;
      case "--seed": opts.seed = Number(next); i++; break;
    }
  }
  return opts;
}

const isMain = process.argv[1] &&
  (process.argv[1].endsWith("/remote-server.ts") || process.argv[1].endsWith("/remote-server.js"));

if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  const server = new RemoteBorgServer(opts.port, opts.race, opts.class, opts.seed);
  server.start().catch((err: unknown) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
