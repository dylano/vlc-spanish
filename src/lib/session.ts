import type { IsoDate } from "./dates.ts";
import { choiceOptions, interchangeable, type ChoiceOption } from "./choices.ts";
import { shuffle } from "./random.ts";
import type { Frame, Glue } from "./sentences/frames.ts";
import { gapTargets, renderGap, type Gap } from "./sentences/gap.ts";
import { renderMistake, type Mistake } from "./sentences/mistake.ts";
import { renderTranslation, type Translation } from "./sentences/translate.ts";
import { isProblem } from "./problems.ts";
import { isDue, sm2 } from "./scheduler.ts";
import type { Direction, Entry, Progress, ProgressBlob } from "./schema.ts";

/** Share of a mixed session prompted english → spanish. */
export const MIXED_EN_ES_SHARE = 0.7;

/**
 * Tag whose words are kept out of general practice.
 *
 * Numbers are a third of the dictionary but carry little of its meaning, so
 * drilling them alongside everything else crowds out the words worth learning.
 * They stay in the dictionary to look up, and a session that asks for this tag
 * by name still gets them.
 */
export const EXCLUDED_TAG = "numbers";

/** Whether an entry belongs in a session that did not ask for it by tag. */
export function isDrillable(entry: Entry): boolean {
  return entry.pos !== "number" && !entry.tags.includes(EXCLUDED_TAG);
}

export interface QuizConfig {
  size: number;
  direction: Direction | "mixed";
  format: Exercise | "mixed";
  /** The exercises a mixed session may use; every one when absent or empty. */
  exercises?: Exercise[];
  tags?: string[];
  /**
   * Which words: `due` ranks the dictionary for review (due, then new), `all`
   * adds every other word after those, and `problems` is the Problem words list
   * only — every word ever missed, whatever its category.
   */
  scope: "due" | "all" | "problems";
}

export const DEFAULT_CONFIG: QuizConfig = {
  size: 10,
  direction: "mixed",
  format: "typed",
  scope: "due",
};

/** How a card is answered. */
export type Exercise = "typed" | "choice" | "match" | "gap" | "mistake" | "translate";

export interface Card {
  exercise: Exercise;
  entry: Entry;
  direction: Direction;
  progress: Progress;
  /** The english text to show for an en→es prompt, chosen to be unambiguous. */
  prompt: string;
  /** Entries that share this prompt's gloss, so a near-miss can be explained. */
  confusableWith: Entry[];
  /**
   * The entry's hint, present only when the prompt is ambiguous without it. A
   * hint on a word whose gloss is already unique would just be noise.
   */
  hint?: string;
  /** The options for a multiple-choice card, in display order. */
  options?: ChoiceOption[];
  /** The sentence and blanks for a fill-the-gap card. */
  gap?: Gap;
  /**
   * One card per blank of a gap, in blank order, each scheduled on its own. The
   * first blank chosen is this card's own word; the rest are other words in the
   * sentence.
   */
  blankCards?: Card[];
  /** The broken sentence for a spot-the-mistake card. */
  mistake?: Mistake;
  /** The sentence for a translate card, which is never graded or scheduled. */
  translation?: Translation;
}

/**
 * English glosses that more than one entry claims. Prompting "to be" cannot
 * distinguish ser from estar, so the quiz avoids those glosses where it can and
 * explains the collision where it cannot.
 */
export function glossIndex(entries: Entry[]): Map<string, Entry[]> {
  const index = new Map<string, Entry[]>();
  for (const entry of entries) {
    for (const gloss of entry.en) {
      const key = gloss.trim().toLowerCase();
      index.set(key, [...(index.get(key) ?? []), entry]);
    }
  }
  return index;
}

/**
 * The gloss to prompt with: the first one no other entry claims, falling back to
 * en[0] when every gloss is shared (ser and estar are both only "to be").
 */
export function promptGloss(entry: Entry, index: Map<string, Entry[]>): string {
  for (const gloss of entry.en) {
    if ((index.get(gloss.trim().toLowerCase()) ?? []).length === 1) return gloss;
  }
  return entry.en[0]!;
}

/** Other entries that also answer to this prompt. */
export function confusableEntries(
  entry: Entry,
  prompt: string,
  index: Map<string, Entry[]>,
): Entry[] {
  return (index.get(prompt.trim().toLowerCase()) ?? []).filter(
    (candidate) => candidate.id !== entry.id,
  );
}

