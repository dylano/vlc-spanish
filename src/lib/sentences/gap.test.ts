import { describe, expect, it } from "vite-plus/test";
import { entries } from "../../app/dictionary.ts";
import { sentences } from "../../app/sentences.ts";
import type { ProgressBlob } from "../schema.ts";
import {
  buildGapSession,
  buildMixedSession,
  DEFAULT_CONFIG,
  isDrillable,
  isMatchRound,
  MIN_SENTENCE_WORDS,
} from "../session.ts";
import { renderFrame, type Frame } from "./frames.ts";
import { gapTargets, gradeGap, renderGap, type Gap, type GapBlank } from "./gap.ts";

const TODAY = "2026-09-17";

function seeded(seed: number): () => number {
  let state = (seed * 2_654_435_761) % 4_294_967_296;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

const frame = (id: string) => sentences.frames.find((f) => f.id === id) as Frame;
const entry = (id: string) => entries.find((e) => e.id === id)!;
const context = (seed: number) => ({
  dictionary: entries,
  glue: sentences.glue,
  random: seeded(seed),
});

/** A one-blank gap from a real frame, with some slots pinned, retried until `accept` holds. */
function gapFrom(
  frameId: string,
  slot: string,
  fixed: Record<string, string>,
  accept: (gap: Gap) => boolean = () => true,
): Gap & { blank: GapBlank } {
  for (let seed = 1; seed < 500; seed++) {
    const sentence = renderFrame(frame(frameId), context(seed), fixed);
    if (!sentence) continue;
    const blank = {
      slot,
      entryId: sentence.fills[slot]!,
      expected: sentence.slots[slot]!.accepts[0]!,
    };
    const gap = { sentence, blanks: [blank], blank };
    if (accept(gap)) return gap;
  }
  throw new Error(`no rendering of ${frameId} satisfied the test`);
}

describe("grading a gap", () => {
  const shy = gapFrom("family-is-trait", "a", { n: "madre", a: "timido" });

  it("accepts the form the sentence needs", () => {
    expect(shy.sentence.es).toBe("Mi madre es tímida.");
    expect(gradeGap(shy, shy.blank, "tímida", entry("timido"), entries)).toEqual({
      result: "correct",
      expected: "tímida",
    });
  });

  it("calls a missing accent almost", () => {
    expect(gradeGap(shy, shy.blank, "timida", entry("timido"), entries).result).toBe("hard");
  });

  it("marks the right word in the wrong gender wrong, and says why", () => {
    const result = gradeGap(shy, shy.blank, "tímido", entry("timido"), entries);
    expect(result.result).toBe("wrong");
    expect(result.note).toBe("right word, wrong form: madre is feminine, so tímida");
  });

  it("marks the wrong person of the right verb wrong, and names the subject", () => {
    const gap = gapFrom(
      "routine-lunch-at-time",
      "v",
      { v: "comer" },
      (g) => g.sentence.subject === "nosotros",
    );
    expect(gap.blank.expected).toBe("comemos");
    const result = gradeGap(gap, gap.blank, "come", entry("comer"), entries);
    expect(result.result).toBe("wrong");
    expect(result.note).toBe("right verb, wrong person: for nosotros it is comemos");
  });

  it("names a family member as the subject of a third-person verb", () => {
    const gap = gapFrom("family-lunch-at-time", "v", { n: "hermano", v: "comer" });
    const result = gradeGap(gap, gap.blank, "como", entry("comer"), entries);
    expect(result.note).toMatch(/^right verb, wrong person: for herman[oa] it is come$/);
  });

  it("accepts another word with the same English", () => {
    const gap = gapFrom(
      "routine-lunch-at-time",
      "v",
      { v: "comer" },
      (g) => g.sentence.subject === "yo",
    );
    expect(gradeGap(gap, gap.blank, "almuerzo", entry("comer"), entries).result).toBe("correct");
  });

  it("forgives a slip of the finger but not a changed ending", () => {
    const gap = gapFrom("family-is-trait", "a", { n: "padre", a: "inteligente" });
    expect(gradeGap(gap, gap.blank, "intelignete", entry("inteligente"), entries).result).toBe(
      "hard",
    );
    expect(gradeGap(gap, gap.blank, "inteligenta", entry("inteligente"), entries).result).toBe(
      "wrong",
    );
  });

  it("marks an empty answer wrong", () => {
    expect(gradeGap(shy, shy.blank, "  ", entry("timido"), entries).result).toBe("wrong");
  });
});

describe("aiming a gap", () => {
  it("puts the chosen word in the blank", () => {
    const targets = gapTargets(sentences.frames, { dictionary: entries });
    for (let seed = 1; seed <= 20; seed++) {
      const gap = renderGap("cenar", targets, context(seed));
      expect(gap?.blanks.map((blank) => blank.entryId)).toEqual(["cenar"]);
    }
  });
});

describe("gaps with several blanks", () => {
  const targets = gapTargets(sentences.frames, { dictionary: entries });

  it("blanks the aimed word plus others from the frame's cloze list, in sentence order", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const gap = renderGap("timido", targets, context(seed), 3);
      if (!gap) continue;
      expect(gap.blanks.some((blank) => blank.entryId === "timido")).toBe(true);
      const f = frame(gap.sentence.frameId);
      for (const blank of gap.blanks) expect(f.cloze).toContain(blank.slot);
      const order = gap.blanks.map((blank) =>
        gap.sentence.segments.findIndex((part) => part.slot === blank.slot && !part.article),
      );
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(new Set(gap.blanks.map((blank) => blank.slot)).size).toBe(gap.blanks.length);
    }
  });

  it("always leaves some Spanish showing", () => {
    // sport-how-often is "{v} {f}." — blanking both would leave only a full stop.
    for (let seed = 1; seed <= 30; seed++) {
      const gap = renderGap("hacer-deporte", targets, context(seed), 3);
      if (!gap) continue;
      const blanked = new Set(gap.blanks.map((blank) => blank.slot));
      const visible = gap.sentence.segments
        .filter((part) => !(part.slot && !part.article && blanked.has(part.slot)))
        .map((part) => part.text)
        .join("");
      expect(visible).toMatch(/\p{L}/u);
    }
  });

  it("never blanks more than the frame offers", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const gap = renderGap("cenar", targets, context(seed), 3);
      expect(gap!.blanks.length).toBeLessThanOrEqual(frame(gap!.sentence.frameId).cloze.length);
    }
  });

  it("only blanks further words that are allowed", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const gap = renderGap("timido", targets, context(seed), 3, (id) => id === "timido");
      expect(gap?.blanks.map((blank) => blank.entryId)).toEqual(["timido"]);
    }
  });

  it("grades each blank against the sentence, not the other answers", () => {
    const sentence = renderFrame(frame("family-is-trait"), context(1), {
      n: "madre",
      a: "timido",
    })!;
    const noun = { slot: "n", entryId: "madre", expected: "madre" };
    const adjective = { slot: "a", entryId: "timido", expected: "tímida" };
    const gap = { sentence, blanks: [noun, adjective] };
    // "padre … tímido" agrees with itself, but the sentence says mother.
    expect(gradeGap(gap, noun, "padre", entry("madre"), entries).result).toBe("wrong");
    expect(gradeGap(gap, adjective, "tímido", entry("timido"), entries).result).toBe("wrong");
    expect(gradeGap(gap, adjective, "tímida", entry("timido"), entries).result).toBe("correct");
  });
});

