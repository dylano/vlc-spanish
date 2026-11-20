import { describe, expect, it } from "vite-plus/test";
import { entries } from "../../app/dictionary.ts";
import type { VerbEntry } from "../schema.ts";
import {
  IRREGULAR_PARTICIPLES,
  participle,
  perfectForm,
  regularForm,
  regularParticiple,
  verbForm,
} from "./conjugate.ts";

const verb = (id: string) => entries.find((entry) => entry.id === id) as VerbEntry;

describe("regular conjugation", () => {
  it("follows the -ar, -er and -ir tables", () => {
    expect(regularForm("hablar", "vosotros")).toBe("habláis");
    expect(regularForm("comprender", "nosotros")).toBe("comprendemos");
    expect(regularForm("escribir", "vosotros")).toBe("escribís");
    expect(regularForm("cenar", "ellos")).toBe("cenan");
  });
});

describe("verb forms from the dictionary", () => {
  it("uses stored forms, pronoun included for reflexives", () => {
    expect(verbForm(verb("levantarse"), "yo", entries)).toBe("me levanto");
    expect(verbForm(verb("ir"), "nosotros", entries)).toBe("vamos");
  });

  it("conjugates a regular verb with no stored forms", () => {
    expect(verbForm(verb("desayunar"), "el", entries)).toBe("desayuna");
  });

  it("conjugates the first word of a multi-word verb through its own entry", () => {
    expect(verbForm(verb("hacer-la-cama"), "yo", entries)).toBe("hago la cama");
    expect(verbForm(verb("ir-al-trabajo"), "vosotros", entries)).toBe("vais al trabajo");
    expect(verbForm(verb("salir-del-trabajo"), "yo", entries)).toBe("salgo del trabajo");
    expect(verbForm(verb("llegar-al-trabajo"), "ellos", entries)).toBe("llegan al trabajo");
  });

  it("offers every dictionary verb in every person", () => {
    for (const entry of entries) {
      if (entry.pos !== "verb") continue;
      for (const subject of ["yo", "tu", "el", "nosotros", "vosotros", "ellos"] as const) {
        expect(verbForm(entry, subject, entries), `${entry.id} ${subject}`).toBeTruthy();
      }
    }
  });
});

describe("the pretérito perfecto", () => {
  it("makes a regular participle by rule, with an accent after a vowel", () => {
    expect(regularParticiple("hablar")).toBe("hablado");
    expect(regularParticiple("comer")).toBe("comido");
    expect(regularParticiple("vivir")).toBe("vivido");
    expect(regularParticiple("ir")).toBe("ido");
    expect(regularParticiple("leer")).toBe("leído");
    expect(regularParticiple("traer")).toBe("traído");
    expect(regularParticiple("construir")).toBe("construido");
  });

  it("uses a stored irregular participle, and says what the rule would have made", () => {
    expect(participle(verb("volver"), entries)).toEqual({
      form: "vuelto",
      irregular: true,
      regular: "volvido",
    });
    expect(participle(verb("comer"), entries)).toEqual({ form: "comido", irregular: false });
  });

  it("gives a multi-word verb its first word's participle", () => {
    expect(participle(verb("hacer-la-cama"), entries)?.form).toBe("hecho");
    expect(participle(verb("ir-al-trabajo"), entries)?.form).toBe("ido");
  });

  it("puts haber before the participle, a reflexive pronoun first and the phrase after", () => {
    expect(perfectForm(verb("comer"), "yo", entries)).toBe("he comido");
    expect(perfectForm(verb("ver"), "vosotros", entries)).toBe("habéis visto");
    expect(perfectForm(verb("levantarse"), "el", entries)).toBe("se ha levantado");
    expect(perfectForm(verb("lavarse-los-dientes"), "nosotros", entries)).toBe(
      "nos hemos lavado los dientes",
    );
    expect(perfectForm(verb("hacer-la-cama"), "ellos", entries)).toBe("han hecho la cama");
    expect(perfectForm(verb("tener-que"), "tu", entries)).toBe("has tenido que");
  });

  it("leaves gustar to the frames, which give it the pronoun of the person who likes", () => {
    expect(perfectForm(verb("gustar"), "yo", entries)).toBeUndefined();
  });

  it("has every other dictionary verb in every person, never an irregular made regular", () => {
    for (const entry of entries) {
      if (entry.pos !== "verb" || entry.verb.pattern === "gustar") continue;
      for (const subject of ["yo", "tu", "el", "nosotros", "vosotros", "ellos"] as const) {
        expect(perfectForm(entry, subject, entries), `${entry.id} ${subject}`).toBeTruthy();
      }
      // Never hacido, volvido, escribido: what the rule makes of an irregular verb.
      const wrong = Object.keys(IRREGULAR_PARTICIPLES).map(regularParticiple);
      expect(wrong, entry.id).not.toContain(participle(entry, entries)!.form);
    }
  });
});
