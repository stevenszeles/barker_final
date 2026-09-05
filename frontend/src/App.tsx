import { lazy, Suspense, useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { LoadingState } from "./components/QueryState";
import { useSession } from "./auth";

const OverviewPage = lazy(() => import("./pages/OverviewPage"));
const HoldingsPage = lazy(() => import("./pages/HoldingsPage"));
const PerformancePage = lazy(() => import("./pages/PerformancePage"));
const ActivityPage = lazy(() => import("./pages/ActivityPage"));
const RiskPage = lazy(() => import("./pages/RiskPage"));
const ImportPage = lazy(() => import("./pages/ImportPage"));

const pages = {
  "/": OverviewPage,
  "/holdings": HoldingsPage,
  "/performance": PerformancePage,
  "/activity": ActivityPage,
  "/risk": RiskPage,
  "/imports": ImportPage,
} as const;

type RoutePath = keyof typeof pages;

function currentPath(): string {
  const value = window.location.hash.replace(/^#/, "").split("?")[0];
  return value.startsWith("/") ? value : "/";
}

export default function App() {
  const [path, setPath] = useState(currentPath);
  const { session } = useSession();

  useEffect(() => {
    const handleHashChange = () => {
      const nextPath = currentPath();
      if (!(nextPath in pages) || (nextPath === "/imports" && session.role !== "admin")) {
        window.history.replaceState(null, "", `${window.location.pathname}#/`);
        setPath("/");
        return;
      }
      setPath(nextPath);
    };
    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [session.role]);

  const permittedPath = path === "/imports" && session.role !== "admin" ? "/" : path;
  const CurrentPage = pages[permittedPath as RoutePath] ?? OverviewPage;

  return (
    <Suspense fallback={<LoadingState label="Loading workstation module" />}>
      <AppShell path={permittedPath}>
        <CurrentPage />
      </AppShell>
    </Suspense>
  );
}
