/**
 * @file data/vault-loader.ts
 * @brief Vault template parser
 *
 * Parses vault.json into VaultTemplate objects for use by the room generator.
 *
 * Copyright (c) 2024 Angband-TS Contributors
 *
 * This work is free software; you can redistribute it and/or modify it
 * under the terms of either GPL-2.0 or the Angband licence.
 */

// ── Types ──

/** Vault type classification. */
export const enum VaultType {
  LESSER = 0,
  MEDIUM = 1,
  GREATER = 2,
  INTERESTING = 3,
}

/** A vault template loaded from vault.json. */
export interface VaultTemplate {
  /** Vault name. */
  readonly name: string;
  /** Vault type. */
  readonly type: VaultType;
  /** Danger rating (higher = more dangerous, affects level feeling). */
  readonly rating: number;
  /** Template height in rows. */
  readonly rows: number;
  /** Template width in columns. */
  readonly columns: number;
  /** Minimum depth for this vault to appear (0 = any). */
  readonly minDepth: number;
  /** Maximum depth (0 = any). */
  readonly maxDepth: number;
  /** ASCII template lines. */
  readonly text: readonly string[];
}

// ── Type name mapping ──

const TYPE_MAP: Record<string, VaultType> = {
  "Lesser vault": VaultType.LESSER,
  "Lesser vault (new)": VaultType.LESSER,
  "Medium vault": VaultType.MEDIUM,
  "Medium vault (new)": VaultType.MEDIUM,
  "Greater vault": VaultType.GREATER,
  "Greater vault (new)": VaultType.GREATER,
  "Interesting room": VaultType.INTERESTING,
};

// ── Parser ──

/**
 * Parse vault.json into an array of VaultTemplate objects.
 *
 * @param raw The raw JSON array from vault.json
 * @returns Parsed vault templates
 */
export function parseVaults(raw: unknown[]): VaultTemplate[] {
  const templates: VaultTemplate[] = [];

  for (const entry of raw) {
    const e = entry as Record<string, unknown>;
    const name = String(e.name ?? "");
    const typeStr = String(e.type ?? "");
    const type = TYPE_MAP[typeStr] ?? VaultType.LESSER;
    const rating = Number(e.rating ?? 0);
    const rows = Number(e.rows ?? 0);
    const columns = Number(e.columns ?? 0);
    const minDepth = Number(e["min-depth"] ?? 0);
    const maxDepth = Number(e["max-depth"] ?? 0);
    const text = (e.D ?? e.text ?? []) as string[];

    if (text.length === 0 || rows === 0 || columns === 0) continue;

    templates.push({
      name,
      type,
      rating,
      rows,
      columns,
      minDepth,
      maxDepth,
      text,
    });
  }

  return templates;
}
