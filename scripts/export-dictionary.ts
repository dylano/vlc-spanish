/**
 * Pull the live dictionary back down into a local file.
 *
 *   node scripts/export-dictionary.ts [path] [--url https://vlc-spanish.netlify.app]
 *
 * Defaults to data/dictionary.json against production. Use this after anyone has
 * added words through the app, so the file in git matches what the family is
 * actually studying.
 */
import { writeFileSync } from "node:fs";
import process from "node:process";
import { dictionarySchema } from "../src/lib/schema.ts";

const args = process.argv.slice(2);

function flag(name: string, fallback: string): string {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
}

const baseUrl = flag("url", "https://vlc-spanish.netlify.app").replace(/\/$/, "");
const file = args.find((arg) => !arg.startsWith("--") && args[args.indexOf(arg) - 1] !== "--url");
const target = file ?? "data/dictionary.json";

const response = await fetch(`${baseUrl}/api/dictionary`);
if (!response.ok) {
  console.error(`✗ ${baseUrl}/api/dictionary returned ${response.status}`);
  process.exit(1);
}

const parsed = dictionarySchema.safeParse(await response.json());
if (!parsed.success) {
  console.error("✗ the live dictionary does not match the schema:");
  for (const issue of parsed.error.issues.slice(0, 20)) {
    console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

writeFileSync(target, `${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
console.log(`✓ wrote ${parsed.data.entries.length} entries to ${target}`);
console.log(`  last updated ${parsed.data.updatedAt ?? "(unknown)"}`);
