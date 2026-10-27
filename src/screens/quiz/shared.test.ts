import { describe, expect, it } from "vite-plus/test";
import { entries } from "../../app/dictionary.ts";
import type { Card } from "../../lib/session.ts";
import { promptDetail, promptText } from "./shared.ts";

const card = (id: string, direction: Card["direction"]) =>
  ({ entry: entries.find((entry) => entry.id === id)!, direction, prompt: "the prompt" }) as Card;

describe("the prompt", () => {
  it("shows a Spanish noun with its article, as the Dictionary does", () => {
    expect(promptText(card("manzana", "es→en"))).toBe("la manzana");
    expect(promptText(card("agua", "es→en"))).toBe("el agua");
    expect(promptText(card("estudiante", "es→en"))).toBe("el/la estudiante");
    expect(promptText(card("padres", "es→en"))).toBe("los padres");
    expect(promptText(card("lunes", "es→en"))).toBe("el lunes");
  });

  it("leaves bare what Spanish uses bare, and anything that is not a noun", () => {
    expect(promptText(card("enero", "es→en"))).toBe("enero");
    expect(promptText(card("comer", "es→en"))).toBe("comer");
  });

  it("shows the English prompt the other way", () => {
    expect(promptText(card("manzana", "en→es"))).toBe("the prompt");
  });
});

describe("the line under an english prompt", () => {
  const fold = (text: string) =>
    text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();

  it("never gives the answer away in a hint", () => {
    for (const entry of entries.filter((candidate) => candidate.hint)) {
      // Real cards carry the hint (toCard in session.ts); the helper here does not.
      const detail = fold(promptDetail({ ...card(entry.id, "en→es"), hint: entry.hint })!);
      const answers = [entry.es, ...Object.values(entry.forms ?? {})].filter(
        (form): form is string => typeof form === "string",
      );
      for (const answer of answers) expect(detail, entry.id).not.toContain(fold(answer));
    }
  });
});
