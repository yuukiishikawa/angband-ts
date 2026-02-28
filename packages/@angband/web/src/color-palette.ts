/**
 * @file color-palette.ts
 * @brief Map Angband COLOUR_* constants to CSS color strings
 *
 * The RGB values are taken directly from angbandColorTable in z/color.ts.
 */

import {
  COLOUR_DARK,
  COLOUR_WHITE,
  COLOUR_SLATE,
  COLOUR_ORANGE,
  COLOUR_RED,
  COLOUR_GREEN,
  COLOUR_BLUE,
  COLOUR_UMBER,
  COLOUR_L_DARK,
  COLOUR_L_WHITE,
  COLOUR_L_PURPLE,
  COLOUR_YELLOW,
  COLOUR_L_RED,
  COLOUR_L_GREEN,
  COLOUR_L_BLUE,
  COLOUR_L_UMBER,
  COLOUR_PURPLE,
  COLOUR_VIOLET,
  COLOUR_TEAL,
  COLOUR_MUD,
  COLOUR_L_YELLOW,
  COLOUR_MAGENTA,
  COLOUR_L_TEAL,
  COLOUR_L_VIOLET,
  COLOUR_L_PINK,
  COLOUR_MUSTARD,
  COLOUR_BLUE_SLATE,
  COLOUR_DEEP_L_BLUE,
  COLOUR_SHADE,
} from "@angband/core/z/color.js";

/**
 * CSS color string for each Angband color index.
 *
 * Index corresponds to COLOUR_* constants (0..28).
 * Values match the RGB tuples in angbandColorTable.
 */
const CSS_COLORS: readonly string[] = [
  /* 0  DARK          */ "#000000",
  /* 1  WHITE         */ "#ffffff",
  /* 2  SLATE         */ "#808080",
  /* 3  ORANGE        */ "#ff8000",
  /* 4  RED           */ "#c00000",
  /* 5  GREEN         */ "#008040",
  /* 6  BLUE          */ "#0040ff",
  /* 7  UMBER         */ "#804000",
  /* 8  L_DARK        */ "#606060",
  /* 9  L_WHITE       */ "#c0c0c0",
  /* 10 L_PURPLE      */ "#ff00ff",
  /* 11 YELLOW        */ "#ffff00",
  /* 12 L_RED         */ "#ff4040",
  /* 13 L_GREEN       */ "#00ff00",
  /* 14 L_BLUE        */ "#00ffff",
  /* 15 L_UMBER       */ "#c08040",
  /* 16 PURPLE        */ "#900090",
  /* 17 VIOLET        */ "#9020ff",
  /* 18 TEAL          */ "#00a0a0",
  /* 19 MUD           */ "#6c6c30",
  /* 20 L_YELLOW      */ "#ffff90",
  /* 21 MAGENTA       */ "#ff00a0",
  /* 22 L_TEAL        */ "#20ffdc",
  /* 23 L_VIOLET      */ "#b8a8ff",
  /* 24 L_PINK        */ "#ff8080",
  /* 25 MUSTARD       */ "#b4b400",
  /* 26 BLUE_SLATE    */ "#a0c0d0",
  /* 27 DEEP_L_BLUE   */ "#00b0ff",
  /* 28 SHADE         */ "#282828",
];

/**
 * Convert an Angband COLOUR_* constant to a CSS color string.
 *
 * Falls back to white for out-of-range values.
 *
 * @param color An Angband color index (COLOUR_DARK through COLOUR_SHADE).
 * @returns A CSS rgb hex string such as "#ff8000".
 */
export function angbandColorToCSS(color: number): string {
  if (color >= 0 && color < CSS_COLORS.length) {
    return CSS_COLORS[color]!;
  }
  return CSS_COLORS[COLOUR_WHITE]!;
}

// Re-export color constants so other web modules can use them without
// importing from core directly.
export {
  COLOUR_DARK,
  COLOUR_WHITE,
  COLOUR_SLATE,
  COLOUR_ORANGE,
  COLOUR_RED,
  COLOUR_GREEN,
  COLOUR_BLUE,
  COLOUR_UMBER,
  COLOUR_L_DARK,
  COLOUR_L_WHITE,
  COLOUR_L_PURPLE,
  COLOUR_YELLOW,
  COLOUR_L_RED,
  COLOUR_L_GREEN,
  COLOUR_L_BLUE,
  COLOUR_L_UMBER,
  COLOUR_PURPLE,
  COLOUR_VIOLET,
  COLOUR_TEAL,
  COLOUR_MUD,
  COLOUR_L_YELLOW,
  COLOUR_MAGENTA,
  COLOUR_L_TEAL,
  COLOUR_L_VIOLET,
  COLOUR_L_PINK,
  COLOUR_MUSTARD,
  COLOUR_BLUE_SLATE,
  COLOUR_DEEP_L_BLUE,
  COLOUR_SHADE,
};
