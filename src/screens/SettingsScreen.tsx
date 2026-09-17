import { useMemo, useState, type FormEvent } from "react";
import { useStore } from "../app/store-context.ts";
import styles from "./SettingsScreen.module.css";

export default function SettingsScreen() {
  const { name, setName, entries, counts, progress } = useStore();
  const [draft, setDraft] = useState(name ?? "");

  const sections = useMemo(() => new Set(entries.flatMap((entry) => entry.tags)).size, [entries]);
  const practiced = Object.keys(progress.entries).length;
  const changed = draft.trim() !== "" && draft.trim() !== name;

  function save(event: FormEvent) {
    event.preventDefault();
    if (changed) setName(draft);
  }

  return (
    <section className={styles.screen}>
      <h1 className={styles.title}>Settings</h1>

      <div className={styles.section}>
        <p className={styles.label}>Your name</p>
        <form className={styles.nameRow} onSubmit={save}>
          <label htmlFor="settings-name" className="visually-hidden">
            Your name
          </label>
          <input
            id="settings-name"
            className={styles.nameInput}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            autoComplete="given-name"
          />
          {changed ? (
            <button type="submit" className={styles.save}>
              Save
            </button>
          ) : null}
        </form>
      </div>

      <div className={styles.section}>
        <p className={styles.label}>Your practice</p>
        <div className={styles.list}>
          <div className={styles.fact}>
            <span className={styles.factLabel}>Words in the dictionary</span>
            <span className={styles.factValue}>{counts.total}</span>
          </div>
          <div className={styles.fact}>
            <span className={styles.factLabel}>Sections</span>
            <span className={styles.factValue}>{sections}</span>
          </div>
          <div className={styles.fact}>
            <span className={styles.factLabel}>You have practiced</span>
            <span className={styles.factValue}>{practiced}</span>
          </div>
        </div>
        <p className={styles.note}>
          Progress is kept on this device, in this browser. Installing the app to your home screen
          helps the browser keep it.
        </p>
      </div>

      <div className={styles.spacer} />
    </section>
  );
}
