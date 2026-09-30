import { useState, type FormEvent } from "react";
import { useStore } from "../app/store-context.ts";
import styles from "./WelcomeScreen.module.css";

/**
 * First start only: ask for a name, which the home screen greets. The asking is
 * in Spanish — the first words of the app are a phrase the class teaches — while
 * the line about where progress is kept stays in English, since it is not
 * practice.
 */
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
      <h1 className={styles.title} lang="es">
        ¿Cómo te llamas?
      </h1>
      <p className={styles.subtitle}>Your progress is kept on this device, in this browser.</p>

      <form className={styles.addRow} onSubmit={submit}>
        <label htmlFor="name" className="visually-hidden" lang="es">
          Tu nombre
        </label>
        <input
          id="name"
          className={styles.input}
          value={name}
          onChange={(event) => {
            setNameInput(event.target.value);
          }}
          placeholder="Tu nombre"
          lang="es"
          autoComplete="given-name"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the only thing on the screen
          autoFocus
        />
        <button type="submit" className={styles.addButton} disabled={name.trim() === ""} lang="es">
          Empezar
        </button>
      </form>
      <div className={styles.spacer} />
    </section>
  );
}
