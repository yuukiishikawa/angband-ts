/**
 * @file main.ts
 * @brief Web frontend entry point for Angband
 *
 * Runs the character creation screen, then initializes the game
 * engine and enters the core game loop via GameBridge.
 * Supports save/load via localStorage.
 */

import { RNG } from "@angband/core/z/rand.js";
import { createPlayer } from "@angband/core/player/birth.js";
import { createGameState, type GameState } from "@angband/core/game/state.js";
import { generateDungeon, DEFAULT_DUNGEON_CONFIG } from "@angband/core/generate/generate.js";
import {
  setFeatureInfo,
  buildDefaultFeatureInfo,
  setViewFeatureTable,
  setPathfindFeatureTable,
} from "@angband/core/cave/index.js";
import { loadGameFromJSON } from "@angband/core/save/load.js";
import { parseMonsterBases, parseMonsterRaces } from "@angband/core/data/monster-loader.js";
import {
  parseObjectBases,
  parseObjectKinds,
  parseBrands,
  parseSlays,
  parseArtifacts,
  parseEgoItems,
} from "@angband/core/data/object-loader.js";
import type { MonsterRace } from "@angband/core/types/monster.js";
import type { ObjectKind, ObjectType, Artifact, EgoItem, Brand, Slay } from "@angband/core/types/object.js";
import type { Player } from "@angband/core/types/player.js";
import { createStore, initStoreStock, StoreType, STORE_TYPE_MAX } from "@angband/core/store/store.js";
import type { Store } from "@angband/core/store/store.js";
import { initializeNewPlayer } from "@angband/core/game/bootstrap.js";

import { KeyboardInputProvider } from "./keyboard-input.js";
import { GameBridge } from "./game-bridge.js";
import { TERM_COLS, TERM_ROWS } from "./terminal.js";
import { runBirthScreen } from "./birth-screen.js";

// ── Parsed game data passed through to state ──

interface ParsedGameData {
  monsterRaces: MonsterRace[];
  objectKinds: ObjectKind[];
  artifacts: Artifact[];
  egoItems: EgoItem[];
  brands: Brand[];
  slays: Slay[];
}

// ── Canvas setup ──

function setupCanvas(): HTMLCanvasElement {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error("Canvas element #game-canvas not found");
  }
  return canvas;
}

// ── Load game data ──

async function loadJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Load saved game ──

function tryLoadSavedGame(
  rng: RNG,
  raceData: unknown[],
  classData: unknown[],
): GameState | null {
  const json = GameBridge.getSavedJSON();
  if (!json) return null;

  try {
    // Provide race/class resolvers so the loaded player gets
    // the actual race/class templates instead of placeholders
    const state = loadGameFromJSON(json, rng);

    // Patch the player's race and class with actual data from JSON files
    const raceMap = new Map<string, unknown>();
    for (const r of raceData) {
      const race = r as { name: string };
      raceMap.set(race.name, r);
    }
    const classMap = new Map<string, unknown>();
    for (const c of classData) {
      const cls = c as { name: string };
      classMap.set(cls.name, c);
    }

    const actualRace = raceMap.get(state.player.race.name);
    if (actualRace) {
      (state.player as { race: unknown }).race = actualRace;
    }
    const actualClass = classMap.get(state.player.class.name);
    if (actualClass) {
      (state.player as { class: unknown }).class = actualClass;
    }

    return state;
  } catch (err: unknown) {
    console.warn("Failed to load saved game:", err);
    return null;
  }
}

// ── Main ──

