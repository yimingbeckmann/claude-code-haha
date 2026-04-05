import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";

// ── Types ───────────────────────────────────────────────────

interface SessionMessage {
  type: string;
  text: string;
  timestamp: number;
}

interface Session {
  id: string;
  title: string;
  timestamp: number;
  model?: string;
  messages?: SessionMessage[];
}

export interface ConversationHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: Session[];
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onExportSession: (id: string) => void;
}

type DateRange = "today" | "week" | "month" | "all";
type SortMode = "recent" | "oldest" | "most-messages";

interface SearchIndexEntry {
  id: string;
  titleLower: string;
  contentLower: string;
  messageCount: number;
}

// ── Helpers ─────────────────────────────────────────────────

const SEARCH_INDEX_KEY = "claw-conversation-search-index";

function buildSearchIndex(sessions: Session[]): SearchIndexEntry[] {
  const entries: SearchIndexEntry[] = sessions.map((s) => ({
    id: s.id,
    titleLower: s.title.toLowerCase(),
    contentLower: (s.messages || []).map((m) => m.text).join(" ").toLowerCase(),
    messageCount: (s.messages || []).length,
  }));
  try {
    localStorage.setItem(SEARCH_INDEX_KEY, JSON.stringify(entries));
  } catch {
    // localStorage full or unavailable, ignore
  }
  return entries;
}

