import { describe, expect, it } from "vite-plus/test";
import { matchesTranslation, type Translation } from "./translate.ts";

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
