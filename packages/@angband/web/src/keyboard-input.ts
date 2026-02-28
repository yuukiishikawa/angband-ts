/**
 * @file keyboard-input.ts
 * @brief Keyboard input handler implementing InputProvider
 *
 * Listens to keydown events and maps them to Angband commands.
 * Queues keypresses for async resolution of InputRequests from
 * the game logic.
 */

import type {
  InputProvider,
  InputRequest,
  InputResponse,
  DirectionRequest,
  TargetRequest,
  ItemRequest,
  ConfirmRequest,
  StringRequest,
} from "@angband/core/game/input.js";

// ── Direction mapping ──

/** Numpad direction layout: 7=NW 8=N 9=NE / 4=W 5=none 6=E / 1=SW 2=S 3=SE */
const VI_KEY_DIRS: Record<string, number> = {
  y: 7, k: 8, u: 9,
  h: 4,       l: 6,
  b: 1, j: 2, n: 3,
};

const ARROW_KEY_DIRS: Record<string, number> = {
  ArrowUp: 8,
  ArrowDown: 2,
  ArrowLeft: 4,
  ArrowRight: 6,
};

const NUMPAD_DIRS: Record<string, number> = {
  Numpad1: 1, Numpad2: 2, Numpad3: 3,
  Numpad4: 4, Numpad5: 5, Numpad6: 6,
  Numpad7: 7, Numpad8: 8, Numpad9: 9,
};

/**
 * Try to get a direction (1-9) from a key event.
 * Returns the direction number, or null if not a direction key.
 */
function keyToDirection(e: KeyboardEvent): number | null {
  // Numpad first (most specific)
  const numDir = NUMPAD_DIRS[e.code];
  if (numDir !== undefined) return numDir;

  // Arrow keys
  const arrowDir = ARROW_KEY_DIRS[e.key];
  if (arrowDir !== undefined) return arrowDir;

  // Vi keys (only if no modifier keys)
  if (!e.ctrlKey && !e.altKey && !e.metaKey) {
    const viDir = VI_KEY_DIRS[e.key];
    if (viDir !== undefined) return viDir;
  }

  return null;
}

// ── Command mapping ──

/**
 * Game command keys. Each key maps to a command string that the
 * game loop interprets.
 */
const COMMAND_KEYS: Record<string, string> = {
  o: "open",
  c: "close",
  s: "search",
  m: "cast",
  i: "inventory",
  d: "drop",
  e: "equipment",
  g: "pickup",
  "<": "go_up",
  ">": "go_down",
  ",": "pickup",     // alternative pickup key
  ".": "rest",       // rest one turn
  R: "rest",         // capital R for extended rest
  "/": "look",
  "?": "help",
  w: "wield",
  t: "takeoff",
  z: "zap",          // use wand
  a: "aim",          // aim staff
  q: "quaff",
  r: "read",
  E: "eat",
  F: "fuel",
  f: "fire",
  v: "throw",
  p: "pray",         // alias for cast
  G: "study",        // learn new spell
  "+": "alter",      // alter adjacent grid
  T: "tunnel",
  D: "disarm",
  B: "bash",
};

// ── Pending key queue ──

interface PendingKey {
  key: string;
  code: string;
  event: KeyboardEvent;
}

interface PendingResolve {
  resolve: (value: InputResponse) => void;
  request: InputRequest;
}

/**
 * Keyboard input provider for the browser.
 *
 * Implements the core InputProvider interface. Listens for keydown
 * events and queues them. When the game calls `request()`, the
 * next matching keypress is returned (or the provider waits for one).
 */
export class KeyboardInputProvider implements InputProvider {
  private keyQueue: PendingKey[] = [];
  private pendingRequest: PendingResolve | null = null;

  /** The most recently pressed command key (for the game bridge to read). */
  lastCommand: string | null = null;

  /** The most recently pressed direction (for the game bridge to read). */
  lastDirection: number | null = null;

  /** Accumulated numeric prefix for command repeat (e.g. "5s" = search 5 times). */
  repeatCount: number = 0;

