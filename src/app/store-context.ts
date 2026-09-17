import { createContext, use } from "react";
import type { Counts } from "../lib/counts.ts";
import type { Direction, Entry, Progress, ProgressBlob } from "../lib/schema.ts";

export interface Store {
  entries: Entry[];
  /** The learner's name, or undefined until they have given one. */
  name?: string;
  setName: (name: string) => void;
  progress: ProgressBlob;
  recordResults: (results: { entryId: string; direction: Direction; next: Progress }[]) => void;
  counts: Counts;
}

export const StoreContext = createContext<Store | undefined>(undefined);

export function useStore(): Store {
  const store = use(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}
