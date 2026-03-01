/**
 * @file game-bridge.ts
 * @brief Bridge between the core game engine and the web UI
 *
 * Implements CommandInputProvider so that the core runGameLoop() can
 * request player commands from the keyboard. Subscribes to EventBus
 * events and renders the dungeon, status, and messages to a Terminal
 * which the CanvasRenderer draws to the HTML canvas.
 *
 * Screen-specific logic (store, inventory, spells) is extracted into
 * separate modules (store-screen.ts, inventory-ui.ts, spell-ui.ts).
 */

import type { GameState } from "@angband/core/game/state.js";
import { addMessage, MessageType } from "@angband/core/game/state.js";
import { GameEventType } from "@angband/core/game/event.js";
import { Feat } from "@angband/core/types/cave.js";
import { TVal } from "@angband/core/types/index.js";
import type { ObjectType } from "@angband/core/types/index.js";
import type { Loc } from "@angband/core/z/type.js";
import { loc } from "@angband/core/z/type.js";
import type { GameCommand } from "@angband/core/command/core.js";
import { CommandType } from "@angband/core/command/core.js";
import type { CommandInputProvider } from "@angband/core/game/world.js";
import { runGameLoop } from "@angband/core/game/world.js";
import { findEquipSlotForItem } from "@angband/core/object/index.js";
import { objectDescName, DescMode } from "@angband/core/object/desc.js";
import { cmdStudy } from "@angband/core/command/magic.js";
import { saveGameToJSON } from "@angband/core/save/save.js";
import { CanvasRenderer } from "./canvas-renderer.js";
import { Terminal, TERM_COLS, TERM_ROWS } from "./terminal.js";
import { KeyboardInputProvider } from "./keyboard-input.js";
import type { UIContext } from "./ui-context.js";
import {
  COLOUR_WHITE,
  COLOUR_YELLOW,
  COLOUR_SLATE,
} from "./color-palette.js";
import {
  MAP_TOP, MAP_BOTTOM, MAP_LEFT, MAP_RIGHT,
  MAP_COLS, MAP_ROWS, MSG_ROW,
  drawMap, drawStatus, drawMessages as drawMessagesImpl,
  drawOverlay as drawOverlayImpl,
  flashProjection as flashProjectionImpl,
  featToDisplay,
  type ProjectionVisualData,
} from "./map-renderer.js";
import { showStoreScreen } from "./store-screen.js";
import {
  showInventoryScreen,
  showEquipmentScreen,
  selectInventoryItem,
  selectEquipSlot,
} from "./inventory-ui.js";
import { selectSpell, selectStudySpell } from "./spell-ui.js";

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
    case "open":
    case "close":
    case "tunnel":
    case "disarm":
    case "bash":
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

    // Item/magic/UI commands handled by GameBridge directly
    case "inventory": case "equipment": case "drop": case "wield":
    case "takeoff": case "quaff": case "read": case "eat":
    case "zap": case "aim": case "fire": case "throw":
    case "cast": case "pray": case "fuel": case "study": case "save":
    case "look": case "help": case "cancel": case "confirm":
      return null;

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
export class GameBridge implements CommandInputProvider, UIContext {
  private readonly renderer: CanvasRenderer;
  readonly terminal: Terminal;
  readonly input: KeyboardInputProvider;
  state: GameState;

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
          await showStoreScreen(this, store);
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
        if (this.pendingDirectionCmd !== null) {
          const cmd = this.pendingDirectionCmd;
          this.pendingDirectionCmd = null;
          const gc = keyCommandToGameCommand(cmd, dir);
          if (gc) return dirCount > 1 ? { ...gc, nrepeat: dirCount } : gc;
        }
        return dirCount > 1
          ? { type: CommandType.WALK, direction: dir, nrepeat: dirCount }
          : { type: CommandType.WALK, direction: dir };
      }

      // Check for command key
      const cmdResult = this.input.consumeCommand();
      if (cmdResult !== null) {
        const { command: cmd, count: cmdCount } = cmdResult;

        // UI-only commands
        if (cmd === "help") { await this.showHelpScreen(); continue; }
        if (cmd === "look") { this.processLook(); this.drawMessages(); this.doRender(); continue; }
        if (cmd === "cancel") { this.pendingDirectionCmd = null; continue; }
        if (cmd === "confirm") { continue; }

        // Direction-requiring commands
        if (cmd === "open" || cmd === "close" || cmd === "tunnel" || cmd === "disarm" || cmd === "bash") {
          this.pendingDirectionCmd = cmd;
          addMessage(this.state, `${cmd.charAt(0).toUpperCase() + cmd.slice(1)} in which direction?`, MessageType.GENERIC);
          this.drawMessages();
          this.doRender();
          continue;
        }

        // Inventory / Equipment display (delegated)
        if (cmd === "inventory") { await showInventoryScreen(this); continue; }
        if (cmd === "equipment") { await showEquipmentScreen(this); continue; }

        // Item use commands (delegated selection)
        if (cmd === "quaff") {
          const idx = await selectInventoryItem(this, "Quaff which potion?",
            (obj) => obj.tval === TVal.POTION);
          if (idx !== null) return { type: CommandType.QUAFF, itemIndex: idx };
          continue;
        }
        if (cmd === "eat") {
          const idx = await selectInventoryItem(this, "Eat which item?",
            (obj) => obj.tval === TVal.FOOD || obj.tval === TVal.MUSHROOM);
          if (idx !== null) return { type: CommandType.EAT, itemIndex: idx };
          continue;
        }
        if (cmd === "read") {
          const idx = await selectInventoryItem(this, "Read which scroll?",
            (obj) => obj.tval === TVal.SCROLL);
          if (idx !== null) return { type: CommandType.READ, itemIndex: idx };
          continue;
        }
        if (cmd === "zap") {
          const idx = await selectInventoryItem(this, "Zap which rod?",
            (obj) => obj.tval === TVal.ROD);
          if (idx !== null) return { type: CommandType.ZAP, itemIndex: idx };
          continue;
        }
        if (cmd === "aim") {
          const idx = await selectInventoryItem(this, "Aim which wand?",
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

        // Equipment management (delegated selection)
        if (cmd === "wield") {
          const idx = await selectInventoryItem(this, "Wear/Wield which item?",
            (obj) => findEquipSlotForItem(obj) !== null);
          if (idx !== null) return { type: CommandType.EQUIP, itemIndex: idx };
          continue;
        }
        if (cmd === "takeoff") {
          const slot = await selectEquipSlot(this, "Remove from which slot?");
          if (slot !== null) return { type: CommandType.UNEQUIP, itemIndex: slot };
          continue;
        }
        if (cmd === "drop") {
          const idx = await selectInventoryItem(this, "Drop which item?");
          if (idx !== null) return { type: CommandType.DROP, itemIndex: idx, quantity: 0 };
          continue;
        }

        // Ranged combat
        if (cmd === "fire") {
          addMessage(this.state, "Fire in which direction?", MessageType.GENERIC);
          this.drawMessages();
          this.doRender();
          const target = await this.waitForTarget();
          if (target !== null) return { type: CommandType.FIRE, target };
          continue;
        }
        if (cmd === "throw") {
          const idx = await selectInventoryItem(this, "Throw which item?");
          if (idx !== null) {
            addMessage(this.state, "Throw at which target?", MessageType.GENERIC);
            this.drawMessages();
            this.doRender();
            const target = await this.waitForTarget();
            if (target !== null) return { type: CommandType.THROW, target, itemIndex: idx };
          }
          continue;
        }

        // Magic (delegated spell selection)
        if (cmd === "cast" || cmd === "pray") {
          const spellIdx = await selectSpell(this, "Cast which spell?");
          if (spellIdx !== null) {
            addMessage(this.state, "Cast in which direction?", MessageType.MAGIC);
            this.drawMessages();
            this.doRender();
            const dir = await this.waitForDirection();
            if (dir !== null) return { type: CommandType.CAST, spellIndex: spellIdx, direction: dir };
          }
          continue;
        }
        if (cmd === "study") {
          const spellIdx = await selectStudySpell(this);
          if (spellIdx !== null) {
            const result = cmdStudy(this.state.player, spellIdx);
            for (const msg of result.messages) {
              addMessage(this.state, msg, MessageType.MAGIC);
            }
            this.drawMessages();
            this.doRender();
            if (result.success) return { type: CommandType.SEARCH };
          }
          continue;
        }

        // Save game
        if (cmd === "save") { this.saveToLocalStorage(); continue; }

        // Try to convert to a GameCommand
        const gc = keyCommandToGameCommand(cmd, null);
        if (gc) return cmdCount > 1 ? { ...gc, nrepeat: cmdCount } : gc;

        addMessage(this.state, `Command '${cmd}' is not yet available.`, MessageType.GENERIC);
        this.drawMessages();
        this.doRender();
        continue;
      }
    }
  }

  // ── UIContext implementation ──

  waitForKey(): Promise<KeyboardEvent> {
    return new Promise((resolve) => {
      const handler = (_key: string, _code: string, event: KeyboardEvent): void => {
        this.input.onKeypress = null;
        resolve(event);
      };
      this.input.onKeypress = handler;
    });
  }

  describeItem(obj: ObjectType): string {
    if (obj.kind) {
      return objectDescName(obj, obj.kind, DescMode.FULL);
    }
    return "(unknown item)";
  }

  drawOverlay(title: string, lines: string[]): void {
    drawOverlayImpl(this.terminal, title, lines);
  }

  drawAll(): void {
    this.terminal.clear();
    drawMap(this.terminal, this.state.chunk, this.state.player, this.state.monsters, this.cameraX, this.cameraY);
    this.drawStatus();
    this.drawMessages();
  }

  drawMessages(): void {
    drawMessagesImpl(this.terminal, this.state);
  }

  doRender(): void {
    this.renderer.render(this.terminal);
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

  private drawStatus(): void {
    drawStatus(this.terminal, this.state.player, this.state.depth, this.state.turn);
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

  private static readonly DIR_DX = [0, -1, 0, 1, -1, 0, 1, -1, 0, 1];
  private static readonly DIR_DY = [0, 1, 1, 1, 0, 0, 0, -1, -1, -1];

  private async waitForTarget(): Promise<Loc | null> {
    let cx = this.state.player.grid.x;
    let cy = this.state.player.grid.y;

    // Clear message line and show targeting prompt
    for (let x = 0; x < TERM_COLS; x++) {
      this.terminal.putChar(x, MSG_ROW, " ", COLOUR_WHITE);
    }
    this.terminal.putString(0, MSG_ROW, "Target: [dir] move, [t/Enter] select, [Esc] cancel", COLOUR_YELLOW);

    for (;;) {
      this.drawAll();
      const termX = cx - this.cameraX;
      const termY = cy - this.cameraY + MAP_TOP;
      if (termX >= MAP_LEFT && termX <= MAP_RIGHT && termY >= MAP_TOP && termY <= MAP_BOTTOM) {
        this.terminal.putChar(termX, termY, "*", COLOUR_YELLOW);
      }

      // Show target info
      for (let x = 0; x < TERM_COLS; x++) {
        this.terminal.putChar(x, MSG_ROW, " ", COLOUR_WHITE);
      }
      const targetInfo = this.getTargetInfo(cx, cy);
      this.terminal.putString(0, MSG_ROW, `Target: ${targetInfo} [dir/t/Esc]`, COLOUR_YELLOW);
      this.doRender();

      const event = await this.waitForKey();

      const dir = this.input.consumeDirection();
      if (dir !== null && dir.direction !== 5) {
        const dx = GameBridge.DIR_DX[dir.direction]!;
        const dy = GameBridge.DIR_DY[dir.direction]!;
        cx += dx;
        cy += dy;
        cx = Math.max(0, Math.min(this.state.chunk.width - 1, cx));
        cy = Math.max(0, Math.min(this.state.chunk.height - 1, cy));
        continue;
      }

      const cmd = this.input.consumeCommand();
      if (cmd !== null) {
        if (cmd.command === "cancel") return null;
        continue;
      }

      if (event.key === "t" || event.key === "Enter" || event.key === "." || event.key === " ") {
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

  private getTargetInfo(x: number, y: number): string {
    const chunk = this.state.chunk;
    if (x < 0 || x >= chunk.width || y < 0 || y >= chunk.height) return "out of bounds";

    const sq = chunk.squares[y]?.[x];
    if (!sq) return "unknown";

    if (sq.mon > 0) {
      const mon = chunk.monsters[sq.mon];
      if (mon) return mon.race.name;
    }

    if (x === this.state.player.grid.x && y === this.state.player.grid.y) {
      return "you";
    }

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

  // ── Look command ──

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

  // ── Projection visual ──

  private flashProjection(data: ProjectionVisualData): void {
    flashProjectionImpl(
      this.terminal, data, this.cameraX, this.cameraY,
      () => this.drawAll(),
      () => this.doRender(),
    );
  }
}
