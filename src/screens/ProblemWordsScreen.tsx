import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useStore } from "../app/store-context.ts";
import { canonicalAnswer } from "../lib/grade.ts";
import { forgiveMisses } from "../lib/scheduler.ts";
import type { Direction, Entry } from "../lib/schema.ts";
import { problemWords } from "../lib/problems.ts";
import styles from "./ProblemWordsScreen.module.css";

/** How far left, as a share of the row, a swipe must go to remove it. */
const SWIPE_THRESHOLD = 0.35;
/** The slide out and the collapse after it, in ms; matches the CSS. */
const LEAVE_MS = 380;

/**
 * A row that is swiped left to remove it: it follows the finger, reveals
 * "Remove" behind it, and past the threshold slides away and closes the gap;
 * short of it, it springs back. A drag only counts once it is clearly sideways,
 * so the list still scrolls. A swipe cannot be made from a keyboard or a screen
 * reader, so a remove button stays, shown only when it has keyboard focus.
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

  function leave(width: number) {
    const still = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setLeaving(true);
    setOffset(-width);
    setTimeout(onRemove, still ? 0 : LEAVE_MS);
  }

  function end() {
    const drag = gesture.current;
    gesture.current = undefined;
    setDragging(false);
    if (!drag?.sideways) return;
    if (offset < -drag.width * SWIPE_THRESHOLD) leave(drag.width);
    else setOffset(0);
  }

  return (
    <li className={`${styles.swipe} ${leaving ? styles.leaving : ""}`}>
      <div className={styles.swipeInner}>
        <div className={styles.behind} aria-hidden="true">
          <span style={{ opacity: Math.min(1, -offset / 80) }}>Remove</span>
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
            if (drag.sideways) setOffset(Math.min(0, dx));
          }}
          onPointerUp={end}
          onPointerCancel={end}
        >
          {children}
          <button
            type="button"
            className={styles.remove}
            aria-label={label}
            onClick={() => {
              leave(0);
            }}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * Every word missed at least once, most missed first. A reference, not a way to
 * practice: Focus on problem words on the home screen does the drilling.
 */
export default function ProblemWordsScreen() {
  const { entries, progress, recordResults } = useStore();
  const words = useMemo(() => problemWords(entries, progress), [entries, progress]);

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
      <Link to="/" className={styles.back}>
        <svg className={styles.backChevron} viewBox="0 0 20 20" aria-hidden="true">
          <path d="M13 4l-6 6 6 6" />
        </svg>
        Home
      </Link>
      <h1 className={styles.title}>Problem words</h1>
      <p className={styles.intro}>
        The words you have missed most, across every session. A word stays here after you get it
        right; the count is its history. If the misses were only slips, remove it: it counts as
        known again and leaves Focus on problem words. Swipe a word left to remove it.
      </p>

      {words.length === 0 ? (
        <p className={styles.empty}>Nothing missed yet.</p>
      ) : (
        <ul className={styles.list}>
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
      )}
    </section>
  );
}
