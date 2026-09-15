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
vp run validate:dictionary  # validate data/dictionary.json against the schema
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
`ANTHROPIC_API_KEY` is used only inside functions and must never reach the client.
