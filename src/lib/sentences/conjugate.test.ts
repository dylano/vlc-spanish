import { describe, expect, it } from "vite-plus/test";
import { entries } from "../../app/dictionary.ts";
import type { VerbEntry } from "../schema.ts";
import { regularForm, verbForm } from "./conjugate.ts";

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
