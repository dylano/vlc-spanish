import {
  dictionarySchema,
  progressBlobSchema,
  usersBlobSchema,
  type Dictionary,
  type ProgressBlob,
  type User,
} from "./lib/schema.ts";

/**
 * Typed client over the Netlify functions. Every response is validated with the
 * same zod schemas the functions use, so a shape change surfaces here rather
 * than as an undefined deep inside a component.
 */

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection.", 0);
  }

  // A bare `vp dev` server has no functions and falls back to index.html for
  // /api/*, so a 200 full of HTML is a likely and confusing failure. Name it.
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    throw new ApiError(
      "The server returned a page instead of data. Run the app with `netlify dev` (port 8888) so the api routes exist.",
      response.status,
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return body;
}

export async function fetchDictionary(): Promise<Dictionary> {
  return dictionarySchema.parse(await request("/api/dictionary"));
}

export async function fetchUsers(): Promise<User[]> {
  return usersBlobSchema.parse(await request("/api/users")).users;
}

export async function addUser(displayName: string): Promise<User[]> {
  const body = await request("/api/users", {
    method: "POST",
    body: JSON.stringify({ displayName }),
  });
  return usersBlobSchema.pick({ users: true }).parse(body).users;
}

export async function fetchProgress(userId: string): Promise<ProgressBlob> {
  return progressBlobSchema.parse(await request(`/api/progress/${encodeURIComponent(userId)}`));
}

export async function saveProgress(blob: ProgressBlob): Promise<ProgressBlob> {
  const body = await request(`/api/progress/${encodeURIComponent(blob.userId)}`, {
    method: "PUT",
    body: JSON.stringify(blob),
  });
  return progressBlobSchema.parse(body);
}
