import { useEffect, useRef, useState, type FormEvent } from "react";
import SessionShell from "../../app/SessionShell.tsx";
import styles from "../QuizScreen.module.css";
import type { ExerciseProps } from "./shared.ts";

/**
 * Translate a whole sentence into Spanish. Nothing is graded — a sentence has
 * too many valid translations to mark one wrong — so after submitting, the
 * learner's version and the sentence it was rendered from sit one above the
 * other to compare by eye. Nothing is scheduled either.
 *
 * Mounted fresh for each card (the parent keys it).
 */
export default function TranslateExercise({ card, position, label, onDone }: ExerciseProps) {
  const sentence = card.translation!.sentence;
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const compareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (submitted) compareRef.current?.scrollIntoView({ block: "nearest" });
  }, [submitted]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!submitted) {
      setSubmitted(true);
      return;
    }
    onDone([
      {
        card,
        outcome: {
          grade: { result: "correct", expected: sentence.es },
          given: answer,
          strength: "recall",
          ungraded: true,
        },
      },
    ]);
  }

  return (
    <SessionShell
      position={position}
      label={label}
      footer={
        <button
          type="submit"
          form="translate-form"
          className={styles.button}
          onMouseDown={(event) => {
            // Keep the keyboard up while the answer is still being written.
            if (!submitted) event.preventDefault();
          }}
        >
          {submitted ? "Next" : "Submit"}
        </button>
      }
    >
      <form id="translate-form" className={styles.question} onSubmit={submit}>
        <p className={styles.instruction}>Say it in Spanish</p>
        <h1 className={styles.gapSentence}>{sentence.en}</h1>

        <div className={styles.divider} />

        {submitted ? (
          <div ref={compareRef} className={styles.compare} role="status">
            <p className={styles.compareLabel}>You wrote</p>
            <p className={styles.compareYours}>{answer.trim() || "—"}</p>
            <p className={styles.compareLabel}>One way to say it</p>
            <p className={styles.compareModel}>{sentence.es}</p>
          </div>
        ) : (
          <>
            <label htmlFor="translation" className="visually-hidden">
              Your translation
            </label>
            <textarea
              id="translation"
              ref={inputRef}
              className={styles.translation}
              value={answer}
              rows={3}
              onChange={(event) => {
                setAnswer(event.target.value);
              }}
              onKeyDown={(event) => {
                // One sentence, so Enter submits rather than starting a new line.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              enterKeyHint="done"
              autoComplete="off"
              autoCapitalize="sentences"
              autoCorrect="off"
              spellCheck={false}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- a quiz is a single-purpose screen
              autoFocus
            />
          </>
        )}
      </form>
    </SessionShell>
  );
}