function progressFor(
  blob: ProgressBlob,
  userId: string,
  entry: Entry,
  direction: Direction,
  today: IsoDate,
): Progress {
  return blob.entries[entry.id]?.[direction] ?? sm2.create(userId, entry.id, direction, today);
}

function matchesTags(entry: Entry, tags: string[] | undefined): boolean {
  if (!tags || tags.length === 0) return isDrillable(entry);
  // Asking for a tag by name overrides the exclusion, so numbers remain
  // practicable on purpose even though they never turn up by accident.
  return entry.tags.some((tag) => tags.includes(tag));
}

/**
 * Whether a session may ask this word. Problem words ignore categories: the
 * list is a history of misses, and a missed number is as worth drilling as any.
 */
function inScope(entry: Entry, options: Pick<BuildSessionOptions, "config" | "progress">): boolean {
  if (options.config.scope === "problems") return isProblem(entry, options.progress);
  return matchesTags(entry, options.config.tags);
}

export interface BuildSessionOptions {
  entries: Entry[];
  progress: ProgressBlob;
  userId: string;
  config: QuizConfig;
  today: IsoDate;
  random?: () => number;
  /** Sentence frames and glue; without them a session has no sentence exercises. */
  sentences?: { frames: Frame[]; glue: Glue };
}

/**
 * Words in a mixed session reserved for ones the app has not asked yet, as a
 * share of its length. Without it the session fills with reviews: due words come
 * first, and every exercise can use them, so a simulated learner met 45 words in
 * ten sessions rather than 84. The learner is working through a class that has
 * covered the whole dictionary, so meeting more of it matters more than drilling
 * the handful already seen.
 */
export const NEW_SHARE = 0.4;

/** How many usable words to try before giving up on building a sentence exercise. */
const GAP_SCAN = 40;

/**
 * How many blanks a gap gets, as cumulative odds: mostly one or two, now and
 * then three. Frames with fewer useful slots simply give fewer.
 */
const BLANK_ODDS: [number, number][] = [
  [1, 0.5],
  [2, 0.9],
  [3, 1],
];

interface MadeGap {
  card: Card;
  gap: Gap;
  blankCards: Card[];
}

/**
 * A function that takes the next word a gap can be aimed at off a ranked list,
 * or undefined when this learner cannot have sentence exercises yet.
 *
 * A sentence may use any dictionary word; the gap itself is aimed at the session's
 * next word, so filling it doubles as the review (or the first asking) of it.
 */
/**
 * What every sentence exercise needs, or undefined when this learner cannot have
 * them yet: the render context and where each word can sit in a frame.
 */
function sentenceSetup(options: BuildSessionOptions) {
  const { sentences, entries, progress, today, random = Math.random } = options;
  if (!sentences) return undefined;

  const practiced = (entry: Entry) => progress.entries[entry.id] !== undefined;
  const problems = options.config.scope === "problems";
  // A sentence is answered in Spanish, so it reviews the en→es card; a word
  // counts as due for a sentence only when that card is (or has never been seen).
  // Problem words are drilled whether due or not: that is the point of asking for them.
  const due = (entry: Entry) => {
    if (problems) return true;
    const record = progress.entries[entry.id]?.["en→es"];
    return !record || isDue(record, today);
  };
  // Every dictionary word may appear and be blanked, practiced here or not: the
  // learner is working through a class that has covered them, so a word the app
  // has not asked yet is not a word they have never met.
  const context = { dictionary: entries, glue: sentences.glue, random };
  const targets = gapTargets(sentences.frames, context);
  // Every other practiced word a sentence can hold, the longest unseen first.
  // Aimed at only due words, a new learner saw no sentences until the day after
  // their first practice, and none again whenever their due words ran out. The
  // scheduler leaves a right answer on a word that is not due alone, so these
  // reviews cannot push a word ahead early.
  const lastSeen = (card: Card) =>
    Object.values(progress.entries[card.entry.id] ?? {})
      .map((record) => record?.lastSeen ?? "")
      .reduce((latest, seen) => (seen > latest ? seen : latest), "");
  const fallback = rankedCards({
    ...options,
    config: { ...options.config, scope: problems ? "problems" : "all" },
  })
    .filter((card) => targets.has(card.entry.id))
    .map((card) => ({ card, seen: lastSeen(card) }))
    .sort((a, b) => a.seen.localeCompare(b.seen))
    .map(({ card }) => card);
  return { practiced, due, context, targets, fallback };
}

