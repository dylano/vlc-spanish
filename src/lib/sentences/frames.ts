import { z } from "zod";
import { POS, type AdjEntry, type Entry, type NounEntry, type VerbEntry } from "../schema.ts";
import { verbForm } from "./conjugate.ts";
import {
  indefiniteArticle,
  inflectVerb,
  pluralize,
  SUBJECTS,
  subjectPronoun,
  type Subject,
  type SubjectGender,
} from "./english.ts";

/*
 * Sentence frames: hand-written sentence patterns whose slots are filled from
 * the dictionary. The frame author writes the word order in both languages; the
 * renderer supplies only what the dictionary data makes reliable — agreement,
 * verb forms, articles and a little English inflection.
 *
 * Placeholders are {slot} or {slot:modifier}. In Spanish, a noun slot takes
 * :el (definite article) or :un (indefinite). In English it takes :the or :a.
 * {S} is the frame's subject pronoun, for frames that declare `subjects`.
 */

const select = {
  /** Entries carrying any of these tags. */
  tags: z.array(z.string()).optional(),
  /** Only these entry ids. */
  ids: z.array(z.string()).optional(),
  /** Never these entry ids — for words that fit the tag but not the sentence. */
  exclude: z.array(z.string()).optional(),
};

export const slotSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("noun"),
    ...select,
    number: z.enum(["sg", "pl"]).default("sg"),
    /** Take gender from another noun slot: Mi hermana es enfermera. */
    agree: z.string().optional(),
  }),
  z.object({ kind: z.literal("adj"), ...select, agree: z.string() }),
  z.object({
    kind: z.literal("verb"),
    ...select,
    /** A fixed subject, "@" for the frame's subject, or a noun slot acting as subject. */
    subject: z.string(),
  }),
  z.object({ kind: z.literal("word"), ...select, pos: z.enum(POS).optional() }),
  z.object({ kind: z.literal("glue"), group: z.string() }),
]);
export type Slot = z.infer<typeof slotSchema>;

export const frameSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  /** What the sentence exercises, for grouping and later statistics. */
  grammar: z.array(z.string()).min(1),
  /** Subjects the frame may be rendered with, when a verb uses "@". */
  subjects: z.array(z.enum(SUBJECTS)).optional(),
  es: z.string().min(1),
  en: z.string().min(1),
  slots: z.record(z.string(), slotSchema),
  /** Slots worth blanking in Fill in the Blank, most useful first. */
  cloze: z.array(z.string()).min(1),
});
export type Frame = z.infer<typeof frameSchema>;
/** A frame as written in JSON, before defaults are applied. */
export type FrameInput = z.input<typeof frameSchema>;

export const framesFileSchema = z.object({ version: z.literal(1), frames: z.array(frameSchema) });

export const glueSchema = z.object({
  /** Function words sentences may use that are not dictionary entries. */
  words: z.array(z.string()),
  /** Phrases a glue slot picks from, each with its English. */
  groups: z.record(z.string(), z.array(z.object({ es: z.string(), en: z.string() }))),
});
export type Glue = z.infer<typeof glueSchema>;

export interface Segment {
  text: string;
  /** The slot this text came from; absent for the frame's own words. */
  slot?: string;
  entryId?: string;
  /** An article rendered for a noun slot, kept separate so it can be blanked or contracted. */
  article?: boolean;
}

/** What a filled slot needs for grading a gap in it. */
export interface SlotDetail {
  /**
   * Every Spanish text that answers for this slot: the one shown, plus the same
   * slot filled with any word sharing its English (comer and almorzar are both
   * "to have lunch", so either is right for "I have lunch").
   */
  accepts: string[];
  gender?: "m" | "f" | "mf";
  number?: "sg" | "pl";
  /** For an adjective or agreeing noun, the slot it agrees with; for a verb, its subject slot. */
  agreesWith?: string;
  /** For a verb, the person it is conjugated in. */
  subject?: Subject;
}

