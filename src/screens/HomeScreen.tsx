import { useMemo, useState } from "react";
import { Link } from "react-router";
import { readNoteDismissed, writeNoteDismissed } from "../app/local.ts";
import { releaseNote } from "../app/releaseNote.ts";
import { useStore } from "../app/store-context.ts";
import { today } from "../lib/dates.ts";
import { problemWords } from "../lib/problems.ts";
import { emphasis, visibleNote, type ReleaseNote } from "../lib/releaseNote.ts";
import styles from "./HomeScreen.module.css";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
};

const NOTE_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };

/** The "what's new" card under the greeting, with × to dismiss it on this device. */
function Note({ note, onDismiss }: { note: ReleaseNote; onDismiss: () => void }) {
  const [y, m, d] = note.date.split("-").map(Number);
  // In the device's language, like the date at the top of Home.
  const when = new Intl.DateTimeFormat(undefined, NOTE_DATE).format(new Date(y!, m! - 1, d));
  return (
    <aside className={styles.note} aria-label="What's new">
      <div className={styles.noteText}>
        <p className={styles.noteLabel}>New · {when}</p>
        <p className={styles.noteTitle}>{note.title}</p>
        <p className={styles.noteBody}>
          {emphasis(note.body).map((run, index) =>
            run.italic ? <i key={index}>{run.text}</i> : <span key={index}>{run.text}</span>,
          )}
        </p>
      </div>
      <button type="button" className={styles.noteDismiss} aria-label="Dismiss" onClick={onDismiss}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>
    </aside>
  );
}

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
  const { name, counts, entries, progress } = useStore();
  const troubled = useMemo(() => problemWords(entries, progress).length, [entries, progress]);
  const [dismissed, setDismissed] = useState(readNoteDismissed);
  const note = visibleNote(releaseNote, today(), dismissed);

  const { due, unseen } = counts;
  // A practice session already tops itself up with new words, so it is worth
  // starting whenever anything at all is left to do.
  const canPractice = due + unseen > 0;

  return (
    <section className={styles.screen}>
      <p className={styles.date}>
        {new Intl.DateTimeFormat(undefined, DATE_FORMAT).format(new Date())}
      </p>
      <h1 className={styles.greeting}>Hola{name ? `, ${name}` : ""}</h1>

      {note ? (
        <Note
          note={note}
          onDismiss={() => {
            writeNoteDismissed(note.date);
            setDismissed(note.date);
          }}
        />
      ) : null}

      <div className={styles.actions}>
        {/* Two ways to start a session, the same size: everything mixed, or a
            choice of words, modes and categories. Custom always has something to
            offer, so it stays when General has nothing left. */}
        <div className={styles.list}>
          {canPractice ? (
            <Link to="/quiz?scope=due" className={styles.action}>
              <span>
                General practice
                <span className={styles.subtitle}>Mixed exercises on the full dictionary</span>
              </span>
              <Chevron />
            </Link>
          ) : (
            <p className={styles.nothing}>Nothing due right now. Come back later.</p>
          )}
          <Link to="/custom" className={styles.action}>
            <span>
              Custom practice
              <span className={styles.subtitle}>Select exercise modes and categories</span>
            </span>
            <Chevron />
          </Link>
        </div>

        {/* A reference, quieter than the two above: the list of words missed most.
            Drilling them is a Custom practice choice, reached from the list. */}
        {troubled > 0 ? (
          <Link to="/problems" className={styles.problems}>
            <span>
              Problem words <span className={styles.count}>· {troubled}</span>
            </span>
            <Chevron />
          </Link>
        ) : null}
      </div>

      {/* An invisible twin of the note, below the rows: with the same space above
          and below them, the rows stay centred where they are without a note, and
          the note sits in the gap over them. Short screens leave it out (see the CSS). */}
      {note ? (
        <div className={styles.noteBalance} aria-hidden="true">
          <Note note={note} onDismiss={() => undefined} />
        </div>
      ) : null}
    </section>
  );
}
