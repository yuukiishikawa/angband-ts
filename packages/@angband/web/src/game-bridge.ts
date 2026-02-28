/**
 * @file game-bridge.ts
 * @brief Bridge between the core game engine and the web UI
 *
 * Implements CommandInputProvider so that the core runGameLoop() can
 * request player commands from the keyboard. Subscribes to EventBus
 * events and renders the dungeon, status, and messages to a Terminal
 * which the CanvasRenderer draws to the HTML canvas.
 */

import type { GameState, GameMessage } from "@angband/core/game/state.js";
import { getRecentMessages, addMessage, MessageType } from "@angband/core/game/state.js";
import { GameEventType } from "@angband/core/game/event.js";
import type { Chunk } from "@angband/core/types/cave.js";
import { Feat, SquareFlag } from "@angband/core/types/cave.js";
import type { Player } from "@angband/core/types/player.js";
import { TVal, EquipSlot } from "@angband/core/types/index.js";
import type { ObjectType } from "@angband/core/types/index.js";
import type { Loc } from "@angband/core/z/type.js";
import { loc } from "@angband/core/z/type.js";
import type { Monster } from "@angband/core/types/monster.js";
import type { GameCommand } from "@angband/core/command/core.js";
import { CommandType } from "@angband/core/command/core.js";
import type { CommandInputProvider } from "@angband/core/game/world.js";
import { runGameLoop } from "@angband/core/game/world.js";
import {
  getInventoryItem,
  inventoryCount,
  getEquippedItem,
  findEquipSlotForItem,
} from "@angband/core/object/index.js";
import { objectDescName, DescMode } from "@angband/core/object/desc.js";
import {
  getAvailableSpells,
  getStudyableSpells,
  spellFailChance,
} from "@angband/core/player/spell.js";
import { cmdStudy } from "@angband/core/command/magic.js";
import { saveGameToJSON } from "@angband/core/save/save.js";
import type { ClassSpell } from "@angband/core/types/player.js";
import {
  storeBuy,
  storeSell,
  storeGetPrice,
  storeCarries,
  homeStore,
  homeRetrieve,
  StoreType,
} from "@angband/core/store/store.js";
import type { Store } from "@angband/core/store/store.js";
import { CanvasRenderer } from "./canvas-renderer.js";
import { Terminal, TERM_COLS, TERM_ROWS } from "./terminal.js";
import { KeyboardInputProvider } from "./keyboard-input.js";
import {
  COLOUR_WHITE,
  COLOUR_YELLOW,
  COLOUR_L_DARK,
  COLOUR_ORANGE,
  COLOUR_UMBER,
  COLOUR_RED,
  COLOUR_GREEN,
  COLOUR_L_RED,
  COLOUR_L_GREEN,
  COLOUR_L_BLUE,
  COLOUR_L_WHITE,
  COLOUR_SLATE,
  COLOUR_DARK,
  COLOUR_BLUE,
  COLOUR_L_PURPLE,
  COLOUR_VIOLET,
} from "./color-palette.js";

// ── Viewport ──

const MAP_TOP = 1;
const MAP_BOTTOM = 21;
const MAP_LEFT = 0;
const MAP_RIGHT = 79;
const MAP_ROWS = MAP_BOTTOM - MAP_TOP + 1;
const MAP_COLS = MAP_RIGHT - MAP_LEFT + 1;

const MSG_ROW = 0;
const STATUS_ROW = 22;
const STATUS_ROW2 = 23;

// ── Feat to display character mapping ──

interface FeatDisplay {
  ch: string;
  fg: number;
}

function featToDisplay(feat: number): FeatDisplay {
  switch (feat) {
    case Feat.FLOOR:    return { ch: ".", fg: COLOUR_WHITE };
    case Feat.OPEN:     return { ch: "'", fg: COLOUR_UMBER };
    case Feat.BROKEN:   return { ch: "'", fg: COLOUR_UMBER };
    case Feat.CLOSED:   return { ch: "+", fg: COLOUR_UMBER };
    case Feat.LESS:     return { ch: "<", fg: COLOUR_WHITE };
    case Feat.MORE:     return { ch: ">", fg: COLOUR_WHITE };
    case Feat.SECRET:   return { ch: "#", fg: COLOUR_SLATE };
    case Feat.RUBBLE:   return { ch: ":", fg: COLOUR_SLATE };
    case Feat.MAGMA:    return { ch: "%", fg: COLOUR_SLATE };
    case Feat.QUARTZ:   return { ch: "%", fg: COLOUR_L_WHITE };
    case Feat.MAGMA_K:  return { ch: "*", fg: COLOUR_ORANGE };
    case Feat.QUARTZ_K: return { ch: "*", fg: COLOUR_L_WHITE };
    case Feat.GRANITE:  return { ch: "#", fg: COLOUR_SLATE };
    case Feat.PERM:     return { ch: "#", fg: COLOUR_WHITE };
    case Feat.LAVA:     return { ch: "~", fg: COLOUR_RED };
    case Feat.STORE_GENERAL: return { ch: "1", fg: COLOUR_L_WHITE };
    case Feat.STORE_ARMOR:   return { ch: "2", fg: COLOUR_L_WHITE };
    case Feat.STORE_WEAPON:  return { ch: "3", fg: COLOUR_L_WHITE };
    case Feat.STORE_BOOK:    return { ch: "4", fg: COLOUR_L_WHITE };
    case Feat.STORE_ALCHEMY: return { ch: "5", fg: COLOUR_L_WHITE };
    case Feat.STORE_MAGIC:   return { ch: "6", fg: COLOUR_L_WHITE };
    case Feat.STORE_BLACK:   return { ch: "7", fg: COLOUR_L_WHITE };
    case Feat.HOME:          return { ch: "8", fg: COLOUR_L_WHITE };
    case Feat.NONE:     return { ch: " ", fg: COLOUR_DARK };
    default:            return { ch: " ", fg: COLOUR_DARK };
  }
}

// ── Projection visual types ──

/** Data emitted with BOLT/EXPLOSION/MISSILE events. */
interface ProjectionVisualData {
  source: { x: number; y: number };
  target: { x: number; y: number };
  element: number;
  radius?: number;
  affectedGrids: ReadonlyArray<{ x: number; y: number }>;
}

/**
 * Map element index to a display character and color for bolt/explosion visuals.
 * Based on the C source proj_to_attr / proj_to_char tables.
 */
