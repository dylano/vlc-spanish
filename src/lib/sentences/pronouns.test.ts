import { describe, expect, it } from "vite-plus/test";
import { entries } from "../../app/dictionary.ts";
import { sentences } from "../../app/sentences.ts";
import { grade } from "../grade.ts";
import { buildGapSession, buildMistakeSession, DEFAULT_CONFIG } from "../session.ts";
import { renderFrame, type RenderedSentence } from "./frames.ts";
import { gapTargets, gradeGap, renderGap, type Gap } from "./gap.ts";
import { mistakeTokens, renderMistake } from "./mistake.ts";
import { matchesTranslation } from "./translate.ts";

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
const pronounFrames = sentences.frames.filter((candidate) =>
  candidate.grammar.includes("object-pronouns"),
);

function renders(id: string, seeds = 40, fixed: Record<string, string> = {}): RenderedSentence[] {
  const out: RenderedSentence[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const sentence = renderFrame(frame(id), context(seed), fixed);
    if (sentence) out.push(sentence);
  }
  return out;
}

/** The article in the question and the pronoun in the answer: "¿Compras el pan? Sí, lo compro." */
function articleAndPronoun(sentence: RenderedSentence): [string, string] {
  const match = /^¿\p{L}+ (el|la|los|las) .*\?\n(?:Sí,|No, no) (lo|la|los|las) /u.exec(sentence.es);
  expect(match, sentence.es).not.toBeNull();
  return [match![1]!, match![2]!];
}

const PRONOUN_FOR: Record<string, string> = { el: "lo", la: "la", los: "los", las: "las" };

