/** Text normalization shared by grading in both directions. */

/** Lowercase, trim, collapse whitespace, strip surrounding punctuation. */
export function normalize(input: string): string {
  return input
    .normalize("NFC")
    .toLowerCase()
    .replace(/[¿¡]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "")
    .trim();
}

/**
 * Strip diacritics for a forgiving second-pass comparison. Note this also folds
 * ñ → n; ñ is a distinct letter rather than an accent, so callers distinguish
 * the two cases when wording feedback (see `differsOnlyByEnye`).
 */
export function foldAccents(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .normalize("NFC");
}

/** True when two strings match once diacritics are folded but not before. */
export function differsOnlyByAccent(a: string, b: string): boolean {
  return a !== b && foldAccents(a) === foldAccents(b);
}

/** True when the only difference between the two is an ñ written as n. */
export function differsOnlyByEnye(expected: string, given: string): boolean {
  if (!expected.includes("ñ")) return false;
  return expected.replace(/ñ/g, "n") === given.replace(/ñ/g, "n") && expected !== given;
}

const SPANISH_ARTICLES = ["el", "la", "los", "las"] as const;
export type SpanishArticle = (typeof SPANISH_ARTICLES)[number];

export interface ArticleSplit {
  article?: SpanishArticle;
  rest: string;
}

/** Split a leading definite article off a normalized Spanish answer. */
export function splitArticle(normalized: string): ArticleSplit {
  const match = /^(el|la|los|las)\s+(.*)$/.exec(normalized);
  if (!match) return { rest: normalized };
  return { article: match[1] as SpanishArticle, rest: match[2]! };
}

/** The definite article a noun takes, given its gender and number. */
export function articleFor(gender: "m" | "f", plural = false): SpanishArticle {
  if (plural) return gender === "m" ? "los" : "las";
  return gender === "m" ? "el" : "la";
}

/**
 * Expand learner shorthand for gendered forms: "tímido/a" also means "tímido",
 * "trabajador/ora" also means "trabajador".
 */
export function expandSlashForms(normalized: string): string[] {
  const out = [normalized];
  const match = /^(.*?)\/(\S+)(.*)$/.exec(normalized);
  if (match) {
    const [, head, , tail] = match;
    out.push(`${head}${tail}`.replace(/\s+/g, " ").trim());
  }
  return [...new Set(out)];
}

/** Strip a leading English infinitive marker or article before comparing. */
export function stripEnglishLead(normalized: string): string {
  return normalized.replace(/^(to|the|a|an)\s+/, "");
}
