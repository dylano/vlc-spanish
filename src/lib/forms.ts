import { canonicalAnswer } from "./grade.ts";
import type { Entry } from "./schema.ts";

/*
 * What a Dictionary card shows besides the headword (board D on the canvas's
 * "Dictionary forms" page). The other gender goes in shorthand on the headword
 * when only the ending changes — el abuelo/a, el profesor/a, simpático/a,
 * este/a/os/as — with the article left as the masculine's: learners know el
 * becomes la. A feminine that drops an accent is written out (el bailarín / la
 * bailarina), and a different word is not paired at all: padre and madre each
 * have their own entry. The grammar label adds a plural that is not just -s or
 * -es (pl. lápices, pl. jerséis), or that a noun is always plural or has none.
 */

/** A run of headword text; `quiet` for the shorthand and the slash, shown muted. */
export interface Run {
  text: string;
  quiet?: boolean;
}

export interface CardForms {
  /** The headword as runs: el abuelo + /a, or el bailarín + / + la bailarina. */
  spanish: Run[];
  /** The English, then the other gender's English when it is shown and differs. */
  english: string[];
  /** The English plural, when it differs: este → "these". */
  englishPlural?: string;
  /** The grammar label's parts: "noun", then "always plural" or "pl. lápices". */
  grammar: string[];
}

/** Whether a plural is just the singular plus -s or -es, on its first word. */
export function regularPlural(singular: string, plural: string): boolean {
  const [first = "", ...rest] = singular.split(" ");
  const [pluralFirst = "", ...pluralRest] = plural.split(" ");
  if (rest.join(" ") !== pluralRest.join(" ")) return false;
  return pluralFirst === `${first}s` || pluralFirst === `${first}es`;
}

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

/**
 * How the feminine relates to the masculine, on the first word (the rest of a
 * phrase like "de moda" is the same): a shorthand ending, written out because
 * an accent drops, or unrelated.
 */
function feminineKind(
  masculine: string,
  feminine: string,
): "o" | "plus" | "e" | "accent" | undefined {
  const [m = "", ...rest] = masculine.split(" ");
  const [f = "", ...fRest] = feminine.split(" ");
  if (rest.join(" ") !== fRest.join(" ")) return undefined;
  if (m.endsWith("o") && f === `${m.slice(0, -1)}a`) return "o";
  if (f === `${m}a`) return "plus";
  if (m.endsWith("e") && f === `${m.slice(0, -1)}a`) return "e";
  if (fold(f) === `${fold(m)}a`) return "accent";
  return undefined;
}

/** The headword with the shorthand ending after its first word: el diseñador/a de moda. */
function withEnding(head: string, word: string, ending: string): Run[] {
  const at = head.indexOf(word.split(" ")[0]!) + word.split(" ")[0]!.length;
  const runs: Run[] = [{ text: head.slice(0, at) }, { text: ending, quiet: true }];
  if (at < head.length) runs.push({ text: head.slice(at) });
  return runs;
}

export function cardForms(entry: Entry): CardForms {
  const head = canonicalAnswer(entry, "en→es", { requireArticle: true });
  const english = entry.en.join(", ");
  const grammar: string[] = [entry.pos];
  const out: CardForms = { spanish: [{ text: head }], english: [english], grammar };

  const feminine =
    (entry.pos === "noun" && entry.gender === "m") || entry.pos === "adj"
      ? entry.forms?.f
      : undefined;
  const kind = feminine ? feminineKind(entry.es, feminine) : undefined;
  // este/a/os/as: the plural is the surprising one, so its endings join the shorthand.
  const pluralEndings =
    kind === "e" && entry.pos === "adj" && entry.forms?.pl === `${entry.es.slice(0, -1)}os`
      ? "/a/os/as"
      : undefined;

  if (feminine && kind === "accent") {
    out.spanish = [
      { text: head },
      { text: " / ", quiet: true },
      { text: entry.pos === "noun" ? `la ${feminine}` : feminine },
    ];
  } else if (feminine && kind) {
    out.spanish = withEnding(head, entry.es, pluralEndings ?? "/a");
  }

  if (entry.pos === "noun" && kind) {
    const feminineEnglish = (entry.enF ?? entry.en).join(", ");
    if (feminineEnglish !== english) out.english.push(feminineEnglish);
  }

  if (entry.pos === "noun") {
    if (entry.number === "pl") grammar.push("always plural");
    else if (entry.number === "sg") grammar.push("no plural");
    else if (entry.forms?.pl && !regularPlural(entry.es, entry.forms.pl)) {
      grammar.push(`pl. ${entry.forms.pl}`);
    }
  }

  if (entry.pos === "adj") {
    if (entry.enPl && entry.enPl.join(", ") !== english) out.englishPlural = entry.enPl.join(", ");
    if (!pluralEndings && entry.forms?.pl && !regularPlural(entry.es, entry.forms.pl)) {
      grammar.push(`pl. ${entry.forms.pl}`);
    }
  }

  return out;
}
