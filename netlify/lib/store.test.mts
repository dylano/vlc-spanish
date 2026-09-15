import { describe, expect, it } from "vite-plus/test";
import type { Dictionary, Entry } from "../../src/lib/schema.ts";
import { ConflictError, EMPTY_DICTIONARY, updateBlob, upsertEntries } from "./store.mts";
import type { Store } from "@netlify/blobs";

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

/**
 * In-memory stand-in for a Blobs store. `supportsEtag: false` reproduces the
 * local `netlify dev` store, which returns data with no etag at all.
 */
function fakeStore(options: { supportsEtag: boolean; seed?: unknown }) {
  const state: { value: unknown; etag: string; exists: boolean } = {
    value: options.seed,
    etag: "etag-0",
    exists: options.seed !== undefined,
  };
  let writes = 0;

  const store = {
    setJSON(_key: string, value: unknown, opts?: { onlyIfNew?: true; onlyIfMatch?: string }) {
      writes += 1;
      if (opts?.onlyIfNew && state.exists) return Promise.resolve({ modified: false });
      if (opts?.onlyIfMatch !== undefined && opts.onlyIfMatch !== state.etag) {
        return Promise.resolve({ modified: false });
      }
      state.value = value;
      state.exists = true;
      state.etag = `etag-${writes}`;
      return Promise.resolve({ modified: true });
    },
  } as unknown as Store;

  const read = () =>
    Promise.resolve({
      data: (state.exists ? state.value : { users: [] }) as { users: string[] },
      etag: options.supportsEtag && state.exists ? state.etag : undefined,
      exists: state.exists,
    });

  return { store, read, writes: () => writes, value: () => state.value };
}

describe("updateBlob", () => {
  it("creates the blob when it does not exist", async () => {
    const fake = fakeStore({ supportsEtag: true });
    const result = await updateBlob(fake.store, "users", fake.read, (current) => ({
      users: [...current.users, "dylan"],
    }));
    expect(result.users).toEqual(["dylan"]);
  });

  it("updates an existing blob using its etag", async () => {
    const fake = fakeStore({ supportsEtag: true, seed: { users: ["dylan"] } });
    const result = await updateBlob(fake.store, "users", fake.read, (current) => ({
      users: [...current.users, "brenda"],
    }));
    expect(result.users).toEqual(["dylan", "brenda"]);
    expect(fake.writes()).toBe(1);
  });

  it("still writes when the store supplies no etag", async () => {
    // Regression: a missing etag was treated as "no blob", so the write went out
    // with onlyIfNew against an existing blob and could never succeed. Local
    // `netlify dev` behaves exactly this way.
    const fake = fakeStore({ supportsEtag: false, seed: { users: ["dylan"] } });
    const result = await updateBlob(fake.store, "users", fake.read, (current) => ({
      users: [...current.users, "brenda"],
    }));
    expect(result.users).toEqual(["dylan", "brenda"]);
  });

  it("gives up with a conflict when the etag keeps moving", async () => {
    const fake = fakeStore({ supportsEtag: true, seed: { users: [] } });
    const stale = () =>
      Promise.resolve({ data: { users: [] as string[] }, etag: "stale", exists: true });
    await expect(
      updateBlob(fake.store, "users", stale, (current) => current, 2),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
