interface CompactMessageProps {
  beforeTokens: number;
  afterTokens: number;
  messageCount: number;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function CompactMessage({ beforeTokens, afterTokens, messageCount }: CompactMessageProps) {
  const saved = beforeTokens - afterTokens;
  const pct = beforeTokens > 0 ? Math.round((saved / beforeTokens) * 100) : 0;

  return (
    <>
      <style>{`
        .compact-msg {
          padding: 8px 14px;
          margin: 4px 0;
          background: var(--bg-secondary);
          border-radius: 6px;
          font-size: 12px;
          line-height: 1.5;
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px dashed var(--border);
        }
        .compact-msg-icon {
          color: var(--text-muted);
          font-size: 14px;
          flex-shrink: 0;
        }
        .compact-msg-label {
          color: var(--text-secondary);
          font-weight: 500;
        }
        .compact-msg-stats {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-left: auto;
          flex-shrink: 0;
        }
        .compact-msg-stat {
          display: flex;
          align-items: center;
          gap: 4px;
          font-family: var(--font-mono, monospace);
          font-size: 11px;
        }
        .compact-msg-stat-label {
          color: var(--text-muted);
        }
        .compact-msg-stat-value {
          color: var(--text-secondary);
          font-weight: 500;
        }
        .compact-msg-arrow {
          color: var(--text-muted);
          font-size: 11px;
        }
        .compact-msg-saved {
          color: var(--success-text, var(--success));
          font-family: var(--font-mono, monospace);
          font-size: 11px;
          font-weight: 600;
        }
      `}</style>
      <div className="compact-msg animate-fade-in">
        <span className="compact-msg-icon">{"\u2702"}</span>
        <span className="compact-msg-label">
          Context compacted ({messageCount} message{messageCount !== 1 ? "s" : ""})
        </span>
        <div className="compact-msg-stats">
          <span className="compact-msg-stat">
            <span className="compact-msg-stat-label">before</span>
            <span className="compact-msg-stat-value">{fmtTokens(beforeTokens)}</span>
          </span>
          <span className="compact-msg-arrow">{"\u2192"}</span>
          <span className="compact-msg-stat">
            <span className="compact-msg-stat-label">after</span>
            <span className="compact-msg-stat-value">{fmtTokens(afterTokens)}</span>
          </span>
          {saved > 0 && (
            <span className="compact-msg-saved">
              -{pct}%
            </span>
          )}
        </div>
      </div>
    </>
  );
}
