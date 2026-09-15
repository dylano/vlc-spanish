import { useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useStore } from "../app/store-context.ts";
import { today } from "../lib/dates.ts";
import { canonicalAnswer, grade, type Grade, type Result } from "../lib/grade.ts";
import { schedule } from "../lib/scheduler.ts";
import { buildSession, DEFAULT_CONFIG, type Card, type QuizConfig } from "../lib/session.ts";
import styles from "./QuizScreen.module.css";

/** Nouns are always asked with their article: the article is how gender is tested. */
const GRADE_OPTIONS = { requireArticle: true };

interface Answered {
  card: Card;
  grade: Grade;
  given: string;
}

const VERDICT: Record<Result, string> = {
  correct: "Correct",
  hard: "Almost",
  wrong: "Not quite",
};

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

  // The session is fixed when the screen opens: answering a card updates
  // progress, and rebuilding mid-session would reshuffle under the user.
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

  const card = cards[index];
  const finished = cards.length > 0 && index >= cards.length;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!card || result) return;
    const graded = grade(card.entry, card.direction, answer, {
      ...GRADE_OPTIONS,
      confusableWith: card.confusableWith,
    });
    setResult(graded);
    setAnswered((current) => [...current, { card, grade: graded, given: answer }]);
  }

  function advance() {
    if (!result || !card) return;
    const next = schedule(card.progress, result.result, today());
    recordResults([{ entryId: card.entry.id, direction: card.direction, next }]);
    setResult(undefined);
    setAnswer("");
    setIndex((current) => current + 1);
    inputRef.current?.focus();
  }

  if (!userId) {
    return <p>Choose a name first.</p>;
  }

  if (cards.length === 0) {
    return (
      <section className={styles.summary}>
        <h1>Nothing due</h1>
        <p>There are no cards waiting in this scope. Try a different one, or come back tomorrow.</p>
        <button
          type="button"
          className={styles.button}
          onClick={() => {
            void navigate("/");
          }}
        >
          Back to home
        </button>
      </section>
    );
  }

  if (finished) {
    const correct = answered.filter((item) => item.grade.result === "correct").length;
    const misses = answered.filter((item) => item.grade.result !== "correct");

    return (
      <section className={styles.summary}>
        <p className={styles.direction}>Session complete</p>
        <p className={styles.score}>
          {correct} / {answered.length}
        </p>
        {misses.length > 0 ? (
          <>
            <h2>Worth another look</h2>
            <ul className={styles.missList}>
              {misses.map((item) => (
                <li key={`${item.card.entry.id}-${item.card.direction}`} className={styles.miss}>
                  <div className={styles.missEs}>
                    {canonicalAnswer(item.card.entry, item.card.direction, GRADE_OPTIONS)}
                  </div>
                  <div className={styles.missEn}>
                    you wrote {item.given.trim() === "" ? "nothing" : `"${item.given.trim()}"`}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>Every answer correct.</p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              void navigate("/");
            }}
          >
            Done
          </button>
        </div>
      </section>
    );
  }

  if (!card) return null;

  const asking = card.direction === "en→es" ? card.prompt : card.entry.es;

  return (
    <section className={styles.screen}>
      <div className={styles.bar}>
        <div className={styles.barFill} style={{ width: `${(index / cards.length) * 100}%` }} />
      </div>
      <div className={styles.meta}>
        <span>
          {index + 1} of {cards.length}
        </span>
        <span>{config.scope === "due" ? "Due today" : config.scope}</span>
      </div>

      <div className={styles.card}>
        <p className={styles.direction}>
          {card.direction === "en→es" ? "Say it in Spanish" : "Say it in English"}
        </p>
        <h1 className={styles.prompt}>{asking}</h1>
        {card.direction === "en→es" && card.entry.pos === "noun" ? (
          <p className={styles.hint}>include the article</p>
        ) : null}

        <form
          onSubmit={
            result
              ? (event) => {
                  event.preventDefault();
                  advance();
                }
              : submit
          }
        >
          <label htmlFor="answer" className="visually-hidden">
            Your answer
          </label>
          <input
            id="answer"
            ref={inputRef}
            className={styles.input}
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
            <div className={`${styles.feedback} ${styles[result.result]}`}>
              <p className={styles.verdict}>{VERDICT[result.result]}</p>
              <p className={styles.detail}>
                {result.result === "correct" ? result.expected : `${result.expected}`}
                {result.note ? ` — ${result.note}` : ""}
              </p>
            </div>
          ) : null}

          <div className={styles.actions}>
            <button type="submit" className={styles.button}>
              {result ? "Next" : "Check"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
