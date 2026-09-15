import { useStore } from "../app/store-context.ts";
import styles from "./WhoScreen.module.css";

export default function SettingsScreen() {
  const { users, userId, chooseUser, entries } = useStore();

  return (
    <section className={styles.screen}>
      <h1 className={styles.title}>Settings</h1>
      <p className={styles.subtitle}>
        {entries.length} words in the shared dictionary. Progress is per person.
      </p>

      <h2>Who's practising</h2>
      <div className={styles.names}>
        {users.map((user) => (
          <button
            key={user.id}
            type="button"
            className={styles.name}
            onClick={() => {
              chooseUser(user.id);
            }}
            aria-current={user.id === userId ? "true" : undefined}
          >
            {user.displayName}
            {user.id === userId ? " ·  practising" : ""}
          </button>
        ))}
      </div>
    </section>
  );
}