function loadSearchIndex(): SearchIndexEntry[] | null {
  try {
    const raw = localStorage.getItem(SEARCH_INDEX_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupt or unavailable
  }
  return null;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear()) {
    return "Yesterday";
  }
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

function isInDateRange(ts: number, range: DateRange): boolean {
  if (range === "all") return true;
  const now = new Date();
  const d = new Date(ts);
  if (range === "today") {
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }
  if (range === "week") {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return ts >= weekAgo.getTime();
  }
  if (range === "month") {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    return ts >= monthAgo.getTime();
  }
  return true;
}

function getSnippet(messages: SessionMessage[], query: string, maxLen: number = 120): string {
  if (!messages.length) return "";
  if (!query) {
    const first = messages.find((m) => m.type === "user" || m.type === "human");
    const text = first?.text || messages[0].text;
    return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
  }
  const q = query.toLowerCase();
  for (const m of messages) {
    const idx = m.text.toLowerCase().indexOf(q);
    if (idx >= 0) {
      const start = Math.max(0, idx - 40);
      const end = Math.min(m.text.length, idx + query.length + 80);
      let snippet = m.text.slice(start, end);
      if (start > 0) snippet = "..." + snippet;
      if (end < m.text.length) snippet = snippet + "...";
      return snippet;
    }
  }
  const text = messages[0].text;
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}

function extractUniqueModels(sessions: Session[]): string[] {
  const models = new Set<string>();
  for (const s of sessions) {
    if (s.model) models.add(s.model);
  }
  return Array.from(models).sort();
}

// ── Highlight Component ─────────────────────────────────────

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const q = query.toLowerCase();
  const parts: Array<{ text: string; match: boolean }> = [];
  let remaining = text;
  let lower = remaining.toLowerCase();
  let idx = lower.indexOf(q);

  while (idx >= 0) {
    if (idx > 0) parts.push({ text: remaining.slice(0, idx), match: false });
    parts.push({ text: remaining.slice(idx, idx + query.length), match: true });
    remaining = remaining.slice(idx + query.length);
    lower = remaining.toLowerCase();
    idx = lower.indexOf(q);
  }
  if (remaining) parts.push({ text: remaining, match: false });

  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          <span key={i} style={{ background: "rgba(232, 69, 32, 0.25)", color: "#e84520", borderRadius: 2, padding: "0 1px" }}>
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

// ── Icons ───────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: "var(--text-dim)", flexShrink: 0 }}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ opacity: 0.4 }}>
      <rect x="8" y="6" width="32" height="36" rx="4" stroke="var(--text-dim)" strokeWidth="2" />
      <line x1="14" y1="16" x2="34" y2="16" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="22" x2="28" y2="22" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="28" x2="31" y2="28" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="36" cy="36" r="9" fill="var(--bg-secondary)" stroke="var(--text-dim)" strokeWidth="2" />
      <line x1="33" y1="36" x2="39" y2="36" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ── Skeleton Shimmer ────────────────────────────────────────

const SHIMMER_STYLE_ID = "conversation-history-shimmer";

function ensureShimmerStyles() {
  if (document.getElementById(SHIMMER_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SHIMMER_STYLE_ID;
  style.textContent = `
    @keyframes ch-shimmer {
      0% { background-position: -200px 0; }
      100% { background-position: 200px 0; }
    }
    .ch-skeleton {
      background: linear-gradient(90deg, var(--bg-secondary) 25%, var(--border) 50%, var(--bg-secondary) 75%);
      background-size: 400px 100%;
      animation: ch-shimmer 1.5s ease-in-out infinite;
      border-radius: 4px;
    }
  `;
  document.head.appendChild(style);
}

function SkeletonRow() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px" }}>
      <div className="ch-skeleton" style={{ width: 28, height: 14, flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, gap: 6 }}>
        <div className="ch-skeleton" style={{ width: "60%", height: 13 }} />
        <div className="ch-skeleton" style={{ width: "85%", height: 11 }} />
      </div>
      <div className="ch-skeleton" style={{ width: 50, height: 12, flexShrink: 0 }} />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: "8px 0" }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

// ── Context Menu ────────────────────────────────────────────

interface ContextMenuState {
  sessionId: string;
  x: number;
  y: number;
}

function ContextMenu({
  state,
  onClose,
  onOpen,
  onExportJSON,
  onExportMarkdown,
  onDelete,
}: {
  state: ContextMenuState;
  onClose: () => void;
  onOpen: () => void;
  onExportJSON: () => void;
  onExportMarkdown: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const itemStyle: React.CSSProperties = {
    padding: "7px 14px",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--text-secondary)",
    display: "flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
  };

  const dangerStyle: React.CSSProperties = {
    ...itemStyle,
    color: "#e84520",
  };

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: state.x,
        top: state.y,
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        zIndex: 1100,
        padding: "4px 0",
        minWidth: 180,
      }}
    >
      <div
        style={itemStyle}
        onClick={onOpen}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover, rgba(255,255,255,0.05))"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        Open
      </div>
      <div
        style={itemStyle}
        onClick={onExportJSON}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover, rgba(255,255,255,0.05))"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <ExportIcon /> Export as JSON
      </div>
      <div
        style={itemStyle}
        onClick={onExportMarkdown}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover, rgba(255,255,255,0.05))"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <ExportIcon /> Export as Markdown
      </div>
      <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
      <div
        style={dangerStyle}
        onClick={onDelete}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(232, 69, 32, 0.1)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <TrashIcon /> Delete
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────