async function main(): Promise<void> {
  const canvas = setupCanvas();

  // Initialize feature info tables (required by cave/square, view, pathfind)
  const featureInfo = buildDefaultFeatureInfo();
  setFeatureInfo(featureInfo);
  setViewFeatureTable(featureInfo);
  setPathfindFeatureTable(featureInfo);

  // Load all game data in parallel
  const [
    raceData, classData, monsterData, monsterBaseData,
    objectData, objectBaseData, brandData, slayData,
    artifactData, egoItemData,
  ] = await Promise.all([
    loadJSON<unknown[]>("/gamedata/p_race.json"),
    loadJSON<unknown[]>("/gamedata/class.json"),
    loadJSON<unknown[]>("/gamedata/monster.json"),
    loadJSON<unknown[]>("/gamedata/monster_base.json"),
    loadJSON<unknown[]>("/gamedata/object.json"),
    loadJSON<unknown[]>("/gamedata/object_base.json"),
    loadJSON<unknown[]>("/gamedata/brand.json"),
    loadJSON<unknown[]>("/gamedata/slay.json"),
    loadJSON<unknown[]>("/gamedata/artifact.json"),
    loadJSON<unknown[]>("/gamedata/ego_item.json"),
  ]);

  // Parse monster races
  const monsterBases = parseMonsterBases(monsterBaseData);
  const monsterRaces = parseMonsterRaces(monsterData, monsterBases);

  // Parse object data
  const objectBases = parseObjectBases(objectBaseData);
  const { brands, brandCodeMap } = parseBrands(brandData);
  const { slays, slayCodeMap } = parseSlays(slayData);
  const objectKinds = parseObjectKinds(
    objectData, objectBases, brandCodeMap, slayCodeMap,
    brands.length, slays.length,
  );
  const artifacts = parseArtifacts(
    artifactData, objectKinds, brandCodeMap, slayCodeMap,
    brands.length, slays.length,
  );
  const egoItems = parseEgoItems(
    egoItemData, objectKinds, objectBases, brandCodeMap, slayCodeMap,
    brands.length, slays.length,
  );

  const gameData: ParsedGameData = {
    monsterRaces,
    objectKinds,
    artifacts,
    egoItems,
    brands,
    slays,
  };

  // Initialize RNG
  const rng = new RNG();
  rng.quick = false;
  rng.stateInit(Date.now() & 0xffffffff);

  let state: GameState;

  // Check for saved game
  if (GameBridge.hasSavedGame()) {
    const loaded = tryLoadSavedGame(rng, raceData, classData);
    if (loaded) {
      // Ask if the player wants to continue
      const useSave = await askContinue(canvas);
      if (useSave) {
        state = loaded;
        // Inject parsed data tables into loaded state
        state.monsterRaces = gameData.monsterRaces;
        state.objectKinds = gameData.objectKinds;
        state.artifacts = gameData.artifacts;
        state.egoItems = gameData.egoItems;
        state.brands = gameData.brands;
        state.slays = gameData.slays;
        // Recreate stores if save data didn't include them
        if (!state.stores || state.stores.length === 0) {
          const stores: Store[] = [];
          for (let i = 0; i < STORE_TYPE_MAX; i++) {
            const store = createStore(i as StoreType);
            initStoreStock(store, 0, gameData.objectKinds, rng);
            stores.push(store);
          }
          state.stores = stores;
        }
      } else {
        GameBridge.clearSave();
        state = await newGame(canvas, raceData, classData, rng, gameData);
      }
    } else {
      // Save was corrupt — start fresh
      GameBridge.clearSave();
      state = await newGame(canvas, raceData, classData, rng, gameData);
    }
  } else {
    state = await newGame(canvas, raceData, classData, rng, gameData);
  }

  // Create input handler and game bridge
  const inputProvider = new KeyboardInputProvider();
  const bridge = new GameBridge(canvas, state, inputProvider);

  // Start the game (enters core game loop)
  await bridge.start();
}

// ── New game (character creation + dungeon gen) ──

async function newGame(
  canvas: HTMLCanvasElement,
  raceData: unknown[],
  classData: unknown[],
  rng: RNG,
  gameData: ParsedGameData,
): Promise<GameState> {
  const birth = await runBirthScreen(
    canvas,
    raceData as Parameters<typeof runBirthScreen>[1],
    classData as Parameters<typeof runBirthScreen>[2],
  );

  const player = createPlayer(birth.name, birth.race, birth.class, rng);

  // Give starting items, auto-equip gear, calculate derived stats
  initializeNewPlayer(player, gameData.objectKinds, rng);

  // Start in the town (depth 0)
  const startDepth = 0;
  const chunk = generateDungeon(
    startDepth, DEFAULT_DUNGEON_CONFIG, rng,
    gameData.monsterRaces, gameData.objectKinds, gameData.egoItems,
  );

  player.grid = findStartPosition(chunk);
  player.depth = startDepth;

  // Initialize town stores
  const stores: Store[] = [];
  for (let i = 0; i < STORE_TYPE_MAX; i++) {
    const store = createStore(i as StoreType);
    initStoreStock(store, 0, gameData.objectKinds, rng);
    stores.push(store);
  }

  const state = createGameState({
    player,
    chunk,
    rng,
    monsterRaces: gameData.monsterRaces,
    objectKinds: gameData.objectKinds,
    artifacts: gameData.artifacts,
    egoItems: gameData.egoItems,
    brands: gameData.brands,
    slays: gameData.slays,
    stores,
  });
  state.depth = startDepth;

  return state;
}

// ── Ask to continue saved game ──

async function askContinue(canvas: HTMLCanvasElement): Promise<boolean> {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  // Draw a simple prompt
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "16px monospace";
  ctx.fillStyle = "#fff";
  ctx.fillText("A saved game was found.", 20, 60);
  ctx.fillText("Press [C] to Continue or [N] for New Game", 20, 100);

  return new Promise<boolean>((resolve) => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "c" || e.key === "C" || e.key === "Enter") {
        document.removeEventListener("keydown", handler);
        resolve(true);
      } else if (e.key === "n" || e.key === "N" || e.key === "Escape") {
        document.removeEventListener("keydown", handler);
        resolve(false);
      }
    };
    document.addEventListener("keydown", handler);
  });
}

/**
 * Find a starting position on a dungeon level.
 * Prefers up staircase, then any floor tile, then map center.
 */
function findStartPosition(
  chunk: { readonly width: number; readonly height: number; readonly squares: { feat: number }[][] },
): { x: number; y: number } {
  // Up staircase (Feat.LESS = 5)
  for (let y = 0; y < chunk.height; y++) {
    for (let x = 0; x < chunk.width; x++) {
      if (chunk.squares[y]![x]!.feat === 5) return { x, y };
    }
  }
  // Floor (Feat.FLOOR = 1)
  for (let y = 0; y < chunk.height; y++) {
    for (let x = 0; x < chunk.width; x++) {
      if (chunk.squares[y]![x]!.feat === 1) return { x, y };
    }
  }
  return { x: Math.floor(chunk.width / 2), y: Math.floor(chunk.height / 2) };
}

// Boot the app
main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  document.body.style.color = "#ff4040";
  document.body.style.padding = "20px";
  document.body.style.fontFamily = "monospace";
  document.body.textContent = `Fatal error: ${err instanceof Error ? err.message : String(err)}`;
});
