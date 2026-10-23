import { z } from "zod";
import { daysBetween, type IsoDate } from "./dates.ts";

/*
 * The "what's new" note on Home: short notes, written by hand in
 * data/release-note.json and shipped with a deploy. The file keeps every note,
 * newest first; Home shows only the latest one that has started, for a week
 * from its date or until it is dismissed on this device.
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

/**
 * The file holds every note, newest first. Dates are unique: a dismissal is
 * remembered by date, so a second note on the same day would never show.
 */
export const releaseNoteFileSchema = z
  .array(releaseNoteSchema)
  .refine((notes) => new Set(notes.map((note) => note.date)).size === notes.length, {
    message: "two notes share a date",
  });

/** The latest note whose date has come, whatever order the file is in. */
export function currentNote(
  notes: readonly ReleaseNote[],
  today: IsoDate,
): ReleaseNote | undefined {
  let latest: ReleaseNote | undefined;
  for (const note of notes) {
    if (note.date <= today && (!latest || note.date > latest.date)) latest = note;
  }
  return latest;
}

/**
 * The note to show today, or undefined: none yet, the latest over a week old,
 * or dismissed. Only the latest note that has started can show; an older one
 * never comes back, even when the latest is dismissed. `dismissedThrough` is
 * the date of the last note dismissed on this device; only a note dated later
 * shows, so editing a note keeps it dismissed.
 */
export function visibleNote(
  notes: readonly ReleaseNote[],
  today: IsoDate,
  dismissedThrough: IsoDate | undefined,
): ReleaseNote | undefined {
  const note = currentNote(notes, today);
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
