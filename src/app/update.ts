import { useEffect } from "react";
import { dueForCheck, newerBuild } from "../lib/update.ts";
import { markJustUpdated, readUpdateChecked, writeUpdateChecked } from "./local.ts";

/**
 * Home's update check: when Home opens, and when the app comes back to it from
 * the background, at most every 6 hours, ask which build is live and reload onto
 * a newer one. Home is never mid-session, so a reload there loses nothing. If
 * Home has gone (a session started) before the answer arrives, no reload: the
 * next visit, after the next interval, picks it up.
 *
 * Only in a production build: the dev server has no version.json and reloads
 * itself on every change anyway. Each deploy, a PR preview included, is its own
 * site with its own version.json, so a preview only ever compares with itself.
 */
export function useUpdateCheck(): void {
  useEffect(() => {
    if (!import.meta.env.PROD) return undefined;
    let here = true;

    async function check() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (!dueForCheck(readUpdateChecked(), now)) return;
      writeUpdateChecked(now);
      try {
        const response = await fetch("/version.json", { cache: "no-store" });
        if (!response.ok) return;
        const live: unknown = await response.json();
        if (here && document.visibilityState === "visible" && newerBuild(live, __COMMIT__)) {
          markJustUpdated();
          globalThis.location.reload();
        }
      } catch {
        // Offline or the file is missing: try again next interval.
      }
    }

    void check();
    function onVisible() {
      void check();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      here = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
