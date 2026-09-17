import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { countWords } from "../lib/counts.ts";
import { today } from "../lib/dates.ts";
import type { Direction, Progress, ProgressBlob } from "../lib/schema.ts";
import { entries } from "./dictionary.ts";
import {
  readName,
  readProgress,
  requestPersistentStorage,
  writeName,
  writeProgress,
} from "./local.ts";
import { StoreContext, type Store } from "./store-context.ts";

export function StoreProvider({ children }: { children: ReactNode }) {
  // Read synchronously on first render: local storage is immediate, so there is
  // no loading state and a session never starts from empty progress by mistake.
  const [name, setNameState] = useState(readName);
  const [progress, setProgress] = useState<ProgressBlob>(readProgress);

  useEffect(() => {
    requestPersistentStorage();
  }, []);

  const setName = useCallback((next: string) => {
    const trimmed = next.trim();
    if (trimmed === "") return;
    writeName(trimmed);
    setNameState(trimmed);
  }, []);

  /** Every answer is saved as it is given, so leaving mid-session loses nothing. */
  const recordResults = useCallback(
    (results: { entryId: string; direction: Direction; next: Progress }[]) => {
      setProgress((current) => {
        const updated: ProgressBlob = { ...current, entries: { ...current.entries } };
        for (const { entryId, direction, next } of results) {
          updated.entries[entryId] = { ...updated.entries[entryId], [direction]: next };
        }
        return updated;
      });
    },
    [],
  );

  useEffect(() => {
    writeProgress(progress);
  }, [progress]);

  const counts = useMemo(() => countWords(entries, progress, today()), [progress]);

  const value = useMemo<Store>(
    () => ({ entries, name, setName, progress, recordResults, counts }),
    [name, setName, progress, recordResults, counts],
  );

  return <StoreContext value={value}>{children}</StoreContext>;
}
