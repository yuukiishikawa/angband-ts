/**
 * @file z/type.ts
 * @brief Data types: Loc (2D coordinate), PointSet
 *
 * Port of z-type.c.
 *
 * Copyright (c) 2007 Angband Developers
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

import type { RNG } from "./rand.js";

/**
 * 2D grid coordinate. Immutable value type.
 */
export interface Loc {
  readonly x: number;
  readonly y: number;
}

/** Create a Loc. */
export function loc(x: number, y: number): Loc {
  return { x, y };
}

/** Test equality. */
export function locEq(a: Loc, b: Loc): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Test if (0,0). */
export function locIsZero(g: Loc): boolean {
  return g.x === 0 && g.y === 0;
}

/** Vector sum. */
export function locSum(a: Loc, b: Loc): Loc {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** Vector difference. */
export function locDiff(a: Loc, b: Loc): Loc {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Offset by (dx, dy). */
export function locOffset(g: Loc, dx: number, dy: number): Loc {
  return { x: g.x + dx, y: g.y + dy };
}

/** Random location with spread around a center. */
export function randLoc(rng: RNG, g: Loc, xSpread: number, ySpread: number): Loc {
  return {
    x: rng.spread(g.x, xSpread),
    y: rng.spread(g.y, ySpread),
  };
}

/**
 * A set of Loc points (dynamic array, not hash-based).
 */
export class PointSet {
  private pts: Loc[];
  private _n: number;

  constructor(initialSize = 16) {
    this.pts = new Array<Loc>(initialSize);
    this._n = 0;
  }

  get length(): number {
    return this._n;
  }

  add(grid: Loc): void {
    this.pts[this._n] = grid;
    this._n++;
    if (this._n >= this.pts.length) {
      this.pts.length *= 2;
    }
  }

  contains(grid: Loc): boolean {
    for (let i = 0; i < this._n; i++) {
      if (locEq(this.pts[i]!, grid)) return true;
    }
    return false;
  }

  get(index: number): Loc {
    return this.pts[index]!;
  }

  *[Symbol.iterator](): Generator<Loc> {
    for (let i = 0; i < this._n; i++) {
      yield this.pts[i]!;
    }
  }
}

/**
 * A (value, name) pairing — used for object type grouping.
 */
export interface Grouper {
  tval: number;
  name: string;
}
