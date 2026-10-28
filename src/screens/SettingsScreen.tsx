import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { SESSION_SIZES, type Theme } from "../app/local.ts";
import { releaseNotes } from "../app/releaseNote.ts";
import { useStore } from "../app/store-context.ts";
import { REPO } from "../lib/commits.ts";
import { today } from "../lib/dates.ts";
import { noteDate, noteHistory } from "../lib/releaseNote.ts";
import styles from "./SettingsScreen.module.css";

export default function SettingsScreen() {
  const { name, setName, entries, counts, progress, theme, setTheme, sessionSize, setSessionSize } =
    useStore();
  const [draft, setDraft] = useState(name ?? "");

  const sections = useMemo(() => new Set(entries.flatMap((entry) => entry.tags)).size, [entries]);
  const practiced = Object.keys(progress.entries).length;
  const changed = draft.trim() !== "" && draft.trim() !== name;
  const latest = noteHistory(releaseNotes, today())[0];

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
          Words in each session, for General practice and Custom practice.
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
      {/* Every release note, for learners (board A1); the version line below is
          the same history as commits. */}
      {latest ? (
        <Link to="/whats-new" className={styles.whatsNew}>
          <span>
            What’s new
            <span className={styles.whatsNewLatest}>
              Latest: {latest.title} · {noteDate(latest.date)}
            </span>
          </span>
          <svg className={styles.chevron} viewBox="0 0 20 20" aria-hidden="true">
            <path d="M7 4l6 6-6 6" />
          </svg>
        </Link>
      ) : null}
      {/* Which deployment this is, for telling builds apart; the screen behind it
          names the commits, read from GitHub. */}
      <div className={styles.footer}>
        <Link to="/version" className={styles.version}>
          Version {__COMMIT__}
        </Link>
        {/* The whole repository, for anyone chasing the details behind a version. */}
        <a
          href={`https://github.com/${REPO}`}
          className={styles.repo}
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg className={styles.repoMark} viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          vlc-spanish@github
          <svg className={styles.repoArrow} viewBox="0 0 12 12" aria-hidden="true">
            <path d="M4 2.5h5.5V8M9.5 2.5L3 9" />
          </svg>
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      </div>
    </section>
  );
}
