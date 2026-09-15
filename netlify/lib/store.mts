import { getStore, type Store } from "@netlify/blobs";
import {
  dictionarySchema,
  progressBlobSchema,
  usersBlobSchema,
  type Dictionary,
  type Entry,
  type ProgressBlob,
  type UsersBlob,
} from "../../src/lib/schema.ts";

export const STORE_NAME = "vocab";
export const DICTIONARY_KEY = "dictionary";
export const USERS_KEY = "users";

export function progressKey(userId: string): string {
  return `progress/${userId}`;
}

/**
 * Strong consistency: this is a low-traffic family app, and someone adding a word
 * then immediately seeing it missing on refresh is far worse than a slower read.
 */
export function vocabStore(): Store {
  return getStore(STORE_NAME, { consistency: "strong" });
}

export const EMPTY_DICTIONARY: Dictionary = { version: 1, entries: [] };

interface Versioned<T> {
  data: T;
  /** Absent when the store does not supply one — the local dev store does not. */
  etag?: string;
  /** Whether the blob is actually present, which a missing etag does not tell us. */
  exists: boolean;
}

async function readVersioned<T>(
  store: Store,
  key: string,
  parse: (raw: unknown) => T,
  fallback: T,
): Promise<Versioned<T>> {
  const result = await store.getWithMetadata(key, { type: "json" });
  if (!result?.data) return { data: fallback, exists: false };
  return { data: parse(result.data), etag: result.etag, exists: true };
}

export function readDictionary(store: Store): Promise<Versioned<Dictionary>> {
  return readVersioned(
    store,
    DICTIONARY_KEY,
    (raw) => dictionarySchema.parse(raw),
    EMPTY_DICTIONARY,
  );
}

export function readUsers(store: Store): Promise<Versioned<UsersBlob>> {
  return readVersioned(store, USERS_KEY, (raw) => usersBlobSchema.parse(raw), { users: [] });
}

export function readProgress(store: Store, userId: string): Promise<Versioned<ProgressBlob>> {
  return readVersioned(store, progressKey(userId), (raw) => progressBlobSchema.parse(raw), {
    userId,
    entries: {},
  });
}

export class ConflictError extends Error {
  constructor(message = "The record changed while you were editing it") {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Read–modify–write against a blob using ETag conditional writes, so two people
 * writing at once cannot silently clobber each other. Retries on conflict.
 */
export async function updateBlob<T>(
  store: Store,
  key: string,
  read: (store: Store) => Promise<Versioned<T>>,
  modify: (current: T) => T,
  attempts = 4,
): Promise<T> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { data, etag, exists } = await read(store);
    const next = modify(data);

    // Three cases, and conflating the first two is a trap: the local dev store
    // returns no etag at all, so "no etag" cannot be read as "no blob" — doing
    // so writes with onlyIfNew against an existing blob and never succeeds.
    let options: { onlyIfNew: true } | { onlyIfMatch: string } | undefined;
    if (!exists) options = { onlyIfNew: true };
    else if (etag !== undefined) options = { onlyIfMatch: etag };
    else options = undefined; // last write wins; no conditional support available

    const { modified } = await store.setJSON(key, next, options);
    if (modified) return next;
  }
  throw new ConflictError();
}

/** Merge entries into a dictionary by id: existing ids are replaced, new ones appended. */
export function upsertEntries(dictionary: Dictionary, incoming: Entry[]): Dictionary {
  const byId = new Map(dictionary.entries.map((entry) => [entry.id, entry]));
  for (const entry of incoming) byId.set(entry.id, entry);
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}
