import { useState, useEffect, useRef } from "react";

interface RateLimitMessageProps {
  message: string;
  retryAfterMs?: number;
  onRetry?: () => void;
}

export default function RateLimitMessage({ message, retryAfterMs, onRetry }: RateLimitMessageProps) {
  const [remaining, setRemaining] = useState(retryAfterMs ?? 0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!retryAfterMs || retryAfterMs <= 0) return;
    startRef.current = Date.now();
    setRemaining(retryAfterMs);
    const t = setInterval(() => {
      const left = retryAfterMs - (Date.now() - startRef.current);
      if (left <= 0) {
        setRemaining(0);
        clearInterval(t);
      } else {
        setRemaining(left);
      }
    }, 250);
    return () => clearInterval(t);
  }, [retryAfterMs]);

  const secs = Math.ceil(remaining / 1000);
  const canRetry = remaining <= 0;

  return (
    <>
      <style>{`
        .ratelimit-msg {
          padding: 12px 14px;
          margin: 4px 0;
          border-left: 3px solid var(--warning);
          background: var(--warning-dim, rgba(245, 158, 11, 0.08));
          border-radius: 0 6px 6px 0;
          font-size: 13px;
          line-height: 1.5;
        }
        .ratelimit-msg-header {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .ratelimit-msg-icon {
          font-size: 14px;
          color: var(--warning-text, var(--warning));
          flex-shrink: 0;
        }
        .ratelimit-msg-badge {
          font-size: 11px;
          padding: 1px 6px;
          border-radius: 3px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--warning-text, var(--warning));
          background: var(--warning-dim, rgba(245, 158, 11, 0.12));
          border: 1px solid rgba(245, 158, 11, 0.25);
        }
        .ratelimit-msg-text {
          color: var(--text-primary);
          flex: 1;
        }
        .ratelimit-msg-countdown {
          margin-top: 8px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ratelimit-msg-timer {
          font-family: var(--font-mono, monospace);
          font-size: 13px;
          color: var(--warning-text, var(--warning));
          font-weight: 600;
        }
        .ratelimit-msg-bar {
          flex: 1;
          height: 4px;
          background: var(--border-subtle);
          border-radius: 2px;
          overflow: hidden;
          max-width: 200px;
        }
        .ratelimit-msg-bar-fill {
          height: 100%;
          background: var(--warning);
          border-radius: 2px;
          transition: width 0.25s linear;
        }
        .ratelimit-msg-retry {
          margin-top: 8px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-primary);
          background: var(--bg-tertiary);
          border: 1px solid var(--border);
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .ratelimit-msg-retry:hover {
          background: var(--bg-hover);
          border-color: var(--border-hover);
        }
        .ratelimit-msg-retry:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .ratelimit-msg-upgrade {
          margin-top: 6px;
          font-size: 11px;
          color: var(--text-muted);
        }
      `}</style>
      <div className="ratelimit-msg animate-fade-in">
        <div className="ratelimit-msg-header">
          <span className="ratelimit-msg-icon">{"\u23F1"}</span>
          <span className="ratelimit-msg-badge">Rate Limited</span>
          <span className="ratelimit-msg-text">{message}</span>
        </div>

        {retryAfterMs != null && retryAfterMs > 0 && (
          <div className="ratelimit-msg-countdown">
            <span className="ratelimit-msg-timer">
              {canRetry ? "Ready" : `${secs}s`}
            </span>
            <div className="ratelimit-msg-bar">
              <div
                className="ratelimit-msg-bar-fill"
                style={{
                  width: retryAfterMs > 0
                    ? `${Math.max(0, (remaining / retryAfterMs) * 100)}%`
                    : "0%",
                }}
              />
            </div>
          </div>
        )}

        {onRetry && (
          <button
            className="ratelimit-msg-retry"
            onClick={onRetry}
            disabled={!canRetry}
          >
            {"\u21BB"} Retry{!canRetry ? ` in ${secs}s` : ""}
          </button>
        )}

        <div className="ratelimit-msg-upgrade">
          Consider upgrading your plan for higher rate limits.
        </div>
      </div>
    </>
  );
}
