import type { Theme } from "./local.ts";

/** The phone's status bar colour for each theme: the page's paper colour. */
const THEME_COLOR: Record<Theme, string> = { light: "#faf8f4", dark: "#141715" };

const systemDark = () => globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

/** The theme on screen: the one chosen, else the device's. */
export function effectiveTheme(chosen: Theme | undefined): Theme {
  return chosen ?? (systemDark() ? "dark" : "light");
}

/**
 * Apply a chosen theme, or none to follow the device. The attribute is what the
 * dark tokens in index.css key on; the theme-color metas colour the status bar,
 * and both are pointed at the chosen theme so neither media query wins.
 */
export function applyTheme(chosen: Theme | undefined): void {
  const root = document.documentElement;
  if (chosen) root.dataset.theme = chosen;
  else delete root.dataset.theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const media = meta.media.includes("dark") ? "dark" : "light";
    meta.content = THEME_COLOR[chosen ?? media];
  }
}

/** Calls back when the device switches between light and dark. */
export function onSystemThemeChange(callback: () => void): () => void {
  const query = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
  query?.addEventListener("change", callback);
  return () => query?.removeEventListener("change", callback);
}
