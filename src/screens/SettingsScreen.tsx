import { useMemo, useState, type FormEvent } from "react";
import { SESSION_SIZES, type Theme } from "../app/local.ts";
import { useStore } from "../app/store-context.ts";
import styles from "./SettingsScreen.module.css";

export default function SettingsScreen() {
  const { name, setName, entries, counts, progress, theme, setTheme, sessionSize, setSessionSize } =
    useStore();
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
        <p className={styles.label} id="session-length">
          Session length
        </p>
        <div role="radiogroup" aria-labelledby="session-length" className={styles.choices}>
          {SESSION_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={size === sessionSize}
              className={`${styles.choice} ${size === sessionSize ? styles.chosen : ""}`}
              onClick={() => {
                setSessionSize(size);
              }}
            >
              {size}
            </button>
          ))}
        </div>
        <p className={styles.note}>
          Words in each session: General practice, the Focus rows and a single exercise.
        </p>
      </div>

      <div className={styles.section}>
        <p className={styles.label} id="appearance">
          Appearance
        </p>
        {/* No "System" option: until one is chosen the app follows the device, and
            this shows whichever that currently is. */}
        <div role="radiogroup" aria-labelledby="appearance" className={styles.choices}>
          {(["light", "dark"] as Theme[]).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === theme}
              className={`${styles.choice} ${option === theme ? styles.chosen : ""}`}
              onClick={() => {
                setTheme(option);
              }}
            >
              {option === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>
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
      {/* Which deployment this is, for telling builds apart. */}
      <p className={styles.version}>Version {__COMMIT__}</p>
    </section>
  );
}
