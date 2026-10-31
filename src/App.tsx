import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import AppShell from "./app/AppShell.tsx";
import { StoreProvider } from "./app/store.tsx";
import { useStore } from "./app/store-context.ts";
import CustomPracticeScreen from "./screens/CustomPracticeScreen.tsx";
import DictionaryScreen from "./screens/DictionaryScreen.tsx";
import HomeScreen from "./screens/HomeScreen.tsx";
import ProblemWordsScreen from "./screens/ProblemWordsScreen.tsx";
import QuizScreen from "./screens/QuizScreen.tsx";
import SettingsScreen from "./screens/SettingsScreen.tsx";
import VersionScreen from "./screens/VersionScreen.tsx";
import WelcomeScreen from "./screens/WelcomeScreen.tsx";
import WhatsNewScreen from "./screens/WhatsNewScreen.tsx";

/** Until a name is given, the welcome screen is the whole app. */
function Gate() {
  const { name } = useStore();
  const location = useLocation();
  if (!name) return <WelcomeScreen />;

  return (
    <Routes>
      {/* Outside the shell: a session is full screen, sized to the space above
          the keyboard, with no main nav. */}
      {/* Keyed by the navigation, so "Another round" (the same URL again) builds a
          fresh session rather than reusing the finished one. */}
      <Route path="quiz" element={<QuizScreen key={location.key} />} />
      <Route element={<AppShell />}>
        <Route index element={<HomeScreen />} />
        <Route path="dictionary" element={<DictionaryScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="custom" element={<CustomPracticeScreen />} />
        <Route path="problems" element={<ProblemWordsScreen />} />
        <Route path="version" element={<VersionScreen />} />
        <Route path="whats-new" element={<WhatsNewScreen />} />
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
