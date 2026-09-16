import { createContext, use } from "react";
import type { Counts } from "../lib/counts.ts";
import type { Direction, Entry, Progress, ProgressBlob, User } from "../lib/schema.ts";

export interface Store {
  ready: boolean;
  error?: string;
  entries: Entry[];
  users: User[];
  userId?: string;
  progress: ProgressBlob;
  /**
   * Whether `progress` is the current user's real progress rather than the empty
   * placeholder shown while it loads. Anything built once from progress — a quiz
   * session — must wait for this.
   */
  progressLoaded: boolean;
  chooseUser: (userId: string) => void;
  addUser: (displayName: string) => Promise<void>;
  recordResults: (results: { entryId: string; direction: Direction; next: Progress }[]) => void;
  counts: Counts;
  reload: () => Promise<void>;
}

export const StoreContext = createContext<Store | undefined>(undefined);

export function useStore(): Store {
  const store = use(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}
