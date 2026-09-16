import { useEffect, useRef, useState } from "react";
import SessionShell from "../../app/SessionShell.tsx";
import { canonicalAnswer } from "../../lib/grade.ts";
import { shuffle } from "../../lib/random.ts";
import type { Card, MatchRound } from "../../lib/session.ts";
import styles from "../QuizScreen.module.css";
import { GRADE_OPTIONS, type Outcome } from "./shared.ts";

/** How long a wrong pair stays red before both tiles clear. */
const WRONG_FLASH_MS = 450;

/** How long a finished round stays on screen before the next item. */
const ROUND_DONE_PAUSE_MS = 700;

type Side = "es" | "en";

export interface MatchExerciseProps {
  round: MatchRound;
  position: { index: number; total: number };
  label: string;
  onDone: (results: { card: Card; outcome: Outcome }[]) => void;
}

function spanishOf(card: Card): string {
  return canonicalAnswer(card.entry, "en→es", GRADE_OPTIONS);
}

/**
 * Pair six Spanish words with their English. Tap a tile on either side, then its
 * partner on the other. A right pair locks; a wrong pair flashes and clears.
 *
 * A word counts as known only if it was matched without ever being part of a
 * wrong pair. Both words in a wrong pair count as missed: tapping "brother"
 * for el primo says something unsure about each of them.
 */
export default function MatchExercise({ round, position, label, onDone }: MatchExerciseProps) {
  const { cards } = round;
  const [columns] = useState(() => ({
    es: shuffle(
      cards.map((_, index) => index),
      Math.random,
    ),
    en: shuffle(
      cards.map((_, index) => index),
      Math.random,
    ),
  }));
  const [selected, setSelected] = useState<{ side: Side; index: number }>();
  const [matched, setMatched] = useState<ReadonlySet<number>>(new Set());
  const [flash, setFlash] = useState<{ es: number; en: number }>();
  // The first wrong partner each word was paired with, for the summary.
  const [missed, setMissed] = useState<ReadonlyMap<number, string>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const complete = matched.size === cards.length;

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  function textOf(side: Side, index: number): string {
    const card = cards[index]!;
    return side === "es" ? spanishOf(card) : card.prompt;
  }

  function finish(finalMissed: ReadonlyMap<number, string>) {
    onDone(
      cards.map((card, index) => {
        const wrongPartner = finalMissed.get(index);
        return {
          card,
          outcome: {
            grade: {
              result: wrongPartner === undefined ? "correct" : "wrong",
              expected: `${spanishOf(card)} — ${card.prompt}`,
            },
            given: wrongPartner ?? spanishOf(card),
            strength: "recognition",
          },
        };
      }),
    );
  }

  function tap(side: Side, index: number) {
    if (complete || flash || matched.has(index)) return;

    // First tile of a pair, or a change of mind on the same side.
    if (!selected || selected.side === side) {
      setSelected(
        selected?.side === side && selected.index === index ? undefined : { side, index },
      );
      return;
    }

    const pair =
      side === "es" ? { es: index, en: selected.index } : { es: selected.index, en: index };
    setSelected(undefined);

    if (pair.es === pair.en) {
      const nextMatched = new Set(matched).add(pair.es);
      setMatched(nextMatched);
      if (nextMatched.size === cards.length) {
        timer.current = setTimeout(() => {
          finish(missed);
        }, ROUND_DONE_PAUSE_MS);
      }
      return;
    }

    const nextMissed = new Map(missed);
    if (!nextMissed.has(pair.es)) nextMissed.set(pair.es, textOf("en", pair.en));
    if (!nextMissed.has(pair.en)) nextMissed.set(pair.en, textOf("es", pair.es));
    setMissed(nextMissed);
    setFlash(pair);
    timer.current = setTimeout(() => {
      setFlash(undefined);
    }, WRONG_FLASH_MS);
  }

  function tileClass(side: Side, index: number): string {
    const classes = [styles.tile, side === "es" ? styles.tileSpanish : styles.tileEnglish];
    if (matched.has(index)) classes.push(styles.tileMatched);
    else if (flash?.[side] === index) classes.push(styles.tileWrong);
    else if (selected?.side === side && selected.index === index) classes.push(styles.tileSelected);
    return classes.join(" ");
  }

  const slips = missed.size;

  return (
    <SessionShell position={position} label={label}>
      <div className={styles.question}>
        <h1 className={styles.label}>Match the pairs</h1>

        <div className={styles.matchGrid}>
          {(["es", "en"] as const).map((side) => (
            <div
              key={side}
              className={styles.matchColumn}
              role="group"
              aria-label={side === "es" ? "Spanish" : "English"}
            >
              {columns[side].map((index) => (
                <button
                  key={index}
                  type="button"
                  className={tileClass(side, index)}
                  aria-pressed={selected?.side === side && selected.index === index}
                  disabled={matched.has(index)}
                  onClick={() => {
                    tap(side, index);
                  }}
                >
                  {textOf(side, index)}
                </button>
              ))}
            </div>
          ))}
        </div>

        {complete ? (
          <div className={styles.feedback} role="status">
            <p
              className={`${styles.verdict} ${slips === 0 ? styles.verdictCorrect : styles.verdictHard}`}
            >
              {slips === 0 ? "All matched" : `All matched · ${slips} to look at again`}
            </p>
          </div>
        ) : null}
      </div>
    </SessionShell>
  );
}
