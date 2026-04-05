import { useState, useEffect, useRef, useCallback, memo } from "react";
import type { BGTask } from "./BackgroundTaskPanel";

interface TaskDetailViewProps {
  task: BGTask;
  onBack: () => void;
  onKillTask: (id: string) => void;
  onRetryTask?: (id: string) => void;
  /** Fetch paginated output. Returns { text, totalBytes }. */
  onFetchOutput?: (taskId: string, offset: number, limit: number) => Promise<{ text: string; totalBytes: number }>;
}

const OUTPUT_PAGE_SIZE = 4096;

const STYLES = `
.tdv-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 210; animation: tdv-fade-in 0.15s ease-out; }
@keyframes tdv-fade-in { from { opacity: 0; } to { opacity: 1; } }
.tdv-panel { position: fixed; bottom: 32px; right: 16px; width: 520px; max-height: 600px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 10px; z-index: 220; display: flex; flex-direction: column; font-family: var(--font-mono); box-shadow: 0 8px 32px rgba(0,0,0,0.4); animation: tdv-pop 0.2s ease-out; }
@keyframes tdv-pop { from { transform: translateY(10px) scale(0.97); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
.tdv-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.tdv-back { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 12px; padding: 2px 6px; border-radius: 3px; font-family: var(--font-mono); display: flex; align-items: center; gap: 4px; }
.tdv-back:hover { color: var(--text-primary); background: var(--bg-hover); }
.tdv-title { font-size: 12px; font-weight: 600; color: var(--text-primary); flex: 1; margin-left: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tdv-close { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 2px; }
.tdv-close:hover { color: var(--text-primary); }
.tdv-meta { padding: 10px 14px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; }
.tdv-meta-row { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-muted); }
.tdv-meta-label { color: var(--text-secondary); font-weight: 600; min-width: 72px; }
.tdv-meta-value { color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.tdv-meta-id { font-size: 10px; color: var(--text-muted); user-select: all; }
.tdv-badge { display: inline-block; font-size: 10px; text-transform: uppercase; font-weight: 600; padding: 1px 6px; border-radius: 3px; }
.tdv-badge.running { color: var(--accent, #e84520); background: rgba(232, 69, 32, 0.1); }
.tdv-badge.completed { color: var(--success, #22c55e); background: rgba(34, 197, 94, 0.1); }
.tdv-badge.failed { color: var(--error, #ef4444); background: rgba(239, 68, 68, 0.1); }
.tdv-badge.cancelled { color: var(--text-muted); background: var(--bg-tertiary); }
.tdv-output-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 14px; border-bottom: 1px solid var(--border); }
.tdv-output-label { font-size: 11px; font-weight: 600; color: var(--text-secondary); }
.tdv-output-size { font-size: 10px; color: var(--text-muted); }
.tdv-output-actions { display: flex; gap: 4px; }
.tdv-btn { background: none; border: 1px solid var(--border); color: var(--text-muted); cursor: pointer; font-size: 10px; padding: 2px 8px; border-radius: 3px; font-family: var(--font-mono); transition: border-color 0.15s, color 0.15s; }
.tdv-btn:hover { color: var(--text-primary); border-color: var(--text-muted); }
.tdv-btn.kill { color: var(--error, #ef4444); border-color: var(--error, #ef4444); }
.tdv-btn.kill:hover { background: rgba(239, 68, 68, 0.1); }
.tdv-btn.copied { color: var(--success, #22c55e); border-color: var(--success, #22c55e); }
.tdv-output-area { flex: 1; overflow-y: auto; padding: 10px 14px; min-height: 120px; max-height: 320px; }
.tdv-output-area::-webkit-scrollbar { width: 4px; }
.tdv-output-area::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.tdv-output-pre { font-size: 11px; line-height: 1.5; color: var(--text-primary); white-space: pre-wrap; word-break: break-all; margin: 0; }
.tdv-output-empty { text-align: center; padding: 30px; color: var(--text-muted); font-size: 11px; }
.tdv-load-more { display: flex; justify-content: center; padding: 6px; }
.tdv-load-more-btn { background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-muted); cursor: pointer; font-size: 10px; padding: 3px 12px; border-radius: 3px; font-family: var(--font-mono); }
.tdv-load-more-btn:hover { color: var(--text-primary); border-color: var(--text-muted); }
.tdv-footer { display: flex; align-items: center; justify-content: flex-end; padding: 8px 14px; border-top: 1px solid var(--border); gap: 6px; }
.tdv-error { font-size: 11px; color: var(--error, #ef4444); padding: 6px 14px; border-bottom: 1px solid var(--border); background: rgba(239, 68, 68, 0.05); }
`;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatElapsed(start: number, end?: number): string {
  const ms = (end || Date.now()) - start;
  if (ms < 1000) return "just now";
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

function TaskDetailView({
  task,
  onBack,
  onKillTask,
  onRetryTask,
  onFetchOutput,
}: TaskDetailViewProps) {
  const [outputChunks, setOutputChunks] = useState<string[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [loadedBytes, setLoadedBytes] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [, setTick] = useState(0);
  const outputRef = useRef<HTMLDivElement>(null);
  const prevOutputRef = useRef<string | undefined>(undefined);

  // Tick for elapsed time updates on running tasks
  useEffect(() => {
    if (task.status !== "running") return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [task.status]);

  // Initialize output from task.output or fetch
  useEffect(() => {
    if (task.output !== undefined && task.output !== prevOutputRef.current) {
      prevOutputRef.current = task.output;
      setOutputChunks([task.output]);
      const bytes = new Blob([task.output]).size;
      setTotalBytes(bytes);
      setLoadedBytes(bytes);
    } else if (onFetchOutput && prevOutputRef.current === undefined) {
      prevOutputRef.current = "";
      onFetchOutput(task.id, 0, OUTPUT_PAGE_SIZE).then(({ text, totalBytes: tb }) => {
        setOutputChunks([text]);
        setTotalBytes(tb);
        setLoadedBytes(new Blob([text]).size);
      });
    }
  }, [task.output, task.id, onFetchOutput]);

  // Auto-scroll to bottom when output updates
  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [outputChunks, autoScroll]);

  // Detect user scroll to toggle auto-scroll
  const handleScroll = useCallback(() => {
    if (!outputRef.current) return;
    const el = outputRef.current;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    setAutoScroll(isAtBottom);
  }, []);

  // Load more (earlier output via pagination)
  const handleLoadMore = useCallback(async () => {
    if (!onFetchOutput || loadingMore) return;
    setLoadingMore(true);
    try {
      const { text, totalBytes: tb } = await onFetchOutput(task.id, loadedBytes, OUTPUT_PAGE_SIZE);
      if (text) {
        setOutputChunks(prev => [...prev, text]);
        setTotalBytes(tb);
        setLoadedBytes(prev => prev + new Blob([text]).size);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [onFetchOutput, task.id, loadedBytes, loadingMore]);

  // Copy output to clipboard
  const handleCopy = useCallback(async () => {
    const fullOutput = outputChunks.join("");
    if (!fullOutput) return;
    try {
      await navigator.clipboard.writeText(fullOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: textarea copy
      const ta = document.createElement("textarea");
      ta.value = fullOutput;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [outputChunks]);

  const fullOutput = outputChunks.join("");
  const hasMore = onFetchOutput && loadedBytes < totalBytes;
  const outputSizeDisplay = totalBytes > 0 ? `${formatBytes(loadedBytes)}${loadedBytes < totalBytes ? ` of ${formatBytes(totalBytes)}` : ""} of output` : "";

  return (
    <>
      <style>{STYLES}</style>
      <div className="tdv-overlay" onClick={onBack} />
      <div className="tdv-panel">
        {/* Header */}
        <div className="tdv-header">
          <button className="tdv-back" onClick={onBack}>
            <span>{"<"}</span> Back
          </button>
          <span className="tdv-title">{task.description}</span>
          <button className="tdv-close" onClick={onBack}>x</button>
        </div>

        {/* Metadata */}
        <div className="tdv-meta">
          <div className="tdv-meta-row">
            <span className="tdv-meta-label">ID</span>
            <span className="tdv-meta-id">{task.id}</span>
          </div>
          <div className="tdv-meta-row">
            <span className="tdv-meta-label">Type</span>
            <span className="tdv-meta-value" style={{ textTransform: "uppercase" }}>{task.type}</span>
          </div>
          <div className="tdv-meta-row">
            <span className="tdv-meta-label">Status</span>
            <span className={`tdv-badge ${task.status}`}>{task.status}</span>
          </div>
          <div className="tdv-meta-row">
            <span className="tdv-meta-label">Started</span>
            <span className="tdv-meta-value">{formatTime(task.startTime)}</span>
          </div>
          <div className="tdv-meta-row">
            <span className="tdv-meta-label">Duration</span>
            <span className="tdv-meta-value">{formatElapsed(task.startTime, task.endTime)}</span>
          </div>
          {task.progress != null && (
            <div className="tdv-meta-row">
              <span className="tdv-meta-label">Progress</span>
              <span className="tdv-meta-value">{Math.round(task.progress)}%</span>
            </div>
          )}
        </div>

        {/* Error */}
        {task.error && (
          <div className="tdv-error">{task.error}</div>
        )}

        {/* Output header */}
        <div className="tdv-output-header">
          <span className="tdv-output-label">Output</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {outputSizeDisplay && <span className="tdv-output-size">{outputSizeDisplay}</span>}
            <div className="tdv-output-actions">
              <button className={`tdv-btn ${copied ? "copied" : ""}`} onClick={handleCopy}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>

        {/* Load more (pagination for earlier content) */}
        {hasMore && (
          <div className="tdv-load-more">
            <button className="tdv-load-more-btn" onClick={handleLoadMore} disabled={loadingMore}>
              {loadingMore ? "Loading..." : "Load More"}
            </button>
          </div>
        )}

        {/* Output area */}
        <div className="tdv-output-area" ref={outputRef} onScroll={handleScroll}>
          {fullOutput ? (
            <pre className="tdv-output-pre">{fullOutput}</pre>
          ) : (
            <div className="tdv-output-empty">No output yet</div>
          )}
        </div>

        {/* Footer actions */}
        <div className="tdv-footer">
          {task.status === "running" && (
            <button className="tdv-btn kill" onClick={() => onKillTask(task.id)}>
              Stop Task
            </button>
          )}
          {task.status === "failed" && onRetryTask && (
            <button className="tdv-btn" onClick={() => onRetryTask(task.id)}>
              Retry
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export default memo(TaskDetailView);