export interface RenderedSentence {
  frameId: string;
  es: string;
  en: string;
  segments: Segment[];
  /** Slot name → entry id, for every slot filled from the dictionary. */
  fills: Record<string, string>;
  /** Slot name → grading detail, for every slot filled from the dictionary. */
  slots: Record<string, SlotDetail>;
  subject?: Subject;
}

export interface RenderContext {
  dictionary: Entry[];
  glue: Glue;
  random: () => number;
  /** Which entries sentences may use, e.g. only words already practiced. Defaults to all. */
  eligible?: (entry: Entry) => boolean;
}

type Gender = "m" | "f";
type NumberKind = "sg" | "pl";

interface Filled {
  entryId?: string;
  es: string;
  en: string;
  gender?: Gender | "mf";
  number?: NumberKind;
  /** False for nouns used without an article, like months. */
  takesArticle?: boolean;
}

function pick<T>(items: readonly T[], random: () => number): T | undefined {
  return items.length === 0 ? undefined : items[Math.floor(random() * items.length)];
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Spanish plural of a word or phrase; the first word carries it (diseñadoras de moda). */
export function spanishPlural(phrase: string): string {
  const [first = "", ...rest] = phrase.split(" ");
  let plural: string;
  if (/[aeiouáéó]$/.test(first)) plural = `${first}s`;
  else if (/z$/.test(first)) plural = `${first.slice(0, -1)}ces`;
  else plural = `${first}es`;
  return [plural, ...rest].join(" ");
}

function selects(entry: Entry, slot: Exclude<Slot, { kind: "glue" }>): boolean {
  if (slot.ids && !slot.ids.includes(entry.id)) return false;
  if (slot.exclude?.includes(entry.id)) return false;
  if (slot.tags && !entry.tags.some((tag) => slot.tags!.includes(tag))) return false;
  return true;
}

/** Entries that could fill a slot, before agreement is considered. */
export function slotCandidates(
  slot: Slot,
  context: Pick<RenderContext, "dictionary" | "eligible">,
): Entry[] {
  if (slot.kind === "glue") return [];
  const eligible = context.eligible ?? (() => true);
  return context.dictionary.filter((entry) => {
    if (!eligible(entry) || !selects(entry, slot)) return false;
    switch (slot.kind) {
      case "noun":
        if (entry.pos !== "noun") return false;
        return slot.number === "pl"
          ? entry.number === "pl" || entry.forms?.pl !== undefined
          : entry.number !== "pl";
      case "adj":
        return entry.pos === "adj";
      case "verb":
        return entry.pos === "verb";
      case "word":
        return slot.pos ? entry.pos === slot.pos : true;
    }
  });
}

function nounFill(
  entry: NounEntry,
  number: NumberKind,
  wanted: Gender | undefined,
  random: () => number,
): Filled | undefined {
  const takesArticle = entry.article !== "none";
  const plural = number === "pl";
  const english = (gloss: string) => (plural && entry.number !== "pl" ? pluralize(gloss) : gloss);

  if (entry.gender === "mf") {
    const gender = wanted ?? (random() < 0.5 ? "m" : "f");
    const es = plural
      ? entry.number === "pl"
        ? entry.es
        : (entry.forms?.pl ?? spanishPlural(entry.es))
      : entry.es;
    return { entryId: entry.id, es, en: english(entry.en[0]!), gender, number, takesArticle };
  }

  const canBeFeminine =
    entry.gender === "m" && entry.forms?.f !== undefined && entry.enF !== undefined;
  let gender: Gender = entry.gender;
  if (wanted === "f" && entry.gender === "m") {
    if (!canBeFeminine) return undefined;
    gender = "f";
  } else if (wanted === "m" && entry.gender === "f") {
    return undefined;
  } else if (!wanted && canBeFeminine && random() < 0.5) {
    gender = "f";
  }

  if (gender === "f" && entry.gender === "m") {
    const feminine = entry.forms!.f!;
    return {
      entryId: entry.id,
      es: plural ? spanishPlural(feminine) : feminine,
      en: english(entry.enF![0]!),
      gender,
      number,
      takesArticle,
    };
  }
  const es = plural ? (entry.number === "pl" ? entry.es : entry.forms!.pl!) : entry.es;
  return { entryId: entry.id, es, en: english(entry.en[0]!), gender, number, takesArticle };
}

function adjFill(entry: AdjEntry, gender: Gender | "mf", number: NumberKind): Filled {
  // Common-gender nouns still need a gender for agreement; they were given one.
  const feminine = gender === "f";
  let es: string;
  if (number === "sg") es = feminine ? (entry.forms?.f ?? entry.es) : entry.es;
  else if (feminine && entry.forms?.f) es = spanishPlural(entry.forms.f);
  else es = entry.forms?.pl ?? spanishPlural(entry.es);
  return { entryId: entry.id, es, en: entry.en[0]!, gender, number };
}

/** The form of an adjective agreeing with a gender and number. */
export function adjectiveForm(entry: AdjEntry, gender: Gender | "mf", number: NumberKind): string {
  return adjFill(entry, gender, number).es;
}

/** A noun in a gender and number, or undefined when it has no such form. */
export function nounForm(entry: NounEntry, gender: Gender, number: NumberKind): string | undefined {
  if (entry.gender === "mf") return undefined;
  return nounFill(entry, number, gender, () => 0)?.es;
}

const SPANISH_ARTICLE = {
  el: { m: { sg: "el", pl: "los" }, f: { sg: "la", pl: "las" } },
  un: { m: { sg: "un", pl: "unos" }, f: { sg: "una", pl: "unas" } },
} as const;

const PLACEHOLDER = /\{(\w+)(?::(\w+))?\}/g;

/** Every {slot} named in a template, with its modifier. */
export function placeholders(template: string): { name: string; modifier?: string }[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => ({
    name: match[1]!,
    modifier: match[2],
  }));
}

