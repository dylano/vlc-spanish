import { progressBlobSchema, type ProgressBlob } from "../lib/schema.ts";

/*
 * Everything the app remembers lives in this browser's local storage: the
 * learner's name, their progress, and two settings (theme, session length). There is no server and no account, so
 * progress belongs to one browser on one device.
 */

/**
 * The id stamped on progress records. The schema predates the app becoming
 * single-user; one fixed id keeps it valid without a migration.
 */
export const LOCAL_USER = "me";

export const NAME_KEY = "vlc-spanish:name";
export const PROGRESS_KEY = "vlc-spanish:progress";
/** Also read by the inline script in index.html, which applies it before first paint. */
export const THEME_KEY = "vlc-spanish:theme";
export const SESSION_SIZE_KEY = "vlc-spanish:session-size";

export type Theme = "light" | "dark";

/** The session lengths Settings offers, in words. */
export const SESSION_SIZES = [10, 15, 20, 30] as const;
export const DEFAULT_SESSION_SIZE = 15;

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

/** The theme chosen in Settings, or undefined to follow the device. */
export function readTheme(store: Storage | undefined = storage()): Theme | undefined {
  try {
    const theme = store?.getItem(THEME_KEY);
    return theme === "light" || theme === "dark" ? theme : undefined;
  } catch {
    return undefined;
  }
}

export function writeTheme(theme: Theme, store: Storage | undefined = storage()): void {
  try {
    store?.setItem(THEME_KEY, theme);
  } catch {
    // The choice still applies for this visit.
  }
}

/** Words per session, from Settings; anything unexpected falls back to the default. */
export function readSessionSize(store: Storage | undefined = storage()): number {
  try {
    const size = Number(store?.getItem(SESSION_SIZE_KEY));
    return (SESSION_SIZES as readonly number[]).includes(size) ? size : DEFAULT_SESSION_SIZE;
  } catch {
    return DEFAULT_SESSION_SIZE;
  }
}

export function writeSessionSize(size: number, store: Storage | undefined = storage()): void {
  try {
    store?.setItem(SESSION_SIZE_KEY, String(size));
  } catch {
    // The choice still applies for this visit.
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
