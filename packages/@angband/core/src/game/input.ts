/**
 * @file game/input.ts
 * @brief Input abstraction — async UI queries from game logic
 *
 * Port of game-input.c — provides a typed, Promise-based interface for
 * the game to request information from the UI (direction, target, item
 * selection, confirmation, text input).
 *
 * Copyright (c) 2014 Nick McConnell
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { Loc } from "../z/type.js";
import type { ObjectType } from "../types/object.js";

// ── Input requests (discriminated union) ──

/**
 * Ask the player for a direction (numpad 1-9).
 */
export interface DirectionRequest {
  readonly type: "direction";
  readonly prompt: string;
}

/**
 * Ask the player for a target location on the map.
 */
export interface TargetRequest {
  readonly type: "target";
  readonly prompt: string;
}

/**
 * Ask the player to select an item from inventory/equipment.
 */
export interface ItemRequest {
  readonly type: "item";
  readonly prompt: string;
  /** Optional filter predicate to limit which items are selectable. */
  readonly filter?: (obj: ObjectType) => boolean;
}

/**
 * Ask the player for a yes/no confirmation.
 */
export interface ConfirmRequest {
  readonly type: "confirm";
  readonly prompt: string;
}

/**
 * Ask the player for a text string (e.g. character name).
 */
export interface StringRequest {
  readonly type: "string";
  readonly prompt: string;
  /** Maximum length of the input string. */
  readonly maxLen: number;
}

/**
 * A request from the game logic to the UI for player input.
 *
 * This is a discriminated union — the `type` field determines the shape.
 */
export type InputRequest =
  | DirectionRequest
  | TargetRequest
  | ItemRequest
  | ConfirmRequest
  | StringRequest;

// ── Input responses (discriminated union) ──

/**
 * Response to a direction request.
 */
export interface DirectionResponse {
  readonly type: "direction";
  /** The chosen direction (1-9, numpad layout), or null if cancelled. */
  readonly direction: number | null;
}

/**
 * Response to a target request.
 */
export interface TargetResponse {
  readonly type: "target";
  /** The chosen target location, or null if cancelled. */
  readonly target: Loc | null;
}

/**
 * Response to an item request.
 */
export interface ItemResponse {
  readonly type: "item";
  /** The chosen item, or null if cancelled. */
  readonly item: ObjectType | null;
}

/**
 * Response to a confirm request.
 */
export interface ConfirmResponse {
  readonly type: "confirm";
  /** True if the player confirmed, false if denied or cancelled. */
  readonly confirmed: boolean;
}

/**
 * Response to a string request.
 */
export interface StringResponse {
  readonly type: "string";
  /** The entered text, or null if cancelled. */
  readonly text: string | null;
}

/**
 * A response from the UI to a game input request.
 *
 * This is a discriminated union matching the InputRequest types.
 */
export type InputResponse =
  | DirectionResponse
  | TargetResponse
  | ItemResponse
  | ConfirmResponse
  | StringResponse;

// ── Input provider interface ──

/**
 * Interface that a UI must implement to provide player input to the game.
 *
 * The game logic calls `request()` with an InputRequest and awaits the
 * UI's response. This allows the game to be decoupled from any particular
 * UI implementation (terminal, web, test harness).
 *
 * Input is inherently asynchronous: the game must wait for the player.
 */
export interface InputProvider {
  /**
   * Request input from the player.
   *
   * @param req - The input request describing what is needed.
   * @returns A promise resolving to the player's response.
   */
  request(req: InputRequest): Promise<InputResponse>;
}
