import { BrowserRouter, Route, Routes } from "react-router";
import AppShell from "./app/AppShell.tsx";
import { StoreProvider } from "./app/store.tsx";
import { useStore } from "./app/store-context.ts";
import DictionaryScreen from "./screens/DictionaryScreen.tsx";
import HomeScreen from "./screens/HomeScreen.tsx";
import ProblemWordsScreen from "./screens/ProblemWordsScreen.tsx";
import QuizScreen from "./screens/QuizScreen.tsx";
import SettingsScreen from "./screens/SettingsScreen.tsx";
import WelcomeScreen from "./screens/WelcomeScreen.tsx";

/** Until a name is given, the welcome screen is the whole app. */
function Gate() {
  const { name } = useStore();
  if (!name) return <WelcomeScreen />;

  return (
    <Routes>
      {/* Outside the shell: a session is full screen, sized to the space above
          the keyboard, with no main nav. */}
      <Route path="quiz" element={<QuizScreen />} />
      <Route element={<AppShell />}>
        <Route index element={<HomeScreen />} />
        <Route path="dictionary" element={<DictionaryScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="problems" element={<ProblemWordsScreen />} />
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
