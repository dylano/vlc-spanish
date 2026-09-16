import type { Entry, VerbEntry } from "../schema.ts";
import type { Subject } from "./english.ts";

const REFLEXIVE_PRONOUN: Record<Subject, string> = {
  yo: "me",
  tu: "te",
  el: "se",
  nosotros: "nos",
  vosotros: "os",
  ellos: "se",
};

const ENDINGS: Record<"ar" | "er" | "ir", Record<Subject, string>> = {
  ar: { yo: "o", tu: "as", el: "a", nosotros: "amos", vosotros: "áis", ellos: "an" },
  er: { yo: "o", tu: "es", el: "e", nosotros: "emos", vosotros: "éis", ellos: "en" },
  ir: { yo: "o", tu: "es", el: "e", nosotros: "imos", vosotros: "ís", ellos: "en" },
};

/** Present tense of a regular infinitive, no pronoun: hablar → hablamos. */
export function regularForm(infinitive: string, subject: Subject): string | undefined {
  const match = /^(.+)(ar|er|ir)$/.exec(infinitive);
  if (!match) return undefined;
  const [, stem, type] = match as unknown as [string, string, "ar" | "er" | "ir"];
  return stem + ENDINGS[type][subject];
}

/**
 * The present-tense form of a verb entry for a subject, pronoun included for
 * reflexives: levantarse → "me levanto", hacer la cama → "hago la cama".
 *
 * Stored `forms` win. A regular verb without them is conjugated by rule. A
 * multi-word verb without them conjugates its first word through that word's
 * own entry (ir al trabajo uses ir). Anything else — an irregular verb with no
 * stored forms — returns undefined, and is simply not offered for that subject.
 */
export function verbForm(
  entry: VerbEntry,
  subject: Subject,
  dictionary: Entry[],
): string | undefined {
  const stored = entry.forms?.[subject];
  if (stored) return stored;

  const [first = "", ...rest] = entry.es.split(" ");
  const reflexive = /se$/.test(first) && entry.verb.reflexive;
  const infinitive = reflexive ? first.slice(0, -2) : first;

  let head: string | undefined;
  if (rest.length > 0) {
    const base = dictionary.find(
      (candidate): candidate is VerbEntry =>
        candidate.pos === "verb" && candidate.id !== entry.id && candidate.es === infinitive,
    );
    head = base
      ? verbForm(base, subject, dictionary)
      : entry.verb.regular
        ? regularForm(infinitive, subject)
        : undefined;
  } else if (entry.verb.regular) {
    head = regularForm(infinitive, subject);
  }
  if (!head) return undefined;

  const withPronoun = reflexive ? `${REFLEXIVE_PRONOUN[subject]} ${head}` : head;
  return [withPronoun, ...rest].join(" ");
}
