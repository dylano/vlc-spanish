import { z } from "zod";
import { POS, type AdjEntry, type Entry, type NounEntry, type VerbEntry } from "../schema.ts";
import { verbForm } from "./conjugate.ts";
import {
  baseVerb,
  indefiniteArticle,
  inflectVerb,
  negateVerb,
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
 * :el (definite article) or :un (indefinite). In English it takes :the or :a,
 * or :pronoun for he, she or they. A verb takes :not for its negative and :base
 * for the bare form after do-support ("Does your mother buy…?").
 * {S} is the frame's subject pronoun, for frames that declare `subjects`.
 */

/**
 * Direct object pronouns, by the gender and number of the noun they stand for:
 * el pan → lo compro, las servilletas → las tengo. Each is a dictionary entry,
 * so a blank on one is scheduled like any other word.
 */
export const DIRECT_OBJECT = {
  m: { sg: "lo", pl: "los" },
  f: { sg: "la", pl: "las" },
} as const;
const DIRECT_OBJECT_IDS: readonly string[] = ["lo", "la", "los", "las"];

/** The gender and number a direct object pronoun stands for: la → feminine singular. */
export function directObjectAgreement(
  id: string,
): { gender: "m" | "f"; number: "sg" | "pl" } | undefined {
  for (const gender of ["m", "f"] as const) {
    for (const number of ["sg", "pl"] as const) {
      if (DIRECT_OBJECT[gender][number] === id) return { gender, number };
    }
  }
  return undefined;
}

export function isDirectObject(entry: Entry): boolean {
  return entry.pos === "pronoun" && DIRECT_OBJECT_IDS.includes(entry.id);
}

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
    /**
     * Pin the gender instead of leaving it to chance, for a sentence that only
     * makes sense one way: a beard belongs to "mi padre", never "mi madre".
     */
    gender: z.enum(["m", "f"]).optional(),
  }),
  z.object({ kind: z.literal("adj"), ...select, agree: z.string() }),
  z.object({
    kind: z.literal("verb"),
    ...select,
    /**
     * A fixed subject, "@" for the frame's subject, a noun slot acting as subject,
     * or "inf" for the infinitive (me gusta leer).
     */
    subject: z.string(),
    /**
     * For verbs like gustar, the slot holding what is liked: a noun slot or an
     * infinitive verb slot. The Spanish is then the person's pronoun plus the
     * verb agreeing with that thing (me gustan los zapatos, le gusta leer); the
     * English stays subject-first (I like shoes).
     */
    liked: z.string().optional(),
    /**
     * The verb filled in another verb slot, here in this slot's person: a
     * question and its answer (¿Compras el pan? Sí, lo compro). List the same
     * ids as that slot, so Fill in the Blank knows which verbs can sit here.
     */
    same: z.string().optional(),
  }),
  z.object({ kind: z.literal("word"), ...select, pos: z.enum(POS).optional() }),
  /**
   * A direct object pronoun standing for a noun slot, agreeing with it: lo, la,
   * los or las. In English, "it" or "them", or for a `person` "him", "her" or
   * "them" (¿Ves a tu hermana? Sí, la veo — I see her).
   */
  z.object({ kind: z.literal("pronoun"), agree: z.string(), person: z.boolean().optional() }),
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
  /** For a verb like gustar, the slot holding what is liked, which decides gusta or gustan. */
  liked?: string;
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
  /**
   * Frames already used in this session. A word's frames are tried unused ones
   * first, so a session does not say "Hay cebollas en la mesa" and then "Hay
   * calabazas en la mesa"; a used one is still taken when nothing else fits.
   */
  usedFrames?: Set<string>;
}

/**
 * The frames and slots an entry can sit in, in the order to try them: shuffled,
 * with frames this session has not used yet first. Rendering one records it.
 */
