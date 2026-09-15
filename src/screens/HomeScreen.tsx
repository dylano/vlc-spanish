import { Link } from "react-router";
import { useStore } from "../app/store-context.ts";
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
  const { users, userId, counts, ready } = useStore();
  const user = users.find((candidate) => candidate.id === userId);

  if (!ready) return <p>Loading…</p>;

  const { due, unseen, missed } = counts;
  // A practice session already tops itself up with new words, so it is worth
  // starting whenever anything at all is left to do.
  const canPractise = due + unseen > 0;

  return (
    <section className={styles.screen}>
      <p className={styles.date}>
        {new Intl.DateTimeFormat(undefined, DATE_FORMAT).format(new Date())}
      </p>
      <h1 className={styles.greeting}>Hola{user ? `, ${user.displayName}` : ""}</h1>

      <div className={styles.actions}>
        {canPractise ? (
          <div className={styles.list}>
            <Link to="/quiz?scope=due" className={`${styles.action} ${styles.primary}`}>
              Practice
              <Chevron />
            </Link>

            {/* Shown only when they hold something: an option that leads nowhere
                is worse than no option, and it saves explaining an empty count. */}
            {unseen > 0 ? (
              <Link to="/quiz?scope=recent" className={`${styles.action} ${styles.narrowing}`}>
                Only words I have not seen
                <Chevron />
              </Link>
            ) : null}

            {missed > 0 ? (
              <Link to="/quiz?scope=misses" className={`${styles.action} ${styles.narrowing}`}>
                Only ones I have got wrong
                <Chevron />
              </Link>
            ) : null}
          </div>
        ) : (
          <p className={styles.nothing}>Nothing to practise right now. Come back later.</p>
        )}
      </div>
    </section>
  );
}
