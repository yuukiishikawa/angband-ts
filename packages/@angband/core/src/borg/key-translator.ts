/**
 * @file borg/key-translator.ts
 * @brief Translate C borg ASCII keypresses into GameCommand discriminated union
 *
 * The C borg sends raw ASCII key codes over TCP. This stateful translator
 * converts those into typed GameCommand objects that the TS game loop accepts.
 *
 * Multi-key sequences (e.g. 'o' then direction for open) are accumulated
 * internally. The translate() method returns null when more input is needed.
 */

import type { GameCommand } from "../command/core.js";
import { CommandType } from "../command/core.js";

/**
 * State for multi-key command accumulation.
 *
 * pendingCommand: the command verb waiting for a direction or item argument
 * pendingItem: for commands that need an item letter before direction
 */
interface PendingState {
  command: string;
  itemIndex?: number;
}

/**
 * Map of numpad/vi direction keys to Angband direction numbers.
 *
 * Angband directions (numpad layout):
 *   7 8 9
 *   4 5 6
 *   1 2 3
 *
 * vi keys: y k u / h . l / b j n
 */
const DIRECTION_MAP: Record<string, number> = {
  "1": 1, "2": 2, "3": 3,
  "4": 4, "5": 5, "6": 6,
  "7": 7, "8": 8, "9": 9,
  "b": 1, "j": 2, "n": 3,
  "h": 4,          "l": 6,
  "y": 7, "k": 8, "u": 9,
};

/**
 * Angband's inventory letter mapping — skips h, j, k, l to avoid
 * vi direction conflicts. Matches C's all_letters_nohjkl[].
 */
const ALL_LETTERS_NOHJKL = "abcdefgimnopqrstuvwxyz";

/** Set of commands that expect an item letter as the next key. */
const ITEM_COMMANDS = new Set([
  "quaff", "read", "eat", "zap", "aim", "use", "equip", "unequip", "drop",
]);

/**
 * Map C body.txt slot index → TS EquipSlot enum.
 * C body order: WEAPON=0, BOW=1, RING_R=2, RING_L=3, AMULET=4,
 *               LIGHT=5, BODY=6, CLOAK=7, SHIELD=8, HAT=9, GLOVES=10, BOOTS=11
 * TS EquipSlot: NONE=0, WEAPON=1, BOW=2, RING=3, AMULET=4, ... BOOTS=11
 * C has 2 ring slots (body[2] and body[3]); TS has 1 (EquipSlot.RING=3).
 */
const C_BODY_TO_EQUIP_SLOT: number[] = [
  1,  // body[0] WEAPON → EquipSlot.WEAPON
  2,  // body[1] BOW → EquipSlot.BOW
  3,  // body[2] RING_R → EquipSlot.RING
  3,  // body[3] RING_L → EquipSlot.RING
  4,  // body[4] AMULET
  5,  // body[5] LIGHT
  6,  // body[6] BODY_ARMOR
  7,  // body[7] CLOAK
  8,  // body[8] SHIELD
  9,  // body[9] HAT
  10, // body[10] GLOVES
  11, // body[11] BOOTS
];

export class KeyTranslator {
  private pending: PendingState | null = null;

  /**
   * Reset any pending multi-key state.
   */
  reset(): void {
    this.pending = null;
  }

