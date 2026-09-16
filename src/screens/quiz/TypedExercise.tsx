import { useEffect, useRef, useState, type FormEvent } from "react";
import SessionShell from "../../app/SessionShell.tsx";
import { useStore } from "../../app/store-context.ts";
import { articleRequired, grade, type Grade, type Result } from "../../lib/grade.ts";
import { normalize } from "../../lib/normalize.ts";
import { gradeGap } from "../../lib/sentences/gap.ts";
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

const BLANK_STYLE: Record<Result, string> = {
  correct: styles.blankCorrect!,
  hard: styles.blankHard!,
  wrong: styles.blankWrong!,
};

const VERDICT_STYLE: Record<Result, string> = {
  correct: styles.verdictCorrect!,
  hard: styles.verdictHard!,
  wrong: styles.verdictWrong!,
};

const SEVERITY: Record<Result, number> = { correct: 0, hard: 1, wrong: 2 };

function worstOf(grades: Grade[]): Result {
  return grades.reduce<Result>(
    (worst, graded) => (SEVERITY[graded.result] > SEVERITY[worst] ? graded.result : worst),
    "correct",
  );
}

/**
 * Everything answered by typing: a word to translate, or the blanks of a
 * sentence. Both share this component so the keyboard stays up between them.
 *
 * A gap with several blanks uses the same single input: each Enter writes the
 * answer into the current blank and moves on, a tap on a blank goes back to it,
 * and nothing is graded until the last one.
 */
