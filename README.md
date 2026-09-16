# Spanish vocab

A vocabulary drilling app for an elementary Peninsular Spanish class. One shared dictionary for the
family, per-person spaced-repetition progress, and typed quizzes that grade the way a teacher would —
accepting the feminine form, noticing a missing accent, insisting on the article.

Dictionary entries are authored **outside** the app — Claude Code writes them into
`data/dictionary.json` following [DICTIONARY_BRIEF.md](DICTIONARY_BRIEF.md), and a deploy ships
them, since the file is bundled into the app. The app itself does the dictionary, the scheduling, and the
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
  session.ts        picks the cards for a quiz (and matching rounds), and which english gloss to prompt with
  choices.ts        the options for a multiple-choice card
  random.ts         seedable shuffle
  sentences/        sentence frames: renderer and checks (frames.ts), gaps (gap.ts), mistakes
                    (mistake.ts), Spanish verb forms (conjugate.ts), English inflection (english.ts)
  dates.ts          ISO calendar-date maths in whole local days
  slug.ts           stable entry ids
src/
  api.ts          typed client over the functions; validates every response
  app/            store (context + data loading), the bundled dictionary, and the shell
  screens/        one file per screen, each with a CSS module beside it
    quiz/           one component per exercise (typed and gaps, multiple choice, matching, spot the
                    mistake), and the list of them
                    (exercises.ts) the home screen offers; QuizScreen runs the session
netlify/
  functions/      the /api routes: users and progress
  lib/            code shared between functions
scripts/
  validate-dictionary.ts   schema check with warnings, exits non-zero on error; gates the build
  validate-frames.ts       frame and glue checks against the dictionary; gates the build
  render-frames.ts         prints sample sentences from every frame, for reading through
data/
  dictionary.json          the dictionary, bundled into the app at build time
  frames.json              sentence frames
  glue.json                function words and phrases (clock times) sentences may use
