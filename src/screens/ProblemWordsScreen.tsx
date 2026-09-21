import { useMemo } from "react";
import { Link } from "react-router";
import { useStore } from "../app/store-context.ts";
import { canonicalAnswer } from "../lib/grade.ts";
import { problemWords } from "../lib/problems.ts";
import styles from "./ProblemWordsScreen.module.css";

/**
 * Every word missed at least once, most missed first. A reference, not a way to
 * practice: Focus on problem words on the home screen does the drilling.
 */
export default function ProblemWordsScreen() {
  const { entries, progress } = useStore();
  const words = useMemo(() => problemWords(entries, progress), [entries, progress]);

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
        right; the count is its history.
      </p>

      {words.length === 0 ? (
        <p className={styles.empty}>Nothing missed yet.</p>
      ) : (
        <ul className={styles.list}>
          {words.map(({ entry, missed, wrongLast }) => (
            <li key={entry.id} className={styles.row}>
              <div>
                <p className={styles.es}>
                  {canonicalAnswer(entry, "en→es", { requireArticle: true })}
                </p>
                <p className={styles.detail}>
                  {entry.en[0]} ·{" "}
                  {wrongLast ? (
                    <span className={styles.wrong}>wrong last time</span>
                  ) : (
                    "right last time"
                  )}
                </p>
              </div>
              <p className={styles.count}>
                <span className={styles.number}>{missed}</span>
                <span className={styles.missed}>missed</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