const S = {
  overlay: {
    position: "fixed" as const,
    top: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    zIndex: 1000,
    display: "flex",
    justifyContent: "flex-end",
  },
  backdrop: {
    position: "absolute" as const,
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    backdropFilter: "blur(2px)",
    WebkitBackdropFilter: "blur(2px)",
  },
  panel: {
    position: "relative" as const,
    width: 480,
    maxWidth: "90vw",
    height: "100%",
    background: "var(--bg-primary)",
    borderLeft: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column" as const,
    boxShadow: "-8px 0 32px rgba(0,0,0,0.3)",
    zIndex: 1,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 16px 12px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  headerTitle: {
    fontFamily: "var(--font-mono)",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    letterSpacing: "0.01em",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--text-dim)",
    cursor: "pointer",
    padding: 6,
    borderRadius: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  searchRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    outline: "none",
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    padding: "7px 10px",
    lineHeight: "1.4",
  },
  filterRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
    flexWrap: "wrap" as const,
  },
  filterBtn: {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    color: "var(--text-dim)",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    padding: "3px 8px",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    transition: "all 0.1s",
  },
  filterBtnActive: {
    background: "rgba(232, 69, 32, 0.15)",
    borderColor: "#e84520",
    color: "#e84520",
  },
  filterSelect: {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    color: "var(--text-dim)",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    padding: "3px 6px",
    cursor: "pointer",
    outline: "none",
  },
  results: {
    flex: 1,
    overflowY: "auto" as const,
    minHeight: 0,
  },
  resultItem: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    padding: "10px 16px",
    cursor: "pointer",
    borderBottom: "1px solid var(--border)",
    transition: "background 0.08s",
    position: "relative" as const,
  },
  resultItemSelected: {
    background: "var(--bg-hover, rgba(255,255,255,0.04))",
  },
  resultHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  resultTitle: {
    flex: 1,
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    minWidth: 0,
  },
  resultDate: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--text-dim)",
    flexShrink: 0,
  },
  resultMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  modelBadge: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--accent, #e84520)",
    background: "rgba(232, 69, 32, 0.1)",
    border: "1px solid rgba(232, 69, 32, 0.2)",
    borderRadius: 3,
    padding: "1px 5px",
    whiteSpace: "nowrap" as const,
  },
  msgCount: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--text-dim)",
  },
  snippet: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--text-dim)",
    lineHeight: "1.4",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  actionRow: {
    position: "absolute" as const,
    right: 12,
    top: 10,
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  actionBtn: {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    color: "var(--text-dim)",
    cursor: "pointer",
    padding: "3px 5px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.1s",
  },
  empty: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: "60px 16px",
    textAlign: "center" as const,
  },
  emptyTitle: {
    fontFamily: "var(--font-mono)",
    fontSize: 14,
    fontWeight: 500,
    color: "var(--text-secondary, var(--text-primary))",
  },
  emptySubtext: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--text-dim)",
    maxWidth: 260,
    lineHeight: "1.5",
  },
  statusBar: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--text-dim)",
    padding: "8px 16px",
    borderTop: "1px solid var(--border)",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  kbd: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--text-dim)",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 3,
    padding: "1px 4px",
    marginLeft: 2,
  },
};

// ── Component ───────────────────────────────────────────────

