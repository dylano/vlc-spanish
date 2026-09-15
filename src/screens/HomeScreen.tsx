import { Link } from "react-router";
import { useStore } from "../app/store-context.ts";
import styles from "./HomeScreen.module.css";

export default function HomeScreen() {
  const { users, userId, counts, ready } = useStore();
  const user = users.find((candidate) => candidate.id === userId);

  if (!ready) return <p>Loading…</p>;

  const { due, unseen, missed, total } = counts;
  // A due session tops itself up with new words, so it is worth starting
  // whenever there is anything at all to practise.
  const canPractise = due + unseen > 0;

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
          <p className={styles.statValue}>{total}</p>
          <p className={styles.statLabel}>words</p>
        </div>
      </div>

      <div className={styles.actions}>
        <Link
          to="/quiz?scope=due"
          className={`${styles.action} ${styles.primary} ${canPractise ? "" : styles.disabled}`}
        >
          Practise
          <span className={styles.sub}>
            {due > 0 ? `${due} due` : "nothing due"}
            {unseen > 0 ? `, topped up with new words` : ""}
          </span>
        </Link>
        <Link to="/quiz?scope=recent" className={styles.action}>
          Learn new words
          <span className={styles.sub}>{unseen} never practised</span>
        </Link>
        <Link
          to="/quiz?scope=misses"
          className={`${styles.action} ${missed === 0 ? styles.disabled : ""}`}
        >
          Review misses
          <span className={styles.sub}>{missed} got wrong before</span>
        </Link>
      </div>
    </section>
  );
}
