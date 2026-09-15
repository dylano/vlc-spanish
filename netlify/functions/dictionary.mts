import type { Config } from "@netlify/functions";
import { json, problem } from "../lib/http.mts";
import { readDictionary, vocabStore } from "../lib/store.mts";

export default async (): Promise<Response> => {
  try {
    const { data, etag } = await readDictionary(vocabStore());
    return json(data, 200, etag ? { etag } : undefined);
  } catch (error) {
    return problem(500, "Could not read the dictionary", (error as Error).message);
  }
};

export const config: Config = {
  path: "/api/dictionary",
  method: ["GET"],
};
