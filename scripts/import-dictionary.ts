/**
 * Upsert a dictionary JSON file into the running app via POST /api/entries.
 *
 *   node scripts/import-dictionary.ts [path] [--url http://localhost:8888] [--dry-run]
 *
 * Defaults to data/dictionary.json against a local `netlify dev` server. Entries
 * are matched by id, so re-running is safe: existing ids are replaced, new ones
 * appended.
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import { z } from "zod";
import { dictionarySchema, entrySchema, type Entry } from "../src/lib/schema.ts";

const args = process.argv.slice(2);

function flag(name: string, fallback: string): string {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
}

const dryRun = args.includes("--dry-run");
const baseUrl = flag("url", "http://localhost:8888").replace(/\/$/, "");
const path = args.find((arg) => !arg.startsWith("--") && args[args.indexOf(arg) - 1] !== "--url");

const file = path ?? "data/dictionary.json";

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(file, "utf8"));
} catch (error) {
  console.error(`Could not read ${file}: ${(error as Error).message}`);
  process.exit(1);
}

const parsed = Array.isArray(raw)
  ? z.array(entrySchema).safeParse(raw)
  : dictionarySchema.safeParse(raw);

if (!parsed.success) {
  console.error(`✗ ${file} does not match the schema. Run validate-dictionary.ts for detail.`);
  for (const issue of parsed.error.issues.slice(0, 20)) {
    console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

const entries: Entry[] = Array.isArray(parsed.data) ? parsed.data : parsed.data.entries;
console.log(`${entries.length} valid entries in ${file}`);

if (dryRun) {
  console.log("--dry-run: nothing sent");
  process.exit(0);
}

const response = await fetch(`${baseUrl}/api/entries`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ entries }),
});

const result: unknown = await response.json().catch(() => null);

if (!response.ok) {
  console.error(`✗ ${baseUrl}/api/entries returned ${response.status}`);
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

const summary = result as { added?: string[]; updated?: string[]; total?: number };
console.log(`✓ added ${summary.added?.length ?? 0}, updated ${summary.updated?.length ?? 0}`);
console.log(`  dictionary now holds ${summary.total ?? "?"} entries`);
