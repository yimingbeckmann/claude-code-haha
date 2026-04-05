import { memo, useState, useMemo } from "react";
import "./ci-status.css";

export type CheckStatus = "passed" | "failed" | "pending" | "running";
export type PRStatus = "open" | "merged" | "closed" | "draft";

export interface CICheck {
  id: string;
  name: string;
  status: CheckStatus;
  duration?: string;
}

export interface CIStatusBarProps {
  checks: CICheck[];
  prUrl?: string;
  prStatus?: PRStatus;
  autoFix: boolean;
  onToggleAutoFix: (enabled: boolean) => void;
  autoMerge: boolean;
  onToggleAutoMerge: (enabled: boolean) => void;
  onRefresh: () => void;
  lastUpdated?: Date;
}

const CHECK_ICONS: Record<CheckStatus, string> = {
  passed: "\u2713",
  failed: "\u2717",
  pending: "\u25CB",
  running: "\u25D0",
};

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function prStatusLabel(status: PRStatus): string {
  switch (status) {
    case "open":
      return "PR open";
    case "merged":
      return "PR merged";
    case "closed":
      return "PR closed";
    case "draft":
      return "PR draft";
  }
}

function CIStatusBar({
  checks,
  prUrl,
  prStatus = "open",
  autoFix,
  onToggleAutoFix,
  autoMerge,
  onToggleAutoMerge,
  onRefresh,
  lastUpdated,
}: CIStatusBarProps) {
  const [expanded, setExpanded] = useState(false);

  const { passed, failed, total } = useMemo(() => {
    let p = 0;
    let f = 0;
    for (const c of checks) {
      if (c.status === "passed") p++;
      else if (c.status === "failed") f++;
    }
    return { passed: p, failed: f, total: checks.length };
  }, [checks]);

  const allPassed = passed === total && total > 0;
  const someFailed = failed > 0;
  const summaryClass = allPassed
    ? "all-passed"
    : someFailed
      ? "some-failed"
      : "in-progress";

  return (
    <div className="ci-status-bar">
      {/* Summary row */}
      <div
        className="ci-status-summary"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
      >
        <span className={`ci-status-chevron ${expanded ? "expanded" : ""}`}>
          {"\u25B6"}
        </span>
        <span className={`ci-status-label ${summaryClass}`}>
          {passed}/{total} checks passed
        </span>

        <span className="ci-status-spacer" />

        <span className="ci-status-meta">
          {lastUpdated && (
            <span className="ci-status-updated">
              updated {formatTimeAgo(lastUpdated)}
            </span>
          )}
          <button
            className="ci-status-refresh"
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            title="Refresh checks"
          >
            {"\u21BB"}
          </button>
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <>
          <div className="ci-status-details">
            {checks.map((check) => (
              <div key={check.id} className="ci-check-row">
                <span className={`ci-check-icon ${check.status}`}>
                  {CHECK_ICONS[check.status]}
                </span>
                <span className="ci-check-name">{check.name}</span>
                {check.duration && (
                  <span className="ci-check-duration">{check.duration}</span>
                )}
              </div>
            ))}
          </div>

          <div className="ci-status-controls">
            {/* Auto-fix toggle */}
            <label className="ci-toggle-group">
              <span className="ci-toggle-switch">
                <input
                  type="checkbox"
                  checked={autoFix}
                  onChange={(e) => onToggleAutoFix(e.target.checked)}
                />
                <span className="ci-toggle-track" />
              </span>
              Auto-fix
            </label>

            {/* Auto-merge toggle */}
            <label className="ci-toggle-group">
              <span className="ci-toggle-switch">
                <input
                  type="checkbox"
                  checked={autoMerge}
                  onChange={(e) => onToggleAutoMerge(e.target.checked)}
                />
                <span className="ci-toggle-track" />
              </span>
              Auto-merge
            </label>

            {/* PR link */}
            {prUrl && (
              <a
                className={`ci-pr-link ${prStatus}`}
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                {prStatusLabel(prStatus)}
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default memo(CIStatusBar);
