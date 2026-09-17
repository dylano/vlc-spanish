import { describe, expect, it } from "vite-plus/test";
import { entries } from "../../app/dictionary.ts";
import { sentences } from "../../app/sentences.ts";
import { normalize } from "../normalize.ts";
import type { ProgressBlob } from "../schema.ts";
import {
  buildGapSession,
  buildMistakeSession,
  buildMixedSession,
  buildTranslateSession,
  DEFAULT_CONFIG,
  isDrillable,
  isMatchRound,
  MAX_EARLY_SENTENCES,
} from "../session.ts";
import { gapTargets } from "./gap.ts";
import { gradeFix, mistakeTokens, renderMistake, type Mistake } from "./mistake.ts";

function seeded(seed: number): () => number {
  let state = (seed * 2_654_435_761) % 4_294_967_296;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

const targets = gapTargets(sentences.frames, { dictionary: entries });
const context = (seed: number) => ({
  dictionary: entries,
  glue: sentences.glue,
  random: seeded(seed),
});

/** Mistakes aimed at an entry across many seeds. */
function mistakes(entryId: string, seeds = 60): Mistake[] {
  const out: Mistake[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const mistake = renderMistake(entryId, targets, context(seed));
    if (mistake) out.push(mistake);
  }
  return out;
}

const broken = (mistake: Mistake) =>
  mistakeTokens(mistake)
    .map((token) => token.text)
    .join("");

describe("making a mistake", () => {
  it("breaks adjective agreement and explains it", () => {
    const found = mistakes("timido").filter((m) => m.kind === "agreement");
    expect(found.length).toBeGreaterThan(0);
    for (const mistake of found) {
      expect(normalize(mistake.wrong)).not.toBe(normalize(mistake.right));
      expect(mistake.explanation).toMatch(/is (masculine|feminine) (singular|plural), so tímid/);
    }
  });

  it("breaks a verb's person and names the subject", () => {
    const found = mistakes("cenar").filter((m) => m.kind === "person");
    expect(found.length).toBeGreaterThan(0);
    for (const mistake of found) expect(mistake.explanation).toMatch(/^for .+ it is /);
  });

  it("swaps an article on a noun with one gender, never on a common-gender noun", () => {
    expect(mistakes("hospital").some((m) => m.kind === "article")).toBe(true);
    expect(mistakes("estudiante").some((m) => m.kind === "article")).toBe(false);
  });

  it("breaks a profession's gender to disagree with the person", () => {
    const found = mistakes("enfermero").filter((m) => m.kind === "agreement");
    expect(found.length).toBeGreaterThan(0);
    for (const mistake of found)
      expect(mistake.explanation).toMatch(
        /^it describes .+, who is (male|female), so enfermer[oa]$/,
      );
  });

  it("always changes exactly the broken text, and the rest of the sentence reads as before", () => {
    for (const id of ["timido", "cenar", "hospital", "enfermero", "levantarse", "alto"]) {
      for (const mistake of mistakes(id, 20)) {
        const shown = broken(mistake);
        expect(normalize(shown)).not.toBe(normalize(mistake.sentence.es));
        // Case-insensitive: a broken word that starts the sentence is capitalized.
        const restored = normalize(shown).replace(
          normalize(mistake.wrong),
          normalize(mistake.right),
        );
        expect(normalize(restored)).toBe(normalize(mistake.sentence.es));
      }
    }
  });

  it("marks the words of the broken text as the ones to tap", () => {
    for (const mistake of mistakes("cenar", 10)) {
      const tapped = mistakeTokens(mistake)
        .filter((token) => token.broken)
        .map((token) => token.text.toLowerCase())
        .join("");
      expect(tapped).toBe(normalize(mistake.wrong));
    }
  });
});

describe("grading a fix", () => {
  const [mistake] = mistakes("timido").filter((m) => m.kind === "agreement");

  it("accepts the right form", () => {
    expect(gradeFix(mistake!, mistake!.right).result).toBe("correct");
  });

  it("calls a missing accent almost", () => {
    expect(gradeFix(mistake!, mistake!.right.replace("í", "i")).result).toBe("hard");
  });

  it("does not accept the mistake typed back", () => {
    const result = gradeFix(mistake!, mistake!.wrong);
    expect(result.result).toBe("wrong");
    expect(result.note).toMatch(/^that is the mistake itself/);
  });

  it("accepts just the changed word when a phrase has one word wrong", () => {
    const phrase = mistakes("hacer-la-cama").find(
      (m) => m.kind === "person" && m.right.split(" ").length === 3,
    );
    if (!phrase) return;
    expect(gradeFix(phrase, phrase.right.split(" ")[0]!).result).toBe("correct");
  });
});

describe("sessions with mistakes", () => {
  const all: ProgressBlob = { userId: "dylan", entries: {} };
  for (const e of entries.filter(isDrillable)) {
    all.entries[e.id] = {
      "en→es": {
        userId: "dylan",
        entryId: e.id,
        direction: "en→es",
        due: "2026-09-17",
        interval: 1,
        ease: 2.5,
        reps: 1,
        lapses: 0,
      },
    };
  }
  const options = (seed: number, format: "mistake" | "mixed") => ({
    entries,
    progress: all,
    userId: "dylan",
    config: { ...DEFAULT_CONFIG, format, size: 15, scope: "all" as const },
    today: "2026-09-17",
    random: seeded(seed),
    sentences,
  });

  it("aims each mistake at the card's own word, asked in Spanish", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const cards = buildMistakeSession(options(seed, "mistake"));
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        expect(card.exercise).toBe("mistake");
        expect(card.mistake?.entryId).toBe(card.entry.id);
        expect(card.direction).toBe("en→es");
        expect(card.progress.direction).toBe("en→es");
      }
    }
  });

  it("offers none before enough words have been practiced", () => {
    expect(
      buildMistakeSession({ ...options(1, "mistake"), progress: { userId: "dylan", entries: {} } }),
    ).toEqual([]);
  });

  it("mixes mistakes into Practice", () => {
    let count = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const item of buildMixedSession(options(seed, "mixed"))) {
        if (!isMatchRound(item) && item.exercise === "mistake") count++;
      }
    }
    expect(count).toBeGreaterThan(0);
  });
});

