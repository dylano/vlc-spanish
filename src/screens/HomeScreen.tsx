import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useStore } from "../app/store-context.ts";
import { problemWords } from "../lib/problems.ts";
import { EXERCISES } from "./quiz/exercises.ts";
import styles from "./HomeScreen.module.css";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
};

function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`${styles.chevron} ${className}`}
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
  const [choosing, setChoosing] = useState(false);

  const { due, unseen, missed } = counts;
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
        {canPractice ? (
          <div className={styles.list}>
            <Link to="/quiz?scope=due" className={`${styles.action} ${styles.primary}`}>
              General practice
              <Chevron />
            </Link>

            {/* Shown only when they hold something: an option that leads nowhere
                is worse than no option, and it saves explaining an empty count. */}
            {unseen > 0 ? (
              <Link to="/quiz?scope=recent" className={`${styles.action} ${styles.narrowing}`}>
                Focus on new words
                <Chevron />
              </Link>
            ) : null}

            {/* The row drills words wrong last time; the line under it opens the
                longer history. With nothing wrong right now the line stays, so the
                list is still reachable. */}
            {missed > 0 || troubled > 0 ? (
              <div className={styles.problemRow}>
                {missed > 0 ? (
                  <Link to="/quiz?scope=misses" className={`${styles.focus} ${styles.narrowing}`}>
                    Focus on problem words
                    <Chevron />
                  </Link>
                ) : null}
                {troubled > 0 ? (
                  <Link to="/problems" className={styles.seeList}>
                    {troubled} {troubled === 1 ? "word" : "words"} · see the list
                    <Chevron className={styles.seeListChevron} />
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className={styles.nothing}>Nothing to practice right now. Come back later.</p>
        )}

        {/* Set apart from the rows above on purpose: those are ways to practice,
            this is a control that changes how the words are asked. Folded by
            default so the common taps stay the big ones. */}
        {canPractice ? (
          <button
            type="button"
            className={`${styles.disclosure} ${choosing ? styles.disclosureOpen : ""}`}
            aria-expanded={choosing}
            aria-controls="exercises"
            onClick={() => {
              setChoosing((open) => !open);
            }}
          >
            Select specific exercise mode
            <Chevron className={choosing ? styles.chevronUp : styles.chevronDown} />
          </button>
        ) : null}

        {canPractice && choosing ? (
          <div id="exercises">
            {(["Words", "Sentences"] as const).map((group) => {
              const members = EXERCISES.filter((exercise) => exercise.group === group);
              if (members.length === 0) return null;
              return (
                <section key={group}>
                  <p className={styles.groupLabel}>{group}</p>
                  <div className={styles.exerciseGrid}>
                    {members.map((exercise) => (
                      <Link
                        key={exercise.id}
                        to={`/quiz?scope=due&exercise=${exercise.id}`}
                        className={styles.exercise}
                      >
                        {exercise.label}
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
