# Spanish vocab

A vocabulary drilling app for an elementary Peninsular Spanish class: one dictionary, spaced-repetition
progress, and quizzes that grade the way a teacher would — accepting the feminine form, noticing a
missing accent, insisting on the article.

It is a **single-user, fully static app**. There is no server and no account: the learner gives a
name on first start, and their progress lives in the browser's local storage on that device.

Dictionary entries are authored **outside** the app — Claude Code writes them into
`data/dictionary.json` following [DICTIONARY_BRIEF.md](DICTIONARY_BRIEF.md), and a deploy ships
them, since the file is bundled into the app. The app itself does the dictionary, the scheduling, and the
drilling, and never calls the Claude API. That is a deliberate decision (see
[Working on the dictionary](#working-on-the-dictionary)): it means no API key, no billing, and no
public endpoint at all.

See [PLAN.md](PLAN.md) for the original spec. Where this README and PLAN.md disagree, this README is
current — notably PLAN.md §6 describes an in-app "add words" flow that is not being built.

## Stack

- **Vite+** (`vp`) — dev server, build, test, lint, format. Not plain Vite; see [AGENTS.md](AGENTS.md).
- **React 19 + TypeScript**, strict mode, React Compiler enabled
- **react-router** in declarative mode
- **zod** as the single source of truth for data shapes — runtime validation and TS types both
  derive from `src/lib/schema.ts`
- **Netlify** static hosting; no functions, no storage
- Plain CSS with CSS modules. No Tailwind, no CSS-in-JS.

## Commands

```sh
vp dev                      # dev server on :5173
vp test                     # run tests once
vp test watch               # watch mode
vp check --fix              # format, lint, and type check
vp build                    # production build to dist/
vp preview                  # serve the production build
```

Run `vp install` after pulling. `vp check` and `vp test` should both pass before committing.

## Layout

```
src/lib/          pure logic, no React, thoroughly tested
  schema.ts         zod schemas and types for Entry, Dictionary, Progress
  normalize.ts      text folding: case, accents, articles, "tímido/a" shorthand
  grade.ts          answer grading in both directions
  scheduler.ts      SM-2 spaced repetition behind a swappable Scheduler interface
  session.ts        picks the cards for a quiz (and matching rounds), and which english gloss to prompt with
  choices.ts        the options for a multiple-choice card
  random.ts         seedable shuffle
  sentences/        sentence frames: renderer and checks (frames.ts), gaps (gap.ts), mistakes
                    (mistake.ts), translations (translate.ts), Spanish verb forms (conjugate.ts),
                    English inflection (english.ts)
  dates.ts          ISO calendar-date maths in whole local days
  slug.ts           stable entry ids
src/
  app/            store (context), local storage (local.ts), the bundled dictionary and sentence
                  data, and the shells
  screens/        one file per screen, each with a CSS module beside it
    quiz/           one component per exercise (typed and gaps, multiple choice, matching, spot the
                    mistake, translate), and the list of them
                    (exercises.ts) the home screen offers; QuizScreen runs the session
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

A session is built from progress once, when the quiz screen opens, and kept fixed while it runs.
Progress is read from local storage synchronously on first render, so a session can never start from
empty progress by mistake.

`src/lib` deliberately has no React or network code in it. The grading and scheduling rules are the
part of this app most worth getting right, so they are pure functions with tests rather than logic
tangled into components.

## Screens

- **Welcome** — first start only: asks for a name, which the home screen greets.
- **Home** — **General practice**, plus **Focus on new words** and **Focus on problem words** (words
  last answered wrong), each shown only when it holds something. Each of those is a **mixed** session
  that moves between the exercises. Below them, set well apart and styled as a small toggle rather
  than a fourth row — it changes how words are asked, not which — **Select specific exercise mode**
  unfolds the list of exercises; each starts the same kind of session using that exercise only. The
  list names only exercises that exist.
- **Quiz** — one prompt at a time, typed answer, inline verdict, progress bar, and a summary
  listing what to look at again. Nouns are prompted with "include the article". A session is full
  screen with no main nav; the × in the header ends it (every answer is already saved). The header
  names the current exercise in the accent colour. The progress bar and the "4 of 15" counter count
  **words**, not steps — a matching round advances it by four and a two-blank gap by two — so a
  Practice session always reads 15; counting steps made the same session anywhere from 4 to 15 long.
  Each card opens with a bold instruction line ("Type the missing word", "Find the wrong word") — in a mixed session the exercise changes
  from card to card, and a muted label was too easy to miss.
  Exercise names, grouped as on the home screen: Words — **Translate** (typed), **Multiple Choice**,
  **Match Pairs**; Sentences — **Translate**, **Fill in the Blank**, **Find the Mistake**. Both groups
  have a Translate; the prompt (one word or a sentence) tells them apart.
  The summary adds a score per exercise when the session used more than one.
- **Multiple Choice** — the same session with four options; touching one answers it, with no
  separate Check. A right answer moves on by itself, a miss waits for Next. Keys a–d or 1–4 answer
  and Enter moves on, on a computer. A wrong pick says what the picked word means. Started from
  Select specific exercise mode on the home screen, or by URL: `/quiz?exercise=choice` (combines with `scope` and
  `tag`).
- **Match Pairs** — rounds of four: Spanish in one column, English in the other, each shuffled. Tap
  a tile on either side, then its partner; a right pair locks, a wrong one flashes red and clears.
  Chosen by name it is four rounds. Rounds were six pairs until that felt tedious to finish. A round draws from one tag where it can and never holds two
  interchangeable words (a shared English gloss or headword). A word matched without ever being in
  a wrong pair is a correct **recognition** answer; both words of a wrong pair count as missed.
- **Fill in the Blank** — the English sentence as a cue, the Spanish with one to three words blanked;
  type each word in the form the sentence needs. Enter writes into the current blank and moves to the
  next, a tap on a blank goes back to it, and Check grades them all. Shares the typed card's input, so the keyboard stays up
  between typed cards and gaps. See [Filling a gap](#filling-a-gap).
- **Find the Mistake** — the English sentence as a cue, the Spanish with exactly one word broken.
  Tap the broken word, then type what it should be. Tapping a word that is fine ends the card as a
  miss and shows the mistake. See [Spotting a mistake](#spotting-a-mistake).
- **Translate** — an English sentence to put into Spanish. **Not graded**: a sentence has too many
  valid translations to mark one wrong, so after Submit the learner's version and the sentence it was
  rendered from ("One way to say it") sit one above the other to compare by eye. The one verdict it gives
  is **Correct** for an exact match with that version, ignoring capitals, spacing and the closing
  full stop but not accents (`matchesTranslation`), and then only the learner's version is shown, since
  the model would repeat it; anything else gets no verdict, since it may be
  just as right. Nothing is
  scheduled, and the summary counts these as "translated" apart from the score. Enter submits.
- **Dictionary** — search both languages (accent-insensitive, so `timido` finds `tímido`), filter
  by tag, read the notes. The tags fold behind a small-caps **Categories** toggle (option 2 on the
  "Dictionary Category Filter" canvas): wrapped in full they took seven rows and pushed the results
  behind the phone keyboard. Picking one folds the grid away and shows the tag as a pill with an ×
  beside the toggle, which clears it. Search (`src/lib/search.ts`) matches any form a learner might type: the
  feminine and plural (`hermana`, `zapatos`, `estas`), every present-tense verb form (`prefiero`), and
  the English for those (`sister`, `these`). A leading article is ignored (`la mesa`, `the table`), as
  are apostrophes; `ñ` stays distinct from `n`. Exact matches come first, then words starting with
  the query, then any containing it. Forms the card does not show (a feminine, a plural, a conjugation)
  match only whole or from the start of a word, and verb forms are indexed without their reflexive
  pronoun, so `nos` does not list every reflexive verb or every plural ending in -nos.
- **Settings** — your name (editable) and how much you have practiced. No other users, no switching.
  A quiet footer shows the **version**: the commit the build came from (`COMMIT_REF` on Netlify, `git
rev-parse` locally, marked "+ local changes" when the tree is dirty), injected as `__COMMIT__` by
  `define` in `vite.config.ts`.

## Data

The dictionary ships with the app (see [Working on the dictionary](#working-on-the-dictionary)).
Everything else lives in the browser's **local storage** (`src/app/local.ts`), under two keys:

- `vlc-spanish:name` — the name given on first start.
- `vlc-spanish:progress` — one scheduling record per entry per direction (`en→es` and `es→en` are
  separate cards, and a word is normally practiced in one direction before the other). It is saved
  whenever an answer is recorded, so leaving mid-session loses nothing.

The progress records still carry a `userId`, from when the app had several users on a server; it is
always `"me"` (`LOCAL_USER`), which keeps the schema valid without a migration.

What local storage means in practice:

- **Progress belongs to one browser on one device.** A phone and a laptop are separate learners.
- **Browsers may clear it.** Safari deletes storage for sites not visited in seven days unless the app
  is installed to the home screen. The app asks for persistent storage on start
  (`navigator.storage.persist()`), which browsers are free to refuse.
- **Unreadable data starts empty** rather than breaking the app, as does blocked storage (private
  windows): the session still works, it is just not remembered.

Until September 2026 users and progress lived in Netlify Blobs behind two unauthenticated
functions. They were removed to make the app single-user with nothing stored remotely; production
progress was deliberately not migrated.

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

   The header names the section, which becomes the tag; `/a` shorthand gives the feminine form.
   **A header that is not an existing tag is checked against the tags there are first**: if it looks
   like the same section under another name ("jobs" for `professions`, "routine" for
   `daily-activities`) or overlaps one, Claude Code asks whether to use the existing tag before
   writing anything. Section names drift from class to class, and two tags for one topic would split
   its words across the Dictionary filter, matching rounds and sentence frames. It
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

4. Optionally check them in `vp dev` — a restart is not needed, the file hot-reloads.
5. Commit and push. The words are live when the deploy finishes.

### Deleting or renaming

Edit or remove the entry and deploy; the file replaces the old dictionary wholesale. Progress is
keyed by entry id and stored on each device, so **changing an id orphans that word's progress** — the
word starts again as new. Orphaned progress rows are harmless and ignored when scheduling. Correcting
the `es` text without touching the `id` keeps progress intact, at the cost of an id that no longer
matches the headword (the validator warns).

### Why not Blobs

Until September 2026 the dictionary lived in Netlify Blobs, pushed there by an import script through
an unauthenticated `POST /api/entries`. That design came from the original plan for in-app word
adding. Once words were only ever authored in git, the Blobs copy was a second source of truth kept
in sync by hand, with a public write path and a `--url` flag that silently imported into the local
store if you forgot it.

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
  phrases, numbers as-is) and `glue` (a group in `data/glue.json`). A demonstrative is an `adj` slot
  placed before its noun (`{d} {c} es {a}` → _Esta chaqueta es nueva_), so it agrees, can be blanked
  and can be broken by Find the Mistake like any adjective; an adjective's `enPl` gives English that
  changes in the plural (_these_, _those_).
- **Glue words that are also entries** (`muy`, `bastante`, `también`, `cuando`) may fill a slot before
  they are practiced, as they could when they were only glue, so a frame like _Mi tío es {q} alto_
  keeps working for a new learner. A sentence is only ever _aimed_ at a practiced word, though, and
  only practiced words are blanked, so a glue word is never asked before it has been met.
- **Gustar-type verbs** (`gustar`, `encantar`): a verb slot with `liked` naming the slot of what is
  liked renders the person's pronoun plus the verb agreeing with that thing — _me gustan los zapatos_,
  _le gusta leer_, _a mis padres les encantan_ — while the English stays subject-first (_I like shoes_).
  What is liked is a noun slot or a verb slot with `subject: "inf"`, which renders the infinitive and
  counts as singular. Gap grading treats _me gusta_ for _me gustan_ as wrong (not a near miss) and
  says why; Find the Mistake breaks exactly that agreement.
- **Placeholders**: `{slot}`, plus `{slot:el}` / `{slot:un}` for a Spanish article and `{slot:the}` /
  `{slot:a}` for an English one; `{v:not}` gives a verb's English negative with do-support
  (_don't like_, _doesn't go_, _isn't_) for frames that put _no_ before the Spanish verb; `{S}` is the subject pronoun. `vosotros` renders as "you (plural)".
- **The renderer handles** gender and number agreement, verb forms (stored forms, then regular
  endings, then a multi-word verb's first word through its own entry), articles, `a el → al` /
  `de el → del`, `y → e` before an _i_ sound, English third-person _-s_ and irregulars, _one's_ →
  _his/her/..._, English plurals and _a/an_. A person noun is put in the feminine only if it has
  `enF`, the English for its feminine form. For a person slot whose gender is free, the gender is
  decided first (50/50) and then a word that can take it is chosen; deciding per word let the
  always-masculine plurals (_los padres_, _los abuelos_) tip sentences to about 60% masculine.
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
  drilling (numbers). A sentence exercise is aimed first at a word whose `en→es` card is **due** (a
  sentence is answered in Spanish, so that is the card it reviews), then at any other practiced word,
  the longest unseen first. Without that fallback a new learner saw no sentences until the day after
  their first practice, and none whenever their due words ran out; sentences are the more engaging
  exercises, so waiting a day for them risked the quiz looking too simple to keep at. In a mixed
  session at most `MAX_EARLY_SENTENCES` (4) sentences go to words that are not due, because each takes
  the place of a new word (uncapped, a simulated learner had 31 words practiced after day one instead
  of 43 with the cap, and late in a day up to 9 of 15 words went to early reviews). A right answer on a word
  that is not due leaves its schedule alone — see the scheduler notes. Gaps appear only once `MIN_SENTENCE_WORDS` (15) drillable words have been
  practiced; before that "Fill in the Blank" explains why it is empty.
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
- Progress in local storage (originally users and progress in Netlify Blobs; removed)
- Typed quizzes with SM-2 scheduling, graded per the rules below
- Dictionary browse and search
- Installable PWA with offline caching of the app shell, which includes the dictionary

The first release of Phase 2 is built (not yet deployed at the time of writing):

- Three exercises — Translate (typed), Multiple Choice, Match Pairs — and mixed sessions across them
- Recognition answers (multiple choice, matching) scheduled more gently than typed recall
- A session frame sized to the space above the on-screen keyboard
- The home screen: General practice, Focus on new words, Focus on problem words, and a folded
  Select specific exercise mode
- A per-exercise score in the summary of a mixed session
- Single-user and fully static: name on first start, progress in local storage, no server
- Sentence frames (85, about 33,600 sentences), **Fill in the Blank** (one to three blanks), **Find
  the Mistake** and **Translate** (ungraded), in General practice and Select specific exercise mode

Still open: not repeating a frame within a session, and possibly **Answer a
question** (cued Q&A) or **Odd one out**. Translate was deliberately left ungraded rather than graded
word by word with a self-mark. Sentences go straight
into Practice once built. Frames were chosen over a fixed sentence bank, which repeats too often, and
over fully type-driven templates, which produce wrong English and odd combinations.

Not built, in priority order (set 2026-09-21; flashcards, a progress screen and conjugation drills
were dropped then):

- **Problem words view** (requested 2026-09-21): a list of the words that have given trouble, apart
  from the Focus on problem words session that drills them. The data is already stored per word and
  direction: `lapses` (every miss, ever), `ease` (drops with each miss or near miss) and
  `lastResult`. Ranking by lapses or ease shows the long-term troublemakers; only `lastResult` feeds
  the Focus session, so a word leaves that session on its next right answer but not this list. There
  is no per-answer history (no dates of misses, no wrong answers typed); a "missed recently" view or
  showing what was typed would need a small answer log added to progress.
- **Conjugation table in the Dictionary**: tap a verb entry to see its present tense for every
  person. `verbForm` in `src/lib/sentences/conjugate.ts` already produces each form, stored or by
  rule (requested 2026-09-21)
- **Session size in Settings** (requested 2026-09-21): how many words a session holds, default 15
  (today `DEFAULT_SIZE` in `QuizScreen.tsx`: 15 for mixed sessions, 10 for single exercises, 16 for
  Match Pairs). Stored per device in local storage. To decide: whether one setting drives all of them
  or only General practice, and the caps that assume 15 (`MAX_PER_SESSION`, `MAX_EARLY_SENTENCES`)
  scaling with it
- **Light/dark override in Settings** (requested 2026-09-21): today the theme follows the system
  (`prefers-color-scheme` in `src/index.css`) with no way to switch. A System / Light / Dark choice,
  stored per device in local storage, applied as a `data-theme` attribute on the root that the dark
  token block also keys on; the `theme-color` meta for the phone's status bar should follow it
- **Other forms on Dictionary cards** (requested 2026-09-21): cards show only the headword and its
  English, so a search can match a form nobody sees ("nie" finds el sobrino through its feminine's
  "niece"). Show the feminine and its English (_el sobrino · la sobrina_, nephew · niece), adjective
  forms (_simpático · simpática_), and a plural-only marker (_las gafas_)

## Choosing words

Every session draws words from `rankedCards` in `src/lib/session.ts`, which sorts them into four
bands:

1. **Due** — reviews whose date has come.
2. **New** — words never practiced in **either** direction, each offered in one direction only.
3. **Other direction** — the unpracticed direction of a word already met. It is not new to the
   learner, so it waits until there are no new words left rather than taking their place.
4. **Rest** — everything else, only for sessions that ask for all words.

Due and new are interleaved so that **every third card is a new word** (`NEW_WORD_EVERY`) while any
remain; with nothing due, a session is all new words. "Focus on new words" takes new words first,
then other directions.

Why the reserved share: a word answered today comes back tomorrow, then in three days, so without it
the previous day's words fill every session and new words stop arriving after the first day. A
simulation of two 15-word sessions a day showed 50 of 150 words practiced after ten days with due
words strictly first (and many "new" slots taken by other directions of words just seen), and 108
with the reserved share.

## Mixed sessions

A session started from General practice or a Focus row is built by `buildMixedSession` in
`src/lib/session.ts`: 15 words by default, taken in the order described in
[Choosing words](#choosing-words), with only the way each is asked varying. Each step picks an exercise by weight (`MIX_WEIGHTS`): Fill
in the Blank 3, Find the Mistake 2, word Translate (typed) 2, sentence Translate 1, Multiple Choice 1, a matching round 1. Sentence
exercises lead because they test words in context, which is worth more than rote recall; with a third
of practiced words due they make up about half of a session's words. Rules on top:

- **At most two Multiple Choice cards and one matching round per session** (`MAX_PER_SESSION`). Multiple Choice is
  recognition among four options, easy enough that more feels like filler (before the cap a third of
  sessions had three or more). A matching round is several words at once, so two of them took most of a
  fifteen-word session, sometimes back to back.

- **No more than three of one exercise in a row** (`MAX_RUN`), so the pace keeps changing — unless
  nothing else is left to offer (Multiple Choice used up, no room for a round, no sentences), when typing
  continues rather than the session stopping.
- **Typed cards are nudged into short runs.** Every switch between typing and tapping drops or
  raises the phone keyboard; alternating one card at a time would have it bouncing all session. On
  iOS a typed card that follows a tap exercise may need a tap on the answer line to bring the
  keyboard back, because iOS only opens it from a user gesture.
- **Find the Mistake and Translate join** once sentences are possible, like gaps.
- **Gaps join once they are possible**, nudged into runs with typed cards since both use the
  keyboard — see [Filling a gap](#filling-a-gap). With nothing due they still appear, up to four aimed
  at words practiced earlier (see [Filling a gap](#filling-a-gap)).
- **A matching round needs room**: at least four words left in the session and at least three words
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

- **Both directions** ignore capitals, extra spaces, `¿ ¡`, a closing `. ! ?` and apostrophes
  (`normalize`). Apostrophes go because iOS types a curly `’` by default and "its hot" is a slip of
  punctuation, not of the language; Spanish does not use them.
- **en→es**: the feminine or plural of the headword is accepted as correct. For adjectives that means
  all four agreeing forms, worked out like sentences build them (stored `forms.pl`, else the regular
  plural), so _simpáticas_ and _muchas_ count even though only _simpática_ is stored. A missing accent is
  `hard` ("almost — check the accent"), and a `ñ` written as `n` is called out as its own case.
  Nouns are expected with their article; a missing article is `hard`, a wrong one is `wrong`, since
  the article is how gender gets tested. A common-gender noun (`gender: "mf"`) accepts either
  article and is shown as `el/la estudiante`. A noun whose headword is itself plural
  (`number: "pl"`, as in `los hermanos` for siblings) takes `los`/`las`. A noun with no plural at all
  (`number: "sg"`, as in `la ropa interior`) is marked so the validator does not ask for one. A noun's `article` field relaxes this for words Spanish
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
wrong recognition answer lapses the card like any other. **An answer before the card is due** (a
sentence reaching for a word practiced earlier) records the result and the day but, when right, leaves
the schedule alone: minutes after learning a word, a right answer is no evidence it will last three
days, and advancing on it pushed words out early. A wrong early answer lapses the card as usual. A correct answer auto-advances after `CORRECT_PAUSE_MS`
(550ms); anything else waits for the button, because there is something to read.

## Deploying

Hosted on Netlify at `vlc-spanish.netlify.app`, deployed from the GitHub repo. The site name is a
property of the Netlify site, not something in `netlify.toml` — it is set at creation
(`netlify sites:create --name vlc-spanish`) or in the Netlify UI.

The site is fully static: `pnpm run build` validates the dictionary and frames, type-checks and
builds to `dist/`. There are no functions and no environment variables.

If the old Netlify Blobs store still holds data from the multi-user version (`users`,
`progress/dylan`, `dictionary` in the `vocab` store), nothing reads it; with the CLI linked to the site
(`netlify link`) it can be removed with `netlify blobs:delete vocab <key>`.
