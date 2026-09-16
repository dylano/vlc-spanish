import { describe, expect, it } from "vite-plus/test";
import { progressBlobSchema, entrySchema, dictionarySchema } from "./schema.ts";

const progress = {
  userId: "dylan",
  entryId: "abuelo",
  direction: "en→es" as const,
  due: "2026-09-15",
  interval: 1,
  ease: 2.5,
  reps: 1,
  lapses: 0,
};

describe("progressBlobSchema", () => {
  it("accepts an entry practiced in only one direction", () => {
    const result = progressBlobSchema.safeParse({
      userId: "dylan",
      entries: { abuelo: { "en→es": progress } },
    });
    expect(result.success).toBe(true);
  });

  it("accepts an entry practiced in both directions", () => {
    const result = progressBlobSchema.safeParse({
      userId: "dylan",
      entries: {
        abuelo: { "en→es": progress, "es→en": { ...progress, direction: "es→en" } },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a user with no progress at all", () => {
    expect(progressBlobSchema.safeParse({ userId: "dylan", entries: {} }).success).toBe(true);
  });

  it("rejects an unknown direction key", () => {
    const result = progressBlobSchema.safeParse({
      userId: "dylan",
      entries: { abuelo: { sideways: progress } },
    });
    expect(result.success).toBe(false);
  });
});

describe("entrySchema", () => {
  it("requires gender on a noun", () => {
    const result = entrySchema.safeParse({
      id: "mesa",
      es: "mesa",
      en: ["table"],
      pos: "noun",
      tags: ["house"],
      added: "2026-09-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an id that is not a slug", () => {
    const result = entrySchema.safeParse({
      id: "A Menudo",
      es: "a menudo",
      en: ["often"],
      pos: "adv",
      tags: ["frequency"],
      added: "2026-09-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty list of english answers", () => {
    const result = entrySchema.safeParse({
      id: "hoy",
      es: "hoy",
      en: [],
      pos: "adv",
      tags: ["time"],
      added: "2026-09-15",
    });
    expect(result.success).toBe(false);
  });
});

describe("dictionarySchema", () => {
  it("accepts an empty dictionary", () => {
    expect(dictionarySchema.safeParse({ version: 1, entries: [] }).success).toBe(true);
  });

  it("rejects an unknown version", () => {
    expect(dictionarySchema.safeParse({ version: 2, entries: [] }).success).toBe(false);
  });
});
