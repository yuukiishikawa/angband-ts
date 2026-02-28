/**
 * @file borg/index.ts
 * @brief Barrel export for the remote borg server module
 *
 * The borg AI auto-player has been removed. This module now only
 * provides the TCP remote server for C borg connections.
 */

export { RemoteBorgServer } from "./remote-server.js";
export { ScreenRenderer, ScreenBuffer, TERM_COLS, TERM_ROWS } from "./screen-renderer.js";
export { KeyTranslator } from "./key-translator.js";
