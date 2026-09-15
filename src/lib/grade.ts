import type { Direction, Entry } from "./schema.ts";
import {
  articleFor,
  differsOnlyByAccent,
  differsOnlyByEnye,
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
   */
  requireArticle?: boolean;
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
      out.push({ text: entry.es, kind: "exact", article: articleFor(entry.gender) });
      if (entry.forms?.pl) {
        out.push({
          text: entry.forms.pl,
          kind: "inflection",
          article: articleFor(entry.gender, true),
        });
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
      out.push({ text: entry.es, kind: "exact" });
      if (entry.forms?.f) out.push({ text: entry.forms.f, kind: "inflection" });
      if (entry.forms?.pl) out.push({ text: entry.forms.pl, kind: "inflection" });
      break;
    }
    case "verb": {
      out.push({ text: entry.es, kind: "exact" });
      if (entry.verb.reflexive && /se$/.test(entry.es)) {
        out.push({ text: entry.es.replace(/se$/, ""), kind: "missing-reflexive" });
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

/** The answer we display when the learner gets it wrong. */
export function canonicalAnswer(
  entry: Entry,
  direction: Direction,
  opts: GradeOptions = {},
): string {
  if (direction === "es→en") return entry.en[0]!;
  if (entry.pos === "noun" && opts.requireArticle) {
    return `${articleFor(entry.gender)} ${entry.es}`;
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
      // Prefer the closest relationship, then the better spelling.
      const better =
        SEVERITY_BY_KIND[candidate.kind] < SEVERITY_BY_KIND[best.candidate.kind] ||
        (candidate.kind === best.candidate.kind && exactSpelling && !best.exactSpelling);
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
  const match = findBestMatch(entry, answer);

  if (!match) {
    return { result: "wrong", expected, note: entry.notes };
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
      result = worst(result, opts.requireArticle ? "wrong" : "hard");
      notes.push(
        `${entry.es} is ${entry.gender === "m" ? "masculine" : "feminine"}: ${wanted} ${match.candidate.text}`,
      );
    } else if (!match.hadArticle && opts.requireArticle && wanted) {
      result = worst(result, "hard");
      notes.push(`right word, include the article: ${wanted} ${match.candidate.text}`);
    }
  }

  return { result, expected, note: notes.length > 0 ? notes.join("; ") : undefined };
}

function gradeEnglish(entry: Entry, answer: string): Grade {
  const expected = entry.en[0]!;
  const given = stripEnglishLead(normalize(answer));

  for (const accepted of entry.en) {
    const target = stripEnglishLead(normalize(accepted));
    if (given === target) return { result: "correct", expected };
  }

  for (const accepted of entry.en) {
    const target = stripEnglishLead(normalize(accepted));
    if (differsOnlyByAccent(target, given)) {
      return { result: "hard", expected, note: `almost — ${accepted}` };
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
  return direction === "en→es" ? gradeSpanish(entry, answer, opts) : gradeEnglish(entry, answer);
}
