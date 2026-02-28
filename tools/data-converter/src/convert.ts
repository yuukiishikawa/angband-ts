/**
 * @file convert.ts
 * @brief Build-time tool to convert Angband gamedata .txt files to JSON.
 *
 * Reads the colon-delimited text files from Angband's lib/gamedata/ directory
 * and produces structured JSON files suitable for runtime loading.
 *
 * Usage:
 *   npx tsx tools/data-converter/src/convert.ts [--src <dir>] [--out <dir>]
 *
 * Defaults:
 *   --src  ../../angband/lib/gamedata   (relative to this repo root)
 *   --out  packages/@angband/core/gamedata
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ── Parsing types ──

/**
 * A single parsed gamedata record. Keys are directive names, values are
 * either scalar strings or arrays of strings (for flags, repeated fields, etc).
 */
export interface GamedataRecord {
  [key: string]: string | string[];
}

// Directives whose values should always be collected into arrays (even on
// first occurrence).  Additional multi-line directives are detected
// automatically when they appear more than once in a single record.
const ARRAY_DIRECTIVES = new Set(["flags", "flags-off", "values", "spells"]);

// Directives whose repeated values are concatenated with newlines rather
// than collected into arrays.
const CONCAT_DIRECTIVES = new Set(["desc"]);

// ── Core parser ──

/**
 * Parse a single Angband gamedata text file into an array of records.
 *
 * Each record is a plain object whose keys are directive names and whose
 * values are either strings or string arrays (for flags, multi-value, and
 * repeated directives).
 */
export function parseGamedata(text: string): GamedataRecord[] {
  const records: GamedataRecord[] = [];
  let current: GamedataRecord | null = null;

  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip blank lines and comments
    if (line === "" || line.startsWith("#")) {
      continue;
    }

    // Conditional lines (starting with ?:) are skipped for now
    if (line.startsWith("?:")) {
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) {
      // Lines without a colon are ignored (shouldn't happen in well-formed data)
      continue;
    }

    const directive = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    // "name" starts a new record
    if (directive === "name") {
      current = { name: value };
      records.push(current);
      continue;
    }

    // "default" lines are stored as a special record at the front
    if (directive === "default") {
      // default:field:value — parse the sub-fields
      const subColonIdx = value.indexOf(":");
      if (subColonIdx >= 0) {
        const subKey = value.slice(0, subColonIdx).trim();
        const subVal = value.slice(subColonIdx + 1).trim();
        // Find or create the defaults record
        let defaults = records.find(
          (r) => r["_type"] === "defaults"
        );
        if (!defaults) {
          defaults = { _type: "defaults" };
          records.unshift(defaults);
        }
        defaults[subKey] = subVal;
      }
      continue;
    }

    // All other directives attach to the current record
    if (!current) {
      // If no record has been started yet, create an implicit one
      current = {};
      records.push(current);
    }

    addField(current, directive, value);
  }

  return records;
}

/**
 * Add a field to a record, handling array-collected and concatenated
 * directives appropriately.
 */
function addField(record: GamedataRecord, directive: string, value: string): void {
  const existing = record[directive];

  if (CONCAT_DIRECTIVES.has(directive)) {
    // Concatenate with newline
    if (existing === undefined) {
      record[directive] = value;
    } else if (typeof existing === "string") {
      record[directive] = existing + "\n" + value;
    } else {
      // Already an array (shouldn't normally happen for desc, but handle it)
      record[directive] = existing.join("\n") + "\n" + value;
    }
    return;
  }

  if (ARRAY_DIRECTIVES.has(directive)) {
    // Always collect into an array
    const items = splitPipeValues(value);
    if (existing === undefined) {
      record[directive] = items;
    } else if (Array.isArray(existing)) {
      existing.push(...items);
    } else {
      record[directive] = [existing, ...items];
    }
    return;
  }

  // Generic directive: if it appears more than once, promote to array
  if (existing === undefined) {
    record[directive] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else {
    record[directive] = [existing, value];
  }
}

/**
 * Split a pipe-separated value string into trimmed tokens.
 * e.g. "HATES_ACID | HATES_FIRE" -> ["HATES_ACID", "HATES_FIRE"]
 *
 * If the value contains no pipes, returns a single-element array.
 */
function splitPipeValues(value: string): string[] {
  if (value.includes("|")) {
    return value.split("|").map((s) => s.trim()).filter(Boolean);
  }
  return value ? [value] : [];
}

// ── File I/O ──

function convertFile(srcPath: string, outDir: string): void {
  const text = fs.readFileSync(srcPath, "utf-8");
  const records = parseGamedata(text);

  const baseName = path.basename(srcPath, ".txt");
  const outPath = path.join(outDir, baseName + ".json");

  fs.writeFileSync(outPath, JSON.stringify(records, null, 2) + "\n", "utf-8");

  const count = records.filter((r) => r["_type"] !== "defaults").length;
  console.log(`  ${path.basename(srcPath)} -> ${baseName}.json (${count} records)`);
}

function convertAll(srcDir: string, outDir: string): void {
  if (!fs.existsSync(srcDir)) {
    console.error(`Source directory does not exist: ${srcDir}`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const files = fs
    .readdirSync(srcDir)
    .filter((f: string) => f.endsWith(".txt"))
    .sort();

  if (files.length === 0) {
    console.error(`No .txt files found in: ${srcDir}`);
    process.exit(1);
  }

  console.log(
    `Converting ${files.length} gamedata files from ${srcDir} to ${outDir}`
  );

  for (const file of files) {
    convertFile(path.join(srcDir, file), outDir);
  }

  console.log("Done.");
}

// ── CLI entry point ──

function main(): void {
  const args = process.argv.slice(2);
  let srcDir: string | undefined;
  let outDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--src" && i + 1 < args.length) {
      srcDir = args[++i]!;
    } else if (arg === "--out" && i + 1 < args.length) {
      outDir = args[++i]!;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: convert [--src <dir>] [--out <dir>]");
      console.log("");
      console.log("Options:");
      console.log(
        "  --src  Source directory with .txt gamedata files (default: angband/lib/gamedata)"
      );
      console.log(
        "  --out  Output directory for JSON files (default: packages/@angband/core/gamedata)"
      );
      process.exit(0);
    }
  }

  // Resolve defaults relative to the repo root (three levels up from tools/data-converter/src/)
  const thisFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(thisFile), "../../..");

  if (!srcDir) {
    srcDir = path.resolve(repoRoot, "../angband/lib/gamedata");
  } else {
    srcDir = path.resolve(srcDir);
  }

  if (!outDir) {
    outDir = path.resolve(repoRoot, "packages/@angband/core/gamedata");
  } else {
    outDir = path.resolve(outDir);
  }

  convertAll(srcDir, outDir);
}

// Only run when executed directly (not when imported by tests)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
