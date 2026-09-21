import type { Direction, Entry } from "./schema.ts";
import { spanishPlural } from "./sentences/frames.ts";
import {
  articleFor,
  articleOnlyDifference,
  differsOnlyByAccent,
  differsOnlyByEnye,
  differsOnlyInEnding,
  editDistance,
  expandSlashForms,
  foldAccents,
  normalize,
  splitArticle,
  stripEnglishLead,
  type SpanishArticle,
} from "./normalize.ts";

export type Result = "correct" | "hard" | "wrong";

export interface Grade {
  result: Result;
  /** Canonical answer to show in feedback. */
  expected: string;
  /** Short inline explanation, present whenever result is not plain correct. */
  note?: string;
}

export interface GradeOptions {
  /**
   * en→es only. When true the prompt asked for the noun with its article, so a
   * bare noun is downgraded to "hard" and a wrong article counts as wrong.
   * When false the article is optional and a wrong article is only "hard".
   * A noun's own `article` setting can relax this (see `articleRequired`).
   */
  requireArticle?: boolean;
  /**
   * Other entries that answer to the same english prompt. Prompting "to be"
   * cannot distinguish ser from estar, so an answer matching one of these is
   * graded "hard" with an explanation rather than simply marked wrong.
   */
  confusableWith?: Entry[];
  /**
   * The whole dictionary, used to tell a typo from a different word. `junio`
   * and `julio` are one keystroke apart but mean different things, so an answer
   * that is itself a headword is never forgiven as a slip.
   */
  dictionary?: Entry[];
}

const SEVERITY: Record<Result, number> = { correct: 0, hard: 1, wrong: 2 };

