import { canonicalAnswer } from "./grade.ts";
import { normalize } from "./normalize.ts";
import { shuffle } from "./random.ts";
import type { Entry, ProgressBlob } from "./schema.ts";
import { isDrillable, type Card } from "./session.ts";

/** Four options: the answer and three distractors. */
export const CHOICE_COUNT = 4;

export interface ChoiceOption {
  entryId: string;
  /** What the option shows: the Spanish with its article, or the English gloss. */
  text: string;
  correct: boolean;
}

/**
 * Distractor preference, highest first. A good distractor is a word the learner
 * could plausibly confuse with the answer: the same part of speech from the same
 * class section, and for nouns the same gender and number, so the article cannot
 * give the answer away. Words already practised beat unseen ones, so the choice
 * is between things half-known rather than one familiar word and three strangers.
 */
const WEIGHT = { pos: 8, tag: 4, agreement: 2, seen: 1 } as const;

/** The text an entry shows as an option for a card asked in this direction. */
export function optionText(entry: Entry, direction: Card["direction"]): string {
  return direction === "en→es"
    ? canonicalAnswer(entry, "en→es", { requireArticle: true })
    : entry.en[0]!;
}

/**
 * Whether choosing this entry could also be a right answer, which would leave a
 * question with two correct options. Shared english glosses cover ser and estar
 * ("to be"); a shared headword covers deportista the adjective and the noun.
 */
function couldAlsoBeRight(target: Entry, candidate: Entry): boolean {
  if (normalize(candidate.es) === normalize(target.es)) return true;
  const glosses = new Set(target.en.map(normalize));
  return candidate.en.some((gloss) => glosses.has(normalize(gloss)));
}

function score(target: Entry, candidate: Entry, progress: ProgressBlob): number {
  let total = 0;
  if (candidate.pos === target.pos) total += WEIGHT.pos;
  if (candidate.tags.some((tag) => target.tags.includes(tag))) total += WEIGHT.tag;
  if (
    target.pos === "noun" &&
    candidate.pos === "noun" &&
    candidate.gender === target.gender &&
    (candidate.number ?? "sg") === (target.number ?? "sg")
  ) {
    total += WEIGHT.agreement;
  }
  if (progress.entries[candidate.id]) total += WEIGHT.seen;
  return total;
}

export interface ChoiceOptionsInput {
  card: Pick<Card, "entry" | "direction">;
  entries: Entry[];
  progress: ProgressBlob;
  random: () => number;
}

/**
 * The shuffled options for a multiple-choice card: exactly one correct, and
 * never two that read the same. A small dictionary yields fewer than four
 * rather than failing.
 */
export function choiceOptions({
  card,
  entries,
  progress,
  random,
}: ChoiceOptionsInput): ChoiceOption[] {
  const target = card.entry;
  const answer: ChoiceOption = {
    entryId: target.id,
    text: optionText(target, card.direction),
    correct: true,
  };

  // Numbers stay out of ordinary questions, but a number asked by name gets
  // number distractors: one number among three nouns is no question at all.
  const eligible = (candidate: Entry) =>
    isDrillable(candidate) || (!isDrillable(target) && candidate.pos === target.pos);

  const ranked = shuffle(
    entries.filter(
      (candidate) =>
        candidate.id !== target.id && eligible(candidate) && !couldAlsoBeRight(target, candidate),
    ),
    random,
  )
    .map((candidate) => ({ candidate, score: score(target, candidate, progress) }))
    // Stable sort over a shuffled list: best tier first, random within a tier.
    .sort((a, b) => b.score - a.score);

  const shown = new Set([normalize(answer.text)]);
  const distractors: ChoiceOption[] = [];
  for (const { candidate } of ranked) {
    if (distractors.length === CHOICE_COUNT - 1) break;
    const text = optionText(candidate, card.direction);
    if (shown.has(normalize(text))) continue;
    shown.add(normalize(text));
    distractors.push({ entryId: candidate.id, text, correct: false });
  }

  return shuffle([answer, ...distractors], random);
}