type SentenceSetup = NonNullable<ReturnType<typeof sentenceSetup>>;

/**
 * The words a sentence exercise may be aimed at, best first: the session's own
 * list in its usual order (due, then new, then the other direction), then any
 * other word not yet used in this session, the longest unseen first. Only usable
 * words count toward the limit, so a run of words no frame can hold does not
 * hide the rest.
 */
function* sentenceCandidates(
  remaining: Card[],
  taken: Set<string>,
  setup: SentenceSetup,
  dueOnly = false,
): Generator<{ card: Card; queued: boolean }> {
  let tried = 0;
  const offered = new Set<string>();
  for (const card of remaining) {
    // Due first (or never asked in this direction), so a sentence reviews what is
    // ready; the rest of the ranked list follows.
    if (!setup.due(card.entry) || !setup.targets.has(card.entry.id)) continue;
    if (tried++ >= GAP_SCAN) return;
    offered.add(card.entry.id);
    yield { card, queued: true };
  }
  if (dueOnly) return;
  for (const card of setup.fallback) {
    if (taken.has(card.entry.id) || offered.has(card.entry.id)) continue;
    if (tried++ >= GAP_SCAN) return;
    yield { card, queued: false };
  }
}

function removeWord(remaining: Card[], entryId: string): void {
  const index = remaining.findIndex((card) => card.entry.id === entryId);
  if (index >= 0) remaining.splice(index, 1);
}

function gapMaker(
  options: BuildSessionOptions,
):
  | ((
      remaining: Card[],
      maxWords: number,
      taken: Set<string>,
      dueOnly?: boolean,
    ) => (MadeGap & { early: boolean }) | undefined)
  | undefined {
  const { entries, progress, userId, today, random = Math.random } = options;
  const setup = sentenceSetup(options);
  if (!setup) return undefined;
  const { context, targets } = setup;
  const index = glossIndex(entries);

  return (remaining, maxWords, taken, dueOnly = false) => {
    const roll = random();
    const wanted = Math.min(maxWords, BLANK_ODDS.find(([, odds]) => roll < odds)![0]);
    // Further blanks are any word the session may ask, not already used in it.
    const canBlank = (id: string) => {
      const entry = entries.find((candidate) => candidate.id === id);
      return !!entry && inScope(entry, options) && !taken.has(id);
    };

    for (const { card, queued } of sentenceCandidates(remaining, taken, setup, dueOnly)) {
      const gap = renderGap(card.entry.id, targets, context, wanted, canBlank);
      if (!gap) continue;

      removeWord(remaining, card.entry.id);
      // A gap is always answered in Spanish, so every blank schedules its word's
      // en→es card. Other blanked words leave the pool so they are not asked twice.
      const blankCards = gap.blanks.map((blank) => {
        const entry = entries.find((candidate) => candidate.id === blank.entryId)!;
        const queued = remaining.findIndex((other) => other.entry.id === entry.id);
        if (queued >= 0) remaining.splice(queued, 1);
        return toCard(entry, "en→es", progress, userId, today, index);
      });
      const primary = blankCards.find((blank) => blank.entry.id === card.entry.id)!;
      return { card: primary, gap, blankCards, early: !queued };
    }
    return undefined;
  };
}

/**
 * A function that takes the next word a one-sentence exercise can be aimed at
 * off a ranked list, or undefined when this learner cannot have sentence
 * exercises yet. `render` builds the exercise around that word.
 */
function sentenceMaker<T>(
  options: BuildSessionOptions,
  render: (
    entryId: string,
    targets: Map<string, { frame: Frame; slot: string }[]>,
    context: SentenceSetup["context"],
  ) => T | undefined,
):
  | ((
      remaining: Card[],
      taken: Set<string>,
      dueOnly?: boolean,
    ) => { card: Card; made: T; early: boolean } | undefined)
  | undefined {
  const { progress, userId, today } = options;
  const setup = sentenceSetup(options);
  if (!setup) return undefined;
  const { context, targets } = setup;

  return (remaining, taken, dueOnly = false) => {
    for (const { card, queued } of sentenceCandidates(remaining, taken, setup, dueOnly)) {
      const made = render(card.entry.id, targets, context);
      if (!made) continue;
      removeWord(remaining, card.entry.id);
      // A sentence in Spanish concerns the word's en→es card.
      return {
        card: {
          ...card,
          direction: "en→es",
          progress: progressFor(progress, userId, card.entry, "en→es", today),
        },
        made,
        early: !queued,
      };
    }
    return undefined;
  };
}

