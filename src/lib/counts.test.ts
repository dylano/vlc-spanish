import { describe, expect, it } from "vite-plus/test";
import { countWords } from "./counts.ts";
import { sm2 } from "./scheduler.ts";
import type { Direction, Entry, ProgressBlob } from "./schema.ts";

const TODAY = "2026-09-15";

function word(id: string): Entry {
  return { id, es: id, en: [id], pos: "adv", tags: ["test"], added: TODAY };
}

const entries = [word("uno"), word("dos"), word("tres")];

function blob(rows: [string, Direction, Partial<ReturnType<typeof sm2.create>>][]): ProgressBlob {
  const out: ProgressBlob = { userId: "dylan", entries: {} };
  for (const [id, direction, overrides] of rows) {
    out.entries[id] ??= {};
    out.entries[id]![direction] = { ...sm2.create("dylan", id, direction, TODAY), ...overrides };
  }
  return out;
}

describe("countWords", () => {
  it("counts every word as unseen before any practice", () => {
    const counts = countWords(entries, blob([]), TODAY);
    expect(counts).toEqual({ total: 3, due: 0, unseen: 3, missed: 0 });
  });

  it("stops counting a word as new once it is practised in either direction", () => {
    // Regression: only en→es was checked, so a word drilled spanish → english
    // stayed in the "new" total forever.
    const counts = countWords(
      entries,
      blob([["uno", "es→en", { due: "2026-12-01", reps: 1 }]]),
      TODAY,
    );
    expect(counts.unseen).toBe(2);
  });

  it("counts a word once even when both directions are due", () => {
    const counts = countWords(
      entries,
      blob([
        ["uno", "en→es", { due: "2026-09-01", reps: 2 }],
        ["uno", "es→en", { due: "2026-09-02", reps: 2 }],
      ]),
      TODAY,
    );
    expect(counts.due).toBe(1);
  });

  it("never reports more due or missed than there are words", () => {
    const rows = entries.flatMap(
      (entry) =>
        [
          [entry.id, "en→es", { due: "2026-09-01", lapses: 1 }],
          [entry.id, "es→en", { due: "2026-09-01", lapses: 1 }],
        ] as [string, Direction, Record<string, unknown>][],
    );
    const counts = countWords(entries, blob(rows), TODAY);
    expect(counts.due).toBeLessThanOrEqual(counts.total);
    expect(counts.missed).toBeLessThanOrEqual(counts.total);
    expect(counts.due).toBe(3);
  });

  it("does not count a scheduled future card as due", () => {
    const counts = countWords(
      entries,
      blob([["uno", "en→es", { due: "2026-12-01", reps: 1 }]]),
      TODAY,
    );
    expect(counts.due).toBe(0);
    expect(counts.unseen).toBe(2);
  });

  it("counts a word whose last answer was wrong as missed", () => {
    const counts = countWords(
      entries,
      blob([["uno", "en→es", { lapses: 1, lastResult: "wrong", due: "2026-12-01" }]]),
      TODAY,
    );
    expect(counts.missed).toBe(1);
  });

  it("clears a word from misses once it is answered correctly again", () => {
    // The word still carries a lapse from the earlier mistake, but it is no
    // longer unlearned, so it should not keep showing up as a miss.
    const counts = countWords(
      entries,
      blob([["uno", "en→es", { lapses: 1, lastResult: "correct", reps: 2, due: "2026-12-01" }]]),
      TODAY,
    );
    expect(counts.missed).toBe(0);
  });

  it("clears a word from misses when the retry was only almost right", () => {
    const counts = countWords(
      entries,
      blob([["uno", "en→es", { lapses: 2, lastResult: "hard", reps: 1, due: "2026-12-01" }]]),
      TODAY,
    );
    expect(counts.missed).toBe(0);
  });

  it("reproduces the reported case: 11 cards across both directions", () => {
    const many = Array.from({ length: 159 }, (_, i) => word(`w${i}`));
    const rows: [string, Direction, Record<string, unknown>][] = [
      ...Array.from(
        { length: 8 },
        (_, i) =>
          [`w${i}`, "en→es", { reps: 1, due: "2026-09-16" }] as [
            string,
            Direction,
            Record<string, unknown>,
          ],
      ),
      ...Array.from(
        { length: 3 },
        (_, i) =>
          [`w${100 + i}`, "es→en", { reps: 1, due: "2026-09-16" }] as [
            string,
            Direction,
            Record<string, unknown>,
          ],
      ),
    ];
    const counts = countWords(many, blob(rows), TODAY);
    expect(counts.unseen).toBe(148);
    expect(counts.total).toBe(159);
  });
});
