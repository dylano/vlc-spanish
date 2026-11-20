import { describe, expect, it } from "vite-plus/test";
import { entries } from "../../app/dictionary.ts";
import { sentences } from "../../app/sentences.ts";
import { checkFrame, frameTense, renderFrame, type Frame, type FrameInput } from "./frames.ts";
import { frameSchema } from "./frames.ts";
import { gapTargets, gradeGap, type Gap } from "./gap.ts";
import { renderMistake } from "./mistake.ts";

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
const entry = (id: string) => entries.find((e) => e.id === id)!;
const perfectFrames = sentences.frames.filter((f) => frameTense(f) === "perfecto");

/** A one-blank gap on a frame's verb, with some slots pinned. */
function verbGap(frameId: string, fixed: Record<string, string>, seed = 1): Gap {
  const sentence = renderFrame(frame(frameId), context(seed), fixed)!;
  const blank = { slot: "v", entryId: sentence.fills.v!, expected: sentence.slots.v!.accepts[0]! };
  return { sentence, blanks: [blank] };
}
const grade = (gap: Gap, given: string) =>
  gradeGap(gap, gap.blanks[0]!, given, entry(gap.blanks[0]!.entryId), entries);

describe("frames in the pretérito perfecto", () => {
  it("are told apart from the present ones", () => {
    expect(perfectFrames.length).toBeGreaterThan(0);
    expect(frameTense(frame("do-a-lot"))).toBe("presente");
    for (const f of perfectFrames) expect(f.grammar[0]).toBe("preterito-perfecto");
  });

  it("put haber before the participle and English have between its words", () => {
    const made = renderFrame(frame("perfecto-already"), context(1), { v: "levantarse" })!;
    const [es, en] = [made.es, made.en];
    expect(es).toMatch(/^Ya (me he|te has|se ha|nos hemos|os habéis|se han) levantado\.$/);
    expect(en).toMatch(/^(I|You|He|She|We|You \(plural\)|They) (have|has) already gotten up\.$/);
  });

  it("make the English negative and the question from the same verb", () => {
    const not = renderFrame(frame("perfecto-relative-not"), context(2), {
      n: "padre",
      v: "cenar",
    })!;
    expect(not.es).toMatch(/^Mi (padre|madre) no ha cenado\.$/);
    expect(not.en).toMatch(/^My (father|mother) hasn't had dinner\.$/);
    const asked = renderFrame(frame("perfecto-question-yet"), context(3), { v: "ducharse" })!;
    expect(asked.en).toMatch(/^Have you( \(plural\))? showered yet\?$/);
  });

  it("put an object pronoun before haber: ya lo he comprado", () => {
    const made = renderFrame(frame("perfecto-bought-it"), context(4), { c: "pan" })!;
    expect(made.es).toBe("¿Ya has comprado el pan?\nSí, ya lo he comprado.");
    expect(made.en).toBe("Have you bought the bread yet?\nYes, I have already bought it.");
  });

  it("all render", () => {
    for (const f of perfectFrames) {
      expect(renderFrame(f, context(5)), f.id).toBeTruthy();
    }
  });

  it("allow have and the participle apart only for a verb in the perfecto", () => {
    const misuse: FrameInput = {
      id: "misuse",
      grammar: ["test"],
      subjects: ["yo"],
      es: "{v}.",
      en: "{S} {v:aux} {v:pp}.",
      slots: { v: { kind: "verb", ids: ["comer"], subject: "@" } },
      cloze: ["v"],
    };
    const { errors } = checkFrame(frameSchema.parse(misuse), context(1));
    expect(errors.join()).toMatch(/only for a verb in the perfecto/);
  });
});

describe("a gap in the pretérito perfecto", () => {
  const ate = verbGap("perfecto-relative-not", { n: "padre", v: "comer" });
  const returned = verbGap("perfecto-relative-not", { n: "padre", v: "volver" }, 2);

  it("wants haber and the participle together", () => {
    expect(ate.blanks[0]!.expected).toBe("ha comido");
    expect(grade(ate, "ha comido").result).toBe("correct");
    expect(grade(ate, "ha almorzado").result).toBe("correct");
  });

  it("says when the present was typed instead", () => {
    const result = grade(ate, "come");
    expect(result.result).toBe("wrong");
    expect(result.note).toBe("here it is the pretérito perfecto: ha comido");
  });

  it("says when haber was left out", () => {
    expect(grade(ate, "comido").note).toBe("don't forget haber: ha comido");
  });

  it("says when the participle was made regular, or left as the infinitive", () => {
    expect(returned.blanks[0]!.expected).toBe("ha vuelto");
    expect(grade(returned, "ha volvido").note).toBe("vuelto is irregular: ha vuelto, not volvido");
    expect(grade(ate, "ha comer").note).toBe("after haber comes the participle: ha comido");
  });

  it("names the person when haber is in the wrong one", () => {
    expect(grade(ate, "he comido").note).toMatch(/right verb, wrong person/);
  });

  it("calls a missing accent almost: leído", () => {
    const read = verbGap("perfecto-today-a-lot", { v: "leer" });
    const typed = read.blanks[0]!.expected.replace("leído", "leido");
    expect(grade(read, typed).result).toBe("hard");
  });
});

describe("a mistake in the pretérito perfecto", () => {
  const targets = gapTargets(perfectFrames, { dictionary: entries });

  it("makes an irregular participle regular: he volvido", () => {
    const found = Array.from({ length: 60 }, (_, seed) =>
      renderMistake("volver", targets, context(seed)),
    ).filter((m) => m?.kind === "participle");
    expect(found.length).toBeGreaterThan(0);
    for (const mistake of found) {
      expect(mistake!.wrong).toMatch(/volvido/);
      expect(mistake!.accepts).toContain("vuelto");
    }
  });

  it("puts haber in another person, never the present", () => {
    const found = Array.from({ length: 40 }, (_, seed) =>
      renderMistake("cenar", targets, context(seed)),
    ).filter((m) => m?.kind === "person");
    expect(found.length).toBeGreaterThan(0);
    for (const mistake of found)
      expect(mistake!.wrong).toMatch(/^(\w+ )?(he|has|ha|hemos|habéis|han) cenado$/);
  });
});
