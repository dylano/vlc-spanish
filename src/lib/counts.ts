import type { IsoDate } from "./dates.ts";
import { isDue } from "./scheduler.ts";
import { DIRECTIONS, type Direction, type Entry, type ProgressBlob } from "./schema.ts";

/**
 * Home-screen totals.
 *
 * Everything here is counted **per word**, not per card. Scheduling tracks a
 * word separately in each direction, so a 159-word dictionary holds up to 318
 * cards — mixing the two units produced a "new" count that ignored words
 * practised in the es→en direction.
 *
 * Per-word also matches what a session actually serves: a mixed session asks
 * each word at most once.
 */
export interface Counts {
  /** Words in the dictionary. */
  total: number;
  /** Words with at least one direction ready to review. */
  due: number;
  /** Words never practised in either direction. */
  unseen: number;
  /** Words whose most recent answer was wrong, in either direction. */
  missed: number;
}

export function countWords(entries: Entry[], progress: ProgressBlob, today: IsoDate): Counts {
  let due = 0;
  let unseen = 0;
  let missed = 0;

  for (const entry of entries) {
    const records = progress.entries[entry.id];
    let seenAny = false;
    let dueAny = false;
    let missedAny = false;

    for (const direction of DIRECTIONS as readonly Direction[]) {
      const record = records?.[direction];
      if (!record) continue;
      seenAny = true;
      if (isDue(record, today)) dueAny = true;
      // "Currently unlearned", not "ever got wrong": answering correctly again
      // clears a word from the misses list rather than marking it forever.
      if (record.lastResult === "wrong") missedAny = true;
    }

    if (!seenAny) unseen += 1;
    if (dueAny) due += 1;
    if (missedAny) missed += 1;
  }

  return { total: entries.length, due, unseen, missed };
}