describe("sessions with translations", () => {
  const all: ProgressBlob = { userId: "dylan", entries: {} };
  for (const e of entries.filter(isDrillable)) {
    all.entries[e.id] = {
      "en→es": {
        userId: "dylan",
        entryId: e.id,
        direction: "en→es",
        due: "2026-09-17",
        interval: 1,
        ease: 2.5,
        reps: 1,
        lapses: 0,
      },
    };
  }
  const options = (seed: number, format: "translate" | "mixed", progress = all) => ({
    entries,
    progress,
    userId: "dylan",
    config: { ...DEFAULT_CONFIG, format, size: 15, scope: "all" as const },
    today: "2026-09-17",
    random: seeded(seed),
    sentences,
  });

  it("builds sentences that contain the card's own word, from practiced words only", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const cards = buildTranslateSession(options(seed, "translate"));
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        expect(card.exercise).toBe("translate");
        const fills = Object.values(card.translation!.sentence.fills);
        expect(fills).toContain(card.entry.id);
        for (const id of fills) {
          const used = entries.find((e) => e.id === id)!;
          expect(all.entries[id] !== undefined || !isDrillable(used)).toBe(true);
        }
      }
    }
  });

  it("offers none before enough words have been practiced", () => {
    expect(
      buildTranslateSession(options(1, "translate", { userId: "dylan", entries: {} })),
    ).toEqual([]);
  });

  it("appears in Practice, but rarely", () => {
    let translations = 0;
    let items = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const item of buildMixedSession(options(seed, "mixed"))) {
        items++;
        if (!isMatchRound(item) && item.exercise === "translate") translations++;
      }
    }
    expect(translations).toBeGreaterThan(0);
    expect(translations / items).toBeLessThan(0.15);
  });
});

describe("sentence sessions right after practicing", () => {
  // Eighty words practiced recently, half today and half two days ago: nothing is
  // due until tomorrow.
  const justPracticed: ProgressBlob = { userId: "dylan", entries: {} };
  for (const [position, e] of entries.filter(isDrillable).slice(0, 80).entries()) {
    justPracticed.entries[e.id] = {
      "en→es": {
        userId: "dylan",
        entryId: e.id,
        direction: "en→es",
        due: "2026-09-18",
        interval: 1,
        ease: 2.5,
        reps: 1,
        lapses: 0,
        lastSeen: position % 2 === 0 ? "2026-09-15" : "2026-09-17",
      },
    };
  }
  const options = (format: "gap" | "mistake" | "translate" | "mixed", seed = 1) => ({
    entries,
    progress: justPracticed,
    userId: "dylan",
    config: { ...DEFAULT_CONFIG, format, scope: "due" as const, size: 10 },
    today: "2026-09-17",
    random: seeded(seed),
    sentences,
  });

  it("still builds a session of one sentence exercise, from words practiced earlier", () => {
    expect(buildTranslateSession(options("translate")).length).toBe(10);
    expect(buildMistakeSession(options("mistake")).length).toBe(10);
    expect(buildGapSession(options("gap")).length).toBeGreaterThan(0);
  });

  it("still has sentences in General practice, aimed at the words seen longest ago", () => {
    let sentenceItems = 0;
    let seenToday = 0;
    for (let seed = 1; seed <= 10; seed++) {
      let inSession = 0;
      for (const item of buildMixedSession(options("mixed", seed))) {
        if (isMatchRound(item) || !["gap", "mistake", "translate"].includes(item.exercise))
          continue;
        sentenceItems++;
        // Nothing is due, so every sentence is an early review, and those are capped.
        expect(++inSession).toBeLessThanOrEqual(MAX_EARLY_SENTENCES);
        if (justPracticed.entries[item.entry.id]?.["en→es"]?.lastSeen === "2026-09-17") seenToday++;
      }
    }
    expect(sentenceItems).toBeGreaterThan(20);
    // Forty words from two days ago cover a session's sentences before today's are reached.
    expect(seenToday).toBe(0);
  });
});
