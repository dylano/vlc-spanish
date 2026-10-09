import type { Entry, ProgressBlob } from "./schema.ts";

/**
 * The words that have given trouble, for the Problem words list and the
 * sessions that drill it. This is history: a word stays on it after it is
 * answered right again, until it is removed from the list.
 */
export interface ProblemWord {
  entry: Entry;
  /** Misses in both directions, ever (`lapses`). */
  missed: number;
  /** Whether the most recent answer in either direction was wrong. */
  wrongLast: boolean;
}

/** Whether a word belongs on the Problem words list: missed at least once, in either direction. */
export function isProblem(entry: Entry, progress: ProgressBlob): boolean {
  return Object.values(progress.entries[entry.id] ?? {}).some(
    (record) => !!record && record.lapses > 0,
  );
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
