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
import { Stat, TimedEffect } from "../types/player.js";
import { createStore, initStoreStock, StoreType, STORE_TYPE_MAX } from "../store/store.js";
import type { Store } from "../store/store.js";
import type { GameCommand } from "../command/core.js";
import { CommandType } from "../command/core.js";
import { GameEventType } from "../game/event.js";
import {
  giveStartingItems,
  autoEquipStartingItems,
  createStartObject,
} from "../game/bootstrap.js";
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
  equip?: string[];
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
    startItems: parseStartItems(raw.equip ?? raw["start-items"]),
    magic,
  };
}

// ── Borg-specific bonus items ──

/**
 * Give bonus healing potions for borg testing.
 * The C borg normally buys these from town stores, but the TS remote server
 * doesn't support store interaction. Give potions to enable deeper exploration.
 */
function giveBonusItems(
  player: Player,
  kinds: readonly ObjectKind[],
): void {
  const pGear = player as Player & { inventory: ObjectType[] };
  if (!pGear.inventory) pGear.inventory = [];

  // Items the borg normally buys from town stores.
  // C borg junk code now skips healing potions and Phase Door in remote mode,
  // so these won't be wasted. Give enough for sustained dungeon exploration.
  const bonusItems: { tval: number; name: string; qty: number; toH?: number; toD?: number; toA?: number }[] = [
    // Better weapon — Long Sword (2d5,+4,+4) simulates store purchase
    // Auto-equipped via autoEquipStartingItems()
    { tval: 9, name: "Long Sword", qty: 1, toH: 4, toD: 4 },
    // Better armor — Studded Leather Armour [12,+3] simulates store purchase
    { tval: 16, name: "Studded Leather Armour", qty: 1, toA: 3 },
    // Shield — Small Metal Shield [5,+3] simulates store purchase
    { tval: 14, name: "Small Metal Shield", qty: 1, toA: 3 },
    // Food (borg tracks BI_FOOD_HI for descent decisions)
    { tval: 28, name: "Ration of Food", qty: 10 },
    // Healing potions (protected from junking in remote mode)
    { tval: 26, name: "Cure Light Wounds", qty: 20 },
    { tval: 26, name: "Cure Serious Wounds", qty: 10 },
    { tval: 26, name: "Cure Critical Wounds", qty: 10 },
    // Escape scrolls (protected from junking in remote mode)
    { tval: 25, name: "Phase Door", qty: 15 },
    // Teleport — critical for escape from dangerous situations
    { tval: 25, name: "Teleportation", qty: 5 },
    // Word of Recall — return to town (borg uses this heavily)
    { tval: 25, name: "Word of Recall", qty: 3 },
    // Speed potions — important for deep combat
    { tval: 26, name: "Speed", qty: 5 },
  ];

  const cleanName = (n: string) => n.replace(/^& /, "").replace(/~/, "").trim().toLowerCase();
  for (const bonus of bonusItems) {
    const bonusLower = bonus.name.toLowerCase();
    const kind = kinds.find(
      (k) => k.tval === bonus.tval && (k.name === bonus.name || cleanName(k.name) === bonusLower),
    );
    if (kind) {
      const obj = createStartObject(kind, bonus.qty);
      // Apply store-quality enchantments (simulates buying from shops)
      if (bonus.toH !== undefined) (obj as { toH: number }).toH = bonus.toH;
      if (bonus.toD !== undefined) (obj as { toD: number }).toD = bonus.toD;
      if (bonus.toA !== undefined) (obj as { toA: number }).toA = bonus.toA;
      pGear.inventory.push(obj);
    } else {
      process.stderr.write(`[BonusItem] FAILED to find kind for "${bonus.name}" tval=${bonus.tval}\n`);
    }
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
let _invenFrameCounter = 0;
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
    `STAT hp=${p.chp} mhp=${p.mhp} sp=${p.csp} msp=${p.msp} lev=${p.lev} depth=${state.depth} speed=${speed} dead=${dead} food=${p.timed[TimedEffect.FOOD]} blind=${p.timed[TimedEffect.BLIND]} confused=${p.timed[TimedEffect.CONFUSED]} poisoned=${p.timed[TimedEffect.POISONED]} cut=${p.timed[TimedEffect.CUT]} stun=${p.timed[TimedEffect.STUN]} afraid=${p.timed[TimedEffect.AFRAID]} paralyzed=${p.timed[TimedEffect.PARALYZED]} fast=${p.timed[TimedEffect.FAST]} slow=${p.timed[TimedEffect.SLOW]} image=${p.timed[TimedEffect.IMAGE]}`
  );
  lines.push(
    `STAT str=${p.statCur[Stat.STR]} int=${p.statCur[Stat.INT]} wis=${p.statCur[Stat.WIS]} dex=${p.statCur[Stat.DEX]} con=${p.statCur[Stat.CON]}`
  );
  // Camera offset, player position, and monster count for C borg
  const aliveMonsters = state.monsters.filter((m: { hp: number } | null) => m && m.hp > 0).length;
  lines.push(
    `STAT wx=${renderer.getCameraX()} wy=${renderer.getCameraY()} px=${p.grid.x} py=${p.grid.y} mon_count=${aliveMonsters}`
  );

  // Inventory and equipment for C borg's borg_items[]
  // Format: INVEN <slot> <tval> <sval> <qty> <toH> <toD> <toA> <dd> <ds> <ac> <weight> <pval> <timeout> <name>
  const pGear = p as Player & { inventory?: ObjectType[]; equipment?: (ObjectType | null)[] };

  // Pack inventory (slots 0..22)
  if (pGear.inventory) {
    for (let i = 0; i < pGear.inventory.length && i < 23; i++) {
      const item = pGear.inventory[i]!;
      if (!item) { if (_invenFrameCounter <= 2) process.stderr.write(`  [INVEN-SKIP] slot=${i} item=null\n`); continue; }
      if (!item.kind) { if (_invenFrameCounter <= 2) process.stderr.write(`  [INVEN-SKIP] slot=${i} kind=null tval=${item.tval}\n`); continue; }
      const name = item.kind.name.replace(/ /g, "_");
      const pval = typeof item.pval === "number" ? item.pval : 0;
      const line = `INVEN ${i} ${item.tval} ${item.sval} ${item.number} ${item.toH} ${item.toD} ${item.toA} ${item.dd} ${item.ds} ${item.ac} ${item.weight} ${pval} ${item.timeout ?? 0} ${name}`;
      if (_invenFrameCounter <= 2) process.stderr.write(`  [INVEN-SEND] ${line}\n`);
      lines.push(line);
    }
  }
  // Log inventory state for first few frames
  {
    _invenFrameCounter++;
    const invenLen = pGear.inventory?.length ?? -1;
    if (_invenFrameCounter <= 2) {
      process.stderr.write(`[INVEN-FRAME] frame=${_invenFrameCounter} inven=${invenLen}\n`);
      if (pGear.inventory) {
        for (let i = 0; i < pGear.inventory.length; i++) {
          const item = pGear.inventory[i];
          process.stderr.write(`  [${i}] kind=${item?.kind?.name ?? 'NULL'} tval=${item?.tval} qty=${item?.number}\n`);
        }
      }
    }
  }

  // Equipment (slots 23..34, matching C body.txt order)
  // TS equipment[] is indexed by EquipSlot enum (NONE=0, WEAPON=1, BOW=2, RING=3, ...)
  // C body.txt order: WEAPON=0, BOW=1, RING(right)=2, RING(left)=3, AMULET=4, ...
  // Must map TS enum index → C body index, then add pack_size (23).
  const EQUIP_SLOT_TO_C_BODY: Record<number, number> = {
    1: 0,   // WEAPON → body[0]
    2: 1,   // BOW → body[1]
    3: 2,   // RING → body[2] (right hand)
    4: 4,   // AMULET → body[4] (skip body[3] = left ring)
    5: 5,   // LIGHT → body[5]
    6: 6,   // BODY_ARMOR → body[6]
    7: 7,   // CLOAK → body[7]
    8: 8,   // SHIELD → body[8]
    9: 9,   // HAT → body[9]
    10: 10, // GLOVES → body[10]
    11: 11, // BOOTS → body[11]
  };
  if (pGear.equipment) {
    for (let slot = 0; slot < pGear.equipment.length; slot++) {
      const item = pGear.equipment[slot];
      if (!item || !item.kind) continue;
      const bodyIdx = EQUIP_SLOT_TO_C_BODY[slot];
      if (bodyIdx === undefined) continue; // skip NONE=0
      const cSlot = 23 + bodyIdx; // pack_size=23, INVEN_WIELD=23+0
      const name = item.kind.name.replace(/ /g, "_");
      const pval = typeof item.pval === "number" ? item.pval : 0;
      lines.push(`INVEN ${cSlot} ${item.tval} ${item.sval} ${item.number} ${item.toH} ${item.toD} ${item.toA} ${item.dd} ${item.ds} ${item.ac} ${item.weight} ${pval} ${item.timeout ?? 0} ${name}`);
    }
  }

  // Stair positions for C borg's track_more/track_less
  // The C borg in local mode reads the full cave; in remote mode it only
  // sees the viewport. Sending stair positions lets it navigate properly.
  const chunk = state.chunk;
  let stairCount = 0;
  for (let y = 0; y < chunk.height; y++) {
    for (let x = 0; x < chunk.width; x++) {
      const sq = chunk.squares[y]![x]!;
      if (sq.feat === 6 /* FEAT_MORE */) { lines.push(`STAIR ${x} ${y} down`); stairCount++; }
      else if (sq.feat === 5 /* FEAT_LESS */) { lines.push(`STAIR ${x} ${y} up`); stairCount++; }
    }
  }
  // Always log first few frames for diagnostics
  console.error(`[STAIR-SCAN] chunk=${chunk.width}x${chunk.height} depth=${state.player.depth} stairs=${stairCount}`);

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
  private prevDepth: number = -999;
  private objectKinds: readonly ObjectKind[] = [];
  private framesSinceResupply: number = 0;

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
    giveBonusItems(player, objectKinds);
    this.objectKinds = objectKinds;
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
      } else if (this.keyTranslator.pendingWasCancelled) {
        // Borg changed its mind mid-command (e.g. sent '+' twice instead of
        // '+' then direction). The old pending was cancelled. Resolve the
        // waiting keyResolver with a SEARCH (no-op 1 turn) to unstick the
        // game loop, then the new pending will be handled on the next cycle.
        this.keyTranslator.reset(); // clear the new pending too
        if (this.keyResolver) {
          console.error(`[RemoteBorg] Pending cancelled by key code=${keyCode} ch='${String.fromCharCode(keyCode)}' → resolving as SEARCH\n`);
          this.keyResolver({ type: CommandType.SEARCH });
          this.keyResolver = null;
        } else {
          this.pendingCommands.push({ type: CommandType.SEARCH });
        }
        this.sendScreenFrame();
      } else {
        // Partial command (translator needs more keys) — send an
        // echo frame so the C borg doesn't block waiting for a
        // frame that never comes. The frame contains the unchanged
        // screen (no game state change occurred).
        console.error(`[RemoteBorg] Partial key: code=${keyCode} ch='${String.fromCharCode(keyCode)}' (waiting for more input)\n`);
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
      // B1 fix: safety timeout to prevent indefinite hang if borg stops responding
      const BORG_TIMEOUT_MS = 30_000;
      const timer = setTimeout(() => {
        if (this.keyResolver) {
          console.error(`[RemoteBorg] TIMEOUT: no command received in ${BORG_TIMEOUT_MS / 1000}s — borg silence detected\n`);
          this.keyResolver = null;
          resolve(null);
        }
      }, BORG_TIMEOUT_MS);

      this.keyResolver = (cmd) => {
        clearTimeout(timer);
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
    // Replenish healing potions:
    // 1) On descent to a new dungeon level (simulates town resupply)
    // 2) Every 200 frames at any depth (prevents potion exhaustion)
    const curDepth = this.state.depth;
    if (curDepth > this.prevDepth && curDepth > 0) {
      this.replenishSupplies();
      process.stderr.write(`[RESUPPLY] depth ${this.prevDepth} → ${curDepth}\n`);
      this.framesSinceResupply = 0;
    }
    this.prevDepth = curDepth;
    this.framesSinceResupply++;
    if (this.framesSinceResupply >= 200 && curDepth > 0) {
      this.replenishSupplies();
      process.stderr.write(`[RESUPPLY] periodic (every 200 frames)\n`);
      this.framesSinceResupply = 0;
    }

    this.renderer.render(this.state);
    const frame = serializeFrame(this.screen, this.state, this.renderer);
    this.sendLine(frame);
  }

  /**
   * Replenish healing potions and Phase Door scrolls when descending.
   * Simulates town resupply for remote mode.
   */
  private replenishSupplies(): void {
    if (!this.state) return;
    const p = this.state.player as Player & { inventory?: ObjectType[] };
    if (!p.inventory) return;

    const targets: { tval: number; name: string; targetQty: number }[] = [
      { tval: 26, name: "Cure Light Wounds", targetQty: 20 },
      { tval: 26, name: "Cure Serious Wounds", targetQty: 10 },
      { tval: 26, name: "Cure Critical Wounds", targetQty: 10 },
      { tval: 25, name: "Phase Door", targetQty: 10 },
      { tval: 25, name: "Teleportation", targetQty: 5 },
      { tval: 25, name: "Word of Recall", targetQty: 3 },
      { tval: 26, name: "Speed", targetQty: 5 },
    ];

    const cleanName = (n: string) => n.replace(/^& /, "").replace(/~/, "").trim().toLowerCase();
    for (const target of targets) {
      // Find existing stack in inventory
      const existing = p.inventory.find(
        (item) => item.tval === target.tval && item.kind && cleanName(item.kind.name) === target.name.toLowerCase(),
      );
      if (existing) {
        if (existing.number < target.targetQty) {
          const added = target.targetQty - existing.number;
          existing.number = target.targetQty;
          process.stderr.write(`[RESUPPLY] ${target.name}: ${existing.number - added} → ${existing.number}\n`);
        }
      } else {
        // Create new stack
        const kind = this.objectKinds.find(
          (k) => k.tval === target.tval && cleanName(k.name) === target.name.toLowerCase(),
        );
        if (kind) {
          p.inventory.push(createStartObject(kind, target.targetQty));
          process.stderr.write(`[RESUPPLY] ${target.name}: new stack of ${target.targetQty}\n`);
        }
      }
    }
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
