# Spanish vocab app — plan and spec

> **Superseded in part.** This is the original brief, kept for its data model and grading rules.
> The Claude API integration is not being built: no `/api/enrich`, no `/api/sentences`, no Add-words
> screen, no family passphrase, no `ANTHROPIC_API_KEY`, no `.env`. Dictionary entries are authored
> outside the app (see [DICTIONARY_BRIEF.md](DICTIONARY_BRIEF.md)) and imported from a terminal.
> Where this document and the [README](README.md) disagree, the README is current.

This document briefs a Claude Code agent on building a vocabulary-learning app for Doliver and his family. It captures the decisions made so far in a chat with Claude, the data model, and a phased plan. Treat it as the starting point for a collaboration, not a rigid contract: open decisions are listed at the end and should be confirmed with Doliver before scaffolding.

## 1. Context and goals

- Doliver is taking an elementary Spanish class in Spain (Peninsular Spanish: _vosotros_ forms, Spain-specific usage such as _comer_ = to have lunch). Every couple of days he gets a new list of words from a class section (e.g. "physical traits", "daily activities").
- Until now the workflow has been: paste the Spanish words into a chat with Claude → Claude returns English meanings, part of speech, gender, forms, and notes → Claude runs typed-answer quizzes and tracks misses. That works but chat is a poor fit for the repetitive drilling part.
- The app takes over the **dictionary, scheduling, and drilling**. Claude (via API) takes over the **thinking**: enriching raw word lists into full entries, and later generating practice sentences from known words.
- The app will be deployed publicly on **Netlify** so family members can use it too. This means a shared backend store rather than local-only storage, and a server-side home for the Claude API key. Identity is deliberately minimal: three or so users who pick their name from a list, no passwords, no security concerns between them.

### What Doliver has said he wants from quizzes

- Graded mode by default (score at the end), not just flashcards.
- Prompt with the **English** word most of the time and expect the Spanish; a mix of directions is good but English → Spanish should dominate (roughly 70/30).
- **Typed answers** preferred over multiple choice; a mix of formats (typed, multiple choice, flashcard) keeps it dynamic.
- Track misses so they come back in later rounds.
- Once the dictionary has enough building blocks, add **short sentences** built only from words already learned.

## 2. Architecture

```
Browser (React + TS PWA)  ──►  Netlify Functions (TS)  ──►  Netlify Blobs     dictionary, users, progress
                                      │
                                      │  /api/enrich, /api/sentences
                                      │  holds ANTHROPIC_API_KEY
                                      └──────────────────────►  Claude API
```

- **Frontend:** Vite+ (`vp`) standalone application, React + TypeScript. Plain CSS with CSS modules. Installable PWA (manifest + service worker) so it works well on phones; quizzes should function offline against cached data, syncing progress when back online (nice-to-have, not phase 1).
- **Data:** Netlify Blobs — a hosted key-value store written and read from Netlify Functions. This is deliberately "the big JSON file, but writable": the dictionary is one blob, each user's progress is one blob, and a handful of tiny functions expose them. No database, no schema migrations, no second service. The agent should verify the current Netlify Blobs API and its consistency options in the Netlify docs rather than rely on this document.
- **Identity:** name only. The first visit shows a "Who's practicing?" picker with the known names (plus "add a name"); the choice is stored in `localStorage` and used as `userId` for progress. Switching user is a tap in Settings. No passwords, no email.
- **Claude proxy:** Netlify Functions. The Anthropic key lives only in Netlify environment variables; never ship it to the client. The site URL is public, so anyone who finds `/api/enrich` could spend API credits — mitigate cheaply with a single shared passphrase (`FAMILY_SECRET` env var, entered once in Settings and sent as a header) and a basic per-IP rate limit in the function. That's the only "security" in the app, and it exists to protect the API bill, not the users.
- **Local dev:** `netlify dev` runs the functions alongside Vite and provides a local Blobs store. Document the env vars in `.env.example`.

### Sharing model

- **One shared dictionary** for the whole family. Anyone can add words; entries record `addedBy` (the chosen name). Tags keep class sections separate.
- **Per-user progress.** Scheduling state is per user, per entry, per direction.
- Later: optional per-user "lists" if family members turn out to be learning different material.

## 3. Data model

