import { describe, expect, it } from "vite-plus/test";
import { entries } from "../../app/dictionary.ts";
import { sentences } from "../../app/sentences.ts";
import { renderFrame, type Frame } from "./frames.ts";
import { MORE_LIKE_THIS, matchesTranslation, moreLikeThis, type Translation } from "./translate.ts";

const translation = { sentence: { es: "Los viernes vais al trabajo." } } as Translation;

describe("an exact translation", () => {
  it("matches regardless of capitals, spacing and the closing full stop", () => {
    expect(matchesTranslation("Los viernes vais al trabajo.", translation)).toBe(true);
    expect(matchesTranslation("los viernes   vais al trabajo", translation)).toBe(true);
  });

  it("does not match with an accent missing", () => {
    const withAccent = { sentence: { es: "Mi hermana es tímida." } } as Translation;
    expect(matchesTranslation("mi hermana es timida", withAccent)).toBe(false);
  });

  it("does not match a different wording, even a valid one", () => {
    expect(matchesTranslation("Vosotros vais al trabajo los viernes", translation)).toBe(false);
  });

  it("does not match an empty answer", () => {
    expect(matchesTranslation("   ", translation)).toBe(false);
  });
});

describe("a person whose gender the English does not show", () => {
  let state = 1;
  const random = () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
  const context = { dictionary: entries, glue: sentences.glue, random };
  const frame = (id: string) => sentences.frames.find((f) => f.id === id) as Frame;
  const render = (id: string, fixed: Record<string, string>) =>
    renderFrame(frame(id), context, fixed)!;

  it("matches in either gender, with everything that agrees", () => {
    const sentence = render("profession-seems", { p: "enfermero", a: "serio" });
    const both = [sentence.es, ...(sentence.otherGenders ?? [])].sort();
    expect(both).toEqual(["El enfermero parece serio.", "La enfermera parece seria."]);
    expect(matchesTranslation("el enfermero parece serio", { sentence })).toBe(true);
    expect(matchesTranslation("la enfermera parece seria", { sentence })).toBe(true);
    expect(matchesTranslation("la enfermera parece serio", { sentence })).toBe(false);
  });

  it("matches only the gender the English shows (my sister, my brother)", () => {
    const sentence = render("family-profession", { n: "hermano", p: "enfermero" });
    expect(sentence.otherGenders).toBeUndefined();
  });
});

describe("practice more like this", () => {
  function seeded(seed: number): () => number {
    let state = (seed * 2_654_435_761) % 4_294_967_296;
    return () => {
      state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      return state / 4_294_967_296;
    };
  }
  const context = (seed: number) => ({
    dictionary: entries,
    glue: sentences.glue,
    random: seeded(seed),
  });
  const frame = (id: string) => sentences.frames.find((f) => f.id === id) as Frame;
  const first = (id: string, fixed: Record<string, string> = {}) =>
    renderFrame(frame(id), context(1), fixed)!;

  it("keeps the frame's own structure (tener que) and varies the rest, never repeating", () => {
    const original = first("have-to", { a: "estudiar" });
    const more = moreLikeThis(original, sentences.frames, context(2), [original.es]);
    expect(more).toHaveLength(MORE_LIKE_THIS);
    const texts = more.map((made) => made.sentence.es);
    expect(new Set([...texts, original.es]).size).toBe(MORE_LIKE_THIS + 1);
    for (const made of more) {
      expect(made.sentence.frameId).toBe("have-to");
      expect(made.sentence.fills.v).toBe("tener-que");
    }
  });

  it("varies a word with choices rather than drilling it (not three of 'mucho')", () => {
    const original = first("do-a-lot", { m: "mucho-2" });
    const more = moreLikeThis(original, sentences.frames, context(3), []);
    expect(more.some((made) => made.sentence.fills.m !== "mucho-2")).toBe(true);
  });

  it("picks sentences that differ most, so a small frame does not repeat itself", () => {
    // Four things to write on: the missed sentence and the three new ones use all four.
    const original = first("profession-writes-on", { o: "ordenador" });
    const more = moreLikeThis(original, sentences.frames, context(7), []);
    const surfaces = [original, ...more.map((made) => made.sentence)].map((made) => made.fills.o);
    expect(new Set(surfaces).size).toBe(4);
    for (const made of more) expect(made.sentence.fills.p).not.toBe(original.fills.p);
  });

  it("varies the noun when the focus is a pronoun, so the pronoun changes too", () => {
    const original = first("pronoun-yes");
    const more = moreLikeThis(original, sentences.frames, context(4), []);
    expect(more.length).toBeGreaterThan(0);
    expect(more.some((made) => made.sentence.fills.c !== original.fills.c)).toBe(true);
  });

  it("leaves out sentences already seen in the session", () => {
    const original = first("have-to", { a: "estudiar" });
    const once = moreLikeThis(original, sentences.frames, context(5), []);
    const again = moreLikeThis(
      original,
      sentences.frames,
      context(5),
      once.map((m) => m.sentence.es),
    );
    for (const made of again) {
      expect(once.map((m) => m.sentence.es)).not.toContain(made.sentence.es);
    }
  });

  it("falls back to frames on the same grammar point when one frame runs dry", () => {
    // En verano hace calor: the only sentence this frame makes.
    const original = first("weather-summer");
    const more = moreLikeThis(original, sentences.frames, context(6), []);
    expect(more.length).toBeGreaterThan(0);
    for (const made of more) {
      expect(made.sentence.frameId).not.toBe("weather-summer");
      expect(frame(made.sentence.frameId).grammar).toContain("weather");
    }
  });
});
