# Spanish vocab

A vocabulary drilling app for an elementary Peninsular Spanish class. One shared dictionary for the
family, per-person spaced-repetition progress, and typed quizzes that grade the way a teacher would —
accepting the feminine form, noticing a missing accent, insisting on the article.

Claude does the thinking (turning a raw word list from class into full dictionary entries); the app
does the dictionary, the scheduling, and the drilling.

See [PLAN.md](PLAN.md) for the full spec and [DICTIONARY_BRIEF.md](DICTIONARY_BRIEF.md) for the
rules a dictionary-generating agent must follow.

## Stack

- **Vite+** (`vp`) — dev server, build, test, lint, format. Not plain Vite; see [AGENTS.md](AGENTS.md).
- **React 19 + TypeScript**, strict mode, React Compiler enabled
- **react-router** for the seven screens
- **zod** as the single source of truth for data shapes — runtime validation, TS types, and the
  JSON schema handed to the Claude API all derive from `src/lib/schema.ts`
- **Netlify Functions + Netlify Blobs** for the shared store and the Claude proxy
- Plain CSS with CSS modules. No Tailwind, no CSS-in-JS.

## Commands

```sh
vp dev                      # dev server (--host, so a phone on the same wifi can reach it)
vp test                     # run tests once
vp test watch               # watch mode
vp check --fix              # format, lint, and type check
vp build                    # production build to dist/
netlify dev                 # app + functions + a local Blobs store, on :8888
```

Run `vp install` after pulling. `vp check` and `vp test` should both pass before committing.

## Layout

```
src/lib/          pure logic, no React, thoroughly tested
  schema.ts         zod schemas and types for Entry, Dictionary, Progress, User
  normalize.ts      text folding: case, accents, articles, "tímido/a" shorthand
  grade.ts          answer grading in both directions
  scheduler.ts      SM-2 spaced repetition behind a swappable Scheduler interface
  dates.ts          ISO calendar-date maths in whole local days
  slug.ts           stable entry ids
netlify/
  functions/      the /api routes
  lib/            code shared between functions
scripts/
  validate-dictionary.ts   schema check with warnings, exits non-zero on error
data/
  dictionary.json          the seed dictionary
```

`src/lib` deliberately has no React or network code in it. The grading and scheduling rules are the
part of this app most worth getting right, so they are pure functions with tests rather than logic
tangled into components.

## Data

One shared dictionary, tagged by class section. Progress is per person, per entry, and per direction
(`en→es` and `es→en` are separate cards). Identity is a name picked from a list — no passwords, no
email. Everything lives in Netlify Blobs as a handful of JSON blobs, with ETag conditional writes so
two people adding words at once cannot clobber each other.

## Working on the dictionary

`data/dictionary.json` is the seed file in git. The live copy lives in Netlify Blobs and is what the
app actually reads. They are separate: **editing the file changes nothing in production until you
import it**, and words added through the app do not appear in the file until you export them.

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

### Pulling production changes back down

Once anyone adds words through the app, production is ahead of the file. Before editing the file
again, pull it down or you will overwrite their additions with a stale copy:

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
