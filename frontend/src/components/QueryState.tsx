import type { ReactNode } from "react";

export function LoadingState({ label = "Loading portfolio data" }: { label?: string }) {
  return (
    <div className="state-panel" role="status">
      <span className="spinner" />
      <div>
        <strong>{label}</strong>
        <span>Using the most recent validated portfolio records.</span>
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="state-panel state-panel--error" role="alert">
      <span className="status-dot status-dot--bad" />
      <div>
        <strong>Unable to load this view</strong>
        <span>{error.message}</span>
      </div>
      {onRetry && <button className="button button--secondary" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-state__mark">B</div>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
