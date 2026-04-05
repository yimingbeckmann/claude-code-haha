import { useState, useCallback, useMemo, memo } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type Severity = "critical" | "high" | "medium" | "low";

export interface SecurityFinding {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  filePath: string;
  codeSnippet?: string;
  language?: string;
  recommendation: string;
  line?: number;
}

export interface DependencyIssue {
  package: string;
  currentVersion: string;
  severity: Severity;
  advisory: string;
  fixVersion?: string;
}

export interface SecurityReviewData {
  findings: SecurityFinding[];
  dependencies: DependencyIssue[];
  riskScore: number; // 0-100
  scannedAt: number;
}

export interface SecurityReviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  data: SecurityReviewData | null;
  onFileClick?: (path: string, line?: number) => void;
  onRunScan?: () => void;
  onExportReport?: () => void;
  isScanning?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

const SEVERITY_COLORS: Record<Severity, { color: string; bg: string; border: string }> = {
  critical: { color: "#f87171", bg: "rgba(239,68,68,.12)", border: "rgba(239,68,68,.3)" },
  high:     { color: "#fb923c", bg: "rgba(251,146,60,.12)", border: "rgba(251,146,60,.3)" },
  medium:   { color: "#fbbf24", bg: "rgba(251,191,36,.12)", border: "rgba(251,191,36,.3)" },
  low:      { color: "#60a5fa", bg: "rgba(96,165,250,.12)", border: "rgba(96,165,250,.3)" },
};

function severityCount(findings: SecurityFinding[], sev: Severity): number {
  return findings.filter((f) => f.severity === sev).length;
}

function riskLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Critical", color: "#ef4444" };
  if (score >= 60) return { label: "High", color: "#f97316" };
  if (score >= 35) return { label: "Medium", color: "#f59e0b" };
  if (score >= 10) return { label: "Low", color: "#3b82f6" };
  return { label: "Minimal", color: "#22c55e" };
}

