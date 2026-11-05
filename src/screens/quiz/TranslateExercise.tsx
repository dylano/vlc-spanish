import { useEffect, useRef, useState, type FormEvent } from "react";
import Button from "../../app/Button.tsx";
import SessionShell from "../../app/SessionShell.tsx";
import { matchesTranslation } from "../../lib/sentences/translate.ts";
import styles from "../QuizScreen.module.css";
import type { ExerciseProps } from "./shared.ts";

/**
 * Translate a whole sentence into Spanish. Nothing is graded — a sentence has
 * too many valid translations to mark one wrong — so after submitting, the
 * learner's version and the sentence it was rendered from sit one above the
 * other to compare by eye. Nothing is scheduled either. The one exception to "no
 * verdict" is an exact match, which says Correct.
 *
 * Mounted fresh for each card (the parent keys it).
 */
export default function TranslateExercise({
  card,
  position,
  label,
  onDone,
  onMore,
}: ExerciseProps & {
  /** Present when there are more sentences like this one to add. */
  onMore?: () => void;
}) {
  const sentence = card.translation!.sentence;
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const exact = matchesTranslation(answer, card.translation!);
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
        // After Submit the text box is gone, so Enter reaches the page: it is
        // Next's shortcut. Before, the text box's own Enter submits.
        <Button
          variant="primary"
          shortcut="Enter"
          type="submit"
          form="translate-form"
          onMouseDown={(event) => {
            // Keep the keyboard up while the answer is still being written.
            if (!submitted) event.preventDefault();
          }}
        >
          {submitted ? "Next" : "Submit"}
        </Button>
      }
    >
      <form id="translate-form" className={styles.question} onSubmit={submit}>
        <p className={styles.instruction}>Say it in Spanish</p>
        <h1 className={styles.gapSentence}>{sentence.en}</h1>

        <div className={styles.divider} />

        {submitted ? (
          <div ref={compareRef} className={styles.compare} role="status">
            {/* Only an exact match earns a verdict; anything else is left to the
                learner's own comparison, since it may be just as right. */}
            {exact ? (
              <p className={`${styles.verdict} ${styles.verdictCorrect} ${styles.compareVerdict}`}>
                Correct
              </p>
            ) : null}
            <p className={styles.compareLabel}>You wrote</p>
            <p className={`${styles.compareYours} ${exact ? styles.compareExact : ""}`}>
              {answer.trim() || "—"}
            </p>
            {/* An exact match would only repeat the same sentence. */}
            {exact ? null : (
              <>
                <p className={styles.compareLabel}>One way to say it</p>
                <p className={styles.compareModel}>{sentence.es}</p>
              </>
            )}
            {/* The learner judges their own translation, so they ask for more: three
                sentences of the same pattern, straight after this one. Not after an
                exact match, which needs no more practice. */}
            {!exact && onMore ? (
              <Button
                className={styles.moreLikeThis}
                casing="mixed"
                shortcut="m"
                onClick={() => {
                  onMore();
                  submit();
                }}
              >
                <svg className={styles.moreLikeThisIcon} viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M10 4v12M4 10h12" />
                </svg>
                Practice more like this
              </Button>
            ) : null}
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
