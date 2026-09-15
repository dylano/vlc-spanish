import { NavLink, Outlet } from "react-router";
import styles from "./AppShell.module.css";
import { useStore } from "./store-context.ts";

const TABS = [
  { to: "/", label: "Home", end: true },
  { to: "/dictionary", label: "Dictionary", end: false },
  { to: "/settings", label: "Settings", end: false },
];

export default function AppShell() {
  const { error } = useStore();

  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        {error ? <p className={styles.error}>{error}</p> : null}
        <Outlet />
      </main>
      <nav className={styles.nav} aria-label="Main">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className={styles.navLink}>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
