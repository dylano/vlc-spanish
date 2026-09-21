import { describe, expect, it } from "vite-plus/test";
import { entries } from "../../app/dictionary.ts";
import { sentences } from "../../app/sentences.ts";
import { negateVerb } from "./english.ts";
import { renderFrame, type RenderedSentence } from "./frames.ts";
import { gapTargets, gradeGap, type Gap } from "./gap.ts";
import { renderMistake } from "./mistake.ts";

function seeded(seed: number): () => number {
  let state = (seed * 2_654_435_761) % 4_294_967_296;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

const frame = (id: string) => sentences.frames.find((candidate) => candidate.id === id)!;
const context = (seed: number) => ({
  dictionary: entries,
  glue: sentences.glue,
  random: seeded(seed),
});
const entry = (id: string) => entries.find((candidate) => candidate.id === id)!;

function renders(id: string, seeds = 30): RenderedSentence[] {
  const out: RenderedSentence[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const sentence = renderFrame(frame(id), context(seed));
    if (sentence) out.push(sentence);
  }
  return out;
}

const PRONOUN: Record<string, string> = {
  yo: "me",
  tu: "te",
  nosotros: "nos",
  vosotros: "os",
  ellos: "les",
};

describe("gustar in sentences", () => {
  it("agrees with a plural thing, the pronoun following the person", () => {
    for (const sentence of renders("like-things")) {
      expect(sentence.es).toMatch(/^(Me|Te|Nos|Os|Les) (gustan|encantan) (los|las) /);
      expect(sentence.es.split(" ")[0]!.toLowerCase()).toBe(PRONOUN[sentence.subject!]);
    }
  });

  it("takes the singular for one thing and for an activity", () => {
    for (const sentence of [...renders("like-thing"), ...renders("like-activity")]) {
      expect(sentence.es).toMatch(/^\p{L}+ (gusta|encanta) /u);
    }
  });

  it("uses le and les for relatives, and reads subject-first in English", () => {
    for (const sentence of renders("relative-likes-activity")) {
      expect(sentence.es).toMatch(/^A mi \p{L}+ le (gusta|encanta) /u);
      expect(sentence.en).toMatch(/^My \p{L}+ (likes|loves) to /u);
    }
    for (const sentence of renders("relatives-like-things")) {
      expect(sentence.es).toMatch(/^A mis \p{L}+ les (gustan|encantan) /u);
      expect(sentence.en).toMatch(/^My \p{L}+ (like|love) /u);
    }
  });

  it("puts no before the pronoun, and don't or doesn't in the English", () => {
    for (const sentence of renders("not-like-activity")) {
      expect(sentence.es).toMatch(/^No (me|te|nos|os|les) gusta /);
      expect(sentence.en).toMatch(/ don't like to /);
    }
    for (const sentence of renders("relative-not-like-thing")) {
      expect(sentence.es).toMatch(/ no le gusta /);
      expect(sentence.en).toMatch(/ doesn't like the /);
    }
  });
});

describe("English negatives", () => {
  it("uses do-support, and plain not for be", () => {
    expect(negateVerb("to like", "yo")).toBe("don't like");
    expect(negateVerb("to like", "el", "f")).toBe("doesn't like");
    expect(negateVerb("to brush one's teeth", "el", "f")).toBe("doesn't brush her teeth");
    expect(negateVerb("to be", "yo")).toBe("am not");
    expect(negateVerb("to be", "el")).toBe("isn't");
  });
});

describe("gustar in exercises", () => {
  const gap = (sentence: RenderedSentence): Gap => ({
    sentence,
    blanks: [{ slot: "v", entryId: sentence.fills.v!, expected: sentence.slots.v!.accepts[0]! }],
  });

  it("marks the wrong number wrong, not almost, and says why", () => {
    const sentence = renders("like-things", 200).find((candidate) => candidate.subject === "yo")!;
    const verb = entry(sentence.fills.v!);
    const right = sentence.slots.v!.accepts[0]!;
    expect(gradeGap(gap(sentence), gap(sentence).blanks[0]!, right, verb, entries).result).toBe(
      "correct",
    );
    const result = gradeGap(
      gap(sentence),
      gap(sentence).blanks[0]!,
      right.slice(0, -1),
      verb,
      entries,
    );
    expect(result.result).toBe("wrong");
    expect(result.note).toMatch(/is plural, so me (gustan|encantan)$/);
  });

  it("names the person when the pronoun is wrong", () => {
    const sentence = renders("like-activity", 200).find(
      (candidate) => candidate.subject === "nosotros",
    )!;
    const verb = entry(sentence.fills.v!);
    const wrong = sentence.slots.v!.accepts[0]!.replace(/^nos/, "me");
    const result = gradeGap(gap(sentence), gap(sentence).blanks[0]!, wrong, verb, entries);
    expect(result.result).toBe("wrong");
    expect(result.note).toMatch(/for nosotros it is nos/);
  });

  it("breaks the agreement with what is liked in Find the Mistake", () => {
    const targets = gapTargets(
      sentences.frames.filter((candidate) => candidate.grammar.includes("gustar")),
      { dictionary: entries },
    );
    const found = [];
    for (let seed = 1; seed <= 20; seed++) {
      const mistake = renderMistake("gustar", targets, context(seed));
      if (mistake?.slot === "v") found.push(mistake);
    }
    expect(found.length).toBeGreaterThan(0);
    for (const mistake of found) {
      expect(mistake.kind).toBe("number");
      expect(mistake.wrong.replace(/n$/, "")).toBe(mistake.right.replace(/n$/, ""));
    }
  });
});
