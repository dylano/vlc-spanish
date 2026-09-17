import type { Exercise } from "../../lib/session.ts";

/**
 * The exercises a learner can pick by name, in the order the home screen lists
 * them. Both groups have a "Translate": within a group the label is unique, and
 * the prompt itself (one word or a sentence) tells them apart in a session. Only built exercises belong here: an option that leads nowhere is worse
 * than no option.
 */
export const EXERCISES: { id: Exercise; label: string; group: "Words" | "Sentences" }[] = [
  { id: "typed", label: "Translate", group: "Words" },
  { id: "choice", label: "Multiple Choice", group: "Words" },
  { id: "match", label: "Match Pairs", group: "Words" },
  { id: "translate", label: "Translate", group: "Sentences" },
  { id: "gap", label: "Fill in the Blank", group: "Sentences" },
  { id: "mistake", label: "Find the Mistake", group: "Sentences" },
];
