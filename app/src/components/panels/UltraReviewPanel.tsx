import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ── Types ─────────────────────────────────────────────────────────────

type ReviewMode = "all" | "branch" | "pr" | "files";
type ReviewPhase = "analyzing" | "scanning" | "reporting";
type Severity = "critical" | "high" | "medium" | "low";
type FindingCategory = "bug" | "security" | "performance" | "style";

interface ReviewFinding {
  id: string;
  category: FindingCategory;
  severity: Severity;
  title: string;
  filePath: string;
  line: number;
  codeSnippet: string;
  explanation: string;
  suggestedFix: string;
  applied: boolean;
}

interface ReviewResult {
  id: string;
  startedAt: number;
  completedAt: number;
  mode: ReviewMode;
  target: string;
  findings: ReviewFinding[];
}

interface ReviewHistoryEntry {
  id: string;
  date: number;
  mode: ReviewMode;
  target: string;
  findingsCount: number;
  severityCounts: Record<Severity, number>;
}

export interface UltraReviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onStartReview: (mode: ReviewMode, target: string) => void;
  onApplyFix: (finding: ReviewFinding) => void;
  onExportReport: (result: ReviewResult) => void;
  onCancelReview: () => void;
  reviewResult: ReviewResult | null;
  isReviewing: boolean;
  reviewPhase: ReviewPhase | null;
  reviewProgress: number;
  elapsedMs: number;
}

export type {
  ReviewMode,
  ReviewPhase,
  Severity,
  FindingCategory,
  ReviewFinding,
  ReviewResult,
  ReviewHistoryEntry,
};

// ── Constants ────────────────────────────────────────────────────────

const STORAGE_KEY = "tensor-ultra-review-history";

const MODE_OPTIONS: { value: ReviewMode; label: string }[] = [
  { value: "all", label: "All Changes" },
  { value: "branch", label: "Branch" },
  { value: "pr", label: "PR #" },
  { value: "files", label: "Specific Files" },
];

const MODE_PLACEHOLDERS: Record<ReviewMode, string> = {
  all: "",
  branch: "e.g. feature/auth-refactor",
  pr: "e.g. 142",
  files: "e.g. src/api.ts, src/utils.ts",
};

const CATEGORY_LABELS: Record<FindingCategory, string> = {
  bug: "Bugs",
  security: "Security",
  performance: "Performance",
  style: "Style",
};

const CATEGORY_COLORS: Record<FindingCategory, string> = {
  bug: "#ef4444",
  security: "#f59e0b",
  performance: "#3b82f6",
  style: "#a855f7",
};

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#6a6a82",
};

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

// ── Helpers ──────────────────────────────────────────────────────────

function loadHistory(): ReviewHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: ReviewHistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - ts;

  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;

  const month = d.toLocaleString("default", { month: "short" });
  const day = d.getDate();
  const time = d.toLocaleTimeString("default", { hour: "2-digit", minute: "2-digit" });
  if (d.getFullYear() === now.getFullYear()) return `${month} ${day}, ${time}`;
  return `${month} ${day}, ${d.getFullYear()}`;
}

function phaseLabel(phase: ReviewPhase): string {
  switch (phase) {
    case "analyzing": return "Analyzing code structure...";
    case "scanning": return "Scanning for issues...";
    case "reporting": return "Generating report...";
  }
}

// ── SVG Icons ────────────────────────────────────────────────────────

const ShieldIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M10 2l6.5 3v5c0 3.5-2.7 6.5-6.5 8-3.8-1.5-6.5-4.5-6.5-8V5L10 2z"
      stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M7.5 10l2 2 3.5-4" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BugIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <ellipse cx="8" cy="9" rx="3.5" ry="4" stroke="currentColor" strokeWidth="1.2" />
    <path d="M6 5.5C6 4.1 6.9 3 8 3s2 1.1 2 2.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M4.5 7.5L2 6.5M11.5 7.5L14 6.5M4.5 10.5L2 11.5M11.5 10.5L14 11.5M8 5v8"
      stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const SecurityIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="4" y="7" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
    <path d="M6 7V5a2 2 0 014 0v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <circle cx="8" cy="10" r="1" fill="currentColor" />
  </svg>
);

const SpeedIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 14A6 6 0 108 2a6 6 0 000 12z" stroke="currentColor" strokeWidth="1.2" />
    <path d="M8 5v3l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
      strokeLinejoin="round" />
  </svg>
);

const StyleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M4 12l2-8h4l2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
      strokeLinejoin="round" />
    <path d="M5 9h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
    style={{ transform: expanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s" }}>
    <path d="M4.5 2.5l3.5 3.5-3.5 3.5" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const XIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M7 4v3l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
      strokeLinejoin="round" />
  </svg>
);

const HistoryIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M2 7a5 5 0 119.33 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M7 4.5V7l1.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
      strokeLinejoin="round" />
    <path d="M2 4v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
      strokeLinejoin="round" />
  </svg>
);

const ExportIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 2v7M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
      strokeLinejoin="round" />
    <path d="M2 10v1.5a1 1 0 001 1h8a1 1 0 001-1V10" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="round" />
  </svg>
);

const CATEGORY_ICONS: Record<FindingCategory, React.ReactNode> = {
  bug: <BugIcon />,
  security: <SecurityIcon />,
  performance: <SpeedIcon />,
  style: <StyleIcon />,
};

// ── Inline Styles ────────────────────────────────────────────────────

const S = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    display: "flex",
    justifyContent: "flex-end",
    zIndex: 9998,
    background: "rgba(0,0,0,0.6)",
    backdropFilter: "blur(3px)",
    WebkitBackdropFilter: "blur(3px)",
  },
  panel: {
    display: "flex",
    flexDirection: "column" as const,
    width: "720px",
    maxWidth: "96vw",
    height: "100vh",
    background: "var(--bg-primary, #0a0a0f)",
    borderLeft: "1px solid var(--border, #2a2a36)",
    boxShadow: "-8px 0 30px rgba(0,0,0,0.4)",
    color: "var(--text-primary, rgba(255,255,255,0.9))",
    fontFamily: 'var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 20px",
    borderBottom: "1px solid var(--border, #2a2a36)",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  headerIcon: {
    color: "var(--accent, #e84520)",
    display: "flex",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: "15px",
    fontWeight: 600,
    margin: 0,
  },
  closeBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--text-secondary, #6a6a82)",
    padding: "4px",
    display: "flex",
    alignItems: "center",
    borderRadius: "4px",
  },
  body: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "20px",
    minHeight: 0,
  },
  sectionTitle: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--text-secondary, #6a6a82)",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
    margin: "0 0 8px",
  },

  // Launch section
  modeSelector: {
    display: "flex",
    gap: "4px",
    background: "var(--bg-secondary, #12121a)",
    borderRadius: "var(--radius-md, 6px)",
    padding: "3px",
    border: "1px solid var(--border, #2a2a36)",
  },
  input: {
    width: "100%",
    padding: "8px 12px",
    fontSize: "13px",
    fontFamily: "var(--font-mono)",
    background: "var(--bg-tertiary, #1a1a24)",
    color: "var(--text-primary, #e4e4ed)",
    border: "1px solid var(--border, #2a2a36)",
    borderRadius: "var(--radius-md, 6px)",
    outline: "none",
    transition: "border-color 0.15s",
    boxSizing: "border-box" as const,
  },
  launchRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginTop: "10px",
  },
  estimatedTime: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    fontSize: "12px",
    color: "var(--text-muted, rgba(255,255,255,0.3))",
  },

  // Buttons
  btn: {
    padding: "8px 16px",
    fontSize: "12px",
    fontWeight: 500,
    borderRadius: "var(--radius-md, 6px)",
    border: "1px solid var(--border, #2a2a36)",
    background: "var(--bg-tertiary, #1a1a24)",
    color: "var(--text-primary, #e4e4ed)",
    cursor: "pointer",
    transition: "all 0.15s",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  btnPrimary: {
    padding: "8px 20px",
    fontSize: "13px",
    fontWeight: 600,
    borderRadius: "var(--radius-md, 6px)",
    border: "1px solid var(--accent, #e84520)",
    background: "var(--accent, #e84520)",
    color: "#fff",
    cursor: "pointer",
    transition: "all 0.15s",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  btnDanger: {
    padding: "8px 16px",
    fontSize: "12px",
    fontWeight: 500,
    borderRadius: "var(--radius-md, 6px)",
    border: "1px solid var(--error, #ef4444)",
    background: "var(--error-dim, rgba(239,68,68,0.12))",
    color: "var(--error-text, #f87171)",
    cursor: "pointer",
    transition: "all 0.15s",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  btnApply: {
    padding: "4px 10px",
    fontSize: "11px",
    fontWeight: 500,
    borderRadius: "var(--radius-sm, 4px)",
    border: "1px solid var(--success, #22c55e)",
    background: "var(--success-dim, rgba(34,197,94,0.12))",
    color: "var(--success-text, #4ade80)",
    cursor: "pointer",
    transition: "all 0.15s",
  },

  // Active review
  progressContainer: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
    padding: "20px",
    background: "var(--bg-secondary, #12121a)",
    borderRadius: "var(--radius-md, 6px)",
    border: "1px solid var(--border, #2a2a36)",
  },
  progressHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressStatus: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "13px",
    fontWeight: 500,
    color: "var(--text-primary)",
  },
  spinner: {
    width: "14px",
    height: "14px",
    border: "2px solid var(--border, #2a2a36)",
    borderTop: "2px solid var(--accent, #e84520)",
    borderRadius: "50%",
    animation: "ultra-spin 0.8s linear infinite",
    flexShrink: 0,
  },
  progressBarOuter: {
    width: "100%",
    height: "4px",
    background: "var(--bg-tertiary, #1a1a24)",
    borderRadius: "2px",
    overflow: "hidden" as const,
  },
  progressFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: "12px",
    color: "var(--text-secondary, #9898b0)",
  },

  // Summary cards
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "10px",
  },
  summaryCount: {
    fontSize: "24px",
    fontWeight: 700,
    lineHeight: 1,
  },
  summaryLabel: {
    fontSize: "11px",
    fontWeight: 500,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    color: "var(--text-secondary, #9898b0)",
  },
  summaryIcon: {
    display: "flex",
    alignItems: "center",
  },

  // Severity breakdown
  severityRow: {
    display: "flex",
    gap: "16px",
    padding: "10px 0",
  },
  severityItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
  },
  severityLabel: {
    color: "var(--text-secondary, #9898b0)",
    textTransform: "capitalize" as const,
  },
  severityCount: {
    fontWeight: 600,
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
  },

  // Findings
  categoryHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 0",
    cursor: "pointer",
    userSelect: "none" as const,
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  findingCard: {
    padding: "12px 14px",
    marginBottom: "6px",
    background: "var(--bg-secondary, #12121a)",
    borderRadius: "var(--radius-md, 6px)",
    border: "1px solid var(--border, #2a2a36)",
    transition: "border-color 0.15s",
  },
  findingHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    userSelect: "none" as const,
  },
  findingTitle: {
    fontSize: "13px",
    fontWeight: 500,
    color: "var(--text-primary)",
    flex: 1,
  },
  findingMeta: {
    fontSize: "11px",
    color: "var(--text-muted, rgba(255,255,255,0.3))",
    fontFamily: "var(--font-mono)",
    flexShrink: 0,
  },
  findingBody: {
    marginTop: "10px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "10px",
  },
  codeBlock: {
    padding: "10px 12px",
    background: "var(--bg-code, #0d0d14)",
    border: "1px solid var(--border, #2a2a36)",
    borderRadius: "var(--radius-sm, 4px)",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    lineHeight: 1.6,
    color: "var(--text-primary)",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    overflowX: "auto" as const,
  },
  explanation: {
    fontSize: "13px",
    lineHeight: 1.5,
    color: "var(--text-secondary, #9898b0)",
  },
  suggestedFix: {
    fontSize: "12px",
    lineHeight: 1.5,
    color: "var(--success-text, #4ade80)",
    padding: "8px 12px",
    background: "var(--success-dim, rgba(34,197,94,0.12))",
    borderRadius: "var(--radius-sm, 4px)",
    border: "1px solid rgba(34,197,94,0.15)",
    fontFamily: "var(--font-mono)",
    whiteSpace: "pre-wrap" as const,
  },
  findingActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "2px",
  },
  appliedBadge: {
    fontSize: "11px",
    color: "var(--success-text, #4ade80)",
    fontWeight: 500,
  },

  // Actions bar
  actionsBar: {
    display: "flex",
    gap: "8px",
    padding: "14px 20px",
    borderTop: "1px solid var(--border, #2a2a36)",
    flexShrink: 0,
  },
  spacer: { flex: 1 },

  // History
  historyList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px",
  },
  historyItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 12px",
    background: "var(--bg-secondary, #12121a)",
    borderRadius: "var(--radius-md, 6px)",
    border: "1px solid var(--border, #2a2a36)",
    cursor: "default",
    fontSize: "13px",
  },
  historyDate: {
    fontSize: "12px",
    color: "var(--text-muted, rgba(255,255,255,0.3))",
    fontFamily: "var(--font-mono)",
    minWidth: "80px",
    flexShrink: 0,
  },
  historyTarget: {
    flex: 1,
    color: "var(--text-primary)",
    fontWeight: 500,
    overflow: "hidden" as const,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  historySeverity: {
    display: "flex",
    gap: "8px",
    flexShrink: 0,
  },

  // Misc
  divider: {
    height: "1px",
    background: "var(--border, #2a2a36)",
    margin: "4px 0",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "8px",
    padding: "40px 20px",
    color: "var(--text-muted, rgba(255,255,255,0.3))",
  },
  emptyText: {
    fontSize: "13px",
  },
};