/** A session of one sentence exercise only. Empty when the learner cannot have sentences yet. */
function buildSentenceSession<K extends "mistake" | "translate">(
  options: BuildSessionOptions,
  exercise: K,
): Card[] {
  const make =
    exercise === "mistake"
      ? sentenceMaker(options, renderMistake)
      : sentenceMaker(options, renderTranslation);
  if (!make) return [];
  const remaining = rankedCards(options);
  const plan: Planned[] = [];
  const taken = new Set<string>();
  while (plan.length < options.config.size) {
    const next = make(remaining, taken);
    if (!next) break;
    taken.add(next.card.entry.id);
    plan.push(
      exercise === "mistake"
        ? { exercise: "mistake", card: next.card, mistake: next.made as Mistake }
        : { exercise: "translate", card: next.card, translation: next.made as Translation },
    );
  }
  return finalize(plan, options) as Card[];
}

/** A session of mistakes only. Empty when the learner cannot have sentences yet. */
export function buildMistakeSession(options: BuildSessionOptions): Card[] {
  return buildSentenceSession(options, "mistake");
}

/** A session of translations only. Empty when the learner cannot have sentences yet. */
export function buildTranslateSession(options: BuildSessionOptions): Card[] {
  return buildSentenceSession(options, "translate");
}

/** A session of gaps only. Empty when the learner cannot have sentences yet. */
export function buildGapSession(options: BuildSessionOptions): Card[] {
  const makeGap = gapMaker(options);
  if (!makeGap) return [];
  const remaining = rankedCards(options);
  const plan: Planned[] = [];
  const taken = new Set<string>();
  let words = 0;
  while (words < options.config.size) {
    const next = makeGap(remaining, options.config.size - words, taken);
    if (!next) break;
    const { early: _early, ...made } = next;
    plan.push({ exercise: "gap", ...made });
    for (const blank of next.blankCards) taken.add(blank.entry.id);
    words += next.blankCards.length;
  }
  return finalize(plan, options) as Card[];
}

/**
 * Pick the cards for one session.
 *
 * Order of preference: cards that are due, then cards never seen, then anything
 * else in scope. Within each band the order is shuffled so repeated sessions do
 * not drill the same words in the same sequence.
 */
export function buildSession(options: BuildSessionOptions): Card[] {
  const { config } = options;
  const exercise = config.format === "choice" ? "choice" : "typed";
  const plan = rankedCards(options)
    .slice(0, config.size)
    .map((card): Planned => ({ exercise, card }));
  // A plan of single cards finalizes to single cards.
  return finalize(plan, options) as Card[];
}

/**
 * Pairs in one matching round. Four rather than six: six felt tedious to finish,
 * and in a fifteen-word Practice session a six-pair round was 40% of it.
 */
export const MATCH_ROUND_SIZE = 4;

/** Fewer pairs than this and a round is not worth the screen. */
const MATCH_ROUND_MIN = 3;

/** A matching round: several cards answered together on one screen. */
export interface MatchRound {
  exercise: "match";
  cards: Card[];
}

/** One step of a session: a single card, or a matching round. */
export type SessionItem = Card | MatchRound;

export function isMatchRound(item: SessionItem): item is MatchRound {
  return "cards" in item;
}

/** A step chosen but not yet given its direction or options. */
type Planned =
  | { exercise: "typed" | "choice"; card: Card }
  | ({ exercise: "gap" } & MadeGap)
  | { exercise: "mistake"; card: Card; mistake: Mistake }
  | { exercise: "translate"; card: Card; translation: Translation }
  | { exercise: "match"; cards: Card[] };

/**
 * Take up to a round's worth of cards off the front of a ranked list.
 *
 * The round starts from the highest-priority word left and fills up with words
 * sharing one of its tags, so the pairs are confusable (four family words, not a
 * noun, three adjectives and a verb), then with anything else. Two words that
 * could stand in for each other never share a round: tapping "to be" would have
 * two right answers.
 */
