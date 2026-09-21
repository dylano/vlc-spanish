import { describe, expect, it } from "vite-plus/test";
import { entries } from "../app/dictionary.ts";
import { conjugationTable } from "./conjugation.ts";
import type { VerbEntry } from "./schema.ts";

const table = (id: string) =>
  conjugationTable(entries.find((entry) => entry.id === id) as VerbEntry, entries);

/** Each row as text, marked parts in [brackets] and a reflexive pronoun in (parentheses). */
const shown = (id: string) =>
  table(id).rows.map((row) =>
    row.forms
      .map((form) =>
        form
          .map((part) =>
            part.kind === "mark"
              ? `[${part.text}]`
              : part.kind === "pronoun"
                ? `(${part.text.trim()}) `
                : part.text,
          )
          .join(""),
      )
      .join(" / "),
  );

describe("conjugation tables", () => {
  it("marks a stem change, but not in nosotros and vosotros", () => {
    expect(shown("preferir")).toEqual([
      "pref[ie]ro",
      "pref[ie]res",
      "pref[ie]re",
      "preferimos",
      "preferís",
      "pref[ie]ren",
    ]);
    expect(table("preferir").tags).toEqual(["e → ie"]);
    expect(shown("jugar")[0]).toBe("j[ue]go");
  });

  it("marks the endings of a regular verb", () => {
    expect(shown("hablar")).toEqual([
      "habl[o]",
      "habl[as]",
      "habl[a]",
      "habl[amos]",
      "habl[áis]",
      "habl[an]",
    ]);
    expect(table("hablar").tags).toEqual([]);
  });

  it("mutes a reflexive pronoun and tags the verb", () => {
    expect(shown("levantarse")[0]).toBe("(me) levant[o]");
    expect(shown("acostarse")[3]).toBe("(nos) acostamos");
    expect(table("acostarse").tags).toEqual(["o → ue", "reflexive"]);
  });

  it("marks a whole irregular form, and names an irregular yo", () => {
    expect(shown("ir")[0]).toBe("[voy]");
    expect(table("ir").tags).toEqual(["irregular"]);
    expect(shown("salir").slice(0, 2)).toEqual(["[salgo]", "sales"]);
    expect(table("salir").tags).toEqual(["irregular yo"]);
    expect(table("tener").tags).toEqual(["e → ie", "irregular yo"]);
  });

  it("keeps the rest of a phrase plain", () => {
    expect(shown("hacer-la-cama")[1]).toBe("haces la cama");
  });

  it("gives gustar one column for one thing and one for several, with no tag", () => {
    const gustar = table("gustar");
    expect(gustar.columns).toEqual(["One thing", "Several"]);
    expect(gustar.tags).toEqual([]);
    expect(shown("gustar")[0]).toBe("me gusta / me gusta[n]");
    expect(gustar.rows[2]!.person).toBe("a él, a ella");
  });
});
