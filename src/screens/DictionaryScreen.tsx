import { useMemo, useRef, useState } from "react";
import { useStore } from "../app/store-context.ts";
import { canonicalAnswer } from "../lib/grade.ts";
import { buildSearchIndex, search } from "../lib/search.ts";
import type { VerbEntry } from "../lib/schema.ts";
import ConjugationDialog from "./ConjugationDialog.tsx";
import styles from "./DictionaryScreen.module.css";

/** The category common enough to sit in the filter row as a one-tap shortcut. */
const QUICK_TAG = "verbs";

function Chevron({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 4l6 6-6 6" />
    </svg>
  );
}

export default function DictionaryScreen() {
  const { entries } = useStore();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string>();
  // The categories fold away: all of them wrapped into seven rows and pushed the
  // results down behind the phone keyboard.
  const [choosing, setChoosing] = useState(false);
  const [conjugating, setConjugating] = useState<VerbEntry>();
  // Clearing puts the cursor back in the field, ready for the next search.
  const searchRef = useRef<HTMLInputElement>(null);

  const tags = useMemo(
    () => [...new Set(entries.flatMap((entry) => entry.tags))].sort(),
    [entries],
  );

  const index = useMemo(() => buildSearchIndex(entries), [entries]);
  const filtered = useMemo(
    () => search(index, query).filter((entry) => (tag ? entry.tags.includes(tag) : true)),
    [index, query, tag],
  );

  return (
    <section className={styles.screen}>
      <label htmlFor="search" className="visually-hidden">
        Search words
      </label>
      <div className={styles.searchRow}>
        <svg className={styles.searchIcon} viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="9" cy="9" r="5.5" />
          <path d="M13 13l4 4" />
        </svg>
        <input
          id="search"
          ref={searchRef}
          className={styles.search}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="Search Spanish or English"
          autoComplete="off"
        />
        {query ? (
          <button
            type="button"
            className={styles.clear}
            aria-label="Clear the search"
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* Unfiltered, the row offers both: everything, or the one category common
          enough to deserve a tap. Choosing either lands in the same filtered row. */}
      <div className={`${styles.filter} ${tag ? styles.filterOn : ""}`}>
        <button
          type="button"
          className={styles.filterOpen}
          aria-expanded={choosing}
          aria-controls="categories"
          onClick={() => {
            setChoosing((open) => !open);
          }}
        >
          <svg className={styles.filterIcon} viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3 5h14M6 10h8M8.5 15h3" />
          </svg>
          <span className={styles.filterLabel}>
            {tag ? tag.replace(/-/g, " ") : "All categories"}
          </span>
        </button>
        {tag ? (
          <button
            type="button"
            className={styles.filterClear}
            aria-label={`Remove the ${tag.replace(/-/g, " ")} filter`}
            onClick={() => {
              setTag(undefined);
            }}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        ) : tags.includes(QUICK_TAG) ? (
          <>
            <span className={styles.filterDivider} aria-hidden="true" />
            <button
              type="button"
              className={styles.quick}
              onClick={() => {
                setTag(QUICK_TAG);
                setChoosing(false);
              }}
            >
              Verbs only
            </button>
          </>
        ) : null}
      </div>

      {choosing ? (
        <div id="categories" className={styles.tags}>
          {tags.map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={tag === candidate}
              className={`${styles.tag} ${tag === candidate ? styles.tagActive : ""}`}
              onClick={() => {
                // Choosing folds the grid away again so the list is in view.
                setTag(tag === candidate ? undefined : candidate);
                setChoosing(false);
              }}
            >
              {candidate.replace(/-/g, " ")}
            </button>
          ))}
        </div>
      ) : null}

      <p className={styles.count}>
        {filtered.length} {filtered.length === 1 ? "word" : "words"}
      </p>

      <ul className={styles.list}>
        {filtered.map((entry) => (
          <li key={entry.id} className={styles.entry}>
            <div className={styles.head}>
              <span className={styles.es}>
                {canonicalAnswer(entry, "en→es", { requireArticle: true })}
              </span>
              <span className={styles.grammar}>{entry.pos}</span>
            </div>
            <p className={styles.en}>{entry.en.join(", ")}</p>
            {entry.notes ? <p className={styles.note}>{entry.notes}</p> : null}
            {entry.pos === "verb" ? (
              <button
                type="button"
                className={styles.conjugate}
                aria-haspopup="dialog"
                onClick={() => {
                  setConjugating(entry);
                }}
              >
                Conjugate
                <Chevron className={styles.conjugateChevron} />
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {conjugating ? (
        <ConjugationDialog
          entry={conjugating}
          dictionary={entries}
          onClose={() => {
            setConjugating(undefined);
          }}
        />
      ) : null}
    </section>
  );
}
