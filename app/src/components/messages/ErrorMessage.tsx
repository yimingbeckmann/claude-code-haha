import { useState, useCallback } from "react";

interface ErrorMessageProps {
  message: string;
  errorType?: "api" | "tool" | "network" | "permission" | "unknown";
  details?: string;
  onRetry?: () => void;
}

const ERROR_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  api:        { label: "API Error",        icon: "\u26A1", color: "var(--error)" },
  tool:       { label: "Tool Error",       icon: "\u2692",  color: "var(--warning)" },
  network:    { label: "Network Error",    icon: "\u29BF",  color: "var(--error)" },
  permission: { label: "Permission Error", icon: "\u26D4",  color: "var(--warning)" },
  unknown:    { label: "Error",            icon: "\u2715",  color: "var(--error)" },
};

export default function ErrorMessage({ message, errorType = "unknown", details, onRetry }: ErrorMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const config = ERROR_TYPE_CONFIG[errorType] || ERROR_TYPE_CONFIG.unknown;

  const handleCopy = useCallback(() => {
    const text = message + (details ? "\n\n" + details : "");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [message, details]);

  return (
    <>
      <style>{`
        .error-msg {
          padding: 12px 14px;
          margin: 4px 0;
          border-left: 3px solid var(--error);
          background: var(--error-dim, rgba(239, 68, 68, 0.08));
          border-radius: 0 6px 6px 0;
          font-size: 13px;
          line-height: 1.5;
        }
        .error-msg-header {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .error-msg-icon {
          font-size: 14px;
          flex-shrink: 0;
        }
        .error-msg-badge {
          font-size: 11px;
          padding: 1px 6px;
          border-radius: 3px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          border: 1px solid;
        }
        .error-msg-text {
          color: var(--text-primary);
          flex: 1;
          min-width: 0;
        }
        .error-msg-actions {
          margin-top: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .error-msg-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-primary);
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .error-msg-btn:hover {
          background: var(--bg-hover);
          border-color: var(--border-hover);
        }
        .error-msg-detail-toggle {
          background: none;
          border: none;
          padding: 0;
          font-size: 12px;
          color: var(--text-secondary);
          cursor: pointer;
          text-decoration: underline;
          text-decoration-color: var(--text-muted);
          text-underline-offset: 2px;
        }
        .error-msg-detail-toggle:hover {
          color: var(--text-primary);
        }
        .error-msg-detail {
          margin-top: 8px;
          padding: 8px 10px;
          background: var(--bg-code, var(--bg-primary));
          border-radius: 4px;
          font-family: var(--font-mono, monospace);
          font-size: 11px;
          color: var(--error-text, var(--text-secondary));
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 250px;
          overflow-y: auto;
          border: 1px solid var(--border-subtle);
          line-height: 1.5;
        }
      `}</style>
      <div className="error-msg animate-fade-in">
        <div className="error-msg-header">
          <span className="error-msg-icon" style={{ color: config.color }}>
            {config.icon}
          </span>
          <span
            className="error-msg-badge"
            style={{
              color: config.color,
              background: config.color + "18",
              borderColor: config.color + "30",
            }}
          >
            {config.label}
          </span>
          <span className="error-msg-text">{message}</span>
        </div>

        <div className="error-msg-actions">
          {onRetry && (
            <button className="error-msg-btn" onClick={onRetry}>
              {"\u21BB"} Retry
            </button>
          )}
          <button className="error-msg-btn" onClick={handleCopy}>
            {copied ? "\u2713 Copied" : "Copy"}
          </button>
          {details && (
            <button
              className="error-msg-detail-toggle"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "\u25B2 Hide details" : "\u25BC Show details"}
            </button>
          )}
        </div>

        {expanded && details && (
          <pre className="error-msg-detail">{details}</pre>
        )}
      </div>
    </>
  );
}