```

### Sessions and the on-screen keyboard

Every exercise runs inside `src/app/SessionShell.tsx`, which is sized to the **visual viewport**
(`useVisualViewport.ts`), not the page. iOS Safari does not resize the layout when the keyboard opens
and ignores the `interactive-widget` viewport hint, so anything laid out against `100dvh` ends up
behind the keyboard. The shell is fixed to the visible area instead: header at the top, the action
button directly above the keyboard, and the question between them, scrolling only if it cannot fit.
It also locks document scrolling while open, so iOS has nothing to scroll when it reveals the input.

The shell is a CSS size container named `session`; exercises compact themselves with
`@container session (max-height: …)` rather than media queries, which only see the full screen.

A session is only built once the learner's progress has loaded (`progressLoaded` in the store).
Building it earlier — a reload on the quiz page — would treat every word as never practiced and
freeze that into the session.

`src/lib` deliberately has no React or network code in it. The grading and scheduling rules are the
part of this app most worth getting right, so they are pure functions with tests rather than logic
tangled into components.

## Screens

- **Who's practicing** — name picker, plus a field to add a name. The choice is remembered in
  `localStorage`; a name that no longer exists on the server is ignored.
- **Home** — **Practice**, plus **Focus on new words** and **Remediation** (words last answered
  wrong), each shown only when it holds something. Each of those is a **mixed** session that moves
  between the exercises. A folded **Choose exercise** list starts the same kind of session using one
  exercise only; it names only exercises that exist. Layout and labels follow design option B2.
- **Quiz** — one prompt at a time, typed answer, inline verdict, progress bar, and a summary
  listing what to look at again. Nouns are prompted with "include the article". A session is full
  screen with no main nav; the × in the header ends it (every answer is already saved). The header
  names the exercise for a single-exercise session, or the home row it came from for a mixed one.
  The summary adds a score per exercise when the session used more than one.
- **Multiple choice** — the same session with four options; touching one answers it, with no
  separate Check. A right answer moves on by itself, a miss waits for Next. Keys a–d or 1–4 answer
  and Enter moves on, on a computer. A wrong pick says what the picked word means. Started from
  Choose exercise on the home screen, or by URL: `/quiz?exercise=choice` (combines with `scope` and
  `tag`).
- **Match pairs** — rounds of six: Spanish in one column, English in the other, each shuffled. Tap
  a tile on either side, then its partner; a right pair locks, a wrong one flashes red and clears.
  Chosen by name it is three rounds. A round draws from one tag where it can and never holds two
  interchangeable words (a shared English gloss or headword). A word matched without ever being in
  a wrong pair is a correct **recognition** answer; both words of a wrong pair count as missed.
- **Fill the gap** — the English sentence as a cue, the Spanish with one to three words blanked;
  type each word in the form the sentence needs. Enter writes into the current blank and moves to the
  next, a tap on a blank goes back to it, and Check grades them all. Shares the typed card's input, so the keyboard stays up
  between typed cards and gaps. See [Filling a gap](#filling-a-gap).
- **Spot the mistake** — the English sentence as a cue, the Spanish with exactly one word broken.
  Tap the broken word, then type what it should be. Tapping a word that is fine ends the card as a
  miss and shows the mistake. See [Spotting a mistake](#spotting-a-mistake).
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

There is no way to add words from inside the app — that is deliberate. New words are written into
`data/dictionary.json` by Claude Code in this repo, following
[DICTIONARY_BRIEF.md](DICTIONARY_BRIEF.md). This keeps the dictionary version controlled and reviewable, and it means
the deployed site has no endpoint that writes words at all.

### Adding words

1. Give Claude Code the class list, in the form used so far:

   ```
   INPUT - character traits
   dormilón/ona, sano/a, perezoso/a, trabajador/a, deportista, intelectual
   ```

   The header names the section, which becomes the tag; `/a` shorthand gives the feminine form. It
   writes the entries, runs the checks below plus ones the validator cannot do (English glosses
   shared with existing words, headwords one letter apart, sample answers through the grader), and
   marks anything it had to guess as `flagged`.

2. Resolve anything marked `flagged` — check the spelling or sense against the class list,
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

## Sentence frames

Sentence exercises draw on `data/frames.json`: hand-written sentence patterns whose slots are filled
from the dictionary. The frame supplies the word order in both languages; the renderer
(`src/lib/sentences/frames.ts`) supplies only what the dictionary data makes reliable:

```json
{
  "id": "family-is-trait",
  "es": "Mi {n} es {a}.",
  "en": "My {n} is {a}.",
  "slots": {
    "n": { "kind": "noun", "tags": ["family"], "number": "sg", "exclude": ["mujer"] },
    "a": { "kind": "adj", "tags": ["physical-traits", "character-traits"], "agree": "n" }
  },
  "cloze": ["a", "n"]
}
```

- **Slots** select entries by `tags`, `ids` and `exclude`. Kinds: `noun` (with `number`, and `agree`
  to take another noun's gender — _Mi hermana es enfermera_), `adj` (agrees with a noun slot), `verb`
  (`subject` is a fixed person, `"@"` for the frame's `subjects`, or a noun slot), `word` (adverbs,
  phrases, numbers as-is) and `glue` (a group in `data/glue.json`).
- **Placeholders**: `{slot}`, plus `{slot:el}` / `{slot:un}` for a Spanish article and `{slot:the}` /
  `{slot:a}` for an English one; `{S}` is the subject pronoun. `vosotros` renders as "you (plural)".
- **The renderer handles** gender and number agreement, verb forms (stored forms, then regular
  endings, then a multi-word verb's first word through its own entry), articles, `a el → al` /
  `de el → del`, `y → e` before an _i_ sound, English third-person _-s_ and irregulars, _one's_ →
  _his/her/..._, English plurals and _a/an_. A person noun is put in the feminine only if it has
  `enF`, the English for its feminine form.
- **Words whose English is a noun** (_comilón_ "big eater", _dormilón_ "sleepyhead") are excluded
  from trait frames: "My son is very big eater" is what including them produces.
- **Word pairings are the frame's job.** Routines are split by time of day so morning activities get
  morning times — without that the renderer happily produces _desayunamos por la tarde_.

```sh
vp run validate:frames                     # schema, placeholders, vocabulary, every slot fillable
vp run render:frames -- --per 12           # sample sentences from every frame
vp run render:frames -- --frame days-routine --per 40
```

The validator catches structural problems; only reading `render:frames` output catches sentences
that are grammatical but odd. Read it whenever frames change **or words are added**, since new
words in a tag flow straight into the frames that draw on it.

## Filling a gap

`src/lib/sentences/gap.ts`. A gap is aimed at a word: the planner walks the session's priority
order, takes the first word some frame can blank (`frame.cloze`), and renders that frame with the
word pinned in the slot. So a gap usually reviews a word that is due.

- **Sentences only use practiced words** — any word with a progress row, plus words kept out of
  drilling (numbers). Gaps appear only once `MIN_SENTENCE_WORDS` (15) drillable words have been
  practiced; before that "Fill the gap" explains why it is empty.
- **Several blanks**: a gap gets 1 blank half the time, 2 most of the rest, 3 occasionally
  (`BLANK_ODDS`), limited by how many slots the frame lists in `cloze`. The first blank is the word
  the gap was aimed at; the others are further practiced words in the sentence not already used this
  session. Each blank is its own card (`blankCards`), graded and scheduled on its own, and each counts
  as a word toward the session size.
- **Scheduling**: a gap is always answered in Spanish, so every blank schedules its word's `en→es`
  card as a typed (**recall**) answer, whichever direction the session balanced it to.
- **Grading** (`gradeGap`): the form the sentence needs is correct, and so is the same slot filled
  with any word sharing its English (_almuerzo_ for "I have lunch" where the sentence used _comer_).
  Only an accent wrong is `hard`. **The right word in the wrong form is `wrong`**, since agreement and
  conjugation are what a gap tests, with a note naming the rule: "madre is feminine, so tímida", "for
  nosotros it is comemos". Another dictionary word is `wrong` too (_padre_ for _madre_ is one letter
  away but a different word). A one-letter slip otherwise is `hard`, except at the end of a noun or
  adjective, where gender and number live. Each blank is graded against the sentence as shown, never
  against what was typed in the other blanks.

## Spotting a mistake

`src/lib/sentences/mistake.ts`. Like a gap, a mistake is aimed at a practiced, due word: the frame is
rendered with that word pinned in a slot, and then **that slot** is broken in one of four ways, each
only when the result really reads differently:

| Kind                   | Example                          | Explanation shown                                        |
| ---------------------- | -------------------------------- | -------------------------------------------------------- |
| agreement (adjective)  | _Mi madre es tímido._            | madre is feminine singular, so tímida                    |
| number (adjective)     | _Mis nietos son perezoso._       | nietos is masculine plural, so perezosos                 |
| agreement (profession) | _Mi mujer es diseñador de moda._ | it describes mujer, who is female, so diseñadora de moda |
| person (verb)          | _Mi primo os vestís a las seis._ | for primo it is se viste                                 |
| article                | _Trabaja en una hospital._       | hospital is masculine: un hospital                       |

Article swaps are never made on a common-gender noun (_la estudiante_ is fine) or on a contracted
_al_/_del_, which has no article left to swap. The English cue is always shown: without it a verb in
the wrong person can still be a grammatical sentence (_Vamos al trabajo_ for "I go to work").

- **Tapping**: any word of the broken text finds it, including every word of a phrase (_os vestís_).
- **The fix** (`gradeFix`): the corrected text, or just the one word that changed when only one did
  (_hacemos_ for _hacemos la cama_). Only an accent wrong is `hard`; typing the mistake back is
  `wrong` with its own note.
- **Scheduling**: the broken word's `en→es` card, as a **recognition** answer — correcting a form
  that is put in front of you is easier than producing it, so it is held to the 7-day limit.

## Status

Phase 1 is complete. Working and deployed at
[vlc-spanish.netlify.app](https://vlc-spanish.netlify.app):

- The dictionary, bundled into the app from `data/dictionary.json`
- Users and per-person progress, stored in Netlify Blobs behind two functions
- Typed quizzes with SM-2 scheduling, graded per the rules below
- Dictionary browse and search, name picker, user switching
- Installable PWA with offline caching of the app shell, which includes the dictionary

The first release of Phase 2 is built (not yet deployed at the time of writing):

- Three exercises — Type it, Pick one (multiple choice), Match pairs — and mixed sessions across them
- Recognition answers (multiple choice, matching) scheduled more gently than typed recall
- A session frame sized to the space above the on-screen keyboard
- The B2 home screen: Practice, Focus on new words, Remediation, Choose exercise
- A per-exercise score in the summary of a mixed session
- Sentence frames (31, about 25,000 sentences), **Fill the gap** (one to three blanks) and **Spot
  the mistake**, in Practice and Choose exercise

Phase 2 continues with **Translate** (a whole English sentence into Spanish, graded word by word with
a self-mark fallback) and possibly **Answer a question** (cued Q&A). Sentences go straight
into Practice once built. Frames were chosen over a fixed sentence bank, which repeats too often, and
over fully type-driven templates, which produce wrong English and odd combinations.

Not built, in rough order of likely usefulness:

- Flashcards (parked: unclear how they fit alongside the Dictionary tab)
- A progress screen: per-tag mastery, recent misses, session history
- Conjugation drills driven by the `verb` metadata already in the dictionary (needs no API)
- Offline answer queueing — quizzes read from cache offline, but results are not yet synced back

## Mixed sessions

A session started from Practice or a narrowing is built by `buildMixedSession` in
`src/lib/session.ts`: 15 words by default, still taken in priority order (due, then new, then the
rest), with only the way each is asked varying. Each step picks an exercise by weight — typed 3,
multiple choice 2, a matching round 1 — with three rules on top:

- **No more than three of one exercise in a row** (`MAX_RUN`), so the pace keeps changing.
- **Typed cards are nudged into short runs.** Every switch between typing and tapping drops or
  raises the phone keyboard; alternating one card at a time would have it bouncing all session. On
  iOS a typed card that follows a tap exercise may need a tap on the answer line to bring the
  keyboard back, because iOS only opens it from a user gesture.
- **Spot the mistake joins too** (weight 1) once sentences are possible.
- **Gaps join once they are possible** (weight 2, nudged into runs with typed cards since both
  use the keyboard) — see [Filling a gap](#filling-a-gap).
- **A matching round needs room**: at least six words left in the session and at least four words
  that can share a round. Otherwise the planner stops offering rounds for that session.

Directions are balanced across the whole session at once, then multiple-choice options are chosen.

## Multiple choice

`choices.ts` picks three distractors for each card. A good one is a word the learner could actually
confuse with the answer, so candidates are ranked: same part of speech, then a shared tag, then (for
nouns) the same gender and number so the article cannot give it away, then words already practiced.
Ties are shuffled, so the same question gets different distractors across sessions.

Some words are never offered, because they would make a second right answer: anything sharing an
English gloss with the answer (`ser` for `estar`) or sharing its headword (`deportista` the adjective
for the noun). Numbers are kept out of ordinary questions, and a number asked by name gets number
distractors. Two options never read the same.

A correct pick is a **recognition** answer for the scheduler (see below), a wrong one lapses the card.

## Grading rules

Worth knowing before you change `grade.ts`, because the tests encode all of it:

- **en→es**: the feminine or plural of the headword is accepted as correct. A missing accent is
  `hard` ("almost — check the accent"), and a `ñ` written as `n` is called out as its own case.
  Nouns are expected with their article; a missing article is `hard`, a wrong one is `wrong`, since
  the article is how gender gets tested. A common-gender noun (`gender: "mf"`) accepts either
  article and is shown as `el/la estudiante`. A noun whose headword is itself plural
  (`number: "pl"`, as in `los hermanos` for siblings) takes `los`/`las`. A noun's `article` field relaxes this for words Spanish
  uses bare: `"none"` for months (answer shown as `enero`) and `"optional"` for days (shown as
  `el lunes`). Either way the article is accepted but not asked for, and a wrong one is only `hard`. An other-gender noun (`abuela` for `abuelo`) or a conjugated
  verb (`me acuesto` for `acostarse`) is accepted but downgraded to `hard` rather than silently
  passing — they are different words than the prompt asked for.
- **es→en**: a leading `to` or `the/a/an` is stripped before comparing, and any gloss listed in the
  entry's `en` array counts. So does a gloss of any other entry with the same headword: the prompt shows only
  `deportista`, so `sporty` (the adjective) and `athlete` (the noun) are both right on either card.

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
session builder prefers a gloss no other entry uses. Where none exists, the entry's `hint` is shown
beside the grammar line (`verb · identity, traits, origin`) so the prompt says which word it wants,
and the rival entries are passed to `grade()` so answering `estar` for `ser` explains the difference
instead of just failing. The validator warns about any entry with no gloss of its own and no hint.

Three results feed the scheduler: `correct` advances normally, `hard` advances with reduced ease,
`wrong` lapses the card to tomorrow. Answers also carry a strength. Typing is **recall**; picking the
word out of a set (multiple choice, matching) is **recognition**, which is weaker evidence, so a
correct recognition answer leaves ease alone and can never schedule a word more than
`RECOGNITION_MAX_INTERVAL` (7) days out. It never shortens an interval already earned by recall, and a
wrong recognition answer lapses the card like any other. A correct answer auto-advances after `CORRECT_PAUSE_MS`
(550ms); anything else waits for the button, because there is something to read.

## Deploying

Hosted on Netlify at `vlc-spanish.netlify.app`, deployed from the GitHub repo. The site name is a
property of the Netlify site, not something in `netlify.toml` — it is set at creation
(`netlify sites:create --name vlc-spanish`) or in the Netlify UI.

There are no environment variables to set: the app calls no paid APIs and holds no secrets. For
local development see [Develop on :8888](#develop-on-8888-not-5173).
