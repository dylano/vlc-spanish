import type { Entry, VerbEntry } from "./schema.ts";
import { regularForm, verbForm } from "./sentences/conjugate.ts";
import { SUBJECTS } from "./sentences/english.ts";

/**
 * The conjugation (present tense) the Dictionary shows for a verb, with each form split
 * into the parts worth noticing: a changed stem, a regular ending, or a whole
 * irregular form in the accent colour; a reflexive pronoun muted.
 */

export type PartKind = "plain" | "mark" | "pronoun";
export interface Part {
  text: string;
  kind: PartKind;
}

export interface TableRow {
  person: string;
  /** Who else takes the same form: usted beside él and ella. */
  also?: string;
  forms: Part[][];
}

export interface ConjugationTable {
  /** Small labels beside the heading: "e → ie", "reflexive", "irregular". */
  tags: string[];
  /** Column headings when a row has more than one form (gustar: one thing, several). */
  columns?: string[];
  rows: TableRow[];
  /** One line on what the colouring means for this verb. */
  explanation?: string;
}

const PERSONS: { person: string; also?: string }[] = [
  { person: "yo" },
  { person: "tú" },
  { person: "él, ella", also: "usted" },
  { person: "nosotros", also: "nosotras" },
  { person: "vosotros", also: "vosotras" },
  { person: "ellos, ellas", also: "ustedes" },
];

const LIKE_PERSONS: { person: string; also?: string }[] = [
  { person: "a mí" },
  { person: "a ti" },
  { person: "a él, a ella", also: "a usted" },
  { person: "a nosotros" },
  { person: "a vosotros" },
  { person: "a ellos, a ellas", also: "a ustedes" },
];

const OBJECT_PRONOUNS = ["me", "te", "le", "nos", "os", "les"];

/** A form's first word, split into its parts; the rest of a phrase (la cama) stays plain. */
function splitWord(
  entry: VerbEntry,
  infinitive: string,
  subject: (typeof SUBJECTS)[number],
  word: string,
): { parts: Part[]; irregular: boolean } {
  const plain = (text: string) => ({ parts: [{ text, kind: "plain" as const }], irregular: false });
  const whole = (text: string) => ({ parts: [{ text, kind: "mark" as const }], irregular: true });
  const stem = infinitive.slice(0, -2);
  const regular = regularForm(infinitive, subject);
  const ending = regular?.slice(stem.length) ?? "";

  if (entry.verb.stemChange) {
    const [from, to] = entry.verb.stemChange.split("→") as [string, string];
    const at = stem.lastIndexOf(from);
    const changed = at >= 0 ? stem.slice(0, at) + to + stem.slice(at + from.length) : undefined;
    if (changed && word === changed + ending) {
      return {
        parts: [
          { text: stem.slice(0, at), kind: "plain" },
          { text: to, kind: "mark" },
          { text: stem.slice(at + from.length) + ending, kind: "plain" },
        ],
        irregular: false,
      };
    }
    // Nosotros and vosotros keep the stem as it is.
    return word === regular ? plain(word) : whole(word);
  }
  if (word !== regular) return whole(word);
  // A regular form: the ending is what changes with the person.
  if (!entry.verb.regular) return plain(word);
  return {
    parts: [
      { text: stem, kind: "plain" },
      { text: ending, kind: "mark" },
    ],
    irregular: false,
  };
}

export function conjugationTable(entry: VerbEntry, dictionary: Entry[]): ConjugationTable {
  if (entry.verb.pattern === "gustar") {
    const one = verbForm(entry, "el", dictionary) ?? entry.es;
    const several = verbForm(entry, "ellos", dictionary) ?? entry.es;
    const extra = several.startsWith(one) ? several.slice(one.length) : "";
    return {
      tags: [],
      columns: ["One thing", "Several"],
      rows: LIKE_PERSONS.map((who, index) => {
        const pronoun = OBJECT_PRONOUNS[index]!;
        return {
          ...who,
          forms: [
            [{ text: `${pronoun} ${one}`, kind: "plain" }],
            extra
              ? [
                  { text: `${pronoun} ${one}`, kind: "plain" },
                  { text: extra, kind: "mark" },
                ]
              : [{ text: `${pronoun} ${several}`, kind: "plain" }],
          ],
        };
      }),
      explanation:
        "The verb agrees with what is liked, not with the person: one thing or an activity takes the singular.",
    };
  }

  const [first = "", ...rest] = entry.es.split(" ");
  const infinitive = entry.verb.reflexive ? first.replace(/se$/, "") : first;
  const phrase = rest.length > 0 ? ` ${rest.join(" ")}` : "";

  let irregular = false;
  const rows = SUBJECTS.map((subject, index) => {
    const form = verbForm(entry, subject, dictionary) ?? "";
    const words = form.split(" ");
    const pronoun = entry.verb.reflexive ? words.shift() : undefined;
    const word = words.shift() ?? "";
    const parts: Part[] = [];
    if (pronoun) parts.push({ text: `${pronoun} `, kind: "pronoun" });
    const split = splitWord(entry, infinitive, subject, word);
    if (split.irregular) irregular = true;
    parts.push(...split.parts);
    if (words.length > 0 || phrase) parts.push({ text: ` ${words.join(" ")}`, kind: "plain" });
    return { ...PERSONS[index]!, forms: [parts.filter((part) => part.text.trim() !== "")] };
  });

  const tags: string[] = [];
  const lines: string[] = [];
  if (entry.verb.stemChange) {
    const [from, to] = entry.verb.stemChange.split("→");
    tags.push(`${from} → ${to}`);
    lines.push(`The ${from} becomes ${to} everywhere except nosotros and vosotros.`);
  }
  if (entry.verb.irregularYo) {
    tags.push("irregular yo");
    lines.push(`The yo form is irregular: ${entry.verb.irregularYo}.`);
  } else if (irregular) {
    tags.push("irregular");
    lines.push("The forms in green do not follow the regular pattern.");
  }
  if (entry.verb.reflexive) {
    tags.push("reflexive");
    lines.push("The pronoun changes with the person and goes before the verb.");
  }
  if (entry.verb.regular && !entry.verb.stemChange) {
    const type = infinitive.slice(-2);
    lines.unshift(`Regular -${type} endings.`);
  }
  return { tags, rows, explanation: lines.join(" ") || undefined };
}
