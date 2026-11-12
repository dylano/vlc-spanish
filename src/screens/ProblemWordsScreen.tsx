import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Button, { Keycap } from "../app/Button.tsx";
import { useStore } from "../app/store-context.ts";
import { canonicalAnswer } from "../lib/grade.ts";
import { forgiveMisses } from "../lib/scheduler.ts";
import type { Direction, Entry } from "../lib/schema.ts";
import { problemWords } from "../lib/problems.ts";
import type { CustomPracticeState } from "./CustomPracticeScreen.tsx";
import styles from "./ProblemWordsScreen.module.css";

/** How far left, as a share of the row, a swipe must go to remove it. */
const SWIPE_THRESHOLD = 0.35;
/** The slide out and the collapse after it, in ms; matches the CSS. */
const LEAVE_MS = 380;

/** Each row's remove button, in list order, leaving out rows already on their way out. */
function removeButtons(list: HTMLElement | null): HTMLElement[] {
  return [...(list?.querySelectorAll<HTMLElement>("li:not([data-leaving]) [data-remove]") ?? [])];
}

/**
 * Moves focus to a row's ×, scrolling the whole row into view: focus alone would
 * only bring in the button, and could leave the row behind the sticky nav.
 */
function focusRow(button: HTMLElement | undefined) {
  if (!button) return;
  button.focus({ preventScroll: true });
  button.closest("li")?.scrollIntoView({ block: "nearest" });
}

/**
 * A row that is swiped either way to remove it: it follows the finger, reveals
 * "Remove" behind it, and past the threshold slides away and closes the gap;
 * short of it, it springs back. A drag only counts once it is clearly sideways,
 * so the list still scrolls. On a computer, the × button takes the place of the
 * count while the pointer is over the row; from the keyboard it is reached with
 * Tab or the arrow keys and pressed with Enter or Delete. Pressed from the
 * keyboard, it hands focus to the next row's ×, so several can go in a row.
 */
