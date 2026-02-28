/**
 * @file cave/index.ts
 * @brief Cave layer barrel export
 *
 * Chunk management and square query/manipulation functions.
 */

export {
  createSquare,
  createChunk,
  chunkValidate,
  chunkContains,
  chunkContainsFully,
  chunkGetSquare,
  chunkSetSquare,
} from "./chunk.js";

export {
  // Feature info registry
  setFeatureInfo,
  getFeatureInfo,

  // Feature predicates
  featIsFloor,
  featIsWall,
  featIsGranite,
  featIsLos,
  featIsPassable,
  featIsProjectable,
  featIsRock,

  // Square feature predicates
  squareIsFloor,
  squareIsWall,
  squareIsGranite,
  squareIsClosedDoor,
  squareIsOpenDoor,

  // Square behavior predicates
  squareIsOpen,
  squareIsPassable,
  squareIsProjectable,
  squareAllowsLOS,

  // Square info predicates
  squareIsMark,
  squareIsGlow,
  squareIsVault,
  squareIsRoom,
  squareIsSeen,
  squareIsView,
  squareIsFeel,

  // Flag setters
  squareSetMark,
  squareClearMark,
  squareSetGlow,
  squareClearGlow,
  squareSetVault,
  squareClearVault,
  squareSetRoom,
  squareClearRoom,
  squareSetSeen,
  squareClearSeen,
  squareSetView,
  squareClearView,
  squareSetFeel,
  squareClearFeel,

  // Feature setters
  squareSetFeat,

  // Monster/object queries
  squareHasMonster,
  squareHasObject,
} from "./square.js";

export { buildDefaultFeatureInfo } from "./features.js";

export { setFeatureTable as setViewFeatureTable } from "./view.js";
export { setFeatureTable as setPathfindFeatureTable } from "./pathfind.js";

export {
  updateNoise,
  updateScent,
  scentAge,
} from "./heatmap.js";
