interface MemoryMessageProps {
  action: "saved" | "read" | "updated" | "deleted";
  fileName: string;
  content?: string;
}

const ACTION_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  saved:   { icon: "\uD83D\uDCBE", color: "var(--success)",    label: "Saved" },
  read:    { icon: "\uD83D\uDCD6", color: "var(--info)",       label: "Read" },
  updated: { icon: "\u270F\uFE0F",  color: "var(--success)",    label: "Updated" },
  deleted: { icon: "\uD83D\uDDD1\uFE0F",  color: "var(--error)",     label: "Deleted" },
};

export default function MemoryMessage({ action, fileName, content }: MemoryMessageProps) {
  const config = ACTION_CONFIG[action];

  return (
    <>
      <style>{`
        .memory-msg {
          padding: 8px 14px;
          margin: 4px 0;
          border-left: 3px solid var(--success);
          background: var(--bg-secondary);
          border-radius: 0 6px 6px 0;
          font-size: 13px;
          line-height: 1.5;
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }
        .memory-msg--read {
          border-left-color: var(--info);
        }
        .memory-msg--deleted {
          border-left-color: var(--error);
        }
        .memory-msg-icon {
          flex-shrink: 0;
          font-size: 13px;
        }
        .memory-msg-body {
          flex: 1;
          min-width: 0;
        }
        .memory-msg-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .memory-msg-badge {
          font-size: 11px;
          padding: 1px 6px;
          border-radius: 3px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .memory-msg-file {
          font-family: var(--font-mono, monospace);
          font-size: 12px;
          color: var(--text-primary);
          font-weight: 500;
        }
        .memory-msg-preview {
          margin-top: 6px;
          padding: 6px 10px;
          background: var(--bg-code, var(--bg-primary));
          border-radius: 4px;
          font-family: var(--font-mono, monospace);
          font-size: 12px;
          color: var(--text-secondary);
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 120px;
          overflow-y: auto;
          border: 1px solid var(--border-subtle);
        }
      `}</style>
      <div
        className={`memory-msg animate-fade-in${action === "read" ? " memory-msg--read" : ""}${action === "deleted" ? " memory-msg--deleted" : ""}`}
      >
        <span className="memory-msg-icon">{config.icon}</span>
        <div className="memory-msg-body">
          <div className="memory-msg-header">
            <span
              className="memory-msg-badge"
              style={{
                color: config.color,
                background: config.color + "18",
                border: `1px solid ${config.color}30`,
              }}
            >
              {config.label}
            </span>
            <span className="memory-msg-file">{fileName}</span>
          </div>
          {content && (
            <div className="memory-msg-preview">
              {content.length > 300 ? content.slice(0, 300) + "\u2026" : content}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
