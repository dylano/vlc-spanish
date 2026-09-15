import { BrowserRouter, Route, Routes } from "react-router";
import AppShell from "./app/AppShell.tsx";
import { StoreProvider } from "./app/store.tsx";
import { useStore } from "./app/store-context.ts";
import styles from "./App.module.css";
import DictionaryScreen from "./screens/DictionaryScreen.tsx";
import HomeScreen from "./screens/HomeScreen.tsx";
import QuizScreen from "./screens/QuizScreen.tsx";
import SettingsScreen from "./screens/SettingsScreen.tsx";
import WhoScreen from "./screens/WhoScreen.tsx";

/**
 * A load failure has to be visible on the name picker too, which renders outside
 * the shell — otherwise a failed fetch looks exactly like "no names added yet".
 */
function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={styles.banner} role="alert">
      <p className={styles.bannerTitle}>Could not load your words</p>
      <p className={styles.bannerBody}>{message}</p>
      <button type="button" className={styles.retry} onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/** Until a name is chosen, the picker is the whole app. */
function Gate() {
  const { ready, userId, error, reload } = useStore();
  const retry = () => {
    void reload();
  };

  if (!ready) return <p className={styles.loading}>Loading…</p>;

  if (!userId) {
    return (
      <>
        {error ? <LoadError message={error} onRetry={retry} /> : null}
        <WhoScreen />
      </>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomeScreen />} />
        <Route path="quiz" element={<QuizScreen />} />
        <Route path="dictionary" element={<DictionaryScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="*" element={<HomeScreen />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <Gate />
      </StoreProvider>
    </BrowserRouter>
  );
}
