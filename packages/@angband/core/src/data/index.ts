/**
 * @file data/index.ts
 * @brief Data-layer barrel export
 *
 * The data layer provides parsers and loaders for Angband's text data files
 * (lib/gamedata/*.txt).
 */

export {
  Parser,
  ParseError,
  parseErrorStr,
  type ParserState,
} from "./parser.js";

export {
  type BlowMethodDef,
  type BlowEffectDef,
  type ObjectBaseDef,
  DataLoadError,
  loadBlowMethods,
  loadBlowEffects,
  loadObjectBases,
} from "./loader.js";

export {
  type GameData,
  createGameData,
  loadAllGameData,
} from "./registry.js";

export {
  parseObjectBases,
  parseObjectKinds,
  parseBrands,
  parseSlays,
  parseArtifacts,
  parseEgoItems,
} from "./object-loader.js";

export {
  type PitDefinition,
  PitRoomType,
  parsePits,
} from "./pit-loader.js";

export {
  type VaultTemplate,
  VaultType,
  parseVaults,
} from "./vault-loader.js";

export {
  type DungeonProfile,
  type ProfileRoomEntry,
  parseDungeonProfiles,
  selectProfile,
  pickRoomType,
} from "./dungeon-profile-loader.js";
