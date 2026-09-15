import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Registered only in production: in dev the service worker would serve stale
// assets over the top of HMR.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  globalThis.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
