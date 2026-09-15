import { useMemo } from "react";
import { useStore } from "../app/store-context.ts";
import styles from "./SettingsScreen.module.css";

export default function SettingsScreen() {
  const { users, userId, chooseUser, entries, counts, progress } = useStore();

  const sections = useMemo(() => new Set(entries.flatMap((entry) => entry.tags)).size, [entries]);
  const practised = Object.keys(progress.entries).length;

  return (
    <section className={styles.screen}>
      <h1 className={styles.title}>Settings</h1>

      <div className={styles.section}>
        <p className={styles.label}>Who is practising</p>
        <div className={styles.list}>
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              className={styles.person}
              onClick={() => {
                chooseUser(user.id);
              }}
            >
              <span className={styles.personName}>{user.displayName}</span>
              {user.id === userId ? <span className={styles.current}>Practising</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <p className={styles.label}>The dictionary</p>
        <div className={styles.list}>
          <div className={styles.fact}>
            <span className={styles.factLabel}>Words</span>
            <span className={styles.factValue}>{counts.total}</span>
          </div>
          <div className={styles.fact}>
            <span className={styles.factLabel}>Sections</span>
            <span className={styles.factValue}>{sections}</span>
          </div>
          <div className={styles.fact}>
            <span className={styles.factLabel}>You have practised</span>
            <span className={styles.factValue}>{practised}</span>
          </div>
        </div>
        <p className={styles.note}>
          Shared by everyone. New words are added from the dictionary file.
        </p>
      </div>

      <div className={styles.spacer} />
    </section>
  );
}