function formatScanTime(ts: number): string {
  if (!ts) return "Never";
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ------------------------------------------------------------------ */
/*  Styles (injected CSS)                                              */
/* ------------------------------------------------------------------ */

const CSS = `
.secrev-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.6);
  display: flex; justify-content: flex-end; z-index: 9998;
  backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
}
.secrev-panel {
  display: flex; flex-direction: column; width: 680px; max-width: 96vw;
  height: 100vh; background: var(--bg-primary, #0a0a0f);
  border-left: 1px solid var(--border, #2a2a36);
  box-shadow: -8px 0 30px rgba(0,0,0,.4);
  color: var(--text-primary, rgba(255,255,255,.9));
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  overflow: hidden; animation: secrev-slide .2s ease-out;
}
@keyframes secrev-slide {
  from { transform: translateX(100%); opacity: .8; }
  to   { transform: translateX(0); opacity: 1; }
}

/* Header */
.secrev-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-bottom: 1px solid var(--border, #2a2a36); flex-shrink: 0;
}
.secrev-header-left {
  display: flex; align-items: center; gap: 10px;
}
.secrev-header h2 { margin: 0; font-size: 15px; font-weight: 600; }
.secrev-close-btn {
  background: none; border: none; cursor: pointer; color: var(--text-secondary, #6a6a82);
  padding: 4px; display: flex; align-items: center; border-radius: 4px; transition: color .15s;
}
.secrev-close-btn:hover { color: var(--text-primary, #e4e4ed); }

/* Summary badges row */
.secrev-summary {
  display: flex; align-items: center; gap: 6px; padding: 10px 20px;
  border-bottom: 1px solid var(--border, #2a2a36); flex-shrink: 0;
  background: var(--bg-secondary, #12121a); overflow-x: auto;
}
.secrev-summary::-webkit-scrollbar { height: 0; }
.secrev-sev-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 10px; border-radius: 12px;
  font-size: 11px; font-weight: 600; font-family: var(--font-mono);
  white-space: nowrap; flex-shrink: 0;
}
.secrev-sev-badge .secrev-badge-count {
  font-variant-numeric: tabular-nums;
}

/* Filter row */
.secrev-filters {
  display: flex; align-items: center; gap: 6px; padding: 8px 20px;
  border-bottom: 1px solid var(--border, #2a2a36); flex-shrink: 0;
  flex-wrap: wrap;
}
.secrev-filters-label {
  font-size: 11px; font-weight: 500; color: var(--text-dim, #6a6a82);
  text-transform: uppercase; letter-spacing: .05em; margin-right: 4px;
}
.secrev-filter-btn {
  padding: 3px 10px; font-size: 11px; font-weight: 500;
  border-radius: 4px; border: 1px solid var(--border, #2a2a36);
  background: var(--bg-tertiary, #1a1a24); color: var(--text-secondary, #9898b0);
  cursor: pointer; transition: all .15s; font-family: var(--font-mono);
}
.secrev-filter-btn:hover { border-color: var(--border-hover, #3a3a48); }
.secrev-filter-btn.active {
  border-color: currentColor; font-weight: 600;
}

/* Body scrollable area */
.secrev-body {
  flex: 1; overflow-y: auto; padding: 0; min-height: 0;
}
.secrev-body::-webkit-scrollbar { width: 5px; }
.secrev-body::-webkit-scrollbar-track { background: transparent; }
.secrev-body::-webkit-scrollbar-thumb { background: var(--border, #2a2a36); border-radius: 3px; }

/* Collapsible section */
.secrev-section {
  border-bottom: 1px solid var(--border, #2a2a36);
}
.secrev-section-header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 20px; cursor: pointer; user-select: none;
  transition: background .08s;
}
.secrev-section-header:hover { background: var(--bg-hover, rgba(255,255,255,.05)); }
.secrev-section-chevron {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; flex-shrink: 0;
  color: var(--text-dim, #6a6a82); transition: transform .15s ease;
}
.secrev-section-chevron.expanded { transform: rotate(90deg); }
.secrev-section-title {
  font-size: 12px; font-weight: 600; text-transform: uppercase;
  letter-spacing: .05em; flex: 1;
}
.secrev-section-count {
  font-size: 11px; font-family: var(--font-mono);
  padding: 1px 8px; border-radius: 10px;
  font-variant-numeric: tabular-nums;
}
.secrev-section-body {
  overflow: hidden;
}
.secrev-section-body-enter {
  animation: secrev-expand .15s ease-out;
}
@keyframes secrev-expand {
  from { opacity: 0; max-height: 0; }
  to   { opacity: 1; max-height: 4000px; }
}

/* Finding card */
.secrev-finding {
  margin: 0 12px 8px; padding: 12px; border-radius: 8px;
  border: 1px solid var(--border, #2a2a36);
  background: var(--bg-secondary, #12121a);
  transition: border-color .15s;
}
.secrev-finding:hover { border-color: var(--border-hover, #3a3a48); }
.secrev-finding:first-child { margin-top: 4px; }
.secrev-finding:last-child { margin-bottom: 12px; }
.secrev-finding-top {
  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
}
.secrev-finding-id {
  font-size: 11px; font-weight: 600; font-family: var(--font-mono);
  padding: 2px 6px; border-radius: 3px;
}
.secrev-finding-title {
  font-size: 13px; font-weight: 600; color: var(--text-primary, #e4e4ed);
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.secrev-finding-desc {
  font-size: 12px; color: var(--text-secondary, #9898b0);
  line-height: 1.5; margin-bottom: 8px;
}
.secrev-finding-file {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-family: var(--font-mono);
  color: var(--text-link, #fb923c); cursor: pointer;
  padding: 2px 6px; border-radius: 3px; margin-bottom: 8px;
  background: var(--bg-tertiary, #1a1a24);
  transition: color .15s, background .15s;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.secrev-finding-file:hover {
  color: var(--text-link-hover, #fdba74);
  background: var(--bg-hover, rgba(255,255,255,.08));
}
.secrev-finding-code {
  background: var(--bg-code, #0d0d14); border: 1px solid var(--border, #2a2a36);
  border-radius: 6px; padding: 10px 12px; overflow-x: auto;
  font-family: var(--font-mono, "JetBrains Mono", "Fira Code", monospace);
  font-size: 12px; line-height: 1.6; color: var(--text-primary, rgba(255,255,255,.85));
  white-space: pre; margin-bottom: 8px; tab-size: 4;
}
.secrev-finding-code::-webkit-scrollbar { height: 4px; }
.secrev-finding-code::-webkit-scrollbar-track { background: transparent; }
.secrev-finding-code::-webkit-scrollbar-thumb { background: var(--border, #2a2a36); border-radius: 2px; }
.secrev-finding-rec {
  display: flex; gap: 6px; align-items: flex-start;
  font-size: 12px; color: var(--success-text, #4ade80); line-height: 1.5;
}
.secrev-finding-rec-icon {
  flex-shrink: 0; margin-top: 2px;
}

/* Dependency section */
.secrev-dep-table {
  width: 100%; border-collapse: collapse; font-size: 12px;
  font-family: var(--font-mono); margin: 4px 0 12px;
}
.secrev-dep-table th {
  text-align: left; font-size: 10px; font-weight: 700;
  color: var(--text-dim, #6a6a82); text-transform: uppercase;
  letter-spacing: .05em; padding: 6px 12px; border-bottom: 1px solid var(--border, #2a2a36);
}
.secrev-dep-table td {
  padding: 6px 12px; color: var(--text-secondary, #c0c0d0);
  border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.04));
  vertical-align: top;
}
.secrev-dep-table tr:hover td { background: var(--bg-hover, rgba(255,255,255,.03)); }
.secrev-dep-fix {
  color: var(--success-text, #4ade80); font-weight: 500;
}

/* Risk score indicator */
.secrev-risk {
  display: flex; align-items: center; gap: 12px; padding: 12px 20px;
  border-bottom: 1px solid var(--border, #2a2a36); flex-shrink: 0;
  background: var(--bg-secondary, #12121a);
}
.secrev-risk-label {
  font-size: 11px; font-weight: 700; color: var(--text-secondary, #6a6a82);
  text-transform: uppercase; letter-spacing: .05em; flex-shrink: 0;
}
.secrev-risk-bar-wrap {
  flex: 1; height: 8px; background: var(--bg-tertiary, #1a1a24);
  border-radius: 4px; overflow: hidden; position: relative;
}
.secrev-risk-bar {
  height: 100%; border-radius: 4px; transition: width .4s ease, background .4s ease;
  min-width: 2px;
}
.secrev-risk-value {
  font-size: 13px; font-weight: 700; font-family: var(--font-mono);
  font-variant-numeric: tabular-nums; flex-shrink: 0; min-width: 28px; text-align: right;
}
.secrev-risk-level {
  font-size: 11px; font-weight: 600; font-family: var(--font-mono);
  padding: 2px 8px; border-radius: 10px; flex-shrink: 0;
}

/* Action bar */
.secrev-actions {
  display: flex; gap: 8px; padding: 14px 20px;
  border-top: 1px solid var(--border, #2a2a36); flex-shrink: 0;
}
.secrev-btn {
  padding: 8px 16px; font-size: 12px; font-weight: 500;
  border-radius: var(--radius-md, 6px); border: 1px solid var(--border, #2a2a36);
  background: var(--bg-tertiary, #1a1a24); color: var(--text-primary, #e4e4ed);
  cursor: pointer; transition: all .15s; display: flex; align-items: center; gap: 6px;
  font-family: var(--font-sans);
}
.secrev-btn:hover { border-color: var(--border-hover, #3a3a48); background: var(--bg-elevated, #1e1e2a); }
.secrev-btn:disabled { opacity: .4; cursor: default; }
.secrev-btn-primary {
  background: var(--accent, #e84520); border-color: var(--accent, #e84520); color: #fff;
}
.secrev-btn-primary:hover:not(:disabled) {
  background: var(--accent-hover, #f06030); border-color: var(--accent-hover, #f06030);
}
.secrev-btn-spacer { flex: 1; }

/* Scanning spinner */
.secrev-spinner {
  width: 14px; height: 14px;
  border: 2px solid var(--border, #2a2a36);
  border-top-color: var(--accent, #e84520);
  border-radius: 50%;
  animation: secrev-spin .6s linear infinite;
  flex-shrink: 0;
}
@keyframes secrev-spin { to { transform: rotate(360deg); } }

/* Empty state */
.secrev-empty {
  padding: 60px 20px; text-align: center;
  font-size: 13px; color: var(--text-dim, #6a6a82);
}
.secrev-empty-icon {
  font-size: 36px; margin-bottom: 12px; opacity: .3;
}
.secrev-empty-sub {
  font-size: 12px; margin-top: 4px;
}

/* Scan time */
.secrev-scan-time {
  font-size: 11px; color: var(--text-dim, #6a6a82);
  font-family: var(--font-mono); padding: 6px 20px;
  border-bottom: 1px solid var(--border, #2a2a36); flex-shrink: 0;
}
`;

/* ------------------------------------------------------------------ */
/*  Inline SVG Icons                                                   */
/* ------------------------------------------------------------------ */

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5L2.5 4v4c0 3.5 2.5 5.5 5.5 6.5 3-1 5.5-3 5.5-6.5V4L8 1.5z" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 4 10 8 6 12" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V5L9 1z" />
      <polyline points="9 1 9 5 13 5" />
    </svg>
  );
}

function LightbulbIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1a5 5 0 00-2 9.58V12h4v-1.42A5 5 0 008 1z" />
      <line x1="6" y1="14" x2="10" y2="14" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 2v6l4 2" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3" />
      <polyline points="8 2 8 10" />
      <polyline points="5 7 8 10 11 7" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function SeverityBadge({ severity, count }: { severity: Severity; count?: number }) {
  const c = SEVERITY_COLORS[severity];
  return (
    <span
      className="secrev-sev-badge"
      style={{ color: c.color, background: c.bg, border: `1px solid ${c.border}` }}
    >
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
      {count !== undefined && (
        <>: <span className="secrev-badge-count">{count}</span></>
      )}
    </span>
  );
}

function FindingCard({
  finding,
  onFileClick,
}: {
  finding: SecurityFinding;
  onFileClick?: (path: string, line?: number) => void;
}) {
  const c = SEVERITY_COLORS[finding.severity];
  return (
    <div className="secrev-finding">
      <div className="secrev-finding-top">
        <span
          className="secrev-finding-id"
          style={{ color: c.color, background: c.bg }}
        >
          {finding.id}
        </span>
        <span className="secrev-finding-title">{finding.title}</span>
      </div>

      <div className="secrev-finding-desc">{finding.description}</div>

      <div
        className="secrev-finding-file"
        onClick={() => onFileClick?.(finding.filePath, finding.line)}
        title={finding.filePath + (finding.line ? `:${finding.line}` : "")}
      >
        <FileIcon />
        {finding.filePath}{finding.line ? `:${finding.line}` : ""}
      </div>

      {finding.codeSnippet && (
        <div
          className="secrev-finding-code"
          dangerouslySetInnerHTML={{ __html: escapeHtml(finding.codeSnippet) }}
        />
      )}

      <div className="secrev-finding-rec">
        <span className="secrev-finding-rec-icon"><LightbulbIcon /></span>
        <span>{finding.recommendation}</span>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  severity,
  defaultExpanded,
  children,
}: {
  title: string;
  count: number;
  severity?: Severity;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? true);
  const colors = severity ? SEVERITY_COLORS[severity] : null;

  return (
    <div className="secrev-section">
      <div className="secrev-section-header" onClick={() => setExpanded((v) => !v)}>
        <span className={`secrev-section-chevron ${expanded ? "expanded" : ""}`}>
          <ChevronIcon />
        </span>
        <span
          className="secrev-section-title"
          style={colors ? { color: colors.color } : { color: "var(--text-secondary)" }}
        >
          {title}
        </span>
        <span
          className="secrev-section-count"
          style={
            colors
              ? { color: colors.color, background: colors.bg }
              : { color: "var(--text-secondary)", background: "var(--bg-badge, rgba(255,255,255,.06))" }
          }
        >
          {count}
        </span>
      </div>
      {expanded && (
        <div className={`secrev-section-body ${expanded ? "secrev-section-body-enter" : ""}`}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

function SecurityReviewPanel({
  isOpen,
  onClose,
  data,
  onFileClick,
  onRunScan,
  onExportReport,
  isScanning,
}: SecurityReviewPanelProps) {
  const [activeFilters, setActiveFilters] = useState<Set<Severity>>(
    new Set(SEVERITY_ORDER),
  );

  const toggleFilter = useCallback((sev: Severity) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) {
        next.delete(sev);
      } else {
        next.add(sev);
      }
      return next;
    });
  }, []);

  // Group findings by severity, applying active filters
  const grouped = useMemo(() => {
    if (!data) return {};
    const result: Partial<Record<Severity, SecurityFinding[]>> = {};
    for (const sev of SEVERITY_ORDER) {
      if (!activeFilters.has(sev)) continue;
      const items = data.findings.filter((f) => f.severity === sev);
      if (items.length > 0) {
        result[sev] = items;
      }
    }
    return result;
  }, [data, activeFilters]);

  const filteredCount = useMemo(() => {
    return Object.values(grouped).reduce((sum, arr) => sum + (arr?.length || 0), 0);
  }, [grouped]);

  if (!isOpen) return null;

  const risk = data ? riskLabel(data.riskScore) : null;

  return (
    <>
      <style>{CSS}</style>
      <div className="secrev-overlay" onClick={onClose}>
        <div className="secrev-panel" onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div className="secrev-header">
            <div className="secrev-header-left">
              <ShieldIcon />
              <h2>Security Review</h2>
            </div>
            <button className="secrev-close-btn" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          {data ? (
            <>
              {/* Severity summary badges */}
              <div className="secrev-summary">
                {SEVERITY_ORDER.map((sev) => (
                  <SeverityBadge
                    key={sev}
                    severity={sev}
                    count={severityCount(data.findings, sev)}
                  />
                ))}
              </div>

              {/* Overall risk score */}
              <div className="secrev-risk">
                <span className="secrev-risk-label">Risk Score</span>
                <div className="secrev-risk-bar-wrap">
                  <div
                    className="secrev-risk-bar"
                    style={{
                      width: `${Math.min(data.riskScore, 100)}%`,
                      background: risk!.color,
                    }}
                  />
                </div>
                <span className="secrev-risk-value" style={{ color: risk!.color }}>
                  {data.riskScore}
                </span>
                <span
                  className="secrev-risk-level"
                  style={{
                    color: risk!.color,
                    background: `${risk!.color}18`,
                  }}
                >
                  {risk!.label}
                </span>
              </div>

              {/* Last scan time */}
              <div className="secrev-scan-time">
                Last scan: {formatScanTime(data.scannedAt)}
              </div>

              {/* Severity filter buttons */}
              <div className="secrev-filters">
                <span className="secrev-filters-label">Filter</span>
                {SEVERITY_ORDER.map((sev) => {
                  const c = SEVERITY_COLORS[sev];
                  const isActive = activeFilters.has(sev);
                  return (
                    <button
                      key={sev}
                      className={`secrev-filter-btn ${isActive ? "active" : ""}`}
                      style={isActive ? { color: c.color, borderColor: c.border } : undefined}
                      onClick={() => toggleFilter(sev)}
                    >
                      {sev.charAt(0).toUpperCase() + sev.slice(1)} ({severityCount(data.findings, sev)})
                    </button>
                  );
                })}
              </div>

              {/* Scrollable body */}
              <div className="secrev-body">

                {/* Findings by severity */}
                {SEVERITY_ORDER.map((sev) => {
                  const items = grouped[sev];
                  if (!items || items.length === 0) return null;
                  return (
                    <CollapsibleSection
                      key={sev}
                      title={`${sev.charAt(0).toUpperCase() + sev.slice(1)} Findings`}
                      count={items.length}
                      severity={sev}
                      defaultExpanded={sev === "critical" || sev === "high"}
                    >
                      {items.map((f) => (
                        <FindingCard key={f.id} finding={f} onFileClick={onFileClick} />
                      ))}
                    </CollapsibleSection>
                  );
                })}

                {filteredCount === 0 && data.findings.length > 0 && (
                  <div className="secrev-empty">
                    <div className="secrev-empty-sub">No findings match the active filters.</div>
                  </div>
                )}

                {data.findings.length === 0 && (
                  <div className="secrev-empty">
                    <div className="secrev-empty-icon">&#x2705;</div>
                    <div>No security findings detected</div>
                    <div className="secrev-empty-sub">Your code passed all checks</div>
                  </div>
                )}

                {/* Dependency review section */}
                {data.dependencies.length > 0 && (
                  <CollapsibleSection
                    title="Dependency Vulnerabilities"
                    count={data.dependencies.length}
                    defaultExpanded={true}
                  >
                    <div style={{ padding: "0 12px" }}>
                      <table className="secrev-dep-table">
                        <thead>
                          <tr>
                            <th>Package</th>
                            <th>Version</th>
                            <th>Severity</th>
                            <th>Advisory</th>
                            <th>Fix</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.dependencies.map((dep, i) => {
                            const dc = SEVERITY_COLORS[dep.severity];
                            return (
                              <tr key={`${dep.package}-${i}`}>
                                <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                                  {dep.package}
                                </td>
                                <td>{dep.currentVersion}</td>
                                <td>
                                  <span
                                    style={{
                                      color: dc.color,
                                      background: dc.bg,
                                      padding: "1px 6px",
                                      borderRadius: 3,
                                      fontSize: 10,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {dep.severity.toUpperCase()}
                                  </span>
                                </td>
                                <td style={{ maxWidth: 200, lineHeight: 1.4 }}>{dep.advisory}</td>
                                <td>
                                  {dep.fixVersion ? (
                                    <span className="secrev-dep-fix">{dep.fixVersion}</span>
                                  ) : (
                                    <span style={{ color: "var(--text-dim)" }}>-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CollapsibleSection>
                )}
              </div>
            </>
          ) : (
            /* Empty / no-data state */
            <div className="secrev-body" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isScanning ? (
                <div className="secrev-empty">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
                    <span className="secrev-spinner" />
                    <span style={{ fontSize: 13 }}>Scanning...</span>
                  </div>
                  <div className="secrev-empty-sub">Analyzing code for security issues</div>
                </div>
              ) : (
                <div className="secrev-empty">
                  <div className="secrev-empty-icon">
                    <ShieldIcon />
                  </div>
                  <div>No scan results yet</div>
                  <div className="secrev-empty-sub">Run a security scan to check your codebase</div>
                </div>
              )}
            </div>
          )}

          {/* Action bar */}
          <div className="secrev-actions">
            <button
              className="secrev-btn secrev-btn-primary"
              onClick={onRunScan}
              disabled={isScanning}
            >
              {isScanning ? (
                <><span className="secrev-spinner" style={{ borderTopColor: "#fff" }} /> Scanning...</>
              ) : (
                <><ScanIcon /> Run New Scan</>
              )}
            </button>
            <button
              className="secrev-btn"
              onClick={onExportReport}
              disabled={!data || isScanning}
            >
              <ExportIcon /> Export Report
            </button>
            <div className="secrev-btn-spacer" />
            <button className="secrev-btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </>
  );
}

export default memo(SecurityReviewPanel);
