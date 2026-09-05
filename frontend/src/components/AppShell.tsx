import type { ReactNode } from "react";
import { useSession } from "../auth";

const navigation = [
  { to: "/", label: "Overview", code: "OV" },
  { to: "/holdings", label: "Holdings", code: "HD" },
  { to: "/performance", label: "Performance", code: "PF" },
  { to: "/activity", label: "Activity", code: "AC" },
  { to: "/risk", label: "Risk", code: "RK" },
  { to: "/imports", label: "Import & Admin", code: "IA", admin: true },
];

const titles: Record<string, { title: string; detail: string }> = {
  "/": { title: "Portfolio overview", detail: "Current book, liquidity and performance" },
  "/holdings": { title: "Holdings", detail: "Position-level exposure and attribution" },
  "/performance": { title: "Performance", detail: "NAV, benchmark and account comparison" },
  "/activity": { title: "Activity", detail: "Realized lots and recorded transactions" },
  "/risk": { title: "Risk", detail: "Exposure, concentration and return diagnostics" },
  "/imports": { title: "Import & administration", detail: "Atomic brokerage updates and operational history" },
};

export function AppShell({ path, children }: { path: string; children: ReactNode }) {
  const { session, logout } = useSession();
  const heading = titles[path] ?? titles["/"];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__mark">B</span>
          <div><strong>Barker</strong><span>Investment workstation</span></div>
        </div>
        <nav className="nav" aria-label="Primary">
          {navigation
            .filter((item) => !item.admin || session.role === "admin")
            .map((item) => (
              <a
                key={item.to}
                href={`#${item.to}`}
                className={`nav__item ${path === item.to ? "nav__item--active" : ""}`}
              >
                <span>{item.code}</span>
                {item.label}
              </a>
            ))}
        </nav>
        <div className="sidebar__footer">
          <div className="connection"><span className="status-dot status-dot--good" />Protected · {session.role}</div>
          <button className="text-button" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div><h1>{heading.title}</h1><p>{heading.detail}</p></div>
          <div className="topbar__status">
            <span className="market-pill"><span className="status-dot status-dot--good" />System online</span>
            <span>{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          </div>
        </header>
        <main className="content">{children}</main>
      </section>
    </div>
  );
}
