import { useSyncExternalStore } from "react";

/**
 * The part of the page the user can actually see.
 *
 * iOS Safari does not resize the layout when the on-screen keyboard opens; it
 * shrinks the *visual* viewport and may scroll the page under it. Anything laid
 * out against 100dvh, like a button pinned to the bottom, ends up behind the
 * keyboard. The visual viewport is the only measurement that tracks it, and the
 * `interactive-widget` viewport hint that would fix this is not supported there.
 */
export interface ViewportBox {
  height: number;
  /** How far the visual viewport has scrolled down the layout viewport. */
  offsetTop: number;
  /**
   * Whether something (in practice the keyboard) is covering the bottom of the
   * screen. Used to drop the home-indicator inset, which sits under the keyboard.
   */
  obscured: boolean;
}

/** Below this much lost height the difference is browser chrome, not a keyboard. */
const KEYBOARD_THRESHOLD = 120;

let cached: ViewportBox = { height: 0, offsetTop: 0, obscured: false };

function read(): ViewportBox {
  const layoutHeight = globalThis.innerHeight;
  const visual = globalThis.visualViewport;
  const height = Math.round(visual?.height ?? layoutHeight);
  const offsetTop = Math.round(visual?.offsetTop ?? 0);
  const obscured = layoutHeight - height > KEYBOARD_THRESHOLD;

  // useSyncExternalStore needs a stable object while nothing has changed.
  if (cached.height !== height || cached.offsetTop !== offsetTop || cached.obscured !== obscured) {
    cached = { height, offsetTop, obscured };
  }
  return cached;
}

function subscribe(onChange: () => void): () => void {
  const visual = globalThis.visualViewport;
  globalThis.addEventListener("resize", onChange);
  visual?.addEventListener("resize", onChange);
  visual?.addEventListener("scroll", onChange);
  return () => {
    globalThis.removeEventListener("resize", onChange);
    visual?.removeEventListener("resize", onChange);
    visual?.removeEventListener("scroll", onChange);
  };
}

export function useVisualViewport(): ViewportBox {
  return useSyncExternalStore(subscribe, read);
}
