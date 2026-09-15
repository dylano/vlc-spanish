import { useState, type FormEvent } from "react";
import { useStore } from "../app/store-context.ts";
import styles from "./WhoScreen.module.css";

export default function WhoScreen() {
  const { users, chooseUser, addUser } = useStore();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "" || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await addUser(trimmed);
      setName("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add that name");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.screen}>
      <h1 className={styles.title}>Who's practising?</h1>
      <p className={styles.subtitle}>Your progress is kept separately for each name.</p>

      {users.length === 0 ? (
        <p className={styles.subtitle}>No names yet — add one to get started.</p>
      ) : null}

      <div className={styles.names}>
        {users.map((user) => (
          <button
            key={user.id}
            type="button"
            className={styles.name}
            onClick={() => {
              chooseUser(user.id);
            }}
          >
            {user.displayName}
          </button>
        ))}
      </div>

      <form className={styles.addRow} onSubmit={submit}>
        <label htmlFor="new-name" className="visually-hidden">
          Add a name
        </label>
        <input
          id="new-name"
          className={styles.input}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          placeholder="Add a name"
          autoComplete="off"
        />
        <button type="submit" className={styles.addButton} disabled={busy || name.trim() === ""}>
          Add
        </button>
      </form>

      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
