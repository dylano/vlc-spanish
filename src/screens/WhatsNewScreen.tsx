import Button from "../app/Button.tsx";
import NoteBody from "../app/NoteBody.tsx";
import { releaseNotes } from "../app/releaseNote.ts";
import { today } from "../lib/dates.ts";
import { noteDate, noteHistory } from "../lib/releaseNote.ts";
import styles from "./WhatsNewScreen.module.css";

/**
 * Every release note the app has shown on Home, newest first (board A2 on the
 * canvas's "Release note history" page). The notes are written for learners;
 * the commits behind them are one tap further, on the Version screen.
 */
export default function WhatsNewScreen() {
  const notes = noteHistory(releaseNotes, today());

  return (
    <section className={styles.screen}>
      <Button variant="back" to="/settings">
        Settings
      </Button>
      <h1 className={styles.title}>What’s new</h1>
      <p className={styles.intro}>Every note the app has shown on Home, newest first.</p>

      {notes.length === 0 ? (
        <p className={styles.intro}>No notes yet.</p>
      ) : (
        <ul className={styles.list}>
          {notes.map((note, index) => (
            <li key={note.date} className={`${styles.row} ${index === 0 ? styles.latest : ""}`}>
              <p className={styles.date}>
                {noteDate(note.date)}
                {index === 0 ? <span className={styles.badge}>Latest</span> : null}
              </p>
              <h2 className={styles.noteTitle}>{note.title}</h2>
              <p className={styles.body}>
                <NoteBody body={note.body} />
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.spacer} />
      <Button to="/version" className={styles.version}>
        Version {__COMMIT__} · all changes →
      </Button>
    </section>
  );
}
