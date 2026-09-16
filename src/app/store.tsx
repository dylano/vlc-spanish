import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import * as api from "../api.ts";
import { today } from "../lib/dates.ts";
import type { Direction, Entry, Progress, ProgressBlob, User } from "../lib/schema.ts";
import { countWords } from "../lib/counts.ts";
import { StoreContext, type Store } from "./store-context.ts";

const USER_KEY = "vlc-spanish:user";

/** localStorage can throw in private windows; never let that break the app. */
function readStoredUser(): string | undefined {
  try {
    return globalThis.localStorage?.getItem(USER_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeStoredUser(userId: string | undefined): void {
  try {
    if (userId === undefined) globalThis.localStorage?.removeItem(USER_KEY);
    else globalThis.localStorage?.setItem(USER_KEY, userId);
  } catch {
    // A remembered name is a convenience, not a requirement.
  }
}

const EMPTY_PROGRESS: ProgressBlob = { userId: "", entries: {} };

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [storedUserId, setStoredUserId] = useState<string | undefined>(readStoredUser);
  const [loadedProgress, setLoadedProgress] = useState<ProgressBlob>(EMPTY_PROGRESS);

  const reload = useCallback(async () => {
    try {
      const [dictionary, userList] = await Promise.all([api.fetchDictionary(), api.fetchUsers()]);
      setEntries(dictionary.entries);
      setUsers(userList);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    // Fetching on mount is the "synchronise with an external system" case the
    // rule allows for; the state lands in an async callback, not synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    void reload();
  }, [reload]);

  // A remembered name that no longer exists on the server is ignored. Derived
  // during render rather than cleared in an effect, so there is no extra pass.
  const userId =
    storedUserId && (users.length === 0 || users.some((user) => user.id === storedUserId))
      ? storedUserId
      : undefined;

  const progress = userId && loadedProgress.userId === userId ? loadedProgress : EMPTY_PROGRESS;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    // Same as above: progress is fetched for whoever is practicing.
    // oxlint-disable-next-line react/set-state-in-effect
    void api
      .fetchProgress(userId)
      .then((blob) => {
        if (!cancelled) setLoadedProgress(blob);
      })
      .catch(() => {
        if (!cancelled) setLoadedProgress({ userId, entries: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const chooseUser = useCallback((id: string) => {
    setStoredUserId(id);
    writeStoredUser(id);
  }, []);

  const addUserAction = useCallback(
    async (displayName: string) => {
      const list = await api.addUser(displayName);
      setUsers(list);
      const created = list.find((user) => user.displayName === displayName.trim());
      if (created) chooseUser(created.id);
    },
    [chooseUser],
  );

  /**
   * Progress is written once per session rather than per card: a whole-blob PUT
   * after every answer would be a lot of writes for no benefit.
   */
  const recordResults = useCallback(
    (results: { entryId: string; direction: Direction; next: Progress }[]) => {
      setLoadedProgress((current) => {
        const updated: ProgressBlob = {
          ...current,
          userId: current.userId || (userId ?? ""),
          entries: { ...current.entries },
        };
        for (const { entryId, direction, next } of results) {
          updated.entries[entryId] = { ...updated.entries[entryId], [direction]: next };
        }
        void api.saveProgress(updated).catch(() => {
          // Keep the in-memory result; the next session write will retry.
        });
        return updated;
      });
    },
    [userId],
  );

  const counts = useMemo(() => countWords(entries, progress, today()), [entries, progress]);

  const value = useMemo<Store>(
    () => ({
      ready,
      error,
      entries,
      users,
      userId,
      progress,
      chooseUser,
      addUser: addUserAction,
      recordResults,
      counts,
      reload,
    }),
    [
      ready,
      error,
      entries,
      users,
      userId,
      progress,
      chooseUser,
      addUserAction,
      recordResults,
      counts,
      reload,
    ],
  );

  return <StoreContext value={value}>{children}</StoreContext>;
}
