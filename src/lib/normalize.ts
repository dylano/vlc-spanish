/** Text normalization shared by grading in both directions. */

/**
 * Lowercase, trim, collapse whitespace, strip surrounding punctuation, and drop
 * apostrophes: iOS types a curly ’ by default, and "its hot" typed in a hurry is
 * a slip of punctuation, not of Spanish. Spanish itself does not use them.
 */
export function normalize(input: string): string {
  return input
    .normalize("NFC")
    .toLowerCase()
    .replace(/[¿¡'‘’]/g, "")
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

/**
 * Damerau-Levenshtein distance (optimal string alignment), bailing out once it
 * exceeds `max`. Transposition counts as a single edit, which plain Levenshtein
 * does not: swapping two letters is the commonest typing slip there is, and
 * "dienets" for "dientes" should cost one, not two.
 */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let beforePrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, beforePrevious[j - 2]! + cost);
      }
      current[j] = value;
      best = Math.min(best, value);
    }
    if (best > max) return max + 1;
    beforePrevious = previous;
    previous = current;
  }

  return previous[b.length]!;
}

/**
 * True when two strings differ only in their final character. Spanish carries
 * gender and number there, so for a noun or adjective this is an inflection
 * mistake rather than a slip of the finger.
 */
export function differsOnlyInEnding(expected: string, given: string): boolean {
  if (expected.length !== given.length || expected.length === 0) return false;
  return expected.slice(0, -1) === given.slice(0, -1) && expected !== given;
}

export interface ArticleDifference {
  expected: SpanishArticle;
  given: string;
}

/**
 * True when two phrases differ in exactly one word and that word is the definite
 * article on both sides — "lavarse las dientes" against "lavarse los dientes".
 * That is a gender mistake rather than a slip of the finger, so callers grade it
 * as wrong rather than forgiving it as a typo.
 */
export function articleOnlyDifference(
  expected: string,
  given: string,
): ArticleDifference | undefined {
  const expectedWords = expected.split(" ");
  const givenWords = given.split(" ");
  if (expectedWords.length !== givenWords.length) return undefined;

  const differing = expectedWords
    .map((word, index) => (word === givenWords[index] ? -1 : index))
    .filter((index) => index !== -1);

  if (differing.length !== 1) return undefined;

  const index = differing[0]!;
  const expectedWord = expectedWords[index]!;
  const givenWord = givenWords[index]!;
  const articles = new Set<string>(["el", "la", "los", "las"]);
  if (!articles.has(expectedWord) || !articles.has(givenWord)) return undefined;

  return { expected: expectedWord as SpanishArticle, given: givenWord };
}