function capitalizeFirst(text: string): string {
  const index = text.search(/\p{L}/u);
  return index < 0
    ? text
    : text.slice(0, index) + text[index]!.toUpperCase() + text.slice(index + 1);
}

function sharesGloss(a: Entry, b: Entry): boolean {
  const glosses = new Set(a.en.map((gloss) => gloss.trim().toLowerCase()));
  return b.en.some((gloss) => glosses.has(gloss.trim().toLowerCase()));
}

/**
 * Render one sentence from a frame, or undefined if its slots cannot all be
 * filled. `fixed` pins slots to particular entries — how a gap is aimed at the
 * word being practiced.
 */
export function renderFrame(
  frame: Frame,
  context: RenderContext,
  fixed: Record<string, string> = {},
): RenderedSentence | undefined {
  const { random, dictionary, glue } = context;
  const filled = new Map<string, Filled>();
  const used = new Set<string>();
  const subject = frame.subjects ? pick(frame.subjects, random) : undefined;

  // Nouns first (agreeing nouns after the ones they agree with), then the rest.
  const order = Object.entries(frame.slots).sort(([, a], [, b]) => rank(a) - rank(b));

  for (const [name, slot] of order) {
    let result: Filled | undefined;

    if (slot.kind === "glue") {
      const item = pick(glue.groups[slot.group] ?? [], random);
      result = item ? { es: item.es, en: item.en } : undefined;
    } else {
      const candidates = slotCandidates(slot, context).filter(
        (entry) => fixed[name] === undefined || entry.id === fixed[name],
      );
      // For a person whose gender is free, decide the gender first and then find
      // a word that can take it. Deciding per word instead lets words that are
      // always masculine (los padres) tip whole frames toward the masculine.
      const gender: Gender | undefined =
        slot.kind === "noun" && !slot.agree && candidates.some(canBeEitherGender)
          ? random() < 0.5
            ? "f"
            : "m"
          : undefined;
      const attempts: (Gender | undefined)[] = gender ? [gender, undefined] : [undefined];
      for (const wanted of attempts) {
        for (const entry of shuffled(candidates, random)) {
          if (used.has(entry.id)) continue;
          result = fillSlot(slot, entry, filled, subject, dictionary, random, wanted);
          if (result) break;
        }
        if (result) break;
      }
    }

    if (!result) return undefined;
    filled.set(name, result);
    if (result.entryId) used.add(result.entryId);
  }

  const segments = spanishSegments(frame.es, filled, subject);
  const en = capitalizeFirst(renderEnglish(frame.en, filled, subject));
  const fills = Object.fromEntries(
    [...filled].flatMap(([name, fill]) => (fill.entryId ? [[name, fill.entryId]] : [])),
  );

  const slots: Record<string, SlotDetail> = {};
  for (const [name, slot] of Object.entries(frame.slots)) {
    const fill = filled.get(name)!;
    if (slot.kind === "glue" || !fill.entryId) continue;
    const target = dictionary.find((entry) => entry.id === fill.entryId)!;
    const accepts = new Set([fill.es]);
    for (const alternative of slotCandidates(slot, { dictionary })) {
      if (alternative.id === target.id || !sharesGloss(target, alternative)) continue;
      // Same context, same gender: only the word changes.
      const other =
        slot.kind === "noun" && alternative.pos === "noun"
          ? nounFill(
              alternative,
              slot.number,
              fill.gender === "f" ? "f" : fill.gender === "m" ? "m" : undefined,
              random,
            )
          : fillSlot(slot, alternative, filled, subject, dictionary, random);
      if (other) accepts.add(other.es);
    }
    const detail: SlotDetail = { accepts: [...accepts], gender: fill.gender, number: fill.number };
    if (slot.kind === "adj" || (slot.kind === "noun" && slot.agree)) detail.agreesWith = slot.agree;
    if (slot.kind === "verb") {
      const who = subjectOf(slot.subject, filled, subject);
      detail.subject = who?.subject;
      if (frame.slots[slot.subject]?.kind === "noun") detail.agreesWith = slot.subject;
    }
    slots[name] = detail;
  }

  return {
    frameId: frame.id,
    es: segments.map((segment) => segment.text).join(""),
    en,
    segments,
    fills,
    slots,
    subject,
  };

  function rank(slot: Slot): number {
    if (slot.kind === "noun") return slot.agree ? 1 : 0;
    return 2;
  }
}

