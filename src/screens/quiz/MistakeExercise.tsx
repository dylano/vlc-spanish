import { useEffect, useRef, useState, type FormEvent } from "react";
import SessionShell from "../../app/SessionShell.tsx";
import type { Grade, Result } from "../../lib/grade.ts";
import { gradeFix, mistakeTokens } from "../../lib/sentences/mistake.ts";
import styles from "../QuizScreen.module.css";
import { CORRECT_PAUSE_MS, VERDICT, type ExerciseProps } from "./shared.ts";

const FIX_STYLE: Record<Result, string> = {
  correct: styles.fixCorrect!,
  hard: styles.fixHard!,
  wrong: styles.fixWrong!,
};

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

type Phase = "find" | "fix" | "done";

/**
 * Spot the mistake: one word of the Spanish is wrong. Tap it, then type what it
 * should be. Tapping a word that is fine ends the card — finding the mistake is
 * half of what is being practiced.
 *
 * Mounted fresh for each card (the parent keys it).
 */
export default function MistakeExercise({ card, position, label, onDone }: ExerciseProps) {
  const mistake = card.mistake!;
  const tokens = mistakeTokens(mistake);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [phase, setPhase] = useState<Phase>("find");
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState<Grade>();
  const [wrongTap, setWrongTap] = useState<number>();

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    if (grade) feedbackRef.current?.scrollIntoView({ block: "nearest" });
  }, [grade]);

  function finish(final: Grade, given: string) {
    clearTimeout(timer.current);
    onDone([{ card, outcome: { grade: final, given, strength: "recognition" } }]);
  }

  function tap(index: number) {
    if (phase !== "find") return;
    const token = tokens[index]!;
    if (token.broken) {
      setPhase("fix");
      // Inside the tap, so iOS allows it to open the keyboard.
      inputRef.current?.focus();
      return;
    }
    setWrongTap(index);
    setPhase("done");
    setGrade({
      result: "wrong",
      expected: mistake.right,
      note: `‘${token.text}’ is fine. The mistake was ‘${mistake.wrong}’: ${mistake.explanation}`,
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (phase === "done" && grade) {
      finish(grade, wrongTap === undefined ? answer : tokens[wrongTap]!.text);
      return;
    }
    if (phase !== "fix") return;
    const graded = gradeFix(mistake, answer);
    setGrade(graded);
    setPhase("done");
    if (graded.result === "correct") {
      const given = answer;
      timer.current = setTimeout(() => {
        finish(graded, given);
      }, CORRECT_PAUSE_MS);
    }
  }

  // Once answered, the broken words are replaced by the correct text, once.
  const firstBroken = tokens.findIndex((token) => token.broken && token.word);
  const rendered = tokens.map((token, index) => {
    if (token.broken && grade && index !== firstBroken) return null;
    if (!token.word) return <span key={index}>{token.text}</span>;

    const classes = [styles.token];
    let text = token.text;
    if (token.broken && grade) {
      text =
        index === 0
          ? mistake.right.charAt(0).toUpperCase() + mistake.right.slice(1)
          : mistake.right;
      classes.push(FIX_STYLE[grade.result]);
    } else if (token.broken && phase === "fix") {
      classes.push(styles.tokenFound);
    } else if (index === wrongTap) {
      classes.push(styles.tokenWrongTap);
    }
    return (
      <button
        key={index}
        type="button"
        className={classes.join(" ")}
        disabled={phase !== "find"}
        onClick={() => {
          tap(index);
        }}
      >
        {text}
      </button>
    );
  });

  const footer =
    phase === "fix" ? (
      <button
        type="submit"
        form="mistake-form"
        className={styles.button}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
      >
        Check
      </button>
    ) : phase === "done" && grade && grade.result !== "correct" ? (
      <button type="submit" form="mistake-form" className={styles.button}>
        Next
      </button>
    ) : undefined;

  return (
    <SessionShell position={position} label={label} footer={footer}>
      <form id="mistake-form" className={styles.question} onSubmit={submit}>
        <p className={styles.instruction}>Find the wrong word</p>
        <p className={styles.gapEnglish}>{mistake.sentence.en}</p>
        <h1 className={styles.gapSentence}>{rendered}</h1>
        {phase !== "done" ? (
          <p className={styles.hint}>
            {phase === "find" ? "One word is wrong. Tap it." : "Now type what it should be."}
          </p>
        ) : null}

        <div className={styles.divider} />

        <label htmlFor="fix" className="visually-hidden">
          The correct form
        </label>
        <input
          id="fix"
          ref={inputRef}
          className={`${styles.answer} ${grade && wrongTap === undefined ? ANSWER_STYLE[grade.result] : ""}`}
          value={answer}
          placeholder={phase === "fix" ? mistake.wrong : ""}
          onChange={(event) => {
            if (phase !== "done") setAnswer(event.target.value);
          }}
          enterKeyHint={phase === "done" ? "next" : "go"}
          inputMode="text"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />

        {grade ? (
          <div ref={feedbackRef} className={styles.feedback} role="status">
            <p className={`${styles.verdict} ${VERDICT_STYLE[grade.result]}`}>
              {grade.result === "correct" ? "Fixed" : VERDICT[grade.result]}
            </p>
            {grade.note ? <p className={styles.note}>{grade.note}</p> : null}
          </div>
        ) : null}
      </form>
    </SessionShell>
  );
}
