import { createContext, use } from "react";
import type { Counts } from "../lib/counts.ts";
import type { Direction, Entry, Progress, ProgressBlob } from "../lib/schema.ts";
import type { Theme } from "./local.ts";

export interface Store {
  entries: Entry[];
  /** The learner's name, or undefined until they have given one. */
  name?: string;
  setName: (name: string) => void;
  progress: ProgressBlob;
  recordResults: (results: { entryId: string; direction: Direction; next: Progress }[]) => void;
  counts: Counts;
  /** The theme on screen: chosen in Settings, else the device's. */
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Words per session, from Settings. */
  sessionSize: number;
  setSessionSize: (size: number) => void;
}

export const StoreContext = createContext<Store | undefined>(undefined);

export function useStore(): Store {
  const store = use(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}
