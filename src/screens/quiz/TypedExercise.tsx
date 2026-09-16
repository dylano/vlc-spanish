import { useEffect, useRef, useState, type FormEvent } from "react";
import SessionShell from "../../app/SessionShell.tsx";
import { useStore } from "../../app/store-context.ts";
import { articleRequired, grade, type Grade, type Result } from "../../lib/grade.ts";
import { normalize } from "../../lib/normalize.ts";
import styles from "../QuizScreen.module.css";
import {
  CORRECT_PAUSE_MS,
  GRADE_OPTIONS,
  promptDetail,
  promptText,
  VERDICT,
  type ExerciseProps,
} from "./shared.ts";

const ANSWER_STYLE: Record<Result, string> = {
  correct: styles.answerCorrect!,
  hard: styles.answerHard!,
  wrong: styles.answerWrong!,
};

const VERDICT_STYLE: Record<Result, string> = {
  correct: styles.verdictCorrect!,
  hard: styles.verdictHard!,
  wrong: styles.verdictWrong!,
};

/** See it in one language, type it in the other. */
export default function TypedExercise({ card, position, label, onDone }: ExerciseProps) {
  const { entries } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [shownCard, setShownCard] = useState(card);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Grade>();

  // This component stays mounted from one typed card to the next: remounting
  // would replace the input and drop the keyboard between every card. So it
  // resets itself when the card changes instead of relying on a key.
  if (shownCard !== card) {
    setShownCard(card);
    setAnswer("");
    setResult(undefined);
  }

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  // With the keyboard up the question area can be shorter than the question plus
  // its feedback. Bring the verdict into view rather than leaving it below the fold.
  useEffect(() => {
    if (result) feedbackRef.current?.scrollIntoView({ block: "nearest" });
  }, [result]);

  function finish(graded: Grade, given: string) {
    clearTimeout(timer.current);
    // Cheap insurance: focus is normally never lost, but if something else took
    // it, this call still sits inside the tap that triggered it.
    inputRef.current?.focus();
    onDone({ grade: graded, given, strength: "recall" });
  }

  function check(event: FormEvent) {
    event.preventDefault();
    if (result) return;
    const given = answer;
    const graded = grade(card.entry, card.direction, given, {
      ...GRADE_OPTIONS,
      confusableWith: card.confusableWith,
      dictionary: entries,
    });
    setResult(graded);

    // A right answer needs no acknowledgement from the user - show it landed,
    // then move on. Anything else is worth stopping to read.
    if (graded.result === "correct") {
      timer.current = setTimeout(() => {
        finish(graded, given);
      }, CORRECT_PAUSE_MS);
    }
  }

  const detail = promptDetail(card);
  // Echoing back a correct answer the user just typed is noise; the expected
  // form only earns its place when it differs from what they wrote.
  const showExpected = result !== undefined && normalize(result.expected) !== normalize(answer);

  return (
    <SessionShell
      position={position}
      label={label}
      footer={
        <button
          type="submit"
          form="answer-form"
          className={styles.button}
          // Stops the tap moving focus out of the input, which is what closes
          // the keyboard. The click still fires; only the focus change is
          // suppressed, so the keyboard stays up from the first card to the last.
          onMouseDown={(event) => {
            event.preventDefault();
          }}
        >
          {result ? "Next" : "Check"}
        </button>
      }
    >
      <form
        id="answer-form"
        className={styles.question}
        onSubmit={
          result
            ? (event) => {
                event.preventDefault();
                finish(result, answer);
              }
            : check
        }
      >
        <p className={styles.label}>
          {card.direction === "en→es" ? "Say it in Spanish" : "Say it in English"}
        </p>
        <h1 className={styles.prompt}>{promptText(card)}</h1>
        {detail ? <p className={styles.grammar}>{detail}</p> : null}

        <div className={styles.divider} />

        <label htmlFor="answer" className="visually-hidden">
          Your answer
        </label>
        <input
          id="answer"
          ref={inputRef}
          className={`${styles.answer} ${result ? ANSWER_STYLE[result.result] : ""}`}
          value={answer}
          onChange={(event) => {
            // Frozen while the result is showing, but deliberately NOT
            // readOnly: flipping that on a focused input dismisses the
            // keyboard on iOS, which is what made it slide up and down
            // between every card.
            if (!result) setAnswer(event.target.value);
          }}
          enterKeyHint={result ? "next" : "go"}
          inputMode="text"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- a quiz is a single-purpose screen
          autoFocus
        />

        {result ? (
          <div ref={feedbackRef} className={styles.feedback} role="status">
            <p className={`${styles.verdict} ${VERDICT_STYLE[result.result]}`}>
              {VERDICT[result.result]}
            </p>
            {showExpected ? <p className={styles.expected}>{result.expected}</p> : null}
            {result.note && result.result !== "correct" ? (
              <p className={styles.note}>{result.note}</p>
            ) : null}
          </div>
        ) : card.direction === "en→es" && articleRequired(card.entry, GRADE_OPTIONS) ? (
          <p className={styles.hint}>Include the article</p>
        ) : null}
      </form>
    </SessionShell>
  );
}
