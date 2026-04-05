import { useState, useCallback, useMemo, type ReactNode } from "react";
import { CopyIcon, CheckIcon } from "../../icons/Icons";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SwarmWorker {
  id: string;
  name?: string;
  status: "idle" | "running" | "completed" | "failed";
  task?: string;
  progress?: number; // 0-100
}

interface SwarmMessageProps {
  /** "use" = tool_use, "result" = tool_result */
  mode: "use" | "result";
  /** The swarm action (dispatch, status, assign, etc.) */
  action?: string;
  /** Workers in the swarm */
  workers?: SwarmWorker[];
  /** Total tasks count */
  totalTasks?: number;
  /** Completed tasks count */
  completedTasks?: number;
  /** Whether currently running */
  isRunning?: boolean;
  /** Whether there was an error */
  isError?: boolean;
  /** Raw output text for fallback */
  output?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <button
      style={S.copyBtn}
      onClick={(e) => { e.stopPropagation(); handleCopy(); }}
      title="Copy"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span style={{
      ...S.badge,
      ...(color ? { background: color + "18", color, borderColor: color + "40" } : {}),
    }}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Worker status colors & icons
// ---------------------------------------------------------------------------

const WORKER_STATUS_COLORS: Record<string, string> = {
  idle: "var(--text-dim, #5c6370)",
  running: "var(--tool-bash, #22c55e)",
  completed: "var(--success, #98c379)",
  failed: "var(--error, #e06c75)",
};

const WORKER_STATUS_ICONS: Record<string, string> = {
  idle: "\u25CB",      // empty circle
  running: "\u25CF",   // filled circle (will pulse via CSS)
  completed: "\u2713", // check
  failed: "\u2717",    // x
};

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  return (
    <div style={S.progressOuter}>
      <div style={{ ...S.progressInner, width: `${pct}%` }} />
      <span style={S.progressLabel}>{completed}/{total}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SwarmMessage({
  mode, action, workers, totalTasks, completedTasks, isRunning, isError, output,
}: SwarmMessageProps) {
  const [expanded, setExpanded] = useState(true);
  const active = mode === "use" || isRunning;

  const borderColor = isError
    ? "var(--error, #e06c75)"
    : "var(--tool-agent, #f97316)";

  const workerCounts = useMemo(() => {
    if (!workers) return { running: 0, completed: 0, failed: 0, idle: 0, total: 0 };
    return {
      running: workers.filter((w) => w.status === "running").length,
      completed: workers.filter((w) => w.status === "completed").length,
      failed: workers.filter((w) => w.status === "failed").length,
      idle: workers.filter((w) => w.status === "idle").length,
      total: workers.length,
    };
  }, [workers]);

  const copyText = useMemo(() => {
    if (output) return output;
    const lines = [`Swarm: ${action || "status"}`];
    if (workers) {
      for (const w of workers) {
        lines.push(`  ${w.name || w.id}: ${w.status}${w.task ? ` - ${w.task}` : ""}`);
      }
    }
    if (totalTasks !== undefined) {
      lines.push(`Tasks: ${completedTasks ?? 0}/${totalTasks}`);
    }
    return lines.join("\n");
  }, [action, workers, totalTasks, completedTasks, output]);

  return (
    <div style={{ ...S.container, borderLeftColor: borderColor }}>
      {/* Header */}
      <div
        style={{ ...S.header, cursor: workers && workers.length > 0 ? "pointer" : "default" }}
        onClick={() => workers && workers.length > 0 && setExpanded(!expanded)}
      >
        <span style={S.headerIcon}>{"\uD83D\uDC1D"}</span>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
          Swarm{action ? `: ${action}` : ""}
        </span>

        {workerCounts.total > 0 && (
          <Badge color="var(--tool-agent, #f97316)">
            {workerCounts.total} worker{workerCounts.total !== 1 ? "s" : ""}
          </Badge>
        )}

        {workerCounts.running > 0 && (
          <Badge color="var(--tool-bash, #22c55e)">
            {workerCounts.running} active
          </Badge>
        )}

        {active && <span className="tool-item-spinner" />}
        {!active && !isError && workerCounts.total > 0 && (
          <span style={{ color: "var(--success, #98c379)", display: "inline-flex" }}><CheckIcon /></span>
        )}

        <span style={{ flex: 1 }} />
        <CopyButton text={copyText} />

        {workers && workers.length > 0 && (
          <span style={{ color: "var(--text-dim)", fontSize: 10 }}>{expanded ? "\u25BE" : "\u25B8"}</span>
        )}
      </div>

      {/* Task progress bar */}
      {totalTasks !== undefined && totalTasks > 0 && (
        <div style={S.progressRow}>
          <span style={S.progressLabel2}>Tasks:</span>
          <ProgressBar completed={completedTasks ?? 0} total={totalTasks} />
        </div>
      )}

      {/* Worker list */}
      {expanded && workers && workers.length > 0 && (
        <div style={S.workerList}>
          {workers.map((w) => {
            const color = WORKER_STATUS_COLORS[w.status] || "var(--text-dim)";
            const icon = WORKER_STATUS_ICONS[w.status] || "\u25CB";
            return (
              <div key={w.id} style={S.workerRow}>
                <span style={{ color, fontSize: 12, width: 16, textAlign: "center" as const, flexShrink: 0 }}>
                  {w.status === "running" ? (
                    <span className="tool-item-spinner" style={{ width: 10, height: 10 }} />
                  ) : icon}
                </span>
                <span style={S.workerName}>{w.name || w.id}</span>
                <Badge color={color}>{w.status}</Badge>
                {w.task && (
                  <span style={S.workerTask}>{w.task}</span>
                )}
                {w.progress !== undefined && w.status === "running" && (
                  <span style={{ ...S.workerProgress, color }}>{w.progress}%</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const S: Record<string, React.CSSProperties> = {
  container: {
    background: "var(--bg-secondary, #1e1e2e)",
    border: "1px solid var(--border, #2e2e3e)",
    borderLeft: "3px solid var(--tool-agent, #f97316)",
    borderRadius: 6,
    marginTop: 4,
    marginBottom: 4,
    overflow: "hidden",
    fontSize: 13,
    lineHeight: 1.5,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    background: "var(--bg-tertiary, rgba(255,255,255,0.02))",
    minHeight: 32,
    flexWrap: "wrap" as const,
  },
  headerIcon: {
    display: "inline-flex",
    alignItems: "center",
    marginRight: 2,
    fontSize: 14,
  },
  progressRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 10px",
    borderTop: "1px solid var(--border, #2e2e3e)",
  },
  progressLabel2: {
    fontSize: 11,
    color: "var(--text-dim, #5c6370)",
    fontWeight: 500,
    fontFamily: "var(--font-mono, 'SF Mono', Monaco, Consolas, monospace)",
  },
  progressOuter: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    background: "var(--bg-tertiary, rgba(255,255,255,0.04))",
    overflow: "hidden",
    position: "relative" as const,
    maxWidth: 200,
  },
  progressInner: {
    height: "100%",
    borderRadius: 3,
    background: "var(--success, #98c379)",
    transition: "width 0.3s ease",
  },
  progressLabel: {
    position: "absolute" as const,
    right: -40,
    top: -2,
    fontSize: 10,
    color: "var(--text-dim, #5c6370)",
    fontFamily: "var(--font-mono, 'SF Mono', Monaco, Consolas, monospace)",
    whiteSpace: "nowrap" as const,
  },
  workerList: {
    borderTop: "1px solid var(--border, #2e2e3e)",
    padding: "4px 0",
  },
  workerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "3px 10px 3px 12px",
    fontSize: 12,
  },
  workerName: {
    fontFamily: "var(--font-mono, 'SF Mono', Monaco, Consolas, monospace)",
    fontSize: 11,
    color: "var(--text-primary, #abb2bf)",
    fontWeight: 500,
    minWidth: 60,
  },
  workerTask: {
    fontSize: 11,
    color: "var(--text-secondary, #abb2bf)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    flex: 1,
    minWidth: 0,
  },
  workerProgress: {
    fontSize: 10,
    fontFamily: "var(--font-mono, 'SF Mono', Monaco, Consolas, monospace)",
    fontWeight: 500,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    fontSize: 10,
    fontWeight: 500,
    padding: "1px 6px",
    borderRadius: 4,
    border: "1px solid var(--border, #2e2e3e)",
    background: "var(--bg-tertiary, rgba(255,255,255,0.04))",
    color: "var(--text-dim, #5c6370)",
    whiteSpace: "nowrap" as const,
    lineHeight: 1.4,
  },
  copyBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    color: "var(--text-dim, #5c6370)",
    cursor: "pointer",
    padding: 2,
    borderRadius: 3,
    width: 22,
    height: 22,
    opacity: 0.6,
    transition: "opacity 0.15s",
  },
};
