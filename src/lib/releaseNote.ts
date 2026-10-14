import { z } from "zod";
import { daysBetween, type IsoDate } from "./dates.ts";

/*
 * The "what's new" note on Home: one short note, written by hand in
 * data/release-note.json and shipped with a deploy, shown for a week from its
 * date or until it is dismissed on this device. Only the latest note exists; a
 * new one replaces it.
 */

/** Days a note shows, counting its date as the first. */
export const SHOW_DAYS = 7;

export const releaseNoteSchema = z.object({
  /** The day the note is for, YYYY-MM-DD: it shows from then for SHOW_DAYS. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1),
  /** Plain text; *asterisks* set Spanish words in italics. */
  body: z.string().min(1),
});
export type ReleaseNote = z.infer<typeof releaseNoteSchema>;

/** The file holds one note, or null for none. */
export const releaseNoteFileSchema = releaseNoteSchema.nullable();

/**
 * The note to show today, or undefined: none, not yet, over a week old, or
 * dismissed. `dismissedThrough` is the date of the last note dismissed on this
 * device; only a note dated later shows. Editing a note keeps it dismissed; a
 * second note on the same date would not show, so a new note takes a new date.
 */
export function visibleNote(
  note: ReleaseNote | null | undefined,
  today: IsoDate,
  dismissedThrough: IsoDate | undefined,
): ReleaseNote | undefined {
  if (!note || (dismissedThrough !== undefined && note.date <= dismissedThrough)) return undefined;
  const age = daysBetween(note.date, today);
  return age >= 0 && age < SHOW_DAYS ? note : undefined;
}

/** The body as runs of text, italic where it was *starred*. An unmatched star is left as typed. */
export function emphasis(body: string): { text: string; italic: boolean }[] {
  const runs: { text: string; italic: boolean }[] = [];
  let last = 0;
  for (const match of body.matchAll(/\*([^*]+)\*/g)) {
    if (match.index > last) runs.push({ text: body.slice(last, match.index), italic: false });
    runs.push({ text: match[1]!, italic: true });
    last = match.index + match[0].length;
  }
  if (last < body.length) runs.push({ text: body.slice(last), italic: false });
  return runs;
}
