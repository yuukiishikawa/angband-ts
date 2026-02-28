/**
 * @file z/color.ts
 * @brief Color constants, tables, and gamma correction
 *
 * Port of z-color.c — 29 base colors with translation tables.
 *
 * Copyright (c) 1997 Ben Harrison
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

// ── Color constants ──

export const COLOUR_DARK = 0;
export const COLOUR_WHITE = 1;
export const COLOUR_SLATE = 2;
export const COLOUR_ORANGE = 3;
export const COLOUR_RED = 4;
export const COLOUR_GREEN = 5;
export const COLOUR_BLUE = 6;
export const COLOUR_UMBER = 7;
export const COLOUR_L_DARK = 8;
export const COLOUR_L_WHITE = 9;
export const COLOUR_L_PURPLE = 10;
export const COLOUR_YELLOW = 11;
export const COLOUR_L_RED = 12;
export const COLOUR_L_GREEN = 13;
export const COLOUR_L_BLUE = 14;
export const COLOUR_L_UMBER = 15;
export const COLOUR_PURPLE = 16;
export const COLOUR_VIOLET = 17;
export const COLOUR_TEAL = 18;
export const COLOUR_MUD = 19;
export const COLOUR_L_YELLOW = 20;
export const COLOUR_MAGENTA = 21;
export const COLOUR_L_TEAL = 22;
export const COLOUR_L_VIOLET = 23;
export const COLOUR_L_PINK = 24;
export const COLOUR_MUSTARD = 25;
export const COLOUR_BLUE_SLATE = 26;
export const COLOUR_DEEP_L_BLUE = 27;
export const COLOUR_SHADE = 28;

// ── Attribute types for color translation ──

export const ATTR_FULL = 0;
export const ATTR_MONO = 1;
export const ATTR_VGA = 2;
export const ATTR_BLIND = 3;
export const ATTR_LIGHT = 4;
export const ATTR_DARK = 5;
export const ATTR_HIGH = 6;
export const ATTR_METAL = 7;
export const ATTR_MISC = 8;
export const MAX_ATTR = 9;

export const MAX_COLORS = 32;
export const BASIC_COLORS = 29;

// ── RGB color table [extra, R, G, B] ──

export const angbandColorTable: [number, number, number, number][] = [
  [0x00, 0x00, 0x00, 0x00], // DARK
  [0x00, 0xff, 0xff, 0xff], // WHITE
  [0x00, 0x80, 0x80, 0x80], // SLATE
  [0x00, 0xff, 0x80, 0x00], // ORANGE
  [0x00, 0xc0, 0x00, 0x00], // RED
  [0x00, 0x00, 0x80, 0x40], // GREEN
  [0x00, 0x00, 0x40, 0xff], // BLUE
  [0x00, 0x80, 0x40, 0x00], // UMBER
  [0x00, 0x60, 0x60, 0x60], // L_DARK
  [0x00, 0xc0, 0xc0, 0xc0], // L_WHITE
  [0x00, 0xff, 0x00, 0xff], // L_PURPLE
  [0x00, 0xff, 0xff, 0x00], // YELLOW
  [0x00, 0xff, 0x40, 0x40], // L_RED
  [0x00, 0x00, 0xff, 0x00], // L_GREEN
  [0x00, 0x00, 0xff, 0xff], // L_BLUE
  [0x00, 0xc0, 0x80, 0x40], // L_UMBER
  [0x00, 0x90, 0x00, 0x90], // PURPLE
  [0x00, 0x90, 0x20, 0xff], // VIOLET
  [0x00, 0x00, 0xa0, 0xa0], // TEAL
  [0x00, 0x6c, 0x6c, 0x30], // MUD
  [0x00, 0xff, 0xff, 0x90], // L_YELLOW
  [0x00, 0xff, 0x00, 0xa0], // MAGENTA
  [0x00, 0x20, 0xff, 0xdc], // L_TEAL
  [0x00, 0xb8, 0xa8, 0xff], // L_VIOLET
  [0x00, 0xff, 0x80, 0x80], // L_PINK
  [0x00, 0xb4, 0xb4, 0x00], // MUSTARD
  [0x00, 0xa0, 0xc0, 0xd0], // BLUE_SLATE
  [0x00, 0x00, 0xb0, 0xff], // DEEP_L_BLUE
  [0x00, 0x28, 0x28, 0x28], // SHADE
  [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], // padding to MAX_COLORS
];

export interface ColorType {
  indexChar: string;
  name: string;
  colorTranslate: number[]; // MAX_ATTR entries
}

/**
 * Color table with names and translation mappings.
 * Indices: full, mono, vga, blind, lighter, darker, highlight, metallic, misc
 */
