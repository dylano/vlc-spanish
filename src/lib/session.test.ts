import { describe, expect, it } from "vite-plus/test";
import { grade } from "./grade.ts";
import {
  buildSession,
  confusableEntries,
  DEFAULT_CONFIG,
  glossIndex,
  isDrillable,
  MIXED_EN_ES_SHARE,
  promptGloss,
} from "./session.ts";
import type { Direction, Entry, ProgressBlob, VerbEntry } from "./schema.ts";
import { sm2 } from "./scheduler.ts";

const TODAY = "2026-09-15";

/** Deterministic generator so shuffles are reproducible. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

function word(id: string, en: string[], tags = ["test"]): Entry {
  return { id, es: id, en, pos: "adv", tags, added: TODAY };
}

const ser: VerbEntry = {
  id: "ser",
  es: "ser",
  en: ["to be"],
  pos: "verb",
  verb: { reflexive: false, regular: false },
  tags: ["verbs"],
  added: TODAY,
  notes: "For identity, traits, and origin.",
};

const estar: VerbEntry = {
  id: "estar",
  es: "estar",
  en: ["to be"],
  pos: "verb",
  verb: { reflexive: false, regular: false },
  tags: ["verbs"],
  added: TODAY,
  notes: "For location and temporary states.",
};

const tarde = word("tarde", ["afternoon", "evening"]);
const noche = word("noche", ["night", "evening"]);

function emptyProgress(userId = "dylan"): ProgressBlob {
  return { userId, entries: {} };
}

function withProgress(
  entries: [Entry, Direction, Partial<ReturnType<typeof sm2.create>>][],
  userId = "dylan",
): ProgressBlob {
  const blob = emptyProgress(userId);
  for (const [entry, direction, overrides] of entries) {
    blob.entries[entry.id] ??= {};
    blob.entries[entry.id]![direction] = {
      ...sm2.create(userId, entry.id, direction, TODAY),
      ...overrides,
    };
  }
  return blob;
}

describe("gloss collisions", () => {
  const entries = [ser, estar, tarde, noche];
  const index = glossIndex(entries);

  it("prefers a gloss no other entry claims", () => {
    expect(promptGloss(tarde, index)).toBe("afternoon");
    expect(promptGloss(noche, index)).toBe("night");
  });

  it("falls back to the first gloss when every one is shared", () => {
    expect(promptGloss(ser, index)).toBe("to be");
    expect(promptGloss(estar, index)).toBe("to be");
  });

  it("reports the entries sharing an unavoidable prompt", () => {
    expect(confusableEntries(ser, "to be", index).map((e) => e.id)).toEqual(["estar"]);
  });

  it("reports nothing for a gloss that is unique", () => {
    expect(confusableEntries(tarde, "afternoon", index)).toEqual([]);
  });

  it("explains the confusion instead of marking it plain wrong", () => {
    const result = grade(ser, "en→es", "estar", { confusableWith: [estar] });
    expect(result.result).toBe("hard");
    expect(result.note).toContain("estar");
    expect(result.note).toContain("ser");
  });

  it("still marks an unrelated answer wrong", () => {
    expect(grade(ser, "en→es", "tener", { confusableWith: [estar] }).result).toBe("wrong");
  });
});

describe("buildSession", () => {
  const entries = [
    word("uno", ["one"]),
    word("dos", ["two"]),
    word("tres", ["three"]),
    word("cuatro", ["four"]),
    word("cinco", ["five"]),
  ];

  it("returns no more cards than the requested size", () => {
    const cards = buildSession({
      entries,
      progress: emptyProgress(),
      userId: "dylan",
      config: { ...DEFAULT_CONFIG, size: 3, direction: "en→es" },
      today: TODAY,
      random: seeded(1),
    });
    expect(cards).toHaveLength(3);
  });

  it("gives every new card a fresh progress record", () => {
    const [card] = buildSession({
      entries,
      progress: emptyProgress(),
      userId: "dylan",
      config: { ...DEFAULT_CONFIG, size: 1, direction: "en→es" },
      today: TODAY,
      random: seeded(2),
    });
    expect(card?.progress.reps).toBe(0);
    expect(card?.progress.userId).toBe("dylan");
    expect(card?.progress.direction).toBe("en→es");
  });

  it("puts due cards before unseen ones", () => {
    const progress = withProgress([[entries[0]!, "en→es", { due: "2026-09-01", reps: 3 }]]);
    const cards = buildSession({
      entries,
      progress,
      userId: "dylan",
      config: { ...DEFAULT_CONFIG, size: 5, direction: "en→es", scope: "all" },
      today: TODAY,
      random: seeded(3),
    });
    expect(cards[0]?.entry.id).toBe("uno");
  });

  it("excludes cards that are not yet due from a due session", () => {
    const progress = withProgress(
      entries.map((entry) => [entry, "en→es" as Direction, { due: "2026-12-01", reps: 2 }]),
    );
    const cards = buildSession({
      entries,
      progress,
      userId: "dylan",
      config: { ...DEFAULT_CONFIG, direction: "en→es", scope: "due" },
      today: TODAY,
      random: seeded(4),
    });
    expect(cards).toHaveLength(0);
  });

  it("restricts a misses session to cards whose last answer was wrong", () => {
    const progress = withProgress([
      [entries[0]!, "en→es", { lapses: 2, lastResult: "wrong", due: "2026-12-01" }],
      [entries[1]!, "en→es", { lapses: 0, lastResult: "correct", due: "2026-12-01" }],
      // Lapsed in the past but since relearned: no longer a miss.
      [entries[2]!, "en→es", { lapses: 3, lastResult: "correct", due: "2026-12-01" }],
    ]);
    const cards = buildSession({
      entries,
      progress,
      userId: "dylan",
      config: { ...DEFAULT_CONFIG, direction: "en→es", scope: "misses" },
      today: TODAY,
      random: seeded(5),
    });
    expect(cards.map((card) => card.entry.id)).toEqual(["uno"]);
  });

  it("filters by tag", () => {
    const tagged = [word("familia", ["family"], ["family"]), word("lunes", ["monday"], ["days"])];
    const cards = buildSession({
      entries: tagged,
      progress: emptyProgress(),
      userId: "dylan",
      config: { ...DEFAULT_CONFIG, direction: "en→es", tags: ["days"] },
      today: TODAY,
      random: seeded(6),
    });
    expect(cards.map((card) => card.entry.id)).toEqual(["lunes"]);
  });

  it("never asks the same entry twice in one mixed session", () => {
    const cards = buildSession({
      entries,
      progress: emptyProgress(),
      userId: "dylan",
      config: { ...DEFAULT_CONFIG, size: 10, direction: "mixed" },
      today: TODAY,
      random: seeded(7),
    });
    const ids = cards.map((card) => card.entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("weights a mixed session toward english → spanish", () => {
    const many = Array.from({ length: 20 }, (_, i) => word(`w${i}`, [`word ${i}`]));
    const cards = buildSession({
      entries: many,
      progress: emptyProgress(),
      userId: "dylan",
      config: { ...DEFAULT_CONFIG, size: 20, direction: "mixed" },
      today: TODAY,
      random: seeded(8),
    });
    const forward = cards.filter((card) => card.direction === "en→es").length;
    expect(forward).toBe(Math.round(20 * MIXED_EN_ES_SHARE));
  });

  it("keeps progress and direction in step when a mixed session flips a card", () => {
    const cards = buildSession({
      entries,
      progress: emptyProgress(),
      userId: "dylan",
      config: { ...DEFAULT_CONFIG, size: 5, direction: "mixed" },
      today: TODAY,
      random: seeded(9),
    });
    for (const card of cards) {
      expect(card.progress.direction).toBe(card.direction);
      expect(card.progress.entryId).toBe(card.entry.id);
    }
  });

  it("attaches the chosen prompt and its confusables to each card", () => {
    const cards = buildSession({
      entries: [ser, estar],
      progress: emptyProgress(),
      userId: "dylan",
      config: { ...DEFAULT_CONFIG, size: 2, direction: "en→es" },
      today: TODAY,
      random: seeded(10),
    });
    for (const card of cards) {
      expect(card.prompt).toBe("to be");
      expect(card.confusableWith).toHaveLength(1);
    }
  });

  it("carries the hint only when the prompt is shared", () => {
    const cards = buildSession({
      entries: [
        { ...ser, hint: "identity, traits, origin" },
        { ...estar, hint: "location, temporary states" },
        { ...word("hoy", ["today"]), hint: "never needed" },
      ],
      progress: emptyProgress(),
      userId: "dylan",
      config: { ...DEFAULT_CONFIG, size: 3, direction: "en→es" },
      today: TODAY,
      random: seeded(10),
    });
    const hints = Object.fromEntries(cards.map((card) => [card.entry.id, card.hint]));
    expect(hints).toEqual({
      ser: "identity, traits, origin",
      estar: "location, temporary states",
      hoy: undefined,
    });
  });
});

describe("excluding numbers", () => {
  const cinco: Entry = {
    id: "cinco",
    es: "cinco",
    en: ["five"],
    pos: "number",
    value: 5,
    tags: ["numbers"],
    added: TODAY,
  };
  const casa: Entry = {
    id: "casa",
    es: "casa",
    en: ["house"],
    pos: "noun",
    gender: "f",
    tags: ["house"],
    added: TODAY,
  };

  it("treats numbers as not drillable", () => {
    expect(isDrillable(cinco)).toBe(false);
    expect(isDrillable(casa)).toBe(true);
  });

  it("keeps numbers out of an ordinary session", () => {
    const cards = buildSession({
      entries: [cinco, casa],
      progress: emptyProgress(),
      userId: "dylan",
      config: { ...DEFAULT_CONFIG, size: 10, direction: "en→es" },
      today: TODAY,
      random: seeded(11),
    });
    expect(cards.map((card) => card.entry.id)).toEqual(["casa"]);
  });

  it("includes them when the numbers tag is asked for by name", () => {
    const cards = buildSession({
      entries: [cinco, casa],
      progress: emptyProgress(),
      userId: "dylan",
      config: { ...DEFAULT_CONFIG, size: 10, direction: "en→es", tags: ["numbers"] },
      today: TODAY,
      random: seeded(12),
    });
    expect(cards.map((card) => card.entry.id)).toEqual(["cinco"]);
  });

  it("does not offer numbers even when they are the only words left", () => {
    const cards = buildSession({
      entries: [cinco],
      progress: emptyProgress(),
      userId: "dylan",
      config: { ...DEFAULT_CONFIG, size: 10, direction: "en→es" },
      today: TODAY,
      random: seeded(13),
    });
    expect(cards).toHaveLength(0);
  });
});