describe("direct object pronouns in sentences", () => {
  it("agrees with the thing asked about", () => {
    for (const id of ["pronoun-yes", "pronoun-yes-plural", "pronoun-no-plural", "pronoun-wear"]) {
      for (const sentence of renders(id)) {
        const [article, pronoun] = articleAndPronoun(sentence);
        // el agua is feminine for all its el: la tengo.
        const expected = sentence.fills.c === "agua" ? "la" : PRONOUN_FOR[article];
        expect(pronoun, sentence.es).toBe(expected);
      }
    }
  });

  it("answers with the question's verb, in the answering person", () => {
    for (const sentence of renders("pronoun-yes")) {
      expect(sentence.fills.w).toBe(sentence.fills.v);
      expect(sentence.slots.v!.subject).toBe("tu");
      expect(sentence.slots.w!.subject).toBe("yo");
    }
    for (const sentence of renders("pronoun-we-plural")) {
      expect(sentence.es).toMatch(
        /^¿\p{L}+(áis|éis|ís) [^\n]*\?\nSí, \p{L}+ \p{L}+(amos|emos|imos)\.$/u,
      );
    }
  });

  it("puts no before the pronoun and says it or them in English", () => {
    for (const sentence of renders("pronoun-no")) {
      expect(sentence.es).toMatch(/No, no (lo|la) \p{L}+\.$/u);
      expect(sentence.en).toMatch(/^Do you \p{L}+ the .+\?\nNo, I don't \p{L}+ it\.$/u);
    }
    for (const sentence of renders("pronoun-yes-plural")) {
      expect(sentence.en).toMatch(/ them\.$/);
    }
  });

  it("breaks the line between question and answer, which a typed translation need not", () => {
    const [sentence] = renders("pronoun-yes", 1);
    expect(sentence!.es).toContain("?\nSí, ");
    expect(sentence!.en).toContain("?\nYes, ");
    expect(matchesTranslation(sentence!.es.replace("\n", " "), { sentence: sentence! })).toBe(true);
  });

  it("fits the noun to a pinned pronoun, and the question to a pinned answer", () => {
    for (const sentence of renders("pronoun-yes", 20, { p: "la" })) {
      expect(sentence.fills.p).toBe("la");
      expect(sentence.slots.c!.gender).toBe("f");
    }
    for (const sentence of renders("pronoun-no", 20, { w: "necesitar" })) {
      expect(sentence.fills.v).toBe("necesitar");
    }
  });

  it("aims each pronoun only at frames of its number", () => {
    const targets = gapTargets(pronounFrames, { dictionary: entries });
    for (const { frame: target } of targets.get("los") ?? []) {
      expect(target.slots.c).toMatchObject({ number: "pl" });
    }
    for (const { frame: target } of targets.get("lo") ?? []) {
      expect(target.slots.c).not.toMatchObject({ number: "pl" });
    }
  });
});

describe("people and third person", () => {
  it("uses him, her or them for a person, agreeing with their gender", () => {
    for (const id of ["pronoun-person", "pronoun-person-plural", "pronoun-person-profession"]) {
      for (const sentence of renders(id)) {
        const pronoun = sentence.fills.p!;
        const english = { lo: "him", la: "her", los: "them", las: "them" }[pronoun];
        expect(sentence.en, sentence.es).toMatch(new RegExp(` ${english}\\.$`));
        expect(sentence.slots.p!.gender).toBe(sentence.slots.c!.gender === "f" ? "f" : "m");
      }
    }
  });

  it("puts the personal a before a person, contracting with el", () => {
    for (const sentence of renders("pronoun-person-profession")) {
      expect(sentence.es).toMatch(/^¿\p{L}+ (al|a la) /u);
    }
  });

  it("asks and answers in the relative's person, with does and he or she", () => {
    for (const sentence of renders("pronoun-relative")) {
      expect(sentence.slots.w!.subject).toBe("el");
      const she = sentence.slots.n!.gender === "f";
      expect(sentence.en).toMatch(
        new RegExp(
          `^Does your [a-z ]+ [a-z]+ the .+\\?\\nYes, ${she ? "she" : "he"} [a-z]+ it\\.$`,
        ),
      );
    }
    for (const sentence of renders("pronoun-relatives")) {
      expect(sentence.es).toMatch(/^¿Tus \p{L}+ \p{L}+n (el|la) /u);
      expect(sentence.en).toMatch(/^Do your .+\?\nYes, they /);
    }
  });
});

describe("two actions, and a thing mentioned first", () => {
  it("names the thing once, and the second verb takes the pronoun", () => {
    for (const sentence of renders("and-set-table")) {
      const match = /^\p{Lu}\p{L}+ (los|las) [\p{L} ]+ y (los|las) \p{L}+ en la mesa\.$/u.exec(
        sentence.es,
      );
      expect(match, sentence.es).not.toBeNull();
      expect(match![2]).toBe(match![1]);
      expect(sentence.en).toMatch(/ and put(s)? them on the table\.$/);
    }
  });

  it("follows un or una with lo or la, capitalized to start the second sentence", () => {
    for (const id of ["mention-wear", "mention-wear-relative", "mention-read"]) {
      for (const sentence of renders(id)) {
        const match = /(un|una) [^.]+\. (Lo|La) \p{L}+ /u.exec(sentence.es);
        expect(match, sentence.es).not.toBeNull();
        expect(match![2]).toBe(match![1] === "una" ? "La" : "Lo");
        expect(sentence.en, sentence.en).toMatch(/\. (I|You|He|She|We|They) [a-z]+ it /);
      }
    }
  });

  it("keeps the capital on a broken pronoun that starts a sentence", () => {
    const targets = gapTargets([frame("mention-wear")], { dictionary: entries });
    for (let seed = 1; seed <= 20; seed++) {
      const mistake = renderMistake("la", targets, context(seed));
      if (!mistake || mistake.slot !== "p") continue;
      const shown = mistakeTokens(mistake)
        .filter((token) => token.broken && token.word)
        .map((token) => token.text)
        .join(" ");
      expect(shown).toMatch(/^L/);
    }
  });
});

describe("direct object pronouns in exercises", () => {
  const targets = gapTargets(pronounFrames, { dictionary: entries });

  it("blanks the pronoun and explains the wrong one by its noun", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const gap = renderGap("lo", targets, context(seed)) as Gap;
      expect(gap).toBeDefined();
      const blank = gap.blanks.find((candidate) => candidate.entryId === "lo")!;
      expect(gradeGap(gap, blank, "lo", entry("lo"), entries).result).toBe("correct");
      const wrong = gradeGap(gap, blank, "la", entry("lo"), entries);
      expect(wrong.result).toBe("wrong");
      expect(wrong.note).toMatch(/masculine, so lo$|masculine singular, so lo$/);
    }
  });

  it("treats le for a person as wrong, not a slip: the class uses lo", () => {
    const personTargets = gapTargets([frame("pronoun-person")], { dictionary: entries });
    const gap = renderGap("lo", personTargets, context(3)) as Gap;
    const blank = gap.blanks.find((candidate) => candidate.entryId === "lo")!;
    const result = gradeGap(gap, blank, "le", entry("lo"), entries);
    expect(result.result).toBe("wrong");
    expect(result.note).toMatch(
      /^le is for an indirect object \(le gusta\); for \p{L}+ it is lo$/u,
    );
  });

  it("breaks the pronoun's gender or number in Find the Mistake", () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const mistake = renderMistake("las", targets, context(seed));
      expect(mistake).toBeDefined();
      expect(mistake!.slot).toBe("p");
      expect(["la", "los"]).toContain(mistake!.wrong);
      expect(mistake!.explanation).toMatch(/feminine plural, so las$/);
      kinds.add(mistake!.kind);
    }
    expect([...kinds].sort()).toEqual(["agreement", "number"]);
  });
});

