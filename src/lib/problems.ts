import type { Entry, ProgressBlob } from "./schema.ts";

/**
 * The words that have given trouble, for the Problem words list. Unlike the
 * Focus on problem words session, which drills words answered wrong last time,
 * this is history: a word stays on it after it is answered right again.
 */
export interface ProblemWord {
  entry: Entry;
  /** Misses in both directions, ever (`lapses`). */
  missed: number;
  /** Whether the most recent answer in either direction was wrong: the Focus session's rule. */
  wrongLast: boolean;
}

/** Every word missed at least once, most missed first; ties put a word still wrong first. */
export function problemWords(entries: Entry[], progress: ProgressBlob): ProblemWord[] {
  const out: (ProblemWord & { ease: number })[] = [];
  for (const entry of entries) {
    const records = Object.values(progress.entries[entry.id] ?? {}).filter((record) => !!record);
    const missed = records.reduce((sum, record) => sum + record.lapses, 0);
    if (missed === 0) continue;
    out.push({
      entry,
      missed,
      wrongLast: records.some((record) => record.lastResult === "wrong"),
      // Lower ease is harder: it breaks ties between words missed as often.
      ease: Math.min(...records.map((record) => record.ease)),
    });
  }
  return out
    .sort(
      (a, b) =>
        b.missed - a.missed ||
        Number(b.wrongLast) - Number(a.wrongLast) ||
        a.ease - b.ease ||
        a.entry.es.localeCompare(b.entry.es, "es"),
    )
    .map(({ entry, missed, wrongLast }) => ({ entry, missed, wrongLast }));
}
