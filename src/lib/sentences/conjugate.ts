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

/** Present tense of haber, the auxiliary of the pretérito perfecto: he comido. */
export const HABER: Record<Subject, string> = {
  yo: "he",
  tu: "has",
  el: "ha",
  nosotros: "hemos",
  vosotros: "habéis",
  ellos: "han",
};

/**
 * The past participle a regular infinitive would have: -ar → -ado, -er and
 * -ir → -ido, with an accent after a, e or o so the i is heard on its own
 * (leer → leído, traer → traído; construir → construido needs none).
 */
export function regularParticiple(infinitive: string): string | undefined {
  // The stem can be empty: ir → ido.
  const match = /^(.*)(ar|er|ir|ír)$/.exec(infinitive);
  if (!match) return undefined;
  const [, stem, type] = match as unknown as [string, string, string];
  if (type === "ar") return `${stem}ado`;
  return /[aeo]$/.test(stem) ? `${stem}ído` : `${stem}ido`;
}

/**
 * Infinitives whose participle breaks the rule, so a dictionary verb that is
 * one of them must store it. Exact words, not endings: atreverse is regular
 * though it ends in -ver.
 */
export const IRREGULAR_PARTICIPLES: Record<string, string> = {
  abrir: "abierto",
  cubrir: "cubierto",
  descubrir: "descubierto",
  decir: "dicho",
  escribir: "escrito",
  describir: "descrito",
  hacer: "hecho",
  deshacer: "deshecho",
  morir: "muerto",
  poner: "puesto",
  componer: "compuesto",
  proponer: "propuesto",
  suponer: "supuesto",
  resolver: "resuelto",
  romper: "roto",
  ver: "visto",
  prever: "previsto",
  volver: "vuelto",
  devolver: "devuelto",
  envolver: "envuelto",
};

/** A verb entry's first word without a reflexive -se, and whether it had one. */
export function headInfinitive(entry: VerbEntry): {
  infinitive: string;
  reflexive: boolean;
  rest: string[];
} {
  const [first = "", ...rest] = entry.es.split(" ");
  const reflexive = /se$/.test(first) && entry.verb.reflexive;
  return { infinitive: reflexive ? first.slice(0, -2) : first, reflexive, rest };
}

/**
 * A verb's past participle, alone: comido, hecho, levantado. A multi-word verb
 * gives its first word's, through that word's own entry where there is one
 * (ir al trabajo → ido). `irregular` is set when it breaks the -ado/-ido rule,
 * and `regular` is then what the rule would have made (volvido), for saying so.
 */
export function participle(
  entry: VerbEntry,
  dictionary: Entry[],
): { form: string; irregular: boolean; regular?: string } | undefined {
  const { infinitive, rest } = headInfinitive(entry);
  const regular = regularParticiple(infinitive);
  if (entry.verb.participle) {
    return {
      form: entry.verb.participle,
      irregular: entry.verb.participle !== regular,
      ...(entry.verb.participle !== regular && regular ? { regular } : {}),
    };
  }
  if (rest.length > 0) {
    const base = dictionary.find(
      (candidate): candidate is VerbEntry =>
        candidate.pos === "verb" && candidate.id !== entry.id && candidate.es === infinitive,
    );
    if (base) return participle(base, dictionary);
  }
  return regular ? { form: regular, irregular: false } : undefined;
}

/**
 * The pretérito perfecto of a verb entry for a subject: haber, then the
 * participle, which never changes. A reflexive pronoun goes before haber, and
 * the rest of a phrase after the participle: me he levantado, he hecho la cama,
 * he tenido que. Undefined for gustar and the like, which take the pronoun of
 * the person who likes (me ha gustado) and are built by the sentence frames.
 */
export function perfectForm(
  entry: VerbEntry,
  subject: Subject,
  dictionary: Entry[],
): string | undefined {
  if (entry.verb.pattern === "gustar") return undefined;
  const made = participle(entry, dictionary);
  if (!made) return undefined;
  const { reflexive, rest } = headInfinitive(entry);
  const head = `${HABER[subject]} ${made.form}`;
  return [reflexive ? `${REFLEXIVE_PRONOUN[subject]} ${head}` : head, ...rest].join(" ");
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
