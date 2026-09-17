import { describe, expect, it } from "vite-plus/test";
import { grade } from "./grade.ts";
import {
  buildMatchRounds,
  buildMixedSession,
  buildSession,
  isMatchRound,
  MAX_RUN,
  NEW_WORD_EVERY,
  MATCH_ROUND_SIZE,
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

describe("matching rounds", () => {
  const family = ["padre", "madre", "hijo", "hija", "abuelo", "abuela", "primo"].map((id) =>
    word(id, [`${id} (en)`], ["family"]),
  );
  const traits = ["alto", "bajo", "rubio", "moreno", "guapo", "feo", "calvo"].map((id) =>
    word(id, [`${id} (en)`], ["physical-traits"]),
  );

  function rounds(entries: Entry[], size: number, seed = 5) {
    return buildMatchRounds({
      entries,
      progress: emptyProgress(),
      userId: "dylan",
      config: { ...DEFAULT_CONFIG, format: "match", size },
      today: TODAY,
      random: seeded(seed),
    });
  }

  it("counts size in words: eighteen words is three rounds of six", () => {
    const result = rounds(
      [
        ...family,
        ...traits,
        ...family.map((e) => ({ ...e, id: `${e.id}-x`, es: `${e.es}x`, en: [`${e.en[0]} x`] })),
      ],
      18,
    );
    expect(result).toHaveLength(3);
    for (const round of result) expect(round.cards).toHaveLength(MATCH_ROUND_SIZE);
  });

  it("keeps each round to one tag when there are enough words", () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (const round of rounds([...family, ...traits], 12, seed)) {
        const tags = new Set(round.cards.map((card) => card.entry.tags[0]));
        expect(tags.size).toBe(1);
      }
    }
  });

  it("never puts two interchangeable words in one round", () => {
    const people = [
      ser,
      estar,
      ...["ir", "tener", "hacer", "salir", "volver"].map((id) => ({
        ...ser,
        id,
        es: id,
        en: [`to ${id}`],
      })),
    ];
    for (let seed = 1; seed <= 10; seed++) {
      for (const round of rounds(people, 6, seed)) {
        const ids = round.cards.map((card) => card.entry.id);
        expect(ids.includes("ser") && ids.includes("estar")).toBe(false);
      }
    }
  });

  it("uses no word twice across the session", () => {
    const ids = rounds([...family, ...traits], 12).flatMap((round) =>
      round.cards.map((card) => card.entry.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("makes a smaller last round rather than dropping words", () => {
    const result = rounds(family.slice(0, 4), 18);
    expect(result).toHaveLength(1);
    expect(result[0]!.cards).toHaveLength(4);
  });

  it("makes no round from a single word", () => {
    expect(rounds(family.slice(0, 1), 6)).toEqual([]);
  });

  it("marks every card as a matching card with a direction and progress", () => {
    for (const round of rounds([...family, ...traits], 12)) {
      expect(round.exercise).toBe("match");
      for (const card of round.cards) {
        expect(card.exercise).toBe("match");
        expect(card.progress.direction).toBe(card.direction);
      }
    }
  });
});

describe("mixed sessions", () => {
  // Spread seeds apart so consecutive ones do not shuffle almost identically.
  const spread = (seed: number) => seeded(seed * 2_654_435_761);
  const tags = ["family", "physical-traits", "character-traits", "verbs"];
  const pool: Entry[] = Array.from({ length: 48 }, (_, i) =>
    word(`palabra${i}`, [`word ${i}`], [tags[i % tags.length]!]),
  );

  function mixed(entries: Entry[], size: number, seed: number) {
    return buildMixedSession({
      entries,
      progress: emptyProgress(),
      userId: "dylan",
      config: { ...DEFAULT_CONFIG, format: "mixed", size },
      today: TODAY,
      random: spread(seed),
    });
  }

  const wordsIn = (items: ReturnType<typeof mixed>) =>
    items.flatMap((item) => (isMatchRound(item) ? item.cards : [item]));

  it("covers exactly the requested number of words, each once", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const ids = wordsIn(mixed(pool, 15, seed)).map((card) => card.entry.id);
      expect(ids).toHaveLength(15);
      expect(new Set(ids).size).toBe(15);
    }
  });

  it("uses every exercise across sessions", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      for (const item of mixed(pool, 15, seed)) seen.add(item.exercise);
    }
    expect([...seen].sort()).toEqual(["choice", "match", "typed"]);
  });

  it("never runs one exercise more than the limit in a row", () => {
    for (let seed = 1; seed <= 40; seed++) {
      let run = 0;
      let last = "";
      for (const item of mixed(pool, 30, seed)) {
        run = item.exercise === last ? run + 1 : 1;
        last = item.exercise;
        expect(run).toBeLessThanOrEqual(MAX_RUN);
      }
    }
  });

  it("gives multiple-choice cards options and leaves typed cards without", () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (const item of mixed(pool, 15, seed)) {
        if (isMatchRound(item)) continue;
        if (item.exercise === "choice") expect(item.options?.length).toBeGreaterThan(1);
        else expect(item.options).toBeUndefined();
      }
    }
  });

  it("makes no matching round from too few words", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const items = mixed(pool.slice(0, 5), 15, seed);
      expect(items.some(isMatchRound)).toBe(false);
      expect(wordsIn(items)).toHaveLength(5);
    }
  });

  it("still covers every word when the words cannot form a round", () => {
    // Everything shares one gloss, so no two words can be paired in a round.
    const clones = Array.from({ length: 8 }, (_, i) => word(`to-be-${i}`, ["to be"]));
    for (let seed = 1; seed <= 10; seed++) {
      const items = mixed(clones, 8, seed);
      expect(items.some(isMatchRound)).toBe(false);
      expect(wordsIn(items)).toHaveLength(8);
    }
  });

  it("is reproducible from a seed", () => {
    expect(mixed(pool, 15, 3)).toEqual(mixed(pool, 15, 3));
  });
});

