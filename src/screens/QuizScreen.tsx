import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import SessionShell from "../app/SessionShell.tsx";
import { LOCAL_USER } from "../app/local.ts";
import { sentences } from "../app/sentences.ts";
import { useStore } from "../app/store-context.ts";
import { today } from "../lib/dates.ts";
import { canonicalAnswer, type Grade } from "../lib/grade.ts";
import { schedule } from "../lib/scheduler.ts";
import {
  buildGapSession,
  buildMistakeSession,
  buildTranslateSession,
  buildMatchRounds,
  buildMixedSession,
  buildSession,
  DEFAULT_CONFIG,
  isMatchRound,
  MATCH_ROUND_SIZE,
  isDrillable,
  MIN_SENTENCE_WORDS,
  type Card,
  type Exercise,
  type QuizConfig,
  type SessionItem,
} from "../lib/session.ts";
import ChoiceExercise from "./quiz/ChoiceExercise.tsx";
import { EXERCISES } from "./quiz/exercises.ts";
import MatchExercise from "./quiz/MatchExercise.tsx";
import MistakeExercise from "./quiz/MistakeExercise.tsx";
import TranslateExercise from "./quiz/TranslateExercise.tsx";
import { GRADE_OPTIONS, type Outcome } from "./quiz/shared.ts";
import TypedExercise from "./quiz/TypedExercise.tsx";
import styles from "./QuizScreen.module.css";

/** What the summary says the learner did, by exercise. */
const GIVEN_VERB: Record<Exercise, string> = {
  typed: "you wrote",
  choice: "you picked",
  match: "you paired it with",
  gap: "you wrote",
  mistake: "you answered",
  translate: "you wrote",
};

/** Words in a session, when the URL does not say. */
const DEFAULT_SIZE: Record<QuizConfig["format"], number> = {
  typed: DEFAULT_CONFIG.size,
  choice: DEFAULT_CONFIG.size,
  match: MATCH_ROUND_SIZE * 4,
  gap: DEFAULT_CONFIG.size,
  mistake: DEFAULT_CONFIG.size,
  translate: DEFAULT_CONFIG.size,
  // Enough for a matching round alongside a run of single cards.
  mixed: 15,
};

/** A session asks with one exercise when the URL names it, and mixes them otherwise. */
/** How many words a session step covers. */
function wordsIn(item: SessionItem): number {
  if (isMatchRound(item)) return item.cards.length;
  return item.blankCards?.length ?? 1;
}

function formatParam(value: string | null): QuizConfig["format"] {
  return value === "typed" ||
    value === "choice" ||
    value === "match" ||
    value === "gap" ||
    value === "mistake" ||
    value === "translate"
    ? value
    : "mixed";
}

/** Header label: the home-screen row the session came from, in short. */
const SCOPE_LABEL: Record<QuizConfig["scope"], string> = {
  due: "Practice",
  recent: "New words",
  misses: "Remediation",
  all: "Practice",
};

const EXERCISE_LABEL = Object.fromEntries(
  EXERCISES.map((exercise) => [exercise.id, exercise.label]),
) as Record<Exercise, string>;

interface Answered {
  card: Card;
  grade: Grade;
  given: string;
  ungraded?: boolean;
}

/**
 * Runs one session: picks the cards, hands each to its exercise, records what
 * happened, and shows the summary. How a card is asked and graded lives in the
 * exercise components under ./quiz.
 */
