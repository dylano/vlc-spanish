import { z } from "zod";

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const merged = new Headers(headers);
  merged.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers: merged });
}

export function problem(status: number, message: string, details?: unknown): Response {
  return json({ error: message, ...(details === undefined ? {} : { details }) }, status);
}

/** Parse and validate a JSON request body, returning either the value or a 400. */
export async function readJson<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: problem(400, "Body must be valid JSON") };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: problem(
        400,
        "Body does not match the expected shape",
        parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      ),
    };
  }

  return { ok: true, data: parsed.data };
}
