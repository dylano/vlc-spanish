import { describe, expect, it } from "vite-plus/test";
import { entries } from "../app/dictionary.ts";
import { buildSearchIndex, search, searchKey } from "./search.ts";

const index = buildSearchIndex(entries);
const found = (query: string) => search(index, query).map((entry) => entry.id);

describe("dictionary search", () => {
  it("finds a word by the start of it", () => {
    expect(found("dic")).toContain("diciembre");
  });

  it("finds feminine and plural forms, and their English", () => {
    expect(found("hermana")[0]).toBe("hermano");
    expect(found("sister")).toContain("hermano");
    expect(found("zapatos")[0]).toBe("zapato");
    expect(found("simpáticas")).toContain("simpatico");
    expect(found("estos")[0]).toBe("este");
    expect(found("these")[0]).toBe("este");
  });

  it("finds a verb by any present-tense form", () => {
    expect(found("prefiero")).toEqual(["preferir"]);
    expect(found("hablamos")).toContain("hablar");
  });

  it("ignores a leading article in either language", () => {
    expect(found("la mesa")[0]).toBe("mesa");
    expect(found("the table")[0]).toBe("mesa");
    expect(found("to buy")[0]).toBe("comprar");
  });

  it("ignores accents and apostrophes, but not ñ", () => {
    expect(found("periodico")).toContain("periodico");
    expect(found("its hot")).toContain("hace-calor");
    expect(found("it’s hot")).toContain("hace-calor");
    expect(found("ñ").every((id) => id.includes("n"))).toBe(true);
    expect(found("ñ")).not.toContain("delgado");
  });

  it("puts exact matches first, then words that start with the query", () => {
    expect(found("mes")[0]).toBe("mes");
    expect(found("mesa")[0]).toBe("mesa");
  });

  it("returns everything alphabetically for an empty query", () => {
    expect(search(index, "  ")).toHaveLength(entries.length);
  });

  it("keeps a search key free of articles only at the start", () => {
    expect(searchKey("El Lunes")).toBe("lunes");
    expect(searchKey("a menudo")).toBe("menudo");
    expect(searchKey("la")).toBe("la");
  });
});