export default function QuizScreen() {
  const { entries, progress, recordResults } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const config = useMemo<QuizConfig>(() => {
    const scope = params.get("scope");
    const tag = params.get("tag");
    const format = formatParam(params.get("exercise"));
    return {
      ...DEFAULT_CONFIG,
      scope:
        scope === "recent" || scope === "misses" || scope === "all" || scope === "due"
          ? scope
          : "due",
      format,
      tags: tag ? [tag] : undefined,
      size: Number(params.get("size") ?? DEFAULT_SIZE[format]),
    };
  }, [params]);

  // Fixed when the screen opens: answering updates progress, and rebuilding
  // mid-session would reshuffle the cards under the user.
  const items = useMemo((): SessionItem[] => {
    const options = { entries, progress, userId: LOCAL_USER, config, today: today(), sentences };
    if (config.format === "mixed") return buildMixedSession(options);
    if (config.format === "match") return buildMatchRounds(options);
    if (config.format === "gap") return buildGapSession(options);
    if (config.format === "mistake") return buildMistakeSession(options);
    if (config.format === "translate") return buildTranslateSession(options);
    return buildSession(options);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately built once per session
  }, [entries, config]);

  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<Answered[]>([]);

  // The summary is labelled with where the session came from. Each item's header
  // names its own exercise, so a mixed session always shows which one is up.
  const label =
    config.format === "mixed" ? SCOPE_LABEL[config.scope] : EXERCISE_LABEL[config.format];

  // Progress is counted in words, not steps: a matching round is four words and a
  // gap may have several blanks. Counting steps made the bar of a 15-word
  // session anywhere from 4 to 15 segments long.
  const wordsBefore = items.reduce<number[]>(
    (starts, current, position) => [...starts, (starts[position] ?? 0) + wordsIn(current)],
    [0],
  );
  const totalWords = wordsBefore[items.length] ?? 0;

  const item = items[index];
  const finished = items.length > 0 && index >= items.length;

  /** Record one item's results — one card, or every card in a matching round. */
  function done(results: { card: Card; outcome: Outcome }[]) {
    // An ungraded answer (a translation) leaves the word's schedule alone.
    recordResults(
      results
        .filter(({ outcome }) => !outcome.ungraded)
        .map(({ card, outcome }) => ({
          entryId: card.entry.id,
          direction: card.direction,
          next: schedule(card.progress, outcome.grade.result, today(), outcome.strength),
        })),
    );
    setAnswered((current) => [
      ...current,
      ...results.map(({ card, outcome }) => ({
        card,
        grade: outcome.grade,
        given: outcome.given,
        ungraded: outcome.ungraded,
      })),
    ]);
    setIndex((current) => current + 1);
  }

  if (items.length === 0) {
    const sentenceExercise =
      config.format === "gap" || config.format === "mistake" || config.format === "translate";
    const practicedWords = entries.filter(
      (entry) => isDrillable(entry) && progress.entries[entry.id] !== undefined,
    ).length;
    // Say why only when it is actually the reason: with enough words practiced,
    // an empty sentence session means no frame fits them, not too few words.
    const emptyMessage = !sentenceExercise
      ? "There is nothing to practice in this set right now. Try another, or come back later."
      : practicedWords < MIN_SENTENCE_WORDS
        ? `Sentences only use words you have already practiced. You have practiced ${practicedWords}; at ${MIN_SENTENCE_WORDS} they will appear.`
        : "None of the sentences fit the words you have practiced yet. Practice words from more sections and they will appear.";
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
          <p className={styles.emptyBody}>{emptyMessage}</p>
        </section>
      </SessionShell>
    );
  }

  if (finished) {
    // Translations are not graded, so they are counted apart from the score.
    const graded = answered.filter((item) => !item.ungraded);
    const translated = answered.length - graded.length;
    const correct = graded.filter((item) => item.grade.result === "correct").length;
    const hard = graded.filter((item) => item.grade.result === "hard").length;
    const wrong = graded.filter((item) => item.grade.result === "wrong").length;
    const misses = graded.filter((item) => item.grade.result !== "correct");
    // Only worth showing when the session actually moved between exercises.
    const byExercise = EXERCISES.map((exercise) => {
      const done = answered.filter((item) => item.card.exercise === exercise.id);
      return {
        ...exercise,
        total: done.length,
        ungraded: done.some((item) => item.ungraded),
        correct: done.filter((item) => item.grade.result === "correct").length,
      };
    }).filter((exercise) => exercise.total > 0);

    return (
      <SessionShell
        position={{ index: totalWords, total: totalWords }}
        label={label}
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
          {graded.length > 0 ? (
            <p className={styles.score}>
              <span className={styles.scoreValue}>{correct}</span>
              <span className={styles.scoreTotal}>of {graded.length}</span>
            </p>
          ) : (
            <p className={styles.score}>
              <span className={styles.scoreValue}>{translated}</span>
              <span className={styles.scoreTotal}>translated</span>
            </p>
          )}

          {graded.length > 0 ? (
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
              {translated > 0 ? <span>{translated} translated</span> : null}
            </p>
          ) : null}

          {byExercise.length > 1 ? (
            <ul className={styles.breakdown}>
              {byExercise.map((exercise) => (
                <li key={exercise.id} className={styles.breakdownRow}>
                  <span>{exercise.label}</span>
                  <span className={styles.breakdownScore}>
                    {exercise.ungraded
                      ? `${exercise.total} translated`
                      : `${exercise.correct} of ${exercise.total}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

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
                      {GIVEN_VERB[item.card.exercise]}{" "}
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

  if (!item) return null;

  const position = { index: wordsBefore[index] ?? 0, total: totalWords };

  if (isMatchRound(item)) {
    return (
      <MatchExercise
        key={index}
        round={item}
        position={position}
        label={EXERCISE_LABEL.match}
        onDone={done}
      />
    );
  }

  const shared = { card: item, position, label: EXERCISE_LABEL[item.exercise], onDone: done };

  // Typed cards deliberately share one unkeyed instance, so the input and the
  // keyboard survive from card to card. Other exercises get a fresh instance each.
  if (item.exercise === "choice") return <ChoiceExercise key={index} {...shared} />;
  if (item.exercise === "mistake") return <MistakeExercise key={index} {...shared} />;
  if (item.exercise === "translate") return <TranslateExercise key={index} {...shared} />;
  return <TypedExercise {...shared} />;
}
