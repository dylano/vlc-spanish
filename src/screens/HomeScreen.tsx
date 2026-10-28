import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { readNoteDismissed, takeJustUpdated, writeNoteDismissed } from "../app/local.ts";
import { releaseNotes } from "../app/releaseNote.ts";
import { useStore } from "../app/store-context.ts";
import { useUpdateCheck } from "../app/update.ts";
import { today } from "../lib/dates.ts";
import { problemWords } from "../lib/problems.ts";
import NoteBody from "../app/NoteBody.tsx";
import { noteDate, visibleNote, type ReleaseNote } from "../lib/releaseNote.ts";
import styles from "./HomeScreen.module.css";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
};

/** How long the note takes to fade once dismissed; matches the CSS. */
const NOTE_FADE_MS = 180;

/** The "what's new" card under the greeting, with × to dismiss it on this device. */
function Note({
  note,
  onDismiss,
  leaving = false,
}: {
  note: ReleaseNote;
  onDismiss: () => void;
  leaving?: boolean;
}) {
  // In the device's language, like the date at the top of Home.
  const when = noteDate(note.date);
  return (
    <aside
      className={`${styles.note} ${leaving ? styles.noteLeaving : ""}`}
      aria-label="What's new"
    >
      <div className={styles.noteText}>
        {/* The way to every note, since this one goes after a week: the label's link
            stretches over the whole card (see the CSS), so a tap anywhere opens What's new. */}
        <p className={styles.noteLabel}>
          <Link to="/whats-new" className={styles.noteLink}>
            New · {when}
            <span className="visually-hidden">, see all notes</span>
            <svg className={styles.noteLinkChevron} viewBox="0 0 20 20" aria-hidden="true">
              <path d="M7 4l6 6-6 6" />
            </svg>
          </Link>
        </p>
        <p className={styles.noteTitle}>{note.title}</p>
        <p className={styles.noteBody}>
          <NoteBody body={note.body} />
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

/** How long "Updated" stays before it fades, and the fade; the fade matches the CSS. */
const UPDATED_SHOWN_MS = 3000;
const UPDATED_FADE_MS = 300;

/**
 * Said once, after Home has reloaded onto a newer build: a small pill at the foot
 * of the screen that fades after a few seconds. Tapping it dismisses it sooner.
 */
function UpdatedToast() {
  const [phase, setPhase] = useState<"shown" | "leaving" | "gone">("shown");

  useEffect(() => {
    if (phase === "gone") return undefined;
    const still = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(
      () => {
        setPhase(phase === "shown" ? "leaving" : "gone");
      },
      phase === "shown" ? UPDATED_SHOWN_MS : still ? 0 : UPDATED_FADE_MS,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [phase]);

  if (phase === "gone") return null;
  return (
    <button
      type="button"
      role="status"
      className={`${styles.updated} ${phase === "leaving" ? styles.updatedLeaving : ""}`}
      onClick={() => {
        setPhase("leaving");
      }}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M4 10.5l4 4 8-9" />
      </svg>
      Updated to the latest version
    </button>
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
  // Read once: the flag is cleared as it is read, so this shows once per update.
  const [updated] = useState(takeJustUpdated);
  useUpdateCheck();
  const [leaving, setLeaving] = useState(false);
  const note = visibleNote(releaseNotes, today(), dismissed);

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
          leaving={leaving}
          onDismiss={() => {
            // Saved at once, so closing the app mid-fade still remembers it.
            writeNoteDismissed(note.date);
            const still = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
            setLeaving(true);
            setTimeout(
              () => {
                setDismissed(note.date);
              },
              still ? 0 : NOTE_FADE_MS,
            );
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
      {updated ? <UpdatedToast /> : null}
    </section>
  );
}
