import { useEffect, useRef } from "react";
import { NavLink, Outlet } from "react-router";
import styles from "./AppShell.module.css";

const TABS = [
  { to: "/", label: "Home", end: true },
  { to: "/dictionary", label: "Dictionary", end: false },
  { to: "/settings", label: "Settings", end: false },
];

export default function AppShell() {
  const shell = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);

  // The nav's height as --nav-height, so a screen can stick something just above
  // it (Custom practice's Start button). Measured rather than written down: it
  // includes the phone's safe-area inset, which only the browser knows.
  useEffect(() => {
    const bar = nav.current;
    if (!bar || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      shell.current?.style.setProperty("--nav-height", `${bar.offsetHeight}px`);
    });
    observer.observe(bar);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={shell} className={styles.shell}>
      <main className={styles.main}>
        <Outlet />
      </main>
      <nav ref={nav} className={styles.nav} aria-label="Main">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className={styles.navLink}>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
