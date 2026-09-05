import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth";
import { ErrorState, LoadingState } from "../components/QueryState";
import { shortDate } from "../lib/format";
import { api, getJSON } from "../services/api";
import type { ImportRecord } from "../types";

type ImportResult = {
  ok: boolean;
  batch_id: string;
  accounts: Record<string, Record<string, unknown>>;
  files: Array<Record<string, unknown>>;
  duplicates: number;
};

export default function ImportPage() {
  const { session } = useSession();
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const history = useQuery({
    queryKey: ["import-history"],
    queryFn: () => getJSON<{ imports: ImportRecord[] }>("/admin/import-history"),
  });
  const upload = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));
      const response = await api.post<ImportResult>("/admin/import-batch", body, { timeout: 60_000 });
      return response.data;
    },
    onSuccess: async () => {
      setFiles([]);
      if (input.current) input.current.value = "";
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["import-history"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["snapshot"] }),
        queryClient.invalidateQueries({ queryKey: ["positions"] }),
        queryClient.invalidateQueries({ queryKey: ["nav"] }),
        queryClient.invalidateQueries({ queryKey: ["trades"] }),
        queryClient.invalidateQueries({ queryKey: ["risk-profile"] }),
      ]);
    },
  });

  if (session.role !== "admin") return <ErrorState error={new Error("Administrator access is required")} />;
  if (history.isLoading) return <LoadingState label="Loading import controls" />;

  function addFiles(incoming: FileList | File[]) {
    const selected = Array.from(incoming).filter((file) => file.name.toLowerCase().endsWith(".csv"));
    setFiles((current) => {
      const unique = new Map(current.map((file) => [`${file.name}:${file.size}`, file]));
      selected.forEach((file) => unique.set(`${file.name}:${file.size}`, file));
      return [...unique.values()];
    });
  }

  return (
    <div className="page-stack">
      <section className="import-grid">
        <article className="panel">
          <div className="panel__header"><div><span className="eyebrow">Atomic import</span><h2>Update portfolio data</h2></div><span className="quality-badge">Schwab CSV</span></div>
          <p className="panel__description">
            Select positions, balance history and realized lot exports together. Barker identifies each file, validates the complete batch, and commits it as one database transaction.
          </p>
          <button
            type="button"
            className={`dropzone ${dragging ? "dropzone--active" : ""}`}
            onClick={() => input.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
          >
            <span className="dropzone__icon">CSV</span>
            <strong>Drop brokerage exports here</strong>
            <span>or select files · maximum 10 MB each</span>
          </button>
          <input ref={input} hidden multiple type="file" accept=".csv,text/csv" onChange={(event) => event.target.files && addFiles(event.target.files)} />

          <div className="file-list">
            {files.map((file) => (
              <div key={`${file.name}:${file.size}`}>
                <span className="tag">CSV</span>
                <div><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(1)} KB</small></div>
                <button className="text-button" onClick={() => setFiles((current) => current.filter((candidate) => candidate !== file))}>Remove</button>
              </div>
            ))}
          </div>
          {upload.error && <div className="notice notice--error"><strong>Import was not committed</strong><span>{upload.error.message}</span></div>}
          {upload.data && (
            <div className="notice notice--success">
              <strong>Portfolio update committed</strong>
              <span>{upload.data.files.length} files processed · {upload.data.duplicates} duplicates skipped · batch {upload.data.batch_id.slice(0, 8)}</span>
            </div>
          )}
          <div className="import-actions">
            <span>{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} ready` : "No files selected"}</span>
            <button className="button button--primary" disabled={!files.length || upload.isPending} onClick={() => upload.mutate()}>
              {upload.isPending ? "Validating and committing…" : "Import portfolio batch"}
            </button>
          </div>
        </article>

        <aside className="panel">
          <div className="panel__header"><div><span className="eyebrow">Expected exports</span><h2>Brokerage file set</h2></div></div>
          <ol className="checklist">
            <li><span>1</span><div><strong>Positions</strong><small>Current quantities, market values, cost basis and cash.</small></div></li>
            <li><span>2</span><div><strong>Balance history</strong><small>Daily account values used for NAV history.</small></div></li>
            <li><span>3</span><div><strong>Realized lot details</strong><small>Closed positions, realized P&L and holding term.</small></div></li>
          </ol>
          <div className="notice notice--neutral"><strong>Safe to repeat</strong><span>File hashes prevent duplicate imports. A failed batch leaves the previous portfolio unchanged.</span></div>
        </aside>
      </section>

      <article className="panel">
        <div className="panel__header"><div><span className="eyebrow">Operations</span><h2>Import history</h2></div><button className="button button--secondary" onClick={() => history.refetch()}>Refresh</button></div>
        {history.error && <ErrorState error={history.error} onRetry={() => history.refetch()} />}
        <div className="table-scroll">
          <table>
            <thead><tr><th>Started</th><th>Status</th><th>Actor</th><th>Source</th><th>Files</th><th>Batch</th><th>Message</th></tr></thead>
            <tbody>
              {(history.data?.imports ?? []).map((record) => (
                <tr key={record.id}>
                  <td>{shortDate(record.started_at)}</td>
                  <td><span className={`status-badge status-badge--${record.status.toLowerCase()}`}>{record.status}</span></td>
                  <td>{record.actor}</td>
                  <td>{record.source}</td>
                  <td>{record.file_count}</td>
                  <td><code>{record.id.slice(0, 8)}</code></td>
                  <td>{record.error || "Completed without data integrity errors"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