### 3.1 Dictionary entry (TypeScript)

```ts
export type Pos =
  "noun" | "adj" | "verb" | "adv" | "phrase" | "number" | "pronoun" | "prep" | "conj" | "expr";

export type StemChange = "e→ie" | "o→ue" | "e→i" | "u→ue";

interface EntryBase {
  id: string; // ASCII slug, unique, stable (e.g. "a-menudo", "acostarse")
  es: string; // headword with correct accents
  en: string[]; // accepted English answers; en[0] is the canonical one shown in results
  pos: Pos;
  notes?: string; // usage notes, false friends, Spain-specific meaning, ser/estar nuance
  tags: string[]; // class sections and topics, kebab-case ("family", "daily-activities")
  added: string; // ISO date the word was added
  addedBy?: string; // user id
  flagged?: string; // Claude's uncertainty note from enrichment; cleared on human review
}

export interface NounEntry extends EntryBase {
  pos: "noun";
  gender: "m" | "f";
  forms?: { f?: string; m?: string; pl?: string }; // f/m: the other-gender form if it exists
}

export interface AdjEntry extends EntryBase {
  pos: "adj";
  forms?: { f?: string; pl?: string }; // omit f for invariable adjectives (inteligente, alegre)
}

export interface VerbEntry extends EntryBase {
  pos: "verb";
  verb: {
    reflexive: boolean;
    regular: boolean;
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

export interface NumberEntry extends EntryBase {
  pos: "number";
  value: number;
  forms?: { f?: string; apocope?: string }; // quinientas; "un" for uno
}

export interface OtherEntry extends EntryBase {
  pos: "adv" | "phrase" | "pronoun" | "prep" | "conj" | "expr";
  forms?: Record<string, string>;
}

export type Entry = NounEntry | AdjEntry | VerbEntry | NumberEntry | OtherEntry;

export interface Dictionary {
  version: 1;
  entries: Entry[];
}
```