function takeRound(remaining: Card[]): Card[] {
  const anchor = remaining.shift();
  if (!anchor) return [];
  const round = [anchor];
  const sharesTag = (card: Card) => card.entry.tags.some((tag) => anchor.entry.tags.includes(tag));

  for (const fits of [sharesTag, () => true]) {
    for (let i = 0; i < remaining.length && round.length < MATCH_ROUND_SIZE;) {
      const candidate = remaining[i]!;
      if (
        fits(candidate) &&
        round.every((member) => !interchangeable(member.entry, candidate.entry))
      ) {
        round.push(candidate);
        remaining.splice(i, 1);
      } else {
        i++;
      }
    }
  }
  return round;
}

/**
 * Build matching rounds only. `config.size` counts words, so a size of 16 is
 * four rounds of four. A short last round is kept rather than dropping words,
 * but a round needs at least two pairs.
 */
export function buildMatchRounds(options: BuildSessionOptions): MatchRound[] {
  const remaining = rankedCards(options);
  const wanted = Math.max(1, Math.floor(options.config.size / MATCH_ROUND_SIZE));
  const plan: Planned[] = [];

  while (plan.length < wanted && remaining.length >= 2) {
    const cards = takeRound(remaining);
    if (cards.length < 2) break;
    plan.push({ exercise: "match", cards });
  }
  return finalize(plan, options) as MatchRound[];
}

/**
 * How often each exercise is chosen for the next step of a mixed session.
 * Typing is the strongest practice, so it leads; a matching round covers four
 * words at once, so it needs fewer turns to take its share.
 */
export const MIX_WEIGHTS: Record<Exercise, number> = {
  typed: 2,
  // The easiest exercise: kept light, and capped below.
  choice: 1,
  match: 1,
  // Sentences test words in context, which is more worth practicing than rote
  // recall, so they lead the mix from the first session.
  gap: 3,
  mistake: 2,
  // Ungraded, so it schedules nothing; still worth a regular appearance.
  translate: 1,
};

/**
 * The most of an exercise one mixed session may hold. Multiple Choice is recognition
 * among four options — easy enough that more than a couple per session feels
 * like filler. A matching round is several words at once, so two of them take
 * most of a fifteen-word session.
 */
export const MAX_PER_SESSION: Partial<Record<Exercise, number>> = { choice: 2, match: 1 };

/** The most steps of one exercise in a row, so a session keeps changing pace. */
export const MAX_RUN = 3;

/**
 * The most sentence exercises in one mixed session aimed at a word that is not
 * due. They keep sentences in a session when few words are due (a new learner's
 * first day), but each takes the place of a new word: uncapped, a simulated
 * learner had 31 words practiced after day one rather than 60, and late in a
 * day up to 9 of 15 words went to early reviews.
 */
export const MAX_EARLY_SENTENCES = 4;

/** The session length the caps above were tuned for. */
const CAPS_TUNED_FOR = 15;

/**
 * A cap scaled to the session's length, never below one: a 30-word session may
 * hold twice as many Multiple Choice cards as a 15-word one.
 */
export function capFor(base: number, size: number): number {
  return Math.max(1, Math.round((base * size) / CAPS_TUNED_FOR));
}

function weightedPick<T extends string>(weights: Record<T, number>, random: () => number): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll < 0 && weight > 0) return key;
  }
  return entries.find(([, weight]) => weight > 0)![0];
}

/**
 * A session that moves between exercises: `config.size` words, spread across
 * typed cards, multiple choice and matching rounds.
 *
 * Words are still taken in priority order (due, then new, then the rest); only
 * the way each is asked varies. Typed cards are nudged into short runs, because
 * every switch between typing and tapping drops or raises the phone's keyboard,
 * and one-at-a-time alternation would have it bouncing all session.
 */
