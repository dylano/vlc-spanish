import { describe, expect, it } from "vite-plus/test";
import {
  EMPTY_PROGRESS,
  LOCAL_USER,
  NAME_KEY,
  PROGRESS_KEY,
  readName,
  readProgress,
  writeName,
  writeProgress,
} from "./local.ts";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    data,
  };
}

const record = {
  userId: LOCAL_USER,
  entryId: "abuelo",
  direction: "en→es" as const,
  due: "2026-09-18",
  interval: 1,
  ease: 2.5,
  reps: 1,
  lapses: 0,
};

describe("local progress", () => {
  it("starts empty when nothing has been saved", () => {
    expect(readProgress(memoryStorage())).toEqual(EMPTY_PROGRESS);
  });

  it("round-trips what was saved", () => {
    const store = memoryStorage();
    writeProgress({ userId: LOCAL_USER, entries: { abuelo: { "en→es": record } } }, store);
    expect(readProgress(store).entries.abuelo?.["en→es"]).toEqual(record);
  });

  it("starts empty rather than failing on unreadable data", () => {
    expect(readProgress(memoryStorage({ [PROGRESS_KEY]: "{not json" }))).toEqual(EMPTY_PROGRESS);
    expect(readProgress(memoryStorage({ [PROGRESS_KEY]: '{"entries": 3}' }))).toEqual(
      EMPTY_PROGRESS,
    );
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readProgress(broken)).toEqual(EMPTY_PROGRESS);
    expect(() => {
      writeProgress(EMPTY_PROGRESS, broken);
    }).not.toThrow();
  });
});

describe("local name", () => {
  it("is absent until one is saved, and trimmed when it is", () => {
    const store = memoryStorage();
    expect(readName(store)).toBeUndefined();
    writeName("  Dylan ", store);
    expect(store.data.get(NAME_KEY)).toBe("Dylan");
    expect(readName(store)).toBe("Dylan");
  });

  it("treats a blank name as no name", () => {
    expect(readName(memoryStorage({ [NAME_KEY]: "   " }))).toBeUndefined();
  });
});
