import { useMemo, useState } from "react";
import { useStore } from "../app/store-context.ts";
import { articleFor, foldAccents } from "../lib/normalize.ts";
import styles from "./DictionaryScreen.module.css";

export default function DictionaryScreen() {
  const { entries } = useStore();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string>();

  const tags = useMemo(
    () => [...new Set(entries.flatMap((entry) => entry.tags))].sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    const needle = foldAccents(query.trim().toLowerCase());
    return entries
      .filter((entry) => (tag ? entry.tags.includes(tag) : true))
      .filter((entry) => {
        if (needle === "") return true;
        return (
          foldAccents(entry.es.toLowerCase()).includes(needle) ||
          entry.en.some((gloss) => gloss.toLowerCase().includes(needle))
        );
      })
      .sort((a, b) => a.es.localeCompare(b.es, "es"));
  }, [entries, query, tag]);

  return (
    <section>
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
          <li key={entry.id} className={styles.row}>
            <div>
              <span className={styles.es}>
                {entry.pos === "noun" ? `${articleFor(entry.gender)} ` : ""}
                {entry.es}
              </span>
              <span className={styles.pos}>{entry.pos}</span>
            </div>
            <div className={styles.en}>{entry.en.join(", ")}</div>
            {entry.notes ? <div className={styles.notes}>{entry.notes}</div> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
