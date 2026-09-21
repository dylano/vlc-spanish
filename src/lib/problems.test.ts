import { describe, expect, it } from "vite-plus/test";
import { problemWords } from "./problems.ts";
import type { Entry, Progress, ProgressBlob } from "./schema.ts";

const base = { tags: ["test"], added: "2026-09-21" };
const word = (id: string): Entry => ({ ...base, id, es: id, en: [id], pos: "adv" });
const record = (lapses: number, lastResult: Progress["lastResult"], ease = 2.5): Progress => ({
  userId: "me",
  entryId: "x",
  direction: "en→es",
  due: "2026-09-21",
  interval: 1,
  ease,
  reps: 1,
  lapses,
  lastResult,
});

const entries = ["a", "b", "c", "d", "e"].map(word);
const progress: ProgressBlob = {
  userId: "me",
  entries: {
    a: { "en→es": record(1, "correct"), "es→en": record(2, "correct") },
    b: { "en→es": record(3, "wrong") },
    c: { "en→es": record(3, "correct") },
    d: { "en→es": record(0, "correct") },
    e: { "en→es": record(3, "correct", 1.8) },
  },
};

describe("problem words", () => {
  it("counts misses in both directions and leaves out words never missed", () => {
    const list = problemWords(entries, progress);
    expect(list.find((item) => item.entry.id === "a")?.missed).toBe(3);
    expect(list.map((item) => item.entry.id)).not.toContain("d");
  });

  it("keeps a word answered right since, but says so", () => {
    expect(problemWords(entries, progress).find((item) => item.entry.id === "c")?.wrongLast).toBe(
      false,
    );
  });

  it("puts the most missed first, then a word still wrong, then the harder word", () => {
    expect(problemWords(entries, progress).map((item) => item.entry.id)).toEqual([
      "b",
      "e",
      "a",
      "c",
    ]);
  });
});
