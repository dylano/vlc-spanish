import type { Config } from "@netlify/functions";
import { z } from "zod";
import { slugify } from "../../src/lib/slug.ts";
import { json, problem, readJson } from "../lib/http.mts";
import { ConflictError, readUsers, updateBlob, USERS_KEY, vocabStore } from "../lib/store.mts";

const bodySchema = z.object({
  displayName: z.string().trim().min(1).max(40),
});

export default async (req: Request): Promise<Response> => {
  const store = vocabStore();

  if (req.method === "GET") {
    try {
      return json((await readUsers(store)).data);
    } catch (error) {
      return problem(500, "Could not read the user list", (error as Error).message);
    }
  }

  const body = await readJson(req, bodySchema);
  if (!body.ok) return body.response;

  const id = slugify(body.data.displayName);
  if (id === "") {
    return problem(400, "That name has no letters or digits in it");
  }

  try {
    const blob = await updateBlob(store, USERS_KEY, readUsers, (current) => {
      if (current.users.some((user) => user.id === id)) return current;
      return {
        users: [
          ...current.users,
          { id, displayName: body.data.displayName, createdAt: new Date().toISOString() },
        ],
      };
    });

    const user = blob.users.find((candidate) => candidate.id === id);
    return json({ user, users: blob.users }, 201);
  } catch (error) {
    if (error instanceof ConflictError) {
      return problem(409, "Someone else was adding a name at the same time; try again");
    }
    return problem(500, "Could not add the name", (error as Error).message);
  }
};

export const config: Config = {
  path: "/api/users",
  method: ["GET", "POST"],
};
