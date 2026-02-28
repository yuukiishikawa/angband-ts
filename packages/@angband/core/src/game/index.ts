/**
 * @file game/index.ts
 * @brief Game subsystem barrel export
 *
 * Exports the event system, game state management, and input abstraction.
 */

export {
  GameEventType,
  N_GAME_EVENTS,
  EventBus,
  type GameEvent,
  type EventHandler,
} from "./event.js";

export {
  MessageType,
  DEFAULT_MAX_MESSAGES,
  createGameState,
  addMessage,
  getRecentMessages,
  type GameMessage,
  type GameState,
} from "./state.js";

export {
  type DirectionRequest,
  type TargetRequest,
  type ItemRequest,
  type ConfirmRequest,
  type StringRequest,
  type InputRequest,
  type DirectionResponse,
  type TargetResponse,
  type ItemResponse,
  type ConfirmResponse,
  type StringResponse,
  type InputResponse,
  type InputProvider,
} from "./input.js";

export {
  // Constants
  NORMAL_SPEED,
  MOVE_ENERGY,
  EXTRACT_ENERGY,

  // Energy system
  turnEnergy,

  // Regeneration
  PY_REGEN_NORMAL,
  regenerateHP,
  regenerateMana,

  // Hunger
  processHunger,

  // Timed effects
  decreaseTimeouts,

  // Level change
  checkLevelChange,
  changeLevel,

  // Monster processing
  processMonsters,

  // World processing
  processWorld,

  // Player turn processing
  type CommandInputProvider,
  processPlayer,

  // Main game loop
  runGameLoop,
} from "./world.js";
