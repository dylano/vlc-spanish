import { useState } from "react";
import { Link } from "react-router";
import { useStore } from "../app/store-context.ts";
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
  const { users, userId, counts, ready } = useStore();
  const [choosing, setChoosing] = useState(false);
  const user = users.find((candidate) => candidate.id === userId);

  if (!ready) return <p>Loading…</p>;

  const { due, unseen, missed } = counts;
  // A practice session already tops itself up with new words, so it is worth
  // starting whenever anything at all is left to do.
  const canPractice = due + unseen > 0;

  return (
    <section className={styles.screen}>
      <p className={styles.date}>
        {new Intl.DateTimeFormat(undefined, DATE_FORMAT).format(new Date())}
      </p>
      <h1 className={styles.greeting}>Hola{user ? `, ${user.displayName}` : ""}</h1>

      <div className={styles.actions}>
        {canPractice ? (
          <div className={styles.list}>
            <Link to="/quiz?scope=due" className={`${styles.action} ${styles.primary}`}>
              Practice
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

            {missed > 0 ? (
              <Link to="/quiz?scope=misses" className={`${styles.action} ${styles.narrowing}`}>
                Remediation
                <Chevron />
              </Link>
            ) : null}

            {/* The rows above choose which words; this chooses how they are asked.
                Folded by default so the common taps stay the big ones. */}
            <button
              type="button"
              className={`${styles.action} ${styles.disclosure} ${choosing ? styles.disclosureOpen : ""}`}
              aria-expanded={choosing}
              aria-controls="exercises"
              onClick={() => {
                setChoosing((open) => !open);
              }}
            >
              Choose exercise
              <Chevron className={choosing ? styles.chevronUp : styles.chevronDown} />
            </button>
          </div>
        ) : (
          <p className={styles.nothing}>Nothing to practice right now. Come back later.</p>
        )}

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
