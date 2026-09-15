import type { Config, Context } from "@netlify/functions";
import { progressBlobSchema } from "../../src/lib/schema.ts";
import { json, problem, readJson } from "../lib/http.mts";
import { progressKey, readProgress, vocabStore } from "../lib/store.mts";

export default async (req: Request, context: Context): Promise<Response> => {
  const userId = context.params.userId;
  if (!userId) return problem(400, "Missing user id");

  const store = vocabStore();

  if (req.method === "GET") {
    try {
      return json((await readProgress(store, userId)).data);
    } catch (error) {
      return problem(500, "Could not read progress", (error as Error).message);
    }
  }

  const body = await readJson(req, progressBlobSchema);
  if (!body.ok) return body.response;

  if (body.data.userId !== userId) {
    return problem(400, "The body's userId does not match the url");
  }

  try {
    // A user's progress is only written by that user, from one device at a time,
    // so a plain replace is sufficient here — no conditional write needed.
    const next = { ...body.data, updatedAt: new Date().toISOString() };
    await store.setJSON(progressKey(userId), next);
    return json(next);
  } catch (error) {
    return problem(500, "Could not save progress", (error as Error).message);
  }
};

export const config: Config = {
  path: "/api/progress/:userId",
  method: ["GET", "PUT"],
};
