import { describe, expect, it } from "vite-plus/test";
import raw from "../../data/release-note.json";
import {
  currentNote,
  emphasis,
  releaseNoteFileSchema,
  SHOW_DAYS,
  visibleNote,
} from "./releaseNote.ts";

const note = { date: "2026-10-14", title: "Object pronouns", body: "Now *lo* and *la*." };
const next = { date: "2026-10-28", title: "Infinitives", body: "Now *lo quiero comprar*." };

describe("the release note", () => {
  it("shows for a week from its date, counting the date itself", () => {
    expect(visibleNote([note], "2026-10-14", undefined)).toBe(note);
    expect(visibleNote([note], "2026-10-20", undefined)).toBe(note);
    expect(SHOW_DAYS).toBe(7);
    expect(visibleNote([note], "2026-10-21", undefined)).toBeUndefined();
  });

  it("waits for its date", () => {
    expect(visibleNote([note], "2026-10-13", undefined)).toBeUndefined();
  });

  it("stays dismissed, edited or not, until a note with a later date", () => {
    expect(visibleNote([note], "2026-10-15", note.date)).toBeUndefined();
    expect(
      visibleNote([{ ...note, title: "Typo fixed" }], "2026-10-15", note.date),
    ).toBeUndefined();
    expect(visibleNote([next, note], "2026-10-28", note.date)).toBe(next);
  });

  it("shows only the latest note that has started, whatever the file order", () => {
    expect(currentNote([note, next], "2026-10-28")).toBe(next);
    expect(currentNote([next, note], "2026-10-20")).toBe(note);
    expect(visibleNote([next, note], "2026-10-20", undefined)).toBe(note);
  });

  it("never falls back to an older note once the latest is dismissed or over", () => {
    const close = { ...next, date: "2026-10-16" };
    expect(visibleNote([close, note], "2026-10-17", close.date)).toBeUndefined();
    expect(visibleNote([close, note], "2026-10-23", undefined)).toBeUndefined();
  });

  it("shows nothing when there are no notes", () => {
    expect(visibleNote([], "2026-10-14", undefined)).toBeUndefined();
  });

  it("refuses two notes on the same date", () => {
    expect(releaseNoteFileSchema.safeParse([note, { ...next, date: note.date }]).success).toBe(
      false,
    );
  });

  it("sets starred words in italics, and leaves a lone star as typed", () => {
    expect(emphasis("Now *lo* and *la*.")).toEqual([
      { text: "Now ", italic: false },
      { text: "lo", italic: true },
      { text: " and ", italic: false },
      { text: "la", italic: true },
      { text: ".", italic: false },
    ]);
    expect(emphasis("5 * 3")).toEqual([{ text: "5 * 3", italic: false }]);
  });

  it("ships a note file that parses, newest first", () => {
    const parsed = releaseNoteFileSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    const dates = parsed.data!.map((entry) => entry.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});