  /**
   * Translate a keypress into a GameCommand.
   *
   * @param keyCode  ASCII code of the key (decimal)
   * @param mods     Modifier flags (0 = none, 1 = CTRL)
   * @returns        A GameCommand if the input is complete, null if more input needed
   */
  translate(keyCode: number, mods: number): GameCommand | null {
    const ch = String.fromCharCode(keyCode);

    // Handle CTRL modifier
    if (mods === 1) {
      // CTRL+key — not many borg commands use this
      return null;
    }

    // ESC cancels any pending command
    if (keyCode === 27) { // ESC
      this.pending = null;
      return null;
    }

    // Space = dismiss -more- prompts, not a command
    if (keyCode === 32) { // SPACE
      return null;
    }

    // Enter = confirm, dismiss prompts
    if (keyCode === 13 || keyCode === 10) {
      return null;
    }

    // === Item letter check MUST come before direction check ===
    // Letters like 'n', 'b', 'y', 'u' are both vi direction keys AND
    // valid item letters in all_letters_nohjkl. When we're waiting for
    // an item letter, treat them as item letters, not directions.
    if (this.pending !== null && ITEM_COMMANDS.has(this.pending.command)) {
      const itemSlot = ALL_LETTERS_NOHJKL.indexOf(ch);
      if (itemSlot >= 0) {
        const itemCmd = this.pending.command;
        console.error(`[KEY] ${itemCmd} item letter='${ch}' slot=${itemSlot}\n`);

        // aim needs direction after item
        if (itemCmd === "aim") {
          this.pending = { command: "aim", itemIndex: itemSlot };
          return null;
        }

        this.pending = null;
        return this.makeItemCommand(itemCmd, itemSlot);
      }
      // Not a valid item letter — cancel pending
      this.pending = null;
      return null;
    }

    const dir = DIRECTION_MAP[ch];

    // If we have a pending command waiting for direction
    if (this.pending !== null && dir !== undefined && dir !== 5) {
      return this.completeWithDirection(dir);
    }

    // Direction key without pending = WALK
    if (dir !== undefined && dir !== 5 && this.pending === null) {
      return { type: CommandType.WALK, direction: dir };
    }

    // Command keys
    switch (ch) {
      // Stairs
      case "<": return { type: CommandType.GO_UP };
      case ">": return { type: CommandType.GO_DOWN };

      // Search
      case "s": return { type: CommandType.SEARCH };

      // Pickup
      case "g":
      case ",": return { type: CommandType.PICKUP };

      // Rest — borg sends 'R' followed by count; simplified: rest 1 turn
      case "R": return { type: CommandType.REST, turns: 1 };

      // Direction-requiring commands
      case "o": this.pending = { command: "open" }; return null;
      case "c": this.pending = { command: "close" }; return null;
      case "T": this.pending = { command: "tunnel" }; return null;
      case "D": this.pending = { command: "disarm" }; return null;
      case "+": this.pending = { command: "alter" }; return null;

      // Item-requiring commands
      case "q": this.pending = { command: "quaff" }; return null;
      case "r": this.pending = { command: "read" }; return null;
      case "E": this.pending = { command: "eat" }; return null;
      case "z": this.pending = { command: "zap" }; return null;
      case "a": this.pending = { command: "aim" }; return null;
      case "U": this.pending = { command: "use" }; return null;
      case "w": this.pending = { command: "equip" }; return null;
      case "t": this.pending = { command: "unequip" }; return null;
      case "d": this.pending = { command: "drop" }; return null;

      // Running (period key = run in direction)
      case ".": this.pending = { command: "run" }; return null;

      default:
        return null;
    }
  }

  /**
   * Complete a pending direction-requiring command.
   */
  private completeWithDirection(dir: number): GameCommand | null {
    if (!this.pending) return null;

    const cmd = this.pending.command;
    const itemIndex = this.pending.itemIndex;
    this.pending = null;

    switch (cmd) {
      case "open":    return { type: CommandType.OPEN, direction: dir };
      case "close":   return { type: CommandType.CLOSE, direction: dir };
      case "tunnel":  return { type: CommandType.TUNNEL, direction: dir };
      case "disarm":  return { type: CommandType.DISARM, direction: dir };
      case "alter":   return { type: CommandType.ALTER, direction: dir };
      case "run":     return { type: CommandType.RUN, direction: dir };
      case "aim":
        if (itemIndex !== undefined) {
          return { type: CommandType.AIM, itemIndex, direction: dir };
        }
        return null;
      default:
        return null;
    }
  }

  /**
   * Create item-based commands from command name and inventory index.
   */
  private makeItemCommand(cmd: string, itemIndex: number): GameCommand | null {
    switch (cmd) {
      case "quaff":   return { type: CommandType.QUAFF, itemIndex };
      case "read":    return { type: CommandType.READ, itemIndex };
      case "eat":     return { type: CommandType.EAT, itemIndex };
      case "zap":     return { type: CommandType.ZAP, itemIndex };
      case "use":     return { type: CommandType.USE, itemIndex };
      case "equip":   return { type: CommandType.EQUIP, itemIndex };
      case "unequip": {
        // C borg sends body slot index (0=weapon, 1=bow, ...); TS expects EquipSlot enum
        const equipSlot = C_BODY_TO_EQUIP_SLOT[itemIndex];
        if (equipSlot === undefined) return null;
        console.error(`[KEY] unequip bodyIdx=${itemIndex} → equipSlot=${equipSlot}\n`);
        return { type: CommandType.UNEQUIP, itemIndex: equipSlot };
      }
      case "drop":    return { type: CommandType.DROP, itemIndex, quantity: 1 };
      default:
        return null;
    }
  }
}
