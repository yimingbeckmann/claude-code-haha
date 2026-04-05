import { useState } from "react";

interface AgentMessageProps {
  agentName: string;
  description: string;
  status: "spawned" | "running" | "completed" | "failed";
  output?: string;
  durationMs?: number;
  depth?: number;
}

const STATUS_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  spawned:   { icon: "\u25CB", color: "var(--text-secondary)", label: "Spawned" },
  running:   { icon: "\u25CF", color: "var(--accent)",         label: "Running" },
  completed: { icon: "\u2713", color: "var(--success)",        label: "Completed" },
  failed:    { icon: "\u2715", color: "var(--error)",          label: "Failed" },
};

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
}

export default function AgentMessage({
  agentName,
  description,
  status,
  output,
  durationMs,
  depth = 0,
}: AgentMessageProps) {
  const [expanded, setExpanded] = useState(false);

  const config = STATUS_CONFIG[status];
  const indentPx = depth * 20;

  return (
    <>
      <style>{`
        .agent-msg {
          padding: 10px 14px;
          margin: 4px 0;
          border-left: 3px solid var(--tool-agent, var(--purple));
          background: var(--bg-secondary);
          border-radius: 0 6px 6px 0;
          font-size: 13px;
          line-height: 1.5;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .agent-msg:hover {
          background: var(--bg-tertiary);
        }
        .agent-msg-header {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .agent-msg-icon {
          font-size: 12px;
          flex-shrink: 0;
        }
        .agent-msg-name {
          font-weight: 600;
          color: var(--text-primary);
          font-family: var(--font-mono, monospace);
          font-size: 12px;
          padding: 1px 6px;
          background: var(--purple-dim, rgba(168, 85, 247, 0.12));
          border: 1px solid rgba(168, 85, 247, 0.25);
          border-radius: 4px;
        }
        .agent-msg-desc {
          color: var(--text-secondary);
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .agent-msg-badge {
          font-size: 11px;
          padding: 1px 6px;
          border-radius: 3px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .agent-msg-dur {
          color: var(--text-muted);
          font-size: 11px;
          font-family: var(--font-mono, monospace);
          margin-left: auto;
          flex-shrink: 0;
        }
        .agent-msg-output {
          margin-top: 8px;
          padding: 8px 10px;
          background: var(--bg-code, var(--bg-primary));
          border-radius: 4px;
          font-family: var(--font-mono, monospace);
          font-size: 12px;
          color: var(--text-secondary);
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 300px;
          overflow-y: auto;
          border: 1px solid var(--border-subtle);
        }
        .agent-msg-caret {
          color: var(--text-muted);
          font-size: 11px;
          flex-shrink: 0;
        }
        @keyframes agent-pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        .agent-running-pulse {
          animation: agent-pulse 1.5s ease-in-out infinite;
        }
      `}</style>
      <div
        className={`agent-msg animate-fade-in${status === "running" ? " agent-running-pulse" : ""}`}
        style={{ marginLeft: indentPx }}
        onClick={() => output && setExpanded(!expanded)}
      >
        <div className="agent-msg-header">
          <span className="agent-msg-icon" style={{ color: config.color }}>
            {config.icon}
          </span>
          <span className="agent-msg-name">{agentName}</span>
          <span className="agent-msg-desc">{description}</span>
          <span
            className="agent-msg-badge"
            style={{
              color: config.color,
              background: config.color + "18",
              border: `1px solid ${config.color}30`,
            }}
          >
            {config.label}
          </span>
          {durationMs != null && durationMs > 0 && (
            <span className="agent-msg-dur">{fmtDuration(durationMs)}</span>
          )}
          {output && (
            <span className="agent-msg-caret">{expanded ? "\u25BE" : "\u25B8"}</span>
          )}
        </div>
        {expanded && output && (
          <div className="agent-msg-output" onClick={(e) => e.stopPropagation()}>
            {output}
          </div>
        )}
      </div>
    </>
  );
}