function ConversationHistory({
  isOpen,
  onClose,
  sessions,
  onSelectSession,
  onDeleteSession,
  onExportSession,
}: ConversationHistoryProps) {
  const [query, setQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [selIdx, setSelIdx] = useState(0);
  const [hovIdx, setHovIdx] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchIndex, setSearchIndex] = useState<SearchIndexEntry[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Inject shimmer animation styles
  useEffect(() => {
    ensureShimmerStyles();
  }, []);

  // Build/load search index
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);

    // Try loading cached index first for fast startup
    const cached = loadSearchIndex();
    const sessionIds = new Set(sessions.map((s) => s.id));

    if (cached && cached.length === sessions.length && cached.every((e) => sessionIds.has(e.id))) {
      setSearchIndex(cached);
      setLoading(false);
    } else {
      // Rebuild index (defer to avoid blocking render)
      requestAnimationFrame(() => {
        const idx = buildSearchIndex(sessions);
        setSearchIndex(idx);
        setLoading(false);
      });
    }
  }, [isOpen, sessions]);

  // Reset state on open
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setSelIdx(0);
    setHovIdx(null);
    setContextMenu(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  // Available models
  const availableModels = useMemo(() => extractUniqueModels(sessions), [sessions]);

  // Filtered and sorted results
  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase();

    let results = sessions.filter((s) => {
      // Date range filter
      if (!isInDateRange(s.timestamp, dateRange)) return false;
      // Model filter
      if (modelFilter !== "all" && s.model !== modelFilter) return false;
      // Text search
      if (q) {
        const idx = searchIndex.find((e) => e.id === s.id);
        if (idx) {
          if (!idx.titleLower.includes(q) && !idx.contentLower.includes(q)) return false;
        } else {
          const titleMatch = s.title.toLowerCase().includes(q);
          const contentMatch = (s.messages || []).some((m) => m.text.toLowerCase().includes(q));
          if (!titleMatch && !contentMatch) return false;
        }
      }
      return true;
    });

    // Sort
    if (sortMode === "recent") {
      results.sort((a, b) => b.timestamp - a.timestamp);
    } else if (sortMode === "oldest") {
      results.sort((a, b) => a.timestamp - b.timestamp);
    } else if (sortMode === "most-messages") {
      results.sort((a, b) => (b.messages?.length || 0) - (a.messages?.length || 0));
    }

    return results;
  }, [query, sessions, searchIndex, dateRange, modelFilter, sortMode]);

  // Reset selection when results change
  useEffect(() => { setSelIdx(0); }, [filteredSessions.length, query]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector("[data-selected='true']");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selIdx]);

  // Handle session selection
  const handleSelect = useCallback((id: string) => {
    onSelectSession(id);
    onClose();
  }, [onSelectSession, onClose]);

  // Handle export as JSON
  const handleExportJSON = useCallback((id: string) => {
    onExportSession(id);
    setContextMenu(null);
  }, [onExportSession]);

  // Handle export as Markdown (triggers same export callback -- consumer can decide format)
  const handleExportMarkdown = useCallback((id: string) => {
    onExportSession(id);
    setContextMenu(null);
  }, [onExportSession]);

  // Handle delete
  const handleDelete = useCallback((id: string) => {
    onDeleteSession(id);
    setContextMenu(null);
  }, [onDeleteSession]);

  // Context menu handler
  const handleContextMenu = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    setContextMenu({ sessionId, x: e.clientX, y: e.clientY });
  }, []);

  // Keyboard handler
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (contextMenu) {
        setContextMenu(null);
      } else {
        onClose();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelIdx((i) => Math.min(i + 1, filteredSessions.length - 1));
      setHovIdx(null);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelIdx((i) => Math.max(i - 1, 0));
      setHovIdx(null);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const session = filteredSessions[selIdx];
      if (session) handleSelect(session.id);
    }
  }, [isOpen, filteredSessions, selIdx, handleSelect, onClose, contextMenu]);

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  if (!isOpen) return null;

  const dateRanges: Array<{ key: DateRange; label: string }> = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "all", label: "All Time" },
  ];

  return (
    <div style={S.overlay}>
      <div style={S.backdrop} onClick={onClose} />
      <div style={S.panel} role="dialog" aria-label="Conversation History">

        {/* Header */}
        <div style={S.header}>
          <span style={S.headerTitle}>Conversation History</span>
          <button
            style={S.closeBtn}
            onClick={onClose}
            aria-label="Close panel"
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--bg-hover, rgba(255,255,255,0.05))"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "none"; }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Search */}
        <div style={S.searchRow}>
          <SearchIcon />
          <input
            ref={inputRef}
            style={S.searchInput}
            type="text"
            placeholder="Search conversations..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label="Search conversations"
            onFocus={(e) => { e.currentTarget.style.borderColor = "#e84520"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
          />
        </div>

        {/* Filters */}
        <div style={S.filterRow}>
          {dateRanges.map((r) => (
            <button
              key={r.key}
              style={{
                ...S.filterBtn,
                ...(dateRange === r.key ? S.filterBtnActive : {}),
              }}
              onClick={() => setDateRange(r.key)}
            >
              {r.label}
            </button>
          ))}

          <div style={{ flex: 1 }} />

          {availableModels.length > 0 && (
            <select
              style={S.filterSelect}
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              aria-label="Filter by model"
            >
              <option value="all">All Models</option>
              {availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}

          <select
            style={S.filterSelect}
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            aria-label="Sort results"
          >
            <option value="recent">Recent</option>
            <option value="oldest">Oldest</option>
            <option value="most-messages">Most Messages</option>
          </select>
        </div>

        {/* Results */}
        <div style={S.results} ref={listRef}>
          {loading ? (
            <LoadingSkeleton />
          ) : filteredSessions.length === 0 ? (
            <div style={S.empty}>
              <EmptyIcon />
              {query.trim() ? (
                <>
                  <div style={S.emptyTitle}>No matching conversations</div>
                  <div style={S.emptySubtext}>
                    No results for &ldquo;{query.trim()}&rdquo;. Try adjusting your search or filters.
                  </div>
                </>
              ) : sessions.length === 0 ? (
                <>
                  <div style={S.emptyTitle}>No conversations yet</div>
                  <div style={S.emptySubtext}>
                    Start a conversation and it will appear here for easy access.
                  </div>
                </>
              ) : (
                <>
                  <div style={S.emptyTitle}>No conversations match</div>
                  <div style={S.emptySubtext}>
                    Try changing the date range or model filter.
                  </div>
                </>
              )}
            </div>
          ) : (
            filteredSessions.map((session, i) => {
              const isSelected = selIdx === i && hovIdx === null;
              const isHovered = hovIdx === i;
              const active = isSelected || isHovered;
              const messages = session.messages || [];
              const msgCount = messages.length;
              const snippet = getSnippet(messages, query.trim());
              const q = query.trim();

              return (
                <div
                  key={session.id}
                  data-selected={active}
                  style={{
                    ...S.resultItem,
                    ...(active ? S.resultItemSelected : {}),
                  }}
                  onClick={() => handleSelect(session.id)}
                  onContextMenu={(e) => handleContextMenu(e, session.id)}
                  onMouseEnter={() => { setHovIdx(i); setSelIdx(i); }}
                  onMouseLeave={() => setHovIdx(null)}
                >
                  {/* Title row */}
                  <div style={S.resultHeader}>
                    <div style={S.resultTitle}>
                      <HighlightText text={session.title || "Untitled"} query={q} />
                    </div>
                    <span style={S.resultDate}>{formatDate(session.timestamp)}</span>
                  </div>

                  {/* Meta row */}
                  <div style={S.resultMeta}>
                    {session.model && (
                      <span style={S.modelBadge}>{session.model}</span>
                    )}
                    {msgCount > 0 && (
                      <span style={S.msgCount}>
                        {msgCount} message{msgCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {/* Snippet */}
                  {snippet && (
                    <div style={S.snippet}>
                      <HighlightText text={snippet} query={q} />
                    </div>
                  )}

                  {/* Hover actions */}
                  {active && (
                    <div style={S.actionRow}>
                      <button
                        style={S.actionBtn}
                        title="Export"
                        onClick={(e) => { e.stopPropagation(); onExportSession(session.id); }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.borderColor = "var(--text-dim)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                      >
                        <ExportIcon />
                      </button>
                      <button
                        style={S.actionBtn}
                        title="Delete"
                        onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#e84520"; e.currentTarget.style.borderColor = "#e84520"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Status bar */}
        <div style={S.statusBar}>
          <span>
            {loading ? "Loading..." : `${filteredSessions.length} conversation${filteredSessions.length !== 1 ? "s" : ""}`}
          </span>
          <span>
            <span style={S.kbd}>&uarr;</span>
            <span style={S.kbd}>&darr;</span> navigate
            {" "}
            <span style={S.kbd}>Enter</span> open
            {" "}
            <span style={S.kbd}>Esc</span> close
          </span>
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <ContextMenu
            state={contextMenu}
            onClose={() => setContextMenu(null)}
            onOpen={() => { handleSelect(contextMenu.sessionId); }}
            onExportJSON={() => handleExportJSON(contextMenu.sessionId)}
            onExportMarkdown={() => handleExportMarkdown(contextMenu.sessionId)}
            onDelete={() => handleDelete(contextMenu.sessionId)}
          />
        )}
      </div>
    </div>
  );
}

export default memo(ConversationHistory);
