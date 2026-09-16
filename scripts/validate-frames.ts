/**
 * Validate sentence frames and glue against the schema and the dictionary.
 *
 *   node scripts/validate-frames.ts
 *
 * Exits non-zero on any error, so it gates the build like the dictionary check.
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import { dictionarySchema } from "../src/lib/schema.ts";
import { checkFrame, framesFileSchema, glueSchema } from "../src/lib/sentences/frames.ts";

function load<T>(path: string, parse: (raw: unknown) => T): T {
  try {
    return parse(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    console.error(`✗ ${path}: ${(error as Error).message}`);
    process.exit(1);
  }
}

const dictionary = load("data/dictionary.json", (raw) => dictionarySchema.parse(raw)).entries;
const glue = load("data/glue.json", (raw) => glueSchema.parse(raw));
const { frames } = load("data/frames.json", (raw) => framesFileSchema.parse(raw));

let errors = 0;
let warnings = 0;
const ids = new Set<string>();
for (const frame of frames) {
  if (ids.has(frame.id)) {
    console.error(`  ✗ ${frame.id}: duplicate id`);
    errors++;
  }
  ids.add(frame.id);
  const result = checkFrame(frame, { dictionary, glue, random: Math.random });
  for (const message of result.errors) console.error(`  ✗ ${frame.id}: ${message}`);
  for (const message of result.warnings) console.warn(`  ! ${frame.id}: ${message}`);
  errors += result.errors.length;
  warnings += result.warnings.length;
}

console.log(`${frames.length} frames, ${errors} error(s), ${warnings} warning(s)`);
if (errors > 0) process.exit(1);
console.log("✓ frames valid");
