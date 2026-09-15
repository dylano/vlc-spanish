import { describe, expect, it } from "vite-plus/test";
import type { Dictionary, Entry } from "../../src/lib/schema.ts";
import { EMPTY_DICTIONARY, upsertEntries } from "./store.mts";

function entry(id: string, en: string): Entry {
  return {
    id,
    es: id,
    en: [en],
    pos: "adv",
    tags: ["test"],
    added: "2026-09-15",
  };
}

describe("upsertEntries", () => {
  it("adds entries to an empty dictionary", () => {
    const result = upsertEntries(EMPTY_DICTIONARY, [entry("hoy", "today")]);
    expect(result.entries).toHaveLength(1);
    expect(result.version).toBe(1);
  });

  it("replaces an entry with the same id rather than duplicating it", () => {
    const first = upsertEntries(EMPTY_DICTIONARY, [entry("hoy", "today")]);
    const second = upsertEntries(first, [entry("hoy", "today, nowadays")]);
    expect(second.entries).toHaveLength(1);
    expect(second.entries[0]?.en).toEqual(["today, nowadays"]);
  });

  it("keeps existing entries when adding new ones", () => {
    const first = upsertEntries(EMPTY_DICTIONARY, [entry("hoy", "today")]);
    const second = upsertEntries(first, [entry("ayer", "yesterday")]);
    expect(second.entries.map((item) => item.id)).toEqual(["ayer", "hoy"]);
  });

  it("sorts by id so the blob has a stable order", () => {
    const result = upsertEntries(EMPTY_DICTIONARY, [
      entry("siempre", "always"),
      entry("a-menudo", "often"),
      entry("nunca", "never"),
    ]);
    expect(result.entries.map((item) => item.id)).toEqual(["a-menudo", "nunca", "siempre"]);
  });

  it("stamps updatedAt on every write", () => {
    const result = upsertEntries(EMPTY_DICTIONARY, [entry("hoy", "today")]);
    expect(result.updatedAt).toBeTruthy();
    expect(() => new Date(result.updatedAt!)).not.toThrow();
  });

  it("does not mutate the dictionary it was given", () => {
    const original: Dictionary = { version: 1, entries: [entry("hoy", "today")] };
    upsertEntries(original, [entry("ayer", "yesterday")]);
    expect(original.entries).toHaveLength(1);
  });

  it("applies the last value when the same id appears twice in one batch", () => {
    const result = upsertEntries(EMPTY_DICTIONARY, [entry("hoy", "first"), entry("hoy", "second")]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.en).toEqual(["second"]);
  });
});
