/*
 * Keeping an installed app current. A fresh launch already loads the latest
 * build (the service worker fetches the page network-first), but an app resumed
 * from the background keeps running the build it had, on iOS for days. So Home
 * asks the site which build is live (/version.json, written by the build from
 * the same commit as __COMMIT__) and reloads onto a newer one. Rarely critical,
 * so at most every CHECK_EVERY_MS.
 */

/** How often Home asks: 6 hours. */
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** Whether it is time to ask again. A clock moved backwards asks too, rather than never. */
export function dueForCheck(lastChecked: number | undefined, now: number): boolean {
  if (lastChecked === undefined) return true;
  return now - lastChecked >= CHECK_EVERY_MS || now < lastChecked;
}

/**
 * Whether version.json names a different build than the one running. Anything
 * unreadable, or a build that does not know its own commit, is never "newer":
 * reloading on a guess could loop.
 */
export function newerBuild(live: unknown, own: string): boolean {
  if (own === "unknown" || typeof live !== "object" || live === null) return false;
  const commit = (live as { commit?: unknown }).commit;
  return typeof commit === "string" && commit !== "" && commit !== "unknown" && commit !== own;
}
