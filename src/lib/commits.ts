import { z } from "zod";

/**
 * Recent commits, read from GitHub when the Version screen is opened rather than
 * baked into the build: the messages are only interesting when there is a
 * connection, and a build that carried them would go stale the moment anything
 * else was pushed.
 */

/** The repository the app is deployed from. Public, so the API needs no key. */
export const REPO = "dylano/vlc-spanish";

const commitSchema = z.object({
  sha: z.string(),
  commit: z.object({
    message: z.string(),
    author: z.object({ date: z.string() }).partial().optional(),
  }),
});

export interface Commit {
  /** Short hash, as the version footer shows it. */
  hash: string;
  /** First line of the message: the rest is detail for the repo, not for here. */
  subject: string;
  date?: Date;
}

export function parseCommits(data: unknown): Commit[] {
  const parsed = z.array(commitSchema).safeParse(data);
  if (!parsed.success) return [];
  return parsed.data.map((entry) => {
    const date = entry.commit.author?.date ? new Date(entry.commit.author.date) : undefined;
    return {
      hash: entry.sha.slice(0, 7),
      subject: entry.commit.message.split("\n")[0]!.trim(),
      date: date && !Number.isNaN(date.getTime()) ? date : undefined,
    };
  });
}

/** The last `count` commits, or an error to show: offline is the common one. */
export async function fetchCommits(count = 10, signal?: AbortSignal): Promise<Commit[]> {
  const response = await fetch(
    `https://api.github.com/repos/${REPO}/commits?per_page=${String(count)}`,
    { signal, headers: { accept: "application/vnd.github+json" } },
  );
  if (!response.ok) throw new Error(`GitHub answered ${String(response.status)}`);
  return parseCommits(await response.json());
}
