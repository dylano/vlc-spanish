import { useMemo } from "react";
import { Link } from "react-router";
import { useStore } from "../app/store-context.ts";
import { problemWords } from "../lib/problems.ts";
import styles from "./HomeScreen.module.css";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
};

function Chevron() {
  return (
    <svg
      className={styles.chevron}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 4l6 6-6 6" />
    </svg>
  );
}

export default function HomeScreen() {
  const { name, counts, entries, progress } = useStore();
  const troubled = useMemo(() => problemWords(entries, progress).length, [entries, progress]);

  const { due, unseen } = counts;
  // A practice session already tops itself up with new words, so it is worth
  // starting whenever anything at all is left to do.
  const canPractice = due + unseen > 0;

  return (
    <section className={styles.screen}>
      <p className={styles.date}>
        {new Intl.DateTimeFormat(undefined, DATE_FORMAT).format(new Date())}
      </p>
      <h1 className={styles.greeting}>Hola{name ? `, ${name}` : ""}</h1>

      <div className={styles.actions}>
        {/* Two ways to start a session, the same size: everything mixed, or a
            choice of words, modes and categories. Custom always has something to
            offer, so it stays when General has nothing left. */}
        <div className={styles.list}>
          {canPractice ? (
            <Link to="/quiz?scope=due" className={styles.action}>
              <span>
                General practice
                <span className={styles.subtitle}>Mixed exercises on the full dictionary</span>
              </span>
              <Chevron />
            </Link>
          ) : (
            <p className={styles.nothing}>Nothing due right now. Come back later.</p>
          )}
          <Link to="/custom" className={styles.action}>
            <span>
              Custom practice
              <span className={styles.subtitle}>Select exercise modes and categories</span>
            </span>
            <Chevron />
          </Link>
        </div>

        {/* A reference, quieter than the two above: the list of words missed most.
            Drilling them is a Custom practice choice, reached from the list. */}
        {troubled > 0 ? (
          <Link to="/problems" className={styles.problems}>
            <span>
              Problem words <span className={styles.count}>· {troubled}</span>
            </span>
            <Chevron />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
