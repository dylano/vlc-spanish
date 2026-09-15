import { describe, expect, it } from "vite-plus/test";
import { slugify, uniqueSlug } from "./slug.ts";

describe("slugify", () => {
  it("folds accents to ascii", () => {
    expect(slugify("tímido")).toBe("timido");
    expect(slugify("niño")).toBe("nino");
    expect(slugify("simpático")).toBe("simpatico");
  });

  it("hyphenates multi-word headwords", () => {
    expect(slugify("a menudo")).toBe("a-menudo");
    expect(slugify("de vez en cuando")).toBe("de-vez-en-cuando");
  });

  it("leaves plain words alone", () => {
    expect(slugify("acostarse")).toBe("acostarse");
  });

  it("strips punctuation and stray hyphens", () => {
    expect(slugify("¿qué tal?")).toBe("que-tal");
    expect(slugify("  hola  ")).toBe("hola");
  });

  it("produces a valid slug for reflexive and pronominal entries", () => {
    expect(slugify("llamarse")).toBe("llamarse");
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free", () => {
    expect(uniqueSlug("para", [])).toBe("para");
  });

  it("suffixes when taken", () => {
    expect(uniqueSlug("para", ["para"])).toBe("para-2");
    expect(uniqueSlug("para", ["para", "para-2"])).toBe("para-3");
  });
});