// ── Injected keyframes ───────────────────────────────────────────────

const KEYFRAMES_CSS = `
@keyframes ultra-spin {
  to { transform: rotate(360deg); }
}
`;

// ── Component ────────────────────────────────────────────────────────

export default function UltraReviewPanel({
  isOpen,
  onClose,
  onStartReview,
  onApplyFix,
  onExportReport,
  onCancelReview,
  reviewResult,
  isReviewing,
  reviewPhase,
  reviewProgress,
  elapsedMs,
}: UltraReviewPanelProps) {
  const [mode, setMode] = useState<ReviewMode>("all");
  const [target, setTarget] = useState("");
  const [history, setHistory] = useState<ReviewHistoryEntry[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<FindingCategory>>(
    new Set(["bug", "security", "performance", "style"]),
  );
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());

  const bodyRef = useRef<HTMLDivElement>(null);
  const keyframesInjected = useRef(false);

  // Inject keyframes once
  useEffect(() => {
    if (keyframesInjected.current) return;
    const el = document.createElement("style");
    el.textContent = KEYFRAMES_CSS;
    document.head.appendChild(el);
    keyframesInjected.current = true;
    return () => {
      document.head.removeChild(el);
      keyframesInjected.current = false;
    };
  }, []);

  // Load history on open
  useEffect(() => {
    if (isOpen) {
      setHistory(loadHistory());
    }
  }, [isOpen]);

  // Persist to history when review completes
  useEffect(() => {
    if (!reviewResult) return;

    const sevCounts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of reviewResult.findings) {
      sevCounts[f.severity]++;
    }

    const entry: ReviewHistoryEntry = {
      id: reviewResult.id,
      date: reviewResult.completedAt,
      mode: reviewResult.mode,
      target: reviewResult.target,
      findingsCount: reviewResult.findings.length,
      severityCounts: sevCounts,
    };

    const updated = [entry, ...history.filter((h) => h.id !== entry.id)].slice(0, 50);
    setHistory(updated);
    saveHistory(updated);
  }, [reviewResult]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // ── Handlers ──

  const handleStartReview = useCallback(() => {
    if (mode !== "all" && !target.trim()) return;
    onStartReview(mode, mode === "all" ? "all changes" : target.trim());
  }, [mode, target, onStartReview]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleStartReview();
      }
    },
    [handleStartReview],
  );

  const toggleCategory = useCallback((cat: FindingCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const toggleFinding = useCallback((id: string) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Derived ──

  const categorizedFindings = useMemo(() => {
    if (!reviewResult) return null;
    const grouped: Record<FindingCategory, ReviewFinding[]> = {
      bug: [], security: [], performance: [], style: [],
    };
    for (const f of reviewResult.findings) {
      grouped[f.category].push(f);
    }
    for (const cat of Object.keys(grouped) as FindingCategory[]) {
      grouped[cat].sort(
        (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
      );
    }
    return grouped;
  }, [reviewResult]);

  const severityCounts = useMemo(() => {
    if (!reviewResult) return null;
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of reviewResult.findings) counts[f.severity]++;
    return counts;
  }, [reviewResult]);

  const categoryCounts = useMemo(() => {
    if (!reviewResult) return null;
    const counts: Record<FindingCategory, number> = { bug: 0, security: 0, performance: 0, style: 0 };
    for (const f of reviewResult.findings) counts[f.category]++;
    return counts;
  }, [reviewResult]);

  // ── Render guard ──

  if (!isOpen) return null;

  // ── Dynamic style helpers ──

  const modeBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "7px 12px",
    fontSize: "12px",
    fontWeight: active ? 600 : 500,
    color: active ? "var(--accent, #e84520)" : "var(--text-secondary, #9898b0)",
    background: active ? "var(--bg-tertiary, #1a1a24)" : "transparent",
    border: "none",
    borderRadius: "var(--radius-sm, 4px)",
    cursor: "pointer",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  });

  const progressBarInner = (pct: number): React.CSSProperties => ({
    width: `${Math.min(pct, 100)}%`,
    height: "100%",
    background: "var(--accent, #e84520)",
    borderRadius: "2px",
    transition: "width 0.5s ease-out",
  });

  const summaryCardStyle = (color: string): React.CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "6px",
    padding: "14px 8px",
    background: "var(--bg-secondary, #12121a)",
    borderRadius: "var(--radius-md, 6px)",
    border: "1px solid var(--border, #2a2a36)",
    color,
  });

  const severityDotStyle = (color: string): React.CSSProperties => ({
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: color,
    flexShrink: 0,
  });

  const severityBadgeStyle = (color: string): React.CSSProperties => ({
    display: "inline-block",
    padding: "2px 6px",
    borderRadius: "3px",
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: "#fff",
    background: color,
    lineHeight: "1.4",
    flexShrink: 0,
  });

  const historyDotStyle = (color: string, count: number): React.CSSProperties => ({
    display: count > 0 ? "flex" : "none",
    alignItems: "center",
    gap: "3px",
    fontSize: "11px",
    fontFamily: "var(--font-mono)",
    color,
    fontWeight: 600,
  });

  // ── Section renderers ──

  const renderLaunchSection = () => (
    <div>
      <div style={S.sectionTitle}>Review Mode</div>
      <div style={S.modeSelector}>
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            style={modeBtnStyle(mode === opt.value)}
            onClick={() => { setMode(opt.value); setTarget(""); }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode !== "all" && (
        <div style={{ marginTop: "10px" }}>
          <input
            style={S.input}
            placeholder={MODE_PLACEHOLDERS[mode]}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={handleInputKeyDown}
            autoFocus
          />
        </div>
      )}

      <div style={S.launchRow}>
        <button
          style={{
            ...S.btnPrimary,
            ...(isReviewing || (mode !== "all" && !target.trim())
              ? { opacity: 0.4, cursor: "default" }
              : {}),
          }}
          onClick={handleStartReview}
          disabled={isReviewing || (mode !== "all" && !target.trim())}
        >
          Start Review
        </button>
        <div style={S.estimatedTime}>
          <ClockIcon />
          ~30 min estimated
        </div>
      </div>
    </div>
  );

  const renderActiveReview = () => {
    if (!isReviewing) return null;
    return (
      <div style={S.progressContainer}>
        <div style={S.progressHeader}>
          <div style={S.progressStatus}>
            <div style={S.spinner} />
            Reviewing...
          </div>
          <button style={S.btnDanger} onClick={onCancelReview}>
            Cancel
          </button>
        </div>

        <div style={S.progressBarOuter}>
          <div style={progressBarInner(reviewProgress)} />
        </div>

        <div style={S.progressFooter}>
          <span>{reviewPhase ? phaseLabel(reviewPhase) : "Starting..."}</span>
          <span>{formatElapsed(elapsedMs)} elapsed</span>
        </div>
      </div>
    );
  };

  const renderSummaryCards = () => {
    if (!categoryCounts) return null;
    const cards: { category: FindingCategory; icon: React.ReactNode }[] = [
      { category: "bug", icon: CATEGORY_ICONS.bug },
      { category: "security", icon: CATEGORY_ICONS.security },
      { category: "performance", icon: CATEGORY_ICONS.performance },
      { category: "style", icon: CATEGORY_ICONS.style },
    ];
    return (
      <div style={S.summaryGrid}>
        {cards.map(({ category, icon }) => (
          <div key={category} style={summaryCardStyle(CATEGORY_COLORS[category])}>
            <div style={S.summaryIcon}>{icon}</div>
            <div style={S.summaryCount}>{categoryCounts[category]}</div>
            <div style={S.summaryLabel}>{CATEGORY_LABELS[category]}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderSeverityBreakdown = () => {
    if (!severityCounts) return null;
    return (
      <div style={S.severityRow}>
        {SEVERITY_ORDER.map((sev) => (
          <div key={sev} style={S.severityItem}>
            <div style={severityDotStyle(SEVERITY_COLORS[sev])} />
            <span style={S.severityLabel}>{sev}</span>
            <span style={S.severityCount}>{severityCounts[sev]}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderFinding = (finding: ReviewFinding) => {
    const isExpanded = expandedFindings.has(finding.id);
    return (
      <div key={finding.id} style={S.findingCard}>
        <div style={S.findingHeader} onClick={() => toggleFinding(finding.id)}>
          <ChevronIcon expanded={isExpanded} />
          <span style={severityBadgeStyle(SEVERITY_COLORS[finding.severity])}>
            {finding.severity}
          </span>
          <span style={S.findingTitle}>{finding.title}</span>
          <span style={S.findingMeta}>
            {finding.filePath.split("/").pop()}:{finding.line}
          </span>
        </div>

        {isExpanded && (
          <div style={S.findingBody}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              {finding.filePath}:{finding.line}
            </div>

            <div style={S.codeBlock}>{finding.codeSnippet}</div>

            <div style={S.explanation}>{finding.explanation}</div>

            <div>
              <div style={{ ...S.sectionTitle, marginBottom: "4px" }}>Suggested Fix</div>
              <div style={S.suggestedFix}>{finding.suggestedFix}</div>
            </div>

            <div style={S.findingActions}>
              {finding.applied ? (
                <span style={S.appliedBadge}>Fix applied</span>
              ) : (
                <button style={S.btnApply} onClick={() => onApplyFix(finding)}>
                  Apply Fix
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderFindings = () => {
    if (!categorizedFindings) return null;
    const categories = (Object.keys(categorizedFindings) as FindingCategory[]).filter(
      (cat) => categorizedFindings[cat].length > 0,
    );

    if (categories.length === 0) {
      return (
        <div style={S.emptyState}>
          <ShieldIcon />
          <div style={S.emptyText}>No issues found. Code looks clean!</div>
        </div>
      );
    }

    return (
      <div>
        {categories.map((cat) => {
          const isExpanded = expandedCategories.has(cat);
          const findings = categorizedFindings[cat];
          return (
            <div key={cat}>
              <div style={S.categoryHeader} onClick={() => toggleCategory(cat)}>
                <ChevronIcon expanded={isExpanded} />
                <span style={{ color: CATEGORY_COLORS[cat], display: "flex", alignItems: "center" }}>
                  {CATEGORY_ICONS[cat]}
                </span>
                <span>{CATEGORY_LABELS[cat]}</span>
                <span style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-muted)",
                  marginLeft: "4px",
                }}>
                  ({findings.length})
                </span>
              </div>
              {isExpanded && findings.map((f) => renderFinding(f))}
            </div>
          );
        })}
      </div>
    );
  };

  const renderResults = () => {
    if (!reviewResult || isReviewing) return null;
    return (
      <div>
        <div style={S.sectionTitle}>Results</div>
        {renderSummaryCards()}
        {renderSeverityBreakdown()}
        <div style={S.divider} />
        <div style={S.sectionTitle}>Findings</div>
        {renderFindings()}
      </div>
    );
  };

  const renderHistory = () => {
    if (history.length === 0) return null;
    return (
      <div>
        <div style={{ ...S.sectionTitle, display: "flex", alignItems: "center", gap: "6px" }}>
          <HistoryIcon />
          Past Reviews
        </div>
        <div style={S.historyList}>
          {history.map((entry) => (
            <div key={entry.id} style={S.historyItem}>
              <span style={S.historyDate}>{formatDate(entry.date)}</span>
              <span style={S.historyTarget}>
                {entry.mode === "all" ? "All Changes" : entry.target}
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                {entry.findingsCount} issue{entry.findingsCount !== 1 ? "s" : ""}
              </span>
              <div style={S.historySeverity}>
                {SEVERITY_ORDER.map((sev) => (
                  <span key={sev} style={historyDotStyle(SEVERITY_COLORS[sev], entry.severityCounts[sev])}>
                    {entry.severityCounts[sev]}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Main render ──

  return (
    <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.panel}>
        {/* Header */}
        <div style={S.header}>
          <div style={S.headerLeft}>
            <div style={S.headerIcon}>
              <ShieldIcon />
            </div>
            <h2 style={S.headerTitle}>Deep Code Review</h2>
          </div>
          <button style={S.closeBtn} onClick={onClose}>
            <XIcon />
          </button>
        </div>

        {/* Body */}
        <div style={S.body} ref={bodyRef}>
          {renderLaunchSection()}
          {renderActiveReview()}
          {renderResults()}
          {renderHistory()}
        </div>

        {/* Actions bar */}
        {reviewResult && !isReviewing && (
          <div style={S.actionsBar}>
            <div style={S.spacer} />
            <button style={S.btn} onClick={() => onExportReport(reviewResult)}>
              <ExportIcon />
              Export Report
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
