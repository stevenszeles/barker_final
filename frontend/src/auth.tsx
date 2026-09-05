import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./services/api";
import type { Session } from "./types";
import { LoadingState } from "./components/QueryState";

type SessionContextValue = {
  session: Session;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function Login({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await api.post<Session>("/session/login", { password });
      onSuccess(response.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login">
      <section className="login__panel">
        <div className="brand brand--login">
          <span className="brand__mark">B</span>
          <div><strong>Barker</strong><span>Investment workstation</span></div>
        </div>
        <div className="login__copy">
          <span className="eyebrow">Protected workspace</span>
          <h1>Portfolio intelligence for the whole investment team.</h1>
          <p>Sign in to view the current book, performance, exposure and validated import history.</p>
        </div>
        <form onSubmit={submit} className="login__form">
          <input
            className="sr-only"
            type="text"
            name="username"
            autoComplete="username"
            value="barker-workstation"
            readOnly
            tabIndex={-1}
            aria-hidden="true"
          />
          <label className="field">
            <span>Workspace password</span>
            <input
              autoFocus
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="button button--primary" disabled={submitting || !password}>
            {submitting ? "Signing in…" : "Open workstation"}
          </button>
        </form>
      </section>
      <aside className="login__aside">
        <div className="login__grid" />
        <div className="login__quote">
          <span>ONE SOURCE OF TRUTH</span>
          <strong>Positions. Performance. Risk. Reconciliation.</strong>
        </div>
      </aside>
    </main>
  );
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  async function refresh() {
    const response = await api.get<Session>("/session");
    setSession(response.data);
  }

  async function logout() {
    await api.post("/session/logout");
    setSession((current) => ({
      authenticated: false,
      auth_enabled: current?.auth_enabled ?? true,
      role: null,
      subject: null,
    }));
  }

  useEffect(() => {
    refresh().catch(() => {
      setSession({ authenticated: false, auth_enabled: true, role: null, subject: null });
    });
    const unauthorized = () => {
      setSession((current) => ({
        authenticated: false,
        auth_enabled: current?.auth_enabled ?? true,
        role: null,
        subject: null,
      }));
    };
    window.addEventListener("barker:unauthorized", unauthorized);
    return () => window.removeEventListener("barker:unauthorized", unauthorized);
  }, []);

  if (!session) return <LoadingState label="Opening secure workspace" />;
  if (!session.authenticated) return <Login onSuccess={setSession} />;

  return <SessionContext.Provider value={{ session, refresh, logout }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider is missing");
  return value;
}
