import type { Exercise } from "../../lib/session.ts";

/**
 * The exercises a learner can pick by name, in the order the home screen lists
 * them. Only built exercises belong here: an option that leads nowhere is worse
 * than no option.
 */
export const EXERCISES: { id: Exercise; label: string; group: "Words" | "Sentences" }[] = [
  { id: "typed", label: "Type it", group: "Words" },
  { id: "choice", label: "Pick one", group: "Words" },
  { id: "match", label: "Match pairs", group: "Words" },
  { id: "gap", label: "Fill the gap", group: "Sentences" },
];
