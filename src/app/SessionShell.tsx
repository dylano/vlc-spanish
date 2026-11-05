import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import Button from "./Button.tsx";
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
/**
 * Esc mid-session asks first: Esc is easy to hit by accident, and the summary at
 * the end is worth reaching. Esc again keeps going; Enter ends it. The dialog
 * itself takes focus, not a button, so both keys go to their buttons' shortcuts.
 */
function EndDialog({ onKeep, onEnd }: { onKeep: () => void; onEnd: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.confirm}
      aria-labelledby="end-session-title"
      tabIndex={-1}
      onClose={onKeep}
    >
      <h2 id="end-session-title" className={styles.confirmTitle}>
        End this session?
      </h2>
      <div className={styles.confirmActions}>
        <Button variant="secondary" shortcut="Escape" onClick={() => ref.current?.close()}>
          Keep going
        </Button>
        <Button variant="primary" shortcut="Enter" onClick={onEnd}>
          End session
        </Button>
      </div>
    </dialog>
  );
}

export default function SessionShell({ position, label, footer, children }: SessionShellProps) {
  const { height, offsetTop, obscured } = useVisualViewport();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  // Something answered and the summary not yet reached.
  const midSession =
    position !== undefined && position.index > 0 && position.index < position.total;

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
              <Button
                className={styles.close}
                shortcut="Escape"
                keycap={false}
                aria-label="End session"
                // Same reason as the answer button: a tap here must not steal
                // focus and drop the keyboard before navigation happens.
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={(event) => {
                  // A tap ends the session at once. Esc arrives as a click with no
                  // pointer behind it (detail 0), and mid-session it asks first.
                  if (event.detail === 0 && midSession) {
                    setConfirming(true);
                    return;
                  }
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
              </Button>
            </span>
          </div>
        </header>

        <div className={styles.body}>{children}</div>

        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>

      {confirming ? (
        <EndDialog
          onKeep={() => {
            setConfirming(false);
          }}
          onEnd={() => {
            void navigate("/");
          }}
        />
      ) : null}
    </div>
  );
}
