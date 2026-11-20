import { useEffect, useRef } from "react";
import Button from "../app/Button.tsx";
import { conjugationTable } from "../lib/conjugation.ts";
import type { Entry, VerbEntry } from "../lib/schema.ts";
import { participle, perfectForm } from "../lib/sentences/conjugate.ts";
import { perfectVerb } from "../lib/sentences/english.ts";
import styles from "./ConjugationDialog.module.css";

/**
 * A verb's present tense, over the Dictionary rather than on a screen of its
 * own. A native modal dialog, so focus stays inside it and Escape closes it; a
 * tap on the dimmed list behind closes it too. The participle follows the table
 * (board D4), for everyone, whether or not the pretérito perfecto is ticked in
 * Settings: it is what that tense, and every later compound one, is built from.
 */
export default function ConjugationDialog({
  entry,
  dictionary,
  onClose,
}: {
  entry: VerbEntry;
  dictionary: Entry[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const table = conjugationTable(entry, dictionary);
  const made = participle(entry, dictionary);
  // "With haber: he vuelto, I have returned", for an irregular one; gustar has no
  // yo form of its own (me ha gustado), so it says only what the rule would give.
  const withHaber = made?.irregular ? perfectForm(entry, "yo", dictionary) : undefined;

  // No close() on cleanup: closing fires onClose, and React runs this effect
  // twice in development. Unmounting takes the dialog out of the top layer anyway.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="conjugation-title"
      onClose={onClose}
      onClick={(event) => {
        // The dialog element itself only receives clicks on its backdrop.
        if (event.target === ref.current) ref.current.close();
      }}
    >
      <div className={styles.card}>
        <div className={styles.header}>
          <div>
            <div className={styles.head}>
              <h2 id="conjugation-title" className={styles.es}>
                {entry.es}
              </h2>
              <span className={styles.grammar}>verb</span>
            </div>
            <p className={styles.en}>{entry.en.join(", ")}</p>
          </div>
          <Button className={styles.close} aria-label="Close" onClick={() => ref.current?.close()}>
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </Button>
        </div>

        <div className={styles.label}>
          <span lang="es">Presente</span>
          {table.tags.length > 0 ? (
            <span className={styles.tags}>
              {table.tags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </span>
          ) : null}
        </div>

        <table className={styles.table}>
          {table.columns ? (
            <thead>
              <tr>
                <td />
                {table.columns.map((column) => (
                  <th key={column} scope="col" className={styles.column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.person}>
                <th scope="row" className={styles.person}>
                  {row.person}
                  {row.also ? (
                    <>
                      <br />
                      {row.also}
                    </>
                  ) : null}
                </th>
                {row.forms.map((form, index) => (
                  <td
                    key={index}
                    className={`${styles.form} ${table.columns ? styles.formNarrow : ""}`}
                  >
                    {form.map((part, at) => (
                      <span key={at} className={styles[part.kind]}>
                        {part.text}
                      </span>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {table.explanation ? <p className={styles.explanation}>{table.explanation}</p> : null}

        {made ? (
          <>
            <div className={styles.participle}>
              <div>
                <span className={styles.label} lang="es">
                  Participio
                </span>
                <span
                  className={`${styles.participleForm} ${made.irregular ? styles.mark : ""}`}
                  lang="es"
                >
                  {made.form}
                </span>
              </div>
              {made.irregular ? <span className={styles.tag}>irregular</span> : null}
            </div>
            {made.irregular ? (
              <p className={styles.explanation}>
                Not <em lang="es">{made.regular}</em>.
                {withHaber ? (
                  <>
                    {" "}
                    With <em lang="es">haber</em>: <em lang="es">{withHaber}</em>, I{" "}
                    {perfectVerb(entry.en[0]!, "yo")}.
                  </>
                ) : null}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </dialog>
  );
}