const ELEMENT_VISUAL: Record<number, { ch: string; fg: number }> = {
  0:  { ch: "*", fg: COLOUR_GREEN },    // ACID
  1:  { ch: "*", fg: COLOUR_BLUE },     // ELEC
  2:  { ch: "*", fg: COLOUR_RED },      // FIRE
  3:  { ch: "*", fg: COLOUR_WHITE },    // COLD
  4:  { ch: "*", fg: COLOUR_GREEN },    // POIS
  5:  { ch: "*", fg: COLOUR_YELLOW },   // LIGHT
  6:  { ch: "*", fg: COLOUR_L_DARK },   // DARK
  7:  { ch: "*", fg: COLOUR_ORANGE },   // SOUND
  8:  { ch: "*", fg: COLOUR_UMBER },    // SHARD
  9:  { ch: "*", fg: COLOUR_L_RED },    // NEXUS
  10: { ch: "*", fg: COLOUR_L_GREEN },  // NETHER
  11: { ch: "*", fg: COLOUR_L_PURPLE }, // CHAOS
  12: { ch: "*", fg: COLOUR_VIOLET },   // DISEN
  13: { ch: "*", fg: COLOUR_BLUE },     // WATER
  14: { ch: "*", fg: COLOUR_WHITE },    // ICE
  21: { ch: "*", fg: COLOUR_WHITE },    // MISSILE
  22: { ch: "*", fg: COLOUR_L_BLUE },   // MANA
  24: { ch: "|", fg: COLOUR_UMBER },    // ARROW
};

// ── Command key mapping ──

/** Map keyboard command strings to GameCommand factories. */
function keyCommandToGameCommand(
  cmd: string,
  lastDirection: number | null,
): GameCommand | null {
  switch (cmd) {
    case "go_up":     return { type: CommandType.GO_UP };
    case "go_down":   return { type: CommandType.GO_DOWN };
    case "search":    return { type: CommandType.SEARCH };
    case "rest":      return { type: CommandType.REST, turns: 1 };
    case "pickup":    return { type: CommandType.PICKUP };

    // Direction-requiring commands: need a second keypress for direction
    // For now, these are stubs awaiting direction prompt UI
    case "open":
    case "close":
    case "tunnel":
    case "disarm":
    case "bash":
      // Use last direction if available, otherwise fail
      if (lastDirection !== null && lastDirection !== 5) {
        switch (cmd) {
          case "open":    return { type: CommandType.OPEN, direction: lastDirection };
          case "close":   return { type: CommandType.CLOSE, direction: lastDirection };
          case "tunnel":  return { type: CommandType.TUNNEL, direction: lastDirection };
          case "disarm":  return { type: CommandType.DISARM, direction: lastDirection };
          case "bash":    return { type: CommandType.ALTER, direction: lastDirection };
        }
      }
      return null;

    // Item/magic/UI commands handled by GameBridge directly (need selection UI)
    case "inventory":
    case "equipment":
    case "drop":
    case "wield":
    case "takeoff":
    case "quaff":
    case "read":
    case "eat":
    case "zap":
    case "aim":
    case "fire":
    case "throw":
    case "cast":
    case "pray":
    case "fuel":
    case "study":
    case "save":
      return null; // Handled by getCommand() before calling this function

    case "look":
    case "help":
    case "cancel":
    case "confirm":
      return null; // UI-only commands, handled separately

    default:
      return null;
  }
}

// ── GameBridge ──

/**
 * GameBridge connects the core game engine to the web UI.
 *
 * It implements CommandInputProvider (async getCommand()) so that
 * runGameLoop() can drive the turn cycle while we translate
 * keyboard events into GameCommands.
 */
export class GameBridge implements CommandInputProvider {
  private readonly renderer: CanvasRenderer;
  private readonly terminal: Terminal;
  private readonly input: KeyboardInputProvider;
  private state: GameState;

  /** Camera offset — dungeon coordinate at top-left of map viewport. */
  private cameraX = 0;
  private cameraY = 0;

  /** Pending direction for direction-requiring commands. */
  private pendingDirectionCmd: string | null = null;

  /** Player grid on previous getCommand() call — used to detect movement onto store tiles. */
  private lastPlayerGrid: { x: number; y: number } | null = null;

