import type { IsoDate } from "./dates.ts";
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
  format: "typed" | "choice" | "flashcard" | "mixed";
  tags?: string[];
  scope: "due" | "recent" | "misses" | "all";
}

export const DEFAULT_CONFIG: QuizConfig = {
  size: 10,
  direction: "mixed",
  format: "typed",
  scope: "due",
};

export interface Card {
  entry: Entry;
  direction: Direction;
  progress: Progress;
  /** The english text to show for an en→es prompt, chosen to be unambiguous. */
  prompt: string;
  /** Entries that share this prompt's gloss, so a near-miss can be explained. */
  confusableWith: Entry[];
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
  // practisable on purpose even though they never turn up by accident.
  return entry.tags.some((tag) => tags.includes(tag));
}

/** Deterministic shuffle so sessions can be tested with a seeded generator. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export interface BuildSessionOptions {
  entries: Entry[];
  progress: ProgressBlob;
  userId: string;
  config: QuizConfig;
  today: IsoDate;
  random?: () => number;
}

/**
 * Pick the cards for one session.
 *
 * Order of preference: cards that are due, then cards never seen, then anything
 * else in scope. Within each band the order is shuffled so repeated sessions do
 * not drill the same words in the same sequence.
 */
export function buildSession(options: BuildSessionOptions): Card[] {
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
  const selected = dedupeByEntry(ordered, config).slice(0, config.size);

  if (config.direction !== "mixed") return selected;
  return balanceDirections(selected, random, (entry, direction) =>
    progressFor(progress, userId, entry, direction, today),
  );
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
  return {
    entry,
    direction,
    progress: progressFor(progress, userId, entry, direction, today),
    prompt,
    confusableWith: confusableEntries(entry, prompt, index),
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