export function framesToTry(
  targets: Map<string, { frame: Frame; slot: string }[]>,
  entryId: string,
  context: Pick<RenderContext, "random" | "usedFrames">,
): { frame: Frame; slot: string }[] {
  const options = shuffled(targets.get(entryId) ?? [], context.random);
  const used = context.usedFrames;
  if (!used || used.size === 0) return options;
  return [
    ...options.filter((option) => !used.has(option.frame.id)),
    ...options.filter((option) => used.has(option.frame.id)),
  ];
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
  /** Feminine but el/un in the singular: el agua. */
  elSingular?: boolean;
  /** For a verb, the English negative ("doesn't like"), for {v:not}. */
  enNot?: string;
  /** For a verb, the bare English form after does or do ("buy"), for {v:base}. */
  enBase?: string;
}

const OBJECT_PRONOUN: Record<Subject, string> = {
  yo: "me",
  tu: "te",
  el: "le",
  nosotros: "nos",
  vosotros: "os",
  ellos: "les",
};

/**
 * A gustar-type verb for a person and what they like: me gusta, les gustan.
 * The verb agrees with the thing liked (third person, singular or plural), and
 * the person is the pronoun in front.
 */
export function likeForm(
  entry: VerbEntry,
  person: Subject,
  likedNumber: "sg" | "pl",
  dictionary: Entry[],
): string | undefined {
  const form = verbForm(entry, likedNumber === "pl" ? "ellos" : "el", dictionary);
  return form ? `${OBJECT_PRONOUN[person]} ${form}` : undefined;
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
  if (slot.kind === "pronoun") return true;
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
      case "pronoun":
        return isDirectObject(entry);
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
  const elSingular = entry.elSingular === true;
  const plural = number === "pl";
  const english = (gloss: string) => (plural && entry.number !== "pl" ? pluralize(gloss) : gloss);

  if (entry.gender === "mf") {
    const gender = wanted ?? (random() < 0.5 ? "m" : "f");
    const es = plural
      ? entry.number === "pl"
        ? entry.es
        : (entry.forms?.pl ?? spanishPlural(entry.es))
      : entry.es;
    return {
      entryId: entry.id,
      es,
      en: english(entry.en[0]!),
      gender,
      number,
      takesArticle,
      elSingular,
    };
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
  return {
    entryId: entry.id,
    es,
    en: english(entry.en[0]!),
    gender,
    number,
    takesArticle,
    elSingular,
  };
}

function adjFill(entry: AdjEntry, gender: Gender | "mf", number: NumberKind): Filled {
  // Common-gender nouns still need a gender for agreement; they were given one.
  const feminine = gender === "f";
  let es: string;
  if (number === "sg") es = feminine ? (entry.forms?.f ?? entry.es) : entry.es;
  else if (feminine && entry.forms?.f) es = spanishPlural(entry.forms.f);
  else es = entry.forms?.pl ?? spanishPlural(entry.es);
  const en = number === "pl" && entry.enPl ? entry.enPl[0]! : entry.en[0]!;
  return { entryId: entry.id, es, en, gender, number };
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

/** A capital at the start of each sentence: "I have a book. I read it at night." */
function capitalizeSentences(text: string): string {
  return capitalizeFirst(text).replace(
    /([.?!]\s+)(\p{Ll})/gu,
    (_, gap: string, letter: string) => gap + letter.toUpperCase(),
  );
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

  // A verb pinned in an answer is pinned in its question too, and the other way round.
  fixed = { ...fixed };
  for (const [name, slot] of Object.entries(frame.slots)) {
    if (slot.kind !== "verb" || !slot.same) continue;
    const pinned = fixed[name] ?? fixed[slot.same];
    if (pinned) {
      fixed[name] = pinned;
      fixed[slot.same] = pinned;
    }
  }
  // A pinned pronoun decides its noun's gender: aimed at "la", the noun is feminine.
  const pinnedGender: Record<string, Gender> = {};
  for (const [name, slot] of Object.entries(frame.slots)) {
    const agreement =
      slot.kind === "pronoun" && fixed[name] ? directObjectAgreement(fixed[name]!) : undefined;
    if (slot.kind === "pronoun" && agreement) pinnedGender[slot.agree] = agreement.gender;
  }

  // Nouns first (agreeing nouns after the ones they agree with), then the rest.
  const order = Object.entries(frame.slots).sort(([, a], [, b]) => rank(a) - rank(b));

  for (const [name, slot] of order) {
    let result: Filled | undefined;

    if (slot.kind === "glue") {
      const item = pick(glue.groups[slot.group] ?? [], random);
      result = item ? { es: item.es, en: item.en } : undefined;
    } else {
      const sameAs = slot.kind === "verb" && slot.same ? filled.get(slot.same)?.entryId : undefined;
      const candidates = slotCandidates(slot, context).filter(
        (entry) =>
          (fixed[name] === undefined || entry.id === fixed[name]) &&
          (sameAs === undefined || entry.id === sameAs),
      );
      // For a person whose gender is free, decide the gender first and then find
      // a word that can take it. Deciding per word instead lets words that are
      // always masculine (los padres) tip whole frames toward the masculine.
      const pinned = slot.kind === "noun" ? pinnedGender[name] : undefined;
      const gender: Gender | undefined =
        slot.kind === "noun" && !slot.agree
          ? (slot.gender ??
            pinned ??
            (candidates.some(canBeEitherGender) ? (random() < 0.5 ? "f" : "m") : undefined))
          : undefined;
      // A gender a pronoun was pinned for is a requirement, not a preference.
      const attempts: (Gender | undefined)[] = pinned
        ? [pinned]
        : gender
          ? [gender, undefined]
          : [undefined];
      for (const wanted of attempts) {
        for (const entry of shuffled(candidates, random)) {
          // The answer repeats the question's verb; anything else is used once.
          if (used.has(entry.id) && sameAs === undefined) continue;
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
  const en = capitalizeSentences(renderEnglish(frame.en, filled, subject));
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
    if (slot.kind === "adj" || slot.kind === "pronoun" || (slot.kind === "noun" && slot.agree))
      detail.agreesWith = slot.agree;
    if (slot.kind === "verb" && slot.subject !== "inf") {
      const who = subjectOf(slot.subject, filled, subject);
      detail.subject = who?.subject;
      if (frame.slots[slot.subject]?.kind === "noun") detail.agreesWith = slot.subject;
      if (slot.liked) {
        detail.liked = slot.liked;
        detail.number = filled.get(slot.liked)?.number ?? "sg";
      }
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
    // A gustar-type verb waits for what is liked, to agree with it.
    if (slot.kind === "verb" && slot.liked) return 3;
    // An answer's verb waits for the question's.
    if (slot.kind === "verb" && slot.same) return 4;
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
      const target = slot.agree ? filled.get(slot.agree)?.gender : (slot.gender ?? gender);
      const wanted = target === "mf" ? undefined : target;
      const fill = nounFill(entry, slot.number, wanted, random);
      // A pinned gender is a requirement, not a preference: drop a word that
      // cannot take it rather than rendering the other one.
      return slot.gender && fill && fill.gender !== slot.gender ? undefined : fill;
    }
    case "adj": {
      const noun = filled.get(slot.agree);
      if (entry.pos !== "adj" || !noun) return undefined;
      return adjFill(entry, noun.gender ?? "m", noun.number ?? "sg");
    }
    case "verb": {
      if (entry.pos !== "verb") return undefined;
      // An infinitive is itself something liked, and singular: me gusta leer.
      if (slot.subject === "inf") {
        return { entryId: entry.id, es: entry.es, en: entry.en[0]!, number: "sg" };
      }
      const who = subjectOf(slot.subject, filled, frameSubject);
      if (!who) return undefined;
      const liked = slot.liked ? filled.get(slot.liked) : undefined;
      if (slot.liked && !liked) return undefined;
      const es = liked
        ? likeForm(entry as VerbEntry, who.subject, liked.number ?? "sg", dictionary)
        : verbForm(entry as VerbEntry, who.subject, dictionary);
      if (!es) return undefined;
      return {
        entryId: entry.id,
        es,
        en: inflectVerb(entry.en[0]!, who.subject, who.gender),
        enNot: negateVerb(entry.en[0]!, who.subject, who.gender),
        enBase: baseVerb(entry.en[0]!, who.subject, who.gender),
      };
    }
    case "word":
      return { entryId: entry.id, es: entry.es, en: entry.en[0]! };
    case "pronoun": {
      const noun = filled.get(slot.agree);
      if (!noun || !isDirectObject(entry)) return undefined;
      // A common-gender noun was given a gender when it was filled; el agua is feminine.
      const gender = noun.gender === "f" ? "f" : "m";
      const number = noun.number ?? "sg";
      if (entry.id !== DIRECT_OBJECT[gender][number]) return undefined;
      return {
        entryId: entry.id,
        es: entry.es,
        en: number === "pl" ? "them" : slot.person ? (gender === "f" ? "her" : "him") : "it",
        gender,
        number,
      };
    }
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
      // el agua: feminine, but el/un in the singular.
      const number = fill.number ?? "sg";
      const gender = fill.elSingular && number === "sg" ? "m" : fill.gender === "f" ? "f" : "m";
      const article = SPANISH_ARTICLE[modifier][gender][number];
      segments.push({ text: article, slot: name, entryId: fill.entryId, article: true });
      segments.push({ text: " " });
    }
    segments.push({ text: fill.es, slot: name, entryId: fill.entryId });
  }
  if (last < template.length) segments.push({ text: template.slice(last) });

  contract(segments);
  euphony(segments);
  // Every sentence starts with a capital, including a second one that starts
  // with a slot: Tengo un libro nuevo. Lo leo por la noche.
  let starts = true;
  for (const segment of segments) {
    if (!/\p{L}/u.test(segment.text)) {
      if (/[.?!]\s*$/.test(segment.text)) starts = true;
      continue;
    }
    if (starts) segment.text = capitalizeFirst(segment.text);
    starts = /[.?!]\s*$/.test(segment.text);
  }
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
    if (modifier === "not") return fill.enNot ?? `not ${fill.en}`;
    if (modifier === "base") return fill.enBase ?? fill.en;
    // A person named earlier, as the subject of the answer: Yes, she buys it.
    if (modifier === "pronoun")
      return fill.number === "pl" ? "they" : fill.gender === "f" ? "she" : "he";
    // A slot English does not say word for word: "¿Me pones un café?" is "Can I
    // have a coffee?", with no "put" in it.
    if (modifier === "none") return "";
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
    // Decided by other slots: the answer's verb is the question's, the pronoun its noun's.
    if (slot.kind === "pronoun" || (slot.kind === "verb" && slot.same)) continue;
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
    ["en", frame.en, ["the", "a", "not", "none", "base", "pronoun"]],
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
    if (
      (slot.kind === "adj" || slot.kind === "pronoun" || (slot.kind === "noun" && slot.agree)) &&
      slot.agree
    ) {
      if (frame.slots[slot.agree]?.kind !== "noun")
        errors.push(`slot ${name} agrees with ${slot.agree}, which is not a noun slot`);
    }
    if (slot.kind === "verb" && slot.same) {
      const source = frame.slots[slot.same];
      if (source?.kind !== "verb") {
        errors.push(`slot ${name} repeats ${slot.same}, which is not a verb slot`);
      } else if ([...(source.ids ?? [])].sort().join() !== [...(slot.ids ?? [])].sort().join()) {
        errors.push(`slot ${name} repeats ${slot.same} but lists different ids`);
      }
    }
    if (slot.kind === "verb") {
      const spec = slot.subject;
      if (spec === "@" && !frame.subjects)
        errors.push(`slot ${name} uses the frame subject but the frame declares none`);
      if (
        spec !== "@" &&
        spec !== "inf" &&
        !(SUBJECTS as readonly string[]).includes(spec) &&
        frame.slots[spec]?.kind !== "noun"
      ) {
        errors.push(`slot ${name} has subject ${spec}, which is neither a subject nor a noun slot`);
      }
      if (slot.liked) {
        const liked = frame.slots[slot.liked];
        if (liked?.kind !== "noun" && !(liked?.kind === "verb" && liked.subject === "inf"))
          errors.push(
            `slot ${name} likes ${slot.liked}, which is neither a noun nor an infinitive`,
          );
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
