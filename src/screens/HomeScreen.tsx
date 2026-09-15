import { Link } from "react-router";
import { useStore } from "../app/store-context.ts";
import styles from "./HomeScreen.module.css";

export default function HomeScreen() {
  const { users, userId, entries, dueCount, unseenCount, missedCount, ready } = useStore();
  const user = users.find((candidate) => candidate.id === userId);

  if (!ready) return <p>Loading…</p>;

  const due = dueCount();
  const unseen = unseenCount();
  const missed = missedCount();

  return (
    <section>
      <h1 className={styles.greeting}>Hola{user ? `, ${user.displayName}` : ""}</h1>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <p className={styles.statValue}>{due}</p>
          <p className={styles.statLabel}>due</p>
        </div>
        <div className={styles.stat}>
          <p className={styles.statValue}>{unseen}</p>
          <p className={styles.statLabel}>new</p>
        </div>
        <div className={styles.stat}>
          <p className={styles.statValue}>{entries.length}</p>
          <p className={styles.statLabel}>words</p>
        </div>
      </div>

      <div className={styles.actions}>
        <Link
          to="/quiz?scope=due"
          className={`${styles.action} ${styles.primary} ${due === 0 ? styles.disabled : ""}`}
        >
          Practise due words
          <span className={styles.sub}>{due === 0 ? "nothing waiting" : `${due} ready`}</span>
        </Link>
        <Link to="/quiz?scope=recent" className={styles.action}>
          Learn new words
          <span className={styles.sub}>{unseen} not seen yet</span>
        </Link>
        <Link
          to="/quiz?scope=misses"
          className={`${styles.action} ${missed === 0 ? styles.disabled : ""}`}
        >
          Review misses
          <span className={styles.sub}>{missed} to revisit</span>
        </Link>
      </div>
    </section>
  );
}
