/**
 * @file index.ts
 * @brief @angband/core entry point
 *
 * All subsystems are re-exported here. Subsystems with potential naming
 * conflicts are exported as namespaces; z and data retain flat exports
 * for backwards compatibility.
 */

// Flat re-exports (established, no conflicts)
export * from "./z/index.js";
export * from "./data/index.js";

// Namespace re-exports (avoid symbol collisions between subsystems)
export * as types from "./types/index.js";
export * as cave from "./cave/index.js";
export * as player from "./player/index.js";
export * as monster from "./monster/index.js";
export * as object from "./object/index.js";
export * as command from "./command/index.js";
export * as effect from "./effect/index.js";
export * as project from "./project/index.js";
export * as game from "./game/index.js";
export * as generate from "./generate/index.js";
