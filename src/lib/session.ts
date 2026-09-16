import type { IsoDate } from "./dates.ts";
import { choiceOptions, interchangeable, type ChoiceOption } from "./choices.ts";
import { shuffle } from "./random.ts";
import type { Frame, Glue } from "./sentences/frames.ts";
import { gapTargets, renderGap, type Gap } from "./sentences/gap.ts";
import { renderMistake, type Mistake } from "./sentences/mistake.ts";
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
  tags?: string[];
  scope: "due" | "recent" | "misses" | "all";
}

export const DEFAULT_CONFIG: QuizConfig = {
  size: 10,
  direction: "mixed",
  format: "typed",
  scope: "due",
};

/** How a card is answered. */
export type Exercise = "typed" | "choice" | "match" | "gap" | "mistake";

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
 * Practiced words needed before sentence exercises appear. Sentences only use
 * words the learner has met, and with fewer than this the frames repeat the same
 * handful of words or cannot be filled at all.
 */
export const MIN_SENTENCE_WORDS = 15;

/** How far down the priority order to look for a word a gap can be aimed at. */
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
 * A sentence may use any word the learner has practiced, plus words kept out of
 * drilling (numbers); the gap itself is always a practiced word, so filling it
 * doubles as review of a word that is due.
 */
/**
 * What every sentence exercise needs, or undefined when this learner cannot have
 * them yet: the render context limited to practiced words, and where each word
 * can sit in a frame.
 */
function sentenceSetup(options: BuildSessionOptions) {
  const { sentences, entries, progress, random = Math.random } = options;
  if (!sentences) return undefined;

  const practiced = (entry: Entry) => progress.entries[entry.id] !== undefined;
  if (
    entries.filter((entry) => isDrillable(entry) && practiced(entry)).length < MIN_SENTENCE_WORDS
  ) {
    return undefined;
  }
  const context = {
    dictionary: entries,
    glue: sentences.glue,
    random,
    eligible: (entry: Entry) => practiced(entry) || !isDrillable(entry),
  };
  return { practiced, context, targets: gapTargets(sentences.frames, context) };
}

function gapMaker(
  options: BuildSessionOptions,
): ((remaining: Card[], maxWords: number, taken: Set<string>) => MadeGap | undefined) | undefined {
  const { entries, progress, userId, today, random = Math.random } = options;
  const setup = sentenceSetup(options);
  if (!setup) return undefined;
  const { practiced, context, targets } = setup;
  const index = glossIndex(entries);

  return (remaining, maxWords, taken) => {
    const roll = random();
    const wanted = Math.min(maxWords, BLANK_ODDS.find(([, odds]) => roll < odds)![0]);
    // Further blanks must be practiced words not already used this session.
    const canBlank = (id: string) => {
      const entry = entries.find((candidate) => candidate.id === id);
      return !!entry && practiced(entry) && isDrillable(entry) && !taken.has(id);
    };

    for (let i = 0; i < Math.min(remaining.length, GAP_SCAN); i++) {
      const card = remaining[i]!;
      if (!practiced(card.entry) || !targets.has(card.entry.id)) continue;
      const gap = renderGap(card.entry.id, targets, context, wanted, canBlank);
      if (!gap) continue;

      remaining.splice(i, 1);
      // A gap is always answered in Spanish, so every blank schedules its word's
      // en→es card. Other blanked words leave the pool so they are not asked twice.
      const blankCards = gap.blanks.map((blank) => {
        const entry = entries.find((candidate) => candidate.id === blank.entryId)!;
        const queued = remaining.findIndex((other) => other.entry.id === entry.id);
        if (queued >= 0) remaining.splice(queued, 1);
        return toCard(entry, "en→es", progress, userId, today, index);
      });
      const primary = blankCards.find((blank) => blank.entry.id === card.entry.id)!;
      return { card: primary, gap, blankCards };
    }
    return undefined;
  };
}

/**
 * A function that takes the next word a mistake can be aimed at off a ranked
 * list, or undefined when this learner cannot have sentence exercises yet.
 */
function mistakeMaker(
  options: BuildSessionOptions,
): ((remaining: Card[]) => { card: Card; mistake: Mistake } | undefined) | undefined {
  const { progress, userId, today } = options;
  const setup = sentenceSetup(options);
  if (!setup) return undefined;
  const { practiced, context, targets } = setup;

  return (remaining) => {
    for (let i = 0; i < Math.min(remaining.length, GAP_SCAN); i++) {
      const card = remaining[i]!;
      if (!practiced(card.entry) || !targets.has(card.entry.id)) continue;
      const mistake = renderMistake(card.entry.id, targets, context);
      if (!mistake) continue;
      remaining.splice(i, 1);
      // Fixing a Spanish sentence schedules the word's en→es card.
      return {
        card: {
          ...card,
          direction: "en→es",
          progress: progressFor(progress, userId, card.entry, "en→es", today),
        },
        mistake,
      };
    }
    return undefined;
  };
}

