import type { Grade, Result } from "../../lib/grade.ts";
import { genderName } from "../../lib/grade.ts";
import type { Strength } from "../../lib/scheduler.ts";
import type { Card } from "../../lib/session.ts";

/** Nouns are always asked with their article: the article is how gender is tested. */
export const GRADE_OPTIONS = { requireArticle: true };

/**
 * How long a correct answer stays on screen before the next card. Long enough to
 * register that it landed, short enough that it never feels like waiting.
 */
export const CORRECT_PAUSE_MS = 550;

export const VERDICT: Record<Result, string> = {
  correct: "Correct",
  hard: "Almost",
  wrong: "Not quite",
};

/** What an exercise reports once the learner moves past a card. */
export interface Outcome {
  grade: Grade;
  /** What they answered, as shown back in the session summary. */
  given: string;
  strength: Strength;
}

export interface ExerciseProps {
  card: Card;
  /** Header state for the session frame. */
  position: { index: number; total: number };
  label: string;
  /** One result per word answered: one for most cards, one per blank for a gap. */
  onDone: (results: { card: Card; outcome: Outcome }[]) => void;
}

/** Grammar line under the prompt, drawn from metadata the dictionary already has. */
function grammarOf(card: Card): string | undefined {
  const { entry } = card;
  switch (entry.pos) {
    case "noun":
      return `noun · ${genderName(entry.gender)}${entry.number === "pl" ? " plural" : ""}`;
    case "verb": {
      const parts = ["verb"];
      if (entry.verb.reflexive) parts.push("reflexive");
      if (entry.verb.stemChange) parts.push(entry.verb.stemChange);
      return parts.join(" · ");
    }
    case "adj":
      return "adjective";
    case "adv":
      return "adverb";
    case "number":
      return "number";
    default:
      return undefined;
  }
}

/**
 * The line under an english prompt. The hint shares it: it answers the same
 * question — which word is meant — and "to be" alone cannot. A spanish prompt
 * gets nothing, since the grammar would give the answer away.
 */
export function promptDetail(card: Card): string | undefined {
  if (card.direction !== "en→es") return undefined;
  return [grammarOf(card), card.hint].filter(Boolean).join(" · ") || undefined;
}

/** The prompt text: the unambiguous english gloss, or the spanish headword. */
export function promptText(card: Card): string {
  return card.direction === "en→es" ? card.prompt : card.entry.es;
}