describe("direct object pronouns as word cards", () => {
  it("marks another pronoun wrong, naming what each stands for", () => {
    const wrong = grade(entry("lo"), "en→es", "la", { prompt: "him" });
    expect(wrong.result).toBe("wrong");
    expect(wrong.note).toBe("la stands for a feminine singular noun; lo, a masculine singular one");
    expect(grade(entry("la"), "en→es", "los", { prompt: "her" }).note).not.toMatch(/article/);
  });

  it("keeps the usual near miss for the two that share 'them'", () => {
    const result = grade(entry("los"), "en→es", "las", {
      prompt: "them",
      confusableWith: [entry("las")],
    });
    expect(result.result).toBe("hard");
  });
});

describe("pronoun frames in a session", () => {
  const options = (seed: number) => ({
    entries,
    progress: { userId: "me", entries: {} },
    userId: "me",
    today: "2026-10-13",
    sentences: { ...sentences, frames: pronounFrames },
    random: seeded(seed),
    config: { ...DEFAULT_CONFIG, direction: "mixed" as const, scope: "due" as const, size: 15 },
  });
  const pronouns = new Set(["lo", "la", "los", "las"]);

  it("always blanks the pronoun, whatever word the gap was aimed at", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const gaps = buildGapSession({
        ...options(seed),
        config: { ...options(seed).config, format: "gap" },
      });
      expect(gaps.length).toBeGreaterThan(0);
      gaps.forEach((card, index) => {
        const words = gaps.slice(0, index).reduce((sum, done) => sum + done.blankCards!.length, 0);
        const blanked = card.gap!.blanks.some((blank) => pronouns.has(blank.entryId));
        // The one exception: the session's last word, with no room left for a second blank.
        expect(blanked || 15 - words === 1, `gap ${index}, ${words} words before`).toBe(true);
      });
    }
  });

  it("mostly breaks the pronoun, and schedules the pronoun it broke", () => {
    let onPronoun = 0;
    let total = 0;
    for (let seed = 1; seed <= 10; seed++) {
      for (const card of buildMistakeSession({
        ...options(seed),
        config: { ...options(seed).config, format: "mistake" },
      })) {
        total++;
        expect(card.entry.id).toBe(card.mistake!.entryId);
        if (pronouns.has(card.mistake!.entryId)) onPronoun++;
      }
    }
    expect(onPronoun / total).toBeGreaterThan(0.6);
  });
});
