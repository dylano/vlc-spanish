import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { readCustom, writeCustom, type CustomChoice } from "../app/local.ts";
import { useStore } from "../app/store-context.ts";
import { problemWords } from "../lib/problems.ts";
import { EXERCISES } from "./quiz/exercises.ts";
import styles from "./CustomPracticeScreen.module.css";

/** Both groups have a "Translate"; out of their groups, the pills need to say which. */
const PILL_LABEL: Record<string, string> = {
  typed: "Translate a word",
  translate: "Translate a sentence",
};

/** How another screen opens this one set to a choice: Problem words' "Practice these". */
export interface CustomPracticeState {
  words?: CustomChoice["words"];
}

/**
 * A row of pills led by "All". All is chosen while nothing narrower is; choosing
 * a pill narrows to it, and clearing the last one goes back to All.
 */
function AllPills({
  items,
  chosen,
  onChange,
  disabled = false,
}: {
  items: { id: string; label: string }[];
  chosen: string[];
  onChange: (chosen: string[]) => void;
  disabled?: boolean;
}) {
  const pill = (on: boolean) => `${styles.pill} ${on ? styles.pillOn : ""}`;
  return (
    <div className={styles.pills}>
      <button
        type="button"
        className={pill(chosen.length === 0)}
        aria-pressed={chosen.length === 0}
        disabled={disabled}
        onClick={() => {
          onChange([]);
        }}
      >
        All
      </button>
      {items.map(({ id, label }) => {
        const on = chosen.includes(id);
        return (
          <button
            key={id}
            type="button"
            className={pill(on)}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => {
              onChange(on ? chosen.filter((other) => other !== id) : [...chosen, id]);
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Choose which words (all, or the Problem words list) and which exercise modes
 * and categories, then start. The choice is kept for next time. Problem words
 * ignore categories, so those grey out while it is chosen.
 */
export default function CustomPracticeScreen() {
  const { entries, progress } = useStore();
  const navigate = useNavigate();
  const opened = useLocation().state as CustomPracticeState | null;
  const troubled = useMemo(() => problemWords(entries, progress).length, [entries, progress]);

  const categories = useMemo(
    () =>
      [...new Set(entries.flatMap((entry) => entry.tags))]
        .sort()
        .map((tag) => ({ id: tag, label: tag.replace(/-/g, " ") })),
    [entries],
  );
  const modes = useMemo(
    () => EXERCISES.map(({ id, label }) => ({ id, label: PILL_LABEL[id] ?? label })),
    [],
  );

  const [choice, setChoice] = useState<CustomChoice>(() => {
    const saved = readCustom();
    // Drop anything saved that no longer exists, so a stale id cannot narrow a
    // session to nothing.
    return {
      words: opened?.words ?? saved.words,
      exercises: saved.exercises.filter((id) => EXERCISES.some((exercise) => exercise.id === id)),
      tags: saved.tags.filter((tag) => entries.some((entry) => entry.tags.includes(tag))),
    };
  });

  useEffect(() => {
    writeCustom(choice);
  }, [choice]);

  // With nothing on the list, Problem words cannot be chosen, whatever was saved.
  const problems = choice.words === "problems" && troubled > 0;

  function start() {
    const params = new URLSearchParams({ scope: problems ? "problems" : "all" });
    if (choice.exercises.length > 0) params.set("exercise", choice.exercises.join(","));
    if (!problems && choice.tags.length > 0) params.set("tags", choice.tags.join(","));
    void navigate(`/quiz?${params.toString()}`);
  }

  const half = (on: boolean) => `${styles.half} ${on ? styles.halfOn : ""}`;

  return (
    <section className={styles.screen}>
      <Link to="/" className={styles.back}>
        <svg className={styles.backChevron} viewBox="0 0 20 20" aria-hidden="true">
          <path d="M13 4l-6 6 6 6" />
        </svg>
        Home
      </Link>
      <h1 className={styles.title}>Custom practice</h1>

      <div role="radiogroup" aria-label="Words" className={styles.segmented}>
        <button
          type="button"
          role="radio"
          aria-checked={!problems}
          className={half(!problems)}
          onClick={() => {
            setChoice((current) => ({ ...current, words: "all" }));
          }}
        >
          All words
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={problems}
          className={half(problems)}
          disabled={troubled === 0}
          onClick={() => {
            setChoice((current) => ({ ...current, words: "problems" }));
          }}
        >
          Problem words · {troubled}
        </button>
      </div>

      <h2 className={styles.heading}>Exercise modes</h2>
      <AllPills
        items={modes}
        chosen={choice.exercises}
        onChange={(exercises) => {
          setChoice((current) => ({ ...current, exercises }));
        }}
      />

      {/* Kept in view but greyed with Problem words: the list ignores categories,
          and the choice comes back as it was on All words. */}
      <div className={problems ? styles.inactive : undefined} aria-disabled={problems}>
        <h2 className={styles.heading}>Categories</h2>
        <AllPills
          items={categories}
          chosen={problems ? [] : choice.tags}
          disabled={problems}
          onChange={(tags) => {
            setChoice((current) => ({ ...current, tags }));
          }}
        />
      </div>

      <div className={styles.spacer} />
      {/* Stuck above the nav: with every category listed, the end of the page is
          below the fold on a phone. */}
      <div className={styles.footer}>
        <button type="button" className={styles.start} onClick={start}>
          Start practice
        </button>
      </div>
    </section>
  );
}