  /** Handler for panic save on page unload. */
  private panicSaveHandler: (() => void) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    state: GameState,
    inputProvider: KeyboardInputProvider,
  ) {
    this.state = state;
    this.input = inputProvider;
    this.terminal = new Terminal(TERM_COLS, TERM_ROWS);
    this.renderer = new CanvasRenderer(canvas);
    this.renderer.resize(TERM_COLS, TERM_ROWS);
  }

  /**
   * Start the game. Subscribes to events and enters the core game loop.
   */
  async start(): Promise<void> {
    // Subscribe to core events for redraw
    this.state.eventBus.on(GameEventType.REFRESH, () => {
      this.updateCamera();
      this.drawAll();
      this.doRender();
    });
    this.state.eventBus.on(GameEventType.MESSAGE, () => {
      this.drawMessages();
      this.doRender();
    });
    this.state.eventBus.on(GameEventType.HP, () => {
      this.drawStatus();
      this.doRender();
    });
    this.state.eventBus.on(GameEventType.MANA, () => {
      this.drawStatus();
      this.doRender();
    });
    this.state.eventBus.on(GameEventType.NEW_LEVEL_DISPLAY, () => {
      this.updateCamera();
      this.drawAll();
      this.doRender();
    });
    this.state.eventBus.on(GameEventType.ENTER_DEATH, () => {
      this.drawAll();
      this.drawMessages();
      this.doRender();
    });

    // Projection visual events (bolt/explosion/missile)
    this.state.eventBus.on(GameEventType.BOLT, (event) => {
      this.flashProjection(event.data as ProjectionVisualData);
    });
    this.state.eventBus.on(GameEventType.EXPLOSION, (event) => {
      this.flashProjection(event.data as ProjectionVisualData);
    });
    this.state.eventBus.on(GameEventType.MISSILE, (event) => {
      this.flashProjection(event.data as ProjectionVisualData);
    });

    // Panic save on page unload (navigating away, closing tab)
    this.panicSaveHandler = (): void => {
      try {
        const json = saveGameToJSON(this.state, this.state.monsters);
        localStorage.setItem(GameBridge.SAVE_KEY, json);
      } catch {
        // Best effort — can't alert during beforeunload
      }
    };
    window.addEventListener("beforeunload", this.panicSaveHandler);

    // Initial render
    this.updateCamera();
    this.drawAll();
    addMessage(this.state, "Welcome to Angband! Press ? for help.", MessageType.GENERIC);
    this.drawMessages();
    this.doRender();

    // Run the core game loop — this drives the entire game
    await runGameLoop(this.state, this);

    // Remove panic save handler — game is over or exited
    if (this.panicSaveHandler) {
      window.removeEventListener("beforeunload", this.panicSaveHandler);
      this.panicSaveHandler = null;
    }

    // Game over — show appropriate screen
    if (this.state.dead) {
      await this.showTombstone();
      GameBridge.clearSave();
    } else if (this.state.won) {
      await this.showVictoryScreen();
      GameBridge.clearSave();
    } else {
      this.drawAll();
      this.drawMessages();
      this.doRender();
    }
  }

  /**
   * Replace the game state (e.g. when restoring from save).
   */
  setState(state: GameState): void {
    this.state = state;
    this.updateCamera();
    this.drawAll();
    this.doRender();
  }

  // ── CommandInputProvider implementation ──

  /**
   * Get the next game command from the player.
   *
   * This is called by runGameLoop() each time the player has enough
   * energy for an action. We wait for a keypress, translate it into
   * a GameCommand, and return it.
   */
  async getCommand(): Promise<GameCommand | null> {
    // Open a store only when the player just MOVED onto a store tile.
    // This prevents the store from re-opening after ESC when the player
    // stays in place (rest / direction-5), while still allowing re-entry
    // by stepping off and back on.
    const pg = this.state.player.grid;
    const moved = !this.lastPlayerGrid
      || this.lastPlayerGrid.x !== pg.x
      || this.lastPlayerGrid.y !== pg.y;
    this.lastPlayerGrid = { x: pg.x, y: pg.y };

    if (moved) {
      const playerSq = this.state.chunk.squares[pg.y]?.[pg.x];
      if (playerSq && playerSq.feat >= Feat.STORE_GENERAL && playerSq.feat <= Feat.HOME) {
        const storeIdx = playerSq.feat - Feat.STORE_GENERAL;
        const store = this.state.stores[storeIdx];
        if (store) {
          await this.showStoreScreen(store);
        }
      }
    }

    // Render current state before waiting for input
    this.updateCamera();
    this.drawAll();
    this.drawMessages();
    this.doRender();

    for (;;) {
      const key = await this.waitForKey();

      // Check for direction first (movement / attack)
      const dirResult = this.input.consumeDirection();
      if (dirResult !== null) {
        const { direction: dir, count: dirCount } = dirResult;
        // If we have a pending direction command, complete it
        if (this.pendingDirectionCmd !== null) {
          const cmd = this.pendingDirectionCmd;
          this.pendingDirectionCmd = null;
          const gc = keyCommandToGameCommand(cmd, dir);
          if (gc) return dirCount > 1 ? { ...gc, nrepeat: dirCount } : gc;
        }

        // Normal movement: WALK command
        return dirCount > 1
          ? { type: CommandType.WALK, direction: dir, nrepeat: dirCount }
          : { type: CommandType.WALK, direction: dir };
      }

      // Check for command key
      const cmdResult = this.input.consumeCommand();
      if (cmdResult !== null) {
        const { command: cmd, count: cmdCount } = cmdResult;

        // Handle UI-only commands locally
        if (cmd === "help") {
          await this.showHelpScreen();
          continue;
        }

        if (cmd === "look") {
          this.processLook();
          this.drawMessages();
          this.doRender();
          continue;
        }

        if (cmd === "cancel") {
          this.pendingDirectionCmd = null;
          continue;
        }

        if (cmd === "confirm") {
          continue;
        }

        // Direction-requiring commands: prompt for direction
        if (cmd === "open" || cmd === "close" || cmd === "tunnel" || cmd === "disarm" || cmd === "bash") {
          this.pendingDirectionCmd = cmd;
          addMessage(this.state, `${cmd.charAt(0).toUpperCase() + cmd.slice(1)} in which direction?`, MessageType.GENERIC);
          this.drawMessages();
          this.doRender();
          continue;
        }

        // Inventory / Equipment display
        if (cmd === "inventory") {
          await this.showInventoryScreen();
          continue;
        }
        if (cmd === "equipment") {
          await this.showEquipmentScreen();
          continue;
        }

        // Item use commands (need item selection)
        if (cmd === "quaff") {
          const idx = await this.selectInventoryItem("Quaff which potion?",
            (obj) => obj.tval === TVal.POTION);
          if (idx !== null) return { type: CommandType.QUAFF, itemIndex: idx };
          continue;
        }
        if (cmd === "eat") {
          const idx = await this.selectInventoryItem("Eat which item?",
            (obj) => obj.tval === TVal.FOOD || obj.tval === TVal.MUSHROOM);
          if (idx !== null) return { type: CommandType.EAT, itemIndex: idx };
          continue;
        }
        if (cmd === "read") {
          const idx = await this.selectInventoryItem("Read which scroll?",
            (obj) => obj.tval === TVal.SCROLL);
          if (idx !== null) return { type: CommandType.READ, itemIndex: idx };
          continue;
        }
        if (cmd === "zap") {
          const idx = await this.selectInventoryItem("Zap which rod?",
            (obj) => obj.tval === TVal.ROD);
          if (idx !== null) return { type: CommandType.ZAP, itemIndex: idx };
          continue;
        }
        if (cmd === "aim") {
          const idx = await this.selectInventoryItem("Aim which wand?",
            (obj) => obj.tval === TVal.WAND);
          if (idx !== null) {
            addMessage(this.state, "Aim in which direction?", MessageType.GENERIC);
            this.drawMessages();
            this.doRender();
            const aimDir = await this.waitForDirection();
            if (aimDir !== null) {
              return { type: CommandType.AIM, itemIndex: idx, direction: aimDir };
            }
          }
          continue;
        }

        // Equipment management
        if (cmd === "wield") {
          const idx = await this.selectInventoryItem("Wear/Wield which item?",
            (obj) => findEquipSlotForItem(obj) !== null);
          if (idx !== null) return { type: CommandType.EQUIP, itemIndex: idx };
          continue;
        }
        if (cmd === "takeoff") {
          const slot = await this.selectEquipSlot("Remove from which slot?");
          if (slot !== null) return { type: CommandType.UNEQUIP, itemIndex: slot };
          continue;
        }
        if (cmd === "drop") {
          const idx = await this.selectInventoryItem("Drop which item?");
          if (idx !== null) return { type: CommandType.DROP, itemIndex: idx, quantity: 0 };
          continue;
        }

        // Ranged combat — fire a missile
        if (cmd === "fire") {
          addMessage(this.state, "Fire in which direction?", MessageType.GENERIC);
          this.drawMessages();
          this.doRender();
          const target = await this.waitForTarget();
          if (target !== null) {
            return { type: CommandType.FIRE, target };
          }
          continue;
        }

        // Ranged combat — throw an item
        if (cmd === "throw") {
          const idx = await this.selectInventoryItem("Throw which item?");
          if (idx !== null) {
            addMessage(this.state, "Throw at which target?", MessageType.GENERIC);
            this.drawMessages();
            this.doRender();
            const target = await this.waitForTarget();
            if (target !== null) {
              return { type: CommandType.THROW, target, itemIndex: idx };
            }
          }
          continue;
        }

        // Magic — cast a spell (with direction targeting)
        if (cmd === "cast" || cmd === "pray") {
          const spellIdx = await this.selectSpell("Cast which spell?");
          if (spellIdx !== null) {
            addMessage(this.state, "Cast in which direction?", MessageType.MAGIC);
            this.drawMessages();
            this.doRender();
            const dir = await this.waitForDirection();
            if (dir !== null) {
              return { type: CommandType.CAST, spellIndex: spellIdx, direction: dir };
            }
          }
          continue;
        }

        // Magic — study a new spell
        if (cmd === "study") {
          const spellIdx = await this.selectStudySpell();
          if (spellIdx !== null) {
            const result = cmdStudy(this.state.player, spellIdx);
            for (const msg of result.messages) {
              addMessage(this.state, msg, MessageType.MAGIC);
            }
            this.drawMessages();
            this.doRender();
            if (result.success) {
              // Study consumes a turn — return SEARCH as a turn-consuming action
              return { type: CommandType.SEARCH };
            }
          }
          continue;
        }

        // Save game
        if (cmd === "save") {
          this.saveToLocalStorage();
          continue;
        }

        // Try to convert to a GameCommand
        const gc = keyCommandToGameCommand(cmd, null);
        if (gc) return cmdCount > 1 ? { ...gc, nrepeat: cmdCount } : gc;

        // Fallback for unhandled commands
        addMessage(this.state, `Command '${cmd}' is not yet available.`, MessageType.GENERIC);
        this.drawMessages();
        this.doRender();
        continue;
      }
    }
  }

  // ── Input ──

  private waitForKey(): Promise<KeyboardEvent> {
    return new Promise((resolve) => {
      const handler = (_key: string, _code: string, event: KeyboardEvent): void => {
        this.input.onKeypress = null;
        resolve(event);
      };
      this.input.onKeypress = handler;
    });
  }

  // ── Camera ──

  private updateCamera(): void {
    const player = this.state.player;
    this.cameraX = player.grid.x - Math.floor(MAP_COLS / 2);
    this.cameraY = player.grid.y - Math.floor(MAP_ROWS / 2);

    const chunk = this.state.chunk;
    this.cameraX = Math.max(0, Math.min(this.cameraX, chunk.width - MAP_COLS));
    this.cameraY = Math.max(0, Math.min(this.cameraY, chunk.height - MAP_ROWS));
  }

  // ── Drawing ──

  private drawAll(): void {
    this.terminal.clear();
    this.drawMap();
    this.drawStatus();
    this.drawMessages();
  }

  private drawMap(): void {
    const chunk = this.state.chunk;
    const player = this.state.player;

    // Build midx → Monster map for O(1) lookup
    const monsterMap = new Map<number, Monster>();
    for (const mon of this.state.monsters) {
      if (mon.hp > 0) {
        monsterMap.set(mon.midx, mon);
      }
    }

    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        const dungeonX = this.cameraX + col;
        const dungeonY = this.cameraY + row;
        const termX = MAP_LEFT + col;
        const termY = MAP_TOP + row;

        if (
          dungeonX < 0 || dungeonX >= chunk.width ||
          dungeonY < 0 || dungeonY >= chunk.height
        ) {
          this.terminal.putChar(termX, termY, " ", COLOUR_DARK);
          continue;
        }

        const sq = chunk.squares[dungeonY]![dungeonX]!;

        // Player
        if (dungeonX === player.grid.x && dungeonY === player.grid.y) {
          this.terminal.putChar(termX, termY, "@", COLOUR_WHITE);
          continue;
        }

        // Monster — use Map for O(1) lookup
        if (sq.mon > 0) {
          const mon = monsterMap.get(sq.mon);
          if (mon) {
            const ch = String.fromCharCode(mon.race.dChar);
            const fg = mon.race.dAttr;
            this.terminal.putChar(termX, termY, ch, fg);
            continue;
          }
          // Dead or missing monster — fall through to terrain
        }

        // Floor object — render item glyph from objectList
        if (sq.obj !== null) {
          const obj = chunk.objectList.get(sq.obj as number);
          if (obj?.kind) {
            this.terminal.putChar(termX, termY, obj.kind.dChar, obj.kind.dAttr);
            continue;
          }
        }

        // Terrain
        const display = featToDisplay(sq.feat);
        this.terminal.putChar(termX, termY, display.ch, display.fg);
      }
    }
  }

  private drawStatus(): void {
    const player = this.state.player;

    for (let x = 0; x < TERM_COLS; x++) {
      this.terminal.putChar(x, STATUS_ROW, " ", COLOUR_WHITE);
      this.terminal.putChar(x, STATUS_ROW2, " ", COLOUR_WHITE);
    }

    // Row 22: name, race, class, level
    const nameStr = player.fullName || "Player";
    const raceStr = player.race.name;
    const classStr = player.class.name;
    const levelStr = `Lv ${player.lev}`;
    const line1 = `${nameStr} the ${raceStr} ${classStr}  ${levelStr}`;
    this.terminal.putString(0, STATUS_ROW, line1, COLOUR_WHITE);

    // Row 23: HP, MP, depth, gold, turn
    const hpColor = player.chp < player.mhp / 4 ? COLOUR_RED :
                    player.chp < player.mhp / 2 ? COLOUR_YELLOW :
                    COLOUR_L_GREEN;

    this.terminal.putString(0, STATUS_ROW2, "HP:", COLOUR_WHITE);
    const hpStr = `${player.chp}/${player.mhp}`;
    this.terminal.putString(3, STATUS_ROW2, hpStr, hpColor);

    const mpOffset = 3 + hpStr.length + 2;
    this.terminal.putString(mpOffset, STATUS_ROW2, "SP:", COLOUR_WHITE);
    const mpStr = `${player.csp}/${player.msp}`;
    this.terminal.putString(mpOffset + 3, STATUS_ROW2, mpStr, COLOUR_L_BLUE);

    const depthOffset = mpOffset + 3 + mpStr.length + 2;
    const depthStr = this.state.depth === 0 ? "Town" : `${this.state.depth * 50}'`;
    this.terminal.putString(depthOffset, STATUS_ROW2, `Depth:${depthStr}`, COLOUR_WHITE);

    const goldOffset = depthOffset + 6 + depthStr.length + 2;
    this.terminal.putString(goldOffset, STATUS_ROW2, `AU:${player.au}`, COLOUR_YELLOW);

    const turnOffset = goldOffset + 3 + String(player.au).length + 2;
    this.terminal.putString(turnOffset, STATUS_ROW2, `T:${this.state.turn}`, COLOUR_SLATE);
  }

  private drawMessages(): void {
    for (let x = 0; x < TERM_COLS; x++) {
      this.terminal.putChar(x, MSG_ROW, " ", COLOUR_WHITE);
    }

    const messages = getRecentMessages(this.state, 1);
    if (messages.length > 0) {
      const msg = messages[0]!;
      const color = this.messageColor(msg);
      const text = msg.text.length > TERM_COLS ? msg.text.substring(0, TERM_COLS) : msg.text;
      this.terminal.putString(0, MSG_ROW, text, color);
    }
  }

  private messageColor(msg: GameMessage): number {
    switch (msg.type) {
      case MessageType.COMBAT:  return COLOUR_L_RED;
      case MessageType.MAGIC:   return COLOUR_L_BLUE;
      case MessageType.MONSTER: return COLOUR_ORANGE;
      case MessageType.ITEM:    return COLOUR_L_GREEN;
      case MessageType.URGENT:  return COLOUR_YELLOW;
      default:                  return COLOUR_WHITE;
    }
  }

  private doRender(): void {
    this.renderer.render(this.terminal);
  }

  // ── Death / Victory screens ──

  private async showTombstone(): Promise<void> {
    const player = this.state.player;
    const name = player.fullName || "Unknown";
    const race = player.race.name;
    const cls = player.class.name;
    const cause = player.diedFrom || "unknown causes";
    const depth = this.state.depth === 0 ? "Town" : `${this.state.depth * 50}'`;
    const level = player.lev;
    const turn = this.state.turn;

    this.terminal.clear();

    // Draw tombstone ASCII art
    const lines = [
      "           /----------\\",
      "          /  REST IN   \\",
      "         /    PEACE     \\",
      "        /                \\",
      `        |  ${name.padEnd(14).substring(0, 14)}  |`,
      `        |  the ${race.padEnd(10).substring(0, 10)} |`,
      `        |  ${cls.padEnd(14).substring(0, 14)}  |`,
      "        |                |",
      `        |  Killed by     |`,
      `        |  ${cause.padEnd(14).substring(0, 14)}  |`,
      "        |                |",
      `        |  Depth: ${depth.padEnd(7).substring(0, 7)} |`,
      `        |  Level: ${String(level).padEnd(7)} |`,
      `        |  Turn:  ${String(turn).padEnd(7)} |`,
      "        |                |",
      "        *       *  *     *",
      "       _*_______*__*_____*_",
    ];

    for (let i = 0; i < lines.length && i < TERM_ROWS - 3; i++) {
      this.terminal.putString(0, i + 1, lines[i]!, COLOUR_WHITE);
    }

    const footer = "[Press any key to continue]";
    this.terminal.putString(
      Math.floor((TERM_COLS - footer.length) / 2),
      TERM_ROWS - 1,
      footer,
      COLOUR_SLATE,
    );

    this.doRender();

    // Wait for any key
    await this.waitForKey();
  }

  private async showVictoryScreen(): Promise<void> {
    const player = this.state.player;
    const name = player.fullName || "Unknown";
    const race = player.race.name;
    const cls = player.class.name;
    const level = player.lev;
    const turn = this.state.turn;

    this.terminal.clear();

    const lines = [
      "",
      "    *****  VICTORY!  *****",
      "",
      `    ${name} the ${race} ${cls}`,
      `    has conquered the Pits of Angband!`,
      "",
      `    Character Level: ${level}`,
      `    Turns Taken: ${turn}`,
      "",
      "    The forces of Morgoth have been vanquished.",
      "    You may retire with honor.",
      "",
      "    Your deeds will be remembered forever",
      "    in the halls of fame!",
    ];

    for (let i = 0; i < lines.length && i < TERM_ROWS - 3; i++) {
      this.terminal.putString(0, i + 1, lines[i]!, COLOUR_YELLOW);
    }

    const footer = "[Press any key to continue]";
    this.terminal.putString(
      Math.floor((TERM_COLS - footer.length) / 2),
      TERM_ROWS - 1,
      footer,
      COLOUR_SLATE,
    );

    this.doRender();

    await this.waitForKey();
  }

  // ── Save / Load ──

  private static readonly SAVE_KEY = "angband-save";

  private saveToLocalStorage(): void {
    try {
      const json = saveGameToJSON(this.state, this.state.monsters);
      localStorage.setItem(GameBridge.SAVE_KEY, json);
      addMessage(this.state, "Game saved.", MessageType.GENERIC);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addMessage(this.state, `Save failed: ${msg}`, MessageType.URGENT);
    }
    this.drawMessages();
    this.doRender();
  }

  static hasSavedGame(): boolean {
    return localStorage.getItem(GameBridge.SAVE_KEY) !== null;
  }

  static getSavedJSON(): string | null {
    return localStorage.getItem(GameBridge.SAVE_KEY);
  }

  static clearSave(): void {
    localStorage.removeItem(GameBridge.SAVE_KEY);
  }

  // ── Look command (UI-only) ──

  private processLook(): void {
    const player = this.state.player;
    const chunk = this.state.chunk;
    const sq = chunk.squares[player.grid.y]![player.grid.x]!;

    let desc = "the ground";
    switch (sq.feat) {
      case Feat.FLOOR: desc = "an empty floor"; break;
      case Feat.LESS:  desc = "an up staircase"; break;
      case Feat.MORE:  desc = "a down staircase"; break;
      case Feat.OPEN:  desc = "an open door"; break;
      default:         desc = "the ground"; break;
    }

    addMessage(this.state, `You see ${desc}.`, MessageType.GENERIC);
  }

  // ── Item description helper ──

  private describeItem(obj: ObjectType): string {
    if (obj.kind) {
      return objectDescName(obj, obj.kind, DescMode.FULL);
    }
    return "(unknown item)";
  }

  // ── Overlay drawing ──

  private drawOverlay(title: string, lines: string[]): void {
    for (let row = MAP_TOP; row <= MAP_BOTTOM; row++) {
      for (let col = MAP_LEFT; col <= MAP_RIGHT; col++) {
        this.terminal.putChar(col, row, " ", COLOUR_DARK);
      }
    }

    this.terminal.putString(2, MAP_TOP, title, COLOUR_YELLOW);

    for (let i = 0; i < lines.length && MAP_TOP + 2 + i <= MAP_BOTTOM - 1; i++) {
      const text = lines[i]!.length > MAP_COLS - 4
        ? lines[i]!.substring(0, MAP_COLS - 4)
        : lines[i]!;
      this.terminal.putString(2, MAP_TOP + 2 + i, text, COLOUR_WHITE);
    }
  }

  // ── Wait for direction input ──

  private async waitForDirection(): Promise<number | null> {
    for (;;) {
      await this.waitForKey();
      const dir = this.input.consumeDirection();
      if (dir !== null && dir.direction !== 5) return dir.direction;
      const cmd = this.input.consumeCommand();
      if (cmd !== null && cmd.command === "cancel") return null;
    }
  }

  // ── Targeting mode ──

  /**
   * Direction offsets for numpad directions (1-9).
   * Index 0 and 5 are zero-movement.
   */
  private static readonly DIR_DX = [0, -1, 0, 1, -1, 0, 1, -1, 0, 1];
  private static readonly DIR_DY = [0, 1, 1, 1, 0, 0, 0, -1, -1, -1];

  /**
   * Enter targeting mode: show a cursor on the map and let the player
   * move it with direction keys. Returns the selected dungeon Loc,
   * or null if cancelled.
   *
   * Controls:
   *   Direction keys / vi keys: move cursor
   *   t / Enter / .: confirm target
   *   Escape / q: cancel
   */
  private async waitForTarget(): Promise<Loc | null> {
    // Start cursor at the player's position
    let cx = this.state.player.grid.x;
    let cy = this.state.player.grid.y;

    // Show targeting prompt
    this.terminal.clearRegion(0, MSG_ROW, TERM_COLS, 1);
    this.terminal.putString(0, MSG_ROW, "Target: [dir] move, [t/Enter] select, [Esc] cancel", COLOUR_YELLOW);

    for (;;) {
      // Draw targeting cursor
      this.drawAll();
      const termX = cx - this.cameraX;
      const termY = cy - this.cameraY + MAP_TOP;
      if (termX >= MAP_LEFT && termX <= MAP_RIGHT && termY >= MAP_TOP && termY <= MAP_BOTTOM) {
        // Save and overlay with a bright cursor
        this.terminal.putChar(termX, termY, "*", COLOUR_YELLOW);
      }

      // Show target info in the status line area
      this.terminal.clearRegion(0, MSG_ROW, TERM_COLS, 1);
      const targetInfo = this.getTargetInfo(cx, cy);
      this.terminal.putString(0, MSG_ROW, `Target: ${targetInfo} [dir/t/Esc]`, COLOUR_YELLOW);
      this.doRender();

      // Wait for input
      const event = await this.waitForKey();

      // Check for direction input
      const dir = this.input.consumeDirection();
      if (dir !== null && dir.direction !== 5) {
        const dx = GameBridge.DIR_DX[dir.direction]!;
        const dy = GameBridge.DIR_DY[dir.direction]!;
        cx += dx;
        cy += dy;
        // Clamp to chunk bounds
        cx = Math.max(0, Math.min(this.state.chunk.width - 1, cx));
        cy = Math.max(0, Math.min(this.state.chunk.height - 1, cy));
        continue;
      }

      // Check for command input
      const cmd = this.input.consumeCommand();
      if (cmd !== null) {
        if (cmd.command === "cancel") return null;
        continue;
      }

      // Raw key checks for confirm/cancel
      if (event.key === "t" || event.key === "Enter" || event.key === "." || event.key === " ") {
        // Redraw without cursor before returning
        this.drawAll();
        this.doRender();
        return loc(cx, cy);
      }
      if (event.key === "Escape" || event.key === "q") {
        this.drawAll();
        this.doRender();
        return null;
      }
    }
  }

  /**
   * Get a short description of what's at the target location.
   */
  private getTargetInfo(x: number, y: number): string {
    const chunk = this.state.chunk;
    if (x < 0 || x >= chunk.width || y < 0 || y >= chunk.height) return "out of bounds";

    const sq = chunk.squares[y]?.[x];
    if (!sq) return "unknown";

    // Check for monster
    if (sq.mon > 0) {
      const mon = chunk.monsters[sq.mon];
      if (mon) return mon.race.name;
    }

    // Check for player
    if (x === this.state.player.grid.x && y === this.state.player.grid.y) {
      return "you";
    }

    // Describe terrain
    const feat = sq.feat;
    const fd = featToDisplay(feat);
    switch (feat) {
      case Feat.FLOOR: return "floor";
      case Feat.OPEN: return "open door";
      case Feat.CLOSED: return "closed door";
      case Feat.LESS: return "up staircase";
      case Feat.MORE: return "down staircase";
      case Feat.RUBBLE: return "rubble";
      case Feat.GRANITE: return "granite wall";
      case Feat.PERM: return "permanent wall";
      default: return `terrain (${fd.ch})`;
    }
  }

  // ── Inventory screen ──

  private async showInventoryScreen(): Promise<void> {
    const count = inventoryCount(this.state.player);

    if (count === 0) {
      addMessage(this.state, "Your pack is empty.", MessageType.ITEM);
      this.drawMessages();
      this.doRender();
      return;
    }

    const lines: string[] = [];
    for (let i = 0; i < count; i++) {
      const obj = getInventoryItem(this.state.player, i);
      if (obj) {
        const letter = String.fromCharCode(97 + i); // 'a' = 97
        lines.push(`${letter}) ${this.describeItem(obj)}`);
      }
    }
    lines.push("");
    lines.push(`(${count} item${count !== 1 ? "s" : ""}, ESC to close)`);

    this.drawOverlay("Inventory", lines);
    this.doRender();

    for (;;) {
      const key = await this.waitForKey();
      if (key.key === "Escape" || key.key === " " || key.key === "Enter") break;
    }

    this.drawAll();
    this.drawMessages();
    this.doRender();
  }

  // ── Equipment screen ──

  private static readonly SLOT_NAMES: Record<number, string> = {
    [EquipSlot.WEAPON]: "Weapon",
    [EquipSlot.BOW]: "Bow",
    [EquipSlot.RING]: "Ring",
    [EquipSlot.AMULET]: "Amulet",
    [EquipSlot.LIGHT]: "Light",
    [EquipSlot.BODY_ARMOR]: "Body Armor",
    [EquipSlot.CLOAK]: "Cloak",
    [EquipSlot.SHIELD]: "Shield",
    [EquipSlot.HAT]: "Hat",
    [EquipSlot.GLOVES]: "Gloves",
    [EquipSlot.BOOTS]: "Boots",
  };

  private async showEquipmentScreen(): Promise<void> {
    const lines: string[] = [];
    let equipped = 0;

    for (let slot = 1; slot <= 11; slot++) {
      const item = getEquippedItem(this.state.player, slot as EquipSlot);
      const label = GameBridge.SLOT_NAMES[slot] ?? `Slot ${slot}`;
      if (item) {
        lines.push(`${label}: ${this.describeItem(item)}`);
        equipped++;
      } else {
        lines.push(`${label}: (empty)`);
      }
    }
    lines.push("");
    lines.push(`(${equipped} item${equipped !== 1 ? "s" : ""} equipped, ESC to close)`);

    this.drawOverlay("Equipment", lines);
    this.doRender();

    for (;;) {
      const key = await this.waitForKey();
      if (key.key === "Escape" || key.key === " " || key.key === "Enter") break;
    }

    this.drawAll();
    this.drawMessages();
    this.doRender();
  }

  // ── Item selection (returns inventory index or null) ──

  private async selectInventoryItem(
    prompt: string,
    filter?: (obj: ObjectType) => boolean,
  ): Promise<number | null> {
    const items: Array<[number, ObjectType]> = [];
    const count = inventoryCount(this.state.player);

    for (let i = 0; i < count; i++) {
      const obj = getInventoryItem(this.state.player, i);
      if (obj && (!filter || filter(obj))) {
        items.push([i, obj]);
      }
    }

    if (items.length === 0) {
      addMessage(this.state, "You have nothing suitable.", MessageType.ITEM);
      this.drawMessages();
      this.doRender();
      return null;
    }

    const lines: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const [, obj] = items[i]!;
      const letter = String.fromCharCode(97 + i);
      lines.push(`${letter}) ${this.describeItem(obj)}`);
    }
    lines.push("");
    lines.push("(Press letter to select, ESC to cancel)");

    this.drawOverlay(prompt, lines);
    this.doRender();

    for (;;) {
      const key = await this.waitForKey();

      if (key.key === "Escape") {
        this.drawAll();
        this.drawMessages();
        this.doRender();
        return null;
      }

      if (key.key.length === 1 && key.key >= "a" && key.key <= "z") {
        const selectedIdx = key.key.charCodeAt(0) - 97;
        if (selectedIdx < items.length) {
          this.drawAll();
          this.drawMessages();
          this.doRender();
          return items[selectedIdx]![0]; // Original inventory index
        }
      }
    }
  }

  // ── Help screen ──

  private async showHelpScreen(): Promise<void> {
    const lines = [
      "Movement:  arrows / hjklyubn / numpad",
      "< > :      Use stairs (up / down)",
      "o c :      Open / Close door",
      "s   :      Search nearby",
      "T   :      Tunnel through wall",
      "D   :      Disarm trap",
      "",
      "i   :      View inventory",
      "e   :      View equipment",
      "g , :      Pick up item",
      "d   :      Drop item",
      "w   :      Wear/Wield item",
      "t   :      Take off equipment",
      "",
      "q   :      Quaff potion",
      "r   :      Read scroll",
      "E   :      Eat food",
      "a   :      Aim wand",
      "z   :      Zap rod",
      "m p :      Cast spell / Pray",
      "G   :      Study new spell",
      ". R :      Rest",
      "/   :      Look at feet",
      "Ctrl+S :   Save game",
    ];

    this.drawOverlay("Commands", lines);
    this.doRender();

    for (;;) {
      const key = await this.waitForKey();
      if (key.key === "Escape" || key.key === " " || key.key === "Enter" || key.key === "?") break;
    }

    this.drawAll();
    this.drawMessages();
    this.doRender();
  }

  // ── Spell selection (returns global spell index or null) ──

  private async selectSpell(prompt: string): Promise<number | null> {
    const player = this.state.player;

    if (!player.class.magic.totalSpells) {
      addMessage(this.state, "You cannot cast spells!", MessageType.MAGIC);
      this.drawMessages();
      this.doRender();
      return null;
    }

    const spells = getAvailableSpells(player);
    if (spells.length === 0) {
      addMessage(this.state, "You have not learned any spells yet.", MessageType.MAGIC);
      this.drawMessages();
      this.doRender();
      return null;
    }

    const lines: string[] = [];
    for (let i = 0; i < spells.length; i++) {
      const sp = spells[i]!;
      const letter = String.fromCharCode(97 + i);
      const fail = spellFailChance(player, sp);
      lines.push(
        `${letter}) ${sp.name.padEnd(20)} Lv${String(sp.slevel).padStart(2)} ${String(sp.smana).padStart(3)}SP Fail:${String(fail).padStart(2)}%`,
      );
    }
    lines.push("");
    lines.push("(Press letter to cast, ESC to cancel)");

    this.drawOverlay(prompt, lines);
    this.doRender();

    for (;;) {
      const key = await this.waitForKey();

      if (key.key === "Escape") {
        this.drawAll();
        this.drawMessages();
        this.doRender();
        return null;
      }

      if (key.key.length === 1 && key.key >= "a" && key.key <= "z") {
        const selectedIdx = key.key.charCodeAt(0) - 97;
        if (selectedIdx < spells.length) {
          this.drawAll();
          this.drawMessages();
          this.doRender();
          return spells[selectedIdx]!.sidx;
        }
      }
    }
  }

  // ── Study spell selection ──

  private async selectStudySpell(): Promise<number | null> {
    const player = this.state.player;

    if (!player.class.magic.totalSpells) {
      addMessage(this.state, "You cannot learn spells!", MessageType.MAGIC);
      this.drawMessages();
      this.doRender();
      return null;
    }

    if (player.upkeep.newSpells <= 0) {
      addMessage(this.state, "You cannot learn any more spells right now.", MessageType.MAGIC);
      this.drawMessages();
      this.doRender();
      return null;
    }

    const spells = getStudyableSpells(player);
    if (spells.length === 0) {
      addMessage(this.state, "There are no spells you can learn at your level.", MessageType.MAGIC);
      this.drawMessages();
      this.doRender();
      return null;
    }

    const lines: string[] = [];
    lines.push(`(You can learn ${player.upkeep.newSpells} more spell${player.upkeep.newSpells > 1 ? "s" : ""})`);
    lines.push("");
    for (let i = 0; i < spells.length; i++) {
      const sp = spells[i]!;
      const letter = String.fromCharCode(97 + i);
      lines.push(
        `${letter}) ${sp.name.padEnd(20)} Lv${String(sp.slevel).padStart(2)} ${String(sp.smana).padStart(3)}SP`,
      );
    }
    lines.push("");
    lines.push("(Press letter to study, ESC to cancel)");

    this.drawOverlay("Study which spell?", lines);
    this.doRender();

    for (;;) {
      const key = await this.waitForKey();

      if (key.key === "Escape") {
        this.drawAll();
        this.drawMessages();
        this.doRender();
        return null;
      }

      if (key.key.length === 1 && key.key >= "a" && key.key <= "z") {
        const selectedIdx = key.key.charCodeAt(0) - 97;
        if (selectedIdx < spells.length) {
          this.drawAll();
          this.drawMessages();
          this.doRender();
          return spells[selectedIdx]!.sidx;
        }
      }
    }
  }

  // ── Equipment slot selection (returns EquipSlot number or null) ──

  private async selectEquipSlot(prompt: string): Promise<number | null> {
    const lines: string[] = [];
    const equippedSlots: number[] = [];

    for (let slot = 1; slot <= 11; slot++) {
      const item = getEquippedItem(this.state.player, slot as EquipSlot);
      if (item) {
        const letter = String.fromCharCode(97 + equippedSlots.length);
        const label = GameBridge.SLOT_NAMES[slot] ?? `Slot ${slot}`;
        lines.push(`${letter}) ${label}: ${this.describeItem(item)}`);
        equippedSlots.push(slot);
      }
    }

    if (equippedSlots.length === 0) {
      addMessage(this.state, "You are not wearing any equipment.", MessageType.ITEM);
      this.drawMessages();
      this.doRender();
      return null;
    }

    lines.push("");
    lines.push("(Press letter to select, ESC to cancel)");

    this.drawOverlay(prompt, lines);
    this.doRender();

    for (;;) {
      const key = await this.waitForKey();

      if (key.key === "Escape") {
        this.drawAll();
        this.drawMessages();
        this.doRender();
        return null;
      }

      if (key.key.length === 1 && key.key >= "a" && key.key <= "z") {
        const selectedIdx = key.key.charCodeAt(0) - 97;
        if (selectedIdx < equippedSlots.length) {
          this.drawAll();
          this.drawMessages();
          this.doRender();
          return equippedSlots[selectedIdx]!;
        }
      }
    }
  }

  // ── Store screen ──

  private static readonly STORE_NAMES: Record<number, string> = {
    [StoreType.GENERAL]: "General Store",
    [StoreType.ARMORY]: "Armory",
    [StoreType.WEAPON]: "Weapon Smiths",
    [StoreType.TEMPLE]: "Temple",
    [StoreType.ALCHEMY]: "Alchemy Shop",
    [StoreType.MAGIC]: "Magic Shop",
    [StoreType.BLACKMARKET]: "Black Market",
    [StoreType.HOME]: "Your Home",
    [StoreType.BOOKSHOP]: "Bookstore",
  };

  /**
   * Show the store screen: browse inventory, buy/sell items.
   *
   * Controls:
   * - b: switch to Buy mode (browse store stock)
   * - s: switch to Sell mode (browse player inventory)
   * - a-z: select item (buy from store / sell to store)
   * - ESC: leave store
   */
  private async showStoreScreen(store: Store): Promise<void> {
    const isHome = store.type === StoreType.HOME;
    let mode: "buy" | "sell" = "buy";

    const drawStore = (): void => {
      const title = GameBridge.STORE_NAMES[store.type] ?? "Store";
      const ownerLine = isHome ? "" : `${store.owner.name} (purse: ${store.owner.maxCost}g)`;
      const goldLine = `Gold: ${this.state.player.au}`;

      const lines: string[] = [];
      if (ownerLine) lines.push(ownerLine);
      lines.push(goldLine);
      lines.push("");

      if (mode === "buy") {
        lines.push(isHome ? "-- Stored Items --" : "-- Store Inventory --");
        if (store.stock.length === 0) {
          lines.push("  (empty)");
        } else {
          for (let i = 0; i < store.stock.length && i < 16; i++) {
            const obj = store.stock[i]!;
            const letter = String.fromCharCode(97 + i);
            const desc = this.describeItem(obj);
            if (isHome) {
              lines.push(`${letter}) ${desc}`);
            } else {
              const price = storeGetPrice(store, obj, false);
              lines.push(`${letter}) ${desc}  [${price}g]`);
            }
          }
        }
      } else {
        lines.push("-- Your Inventory --");
        const count = inventoryCount(this.state.player);
        if (count === 0) {
          lines.push("  (empty)");
        } else {
          for (let i = 0; i < count && i < 16; i++) {
            const obj = getInventoryItem(this.state.player, i);
            if (obj) {
              const letter = String.fromCharCode(97 + i);
              const desc = this.describeItem(obj);
              if (isHome) {
                lines.push(`${letter}) ${desc}`);
              } else {
                const price = storeGetPrice(store, obj, true);
                const carries = storeCarries(store, obj);
                const priceStr = carries ? `[${price}g]` : "[won't buy]";
                lines.push(`${letter}) ${desc}  ${priceStr}`);
              }
            }
          }
        }
      }

      lines.push("");
      if (isHome) {
        lines.push(mode === "buy"
          ? "(a-z) retrieve, (s) store, ESC leave"
          : "(a-z) store, (b) browse, ESC leave");
      } else {
        lines.push(mode === "buy"
          ? "(a-z) buy, (s) sell, ESC leave"
          : "(a-z) sell, (b) buy, ESC leave");
      }

      this.drawOverlay(`${title} [${mode.toUpperCase()}]`, lines);
      this.doRender();
    };

    drawStore();

    for (;;) {
      const key = await this.waitForKey();

      if (key.key === "Escape" || key.key === " ") break;

      if (key.key === "b" || key.key === "B") {
        mode = "buy";
        drawStore();
        continue;
      }

      if (key.key === "s" || key.key === "S") {
        mode = "sell";
        drawStore();
        continue;
      }

      // Item selection
      if (key.key.length === 1 && key.key >= "a" && key.key <= "z") {
        const idx = key.key.charCodeAt(0) - 97;

        if (mode === "buy") {
          if (idx < store.stock.length) {
            if (isHome) {
              const item = homeRetrieve(store, this.state.player, idx);
              if (item) {
                addMessage(this.state,
                  `You retrieve ${this.describeItem(item)}.`,
                  MessageType.ITEM);
              }
            } else {
              const result = storeBuy(store, this.state.player, idx);
              addMessage(this.state, result.message,
                result.success ? MessageType.ITEM : MessageType.GENERIC);
            }
          }
        } else {
          const count = inventoryCount(this.state.player);
          if (idx < count) {
            const obj = getInventoryItem(this.state.player, idx);
            if (obj) {
              if (isHome) {
                const ok = homeStore(store, this.state.player, obj);
                if (ok) {
                  addMessage(this.state,
                    `You store ${this.describeItem(obj)}.`,
                    MessageType.ITEM);
                } else {
                  addMessage(this.state, "Your home is full.",
                    MessageType.GENERIC);
                }
              } else {
                const result = storeSell(store, this.state.player, obj);
                addMessage(this.state, result.message,
                  result.success ? MessageType.ITEM : MessageType.GENERIC);
              }
            }
          }
        }

        drawStore();
      }
    }

    // Exit store — redraw game world
    this.drawAll();
    this.drawMessages();
    this.doRender();
  }

  // ── Projection visual flash ──

  /**
   * Flash affected grids briefly on the terminal to show a bolt/explosion.
   *
   * This is a simple synchronous flash: draw the visual chars on affected
   * grids, render, then immediately restore the normal map.
   */
  private flashProjection(data: ProjectionVisualData): void {
    if (!data || !data.affectedGrids || data.affectedGrids.length === 0) return;

    const visual = ELEMENT_VISUAL[data.element] ?? { ch: "*", fg: COLOUR_WHITE };

    // Draw flash characters on affected grids
    for (const g of data.affectedGrids) {
      const termX = g.x - this.cameraX;
      const termY = g.y - this.cameraY + MAP_TOP;

      // Skip if outside terminal viewport
      if (termX < MAP_LEFT || termX > MAP_RIGHT) continue;
      if (termY < MAP_TOP || termY > MAP_BOTTOM) continue;

      this.terminal.putChar(termX, termY, visual.ch, visual.fg);
    }

    // Render the flash frame
    this.doRender();

    // Restore the normal display
    this.drawAll();
    this.doRender();
  }
}