function subjectOf(
  spec: string,
  filled: Map<string, Filled>,
  frameSubject: Subject | undefined,
): { subject: Subject; gender: SubjectGender } | undefined {
  if (spec === "@") return frameSubject ? { subject: frameSubject, gender: "m" } : undefined;
  if ((SUBJECTS as readonly string[]).includes(spec))
    return { subject: spec as Subject, gender: "m" };
  const noun = filled.get(spec);
  if (!noun) return undefined;
  return { subject: noun.number === "pl" ? "ellos" : "el", gender: noun.gender ?? "m" };
}

/** A noun that can be put in either gender: common gender, or a masculine with an English feminine. */
function canBeEitherGender(entry: Entry): boolean {
  if (entry.pos !== "noun") return false;
  return entry.gender === "mf" || (entry.gender === "m" && !!entry.forms?.f && !!entry.enF);
}

function fillSlot(
  slot: Exclude<Slot, { kind: "glue" }>,
  entry: Entry,
  filled: Map<string, Filled>,
  frameSubject: Subject | undefined,
  dictionary: Entry[],
  random: () => number,
  /** For a noun that does not agree with another slot, the gender decided for it. */
  gender?: Gender,
): Filled | undefined {
  switch (slot.kind) {
    case "noun": {
      if (entry.pos !== "noun") return undefined;
      const target = slot.agree ? filled.get(slot.agree)?.gender : gender;
      const wanted = target === "mf" ? undefined : target;
      return nounFill(entry, slot.number, wanted, random);
    }
    case "adj": {
      const noun = filled.get(slot.agree);
      if (entry.pos !== "adj" || !noun) return undefined;
      return adjFill(entry, noun.gender ?? "m", noun.number ?? "sg");
    }
    case "verb": {
      const who = subjectOf(slot.subject, filled, frameSubject);
      if (entry.pos !== "verb" || !who) return undefined;
      const es = verbForm(entry as VerbEntry, who.subject, dictionary);
      if (!es) return undefined;
      return { entryId: entry.id, es, en: inflectVerb(entry.en[0]!, who.subject, who.gender) };
    }
    case "word":
      return { entryId: entry.id, es: entry.es, en: entry.en[0]! };
  }
}

