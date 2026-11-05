import { useEffect } from "react";

/*
 * Keyboard shortcuts for Buttons, on a computer. A Button with a shortcut carries
 * it as data-shortcut; one listener on the page finds the visible, enabled button
 * for the key pressed and clicks it, so a shortcut does exactly what a tap does.
 *
 * - Letters never fire while typing in a field.
 * - Enter is left to the page when a field has focus (its form submits on its own)
 *   or a button was reached from the keyboard (Enter presses that one). A button
 *   only focused by a click does not count: Enter still goes to the main button.
 * - With a dialog open, only its own buttons answer; Escape there closes it.
 */

/** "Enter", "Escape", or a lowercase letter. */
export type Shortcut = "Enter" | "Escape" | Lowercase<string>;

/** What the keycap says. */
export function keycapLabel(shortcut: Shortcut): string {
  if (shortcut === "Enter") return "↵";
  if (shortcut === "Escape") return "Esc";
  return shortcut.toUpperCase();
}

interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  repeat: boolean;
  isComposing: boolean;
}

/** The shortcut a key press names, or undefined for one no Button can have. */
export function shortcutFor(event: KeyLike): Shortcut | undefined {
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || event.isComposing) {
    return undefined;
  }
  if (event.key === "Enter" || event.key === "Escape") return event.key;
  if (/^[a-z]$/i.test(event.key)) return event.key.toLowerCase() as Lowercase<string>;
  return undefined;
}

const FIELD =
  'input:not([type="button"], [type="submit"], [type="checkbox"], [type="radio"]), textarea, select, [contenteditable]';

function visible(element: HTMLElement): boolean {
  if (element.getClientRects().length === 0) return false;
  return getComputedStyle(element).visibility === "visible";
}

function press(event: KeyboardEvent) {
  if (event.defaultPrevented) return;
  const shortcut = shortcutFor(event);
  if (!shortcut) return;

  const target = event.target instanceof Element ? event.target : undefined;
  const inField = target?.closest(FIELD);
  if (shortcut === "Enter") {
    if (inField) return;
    if (target?.closest("button, a, [role=button]") && target.matches(":focus-visible")) return;
  } else if (shortcut !== "Escape" && inField) {
    return;
  }

  const scope = document.querySelector("dialog[open]") ?? document;
  const button = [...scope.querySelectorAll<HTMLElement>(`[data-shortcut="${shortcut}"]`)].find(
    (candidate) => visible(candidate) && !candidate.matches(":disabled"),
  );
  if (!button) return;
  event.preventDefault();
  button.click();
}

/** Listens for every Button's shortcut; called once, at the top of the app. */
export function useShortcuts() {
  useEffect(() => {
    globalThis.addEventListener("keydown", press);
    return () => {
      globalThis.removeEventListener("keydown", press);
    };
  }, []);
}
