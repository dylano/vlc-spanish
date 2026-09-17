import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router";
import styles from "./SessionShell.module.css";
import { useVisualViewport } from "./useVisualViewport.ts";

interface SessionShellProps {
  /**
   * How many words of the session are done and how many it has, or undefined for
   * screens outside a session. Counted in words so a matching round or a gap with
   * several blanks advances the bar by as many words as it holds.
   */
  position?: { index: number; total: number };
  /** Small-caps label on the right of the counter: the exercise being asked, or on the summary where the session came from. */
  label?: string;
  /** Pinned below the scrolling body; stays directly above the keyboard. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * The frame every exercise runs in.
 *
 * It is sized to the visual viewport rather than the page, so when the keyboard
 * opens the whole session compresses into the space above it: header at the top,
 * the action button directly on top of the keyboard, and the question between
 * them scrolling only if it truly cannot fit. The main nav is left out on purpose
 * — a session is a focused screen, and the close button is the way out.
 */
export default function SessionShell({ position, label, footer, children }: SessionShellProps) {
  const { height, offsetTop, obscured } = useVisualViewport();
  const navigate = useNavigate();

  // The frame is fixed, but iOS will still scroll the document underneath it to
  // reveal a focused input. With nothing to scroll, the frame stays put.
  useEffect(() => {
    document.documentElement.classList.add(styles.locked!);
    return () => {
      document.documentElement.classList.remove(styles.locked!);
    };
  }, []);

  return (
    <div
      className={styles.frame}
      data-obscured={obscured || undefined}
      style={{ height: height || undefined, transform: `translateY(${offsetTop}px)` }}
    >
      <div className={styles.column}>
        <header className={styles.header}>
          {position ? (
            <div className={styles.progress} aria-hidden="true">
              {Array.from({ length: position.total }, (_, segment) => (
                <div
                  key={segment}
                  className={`${styles.segment} ${segment < position.index ? styles.segmentDone : ""}`}
                />
              ))}
            </div>
          ) : null}
          <div className={styles.meta}>
            <span>
              {position
                ? `${Math.min(position.index + 1, position.total)} of ${position.total}`
                : ""}
            </span>
            <span className={styles.metaEnd}>
              {label ? <span className={styles.exercise}>{label}</span> : null}
              <button
                type="button"
                className={styles.close}
                aria-label="End session"
                // Same reason as the answer button: a tap here must not steal
                // focus and drop the keyboard before navigation happens.
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  void navigate("/");
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </span>
          </div>
        </header>

        <div className={styles.body}>{children}</div>

        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  );
}