export function buildMixedSession(options: BuildSessionOptions): SessionItem[] {
  const random = options.random ?? Math.random;
  const size = options.config.size;
  const chosen = options.config.exercises;
  const allowed = (exercise: Exercise) =>
    !chosen || chosen.length === 0 || chosen.includes(exercise);
  // The caps keep the easy exercises from crowding out typing. Without typing in
  // the mix there is nothing to protect, and a cap would only end the session early.
  const capped = allowed("typed");
  // New words are introduced one at a time, by typing or else by multiple choice;
  // with neither chosen, they arrive only as sentences pick them.
  const introduce: Exercise | undefined = allowed("typed")
    ? "typed"
    : allowed("choice")
      ? "choice"
      : undefined;
  const remaining = rankedCards(options);
  const makeGap = gapMaker(options);
  const makeMistake = sentenceMaker(options, renderMistake);
  const makeTranslation = sentenceMaker(options, renderTranslation);
  let budget = Math.min(options.config.size, remaining.length);
  let roundsPossible = true;
  let gapsPossible = makeGap !== undefined;
  let mistakesPossible = makeMistake !== undefined;
  let translationsPossible = makeTranslation !== undefined;
  const plan: Planned[] = [];
  let early = 0;
  // Words the app has not asked yet, and how many of them this session owes.
  const isNew = (card: Card) => options.progress.entries[card.entry.id] === undefined;
  const quota = introduce
    ? Math.min(remaining.filter(isNew).length, Math.round(size * NEW_SHARE))
    : 0;
  let planned = 0;

  while (budget > 0 && remaining.length > 0) {
    // Once only the reserved slots are left, they go to new words, whatever the
    // weights would otherwise have picked.
    if (planned < quota && budget <= quota - planned) {
      const index = remaining.findIndex(isNew);
      if (index >= 0) {
        const [card] = remaining.splice(index, 1);
        plan.push({ exercise: introduce!, card: card! });
        planned++;
        budget -= 1;
        continue;
      }
    }
    const last = plan.at(-1)?.exercise;
    let run = 0;
    for (let i = plan.length - 1; i >= 0 && plan[i]!.exercise === last; i--) run++;

    // What can still be asked at all: chosen, and not exhausted.
    const possible: Record<Exercise, boolean> = {
      typed: allowed("typed"),
      choice: allowed("choice"),
      match: allowed("match") && roundsPossible && budget >= MATCH_ROUND_SIZE,
      gap: allowed("gap") && gapsPossible,
      mistake: allowed("mistake") && mistakesPossible,
      translate: allowed("translate") && translationsPossible,
    };
    const weights = { ...MIX_WEIGHTS };
    for (const exercise of Object.keys(weights) as Exercise[]) {
      if (!possible[exercise]) weights[exercise] = 0;
    }
    // Typed cards and gaps share the keyboard, so they are nudged to follow each other.
    if (last === "typed" || last === "gap") {
      weights.typed *= 2;
      weights.gap *= 2;
    }
    if (last && run >= MAX_RUN) weights[last] = 0;
    const full = (exercise: Exercise) => {
      const limit = MAX_PER_SESSION[exercise];
      return (
        capped &&
        limit !== undefined &&
        plan.filter((step) => step.exercise === exercise).length >= capFor(limit, size)
      );
    };
    for (const exercise of Object.keys(weights) as Exercise[]) {
      if (full(exercise)) weights[exercise] = 0;
    }
    // The run limit varies the pace; it must never leave nothing to ask. When it
    // rules out everything else, the exercise it stopped continues.
    const none = () => Object.values(weights).every((weight) => weight === 0);
    if (none() && last && possible[last] && !full(last)) weights[last] = 1;
    if (none()) break;

    const exercise = weightedPick(weights, random);
    const taken = new Set(
      plan.flatMap((step) =>
        "cards" in step
          ? step.cards.map((card) => card.entry.id)
          : "blankCards" in step
            ? step.blankCards.map((card) => card.entry.id)
            : [step.card.entry.id],
      ),
    );
    const dueOnly = early >= capFor(MAX_EARLY_SENTENCES, size);
    if (exercise === "gap") {
      const next = makeGap?.(remaining, budget, taken, dueOnly);
      if (next) {
        planned += next.blankCards.filter(isNew).length;
        const { early: wasEarly, ...made } = next;
        if (wasEarly) early++;
        plan.push({ exercise, ...made });
        budget -= next.blankCards.length;
      } else {
        gapsPossible = false;
      }
      continue;
    }
    if (exercise === "translate") {
      const next = makeTranslation?.(remaining, taken, dueOnly);
      if (next) {
        if (next.early) early++;
        plan.push({ exercise, card: next.card, translation: next.made });
        budget -= 1;
      } else {
        translationsPossible = false;
      }
      continue;
    }
    if (exercise === "mistake") {
      const next = makeMistake?.(remaining, taken, dueOnly);
      if (next) {
        if (next.early) early++;
        plan.push({ exercise, card: next.card, mistake: next.made });
        budget -= 1;
      } else {
        mistakesPossible = false;
      }
      continue;
    }
    if (exercise === "match") {
      const cards = takeRound(remaining);
      if (cards.length >= MATCH_ROUND_MIN) {
        planned += cards.filter(isNew).length;
        plan.push({ exercise, cards });
        budget -= cards.length;
        continue;
      }
      // Not enough distinct words for a real round: put them back, stop trying.
      remaining.unshift(...cards);
      roundsPossible = false;
      continue;
    }
    const next = remaining.shift()!;
    if (isNew(next)) planned++;
    plan.push({ exercise, card: next });
    budget -= 1;
  }

  return finalize(plan, options);
}