const SPANISH_PRONOUN: Record<Subject, string> = {
  yo: "yo",
  tu: "tú",
  el: "él",
  nosotros: "nosotros",
  vosotros: "vosotros",
  ellos: "ellos",
};

function spanishSegments(
  template: string,
  filled: Map<string, Filled>,
  subject: Subject | undefined,
): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    if (match.index > last) segments.push({ text: template.slice(last, match.index) });
    last = match.index + match[0].length;
    const [, name = "", modifier] = match;

    if (name === "S") {
      if (subject) segments.push({ text: SPANISH_PRONOUN[subject] });
      continue;
    }
    const fill = filled.get(name)!;
    if ((modifier === "el" || modifier === "un") && fill.takesArticle !== false) {
      const gender = fill.gender === "f" ? "f" : "m";
      const article = SPANISH_ARTICLE[modifier][gender][fill.number ?? "sg"];
      segments.push({ text: article, slot: name, entryId: fill.entryId, article: true });
      segments.push({ text: " " });
    }
    segments.push({ text: fill.es, slot: name, entryId: fill.entryId });
  }
  if (last < template.length) segments.push({ text: template.slice(last) });

  contract(segments);
  euphony(segments);
  const first = segments.find((segment) => /\p{L}/u.test(segment.text));
  if (first) first.text = capitalizeFirst(first.text);
  return segments.filter((segment) => segment.text !== "");
}

/** a + el → al, de + el → del. The article merges into the preposition. */
function contract(segments: Segment[]): void {
  for (let i = 0; i + 2 < segments.length; i++) {
    const before = segments[i]!;
    const article = segments[i + 1]!;
    if (!article.article || article.text !== "el") continue;
    const match = /(^|\s)(a|de)\s$/.exec(before.text);
    if (!match) continue;
    before.text = `${before.text.slice(0, -(match[2]!.length + 1))}${match[2] === "a" ? "al" : "del"} `;
    article.text = "";
    // Drop the space that followed the article.
    if (segments[i + 2]!.text === " ") segments[i + 2]!.text = "";
  }
}

/** y → e before an "i" sound: alto e inteligente. */
function euphony(segments: Segment[]): void {
  for (let i = 0; i + 1 < segments.length; i++) {
    const before = segments[i]!;
    const next = segments.slice(i + 1).find((segment) => segment.text.trim() !== "");
    if (!next || !/(^|\s)y\s$/.test(before.text)) continue;
    if (/^h?i(?!e)/i.test(next.text)) before.text = before.text.replace(/y\s$/, "e ");
  }
}

function renderEnglish(
  template: string,
  filled: Map<string, Filled>,
  subject: Subject | undefined,
): string {
  return template.replace(PLACEHOLDER, (_, name: string, modifier?: string) => {
    if (name === "S") return subject ? subjectPronoun(subject) : "";
    const fill = filled.get(name)!;
    if (modifier === "the") return `the ${fill.en}`;
    if (modifier === "a")
      return fill.number === "pl" ? fill.en : `${indefiniteArticle(fill.en)} ${fill.en}`;
    return fill.en;
  });
}

/** Rough count of distinct sentences a frame can produce, for spotting frames with too little variety. */
export function estimateVariety(
  frame: Frame,
  context: Pick<RenderContext, "dictionary" | "glue" | "eligible">,
): number {
  let total = frame.subjects?.length ?? 1;
  for (const slot of Object.values(frame.slots)) {
    if (slot.kind === "glue") total *= context.glue.groups[slot.group]?.length ?? 0;
    else if (slot.kind === "noun" && !slot.agree) {
      total *= slotCandidates(slot, context).reduce(
        (sum, entry) =>
          sum + (entry.pos === "noun" && (entry.gender === "mf" || entry.enF) ? 2 : 1),
        0,
      );
    } else total *= slotCandidates(slot, context).length;
  }
  return total;
}

