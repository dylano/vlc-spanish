import { foldAccents } from "./normalize.ts";

/**
 * Stable ASCII id for an entry, derived from its headword. Accents are folded
 * (ñ → n) so ids stay URL- and filename-safe: "a menudo" → "a-menudo",
 * "tímido" → "timido".
 */
export function slugify(input: string): string {
  return foldAccents(input.normalize("NFC").toLowerCase())
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Append -2, -3, … when a slug is already taken (homographs like "para"). */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}
