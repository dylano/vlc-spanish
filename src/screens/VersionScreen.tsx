import { useEffect, useState } from "react";
import { Link } from "react-router";
import { fetchCommits, REPO, type Commit } from "../lib/commits.ts";
import styles from "./VersionScreen.module.css";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

/**
 * What this build is, and what went into the ones around it. The messages come
 * from GitHub when the screen opens; offline, the build's own commit is still
 * shown, since that is baked in.
 */
export default function VersionScreen() {
  const [commits, setCommits] = useState<Commit[]>();
  const [failed, setFailed] = useState(false);
  const running = __COMMIT__.split(" ")[0]!;

  useEffect(() => {
    const abort = new AbortController();
    fetchCommits(10, abort.signal)
      .then(setCommits)
      .catch((error: unknown) => {
        if (!abort.signal.aborted) setFailed(true);
        return error;
      });
    return () => {
      abort.abort();
    };
  }, []);

  return (
    <section className={styles.screen}>
      <Link to="/settings" className={styles.back}>
        <svg className={styles.backChevron} viewBox="0 0 20 20" aria-hidden="true">
          <path d="M13 4l-6 6 6 6" />
        </svg>
        Settings
      </Link>
      <h1 className={styles.title}>Version</h1>
      <p className={styles.running}>
        This build is <span className={styles.hash}>{__COMMIT__}</span>
      </p>

      {failed ? (
        <p className={styles.note}>
          The commit messages come from GitHub, which cannot be reached right now. The build above
          is still what you are running.
        </p>
      ) : commits === undefined ? (
        <p className={styles.note}>Reading {REPO}…</p>
      ) : commits.length === 0 ? (
        <p className={styles.note}>GitHub returned nothing for {REPO}.</p>
      ) : (
        <ul className={styles.list}>
          {commits.map((commit) => (
            <li
              key={commit.hash}
              className={`${styles.row} ${commit.hash === running ? styles.current : ""}`}
            >
              <p className={styles.subject}>{commit.subject}</p>
              <p className={styles.meta}>
                <span className={styles.hash}>{commit.hash}</span>
                {commit.date ? (
                  <span>{new Intl.DateTimeFormat(undefined, DATE_FORMAT).format(commit.date)}</span>
                ) : null}
                {commit.hash === running ? <span className={styles.badge}>this build</span> : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
