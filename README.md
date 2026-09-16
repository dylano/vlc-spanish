# Spanish vocab

A vocabulary drilling app for an elementary Peninsular Spanish class. One shared dictionary for the
family, per-person spaced-repetition progress, and typed quizzes that grade the way a teacher would —
accepting the feminine form, noticing a missing accent, insisting on the article.

Dictionary entries are authored **outside** the app — a Claude chat agent follows
[DICTIONARY_BRIEF.md](DICTIONARY_BRIEF.md), the entries go into `data/dictionary.json`, and a
deploy ships them — the file is bundled into the app. The app itself does the dictionary, the scheduling, and the
drilling, and never calls the Claude API. That is a deliberate decision (see
[Working on the dictionary](#working-on-the-dictionary)): it means no API key, no billing, and no
public endpoint that can spend money.

See [PLAN.md](PLAN.md) for the original spec. Where this README and PLAN.md disagree, this README is
current — notably PLAN.md §6 describes an in-app "add words" flow that is not being built.

## Stack

- **Vite+** (`vp`) — dev server, build, test, lint, format. Not plain Vite; see [AGENTS.md](AGENTS.md).
- **React 19 + TypeScript**, strict mode, React Compiler enabled
- **react-router** in declarative mode
- **zod** as the single source of truth for data shapes — runtime validation and TS types both
  derive from `src/lib/schema.ts`
- **Netlify Functions + Netlify Blobs** for the shared store
- Plain CSS with CSS modules. No Tailwind, no CSS-in-JS.

## Commands

```sh
netlify dev                 # THE ONE TO USE: app + functions + local Blobs, on :8888
vp test                     # run tests once
vp test watch               # watch mode
vp check --fix              # format, lint, and type check
vp build                    # production build to dist/
```

Run `vp install` after pulling. `vp check` and `vp test` should both pass before committing.

### Develop on :8888, not :5173

`netlify dev` is the only way to run the whole app locally. It starts (or adopts) the Vite server on
:5173 and puts the functions in front of it on **:8888**.

Opening **:5173** directly gives you the frontend with no `/api/*` routes. That fails in a confusing
way rather than an obvious one: Vite's SPA fallback answers `/api/users` with **200 and the
index.html page**, not a 404, so the app receives a web page where it expects JSON. The app shows a
red "could not load your words" banner saying the server returned a page instead of data. If you see
that, you are on the wrong port.

Hot reloading works normally through :8888. If you stop the :5173 server while `netlify dev` is
running, :8888 loses its frontend — restart both, or let `netlify dev` start Vite itself.

The same gap applies to `vp preview`, which serves the built assets with no functions.

## Layout

```
src/lib/          pure logic, no React, thoroughly tested
  schema.ts         zod schemas and types for Entry, Dictionary, Progress, User
  normalize.ts      text folding: case, accents, articles, "tímido/a" shorthand
  grade.ts          answer grading in both directions
  scheduler.ts      SM-2 spaced repetition behind a swappable Scheduler interface
  session.ts        picks the cards for a quiz, and which english gloss to prompt with
  dates.ts          ISO calendar-date maths in whole local days
  slug.ts           stable entry ids
src/
  api.ts          typed client over the functions; validates every response
  app/            store (context + data loading), the bundled dictionary, and the shell
  screens/        one file per screen, each with a CSS module beside it
netlify/
  functions/      the /api routes: users and progress
  lib/            code shared between functions
scripts/
  validate-dictionary.ts   schema check with warnings, exits non-zero on error; gates the build
data/
  dictionary.json          the dictionary, bundled into the app at build time
```

`src/lib` deliberately has no React or network code in it. The grading and scheduling rules are the
part of this app most worth getting right, so they are pure functions with tests rather than logic
tangled into components.

## Screens

- **Who's practicing** — name picker, plus a field to add a name. The choice is remembered in
  `localStorage`; a name that no longer exists on the server is ignored.
- **Home** — due / new / total counts (per word, see [Data](#data)) and three quick starts.
- **Quiz** — one prompt at a time, typed answer, inline verdict, progress bar, and a summary
  listing what to look at again. Nouns are prompted with "include the article".
- **Dictionary** — search both languages (accent-insensitive, so `timido` finds `tímido`), filter
  by tag, read the notes.
- **Settings** — switch user.

## Data

One shared dictionary, tagged by class section. Progress is per person, per entry, and per direction
(`en→es` and `es→en` are separate cards, and a word is normally practiced in one direction before
the other). Identity is a name picked from a list — no passwords, no email. The dictionary ships
with the app; users and progress live in Netlify Blobs as a handful of JSON blobs.

Shared blobs are written with ETag conditional writes (read → merge → write, retry on mismatch) so
two people writing at once cannot clobber each other. One trap worth knowing: **the local
`netlify dev` Blobs store returns no ETags at all**, while production does. Code that treats a
missing ETag as "the blob does not exist" will write with `onlyIfNew`, fail forever against an
existing blob, and work fine in production while being broken locally. `netlify/lib/store.mts`
tracks existence separately for this reason, and there is a regression test for it.

Progress is written once per session rather than after every card.

**Numbers are in the dictionary but not in the drill.** They were a third of the entries, which
crowded out the words that carry meaning, so `isDrillable` in `src/lib/session.ts` holds back
anything tagged `numbers`. They are still searchable in the dictionary, and a session that asks for
that tag by name (`/quiz?tag=numbers`) still serves them. The home-screen counts apply the same
predicate — a count that includes words no session will offer promises practice the app cannot
deliver.

**Words versus cards.** A 159-word dictionary holds up to 318 cards, because each word is scheduled
separately in each direction. The home-screen totals are deliberately counted **per word**
(`src/lib/counts.ts`): a word counts as new only when it has been practiced in neither direction,
and as due when either direction is ready. That matches what a session serves, since a mixed session
asks each word at most once. Counting cards instead produces totals that exceed the dictionary size
and a "new" count that ignores words drilled spanish → english.

## Working on the dictionary

`data/dictionary.json` is the source of truth, it lives in git, and it is **bundled into the app at
build time** (`src/app/dictionary.ts`). There is no copy of it in Netlify Blobs and no import step:
publishing words means committing the file and pushing, and the Netlify deploy ships them.

There is no way to add words from inside the app — that is deliberate. New words come from a Claude
chat agent following [DICTIONARY_BRIEF.md](DICTIONARY_BRIEF.md) and get pasted into
`data/dictionary.json`. This keeps the dictionary version controlled and reviewable, and it means
the deployed site has no endpoint that writes words at all.

### Adding words

1. Paste the new entries into the `entries` array in `data/dictionary.json`.
2. Resolve anything the agent marked `flagged` — check the spelling or sense against the class list,
   then delete the `flagged` field. Fix spellings **before** committing: `id` is derived from the
   headword, and progress is keyed by `id`.
3. Validate:

   ```sh
   vp run validate:dictionary
   ```

   Errors fail it; warnings (flagged entries, ids that are not the slug of the headword, a verb with
   no "to …" gloss) are for you to read. The same script runs first in the Netlify build, so a file
   that does not validate fails the deploy rather than reaching the app. `vp test` also parses the
   bundled file.

4. Optionally check them in `netlify dev` — a restart is not needed, the file hot-reloads.
5. Commit and push. The words are live when the deploy finishes.

### Deleting or renaming

Edit or remove the entry and deploy; the file replaces the old dictionary wholesale. Progress is
keyed by entry id and stored separately, so **changing an id orphans that word's progress** — the
word starts again as new. Orphaned progress rows are harmless and ignored when scheduling. Correcting
the `es` text without touching the `id` keeps progress intact, at the cost of an id that no longer
matches the headword (the validator warns).

### Why not Blobs

Until September 2026 the dictionary lived in Netlify Blobs, pushed there by an import script through
an unauthenticated `POST /api/entries`. That design came from the original plan for in-app word
adding. Once words were only ever authored in git, the Blobs copy was a second source of truth kept
in sync by hand, with a public write path and a `--url` flag that silently imported into the local
store if you forgot it. A stale `dictionary` key may still exist in the production `vocab` store; the
app no longer reads it (`netlify blobs:delete vocab dictionary` removes it).

## Status

Phase 1 is complete. Working and deployed at
[vlc-spanish.netlify.app](https://vlc-spanish.netlify.app):

- The dictionary, bundled into the app from `data/dictionary.json`
- Users and per-person progress, stored in Netlify Blobs behind two functions
- Typed quizzes with SM-2 scheduling, graded per the rules below
- Dictionary browse and search, name picker, user switching
- Installable PWA with offline caching of the app shell, which includes the dictionary

Not built, in rough order of likely usefulness:

- Multiple-choice and flashcard formats; mixed-format sessions
- **A quiz layout that survives the on-screen keyboard.** The keyboard now stays up for a whole
  session, which is what you want — but it halves the usable height, and the screen is currently
  laid out for the full viewport with the button pinned to the bottom. Worth solving alongside the
  new formats rather than patching the typed screen alone. iOS Safari does not support the viewport
  `interactive-widget` hint, so the layout cannot rely on being resized.
- A progress screen: per-tag mastery, recent misses, session history
- Conjugation drills driven by the `verb` metadata already in the dictionary (needs no API)
- Offline answer queueing — quizzes read from cache offline, but results are not yet synced back

## Grading rules

Worth knowing before you change `grade.ts`, because the tests encode all of it:

- **en→es**: the feminine or plural of the headword is accepted as correct. A missing accent is
  `hard` ("almost — check the accent"), and a `ñ` written as `n` is called out as its own case.
  Nouns are expected with their article; a missing article is `hard`, a wrong one is `wrong`, since
  the article is how gender gets tested. An other-gender noun (`abuela` for `abuelo`) or a conjugated
  verb (`me acuesto` for `acostarse`) is accepted but downgraded to `hard` rather than silently
  passing — they are different words than the prompt asked for.
- **es→en**: a leading `to` or `the/a/an` is stripped before comparing, and any gloss listed in the
  entry's `en` array counts.

When nothing matches, three checks run in order before an answer is called wrong — each exists
because the naive version of the rule gets a real case wrong:

1. **An article-only difference is a gender mistake**, not a slip: `lavarse las dientes` stays
   `wrong`, since gender is the thing being tested.
2. **An answer that is itself another headword is a confusion**, not a typo. The dictionary holds
   six pairs one edit apart — `junio`/`julio`, `padre`/`madre`, `sesenta`/`setenta` — so forgiving
   single-character slips blindly would mark a real mistake as nearly right. The feedback names what
   you actually wrote instead.
3. **Anything else within one edit is a typo** → `hard`, "check the spelling". The distance is
   Damerau-Levenshtein, so a transposition costs one rather than two — swapped letters are the
   commonest slip there is. Exception: an edit to the _last_ letter of a noun or adjective stays
   `wrong`, because Spanish keeps gender and number there, and `inteligenta` is a claim about the
   language rather than a fumbled key.

Some English glosses are claimed by more than one word — `to be` is both `ser` and `estar`. The
session builder prefers a gloss no other entry uses, and where none exists it passes the rival
entries to `grade()` so answering `estar` for `ser` explains the difference instead of just failing.

Three results feed the scheduler: `correct` advances normally, `hard` advances with reduced ease,
`wrong` lapses the card to tomorrow. A correct answer auto-advances after `CORRECT_PAUSE_MS`
(550ms); anything else waits for the button, because there is something to read.

## Deploying

Hosted on Netlify at `vlc-spanish.netlify.app`, deployed from the GitHub repo. The site name is a
property of the Netlify site, not something in `netlify.toml` — it is set at creation
(`netlify sites:create --name vlc-spanish`) or in the Netlify UI.

There are no environment variables to set: the app calls no paid APIs and holds no secrets. For
local development see [Develop on :8888](#develop-on-8888-not-5173).
