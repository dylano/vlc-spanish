# Brief: generating the seed dictionary

You are producing `data/dictionary.json` for a Spanish vocabulary app. Output must validate
against the schema below exactly. A validator is provided; output that does not pass is not done.

## Target

Roughly 100–150 entries covering an elementary Peninsular Spanish class, across these tags:

`physical-traits`, `character-traits`, `family`, `frequency`, `times-of-day`,
`daily-activities`, `verbs`, `days`, `months`, `numbers`

Use exactly these tag strings. An entry may carry more than one tag. Add a new tag only if a word
genuinely fits none of the above, and keep it kebab-case.

**Do not enumerate numbers exhaustively.** The app keeps numbers in the dictionary to look up but
holds them back from quizzes, because a long run of them crowds out the words that carry meaning.
Cover the ones a class actually teaches as vocabulary — the irregular and awkward forms
(`quinientos`, `setecientos`, `veintiuno`) and anything with a note worth making — rather than every
integer in a range.

## Peninsular Spanish, specifically

This is a class taken in Spain. Where Spain differs from Latin America, Spain wins.

- `vosotros` is a real form and belongs in verb conjugations. Do not omit it.
- Spain-specific meanings are the primary meanings: `comer` = to have lunch (not merely "to eat"),
  `coger` = to take/catch (unremarkable in Spain), `el móvil` = mobile phone, `el ordenador` = computer,
  `conducir` = to drive, `zumo` = juice.
- Use `vale`, `tío/tía`, and similar only if they fit a listed tag.
- When a word's Spain meaning differs from the Latin American one, say so in `notes`.

## Schema

```ts
type Pos =
  "noun" | "adj" | "verb" | "adv" | "phrase" | "number" | "pronoun" | "prep" | "conj" | "expr";

type StemChange = "e→ie" | "o→ue" | "e→i" | "u→ue";

interface EntryBase {
  id: string; // lowercase ASCII slug, unique; accents folded, spaces → hyphens
  es: string; // headword, correct accents, lowercase unless a proper noun
  en: string[]; // accepted English answers, most natural first; en[0] is shown in results
  pos: Pos;
  notes?: string; // only when it earns its place (see below)
  tags: string[]; // from the list above
  added: string; // "2026-09-15" for every seed entry
  flagged?: string; // set when you are unsure; explain the uncertainty
  hint?: string; // only when no gloss in `en` is unique to this entry (see below)
}

interface NounEntry extends EntryBase {
  pos: "noun";
  gender: "m" | "f"; // REQUIRED
  article?: "required" | "optional" | "none"; // omit for ordinary nouns (see below)
  forms?: { f?: string; m?: string; pl?: string };
}

interface AdjEntry extends EntryBase {
  pos: "adj";
  forms?: { f?: string; pl?: string }; // omit f entirely for invariable adjectives
}

interface VerbEntry extends EntryBase {
  pos: "verb";
  verb: {
    reflexive: boolean; // REQUIRED
    regular: boolean; // REQUIRED
    stemChange?: StemChange;
    irregularYo?: string; // "hago", "salgo", "tengo"
  };
  forms?: {
    yo?: string;
    tu?: string;
    el?: string;
    nosotros?: string;
    vosotros?: string;
    ellos?: string;
  };
}

interface NumberEntry extends EntryBase {
  pos: "number";
  value: number; // REQUIRED, integer
  forms?: { f?: string; apocope?: string }; // quinientas; "un" for uno
}

interface OtherEntry extends EntryBase {
  pos: "adv" | "phrase" | "pronoun" | "prep" | "conj" | "expr";
  forms?: Record<string, string>;
}
```

The file is:

```json
{ "version": 1, "entries": [ ...entries... ] }
```

## Field rules

**`id`** — slugify `es`: lowercase, fold accents to ASCII (`ñ` → `n`, `í` → `i`), non-alphanumeric
runs become a single hyphen, no leading or trailing hyphen. `"a menudo"` → `"a-menudo"`,
`"tímido"` → `"timido"`. If two entries would collide (e.g. two senses of `para`), suffix the second
`-2`. Ids are permanent, so do not encode meaning or tags in them.

**`en`** — every answer a learner could reasonably type, most natural first. This list is what
grading accepts, so be generous: `["nice", "friendly", "likeable"]`, not just `["nice"]`. Verbs use
the `to ...` form (`["to go to bed"]`); the app strips the leading `to` when grading, so both work.
Do not include articles (`"the grandfather"` → just `"grandfather"`).

**`forms`** — this drives grading, so accuracy matters more than completeness:

- Nouns: `pl` always. `f` (or `m`) only for people/animals with a real other-gender counterpart
  (`abuelo`/`abuela`). Never invent one for inanimate nouns — `la mesa` has no masculine.
- Adjectives: `f` only when the adjective actually varies. Omit `f` for `inteligente`, `alegre`,
  `feliz`, `fácil`. Getting this wrong makes the app accept nonsense like "inteligenta".
- Verbs: present-tense forms for irregular or stem-changing verbs; for reflexives include the
  pronoun (`"me acuesto"`). Regular verbs can omit `forms` entirely.