describe("new words versus reviews", () => {
  const spread = (seed: number) => seeded(seed * 2_654_435_761);
  const words = Array.from({ length: 40 }, (_, i) => word(`w${i}`, [`word ${i}`]));
  const reviewed = words.slice(0, 20);
  const brandNew = new Set(words.slice(20).map((w) => w.id));

  // Twenty words met before and all due today, in both directions.
  const progress = withProgress(
    reviewed.flatMap((w) => [
      [w, "en→es", { due: TODAY, reps: 1 }],
      [w, "es→en", { due: TODAY, reps: 1 }],
    ]) as [Entry, Direction, { due: string; reps: number }][],
  );

  function session(seed: number, extra: Partial<typeof DEFAULT_CONFIG> = {}, prog = progress) {
    return buildSession({
      entries: words,
      progress: prog,
      userId: "dylan",
      config: { ...DEFAULT_CONFIG, size: 15, ...extra },
      today: TODAY,
      random: spread(seed),
    });
  }

  it("keeps every third card for a new word even when plenty is due", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const cards = session(seed);
      const fresh = cards.filter((card) => brandNew.has(card.entry.id)).length;
      expect(fresh).toBe(Math.floor(15 / NEW_WORD_EVERY));
      cards.forEach((card, position) => {
        expect(brandNew.has(card.entry.id)).toBe(position % NEW_WORD_EVERY === NEW_WORD_EVERY - 1);
      });
    }
  });

  it("is all new words when nothing is due", () => {
    for (const card of session(1, {}, emptyProgress())) expect(card.progress.reps).toBe(0);
    expect(session(1, {}, emptyProgress())).toHaveLength(15);
  });

  it("does not let the other direction of a met word take a new word's place", () => {
    // Twenty words met in one direction only, none due: their other direction is unseen.
    const oneWay = withProgress(
      reviewed.map((w) => [w, "en→es", { due: "2026-12-01", reps: 3 }]) as [
        Entry,
        Direction,
        { due: string; reps: number },
      ][],
    );
    for (let seed = 1; seed <= 10; seed++) {
      const ids = session(seed, {}, oneWay).map((card) => card.entry.id);
      expect(ids.every((id) => brandNew.has(id))).toBe(true);
    }
  });

  it("falls back to the other direction once there are no new words", () => {
    const allMetOneWay = withProgress(
      words.map((w) => [w, "en→es", { due: "2026-12-01", reps: 3 }]) as [
        Entry,
        Direction,
        { due: string; reps: number },
      ][],
    );
    const cards = session(1, { direction: "es→en" }, allMetOneWay);
    expect(cards).toHaveLength(15);
  });

  it("offers a brand-new word in only one direction", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const ids = session(seed, { scope: "recent" }).map((card) => card.entry.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("gives Focus on new words brand-new words before other directions", () => {
    const oneWay = withProgress(
      reviewed.map((w) => [w, "en→es", { due: "2026-12-01", reps: 3 }]) as [
        Entry,
        Direction,
        { due: string; reps: number },
      ][],
    );
    const cards = session(2, { scope: "recent", size: 25 }, oneWay);
    const firstOther = cards.findIndex((card) => !brandNew.has(card.entry.id));
    expect(firstOther).toBe(20);
  });
});