export const colorTable: ColorType[] = [
  { indexChar: "d", name: "Dark",       colorTranslate: [0, 0, 0, COLOUR_DARK, COLOUR_L_DARK, COLOUR_DARK, COLOUR_L_DARK, COLOUR_L_DARK, COLOUR_DARK] },
  { indexChar: "w", name: "White",      colorTranslate: [1, 1, 1, COLOUR_WHITE, COLOUR_YELLOW, COLOUR_L_WHITE, COLOUR_L_BLUE, COLOUR_YELLOW, COLOUR_WHITE] },
  { indexChar: "s", name: "Slate",      colorTranslate: [2, 1, 2, COLOUR_SLATE, COLOUR_L_WHITE, COLOUR_L_DARK, COLOUR_L_WHITE, COLOUR_L_WHITE, COLOUR_SLATE] },
  { indexChar: "o", name: "Orange",     colorTranslate: [3, 1, 3, COLOUR_L_WHITE, COLOUR_YELLOW, COLOUR_SLATE, COLOUR_YELLOW, COLOUR_YELLOW, COLOUR_ORANGE] },
  { indexChar: "r", name: "Red",        colorTranslate: [4, 1, 4, COLOUR_SLATE, COLOUR_L_RED, COLOUR_SLATE, COLOUR_L_RED, COLOUR_L_RED, COLOUR_RED] },
  { indexChar: "g", name: "Green",      colorTranslate: [5, 1, 5, COLOUR_SLATE, COLOUR_L_GREEN, COLOUR_SLATE, COLOUR_L_GREEN, COLOUR_L_GREEN, COLOUR_GREEN] },
  { indexChar: "b", name: "Blue",       colorTranslate: [6, 1, 6, COLOUR_SLATE, COLOUR_L_BLUE, COLOUR_SLATE, COLOUR_L_BLUE, COLOUR_L_BLUE, COLOUR_BLUE] },
  { indexChar: "u", name: "Umber",      colorTranslate: [7, 1, 7, COLOUR_L_DARK, COLOUR_L_UMBER, COLOUR_L_DARK, COLOUR_L_UMBER, COLOUR_L_UMBER, COLOUR_UMBER] },
  { indexChar: "D", name: "Light Dark", colorTranslate: [8, 1, 8, COLOUR_L_DARK, COLOUR_SLATE, COLOUR_L_DARK, COLOUR_SLATE, COLOUR_SLATE, COLOUR_L_DARK] },
  { indexChar: "W", name: "Light Slate",colorTranslate: [9, 1, 9, COLOUR_L_WHITE, COLOUR_WHITE, COLOUR_SLATE, COLOUR_WHITE, COLOUR_WHITE, COLOUR_SLATE] },
  { indexChar: "P", name: "Light Purple",colorTranslate: [10, 1, 10, COLOUR_SLATE, COLOUR_YELLOW, COLOUR_SLATE, COLOUR_YELLOW, COLOUR_YELLOW, COLOUR_L_PURPLE] },
  { indexChar: "y", name: "Yellow",     colorTranslate: [11, 1, 11, COLOUR_L_WHITE, COLOUR_L_YELLOW, COLOUR_L_WHITE, COLOUR_WHITE, COLOUR_WHITE, COLOUR_YELLOW] },
  { indexChar: "R", name: "Light Red",  colorTranslate: [12, 1, 12, COLOUR_L_WHITE, COLOUR_YELLOW, COLOUR_RED, COLOUR_YELLOW, COLOUR_YELLOW, COLOUR_L_RED] },
  { indexChar: "G", name: "Light Green",colorTranslate: [13, 1, 13, COLOUR_L_WHITE, COLOUR_YELLOW, COLOUR_GREEN, COLOUR_YELLOW, COLOUR_YELLOW, COLOUR_L_GREEN] },
  { indexChar: "B", name: "Light Blue", colorTranslate: [14, 1, 14, COLOUR_L_WHITE, COLOUR_YELLOW, COLOUR_BLUE, COLOUR_YELLOW, COLOUR_YELLOW, COLOUR_L_BLUE] },
  { indexChar: "U", name: "Light Umber",colorTranslate: [15, 1, 15, COLOUR_L_WHITE, COLOUR_YELLOW, COLOUR_UMBER, COLOUR_YELLOW, COLOUR_YELLOW, COLOUR_L_UMBER] },
  { indexChar: "p", name: "Purple",     colorTranslate: [16, 1, 10, COLOUR_SLATE, COLOUR_L_PURPLE, COLOUR_SLATE, COLOUR_L_PURPLE, COLOUR_L_PURPLE, COLOUR_L_PURPLE] },
  { indexChar: "v", name: "Violet",     colorTranslate: [17, 1, 10, COLOUR_SLATE, COLOUR_L_PURPLE, COLOUR_SLATE, COLOUR_L_PURPLE, COLOUR_L_PURPLE, COLOUR_L_PURPLE] },
  { indexChar: "t", name: "Teal",       colorTranslate: [18, 1, 6, COLOUR_SLATE, COLOUR_L_TEAL, COLOUR_SLATE, COLOUR_L_TEAL, COLOUR_L_TEAL, COLOUR_L_BLUE] },
  { indexChar: "m", name: "Mud",        colorTranslate: [19, 1, 5, COLOUR_SLATE, COLOUR_MUSTARD, COLOUR_SLATE, COLOUR_MUSTARD, COLOUR_MUSTARD, COLOUR_UMBER] },
  { indexChar: "Y", name: "Light Yellow",colorTranslate: [20, 1, 11, COLOUR_WHITE, COLOUR_WHITE, COLOUR_YELLOW, COLOUR_WHITE, COLOUR_WHITE, COLOUR_L_YELLOW] },
  { indexChar: "i", name: "Magenta-Pink",colorTranslate: [21, 1, 12, COLOUR_SLATE, COLOUR_L_PINK, COLOUR_RED, COLOUR_L_PINK, COLOUR_L_PINK, COLOUR_L_PURPLE] },
  { indexChar: "T", name: "Light Teal", colorTranslate: [22, 1, 14, COLOUR_L_WHITE, COLOUR_YELLOW, COLOUR_TEAL, COLOUR_YELLOW, COLOUR_YELLOW, COLOUR_L_BLUE] },
  { indexChar: "V", name: "Light Violet",colorTranslate: [23, 1, 10, COLOUR_L_WHITE, COLOUR_YELLOW, COLOUR_VIOLET, COLOUR_YELLOW, COLOUR_YELLOW, COLOUR_L_PURPLE] },
  { indexChar: "I", name: "Light Pink", colorTranslate: [24, 1, 12, COLOUR_L_WHITE, COLOUR_YELLOW, COLOUR_MAGENTA, COLOUR_YELLOW, COLOUR_YELLOW, COLOUR_L_PURPLE] },
  { indexChar: "M", name: "Mustard",    colorTranslate: [25, 1, 11, COLOUR_SLATE, COLOUR_YELLOW, COLOUR_SLATE, COLOUR_YELLOW, COLOUR_YELLOW, COLOUR_YELLOW] },
  { indexChar: "z", name: "Blue Slate", colorTranslate: [26, 1, 9, COLOUR_SLATE, COLOUR_DEEP_L_BLUE, COLOUR_SLATE, COLOUR_DEEP_L_BLUE, COLOUR_DEEP_L_BLUE, COLOUR_L_WHITE] },
  { indexChar: "Z", name: "Deep Light Blue",colorTranslate: [27, 1, 14, COLOUR_L_WHITE, COLOUR_L_BLUE, COLOUR_BLUE_SLATE, COLOUR_L_BLUE, COLOUR_L_BLUE, COLOUR_L_BLUE] },
  // SHADE and remaining slots
  { indexChar: " ", name: "Shade",      colorTranslate: [28, 0, 0, 0, 0, 0, 0, 0, 0] },
  { indexChar: " ", name: "",           colorTranslate: [29, 0, 0, 0, 0, 0, 0, 0, 0] },
  { indexChar: " ", name: "",           colorTranslate: [30, 0, 0, 0, 0, 0, 0, 0, 0] },
  { indexChar: " ", name: "",           colorTranslate: [31, 0, 0, 0, 0, 0, 0, 0, 0] },
];

