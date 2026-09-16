/**
 * Validate a dictionary JSON file against the zod schema.
 *
 *   node scripts/validate-dictionary.ts [path]   (default: data/dictionary.json)
 *
 * Accepts either a full `{ version: 1, entries: [...] }` document or a bare
 * array of entries. Exits non-zero on any error so it can gate a commit or an
 * agent's output.
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import { z } from "zod";
import { dictionarySchema, entrySchema, type Entry } from "../src/lib/schema.ts";
import { glossIndex } from "../src/lib/session.ts";
import { slugify } from "../src/lib/slug.ts";

const path = process.argv[2] ?? "data/dictionary.json";

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(path, "utf8"));
} catch (error) {
  console.error(`Could not read ${path}: ${(error as Error).message}`);
  process.exit(1);
}

const parsed = Array.isArray(raw)
  ? z.array(entrySchema).safeParse(raw)
  : dictionarySchema.safeParse(raw);

if (!parsed.success) {
  console.error(`✗ ${path} does not match the schema:\n`);
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

const entries: Entry[] = Array.isArray(parsed.data) ? parsed.data : parsed.data.entries;

const errors: string[] = [];
const warnings: string[] = [];

const byId = new Map<string, Entry>();
for (const entry of entries) {
  if (byId.has(entry.id)) errors.push(`duplicate id "${entry.id}"`);
  byId.set(entry.id, entry);
}

const byHeadword = new Map<string, string[]>();
for (const entry of entries) {
  const key = `${entry.es}|${entry.pos}`;
  byHeadword.set(key, [...(byHeadword.get(key) ?? []), entry.id]);
}
for (const [key, ids] of byHeadword) {
  if (ids.length > 1)
    warnings.push(`"${key.split("|")[0]}" appears ${ids.length}x: ${ids.join(", ")}`);
}

for (const entry of entries) {
  const expected = slugify(entry.es);
  if (entry.id !== expected && !entry.id.startsWith(`${expected}-`)) {
    warnings.push(`id "${entry.id}" is not the slug of "${entry.es}" (expected "${expected}")`);
  }
  if (entry.tags.length === 0) warnings.push(`"${entry.id}" has no tags`);
  if (entry.en.some((value) => /^to\s/.test(value)) && entry.pos !== "verb") {
    warnings.push(`"${entry.id}" has an infinitive english gloss but pos is "${entry.pos}"`);
  }
  if (entry.pos === "verb" && !entry.en.some((value) => /^to\s/.test(value))) {
    warnings.push(`verb "${entry.id}" has no "to ..." english gloss`);
  }
  // Multi-word reflexives carry the pronoun on the first word, not the phrase:
  // "lavarse los dientes" is reflexive even though it ends in "dientes".
  if (entry.pos === "verb" && entry.verb.reflexive && !/se$/.test(entry.es.split(/\s+/)[0] ?? "")) {
    warnings.push(`verb "${entry.id}" is marked reflexive but its first word does not end in -se`);
  }
  if (entry.flagged) warnings.push(`"${entry.id}" is flagged for review: ${entry.flagged}`);
}

// An english → spanish prompt is chosen from the glosses no other entry claims.
// When there is none ("to be" for ser and estar), only a hint tells them apart.
const glosses = glossIndex(entries);
for (const entry of entries) {
  const unique = entry.en.some((gloss) => glosses.get(gloss.trim().toLowerCase())?.length === 1);
  if (!unique && !entry.hint) {
    const rivals = glosses
      .get(entry.en[0]!.trim().toLowerCase())!
      .filter((other) => other.id !== entry.id)
      .map((other) => other.id);
    warnings.push(
      `"${entry.id}" has no english gloss of its own (shared with ${rivals.join(", ")}); add a hint`,
    );
  }
}

const tags = [...new Set(entries.flatMap((entry) => entry.tags))].sort();
const posCounts = entries.reduce<Record<string, number>>((acc, entry) => {
  acc[entry.pos] = (acc[entry.pos] ?? 0) + 1;
  return acc;
}, {});

console.log(`${entries.length} entries in ${path}`);
console.log(`tags (${tags.length}): ${tags.join(", ")}`);
console.log(
  `parts of speech: ${Object.entries(posCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([pos, count]) => `${pos} ${count}`)
    .join(", ")}`,
);

// Same headword, different part of speech: legitimate (deportista is an
// adjective and a noun), and grading accepts either meaning for the shared
// spanish prompt. Listed so a new one is noticed, not warned about forever.
const posByEs = new Map<string, string[]>();
for (const entry of entries) {
  const key = entry.es.trim().toLowerCase();
  posByEs.set(key, [...(posByEs.get(key) ?? []), entry.pos]);
}
const homographs = [...posByEs]
  .filter(([, pos]) => new Set(pos).size > 1)
  .map(([es, pos]) => `${es} (${pos.join(", ")})`);
if (homographs.length > 0) {
  console.log(`shared headwords, either meaning accepted: ${homographs.join(", ")}`);
}

if (warnings.length > 0) {
  console.warn(`\n${warnings.length} warning(s):`);
  for (const warning of warnings) console.warn(`  ! ${warning}`);
}

if (errors.length > 0) {
  console.error(`\n${errors.length} error(s):`);
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

console.log("\n✓ schema valid");
