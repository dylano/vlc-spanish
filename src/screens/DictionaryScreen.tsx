import { useMemo, useState } from "react";
import { useStore } from "../app/store-context.ts";
import { canonicalAnswer } from "../lib/grade.ts";
import { buildSearchIndex, search } from "../lib/search.ts";
import styles from "./DictionaryScreen.module.css";

export default function DictionaryScreen() {
  const { entries } = useStore();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string>();

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

      <div className={styles.tags}>
        {tags.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={`${styles.tag} ${tag === candidate ? styles.tagActive : ""}`}
            onClick={() => {
              setTag(tag === candidate ? undefined : candidate);
            }}
          >
            {candidate.replace(/-/g, " ")}
          </button>
        ))}
      </div>

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
