import { useState, type FormEvent } from "react";
import { useStore } from "../app/store-context.ts";
import styles from "./WelcomeScreen.module.css";

/** First start only: ask for a name, which the home screen greets. */
export default function WelcomeScreen() {
  const { setName } = useStore();
  const [name, setNameInput] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    setName(name);
  }

  return (
    <section className={styles.screen}>
      <p className={styles.label}>Spanish vocab</p>
      <h1 className={styles.title}>What is your name?</h1>
      <p className={styles.subtitle}>Your progress is kept on this device, in this browser.</p>

      <form className={styles.addRow} onSubmit={submit}>
        <label htmlFor="name" className="visually-hidden">
          Your name
        </label>
        <input
          id="name"
          className={styles.input}
          value={name}
          onChange={(event) => {
            setNameInput(event.target.value);
          }}
          placeholder="Your name"
          autoComplete="given-name"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the only thing on the screen
          autoFocus
        />
        <button type="submit" className={styles.addButton} disabled={name.trim() === ""}>
          Start
        </button>
      </form>
      <div className={styles.spacer} />
    </section>
  );
}
