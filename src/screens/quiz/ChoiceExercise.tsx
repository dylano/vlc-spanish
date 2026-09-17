import { useEffect, useRef, useState } from "react";
import SessionShell from "../../app/SessionShell.tsx";
import { useStore } from "../../app/store-context.ts";
import { optionText } from "../../lib/choices.ts";
import type { Grade } from "../../lib/grade.ts";
import styles from "../QuizScreen.module.css";
import {
  CORRECT_PAUSE_MS,
  promptDetail,
  promptText,
  VERDICT,
  type ExerciseProps,
} from "./shared.ts";

const LETTERS = ["a", "b", "c", "d", "e", "f"];

/**
 * Pick the right word from four. Touching an option is the answer: there is no
 * separate Check step, because choosing from a list is already a deliberate act
 * and a second tap per question only slows the drill down.
 *
 * Mounted fresh for each card (the parent keys it), so state never leaks from
 * one question to the next; there is no keyboard to keep up here.
 */
export default function ChoiceExercise({ card, position, label, onDone }: ExerciseProps) {
  const { entries } = useStore();
  const options = card.options ?? [];
  const [selected, setSelected] = useState<number>();
  const checked = selected !== undefined;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const feedbackRef = useRef<HTMLDivElement>(null);

  const picked = selected === undefined ? undefined : options[selected];
  const answer = options.find((option) => option.correct);

  // What the wrong pick actually means, so a miss teaches something: "la madre
  // is mother". The answer itself is already highlighted in the list.
  const pickedEntry = entries.find((entry) => entry.id === picked?.entryId);
  const pickedMeaning =
    pickedEntry && !picked?.correct
      ? card.direction === "en→es"
        ? pickedEntry.en[0]
        : optionText(pickedEntry, "en→es")
      : undefined;

  const graded: Grade | undefined =
    checked && picked && answer
      ? {
          result: picked.correct ? "correct" : "wrong",
          expected: answer.text,
          note: pickedMeaning ? `‘${picked.text}’ means ${pickedMeaning}` : undefined,
        }
      : undefined;

  function finish() {
    if (!graded || !picked) return;
    clearTimeout(timer.current);
    onDone([{ card, outcome: { grade: graded, given: picked.text, strength: "recognition" } }]);
  }

  function choose(index: number) {
    const option = options[index];
    if (checked || !option) return;
    setSelected(index);
    if (option.correct) {
      timer.current = setTimeout(() => {
        onDone([
          {
            card,
            outcome: {
              grade: { result: "correct", expected: option.text },
              given: option.text,
              strength: "recognition",
            },
          },
        ]);
      }, CORRECT_PAUSE_MS);
    }
  }

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    if (checked) feedbackRef.current?.scrollIntoView({ block: "nearest" });
  }, [checked]);

  // On a computer: a–d or 1–4 to answer, Enter to move on.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Enter") {
        event.preventDefault();
        finish();
        return;
      }
      const byLetter = LETTERS.indexOf(event.key.toLowerCase());
      const byNumber = Number.parseInt(event.key, 10) - 1;
      const choice = byLetter >= 0 ? byLetter : byNumber;
      if (choice >= 0 && choice < options.length) choose(choice);
    }
    globalThis.addEventListener("keydown", onKey);
    return () => {
      globalThis.removeEventListener("keydown", onKey);
    };
  });

  const detail = promptDetail(card);

  function rowClass(index: number): string {
    const option = options[index]!;
    if (!checked) return styles.option!;
    if (option.correct) return `${styles.option} ${styles.optionCorrect}`;
    if (index === selected) return `${styles.option} ${styles.optionWrong}`;
    return `${styles.option} ${styles.optionIdle}`;
  }

  return (
    <SessionShell
      position={position}
      label={label}
      // A right answer moves on by itself; only a miss needs a way forward,
      // after the learner has had a chance to read why.
      footer={
        checked && !picked?.correct ? (
          <button type="button" className={styles.button} onClick={finish}>
            Next
          </button>
        ) : undefined
      }
    >
      <div className={styles.question}>
        <p className={styles.instruction}>Which one means</p>
        <h1 className={styles.prompt}>{promptText(card)}</h1>
        {detail ? <p className={styles.grammar}>{detail}</p> : null}

        <div className={styles.options} role="group" aria-label="Choices">
          {options.map((option, index) => (
            <button
              key={option.entryId}
              type="button"
              className={rowClass(index)}
              disabled={checked}
              onClick={() => {
                choose(index);
              }}
            >
              <span className={styles.optionLetter}>{LETTERS[index]}</span>
              <span className={styles.optionText}>{option.text}</span>
            </button>
          ))}
        </div>

        {graded ? (
          <div ref={feedbackRef} className={styles.feedback} role="status">
            <p
              className={`${styles.verdict} ${graded.result === "correct" ? styles.verdictCorrect : styles.verdictWrong}`}
            >
              {VERDICT[graded.result]}
            </p>
            {graded.note ? <p className={styles.note}>{graded.note}</p> : null}
            {graded.result === "wrong" && card.entry.notes ? (
              <p className={styles.note}>{card.entry.notes}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </SessionShell>
  );
}
