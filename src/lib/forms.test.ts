import { describe, expect, it } from "vite-plus/test";
import { entries } from "../app/dictionary.ts";
import { cardForms, regularPlural, type Run } from "./forms.ts";

const forms = (id: string) => cardForms(entries.find((entry) => entry.id === id)!);
/** The headword as shown, with the quiet runs in [brackets]. */
const shown = (runs: Run[]) => runs.map((run) => (run.quiet ? `[${run.text}]` : run.text)).join("");

describe("the forms on a Dictionary card", () => {
  it("puts the other gender in shorthand, keeping the masculine's article", () => {
    expect(shown(forms("abuelo").spanish)).toBe("el abuelo[/a]");
    expect(shown(forms("profesor").spanish)).toBe("el profesor[/a]");
    expect(shown(forms("disenador-de-moda").spanish)).toBe("el diseñador[/a] de moda");
    expect(shown(forms("simpatico").spanish)).toBe("simpático[/a]");
    expect(shown(forms("trabajador").spanish)).toBe("trabajador[/a]");
  });

  it("puts an adjective phrase's shorthand on its last word", () => {
    expect(shown(forms("bien-comunicado").spanish)).toBe("bien comunicado[/a]");
    expect(shown(forms("mal-comunicado").spanish)).toBe("mal comunicado[/a]");
  });

  it("gives este and ese their plural endings, and the changed English plural", () => {
    expect(forms("este")).toMatchObject({
      english: ["this"],
      englishPlural: "these",
      grammar: ["adj"],
    });
    expect(shown(forms("este").spanish)).toBe("este[/a/os/as]");
    expect(shown(forms("ese").spanish)).toBe("ese[/a/os/as]");
  });

  it("writes out a feminine that drops an accent", () => {
    expect(shown(forms("bailarin").spanish)).toBe("el bailarín[ / ]la bailarina");
    expect(shown(forms("dormilon").spanish)).toBe("dormilón[ / ]dormilona");
  });

  it("does not pair a different word: padre and madre have their own entries", () => {
    expect(shown(forms("padre").spanish)).toBe("el padre");
    expect(forms("padre").english).toEqual(["father, dad"]);
    expect(shown(forms("marido").spanish)).toBe("el marido");
  });

  it("pairs the English when the feminine's differs, and only then", () => {
    expect(forms("sobrino").english).toEqual(["nephew", "niece"]);
    expect(forms("profesor").english).toEqual(["teacher, professor, lecturer"]);
  });

  it("shows a plural only when it is not simply -s or -es", () => {
    expect(forms("lapiz").grammar).toEqual(["noun", "pl. lápices"]);
    expect(forms("jersey").grammar).toEqual(["noun", "pl. jerséis"]);
    expect(forms("lunes").grammar).toEqual(["noun", "pl. lunes"]);
    expect(forms("sobrino").grammar).toEqual(["noun"]);
    expect(regularPlural("diseñador de moda", "diseñadores de moda")).toBe(true);
    expect(regularPlural("volcán", "volcanes")).toBe(false);
  });

  it("marks a noun always plural, or with no plural", () => {
    expect(forms("gafas")).toMatchObject({ grammar: ["noun", "always plural"] });
    expect(shown(forms("gafas").spanish)).toBe("las gafas");
    expect(forms("ropa-interior").grammar).toEqual(["noun", "no plural"]);
  });

  it("leaves common-gender nouns and invariable adjectives as they were", () => {
    expect(shown(forms("estudiante").spanish)).toBe("el/la estudiante");
    expect(shown(forms("inteligente").spanish)).toBe("inteligente");
  });
});
