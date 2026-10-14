import { describe, expect, it } from "vite-plus/test";
import raw from "../../data/release-note.json";
import { emphasis, releaseNoteFileSchema, SHOW_DAYS, visibleNote } from "./releaseNote.ts";

const note = { date: "2026-10-14", title: "Object pronouns", body: "Now *lo* and *la*." };

describe("the release note", () => {
  it("shows for a week from its date, counting the date itself", () => {
    expect(visibleNote(note, "2026-10-14", undefined)).toBe(note);
    expect(visibleNote(note, "2026-10-20", undefined)).toBe(note);
    expect(SHOW_DAYS).toBe(7);
    expect(visibleNote(note, "2026-10-21", undefined)).toBeUndefined();
  });

  it("waits for its date", () => {
    expect(visibleNote(note, "2026-10-13", undefined)).toBeUndefined();
  });

  it("stays dismissed, edited or not, until a note with a later date", () => {
    expect(visibleNote(note, "2026-10-15", note.date)).toBeUndefined();
    expect(visibleNote({ ...note, title: "Typo fixed" }, "2026-10-15", note.date)).toBeUndefined();
    const next = { ...note, date: "2026-10-28", title: "Infinitives" };
    expect(visibleNote(next, "2026-10-28", note.date)).toBe(next);
  });

  it("shows nothing when there is no note", () => {
    expect(visibleNote(null, "2026-10-14", undefined)).toBeUndefined();
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

  it("ships a note file that parses", () => {
    expect(releaseNoteFileSchema.safeParse(raw).success).toBe(true);
  });
});