/** A session of mistakes only. Empty when the learner cannot have sentences yet. */
export function buildMistakeSession(options: BuildSessionOptions): Card[] {
  const makeMistake = mistakeMaker(options);
  if (!makeMistake) return [];
  const remaining = rankedCards(options);
  const plan: Planned[] = [];
  while (plan.length < options.config.size) {
    const next = makeMistake(remaining);
    if (!next) break;
    plan.push({ exercise: "mistake", ...next });
  }
  return finalize(plan, options) as Card[];
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
    plan.push({ exercise: "gap", ...next });
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

/** Pairs in one matching round. */
export const MATCH_ROUND_SIZE = 6;

/** Fewer pairs than this and a round is not worth the screen. */
const MATCH_ROUND_MIN = 4;

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
  | { exercise: "match"; cards: Card[] };

/**
 * Take up to a round's worth of cards off the front of a ranked list.
 *
 * The round starts from the highest-priority word left and fills up with words
 * sharing one of its tags, so the pairs are confusable (six family words, not a
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
 * Build matching rounds only. `config.size` counts words, so a size of 18 is
 * three rounds of six. A short last round is kept rather than dropping words,
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
 * Typing is the strongest practice, so it leads; a matching round covers six
 * words at once, so it needs fewer turns to take its share.
 */
export const MIX_WEIGHTS: Record<Exercise, number> = {
  typed: 3,
  choice: 2,
  match: 1,
  gap: 2,
  mistake: 1,
};

/** The most steps of one exercise in a row, so a session keeps changing pace. */
export const MAX_RUN = 3;

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
  const remaining = rankedCards(options);
  const makeGap = gapMaker(options);
  const makeMistake = mistakeMaker(options);
  let budget = Math.min(options.config.size, remaining.length);
  let roundsPossible = true;
  let gapsPossible = makeGap !== undefined;
  let mistakesPossible = makeMistake !== undefined;
  const plan: Planned[] = [];

  while (budget > 0 && remaining.length > 0) {
    const last = plan.at(-1)?.exercise;
    let run = 0;
    for (let i = plan.length - 1; i >= 0 && plan[i]!.exercise === last; i--) run++;

    const weights = { ...MIX_WEIGHTS };
    // Typed cards and gaps share the keyboard, so they are nudged to follow each other.
    if (last === "typed" || last === "gap") {
      weights.typed *= 2;
      weights.gap *= 2;
    }
    if (last && run >= MAX_RUN) weights[last] = 0;
    if (!roundsPossible || budget < MATCH_ROUND_SIZE) weights.match = 0;
    if (!gapsPossible) weights.gap = 0;
    if (!mistakesPossible) weights.mistake = 0;

    const exercise = weightedPick(weights, random);
    if (exercise === "gap") {
      const taken = new Set(
        plan.flatMap((step) =>
          "cards" in step
            ? step.cards.map((card) => card.entry.id)
            : "blankCards" in step
              ? step.blankCards.map((card) => card.entry.id)
              : [step.card.entry.id],
        ),
      );
      const next = makeGap?.(remaining, budget, taken);
      if (next) {
        plan.push({ exercise, ...next });
        budget -= next.blankCards.length;
      } else {
        gapsPossible = false;
      }
      continue;
    }
    if (exercise === "mistake") {
      const next = makeMistake?.(remaining);
      if (next) {
        plan.push({ exercise, ...next });
        budget -= 1;
      } else {
        mistakesPossible = false;
      }
      continue;
    }
    if (exercise === "match") {
      const cards = takeRound(remaining);
      if (cards.length >= MATCH_ROUND_MIN) {
        plan.push({ exercise, cards });
        budget -= cards.length;
        continue;
      }
      // Not enough distinct words for a real round: put them back, stop trying.
      remaining.unshift(...cards);
      roundsPossible = false;
      continue;
    }
    plan.push({ exercise, card: remaining.shift()! });
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
      : step.exercise === "gap" || step.exercise === "mistake"
        ? []
        : [step.card],
  );
  const directed = assignDirections(flat, options);

  let offset = 0;
  return plan.map((step): SessionItem => {
    if (step.exercise === "mistake") {
      return { ...step.card, exercise: "mistake", mistake: step.mistake };
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
 * Every card in scope, best first: due, then never seen, then the rest, each band
 * shuffled, and at most one direction per word in a mixed session.
 */
function rankedCards(options: BuildSessionOptions): Card[] {
  const { entries, progress, userId, config, today, random = Math.random } = options;
  const index = glossIndex(entries);

  const pool = entries.filter((entry) => matchesTags(entry, config.tags));
  const directions: Direction[] =
    config.direction === "mixed" ? ["en→es", "es→en"] : [config.direction];

  const due: Card[] = [];
  const unseen: Card[] = [];
  const rest: Card[] = [];

  for (const entry of pool) {
    for (const direction of directions) {
      const card = toCard(entry, direction, progress, userId, today, index);
      const seen = progress.entries[entry.id]?.[direction];

      if (config.scope === "misses") {
        // Matches the home-screen count: the most recent answer was wrong.
        if (seen?.lastResult === "wrong") rest.push(card);
        continue;
      }
      if (config.scope === "recent") {
        if (!seen) unseen.push(card);
        continue;
      }
      if (!seen) unseen.push(card);
      else if (isDue(seen, today)) due.push(card);
      else if (config.scope === "all") rest.push(card);
    }
  }

  const ordered = [...shuffle(due, random), ...shuffle(unseen, random), ...shuffle(rest, random)];
  return dedupeByEntry(ordered, config);
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
