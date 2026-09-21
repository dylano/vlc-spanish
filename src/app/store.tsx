import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { countWords } from "../lib/counts.ts";
import { today } from "../lib/dates.ts";
import type { Direction, Progress, ProgressBlob } from "../lib/schema.ts";
import { entries } from "./dictionary.ts";
import {
  readName,
  readProgress,
  readSessionSize,
  readTheme,
  requestPersistentStorage,
  writeName,
  writeProgress,
  writeSessionSize,
  writeTheme,
  type Theme,
} from "./local.ts";
import { applyTheme, effectiveTheme, onSystemThemeChange } from "./theme.ts";
import { StoreContext, type Store } from "./store-context.ts";

export function StoreProvider({ children }: { children: ReactNode }) {
  // Read synchronously on first render: local storage is immediate, so there is
  // no loading state and a session never starts from empty progress by mistake.
  const [name, setNameState] = useState(readName);
  const [progress, setProgress] = useState<ProgressBlob>(readProgress);

  // Undefined until chosen in Settings: until then the app follows the device,
  // and Settings shows whichever of light or dark that currently is.
  const [chosenTheme, setChosenTheme] = useState<Theme | undefined>(readTheme);
  const [systemTheme, setSystemTheme] = useState<Theme>(() => effectiveTheme(undefined));
  const theme = chosenTheme ?? systemTheme;
  const [sessionSize, setSessionSizeState] = useState(readSessionSize);

  useEffect(() => {
    requestPersistentStorage();
  }, []);

  useEffect(() => {
    applyTheme(chosenTheme);
  }, [chosenTheme]);

  useEffect(
    () =>
      onSystemThemeChange(() => {
        setSystemTheme(effectiveTheme(undefined));
      }),
    [],
  );

  const setTheme = useCallback((next: Theme) => {
    writeTheme(next);
    setChosenTheme(next);
  }, []);

  const setSessionSize = useCallback((next: number) => {
    writeSessionSize(next);
    setSessionSizeState(next);
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
    () => ({
      entries,
      name,
      setName,
      progress,
      recordResults,
      counts,
      theme,
      setTheme,
      sessionSize,
      setSessionSize,
    }),
    [name, setName, progress, recordResults, counts, theme, setTheme, sessionSize, setSessionSize],
  );

  return <StoreContext value={value}>{children}</StoreContext>;
}