### 3.2 Example entries (JSON)

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
      "id": "abuelo",
      "es": "abuelo",
      "en": ["grandfather"],
      "pos": "noun",
      "gender": "m",
      "forms": { "f": "abuela", "pl": "abuelos" },
      "notes": "Plural 'los abuelos' = grandparents.",
      "tags": ["family"],
      "added": "2026-09-15"
    },
    {
      "id": "acostarse",
      "es": "acostarse",
      "en": ["to go to bed"],
      "pos": "verb",
      "verb": { "reflexive": true, "regular": false, "stemChange": "o→ue" },
      "forms": { "yo": "me acuesto" },
      "tags": ["daily-activities"],
      "added": "2026-09-15"
    },
    {
      "id": "a-menudo",
      "es": "a menudo",
      "en": ["often"],
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

### 3.3 Progress (per user, per entry, per direction)

```ts
export type Direction = "en→es" | "es→en";

export interface Progress {
  userId: string; // the user's chosen name, slugified
  entryId: string;
  direction: Direction;
  due: string; // ISO date
  interval: number; // days
  ease: number; // SM-2 ease factor, starts 2.5
  reps: number;
  lapses: number;
  lastResult?: "correct" | "hard" | "wrong";
  lastSeen?: string;
}
```

Keep progress separate from the dictionary so the dictionary stays a clean, exportable seed and progress can be reset per user.

### 3.4 Storage layout (Netlify Blobs)

One store (e.g. `vocab`) with these keys:

- `dictionary` — the whole `Dictionary` object from §3.1. Small enough (hundreds of entries) to read and write as a unit; add a `updatedAt` field and use it for optimistic concurrency so two people adding words at once don't clobber each other (read → merge by `id` → write, retry on mismatch).
- `users` — `{ users: { id: string; displayName: string; createdAt: string }[] }`. Populated from the name picker.
- `progress/<userId>` — `{ [entryId]: { [direction]: Progress } }`. One blob per user, written after each quiz session (not after every card).
- `sessions/<userId>` (optional, phase 2) — recent session summaries for the history view; cap the list.

Functions that front the store:

- `GET /api/dictionary` → the `Dictionary`
- `POST /api/entries` → merge new/edited `Entry[]` into the dictionary (body includes the `updatedAt` the client read)
- `GET /api/users`, `POST /api/users` → list / add a name
- `GET /api/progress/:userId`, `PUT /api/progress/:userId` → read / replace a user's progress blob

None of these need the family passphrase; only the Claude-backed functions do. Cache the dictionary in the client (and in the service worker for offline quizzes) and refetch on app open.

### 3.5 Seed data

Doliver will provide `dictionary.json` in the format above, exported from the chat dictionary. Expect roughly 100–150 entries across tags: `physical-traits`, `character-traits`, `family`, `frequency`, `times-of-day`, `daily-activities`, `verbs`, `days`, `months`, `numbers`. Build an import script (`scripts/import-dictionary.ts`) that validates against the schema (zod) and upserts by `id`.

## 4. Grading rules

These are the rules the chat quizzes have been using; port them exactly and unit-test them.

Normalization (both languages): lowercase, trim, collapse whitespace, strip trailing `.!?`.

**English → Spanish (expected answer is Spanish):**

- Accept `es`, plus any value in `forms` (so _simpática_ or _abuelos_ is accepted when asked for _simpático_ / _abuelo_, but show a note if the prompt asked for a specific form).
- Accept the user writing `tímido/a`.
- Leading article `el/la/los/las` is optional in general. For nouns, if the quiz asked for the article and it's missing → result is **hard** ("right word, include the article: la mujer"), not wrong.
- If the answer matches only after stripping diacritics (`timido` for `tímido`) → **hard** ("almost — check the accent"). Counts as a rep but with reduced ease.
- Otherwise → **wrong**; show `es` and the note.

**Spanish → English (expected answer is English):**

- Strip a leading `to ` for verbs and `the/a/an ` for nouns before comparing.
- Accept any entry in `en`.
- Otherwise → wrong; show `en[0]`.

Results feed the scheduler: correct → normal SM-2 advance; hard → advance with reduced ease; wrong → lapse, due tomorrow.

## 5. Scheduling

Start with **SM-2** (small, well-understood, easy to test). Per entry per direction. Defaults: new cards due immediately; first intervals 1 → 3 → ease-based; ease floor 1.3. Treat FSRS (`ts-fsrs`) as an optional later upgrade behind the same interface, so the scheduler is a pluggable module: `schedule(progress, result, today) => Progress`.

Quiz session builder picks cards in this order: due cards first, then recently-added cards not yet seen, then (if the user asked for a larger session) random review from the pool. Session config:

```ts
interface QuizConfig {
  size: number; // default 10
  direction: "en→es" | "es→en" | "mixed"; // mixed = ~70% en→es
  format: "typed" | "choice" | "flashcard" | "mixed"; // mixed favors typed
  tags?: string[]; // restrict to sections
  scope: "due" | "recent" | "misses" | "all";
}
```

Multiple-choice distractors come from the same `pos` and, where possible, the same tag (family nouns vs family nouns), never from unrelated words.

## 6. Claude integration

### 6.1 `/api/enrich` — raw words → full entries

Input: `{ words: string[], tag?: string }` (e.g. `["perro", "gato"]`, tag `"animals"`). The client splits on commas/newlines and trims before sending.

The function calls the Claude API with:

- A system prompt containing: the entry schema, the rules (Peninsular Spanish; elementary level; `en` is a list of accepted answers with the most natural first; include the feminine form for variable adjectives and the other-gender form and plural for nouns; mark reflexive verbs, regularity, stem changes, irregular _yo_; note false friends, Spain-specific meanings, and _ser_/_estar_ differences in `notes`; set `flagged` when a word is ambiguous or you're unsure of the intended meaning; generate `id` as an ASCII slug), and 5–6 existing entries as examples.
- The list of existing `id`s so duplicates are reported rather than re-created.
- Structured output enforced by the API (tool definition or JSON schema — check https://docs.claude.com/en/api/overview for the current mechanism and model names; don't rely on this document for those).

Output: `{ entries: Entry[], duplicates: string[] }`.

### 6.2 Review step (client)

Never write enriched entries straight into the dictionary. Show them in an editable review list: each field editable, `flagged` entries highlighted with Claude's note, a per-entry Accept/Discard, and an "Accept all" button. On accept, clear `flagged`, set `added` and `addedBy`, insert.

### 6.3 Zero-cost fallback

Two small features so the chat workflow keeps working when the API path is unavailable or Doliver wants nuance help:

- **Copy as prompt** — puts the word list, the tag, and the schema on the clipboard for pasting into a chat with Claude.
- **Import JSON** — a paste box that validates a `Dictionary` (or bare `Entry[]`) and runs it through the same review list.

### 6.4 `/api/sentences` (phase 3)

Input: the ids of words the user knows well (e.g. ease ≥ 2.3 and reps ≥ 2), a count, and a direction. Claude returns short sentences using **only** those words (plus articles, possessives, and basic connectors), each with an accepted-translation list. Grading sentences is looser: normalize, then accept any listed translation; when no match, show the model answer and let the user self-mark (correct / almost / wrong). A later refinement can send the user's attempt back to Claude for grading.

## 7. Screens

1. **Who's practicing?** — name picker (existing names + add a name); remembered in `localStorage`.
2. **Home** — due-today count, quick-start buttons (10 due / recent words / misses), streak.
3. **Quiz** — one prompt at a time; typed input with inline result (correct / hard / wrong + note), or choice buttons, or a flip card; progress bar; summary at the end with misses listed.
4. **Dictionary** — searchable, filter by tag and pos, tap an entry for its detail (forms, notes, your progress in both directions).
5. **Add words** — text box + tag + "Enrich with Claude"; review list; Copy-as-prompt and Import JSON.
6. **Progress** — per-tag mastery, recent misses, session history.
7. **Settings** — switch user, default quiz config, the family passphrase for Claude features.

Mobile-first layout; the quiz screen must be comfortable one-handed on a phone.

## 8. Conventions

- React + TypeScript, strict mode. Function components with plain `interface Props` — **do not use `React.FC`**.
- Styling: plain CSS via CSS modules (`Component.module.css`). No CSS-in-JS, no Tailwind.
- State: keep it simple — React state and context, a small typed client (`api.ts`) over the functions above. Add a fetching/caching library only if it earns its place.
- Validation: zod schemas for `Entry`, `Dictionary`, and function payloads; derive the JSON schema for the Claude structured output from the same zod schema so there is one source of truth.
- Tests: Vitest. Grading/normalization and the scheduler must have thorough unit tests (accent cases, articles, invariable adjectives, reflexive verbs, SM-2 transitions).
- Lint/format: oxlint + oxfmt as provided by Vite+ — do not add ESLint or Prettier.
- Routing: keep it light — `react-router` in library mode or a small hand-rolled route state. No SSR framework.
- Accessibility: proper labels on inputs, keyboard-friendly quiz (Enter submits, Enter again advances), sufficient contrast.
- Sentence case in UI copy; no exclamation marks on system text.

## 9. Phased plan

**Phase 0 — scaffold (small).** Scaffold with `vp create vite:application` (React + TypeScript), single package, not a monorepo; Netlify functions live in `netlify/functions/` alongside the app. CSS modules; types and zod schemas from §3; import script that loads `dictionary.json`; Netlify config; deploy a hello-world to Netlify; the Blobs-backed `dictionary`, `users`, and `progress` functions from §3.4; `.env.example`.

**Phase 1 — MVP drilling.** Name picker; dictionary browse/search; typed quiz with the grading rules from §4; SM-2 scheduler; per-user progress; misses list; end-of-session summary; PWA manifest and install prompt. Ship this to the family.

**Phase 2 — adding words.** `/api/enrich` function with passphrase check and rate limit; Add-words screen with review list; Copy-as-prompt and Import JSON fallbacks; multiple-choice and flashcard formats; mixed sessions; progress screen.

**Phase 3 — sentences and verbs.** `/api/sentences`; sentence quiz with self-marking; conjugation drills driven by `verb` metadata (present tense first); optional FSRS; offline quiz with sync.

Deliver each phase as working, deployed software before starting the next. Ask before adding dependencies beyond the obvious (react, zod, @netlify/blobs, @netlify/functions, vitest).

## 10. Open decisions — confirm with Doliver before scaffolding

1. **Shared dictionary vs per-user lists.** Plan assumes one shared pool with tags; confirm that matches how the family will use it.
2. **Repo name and hosting details** — Netlify site name, custom domain or not.
3. **Seed file timing** — Doliver will export `dictionary.json` from the chat once the schema is agreed; the import script should exist by then.
