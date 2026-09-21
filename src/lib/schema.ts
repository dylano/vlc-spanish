import { z } from "zod";

/**
 * Single source of truth for dictionary data. Used for runtime validation in the
 * app, in the functions, and in the dictionary scripts.
 */

export const POS = [
  "noun",
  "adj",
  "verb",
  "adv",
  "phrase",
  "number",
  "pronoun",
  "prep",
  "conj",
  "expr",
] as const;

export const posSchema = z.enum(POS);
export type Pos = z.infer<typeof posSchema>;

export const STEM_CHANGES = ["e→ie", "o→ue", "e→i", "u→ue"] as const;
export const stemChangeSchema = z.enum(STEM_CHANGES);
export type StemChange = z.infer<typeof stemChangeSchema>;

export const DIRECTIONS = ["en→es", "es→en"] as const;
export const directionSchema = z.enum(DIRECTIONS);
export type Direction = z.infer<typeof directionSchema>;

/** ASCII slug: lowercase letters, digits, hyphens. No accents, no spaces. */
const slug = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase ASCII slug, e.g. 'a-menudo'");

const isoDate = z.iso.date();

const nonEmpty = z.string().trim().min(1);

const entryBase = {
  id: slug,
  es: nonEmpty,
  en: z.array(nonEmpty).min(1),
  notes: z.string().trim().min(1).optional(),
  tags: z.array(slug),
  added: isoDate,
  addedBy: z.string().trim().min(1).optional(),
  flagged: z.string().trim().min(1).optional(),
  /**
   * Disambiguates an english prompt that another entry shares: ser and estar are
   * both only "to be". Shown under the prompt, and only when the gloss is shared.
   */
  hint: nonEmpty.optional(),
};

/**
 * Whether an english → spanish quiz expects the article. Most nouns are asked
 * with it, because the article is how gender gets tested; months are used bare
 * (en enero), and days go either way (el lunes, hoy es lunes).
 */
export const ARTICLE_USAGE = ["required", "optional", "none"] as const;
export type ArticleUsage = (typeof ARTICLE_USAGE)[number];

export const nounEntrySchema = z.object({
  ...entryBase,
  pos: z.literal("noun"),
  /** "mf" is common gender: one form taking either article (el/la estudiante). */
  gender: z.enum(["m", "f", "mf"]),
  article: z.enum(ARTICLE_USAGE).optional(),
  /**
   * "pl" for an entry whose headword is itself plural (los padres, los hermanos):
   * a word with its own meaning in the plural, listed separately from the
   * singular. It takes los/las and has no `forms.pl`. "sg" for a noun with no
   * plural at all (la ropa interior), so it is not mistaken for one missing it.
   */
  number: z.enum(["sg", "pl"]).optional(),
  /**
   * English for the feminine form in `forms.f`, most natural first: hermana →
   * ["sister"]. Sentences use it when they put a person in the feminine, so a
   * noun with `forms.f` but no `enF` is only ever used in the masculine. Repeat
   * `en` when the English does not change (profesora → teacher).
   */
  enF: z.array(nonEmpty).min(1).optional(),
  forms: z
    .object({ f: nonEmpty.optional(), m: nonEmpty.optional(), pl: nonEmpty.optional() })
    .optional(),
});

export const adjEntrySchema = z.object({
  ...entryBase,
  pos: z.literal("adj"),
  forms: z.object({ f: nonEmpty.optional(), pl: nonEmpty.optional() }).optional(),
  /**
   * English for the plural, when it differs: este → ["these"]. Sentences use it
   * for a plural noun; most adjectives read the same in English either way.
   */
  enPl: z.array(nonEmpty).min(1).optional(),
});

export const verbEntrySchema = z.object({
  ...entryBase,
  pos: z.literal("verb"),
  verb: z.object({
    reflexive: z.boolean(),
    regular: z.boolean(),
    stemChange: stemChangeSchema.optional(),
    irregularYo: nonEmpty.optional(),
  }),
  forms: z
    .object({
      yo: nonEmpty.optional(),
      tu: nonEmpty.optional(),
      el: nonEmpty.optional(),
      nosotros: nonEmpty.optional(),
      vosotros: nonEmpty.optional(),
      ellos: nonEmpty.optional(),
    })
    .optional(),
});

export const numberEntrySchema = z.object({
  ...entryBase,
  pos: z.literal("number"),
  value: z.number().int(),
  forms: z.object({ f: nonEmpty.optional(), apocope: nonEmpty.optional() }).optional(),
});

export const otherEntrySchema = z.object({
  ...entryBase,
  pos: z.enum(["adv", "phrase", "pronoun", "prep", "conj", "expr"]),
  forms: z.record(z.string(), nonEmpty).optional(),
});

export const entrySchema = z.discriminatedUnion("pos", [
  nounEntrySchema,
  adjEntrySchema,
  verbEntrySchema,
  numberEntrySchema,
  otherEntrySchema,
]);

export type NounEntry = z.infer<typeof nounEntrySchema>;
export type AdjEntry = z.infer<typeof adjEntrySchema>;
export type VerbEntry = z.infer<typeof verbEntrySchema>;
export type NumberEntry = z.infer<typeof numberEntrySchema>;
export type OtherEntry = z.infer<typeof otherEntrySchema>;
export type Entry = z.infer<typeof entrySchema>;

export const dictionarySchema = z.object({
  version: z.literal(1),
  updatedAt: z.iso.datetime().optional(),
  entries: z.array(entrySchema),
});

export type Dictionary = z.infer<typeof dictionarySchema>;

export const progressSchema = z.object({
  userId: slug,
  entryId: slug,
  direction: directionSchema,
  due: isoDate,
  interval: z.number().nonnegative(),
  ease: z.number().min(1.3),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  lastResult: z.enum(["correct", "hard", "wrong"]).optional(),
  lastSeen: isoDate.optional(),
});

export type Progress = z.infer<typeof progressSchema>;

/**
 * `progress/<userId>` blob: entryId -> direction -> Progress.
 *
 * The inner record is a *partial* record: a word is usually practiced in one
 * direction before the other, so requiring both keys (which `z.record` with an
 * enum key does) would reject ordinary data.
 */
export const progressBlobSchema = z.object({
  userId: slug,
  updatedAt: z.iso.datetime().optional(),
  entries: z.record(z.string(), z.partialRecord(directionSchema, progressSchema)),
});

export type ProgressBlob = z.infer<typeof progressBlobSchema>;
