import type { Config } from "@netlify/functions";
import { z } from "zod";
import { entrySchema } from "../../src/lib/schema.ts";
import { json, problem, readJson } from "../lib/http.mts";
import {
  ConflictError,
  DICTIONARY_KEY,
  readDictionary,
  updateBlob,
  upsertEntries,
  vocabStore,
} from "../lib/store.mts";

const bodySchema = z.object({
  entries: z.array(entrySchema).min(1),
});

export default async (req: Request): Promise<Response> => {
  const body = await readJson(req, bodySchema);
  if (!body.ok) return body.response;

  const ids = body.data.entries.map((entry) => entry.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    return problem(400, "The same id appears more than once in this request", [
      ...new Set(duplicateIds),
    ]);
  }

  try {
    const store = vocabStore();
    const existing = new Set((await readDictionary(store)).data.entries.map((entry) => entry.id));
    const dictionary = await updateBlob(store, DICTIONARY_KEY, readDictionary, (current) =>
      upsertEntries(current, body.data.entries),
    );

    return json({
      added: ids.filter((id) => !existing.has(id)),
      updated: ids.filter((id) => existing.has(id)),
      total: dictionary.entries.length,
      updatedAt: dictionary.updatedAt,
    });
  } catch (error) {
    if (error instanceof ConflictError) {
      return problem(409, "Someone else was editing the dictionary; try again");
    }
    return problem(500, "Could not save the entries", (error as Error).message);
  }
};

export const config: Config = {
  path: "/api/entries",
  method: ["POST"],
};
