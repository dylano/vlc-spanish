import { describe, expect, it } from "vite-plus/test";
import { entries } from "../../app/dictionary.ts";
import type { Card } from "../../lib/session.ts";
import { promptText } from "./shared.ts";

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