  /** Callback invoked when a raw keypress arrives (for the game bridge). */
  onKeypress: ((key: string, code: string, event: KeyboardEvent) => void) | null = null;

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    document.addEventListener("keydown", this.handleKeyDown);
  }

  /**
   * Remove the event listener. Call this during cleanup.
   */
  destroy(): void {
    document.removeEventListener("keydown", this.handleKeyDown);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Handle Ctrl+S (save) specially
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      this.lastCommand = "save";
      this.lastDirection = null;
      if (this.onKeypress) {
        this.onKeypress(e.key, e.code, e);
      }
      return;
    }

    // Ignore keys when modifier keys are held (except shift)
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    // Prevent browser defaults for game keys
    e.preventDefault();

    // Accumulate numeric prefix for repeat count (digits 0-9 when no numpad)
    // Only accumulate for non-numpad digit keys (numpad goes through as directions)
    if (e.key >= "0" && e.key <= "9" && !e.code.startsWith("Numpad")) {
      this.repeatCount = this.repeatCount * 10 + Number(e.key);
      // Cap at 99 to prevent accidental huge repeats
      if (this.repeatCount > 99) this.repeatCount = 99;
      // Don't pass through as a command — wait for the next key
      return;
    }

    // Check direction
    const dir = keyToDirection(e);
    if (dir !== null) {
      this.lastDirection = dir;
      this.lastCommand = null;
    } else {
      // Check command
      const cmd = COMMAND_KEYS[e.key];
      if (cmd !== undefined) {
        this.lastCommand = cmd;
        this.lastDirection = null;
      } else if (e.key === "Escape") {
        this.lastCommand = "cancel";
        this.lastDirection = null;
        this.repeatCount = 0; // Cancel clears repeat prefix
      } else if (e.key === " " || e.key === "Enter") {
        this.lastCommand = "confirm";
        this.lastDirection = null;
      }
    }

    const pending: PendingKey = { key: e.key, code: e.code, event: e };

    // Notify raw listener
    if (this.onKeypress) {
      this.onKeypress(e.key, e.code, e);
    }

    // If there is a pending request, try to fulfill it
    if (this.pendingRequest) {
      const response = this.resolveRequest(this.pendingRequest.request, pending);
      if (response) {
        const pr = this.pendingRequest;
        this.pendingRequest = null;
        pr.resolve(response);
        return;
      }
    }

    // Otherwise queue the keypress
    this.keyQueue.push(pending);
  }

  /**
   * Request input from the player.
   *
   * Returns a Promise that resolves when the player provides valid input
   * matching the request type.
   */
  request(req: InputRequest): Promise<InputResponse> {
    // Check if there is already a queued key that satisfies this request
    for (let i = 0; i < this.keyQueue.length; i++) {
      const pending = this.keyQueue[i]!;
      const response = this.resolveRequest(req, pending);
      if (response) {
        this.keyQueue.splice(i, 1);
        return Promise.resolve(response);
      }
    }

    // No matching key in queue — wait for one
    return new Promise<InputResponse>((resolve) => {
      this.pendingRequest = { resolve, request: req };
    });
  }

  /**
   * Try to resolve a request with a given keypress.
   * Returns an InputResponse if the key matches, null otherwise.
   */
  private resolveRequest(req: InputRequest, key: PendingKey): InputResponse | null {
    switch (req.type) {
      case "direction":
        return this.resolveDirection(key);
      case "target":
        return this.resolveTarget(key);
      case "item":
        return this.resolveItem(key);
      case "confirm":
        return this.resolveConfirm(key);
      case "string":
        return this.resolveString(key);
      default:
        return null;
    }
  }

  private resolveDirection(key: PendingKey): InputResponse | null {
    if (key.key === "Escape") {
      return { type: "direction", direction: null };
    }
    const dir = keyToDirection(key.event);
    if (dir !== null) {
      return { type: "direction", direction: dir };
    }
    return null;
  }

  private resolveTarget(key: PendingKey): InputResponse | null {
    // Target selection is simplified: any direction or escape
    if (key.key === "Escape") {
      return { type: "target", target: null };
    }
    // In a full implementation this would open a targeting overlay.
    // For now, accept Enter as "self-target" at {0,0}.
    if (key.key === "Enter" || key.key === " ") {
      return { type: "target", target: { x: 0, y: 0 } };
    }
    return null;
  }

  private resolveItem(key: PendingKey): InputResponse | null {
    if (key.key === "Escape") {
      return { type: "item", item: null };
    }
    // Item selection by letter (a-z) would be implemented here.
    // For now, accept any letter as cancellation (no inventory system yet).
    if (key.key.length === 1 && key.key >= "a" && key.key <= "z") {
      return { type: "item", item: null };
    }
    return null;
  }

  private resolveConfirm(key: PendingKey): InputResponse | null {
    if (key.key === "y" || key.key === "Y" || key.key === "Enter") {
      return { type: "confirm", confirmed: true };
    }
    if (key.key === "n" || key.key === "N" || key.key === "Escape") {
      return { type: "confirm", confirmed: false };
    }
    return null;
  }

  private resolveString(key: PendingKey): InputResponse | null {
    // String input is simplified: Enter submits, Escape cancels.
    if (key.key === "Enter") {
      return { type: "string", text: "" };
    }
    if (key.key === "Escape") {
      return { type: "string", text: null };
    }
    return null;
  }

  /**
   * Clear the key queue and any pending request.
   */
  flush(): void {
    this.keyQueue = [];
    this.lastCommand = null;
    this.lastDirection = null;
    this.repeatCount = 0;
    if (this.pendingRequest) {
      // Resolve with a cancellation
      this.pendingRequest.resolve({ type: "confirm", confirmed: false });
      this.pendingRequest = null;
    }
  }

  /**
   * Consume the last command, returning it along with the accumulated repeat count.
   */
  consumeCommand(): { command: string; count: number } | null {
    const cmd = this.lastCommand;
    if (cmd === null) return null;
    const count = Math.max(1, this.repeatCount);
    this.lastCommand = null;
    this.repeatCount = 0;
    return { command: cmd, count };
  }

  /**
   * Consume the last direction, returning it along with the accumulated repeat count.
   */
  consumeDirection(): { direction: number; count: number } | null {
    const dir = this.lastDirection;
    if (dir === null) return null;
    const count = Math.max(1, this.repeatCount);
    this.lastDirection = null;
    this.repeatCount = 0;
    return { direction: dir, count };
  }
}
