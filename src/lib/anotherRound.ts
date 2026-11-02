/**
 * What the session summary's "go again" button says: one phrase per session,
 * for a bit of fun. Every one means "again", and none promises the same words.
 * The Spanish ones are marked so screen readers pronounce them as Spanish.
 */
export const ANOTHER_ROUND: readonly { text: string; lang?: "es" }[] = [
  { text: "Another round" },
  { text: "Do it again" },
  { text: "Run it back" },
  { text: "One more go" },
  { text: "One more time" },
  { text: "Hit me again" },
  { text: "Encore!" },
  { text: "¡Otra vez!", lang: "es" },
  { text: "¡Una más!", lang: "es" },
  { text: "¡Seguimos!", lang: "es" },
  { text: "¿Repetimos?", lang: "es" },
  { text: "¡A por otra!", lang: "es" },
];

/** A phrase for the button, never the one shown last time (`previous`). */
export function pickAnotherRound(
  previous: string | undefined,
  random: () => number = Math.random,
): (typeof ANOTHER_ROUND)[number] {
  const choices = ANOTHER_ROUND.filter((phrase) => phrase.text !== previous);
  return choices[Math.floor(random() * choices.length)]!;
}
