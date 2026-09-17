import { describe, expect, it } from "vite-plus/test";
import framesFile from "../../../data/frames.json";
import glueFile from "../../../data/glue.json";
import { entries } from "../../app/dictionary.ts";
import type { Entry } from "../schema.ts";
import {
  checkFrame,
  frameSchema,
  framesFileSchema,
  glueSchema,
  renderFrame,
  spanishPlural,
  type Frame,
  type FrameInput,
  type Glue,
} from "./frames.ts";

const TODAY = "2026-09-17";

function seeded(seed: number): () => number {
  let state = (seed * 2_654_435_761) % 4_294_967_296;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

const hermano: Entry = {
  id: "hermano",
  es: "hermano",
  en: ["brother"],
  enF: ["sister"],
  pos: "noun",
  gender: "m",
  forms: { f: "hermana", pl: "hermanos" },
  tags: ["family"],
  added: TODAY,
};
const padre: Entry = {
  id: "padre",
  es: "padre",
  en: ["father"],
  pos: "noun",
  gender: "m",
  forms: { f: "madre", pl: "padres" },
  tags: ["family"],
  added: TODAY,
};
const estudiante: Entry = {
  id: "estudiante",
  es: "estudiante",
  en: ["student"],
  pos: "noun",
  gender: "mf",
  forms: { pl: "estudiantes" },
  tags: ["professions"],
  added: TODAY,
};
const gimnasio: Entry = {
  id: "gimnasio",
  es: "gimnasio",
  en: ["gym"],
  pos: "noun",
  gender: "m",
  forms: { pl: "gimnasios" },
  tags: ["workplaces"],
  added: TODAY,
};
const timido: Entry = {
  id: "timido",
  es: "tímido",
  en: ["shy"],
  pos: "adj",
  forms: { f: "tímida", pl: "tímidos" },
  tags: ["traits"],
  added: TODAY,
};
const inteligente: Entry = {
  id: "inteligente",
  es: "inteligente",
  en: ["intelligent"],
  pos: "adj",
  forms: { pl: "inteligentes" },
  tags: ["traits"],
  added: TODAY,
};
const lavarse: Entry = {
  id: "lavarse-los-dientes",
  es: "lavarse los dientes",
  en: ["to brush one's teeth"],
  pos: "verb",
  verb: { reflexive: true, regular: true },
  tags: ["routine"],
  added: TODAY,
};
const ir: Entry = {
  id: "ir",
  es: "ir",
  en: ["to go"],
  pos: "verb",
  verb: { reflexive: false, regular: false },
  forms: { yo: "voy", tu: "vas", el: "va", nosotros: "vamos", vosotros: "vais", ellos: "van" },
  tags: ["verbs"],
  added: TODAY,
};

const GLUE: Glue = {
  words: ["mi", "mis", "es", "son", "y", "a", "al", "e"],
  groups: { times: [{ es: "a las siete", en: "at seven" }] },
};
const DICTIONARY = [hermano, padre, estudiante, gimnasio, timido, inteligente, lavarse, ir];

function frame(partial: Omit<FrameInput, "id" | "grammar" | "cloze">): Frame {
  return frameSchema.parse({
    id: "test",
    grammar: ["test"],
    cloze: Object.keys(partial.slots),
    ...partial,
  });
}

function renderMany(f: Frame, times = 40, dictionary = DICTIONARY) {
  const out = [];
  for (let seed = 1; seed <= times; seed++) {
    const sentence = renderFrame(f, { dictionary, glue: GLUE, random: seeded(seed) });
    if (sentence) out.push(sentence);
  }
  return out;
}

describe("rendering", () => {
  it("agrees an adjective with a noun that may be put in the feminine", () => {
    const f = frame({
      es: "Mi {n} es {a}.",
      en: "My {n} is {a}.",
      slots: {
        n: { kind: "noun", ids: ["hermano"] },
        a: { kind: "adj", ids: ["timido"], agree: "n" },
      },
    });
    const sentences = new Set(renderMany(f).map((s) => `${s.es} | ${s.en}`));
    expect(sentences).toEqual(
      new Set([
        "Mi hermano es tímido. | My brother is shy.",
        "Mi hermana es tímida. | My sister is shy.",
      ]),
    );
  });

  it("gives a free person slot an even chance of being feminine, whatever the words", () => {
    // padre can only be masculine (no enF) and hermano can be either: choosing
    // per word would make only a quarter of these sentences feminine.
    const f = frame({
      es: "Mi {n} es {a}.",
      en: "My {n} is {a}.",
      slots: {
        n: { kind: "noun", ids: ["padre", "hermano"] },
        a: { kind: "adj", ids: ["timido"], agree: "n" },
      },
    });
    const sentences = renderMany(f, 400);
    const feminine = sentences.filter((s) => s.slots.n!.gender === "f").length / sentences.length;
    expect(feminine).toBeGreaterThan(0.4);
    expect(feminine).toBeLessThan(0.6);
  });

  it("never puts a noun in the feminine without English for it", () => {
    const f = frame({
      es: "Mi {n} es {a}.",
      en: "My {n} is {a}.",
      slots: {
        n: { kind: "noun", ids: ["padre"] },
        a: { kind: "adj", ids: ["timido"], agree: "n" },
      },
    });
    for (const sentence of renderMany(f)) expect(sentence.es).toBe("Mi padre es tímido.");
  });

  it("makes plurals agree", () => {
    const f = frame({
      es: "Mis {n} son {a}.",
      en: "My {n} are {a}.",
      slots: {
        n: { kind: "noun", ids: ["hermano"], number: "pl" },
        a: { kind: "adj", ids: ["timido"], agree: "n" },
      },
    });
    const sentences = new Set(renderMany(f).map((s) => `${s.es} | ${s.en}`));
    expect(sentences).toEqual(
      new Set([
        "Mis hermanos son tímidos. | My brothers are shy.",
        "Mis hermanas son tímidas. | My sisters are shy.",
      ]),
    );
  });

  it("contracts a + el, and keeps the article as its own segment otherwise", () => {
    const f = frame({
      subjects: ["yo"],
      es: "{v} a {w:el}.",
      en: "{S} {v} to {w:the}.",
      slots: {
        v: { kind: "verb", ids: ["ir"], subject: "@" },
        w: { kind: "noun", ids: ["gimnasio"] },
      },
    });
    const [sentence] = renderMany(f, 1);
    expect(sentence?.es).toBe("Voy al gimnasio.");
    expect(sentence?.en).toBe("I go to the gym.");
    expect(sentence?.segments.find((s) => s.slot === "w")?.text).toBe("gimnasio");
  });

  it("turns y into e before an i sound", () => {
    const f = frame({
      es: "Mi {n} es {a} y {b}.",
      en: "My {n} is {a} and {b}.",
      slots: {
        n: { kind: "noun", ids: ["padre"] },
        a: { kind: "adj", ids: ["timido"], agree: "n" },
        b: { kind: "adj", ids: ["inteligente"], agree: "n" },
      },
    });
    expect(renderMany(f, 1)[0]?.es).toBe("Mi padre es tímido e inteligente.");
  });

  it("conjugates for a noun subject and fills in his or her", () => {
    const f = frame({
      es: "Mi {n} {v} {t}.",
      en: "My {n} {v} {t}.",
      slots: {
        n: { kind: "noun", ids: ["hermano"] },
        v: { kind: "verb", ids: ["lavarse-los-dientes"], subject: "n" },
        t: { kind: "glue", group: "times" },
      },
    });
    const sentences = new Set(renderMany(f).map((s) => `${s.es} | ${s.en}`));
    expect(sentences).toEqual(
      new Set([
        "Mi hermano se lava los dientes a las siete. | My brother brushes his teeth at seven.",
        "Mi hermana se lava los dientes a las siete. | My sister brushes her teeth at seven.",
      ]),
    );
  });

  it("marks vosotros in the English", () => {
    const f = frame({
      subjects: ["vosotros"],
      es: "{v} a {w:el}.",
      en: "{S} {v} to {w:the}.",
      slots: {
        v: { kind: "verb", ids: ["ir"], subject: "@" },
        w: { kind: "noun", ids: ["gimnasio"] },
      },
    });
    expect(renderMany(f, 1)[0]).toMatchObject({
      es: "Vais al gimnasio.",
      en: "You (plural) go to the gym.",
    });
  });

  it("never uses the same word twice in one sentence", () => {
    const f = frame({
      es: "Mi {n} es {a} y {b}.",
      en: "My {n} is {a} and {b}.",
      slots: {
        n: { kind: "noun", ids: ["padre"] },
        a: { kind: "adj", ids: ["timido", "inteligente"], agree: "n" },
        b: { kind: "adj", ids: ["timido", "inteligente"], agree: "n" },
      },
    });
    for (const sentence of renderMany(f)) expect(sentence.fills.a).not.toBe(sentence.fills.b);
  });

  it("returns nothing when the slots cannot all be filled", () => {
    const f = frame({
      es: "Mi {n} es {a} y {b}.",
      en: "My {n} is {a} and {b}.",
      slots: {
        n: { kind: "noun", ids: ["padre"] },
        a: { kind: "adj", ids: ["timido"], agree: "n" },
        b: { kind: "adj", ids: ["timido"], agree: "n" },
      },
    });
    expect(renderMany(f, 5)).toEqual([]);
  });

  it("pluralizes the first word of a Spanish phrase", () => {
    expect(spanishPlural("diseñadora de moda")).toBe("diseñadoras de moda");
    expect(spanishPlural("vez")).toBe("veces");
    expect(spanishPlural("profesor")).toBe("profesores");
  });
});

describe("frame checks", () => {
  const context = { dictionary: DICTIONARY, glue: GLUE, random: seeded(1) };

  it("reports undeclared slots, unknown words and slots that match nothing", () => {
    const f = frame({
      es: "Mi {n} trabaja con {x}.",
      en: "My {n} works.",
      slots: { n: { kind: "noun", ids: ["nadie"] } },
    });
    const { errors } = checkFrame(f, context);
    expect(errors.join("\n")).toMatch(/\{x\}, which is not a slot/);
    expect(errors.join("\n")).toMatch(/"trabaja" is neither/);
    expect(errors.join("\n")).toMatch(/matches no dictionary entries/);
  });
});

describe("the bundled frames", () => {
  const glue = glueSchema.parse(glueFile);
  const { frames } = framesFileSchema.parse(framesFile);

  it("all pass their checks against the real dictionary", () => {
    for (const f of frames) {
      const { errors } = checkFrame(f, { dictionary: entries, glue, random: seeded(2) });
      expect(errors, f.id).toEqual([]);
    }
  });

  it("have unique ids", () => {
    const ids = frames.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
