/**
 * @file index.ts
 * @brief @angband/renderer barrel export
 *
 * Virtual terminal grid and display rendering for the Angband game.
 */

export { type TerminalCell, Terminal } from "./terminal.js";

export {
  type DisplayConfig,
  type CharAttr,
  type RenderChunk,
  type RenderPlayer,
  type RenderMonsterRace,
  type RenderFeatureType,
  DEFAULT_DISPLAY_CONFIG,
  FEAT,
  SQUARE_FLAG,
  TIMED_EFFECT,
  getTerrainChar,
  getMonsterChar,
  getObjectChar,
  getGridDisplay,
  renderMap,
  renderSidebar,
  renderMessages,
  renderStatusLine,
} from "./display.js";

export { type TextLine, TextBlock } from "./textblock.js";
