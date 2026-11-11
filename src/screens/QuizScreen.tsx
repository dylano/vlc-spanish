import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import Button from "../app/Button.tsx";
import SessionShell from "../app/SessionShell.tsx";
import { LOCAL_USER } from "../app/local.ts";
import { sentences } from "../app/sentences.ts";
import { useStore } from "../app/store-context.ts";
import { pickAnotherRound } from "../lib/anotherRound.ts";
import { today } from "../lib/dates.ts";
import { canonicalAnswer, type Grade } from "../lib/grade.ts";
import { schedule } from "../lib/scheduler.ts";
import { moreLikeThis } from "../lib/sentences/translate.ts";
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
  type Card,
  type Exercise,
  type QuizConfig,
  type SessionItem,
} from "../lib/session.ts";
import Celebration from "./quiz/Celebration.tsx";
import ChoiceExercise from "./quiz/ChoiceExercise.tsx";
import { EXERCISES } from "./quiz/exercises.ts";
import MatchExercise from "./quiz/MatchExercise.tsx";
import MistakeExercise from "./quiz/MistakeExercise.tsx";
import TranslateExercise from "./quiz/TranslateExercise.tsx";
import { GRADE_OPTIONS, isPerfectSession, type Outcome } from "./quiz/shared.ts";
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

/**
 * Words in a session, when the URL does not say: the length set in Settings,
 * for every kind of session. Match Pairs rounds it to whole rounds.
 */
function sizeFor(format: QuizConfig["format"], sessionSize: number): number {
  if (format !== "match") return sessionSize;
  return Math.max(MATCH_ROUND_SIZE, Math.round(sessionSize / MATCH_ROUND_SIZE) * MATCH_ROUND_SIZE);
}

/** How many words a session step covers. */
function wordsIn(item: SessionItem): number {
  if (isMatchRound(item)) return item.cards.length;
  return item.blankCards?.length ?? 1;
}

/** The exercises named in the URL (`exercise=gap,mistake`), known ones only. */
function exercisesParam(value: string | null): Exercise[] {
  const known = new Set<string>(EXERCISES.map((exercise) => exercise.id));
  return [...new Set((value ?? "").split(","))].filter((id): id is Exercise => known.has(id));
}

/** Categories named in the URL (`tags=food,verbs`). */
function tagsParam(value: string | null): string[] | undefined {
  const tags = (value ?? "").split(",").filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}

const EXERCISE_LABEL = Object.fromEntries(
  EXERCISES.map((exercise) => [exercise.id, exercise.label]),
) as Record<Exercise, string>;

/** The phrase the last session's summary showed, for as long as the app is open. */
let lastAnotherRound: string | undefined;

/**
 * The summary's per-exercise rows have no Words/Sentences headings, as Custom
 * practice does, and no prompt to tell the two Translates apart, so they say it.
 */
const SUMMARY_LABEL: Partial<Record<Exercise, string>> = {
  typed: "Translate a word",
  translate: "Translate a sentence",
};

interface Answered {
  card: Card;
  grade: Grade;
  given: string;
  ungraded?: boolean;
  perfect?: boolean;
}

/** "2 perfect" in a row; "6 perfect translations!" on its own. Undefined for none. */
function perfectLine(count: number, long: boolean): string | undefined {
  if (count === 0) return undefined;
  if (!long) return `${count} perfect`;
  return `${count} perfect ${count === 1 ? "translation" : "translations"}!`;
}

/**
 * Runs one session: picks the cards, hands each to its exercise, records what
 * happened, and shows the summary. How a card is asked and graded lives in the
 * exercise components under ./quiz.
 */
