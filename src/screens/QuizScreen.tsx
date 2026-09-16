import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import SessionShell from "../app/SessionShell.tsx";
import { useStore } from "../app/store-context.ts";
import { today } from "../lib/dates.ts";
import { canonicalAnswer, type Grade } from "../lib/grade.ts";
import { schedule } from "../lib/scheduler.ts";
import { buildSession, DEFAULT_CONFIG, type Card, type QuizConfig } from "../lib/session.ts";
import ChoiceExercise from "./quiz/ChoiceExercise.tsx";
import { GRADE_OPTIONS, type Outcome } from "./quiz/shared.ts";
import TypedExercise from "./quiz/TypedExercise.tsx";
import styles from "./QuizScreen.module.css";

const SCOPE_LABEL: Record<QuizConfig["scope"], string> = {
  due: "Review",
  recent: "New words",
  misses: "Misses",
  all: "Practice",
};

interface Answered {
  card: Card;
  grade: Grade;
  given: string;
}

/**
 * Runs one session: picks the cards, hands each to its exercise, records what
 * happened, and shows the summary. How a card is asked and graded lives in the
 * exercise components under ./quiz.
 */
export default function QuizScreen() {
  const { entries, progress, userId, recordResults } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const config = useMemo<QuizConfig>(() => {
    const scope = params.get("scope");
    const tag = params.get("tag");
    return {
      ...DEFAULT_CONFIG,
      scope:
        scope === "recent" || scope === "misses" || scope === "all" || scope === "due"
          ? scope
          : "due",
      format: params.get("exercise") === "choice" ? "choice" : "typed",
      tags: tag ? [tag] : undefined,
      size: Number(params.get("size") ?? DEFAULT_CONFIG.size),
    };
  }, [params]);

  // Fixed when the screen opens: answering updates progress, and rebuilding
  // mid-session would reshuffle the cards under the user.
  const cards = useMemo(
    () =>
      userId ? buildSession({ entries, progress, userId, config, today: today() }) : ([] as Card[]),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately built once per session
    [entries, userId, config],
  );

  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<Answered[]>([]);

  const card = cards[index];
  const finished = cards.length > 0 && index >= cards.length;

  function done(answeredCard: Card, outcome: Outcome) {
    recordResults([
      {
        entryId: answeredCard.entry.id,
        direction: answeredCard.direction,
        next: schedule(answeredCard.progress, outcome.grade.result, today(), outcome.strength),
      },
    ]);
    setAnswered((current) => [
      ...current,
      { card: answeredCard, grade: outcome.grade, given: outcome.given },
    ]);
    setIndex((current) => current + 1);
  }

  if (!userId) return <p>Choose a name first.</p>;

  if (cards.length === 0) {
    return (
      <SessionShell
        footer={
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              void navigate("/");
            }}
          >
            Back
          </button>
        }
      >
        <section className={styles.empty}>
          <h1 className={styles.emptyTitle}>Nothing waiting</h1>
          <p className={styles.emptyBody}>
            There is nothing to practice in this set right now. Try another, or come back later.
          </p>
        </section>
      </SessionShell>
    );
  }

  if (finished) {
    const correct = answered.filter((item) => item.grade.result === "correct").length;
    const hard = answered.filter((item) => item.grade.result === "hard").length;
    const wrong = answered.filter((item) => item.grade.result === "wrong").length;
    const misses = answered.filter((item) => item.grade.result !== "correct");

    return (
      <SessionShell
        position={{ index: cards.length, total: cards.length }}
        label={SCOPE_LABEL[config.scope]}
        footer={
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              void navigate("/");
            }}
          >
            Done
          </button>
        }
      >
        <section className={styles.summary}>
          <p className={styles.label}>Session complete</p>
          <p className={styles.score}>
            <span className={styles.scoreValue}>{correct}</span>
            <span className={styles.scoreTotal}>of {answered.length}</span>
          </p>

          <p className={styles.tally}>
            <span>
              <span className={styles.dotCorrect}>●</span> {correct} correct
            </span>
            {hard > 0 ? (
              <span>
                <span className={styles.dotHard}>●</span> {hard} almost
              </span>
            ) : null}
            {wrong > 0 ? (
              <span>
                <span className={styles.dotWrong}>●</span> {wrong} missed
              </span>
            ) : null}
          </p>

          {misses.length > 0 ? (
            <>
              <p className={styles.missHeading}>Worth another look</p>
              <ul className={styles.missList}>
                {misses.map((item) => (
                  <li key={`${item.card.entry.id}-${item.card.direction}`} className={styles.miss}>
                    <div className={styles.missTop}>
                      {/* Always the Spanish headword on the left and the English on
                          the right, whichever way round the card was asked -
                          otherwise an es→en miss prints the same text twice. */}
                      <span className={styles.missEs}>
                        {canonicalAnswer(item.card.entry, "en→es", GRADE_OPTIONS)}
                      </span>
                      <span className={styles.missEn}>{item.card.entry.en[0]}</span>
                    </div>
                    <p className={styles.missGiven}>
                      {item.card.exercise === "choice" ? "you picked" : "you wrote"}{" "}
                      {item.given.trim() === "" ? "nothing" : `‘${item.given.trim()}’`}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      </SessionShell>
    );
  }

  if (!card) return null;

  const shared = {
    card,
    position: { index, total: cards.length },
    label: SCOPE_LABEL[config.scope],
    onDone: (outcome: Outcome) => {
      done(card, outcome);
    },
  };

  // Typed cards deliberately share one unkeyed instance, so the input and the
  // keyboard survive from card to card. Choice cards get a fresh instance each.
  return card.exercise === "choice" ? (
    <ChoiceExercise key={index} {...shared} />
  ) : (
    <TypedExercise {...shared} />
  );
}
