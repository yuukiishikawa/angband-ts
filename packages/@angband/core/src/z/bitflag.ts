/**
 * @file z/bitflag.ts
 * @brief Low-level bit vector manipulation
 *
 * Port of z-bitflag.c — Uint8Array-based bitflag set.
 *
 * Copyright (c) 2010 William L Moore
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

/** Bits per element (uint8). */
const FLAG_WIDTH = 8;

/** First valid flag value. */
const FLAG_START = 1;

/** Sentinel: no more flags. */
export const FLAG_END = 0;

/** Array size needed for n flags. */
export function flagSize(n: number): number {
  return Math.ceil(n / FLAG_WIDTH);
}

/** Maximum flag value + 1 for an array of `size` bytes. */
function flagMax(size: number): number {
  return size * FLAG_WIDTH + FLAG_START;
}

/** Byte offset for a flag id. */
function flagOffset(id: number): number {
  return Math.floor((id - FLAG_START) / FLAG_WIDTH);
}

/** Bit mask for a flag id within its byte. */
function flagBinary(id: number): number {
  return 1 << ((id - FLAG_START) % FLAG_WIDTH);
}

/**
 * A fixed-size bitflag set backed by a Uint8Array.
 */
export class BitFlag {
  readonly data: Uint8Array;
  readonly size: number;

  constructor(numFlags: number);
  constructor(data: Uint8Array);
  constructor(arg: number | Uint8Array) {
    if (typeof arg === "number") {
      this.size = flagSize(arg);
      this.data = new Uint8Array(this.size);
    } else {
      this.data = arg;
      this.size = arg.length;
    }
  }

  /** Test if a flag is set. */
  has(flag: number): boolean {
    if (flag === FLAG_END) return false;
    const offset = flagOffset(flag);
    const binary = flagBinary(flag);
    return (this.data[offset]! & binary) !== 0;
  }

  /** Set a flag. Returns true if a change was made. */
  on(flag: number): boolean {
    const offset = flagOffset(flag);
    const binary = flagBinary(flag);
    if (this.data[offset]! & binary) return false;
    this.data[offset]! |= binary;
    return true;
  }

  /** Clear a flag. Returns true if a change was made. */
  off(flag: number): boolean {
    const offset = flagOffset(flag);
    const binary = flagBinary(flag);
    if (!(this.data[offset]! & binary)) return false;
    this.data[offset]! &= ~binary;
    return true;
  }

  /** Iterate to find the next set flag >= `flag`. Returns FLAG_END if none. */
  next(flag: number): number {
    const max = flagMax(this.size);
    for (let f = flag; f < max; f++) {
      const offset = flagOffset(f);
      const binary = flagBinary(f);
      if (this.data[offset]! & binary) return f;
    }
    return FLAG_END;
  }

  /** Count set flags. */
  count(): number {
    let c = 0;
    for (let i = 0; i < this.size; i++) {
      for (let j = 1; j <= FLAG_WIDTH; j++) {
        if (this.data[i]! & flagBinary(j)) c++;
      }
    }
    return c;
  }

  /** Test if no flags are set. */
  isEmpty(): boolean {
    for (let i = 0; i < this.size; i++) {
      if (this.data[i]! > 0) return false;
    }
    return true;
  }

  /** Test if all flags are set. */
  isFull(): boolean {
    for (let i = 0; i < this.size; i++) {
      if (this.data[i] !== 0xff) return false;
    }
    return true;
  }

  /** Test if this and other have any flags in common. */
  isInter(other: BitFlag): boolean {
    for (let i = 0; i < this.size; i++) {
      if (this.data[i]! & other.data[i]!) return true;
    }
    return false;
  }

  /** Test if other is a subset of this. */
  isSubset(other: BitFlag): boolean {
    for (let i = 0; i < this.size; i++) {
      if (~this.data[i]! & other.data[i]!) return false;
    }
    return true;
  }

  /** Test equality. */
  isEqual(other: BitFlag): boolean {
    if (this.size !== other.size) return false;
    for (let i = 0; i < this.size; i++) {
      if (this.data[i] !== other.data[i]) return false;
    }
    return true;
  }

  /** Clear all flags. */
  wipe(): void {
    this.data.fill(0);
  }

  /** Set all flags. */
  setAll(): void {
    this.data.fill(0xff);
  }

  /** Toggle all flags. */
  negate(): void {
    for (let i = 0; i < this.size; i++) {
      this.data[i] = ~this.data[i]! & 0xff;
    }
  }

  /** Copy from another BitFlag. */
  copy(other: BitFlag): void {
    this.data.set(other.data);
  }

  /** Union: set flags that are in other. Returns true if changed. */
  union(other: BitFlag): boolean {
    let delta = false;
    for (let i = 0; i < this.size; i++) {
      if (~this.data[i]! & other.data[i]!) delta = true;
      this.data[i]! |= other.data[i]!;
    }
    return delta;
  }

  /** Intersection: clear flags not in other. Returns true if changed. */
  inter(other: BitFlag): boolean {
    let delta = false;
    for (let i = 0; i < this.size; i++) {
      if (this.data[i] !== other.data[i]) delta = true;
      this.data[i]! &= other.data[i]!;
    }
    return delta;
  }

  /** Difference: clear flags that are in other. Returns true if changed. */
  diff(other: BitFlag): boolean {
    let delta = false;
    for (let i = 0; i < this.size; i++) {
      if (this.data[i]! & other.data[i]!) delta = true;
      this.data[i]! &= ~other.data[i]!;
    }
    return delta;
  }

  /** Test if any of the given flags are set. */
  testAny(...flags: number[]): boolean {
    for (const f of flags) {
      if (this.has(f)) return true;
    }
    return false;
  }

  /** Test if all of the given flags are set. */
  testAll(...flags: number[]): boolean {
    for (const f of flags) {
      if (!this.has(f)) return false;
    }
    return true;
  }

  /** Set multiple flags. Returns true if any changes made. */
  setFlags(...flags: number[]): boolean {
    let delta = false;
    for (const f of flags) {
      if (this.on(f)) delta = true;
    }
    return delta;
  }

  /** Clear multiple flags. Returns true if any changes made. */
  clearFlags(...flags: number[]): boolean {
    let delta = false;
    for (const f of flags) {
      if (this.off(f)) delta = true;
    }
    return delta;
  }

  /** Wipe and set only the given flags. */
  init(...flags: number[]): void {
    this.wipe();
    for (const f of flags) {
      this.on(f);
    }
  }

  /** Clone this BitFlag. */
  clone(): BitFlag {
    return new BitFlag(new Uint8Array(this.data));
  }

  /** Iterate over all set flags. */
  *[Symbol.iterator](): Generator<number> {
    let f = this.next(FLAG_START);
    while (f !== FLAG_END) {
      yield f;
      f = this.next(f + 1);
    }
  }
}