export default function TypedExercise({ card, position, label, onDone }: ExerciseProps) {
  const { entries } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const blanks = card.gap?.blanks ?? [];
  const slots = Math.max(1, blanks.length);

  const [shownCard, setShownCard] = useState(card);
  const [answers, setAnswers] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [grades, setGrades] = useState<Grade[]>();

  // This component stays mounted from one typed card to the next: remounting
  // would replace the input and drop the keyboard between every card. So it
  // resets itself when the card changes instead of relying on a key.
  if (shownCard !== card) {
    setShownCard(card);
    setAnswers([]);
    setActive(0);
    setGrades(undefined);
  }

  const answer = answers[active] ?? "";
  const overall = grades ? worstOf(grades) : undefined;

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  // With the keyboard up the question area can be shorter than the question plus
  // its feedback. Bring the verdict into view rather than leaving it below the fold.
  useEffect(() => {
    if (grades) feedbackRef.current?.scrollIntoView({ block: "nearest" });
  }, [grades]);

  function setAnswer(value: string) {
    setAnswers((current) => {
      const next = [...current];
      next[active] = value;
      return next;
    });
  }

  function finish(finalGrades: Grade[], given: string[]) {
    clearTimeout(timer.current);
    // Cheap insurance: focus is normally never lost, but if something else took
    // it, this call still sits inside the tap that triggered it.
    inputRef.current?.focus();
    const cards = card.blankCards ?? [card];
    onDone(
      finalGrades.map((graded, index) => ({
        card: cards[index] ?? card,
        outcome: { grade: graded, given: given[index] ?? "", strength: "recall" },
      })),
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (grades) {
      finish(grades, answers);
      return;
    }
    // Not the last blank yet: move on without grading.
    if (active < slots - 1) {
      setActive(active + 1);
      return;
    }

    const given = Array.from({ length: slots }, (_, index) => answers[index] ?? "");
    const graded = card.gap
      ? blanks.map((blank, index) =>
          gradeGap(
            card.gap!,
            blank,
            given[index]!,
            entries.find((entry) => entry.id === blank.entryId)!,
            entries,
          ),
        )
      : [
          grade(card.entry, card.direction, given[0]!, {
            ...GRADE_OPTIONS,
            confusableWith: card.confusableWith,
            dictionary: entries,
          }),
        ];
    setGrades(graded);

    // A right answer needs no acknowledgement from the user - show it landed,
    // then move on. Anything else is worth stopping to read.
    if (worstOf(graded) === "correct") {
      timer.current = setTimeout(() => {
        finish(graded, given);
      }, CORRECT_PAUSE_MS);
    }
  }

  const detail = promptDetail(card);
  const single = grades?.[0];
  // Echoing back a correct answer the user just typed is noise; the expected
  // form only earns its place when it differs from what they wrote. A gap
  // already shows it, written into the sentence.
  const showExpected =
    single !== undefined && !card.gap && normalize(single.expected) !== normalize(answer);

  const buttonLabel = grades ? "Next" : active < slots - 1 ? "Next blank" : "Check";

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
          {buttonLabel}
        </button>
      }
    >
      <form id="answer-form" className={styles.question} onSubmit={submit}>
        {card.gap ? (
          <>
            <p className={styles.label}>Fill the {slots > 1 ? "gaps" : "gap"}</p>
            <p className={styles.gapEnglish}>{card.gap.sentence.en}</p>
            <h1 className={styles.gapSentence}>
              {card.gap.sentence.segments.map((segment, segmentIndex) => {
                const blankIndex = segment.article
                  ? -1
                  : blanks.findIndex((blank) => blank.slot === segment.slot);
                if (blankIndex < 0) return <span key={segmentIndex}>{segment.text}</span>;
                const blankGrade = grades?.[blankIndex];
                const classes = [styles.blank];
                if (!blankGrade && !answers[blankIndex]) classes.push(styles.blankEmpty);
                if (blankGrade) classes.push(BLANK_STYLE[blankGrade.result]);
                else if (blankIndex === active) classes.push(styles.blankActive);
                return (
                  <button
                    key={segmentIndex}
                    type="button"
                    className={classes.join(" ")}
                    disabled={grades !== undefined}
                    aria-label={`Blank ${blankIndex + 1} of ${slots}`}
                    // Keep the keyboard up while moving between blanks.
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      setActive(blankIndex);
                    }}
                  >
                    {/* Once graded the blank shows the right form, so the sentence
                        reads whole; before that, whatever has been typed into it. */}
                    {blankGrade ? blankGrade.expected : answers[blankIndex] || " "}
                  </button>
                );
              })}
            </h1>
          </>
        ) : (
          <>
            <p className={styles.label}>
              {card.direction === "en→es" ? "Say it in Spanish" : "Say it in English"}
            </p>
            <h1 className={styles.prompt}>{promptText(card)}</h1>
            {detail ? <p className={styles.grammar}>{detail}</p> : null}
          </>
        )}

        <div className={styles.divider} />

        <label htmlFor="answer" className="visually-hidden">
          {slots > 1 ? `Answer for blank ${active + 1} of ${slots}` : "Your answer"}
        </label>
        <input
          id="answer"
          ref={inputRef}
          className={`${styles.answer} ${overall ? ANSWER_STYLE[overall] : ""}`}
          value={grades && slots > 1 ? "" : answer}
          onChange={(event) => {
            // Frozen while the result is showing, but deliberately NOT
            // readOnly: flipping that on a focused input dismisses the
            // keyboard on iOS, which is what made it slide up and down
            // between every card.
            if (!grades) setAnswer(event.target.value);
          }}
          enterKeyHint={grades || active < slots - 1 ? "next" : "go"}
          inputMode="text"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- a quiz is a single-purpose screen
          autoFocus
        />

        {grades && overall ? (
          <div ref={feedbackRef} className={styles.feedback} role="status">
            <p className={`${styles.verdict} ${VERDICT_STYLE[overall]}`}>{VERDICT[overall]}</p>
            {showExpected ? <p className={styles.expected}>{single?.expected}</p> : null}
            {card.gap ? (
              grades.map((graded, index) =>
                graded.result === "correct" ? null : (
                  <p key={index} className={styles.note}>
                    {/* With several blanks, say which one each note is about. */}
                    {slots > 1
                      ? `‘${answers[index]?.trim() || "—"}’ → ${graded.expected}${graded.note ? `: ${graded.note}` : ""}`
                      : graded.note}
                  </p>
                ),
              )
            ) : single?.note && single.result !== "correct" ? (
              <p className={styles.note}>{single.note}</p>
            ) : null}
          </div>
        ) : !card.gap &&
          card.direction === "en→es" &&
          articleRequired(card.entry, GRADE_OPTIONS) ? (
          <p className={styles.hint}>Include the article</p>
        ) : null}
      </form>
    </SessionShell>
  );
}