/** Words a frame's own text may use: dictionary words and forms, every verb form, and glue. */
export function allowedSpanishWords(dictionary: Entry[], glue: Glue): Set<string> {
  const words = new Set<string>();
  const add = (text: string) => {
    for (const word of text.toLowerCase().split(/[^\p{L}]+/u)) if (word) words.add(word);
  };
  for (const entry of dictionary) {
    add(entry.es);
    for (const value of Object.values(entry.forms ?? {})) if (typeof value === "string") add(value);
    if (entry.pos === "verb") {
      for (const subject of SUBJECTS) add(verbForm(entry, subject, dictionary) ?? "");
    }
  }
  for (const word of glue.words) add(word);
  for (const group of Object.values(glue.groups)) for (const item of group) add(item.es);
  return words;
}

/** Structural and vocabulary problems with a frame; empty when it is sound. */
export function checkFrame(
  frame: Frame,
  context: RenderContext,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const declared = new Set(Object.keys(frame.slots));

  for (const [language, template, modifiers] of [
    ["es", frame.es, ["el", "un"]],
    ["en", frame.en, ["the", "a"]],
  ] as const) {
    for (const { name, modifier } of placeholders(template)) {
      if (name === "S") {
        if (!frame.subjects) errors.push(`${language} uses {S} but the frame declares no subjects`);
        continue;
      }
      if (!declared.has(name)) errors.push(`${language} uses {${name}}, which is not a slot`);
      if (modifier && !(modifiers as readonly string[]).includes(modifier)) {
        errors.push(
          `${language} {${name}:${modifier}}: modifier must be one of ${modifiers.join(", ")}`,
        );
      }
    }
  }
  const inSpanish = new Set(placeholders(frame.es).map((p) => p.name));
  const inEnglish = new Set(placeholders(frame.en).map((p) => p.name));
  for (const name of declared) {
    if (!inSpanish.has(name)) errors.push(`slot ${name} never appears in es`);
    if (!inEnglish.has(name)) errors.push(`slot ${name} never appears in en`);
  }
  for (const name of frame.cloze)
    if (!declared.has(name)) errors.push(`cloze names unknown slot ${name}`);

  for (const [name, slot] of Object.entries(frame.slots)) {
    if ((slot.kind === "adj" || (slot.kind === "noun" && slot.agree)) && slot.agree) {
      if (frame.slots[slot.agree]?.kind !== "noun")
        errors.push(`slot ${name} agrees with ${slot.agree}, which is not a noun slot`);
    }
    if (slot.kind === "verb") {
      const spec = slot.subject;
      if (spec === "@" && !frame.subjects)
        errors.push(`slot ${name} uses the frame subject but the frame declares none`);
      if (
        spec !== "@" &&
        !(SUBJECTS as readonly string[]).includes(spec) &&
        frame.slots[spec]?.kind !== "noun"
      ) {
        errors.push(`slot ${name} has subject ${spec}, which is neither a subject nor a noun slot`);
      }
    }
    if (slot.kind === "glue") {
      if (!context.glue.groups[slot.group])
        errors.push(`slot ${name} uses unknown glue group ${slot.group}`);
    } else if (slotCandidates(slot, context).length === 0) {
      errors.push(`slot ${name} matches no dictionary entries`);
    }
  }

  const allowed = allowedSpanishWords(context.dictionary, context.glue);
  const literal = frame.es.replace(PLACEHOLDER, " ");
  for (const word of literal.toLowerCase().split(/[^\p{L}]+/u)) {
    if (word && !allowed.has(word)) errors.push(`"${word}" is neither a dictionary word nor glue`);
  }

  if (errors.length === 0) {
    let rendered = 0;
    for (let i = 0; i < 30; i++) if (renderFrame(frame, context)) rendered++;
    if (rendered === 0) errors.push("never renders: its slots cannot all be filled together");
    const variety = estimateVariety(frame, context);
    if (variety < 20) warnings.push(`only about ${variety} distinct sentences`);
  }
  return { errors, warnings };
}