export default function QuizScreen() {
  const { entries, progress, recordResults, sessionSize } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const config = useMemo<QuizConfig>(() => {
    const scope = params.get("scope");
    const exercises = exercisesParam(params.get("exercise"));
    // One exercise named: a session of only that. Several, or none: a mix of them.
    const format = exercises.length === 1 ? exercises[0]! : "mixed";
    return {
      ...DEFAULT_CONFIG,
      scope: scope === "all" || scope === "problems" ? scope : "due",
      format,
      exercises: exercises.length > 1 ? exercises : undefined,
      tags: tagsParam(params.get("tags")),
      size: Number(params.get("size") ?? sizeFor(format, sessionSize)),
    };
  }, [params, sessionSize]);

  // `grammar=object-pronouns` keeps sentence exercises to the frames practising
  // one grammar point, for trying out new frames. Unknown names leave all frames in.
  const grammar = params.get("grammar");
  const frames = useMemo(() => {
    const only = sentences.frames.filter((frame) => grammar && frame.grammar.includes(grammar));
    return only.length > 0 ? { ...sentences, frames: only } : sentences;
  }, [grammar]);

  // Built when the screen opens: answering updates progress, and rebuilding
  // mid-session would reshuffle the cards under the user. It only ever grows,
  // when "Practice more like this" adds sentences after the current one.
  const [items, setItems] = useState((): SessionItem[] => {
    const options = {
      entries,
      progress,
      userId: LOCAL_USER,
      config,
      today: today(),
      sentences: frames,
    };
    if (config.format === "mixed") return buildMixedSession(options);
    if (config.format === "match") return buildMatchRounds(options);
    if (config.format === "gap") return buildGapSession(options);
    if (config.format === "mistake") return buildMistakeSession(options);
    if (config.format === "translate") return buildTranslateSession(options);
    return buildSession(options);
  });

  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<Answered[]>([]);

  // "Practice more like this" after a translation: sentences of the same frame,
  // none already in this session, ready before the reveal so the offer only
  // appears when there is something to offer.
  const current = items[index];
  const more = useMemo(() => {
    if (!current || isMatchRound(current) || current.exercise !== "translate") return [];
    const seen = items.flatMap((step) =>
      isMatchRound(step)
        ? []
        : [step.translation?.sentence.es, step.mistake?.sentence.es, step.gap?.sentence.es],
    );
    return moreLikeThis(
      current.translation!.sentence,
      frames.frames,
      { dictionary: entries, glue: frames.glue, random: Math.random },
      seen.filter((text): text is string => text !== undefined),
    );
  }, [current, items, frames, entries]);

  /** Put the extra sentences straight after this one; answering it then lands on the first. */
  function practiceMore(card: Card) {
    setItems((steps) => [
      ...steps.slice(0, index + 1),
      ...more.map((translation): SessionItem => ({ ...card, translation })),
      ...steps.slice(index + 1),
    ]);
  }
  // Picked once per session, so the button does not change while it is read,
  // and never the phrase the last session showed. Recorded in an effect (which
  // may safely run twice), so the initializer stays pure.
  const [again] = useState(() => pickAnotherRound(lastAnotherRound));
  useEffect(() => {
    lastAnotherRound = again.text;
  }, [again]);

  // The summary is labelled with where the session came from. Each item's header
  // names its own exercise, so a mixed session always shows which one is up.
  const label =
    config.scope === "problems"
      ? "Problem words"
      : config.format !== "mixed"
        ? EXERCISE_LABEL[config.format]
        : config.exercises || config.tags
          ? "Custom practice"
          : "General practice";

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
        perfect: outcome.perfect,
      })),
    ]);
    setIndex((current) => current + 1);
  }

  if (items.length === 0) {
    const sentenceExercise =
      config.format === "gap" || config.format === "mistake" || config.format === "translate";
    const emptyMessage = !sentenceExercise
      ? "There is nothing to practice in this set right now. Try another, or come back later."
      : "No sentence fits the words in this set. Try another, or come back later.";
    return (
      <SessionShell
        footer={
          <Button
            variant="primary"
            shortcut="Enter"
            onClick={() => {
              void navigate("/");
            }}
          >
            Back
          </Button>
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
    // Sentence translations are not graded, so they are counted apart from the
    // score: in their own row when the session mixed exercises, or as the big
    // number when it was nothing else. An exact match counts as perfect, shown
    // only when there is at least one and never as a score out of the total.
    const graded = answered.filter((item) => !item.ungraded);
    const sentenceCount = answered.length - graded.length;
    const perfect = answered.filter((item) => item.perfect).length;
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
        perfect: done.filter((item) => item.perfect).length,
      };
    }).filter((exercise) => exercise.total > 0);

    return (
      <SessionShell
        position={{ index: totalWords, total: totalWords }}
        label={label}
        footer={
          <div className={styles.summaryActions}>
            {/* The same settings (the URL) again: new words and sentences, not a replay. */}
            <Button
              variant="secondary"
              shortcut="r"
              onClick={() => {
                void navigate(`/quiz${location.search}`, { replace: true });
              }}
            >
              <svg className={styles.buttonIcon} viewBox="0 0 20 20" aria-hidden="true">
                <path d="M16 10a6 6 0 1 1-1.76-4.24" />
                <path d="M16 3.5v3.5h-3.5" />
              </svg>
              <span lang={again.lang}>{again.text}</span>
            </Button>
            <Button
              variant="primary"
              shortcut="Enter"
              onClick={() => {
                void navigate("/");
              }}
            >
              Done
            </Button>
          </div>
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
              <span className={styles.scoreValue}>{sentenceCount}</span>
              <span className={styles.scoreTotal}>
                {sentenceCount === 1 ? "sentence" : "sentences"}
              </span>
            </p>
          )}

          {isPerfectSession(answered) ? <Celebration /> : null}

          {graded.length === 0 && perfect > 0 ? (
            <p className={styles.tally}>
              <span>
                <span className={styles.dotCorrect}>●</span> {perfectLine(perfect, true)}
              </span>
            </p>
          ) : null}

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
            </p>
          ) : null}

          {byExercise.length > 1 ? (
            <ul className={styles.breakdown}>
              {byExercise.map((exercise) => (
                <li key={exercise.id} className={styles.breakdownRow}>
                  <span>{SUMMARY_LABEL[exercise.id] ?? exercise.label}</span>
                  <span className={styles.breakdownScore}>
                    {exercise.ungraded
                      ? [
                          `${exercise.total} ${exercise.total === 1 ? "sentence" : "sentences"}`,
                          perfectLine(exercise.perfect, false),
                        ]
                          .filter(Boolean)
                          .join(", ")
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
  if (item.exercise === "translate") {
    return (
      <TranslateExercise
        key={index}
        {...shared}
        onMore={
          more.length > 0
            ? () => {
                practiceMore(item);
              }
            : undefined
        }
      />
    );
  }
  return <TypedExercise {...shared} />;
}