function worst(a: Result, b: Result): Result {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

/**
 * How an accepted Spanish string relates to the headword. Inflections carry the
 * same meaning and count as correct; other-gender nouns and conjugated verbs are
 * different words or different forms than the prompt asked for, so they are
 * accepted but downgraded rather than silently marked right.
 */
type CandidateKind = "exact" | "inflection" | "other-gender" | "conjugation" | "missing-reflexive";

interface Candidate {
  text: string;
  kind: CandidateKind;
  article?: SpanishArticle;
  /** Human label for the form, used in feedback ("the feminine", "the yo form"). */
  label?: string;
}

const VERB_FORM_LABELS: Record<string, string> = {
  yo: "the yo form",
  tu: "the tú form",
  el: "the él form",
  nosotros: "the nosotros form",
  vosotros: "the vosotros form",
  ellos: "the ellos form",
};

/** Every Spanish string we will accept for an entry, tagged with how it relates. */
export function spanishCandidates(entry: Entry): Candidate[] {
  const out: Candidate[] = [];

  switch (entry.pos) {
    case "noun": {
      // A common-gender noun is the same word under either article, so it gets a
      // candidate per article rather than an "other-gender" form.
      const genders = entry.gender === "mf" ? (["m", "f"] as const) : [entry.gender];
      const plural = entry.number === "pl";
      for (const gender of genders) {
        out.push({ text: entry.es, kind: "exact", article: articleFor(gender, plural) });
        if (entry.forms?.pl) {
          out.push({
            text: entry.forms.pl,
            kind: "inflection",
            article: articleFor(gender, true),
          });
        }
      }
      if (entry.forms?.f && entry.gender === "m") {
        out.push({
          text: entry.forms.f,
          kind: "other-gender",
          article: "la",
          label: "the feminine",
        });
      }
      if (entry.forms?.m && entry.gender === "f") {
        out.push({
          text: entry.forms.m,
          kind: "other-gender",
          article: "el",
          label: "the masculine",
        });
      }
      break;
    }
    case "adj": {
      // Every agreeing form, worked out the way sentences build them: a stored
      // plural wins, otherwise the regular rule (simpáticos, simpáticas, muchas).
      out.push({ text: entry.es, kind: "exact" });
      const forms = new Set([
        entry.forms?.f,
        entry.forms?.pl ?? spanishPlural(entry.es),
        entry.forms?.f ? spanishPlural(entry.forms.f) : undefined,
      ]);
      for (const form of forms) {
        if (form && form !== entry.es) out.push({ text: form, kind: "inflection" });
      }
      break;
    }
    case "verb": {
      out.push({ text: entry.es, kind: "exact" });
      // The reflexive pronoun rides on the first word, which is not always the
      // last: "lavarse los dientes" drops to "lavar los dientes".
      const withoutReflexive = entry.es.replace(/^(\S+?)se\b/, "$1");
      if (entry.verb.reflexive && withoutReflexive !== entry.es) {
        out.push({ text: withoutReflexive, kind: "missing-reflexive" });
      }
      for (const [key, value] of Object.entries(entry.forms ?? {})) {
        if (value) {
          out.push({
            text: value,
            kind: "conjugation",
            label: VERB_FORM_LABELS[key] ?? "a conjugated form",
          });
        }
      }
      break;
    }
    case "number": {
      out.push({ text: entry.es, kind: "exact" });
      if (entry.forms?.f) out.push({ text: entry.forms.f, kind: "inflection" });
      if (entry.forms?.apocope) out.push({ text: entry.forms.apocope, kind: "inflection" });
      break;
    }
    default: {
      out.push({ text: entry.es, kind: "exact" });
      for (const value of Object.values(entry.forms ?? {})) {
        if (value) out.push({ text: value, kind: "inflection" });
      }
    }
  }

  return out;
}

/** The grammar-line name for a noun's gender. */
export function genderName(gender: "m" | "f" | "mf"): string {
  if (gender === "mf") return "masculine or feminine";
  return gender === "m" ? "masculine" : "feminine";
}

/** Whether this entry, asked en→es, must be answered with its article. */
export function articleRequired(entry: Entry, opts: GradeOptions = {}): boolean {
  return (
    opts.requireArticle === true &&
    entry.pos === "noun" &&
    (entry.article ?? "required") === "required"
  );
}

/** The answer we display when the learner gets it wrong. */
export function canonicalAnswer(
  entry: Entry,
  direction: Direction,
  opts: GradeOptions = {},
): string {
  if (direction === "es→en") return entry.en[0]!;
  // An optional article is still shown, since "el lunes" is the more useful
  // thing to remember; only a noun used bare is displayed bare.
  if (entry.pos === "noun" && opts.requireArticle && entry.article !== "none") {
    const plural = entry.number === "pl";
    const article =
      entry.gender === "mf" ? (plural ? "los/las" : "el/la") : articleFor(entry.gender, plural);
    return `${article} ${entry.es}`;
  }
  return entry.es;
}

interface Match {
  candidate: Candidate;
  exactSpelling: boolean;
  article?: SpanishArticle;
  hadArticle: boolean;
}

function findBestMatch(entry: Entry, answer: string): Match | undefined {
  const candidates = spanishCandidates(entry);
  const attempts = expandSlashForms(normalize(answer));
  let best: Match | undefined;

  for (const attempt of attempts) {
    const { article, rest } = splitArticle(attempt);
    // Only nouns take an article; for other parts of speech "la" is just wrong text.
    const usesArticle = entry.pos === "noun" && article !== undefined;
    const body = usesArticle ? rest : attempt;

    for (const candidate of candidates) {
      const target = normalize(candidate.text);
      const exactSpelling = body === target;
      const accentMatch = foldAccents(body) === foldAccents(target);
      if (!exactSpelling && !accentMatch) continue;

      const match: Match = {
        candidate,
        exactSpelling,
        article: usesArticle ? article : undefined,
        hadArticle: usesArticle,
      };
      if (!best) {
        best = match;
        continue;
      }
      // Prefer the closest relationship, then the better spelling, then the
      // candidate whose article was the one given (el/la estudiante match both).
      const sameKind = candidate.kind === best.candidate.kind;
      const better =
        SEVERITY_BY_KIND[candidate.kind] < SEVERITY_BY_KIND[best.candidate.kind] ||
        (sameKind && exactSpelling && !best.exactSpelling) ||
        (sameKind &&
          exactSpelling === best.exactSpelling &&
          usesArticle &&
          candidate.article === article &&
          best.candidate.article !== article);
      if (better) best = match;
    }
  }

  return best;
}

const SEVERITY_BY_KIND: Record<CandidateKind, number> = {
  exact: 0,
  inflection: 1,
  "missing-reflexive": 2,
  "other-gender": 3,
  conjugation: 4,
};

function gradeSpanish(entry: Entry, answer: string, opts: GradeOptions): Grade {
  const expected = canonicalAnswer(entry, "en→es", opts);
  const requireArticle = articleRequired(entry, opts);
  const match = findBestMatch(entry, answer);

  if (!match) {
    const mate = (opts.confusableWith ?? []).find(
      (candidate) => findBestMatch(candidate, answer)?.candidate.kind === "exact",
    );
    if (mate) {
      return {
        result: "hard",
        expected,
        note: `that is ${mate.es} — this one is ${entry.es}${entry.notes ? `. ${entry.notes}` : ""}`,
      };
    }
    return nearMiss(entry, answer, expected, opts);
  }

  let result: Result = "correct";
  const notes: string[] = [];

  // Relationship to the headword.
  switch (match.candidate.kind) {
    case "exact":
    case "inflection":
      break;
    case "missing-reflexive":
      result = worst(result, "hard");
      notes.push(`this one is reflexive: ${entry.es}`);
      break;
    case "other-gender":
      result = worst(result, "hard");
      notes.push(`that is ${match.candidate.label} — the prompt asked for ${entry.es}`);
      break;
    case "conjugation":
      result = worst(result, "hard");
      notes.push(`that is ${match.candidate.label} — the prompt asked for ${entry.es}`);
      break;
  }

  // Spelling.
  if (!match.exactSpelling) {
    const target = normalize(match.candidate.text);
    const given = normalize(answer);
    result = worst(result, "hard");
    notes.push(
      differsOnlyByEnye(target, splitArticle(given).rest || given)
        ? `almost — check the ñ: ${match.candidate.text}`
        : `almost — check the accent: ${match.candidate.text}`,
    );
  }

  // Articles, nouns only.
  if (entry.pos === "noun") {
    const wanted = match.candidate.article;
    if (match.hadArticle && wanted && match.article !== wanted) {
      result = worst(result, requireArticle ? "wrong" : "hard");
      // Name the gender of the form actually matched: "el camarera" is a mistake
      // about camarera, which is feminine even though camarero is not.
      const gender = entry.gender === "mf" ? "mf" : wanted === "el" || wanted === "los" ? "m" : "f";
      notes.push(
        `${match.candidate.text} is ${genderName(gender)}: ${wanted} ${match.candidate.text}`,
      );
    } else if (!match.hadArticle && requireArticle && wanted) {
      result = worst(result, "hard");
      const shown =
        entry.gender === "mf" ? (wanted === "el" || wanted === "la" ? "el/la" : "los/las") : wanted;
      notes.push(`right word, include the article: ${shown} ${match.candidate.text}`);
    }
  }

  return { result, expected, note: notes.length > 0 ? notes.join("; ") : undefined };
}

/**
 * Nothing matched. Work out whether this was a gender mistake, a different word
 * the learner actually knows, or a slip of the finger - only the last of which
 * deserves any leniency.
 */
function nearMiss(entry: Entry, answer: string, expected: string, opts: GradeOptions): Grade {
  const target = normalize(entry.es);
  const given = normalize(answer);

  const article = articleOnlyDifference(target, given);
  if (article) {
    return { result: "wrong", expected, note: `the article should be ‘${article.expected}’` };
  }

  const otherWord = (opts.dictionary ?? []).find(
    (candidate) =>
      candidate.id !== entry.id && foldAccents(normalize(candidate.es)) === foldAccents(given),
  );
  if (otherWord) {
    return { result: "wrong", expected, note: `‘${otherWord.es}’ means ${otherWord.en[0]}` };
  }

  // An edit to the last letter of a noun or adjective is where gender and number
  // live, so "inteligenta" is a mistake about the language, not about typing.
  const inflects = entry.pos === "noun" || entry.pos === "adj";
  const endingOnly = differsOnlyInEnding(foldAccents(target), foldAccents(given));

  if (given !== "" && !(inflects && endingOnly)) {
    if (editDistance(foldAccents(given), foldAccents(target), 1) <= 1) {
      return { result: "hard", expected, note: "almost — check the spelling" };
    }
  }

  return { result: "wrong", expected, note: entry.notes };
}

/**
 * English answers accepted for a spanish prompt. The prompt shows only the
 * headword, so when two entries share it (deportista the adjective and the
 * noun) nothing tells the learner which is meant, and either meaning is right.
 */
function englishAnswers(entry: Entry, dictionary: Entry[] = []): string[] {
  const headword = normalize(entry.es);
  const homographs = dictionary.filter(
    (other) => other.id !== entry.id && normalize(other.es) === headword,
  );
  return [...entry.en, ...homographs.flatMap((other) => other.en)];
}

function gradeEnglish(entry: Entry, answer: string, opts: GradeOptions): Grade {
  const expected = entry.en[0]!;
  const given = stripEnglishLead(normalize(answer));
  const answers = englishAnswers(entry, opts.dictionary);

  for (const accepted of answers) {
    const target = stripEnglishLead(normalize(accepted));
    if (given === target) return { result: "correct", expected };
  }

  for (const accepted of answers) {
    const target = stripEnglishLead(normalize(accepted));
    if (differsOnlyByAccent(target, given)) {
      return { result: "hard", expected, note: `almost — ${accepted}` };
    }
  }

  // A single slipped keystroke in an english answer carries far less risk of
  // colliding with a different word than it does in spanish.
  for (const accepted of answers) {
    const target = stripEnglishLead(normalize(accepted));
    if (given !== "" && editDistance(given, target, 1) <= 1) {
      return { result: "hard", expected, note: "almost — check the spelling" };
    }
  }

  return { result: "wrong", expected, note: entry.notes };
}

/** Grade a typed answer against an entry. */
export function grade(
  entry: Entry,
  direction: Direction,
  answer: string,
  opts: GradeOptions = {},
): Grade {
  if (normalize(answer) === "") {
    return {
      result: "wrong",
      expected: canonicalAnswer(entry, direction, opts),
      note: entry.notes,
    };
  }
  return direction === "en→es"
    ? gradeSpanish(entry, answer, opts)
    : gradeEnglish(entry, answer, opts);
}
