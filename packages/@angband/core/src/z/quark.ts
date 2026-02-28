/**
 * @file z/quark.ts
 * @brief String interning — each unique string stored once, accessed by index.
 *
 * Port of z-quark.c.
 *
 * Copyright (c) 1997 Ben Harrison
 * Copyright (c) 2007 "Elly"
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

/** Quark ID type (just a number index). */
export type QuarkId = number;

/**
 * String interning store. Index 0 is reserved (null quark).
 */
export class QuarkStore {
  private quarks: string[] = [""];  // index 0 is reserved

  /** Get or create a quark for the given string. */
  add(str: string): QuarkId {
    // Search for existing
    for (let q = 1; q < this.quarks.length; q++) {
      if (this.quarks[q] === str) return q;
    }
    // Add new
    const q = this.quarks.length;
    this.quarks.push(str);
    return q;
  }

  /** Get the string for a quark, or null if invalid. */
  str(q: QuarkId): string | null {
    if (q >= this.quarks.length) return null;
    return this.quarks[q] ?? null;
  }

  /** Number of quarks (excluding the reserved 0). */
  get count(): number {
    return this.quarks.length - 1;
  }

  /** Reset the store. */
  reset(): void {
    this.quarks = [""];
  }
}
