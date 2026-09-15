import { createContext, use } from "react";
import type { Direction, Entry, Progress, ProgressBlob, User } from "../lib/schema.ts";

export interface Store {
  ready: boolean;
  error?: string;
  entries: Entry[];
  users: User[];
  userId?: string;
  progress: ProgressBlob;
  chooseUser: (userId: string) => void;
  addUser: (displayName: string) => Promise<void>;
  recordResults: (results: { entryId: string; direction: Direction; next: Progress }[]) => void;
  dueCount: () => number;
  unseenCount: () => number;
  missedCount: () => number;
  reload: () => Promise<void>;
}

export const StoreContext = createContext<Store | undefined>(undefined);

export function useStore(): Store {
  const store = use(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}
