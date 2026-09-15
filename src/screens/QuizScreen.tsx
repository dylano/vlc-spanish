import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useStore } from "../app/store-context.ts";
import { today } from "../lib/dates.ts";
import { canonicalAnswer, grade, type Grade, type Result } from "../lib/grade.ts";
import { normalize } from "../lib/normalize.ts";
import { schedule } from "../lib/scheduler.ts";
import { buildSession, DEFAULT_CONFIG, type Card, type QuizConfig } from "../lib/session.ts";
import styles from "./QuizScreen.module.css";

/** Nouns are always asked with their article: the article is how gender is tested. */
const GRADE_OPTIONS = { requireArticle: true };

/**
 * How long a correct answer stays on screen before the next card. Long enough to
 * register that it landed, short enough that it never feels like waiting.
 */
const CORRECT_PAUSE_MS = 700;

const VERDICT: Record<Result, string> = {
  correct: "Correct",
  hard: "Almost",
  wrong: "Not quite",
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

/** Grammar line under the prompt, drawn from metadata the dictionary already has. */
function grammarOf(card: Card): string | undefined {
  const { entry } = card;
  switch (entry.pos) {
    case "noun":
      return `noun · ${entry.gender === "m" ? "masculine" : "feminine"}`;
    case "verb": {
      const parts = ["verb"];
      if (entry.verb.reflexive) parts.push("reflexive");
      if (entry.verb.stemChange) parts.push(entry.verb.stemChange);
      return parts.join(" · ");
    }
    case "adj":
      return "adjective";
    case "adv":
      return "adverb";
    case "number":
      return "number";
    default:
      return undefined;
  }
}

export default function QuizScreen() {
  const { entries, progress, userId, recordResults } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const config = useMemo<QuizConfig>(() => {
    const scope = params.get("scope");
    const tag = params.get("tag");
    return {
      ...DEFAULT_CONFIG,
      scope:
        scope === "recent" || scope === "misses" || scope === "all" || scope === "due"
          ? scope
          : "due",
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
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Grade>();
  const [answered, setAnswered] = useState<Answered[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const card = cards[index];
  const finished = cards.length > 0 && index >= cards.length;

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  function commit(graded: Grade, answeredCard: Card) {
    clearTimeout(timer.current);
    recordResults([
      {
        entryId: answeredCard.entry.id,
        direction: answeredCard.direction,
        next: schedule(answeredCard.progress, graded.result, today()),
      },
    ]);
    setResult(undefined);
    setAnswer("");
    setIndex((current) => current + 1);
    inputRef.current?.focus();
  }

  function check(event: FormEvent) {
    event.preventDefault();
    if (!card || result) return;
    const graded = grade(card.entry, card.direction, answer, {
      ...GRADE_OPTIONS,
      confusableWith: card.confusableWith,
      dictionary: entries,
    });
    setResult(graded);
    setAnswered((current) => [...current, { card, grade: graded, given: answer }]);

    // A right answer needs no acknowledgement from the user - show it landed,
    // then move on. Anything else is worth stopping to read.
    if (graded.result === "correct") {
      timer.current = setTimeout(() => {
        commit(graded, card);
      }, CORRECT_PAUSE_MS);
    }
  }

  function advance() {
    if (!result || !card) return;
    commit(result, card);
  }

  if (!userId) return <p>Choose a name first.</p>;

  if (cards.length === 0) {
    return (
      <section className={styles.empty}>
        <h1 className={styles.emptyTitle}>Nothing waiting</h1>
        <p className={styles.emptyBody}>
          There is nothing to practise in this set right now. Try another, or come back later.
        </p>
        <button
          type="button"
          className={styles.button}
          onClick={() => {
            void navigate("/");
          }}
        >
          Back
        </button>
      </section>
    );
  }

  if (finished) {
    const correct = answered.filter((item) => item.grade.result === "correct").length;
    const hard = answered.filter((item) => item.grade.result === "hard").length;
    const wrong = answered.filter((item) => item.grade.result === "wrong").length;
    const misses = answered.filter((item) => item.grade.result !== "correct");

    return (
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
                    you wrote {item.given.trim() === "" ? "nothing" : `‘${item.given.trim()}’`}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <div className={styles.spacer} />
        <button
          type="button"
          className={styles.button}
          onClick={() => {
            void navigate("/");
          }}
        >
          Done
        </button>
      </section>
    );
  }

  if (!card) return null;

  const asking = card.direction === "en→es" ? card.prompt : card.entry.es;
  const grammar = card.direction === "en→es" ? grammarOf(card) : undefined;

  // Echoing back a correct answer the user just typed is noise; the expected
  // form only earns its place when it differs from what they wrote.
  const showExpected = result !== undefined && normalize(result.expected) !== normalize(answer);

  return (
    <section className={styles.screen}>
      <div className={styles.progress} aria-hidden="true">
        {cards.map((item, position) => (
          <div
            key={`${item.entry.id}-${item.direction}`}
            className={`${styles.segment} ${position < index ? styles.segmentDone : ""}`}
          />
        ))}
      </div>
      <p className={styles.meta}>
        <span>
          {index + 1} of {cards.length}
        </span>
        <span>{SCOPE_LABEL[config.scope]}</span>
      </p>

      <form
        className={styles.form}
        onSubmit={
          result
            ? (event) => {
                event.preventDefault();
                advance();
              }
            : check
        }
      >
        <div className={styles.question}>
          <p className={styles.label}>
            {card.direction === "en→es" ? "Say it in Spanish" : "Say it in English"}
          </p>
          <h1 className={styles.prompt}>{asking}</h1>
          {grammar ? <p className={styles.grammar}>{grammar}</p> : null}

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
              setAnswer(event.target.value);
            }}
            readOnly={result !== undefined}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- a quiz is a single-purpose screen
            autoFocus
          />

          {result ? (
            <div className={styles.feedback} role="status">
              <p className={`${styles.verdict} ${VERDICT_STYLE[result.result]}`}>
                {VERDICT[result.result]}
              </p>
              {showExpected ? <p className={styles.expected}>{result.expected}</p> : null}
              {result.note && result.result !== "correct" ? (
                <p className={styles.note}>{result.note}</p>
              ) : null}
            </div>
          ) : card.direction === "en→es" && card.entry.pos === "noun" ? (
            <p className={styles.hint}>Include the article</p>
          ) : null}
        </div>

        <button type="submit" className={styles.button}>
          {result ? "Next" : "Check"}
        </button>
      </form>
    </section>
  );
}