/**
 * Turn a plan into session items. Directions are balanced across every card in
 * the session at once, then each step gets what depends on direction: options
 * for multiple choice (what an option shows depends on it), and the exercise
 * stamped on each card.
 */
function finalize(plan: Planned[], options: BuildSessionOptions): SessionItem[] {
  const { entries, progress, random = Math.random } = options;
  // Gaps keep their direction: they are always answered in Spanish.
  const flat = plan.flatMap((step) =>
    "cards" in step
      ? step.cards
      : step.exercise === "gap" || step.exercise === "mistake" || step.exercise === "translate"
        ? []
        : [step.card],
  );
  const directed = assignDirections(flat, options);

  let offset = 0;
  return plan.map((step): SessionItem => {
    if (step.exercise === "mistake") {
      return { ...step.card, exercise: "mistake", mistake: step.mistake };
    }
    if (step.exercise === "translate") {
      return { ...step.card, exercise: "translate", translation: step.translation };
    }
    if (step.exercise === "gap") {
      return {
        ...step.card,
        exercise: "gap",
        gap: step.gap,
        blankCards: step.blankCards.map((card): Card => ({ ...card, exercise: "gap" })),
      };
    }
    if ("cards" in step) {
      const cards = directed
        .slice(offset, offset + step.cards.length)
        .map((card): Card => ({ ...card, exercise: "match" }));
      offset += step.cards.length;
      return { exercise: "match", cards };
    }
    const card = directed[offset++]!;
    if (step.exercise === "typed") return card;
    return {
      ...card,
      exercise: "choice",
      options: choiceOptions({ card, entries, progress, random }),
    };
  });
}

function assignDirections(cards: Card[], options: BuildSessionOptions): Card[] {
  const { progress, userId, config, today, random = Math.random } = options;
  if (config.direction !== "mixed") return cards;
  return balanceDirections(cards, random, (entry, direction) =>
    progressFor(progress, userId, entry, direction, today),
  );
}

/**
 * The share of a session given to brand-new words while any remain: every third
 * card. Without a reserved share, yesterday's words — all due again the next day —
 * fill every session and new words stop arriving after the first day.
 */
export const NEW_WORD_EVERY = 3;

/**
 * Every card in scope, best first, at most one direction per word in a mixed
 * session.
 *
 * Four bands. **Due** cards are reviews. **New** words have never been practiced
 * in either direction. **Other direction** is the unpracticed direction of a word
 * already met — not new to the learner, so it waits until there are no new words
 * to offer rather than taking their place. **Rest** is everything else, for
 * sessions that ask for all words. Due and new are interleaved so that every
 * third card is a new word; a session with nothing due is all new words.
 */
function rankedCards(options: BuildSessionOptions): Card[] {
  const { entries, progress, userId, config, today, random = Math.random } = options;
  const index = glossIndex(entries);

  const pool = entries.filter((entry) => inScope(entry, options));
  const directions: Direction[] =
    config.direction === "mixed" ? ["en→es", "es→en"] : [config.direction];

  const due: Card[] = [];
  const fresh: Card[] = [];
  const otherDirection: Card[] = [];
  const rest: Card[] = [];
  // Problem words wrong last time, in that direction: drilled first.
  const wrong: Card[] = [];

  for (const entry of pool) {
    const record = progress.entries[entry.id];
    const metBefore = record !== undefined && Object.keys(record).length > 0;
    // A brand-new word is offered in one direction only, so it takes one slot.
    const freshDirection = pick(directions, random);

    for (const direction of directions) {
      const card = toCard(entry, direction, progress, userId, today, index);
      const seen = record?.[direction];

      if (config.scope === "problems") {
        // Every problem word is in, due or not; what is still wrong comes first,
        // then what is due, so a word answered right since waits its turn.
        if (seen?.lastResult === "wrong") wrong.push(card);
        else if (seen && isDue(seen, today)) due.push(card);
        else rest.push(card);
        continue;
      }
      if (!metBefore) {
        if (direction === freshDirection) fresh.push(card);
        continue;
      }
      if (!seen) {
        otherDirection.push(card);
        continue;
      }
      if (isDue(seen, today)) due.push(card);
      else if (config.scope === "all") rest.push(card);
    }
  }

  // New words are shared out between the chosen categories as they are
  // introduced; reviews follow the schedule, whatever their category.
  const ordered =
    config.scope === "problems"
      ? [...shuffle(wrong, random), ...shuffle(due, random), ...shuffle(rest, random)]
      : [
          ...interleaveNew(
            dedupeByEntry(shuffle(due, random), config),
            balanceTags(shuffle(fresh, random), config.tags, random),
          ),
          ...shuffle(otherDirection, random),
          ...shuffle(rest, random),
        ];
  return dedupeByEntry(ordered, config);
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}

