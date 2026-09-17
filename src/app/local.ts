import { progressBlobSchema, type ProgressBlob } from "../lib/schema.ts";

/*
 * Everything the app remembers lives in this browser's local storage: the
 * learner's name and their progress. There is no server and no account, so
 * progress belongs to one browser on one device.
 */

/**
 * The id stamped on progress records. The schema predates the app becoming
 * single-user; one fixed id keeps it valid without a migration.
 */
export const LOCAL_USER = "me";

export const NAME_KEY = "vlc-spanish:name";
export const PROGRESS_KEY = "vlc-spanish:progress";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

/** localStorage can be missing or throw (private windows, blocked storage); never let that break the app. */
function storage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

export const EMPTY_PROGRESS: ProgressBlob = { userId: LOCAL_USER, entries: {} };

export function readName(store: Storage | undefined = storage()): string | undefined {
  try {
    const name = store?.getItem(NAME_KEY)?.trim();
    return name ? name : undefined;
  } catch {
    return undefined;
  }
}

export function writeName(name: string, store: Storage | undefined = storage()): void {
  try {
    store?.setItem(NAME_KEY, name.trim());
  } catch {
    // Remembering the name is a convenience; the session still works without it.
  }
}

/** Saved progress, or empty progress if there is none or it cannot be read. */
export function readProgress(store: Storage | undefined = storage()): ProgressBlob {
  try {
    const raw = store?.getItem(PROGRESS_KEY);
    if (!raw) return EMPTY_PROGRESS;
    const parsed = progressBlobSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY_PROGRESS;
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function writeProgress(
  progress: ProgressBlob,
  store: Storage | undefined = storage(),
): void {
  try {
    store?.setItem(
      PROGRESS_KEY,
      JSON.stringify({ ...progress, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // Storage full or blocked: keep going with what is in memory.
  }
}

/**
 * Ask the browser not to clear this site's storage under pressure. Safari in
 * particular deletes storage for sites not visited in a week unless the app is
 * installed to the home screen; this is a request the browser may refuse.
 */
export function requestPersistentStorage(): void {
  void globalThis.navigator?.storage?.persist?.().catch(() => undefined);
}