function SwipeRow({
  label,
  onRemove,
  children,
}: {
  label: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const gesture = useRef<{ x: number; y: number; width: number; sideways?: boolean }>(undefined);

  /** Slides the row to `to` (0 for no slide, as from the × button), then removes it. */
  function leave(to: number) {
    if (leaving) return;
    const still = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setLeaving(true);
    setOffset(to);
    setTimeout(onRemove, still ? 0 : LEAVE_MS);
  }

  function end() {
    const drag = gesture.current;
    gesture.current = undefined;
    setDragging(false);
    if (!drag?.sideways) return;
    if (Math.abs(offset) > drag.width * SWIPE_THRESHOLD) leave(Math.sign(offset) * drag.width);
    else setOffset(0);
  }

  return (
    <li
      className={`${styles.swipe} ${leaving ? styles.leaving : ""}`}
      data-leaving={leaving || undefined}
    >
      <div className={styles.swipeInner}>
        {/* On the side the row uncovers: the right for a swipe left, the left for one right. */}
        <div
          className={`${styles.behind} ${offset > 0 ? styles.behindLeft : ""}`}
          aria-hidden="true"
        >
          <span style={{ opacity: Math.min(1, Math.abs(offset) / 80) }}>Remove</span>
        </div>
        <div
          className={`${styles.row} ${dragging ? styles.dragging : ""}`}
          style={{ transform: `translateX(${offset}px)` }}
          onPointerDown={(event) => {
            gesture.current = {
              x: event.clientX,
              y: event.clientY,
              width: event.currentTarget.offsetWidth,
            };
          }}
          onPointerMove={(event) => {
            const drag = gesture.current;
            if (!drag || leaving) return;
            const dx = event.clientX - drag.x;
            const dy = event.clientY - drag.y;
            if (drag.sideways === undefined) {
              if (Math.hypot(dx, dy) < 8) return;
              drag.sideways = Math.abs(dx) > Math.abs(dy);
              if (!drag.sideways) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(true);
            }
            if (drag.sideways) setOffset(dx);
          }}
          onPointerUp={end}
          onPointerCancel={end}
        >
          {children}
          <Button
            className={styles.remove}
            aria-label={label}
            data-remove
            onClick={(event) => {
              if (leaving) return;
              // detail 0: pressed with Enter, Space or Delete, not clicked.
              if (event.detail === 0) {
                const buttons = removeButtons(event.currentTarget.closest("ul"));
                const at = buttons.indexOf(event.currentTarget);
                focusRow(buttons[at + 1] ?? buttons[at - 1]);
              }
              leave(0);
            }}
          >
            <Keycap label="Del" className={styles.removeKey} />
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </Button>
        </div>
      </div>
    </li>
  );
}

/**
 * Every word missed at least once, most missed first. "Practice these" opens
 * Custom practice set to these words, ready to start.
 */
export default function ProblemWordsScreen() {
  const { entries, progress, recordResults } = useStore();
  const words = useMemo(() => problemWords(entries, progress), [entries, progress]);
  const list = useRef<HTMLUListElement>(null);

  // ↑ and ↓ move between the rows' × buttons (↓ from anywhere else starts at the
  // top); Delete or Backspace presses the one focused.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const buttons = removeButtons(list.current);
      const at = buttons.indexOf(document.activeElement as HTMLElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const step = event.key === "ArrowDown" ? 1 : -1;
        if (at === -1 && step === -1) return;
        const next = at === -1 ? buttons[0] : buttons[at + step];
        event.preventDefault();
        focusRow(next);
      } else if ((event.key === "Delete" || event.key === "Backspace") && at !== -1) {
        if (event.repeat) return;
        event.preventDefault();
        buttons[at]!.click();
      }
    }
    globalThis.addEventListener("keydown", onKey);
    return () => {
      globalThis.removeEventListener("keydown", onKey);
    };
  }, []);

  /** "I knew it": the misses were slips, so take them back in both directions. */
  function remove(entry: Entry) {
    const records = progress.entries[entry.id] ?? {};
    recordResults(
      (Object.entries(records) as [Direction, (typeof records)[Direction]][]).flatMap(
        ([direction, record]) =>
          record ? [{ entryId: entry.id, direction, next: forgiveMisses(record) }] : [],
      ),
    );
  }

  return (
    <section className={styles.screen}>
      <Button variant="back" to="/" shortcut="Escape">
        Home
      </Button>
      <h1 className={styles.title}>Problem words</h1>
      <p className={styles.intro}>
        The words you have missed most, across every session. A word stays here after you get it
        right; the count is its history. Swipe a word left to remove it if the misses were only
        slips.
      </p>

      {words.length === 0 ? (
        <p className={styles.empty}>Nothing missed yet.</p>
      ) : (
        <>
          {/* Above the list, not below it: the list can run well past a screen. */}
          <div className={styles.toolbar}>
            <span className={styles.total}>
              {words.length} {words.length === 1 ? "word" : "words"}
            </span>
            <Button
              variant="pill"
              shortcut="p"
              to="/custom"
              state={{ words: "problems" } satisfies CustomPracticeState}
            >
              Practice these
            </Button>
          </div>
          <ul className={styles.list} ref={list}>
            {words.map(({ entry, missed, wrongLast }) => (
              <SwipeRow
                key={entry.id}
                label={`Remove ${entry.es}: the misses were only slips`}
                onRemove={() => {
                  remove(entry);
                }}
              >
                <div>
                  <p className={styles.es}>
                    {canonicalAnswer(entry, "en→es", { requireArticle: true })}
                  </p>
                  <p className={styles.detail}>
                    {entry.en[0]}
                    {wrongLast ? (
                      <>
                        {" · "}
                        <span className={styles.wrong}>recent miss</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <p className={styles.count}>
                  <span className={styles.number}>{missed}</span>
                  <span className={styles.missed}>missed</span>
                </p>
              </SwipeRow>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
