import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import Button from "../app/Button.tsx";
import { readCustom, writeCustom, type CustomChoice } from "../app/local.ts";
import type { Tense } from "../lib/sentences/frames.ts";
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
  /** Categories to start with, from the Dictionary's filter: all words, in those. */
  tags?: string[];
}

/**
 * A row of pills under an "All" checkbox on its own line, set apart so it reads as
 * the default rather than one more choice. All is ticked while nothing narrower is;
 * choosing a pill narrows to it, clearing the last one goes back to All, and ticking
 * All clears the pills. It cannot be unticked on its own: choose a pill instead.
 */
function AllPills({
  allLabel,
  items,
  chosen,
  onChange,
  disabled = false,
}: {
  /** What All says for this row: "All types", "All categories". */
  allLabel: string;
  /** An item can be greyed out on its own: word exercises when only the perfecto is chosen. */
  items: { id: string; label: string; disabled?: boolean; lang?: string }[];
  chosen: string[];
  onChange: (chosen: string[]) => void;
  disabled?: boolean;
}) {
  const pill = (on: boolean) => `${styles.pill} ${on ? styles.pillOn : ""}`;
  return (
    <>
      <label className={styles.all}>
        <input
          type="checkbox"
          className={styles.allBox}
          checked={chosen.length === 0}
          disabled={disabled}
          onChange={() => {
            if (chosen.length > 0) onChange([]);
          }}
        />
        {allLabel}
      </label>
      <div className={styles.pills}>
        {items.map(({ id, label, disabled: off = false, lang }) => {
          const on = chosen.includes(id);
          return (
            <button
              key={id}
              type="button"
              className={`${pill(on)} ${off ? styles.pillOff : ""}`}
              aria-pressed={on}
              disabled={disabled || off}
              lang={lang}
              onClick={() => {
                onChange(on ? chosen.filter((other) => other !== id) : [...chosen, id]);
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** The tenses a learner who has opted in can narrow to (board C2), in Spanish as in Settings. */
const TENSE_PILLS: { id: Tense; label: string; lang: string }[] = [
  { id: "presente", label: "Presente", lang: "es" },
  { id: "perfecto", label: "Pretérito perfecto", lang: "es" },
];

/**
 * Choose which words (all, or the Problem words list) and which exercise modes
 * and categories, then start. The choice is kept for next time. Problem words
 * ignore categories, so those grey out while it is chosen. Once a tense beyond
 * the present is opted into in Settings, a Verb Tenses row narrows the sentences
 * to one; the perfecto alone is only in sentences, so word exercises grey out.
 */
export default function CustomPracticeScreen() {
  const { entries, progress, tenses } = useStore();
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
      // A category handed over means all its words: problem words would grey it out.
      words: opened?.tags ? "all" : (opened?.words ?? saved.words),
      exercises: saved.exercises.filter((id) => EXERCISES.some((exercise) => exercise.id === id)),
      tags: (opened?.tags ?? saved.tags).filter((tag) =>
        entries.some((entry) => entry.tags.includes(tag)),
      ),
      tenses: saved.tenses.filter((tense) => TENSE_PILLS.some((pill) => pill.id === tense)),
    };
  });

  useEffect(() => {
    writeCustom(choice);
  }, [choice]);

  // With nothing on the list, Problem words cannot be chosen, whatever was saved.
  const problems = choice.words === "problems" && troubled > 0;
  // The Verb Tenses row exists only once a tense beyond the present is opted into;
  // until then a saved choice is kept but has no effect.
  const tensesShown = tenses.length > 0;
  const tense = tensesShown && choice.tenses.length === 1 ? choice.tenses[0] : undefined;
  const sentencesOnly = tense !== undefined && tense !== "presente";
  const isSentence = (id: string) =>
    EXERCISES.find((exercise) => exercise.id === id)?.group === "Sentences";

  function start() {
    const params = new URLSearchParams({ scope: problems ? "problems" : "all" });
    // The perfecto alone has only sentences: drop word exercises, and with none
    // left (only word types were chosen) take every sentence one.
    const exercises = sentencesOnly
      ? choice.exercises.filter(isSentence).length > 0
        ? choice.exercises.filter(isSentence)
        : EXERCISES.filter((exercise) => exercise.group === "Sentences").map(({ id }) => id)
      : choice.exercises;
    if (exercises.length > 0) params.set("exercise", exercises.join(","));
    if (tense) params.set("tense", tense);
    if (!problems && choice.tags.length > 0) params.set("tags", choice.tags.join(","));
    void navigate(`/quiz?${params.toString()}`);
  }

  const half = (on: boolean) => `${styles.half} ${on ? styles.halfOn : ""}`;

  return (
    <section className={styles.screen}>
      <Button variant="back" to="/" shortcut="Escape">
        Home
      </Button>
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

      <h2 className={styles.heading}>Exercise Types</h2>
      <AllPills
        allLabel="All types"
        items={modes.map((mode) => ({ ...mode, disabled: sentencesOnly && !isSentence(mode.id) }))}
        chosen={choice.exercises}
        onChange={(exercises) => {
          setChoice((current) => ({ ...current, exercises }));
        }}
      />

      {tensesShown ? (
        <>
          <h2 className={styles.heading}>Verb Tenses</h2>
          <AllPills
            allLabel="All tenses"
            items={TENSE_PILLS}
            chosen={choice.tenses}
            onChange={(chosen) => {
              setChoice((current) => ({ ...current, tenses: chosen }));
            }}
          />
        </>
      ) : null}

      {/* Kept in view but greyed with Problem words: the list ignores categories,
          and the choice comes back as it was on All words. */}
      <div className={problems ? styles.inactive : undefined} aria-disabled={problems}>
        <h2 className={styles.heading}>Categories</h2>
        <AllPills
          allLabel="All categories"
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
        <Button variant="primary" shortcut="Enter" onClick={start}>
          Start practice
        </Button>
      </div>
    </section>
  );
}