/**
 * Convert a color character to an attribute index.
 */
export function colorCharToAttr(c: string): number {
  if (c === "" || c === " ") return COLOUR_DARK;
  for (let a = 0; a < BASIC_COLORS; a++) {
    if (colorTable[a]!.indexChar === c) return a;
  }
  return COLOUR_WHITE;
}

/**
 * Convert a color name string to an attribute index.
 */
export function colorTextToAttr(name: string): number {
  const lower = name.toLowerCase();
  for (let a = 0; a < MAX_COLORS; a++) {
    if (colorTable[a]!.name.toLowerCase() === lower) return a;
  }
  return COLOUR_WHITE;
}

/**
 * Get text name of an attribute.
 */
export function attrToText(a: number): string {
  if (a < BASIC_COLORS) return colorTable[a]!.name;
  return "Icky";
}

/**
 * Translate a color using the attribute translation table.
 */
export function getColor(a: number, attr: number, n: number): number {
  if (a & 0x80) return a;
  if (!attr) return a;
  let result = a;
  for (let i = 0; i < n; i++) {
    result = colorTable[result]!.colorTranslate[attr]!;
  }
  return result;
}

// ── Gamma correction ──

export const gammaTable = new Uint8Array(256);

const GAMMA_HELPER = new Int16Array([
  0, -1420, -1242, -1138, -1065, -1007, -961, -921, -887, -857, -830,
  -806, -783, -762, -744, -726, -710, -694, -679, -666, -652, -640,
  -628, -617, -606, -596, -586, -576, -567, -577, -549, -541, -532,
  -525, -517, -509, -502, -495, -488, -482, -475, -469, -463, -457,
  -451, -455, -439, -434, -429, -423, -418, -413, -408, -403, -398,
  -394, -389, -385, -380, -376, -371, -367, -363, -359, -355, -351,
  -347, -343, -339, -336, -332, -328, -325, -321, -318, -314, -311,
  -308, -304, -301, -298, -295, -291, -288, -285, -282, -279, -276,
  -273, -271, -268, -265, -262, -259, -257, -254, -251, -248, -246,
  -243, -241, -238, -236, -233, -231, -228, -226, -223, -221, -219,
  -216, -214, -212, -209, -207, -205, -203, -200, -198, -196, -194,
  -192, -190, -188, -186, -184, -182, -180, -178, -176, -174, -172,
  -170, -168, -166, -164, -162, -160, -158, -156, -155, -153, -151,
  -149, -147, -146, -144, -142, -140, -139, -137, -135, -134, -132,
  -130, -128, -127, -125, -124, -122, -120, -119, -117, -116, -114,
  -112, -111, -109, -108, -106, -105, -103, -102, -100, -99, -97, -96,
  -95, -93, -92, -90, -89, -87, -86, -85, -83, -82, -80, -79, -78,
  -76, -75, -74, -72, -71, -70, -68, -67, -66, -65, -63, -62, -61,
  -59, -58, -57, -56, -54, -53, -52, -51, -50, -48, -47, -46, -45,
  -44, -42, -41, -40, -39, -38, -37, -35, -34, -33, -32, -31, -30,
  -29, -27, -26, -25, -24, -23, -22, -21, -20, -19, -18, -17, -16,
  -14, -13, -12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1,
]);

/**
 * Build the gamma correction table. gamma goes 0..256 (128 = old default of 100).
 */
export function buildGammaTable(gamma: number): void {
  gammaTable[0] = 0;
  gammaTable[255] = 255;

  for (let i = 1; i < 255; i++) {
    let n = 1;
    let value = 256 * 256;
    let diff = GAMMA_HELPER[i]! * (gamma - 256);

    while (diff) {
      value += diff;
      n++;
      diff = Math.trunc(
        (Math.trunc(diff / 256) * GAMMA_HELPER[i]! * (gamma - 256)) /
          (256 * n),
      );
    }

    gammaTable[i] = Math.max(0, Math.min(255, Math.trunc((Math.trunc(value / 256) * i) / 256)));
  }
}
