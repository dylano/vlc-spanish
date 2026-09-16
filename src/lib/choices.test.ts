import { describe, expect, it } from "vite-plus/test";
import { CHOICE_COUNT, choiceOptions, optionText } from "./choices.ts";
import type { Direction, Entry, NounEntry, ProgressBlob } from "./schema.ts";
import { buildSession, DEFAULT_CONFIG } from "./session.ts";

const TODAY = "2026-09-16";
const base = { added: TODAY };

function seeded(seed: number): () => number {
  // Spread small seeds apart: consecutive seeds would otherwise start this
  // generator on nearly the same first value, and shuffle almost identically.
  let state = (seed * 2_654_435_761) % 4_294_967_296;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

function noun(id: string, en: string, gender: "m" | "f", tags = ["family"]): NounEntry {
  return { ...base, id, es: id, en: [en], pos: "noun", gender, tags, forms: { pl: `${id}s` } };
}

function adj(id: string, en: string, tags = ["character-traits"]): Entry {
  return { ...base, id, es: id, en: [en], pos: "adj", tags };
}

const abuela = noun("abuela", "grandmother", "f");
const madre = noun("madre", "mother", "f");
const hermana = noun("hermana", "sister", "f");
const tia = noun("tia", "aunt", "f");
const prima = noun("prima", "cousin", "f");
const padre = noun("padre", "father", "m");
const hijo = noun("hijo", "son", "m");
const mesa = noun("mesa", "table", "f", ["house"]);
const alto = adj("alto", "tall", ["physical-traits"]);
const timido = adj("timido", "shy");
const serio = adj("serio", "serious");
const alegre = adj("alegre", "cheerful");
const cinco: Entry = {
  ...base,
  id: "cinco",
  es: "cinco",
  en: ["five"],
  pos: "number",
  value: 5,
  tags: ["numbers"],
};
const seis: Entry = {
  ...base,
  id: "seis",
  es: "seis",
  en: ["six"],
  pos: "number",
  value: 6,
  tags: ["numbers"],
};
const siete: Entry = {
  ...base,
  id: "siete",
  es: "siete",
  en: ["seven"],
  pos: "number",
  value: 7,
  tags: ["numbers"],
};
const ocho: Entry = {
  ...base,
  id: "ocho",
  es: "ocho",
  en: ["eight"],
  pos: "number",
  value: 8,
  tags: ["numbers"],
};

const DICTIONARY = [
  abuela,
  madre,
  hermana,
  tia,
  prima,
  padre,
  hijo,
  mesa,
  alto,
  timido,
  serio,
  alegre,
  cinco,
  seis,
  siete,
  ocho,
];
const NO_PROGRESS: ProgressBlob = { userId: "dylan", entries: {} };

function options(
  entry: Entry,
  direction: Direction = "en→es",
  entries = DICTIONARY,
  seed = 1,
  progress = NO_PROGRESS,
) {
  return choiceOptions({ card: { entry, direction }, entries, progress, random: seeded(seed) });
}

describe("multiple-choice options", () => {
  it("offers four options with exactly one correct, the card's own entry", () => {
    const result = options(abuela);
    expect(result).toHaveLength(CHOICE_COUNT);
    expect(result.filter((option) => option.correct).map((option) => option.entryId)).toEqual([
      "abuela",
    ]);
  });

  it("shows spanish with the article for an english prompt, and english for a spanish one", () => {
    expect(options(abuela).find((option) => option.correct)?.text).toBe("la abuela");
    expect(options(abuela, "es→en").find((option) => option.correct)?.text).toBe("grandmother");
  });

  it("draws from the same part of speech, tag and gender first", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const distractors = options(abuela, "en→es", DICTIONARY, seed).filter(
        (option) => !option.correct,
      );
      for (const option of distractors) {
        // Four feminine family nouns exist besides the answer, so no masculine
        // noun, adjective or other-tag word should ever be needed.
        expect(["madre", "hermana", "tia", "prima"]).toContain(option.entryId);
      }
    }
  });

  it("varies the distractors between sessions", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      for (const option of options(abuela, "en→es", DICTIONARY, seed)) seen.add(option.entryId);
    }
    expect(seen.size).toBe(5);
  });

  it("prefers words the learner has already practised", () => {
    const progress: ProgressBlob = {
      userId: "dylan",
      entries: { madre: {}, tia: {}, prima: {} },
    };
    for (let seed = 1; seed <= 10; seed++) {
      const ids = options(abuela, "en→es", DICTIONARY, seed, progress)
        .filter((option) => !option.correct)
        .map((option) => option.entryId)
        .sort();
      expect(ids).toEqual(["madre", "prima", "tia"]);
    }
  });

  it("never offers a word that shares an english meaning", () => {
    const ser: Entry = {
      ...base,
      id: "ser",
      es: "ser",
      en: ["to be"],
      pos: "verb",
      tags: ["verbs"],
      verb: { reflexive: false, regular: false },
    };
    const estar: Entry = { ...ser, id: "estar", es: "estar" };
    const ir: Entry = { ...ser, id: "ir", es: "ir", en: ["to go"] };
    for (let seed = 1; seed <= 10; seed++) {
      expect(
        options(ser, "en→es", [ser, estar, ir], seed).map((option) => option.entryId),
      ).not.toContain("estar");
    }
  });

  it("never offers another entry with the same headword", () => {
    const sporty = adj("deportista", "sporty");
    const athlete: Entry = {
      ...noun("deportista-2", "athlete", "m", ["professions"]),
      es: "deportista",
      gender: "mf",
    };
    for (let seed = 1; seed <= 10; seed++) {
      expect(
        options(sporty, "es→en", [sporty, athlete, timido, serio, alegre], seed).map(
          (option) => option.entryId,
        ),
      ).not.toContain("deportista-2");
    }
  });

  it("never shows two options that read the same", () => {
    const nice = adj("agradable", "nice");
    const alsoNice = adj("simpatico", "nice");
    const result = options(timido, "es→en", [timido, nice, alsoNice, serio, alegre]);
    const texts = result.map((option) => option.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("keeps numbers out of ordinary questions", () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (const option of options(alto, "en→es", DICTIONARY, seed)) {
        expect(option.entryId).not.toMatch(/cinco|seis|siete|ocho/);
      }
    }
  });

  it("gives a number asked by name number distractors", () => {
    const ids = options(cinco)
      .map((option) => option.entryId)
      .sort();
    expect(ids).toEqual(["cinco", "ocho", "seis", "siete"]);
  });

  it("returns fewer options rather than failing on a tiny dictionary", () => {
    const result = options(abuela, "en→es", [abuela, madre]);
    expect(result).toHaveLength(2);
    expect(result.filter((option) => option.correct)).toHaveLength(1);
  });

  it("is reproducible from a seed", () => {
    expect(options(abuela, "en→es", DICTIONARY, 7)).toEqual(
      options(abuela, "en→es", DICTIONARY, 7),
    );
  });
});

describe("choice sessions", () => {
  it("builds multiple-choice cards whose correct option matches the final direction", () => {
    const cards = buildSession({
      entries: DICTIONARY,
      progress: NO_PROGRESS,
      userId: "dylan",
      config: { ...DEFAULT_CONFIG, format: "choice", size: 8 },
      today: TODAY,
      random: seeded(3),
    });
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.exercise).toBe("choice");
      const correct = card.options?.find((option) => option.correct);
      expect(correct?.entryId).toBe(card.entry.id);
      expect(correct?.text).toBe(optionText(card.entry, card.direction));
    }
  });

  it("leaves typed sessions without options", () => {
    const cards = buildSession({
      entries: DICTIONARY,
      progress: NO_PROGRESS,
      userId: "dylan",
      config: DEFAULT_CONFIG,
      today: TODAY,
      random: seeded(3),
    });
    for (const card of cards) {
      expect(card.exercise).toBe("typed");
      expect(card.options).toBeUndefined();
    }
  });
});