/**
 * Cards taken from each chosen category in turn. Applied to new words only: in
 * proportion to their size, 62 food words left 6 weather words with one new
 * word in fourteen, so a first session could be all food. Reviews are left to
 * the schedule: balanced too, a simulated learner was asked each weather word
 * three times as often as each food word. A small category runs out first and
 * the rest continue. A word in several chosen categories counts for one of them,
 * picked at random. Order within a category is kept.
 */
export function balanceTags(
  cards: Card[],
  tags: string[] | undefined,
  random: () => number,
): Card[] {
  if (!tags || tags.length < 2) return cards;
  const queues = new Map<string, Card[]>(shuffle([...tags], random).map((tag) => [tag, []]));
  for (const card of cards) {
    const own = tags.filter((tag) => card.entry.tags.includes(tag));
    queues.get(pick(own, random))!.push(card);
  }
  const out: Card[] = [];
  const lists = [...queues.values()];
  for (let row = 0; out.length < cards.length; row++) {
    for (const list of lists) if (row < list.length) out.push(list[row]!);
  }
  return out;
}

/** Reviews with a new word in every third place, each list continuing once the other runs out. */
function interleaveNew(reviews: Card[], fresh: Card[]): Card[] {
  const out: Card[] = [];
  let r = 0;
  let f = 0;
  while (r < reviews.length || f < fresh.length) {
    const newTurn = out.length % NEW_WORD_EVERY === NEW_WORD_EVERY - 1;
    if (f < fresh.length && (newTurn || r >= reviews.length)) out.push(fresh[f++]!);
    else out.push(reviews[r++]!);
  }
  return out;
}

function toCard(
  entry: Entry,
  direction: Direction,
  progress: ProgressBlob,
  userId: string,
  today: IsoDate,
  index: Map<string, Entry[]>,
): Card {
  const prompt = promptGloss(entry, index);
  const confusableWith = confusableEntries(entry, prompt, index);
  return {
    exercise: "typed",
    entry,
    direction,
    progress: progressFor(progress, userId, entry, direction, today),
    prompt,
    confusableWith,
    hint: confusableWith.length > 0 ? entry.hint : undefined,
  };
}

/**
 * A mixed session generates a card per direction for each entry; keep only one
 * so a single session never asks the same word forwards and backwards.
 */
function dedupeByEntry(cards: Card[], config: QuizConfig): Card[] {
  if (config.direction !== "mixed") return cards;
  const seen = new Set<string>();
  return cards.filter((card) => {
    if (seen.has(card.entry.id)) return false;
    seen.add(card.entry.id);
    return true;
  });
}

/**
 * Bias a mixed session toward english → spanish, which is the harder and more
 * useful direction. Cards keep their slot; only the direction is reassigned —
 * and because scheduling state is per direction, the card's progress has to be
 * looked up again whenever the direction changes.
 */
function balanceDirections(
  cards: Card[],
  random: () => number,
  resolveProgress: (entry: Entry, direction: Direction) => Progress,
): Card[] {
  const target = Math.round(cards.length * MIXED_EN_ES_SHARE);
  const order = shuffle(
    cards.map((_, position) => position),
    random,
  );
  const forward = new Set(order.slice(0, target));

  return cards.map((card, position) => {
    const direction: Direction = forward.has(position) ? "en→es" : "es→en";
    if (direction === card.direction) return card;
    return { ...card, direction, progress: resolveProgress(card.entry, direction) };
  });
}
