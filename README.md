# Spanish vocab

A vocabulary drilling app for an elementary Peninsular Spanish class. One shared dictionary for the
family, per-person spaced-repetition progress, and typed quizzes that grade the way a teacher would —
accepting the feminine form, noticing a missing accent, insisting on the article.

Dictionary entries are authored **outside** the app — a Claude chat agent follows
[DICTIONARY_BRIEF.md](DICTIONARY_BRIEF.md), the entries go into `data/dictionary.json`, and an
import script pushes them live. The app itself does the dictionary, the scheduling, and the
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
way rather than an obvious one: Vite's SPA fallback answers `/api/dictionary` with **200 and the
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
  app/            store (context + data loading) and the shell with its nav
  screens/        one file per screen, each with a CSS module beside it
netlify/
  functions/      the /api routes
  lib/            code shared between functions
scripts/
  validate-dictionary.ts   schema check with warnings, exits non-zero on error
  import-dictionary.ts     file -> live store
  export-dictionary.ts     live store -> file
data/
  dictionary.json          the dictionary
```

`src/lib` deliberately has no React or network code in it. The grading and scheduling rules are the
part of this app most worth getting right, so they are pure functions with tests rather than logic
tangled into components.

## Screens

- **Who's practising** — name picker, plus a field to add a name. The choice is remembered in
  `localStorage`; a name that no longer exists on the server is ignored.
- **Home** — due / new / total counts (per word, see [Data](#data)) and three quick starts.
- **Quiz** — one prompt at a time, typed answer, inline verdict, progress bar, and a summary
  listing what to look at again. Nouns are prompted with "include the article".
- **Dictionary** — search both languages (accent-insensitive, so `timido` finds `tímido`), filter
  by tag, read the notes.
- **Settings** — switch user.

## Data

One shared dictionary, tagged by class section. Progress is per person, per entry, and per direction
(`en→es` and `es→en` are separate cards, and a word is normally practised in one direction before
the other). Identity is a name picked from a list — no passwords, no email. Everything lives in
Netlify Blobs as a handful of JSON blobs.

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
(`src/lib/counts.ts`): a word counts as new only when it has been practised in neither direction,
and as due when either direction is ready. That matches what a session serves, since a mixed session
asks each word at most once. Counting cards instead produces totals that exceed the dictionary size
and a "new" count that ignores words drilled spanish → english.

## Working on the dictionary

`data/dictionary.json` is the source of truth, and it lives in git. The live copy in Netlify Blobs
is what the app reads. They are separate: **editing the file changes nothing in production until you
import it.**

There is no way to add words from inside the app — that is deliberate. New words come from a Claude
chat agent following [DICTIONARY_BRIEF.md](DICTIONARY_BRIEF.md), get pasted into
`data/dictionary.json`, and are imported from a terminal. This keeps the dictionary version
controlled and reviewable, and it means the deployed site has no endpoint that costs money to call.

Three commands, all of which take an optional path and an optional `--url`:

```sh
vp run validate:dictionary            # check the file against the schema
vp run import:dictionary              # file  -> live store   (upsert by id)
vp run export:dictionary              # live store -> file
```

### Propagating hand-edited words to production

After editing `data/dictionary.json` by hand (or dropping in a file from a dictionary-generating
agent):

```sh
vp run validate:dictionary data/dictionary.json
vp run import:dictionary data/dictionary.json --url https://vlc-spanish.netlify.app
```

Validate first — the import re-validates and refuses a bad file, but the validator gives better
errors and adds warnings the import does not. Import is an **upsert by `id`**: entries whose ids
already exist are replaced, new ids are appended, and nothing is ever deleted. That makes it safe to
re-run, and it means you can import a small file containing only the words you changed rather than
the whole dictionary. The output tells you which ids were added versus updated.

`--url` defaults to `http://localhost:8888` (a `netlify dev` session), so **the production url is not
optional — leave it off and you will quietly import into your local store instead.**

### Pulling production back down

Nothing writes words to production except the import script, so the file should already match. Use
export to check that, or to recover the dictionary if the local file is ever lost:

```sh
vp run export:dictionary data/dictionary.json
git diff data/dictionary.json      # review what the family added
```

Export defaults to production, writes sorted and pretty-printed, and validates before writing. The
round trip is lossless: export then import is a no-op.

### Deleting or renaming

Neither script deletes. Because `id` is the primary key, **changing a headword's spelling and
re-importing creates a second entry** rather than renaming the first — the old id is still there.
To genuinely remove or rename an entry: export, edit the file, then overwrite the blob directly with
the Netlify CLI (`netlify blobs:set vocab dictionary --input data/dictionary.json`). Progress is
keyed by entry id and is stored separately, so a deleted word leaves behind orphaned progress rows;
they are harmless and ignored when scheduling.

## Status

Phase 1 is complete. Working and deployed at
[vlc-spanish.netlify.app](https://vlc-spanish.netlify.app):

- The dictionary, users, and per-person progress, stored in Netlify Blobs behind four functions
- Typed quizzes with SM-2 scheduling, graded per the rules below
- Dictionary browse and search, name picker, user switching
- Installable PWA with offline caching of the app shell and dictionary

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
- Sentence practice, which is the one feature that would need the Claude API back

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

Three results feed the scheduler: `correct` advances normally, `hard` advances with reduced ease,
`wrong` lapses the card to tomorrow.

## Deploying

Hosted on Netlify at `vlc-spanish.netlify.app`, deployed from the GitHub repo. The site name is a
property of the Netlify site, not something in `netlify.toml` — it is set at creation
(`netlify sites:create --name vlc-spanish`) or in the Netlify UI.

Environment variables live in Netlify, never in the repo. See `.env.example` for the list.
`ANTHROPIC_API_KEY` is used only inside functions and must never reach the client — do not prefix it
with `VITE_`, which would bundle it into the browser build. `FAMILY_SECRET` gates the Claude-backed
endpoints and exists to protect the API bill rather than the users.

Local development with working functions needs the Netlify CLI:

```sh
netlify dev        # serves the app and the functions together on :8888, with a local Blobs store
```

Plain `vp dev` serves the frontend only; `/api/*` will 404.
