import { useMemo, useState } from "react";
import { useStore } from "../app/store-context.ts";
import { canonicalAnswer } from "../lib/grade.ts";
import { buildSearchIndex, search } from "../lib/search.ts";
import styles from "./DictionaryScreen.module.css";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`${styles.chevron} ${open ? styles.chevronUp : styles.chevronDown}`}
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
      <input
        id="search"
        className={styles.search}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        placeholder="Search Spanish or English"
        autoComplete="off"
      />

      <div className={styles.filter}>
        <button
          type="button"
          className={`${styles.disclosure} ${choosing ? styles.disclosureOpen : ""}`}
          aria-expanded={choosing}
          aria-controls="categories"
          onClick={() => {
            setChoosing((open) => !open);
          }}
        >
          Categories
          <Chevron open={choosing} />
        </button>
        {tag && !choosing ? (
          <button
            type="button"
            className={`${styles.tag} ${styles.tagActive} ${styles.tagClear}`}
            aria-label={`Remove the ${tag.replace(/-/g, " ")} filter`}
            onClick={() => {
              setTag(undefined);
            }}
          >
            {tag.replace(/-/g, " ")}
            <svg className={styles.clear} viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
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
          </li>
        ))}
      </ul>
    </section>
  );
}