describe("sessions with gaps", () => {
  const drillable = entries.filter(isDrillable);

  function practiced(count: number): ProgressBlob {
    const blob: ProgressBlob = { userId: "dylan", entries: {} };
    for (const e of drillable.slice(0, count)) {
      blob.entries[e.id] = {
        "en→es": {
          userId: "dylan",
          entryId: e.id,
          direction: "en→es",
          due: TODAY,
          interval: 1,
          ease: 2.5,
          reps: 1,
          lapses: 0,
        },
      };
    }
    return blob;
  }

  const options = (progress: ProgressBlob, seed: number, format: "gap" | "mixed" = "gap") => ({
    entries,
    progress,
    userId: "dylan",
    config: { ...DEFAULT_CONFIG, format, size: 15, scope: "all" as const },
    today: TODAY,
    random: seeded(seed),
    sentences,
  });

  it("offers no gaps until enough words have been practiced", () => {
    expect(buildGapSession(options(practiced(MIN_SENTENCE_WORDS - 1), 1))).toEqual([]);
  });

  it("builds gaps only from practiced words, every blank its own card asked in Spanish", () => {
    const progress = practiced(drillable.length);
    for (let seed = 1; seed <= 10; seed++) {
      const cards = buildGapSession(options(progress, seed));
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        expect(card.exercise).toBe("gap");
        expect(card.blankCards?.map((blank) => blank.entry.id)).toEqual(
          card.gap?.blanks.map((blank) => blank.entryId),
        );
        expect(card.gap?.blanks.some((blank) => blank.entryId === card.entry.id)).toBe(true);
        for (const blank of card.blankCards!) {
          expect(blank.direction).toBe("en→es");
          expect(blank.progress.direction).toBe("en→es");
          expect(blank.progress.entryId).toBe(blank.entry.id);
        }
      }
    }
  });

  it("counts every blank toward the session size and never asks a word twice", () => {
    const progress = practiced(drillable.length);
    for (let seed = 1; seed <= 10; seed++) {
      const ids = buildGapSession(options(progress, seed)).flatMap((card) =>
        card.blankCards!.map((blank) => blank.entry.id),
      );
      expect(ids.length).toBeLessThanOrEqual(15);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("sometimes blanks more than one word", () => {
    const progress = practiced(drillable.length);
    const counts = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      for (const card of buildGapSession(options(progress, seed)))
        counts.add(card.gap!.blanks.length);
    }
    expect([...counts].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("never puts an unpracticed word in a sentence", () => {
    const progress = practiced(60);
    for (let seed = 1; seed <= 10; seed++) {
      for (const card of buildGapSession(options(progress, seed))) {
        for (const id of Object.values(card.gap!.sentence.fills)) {
          const used = entry(id);
          expect(
            progress.entries[id] !== undefined || !isDrillable(used),
            `${id} in ${card.gap!.sentence.es}`,
          ).toBe(true);
        }
      }
    }
  });

  it("mixes gaps into Practice once they are possible", () => {
    const progress = practiced(drillable.length);
    let gaps = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const item of buildMixedSession(options(progress, seed, "mixed"))) {
        if (!isMatchRound(item) && item.exercise === "gap") gaps++;
      }
    }
    expect(gaps).toBeGreaterThan(0);
  });
});