- Numbers: `f` for the hundreds that agree (`quinientas`), `apocope` for `uno` → `un`.

**`verb.regular`** — `false` if the present tense deviates at all: stem changes, irregular `yo`,
or fully irregular (`ser`, `ir`, `tener`).

**`notes`** — include only when it prevents a real mistake. Good reasons: false friends
(`simpático` is not "sympathetic"; `embarazada` is not "embarrassed"), Spain-vs-Latin-America
differences, `ser`/`estar` nuance, a plural with its own meaning (`los abuelos` = grandparents),
a word whose gender is surprising (`el día`, `la mano`). Skip notes that restate the translation.
One or two sentences. Sentence case, no exclamation marks.

**`hint`** — the quiz prompts with an English gloss, preferring one no other entry uses. When every
gloss is shared, the prompt alone cannot say which word is meant: `ser` and `estar` are both only
"to be". Give each such entry a short hint naming what sets it apart, lowercase, a few words:
`"identity, traits, origin"` for `ser`, `"location, temporary states"` for `estar`. It is shown
under the prompt only when the gloss is shared, so do not add one to entries that do not need it —
adding a distinct gloss to `en` is usually the better fix when one exists.

**`article`** — English → Spanish quizzes expect nouns with their article, because the article is
how gender gets tested. Omit this field for ordinary nouns. Set it only for nouns Spanish normally
uses without one:

- `"none"` — used bare: months (`en enero`). Answers are accepted with or without the article, and
  the answer is shown bare.
- `"optional"` — either is natural: days of the week (`el lunes`, but `hoy es lunes`). Accepted
  with or without, shown with the article.

**`flagged`** — set it whenever you are guessing: an ambiguous headword, a form you are not certain
of, a word whose class-intended sense is unclear. Flagged entries are surfaced for human review,
so flagging costs nothing and a silent wrong answer costs a lot. Do not flag entries you are sure of.

## Worked examples

```json
{
  "version": 1,
  "entries": [
    {
      "id": "simpatico",
      "es": "simpático",
      "en": ["nice", "friendly", "likeable"],
      "pos": "adj",
      "forms": { "f": "simpática" },
      "notes": "False friend — not 'sympathetic'.",
      "tags": ["character-traits"],
      "added": "2026-09-15"
    },
    {
      "id": "inteligente",
      "es": "inteligente",
      "en": ["intelligent", "smart", "clever"],
      "pos": "adj",
      "tags": ["character-traits"],
      "added": "2026-09-15"
    },
    {
      "id": "abuelo",
      "es": "abuelo",
      "en": ["grandfather", "grandpa"],
      "pos": "noun",
      "gender": "m",
      "forms": { "f": "abuela", "pl": "abuelos" },
      "notes": "Plural 'los abuelos' means grandparents.",
      "tags": ["family"],
      "added": "2026-09-15"
    },
    {
      "id": "acostarse",
      "es": "acostarse",
      "en": ["to go to bed"],
      "pos": "verb",
      "verb": { "reflexive": true, "regular": false, "stemChange": "o→ue" },
      "forms": {
        "yo": "me acuesto",
        "tu": "te acuestas",
        "el": "se acuesta",
        "nosotros": "nos acostamos",
        "vosotros": "os acostáis",
        "ellos": "se acuestan"
      },
      "tags": ["daily-activities", "verbs"],
      "added": "2026-09-15"
    },
    {
      "id": "comer",
      "es": "comer",
      "en": ["to have lunch", "to eat"],
      "pos": "verb",
      "verb": { "reflexive": false, "regular": true },
      "notes": "In Spain 'comer' means to have lunch specifically; 'almorzar' is less common.",
      "tags": ["daily-activities", "verbs"],
      "added": "2026-09-15"
    },
    {
      "id": "a-menudo",
      "es": "a menudo",
      "en": ["often", "frequently"],
      "pos": "adv",
      "tags": ["frequency"],
      "added": "2026-09-15"
    },
    {
      "id": "quinientos",
      "es": "quinientos",
      "en": ["five hundred", "500"],
      "pos": "number",
      "value": 500,
      "forms": { "f": "quinientas" },
      "tags": ["numbers"],
      "added": "2026-09-15"
    }
  ]
}
```

## Mistakes the validator will catch

- `id` not the slug of `es`, or duplicated across entries
- a noun without `gender`
- a verb without `verb.reflexive` / `verb.regular`, or marked reflexive without a `-se` ending
- a verb whose `en` has no `to ...` gloss, or a non-verb whose `en` starts with `to `
- `added` not in `YYYY-MM-DD` form
- an entry with no tags
- an entry with no English gloss of its own and no `hint`
- an invented feminine on an invariable adjective (not auto-detected — get this right yourself)

## Delivering

Write `data/dictionary.json`, then run:

```
node scripts/validate-dictionary.ts data/dictionary.json
```

It prints entry counts by tag and part of speech, lists warnings, and exits non-zero on any schema
error. Fix everything it reports, then re-run until it prints `✓ schema valid`. Report the warning
list in your summary even when it exits zero — warnings are usually real problems (a flagged entry,
a missing tag, a suspicious reflexive) that a human should look at.
