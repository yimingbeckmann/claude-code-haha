import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";

// ── Types ───────────────────────────────────────────────────

export interface SearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: Array<{
    id: string;
    title: string;
    messages: Array<{ text: string; type: string; timestamp: number }>;
    timestamp: number;
  }>;
  onSelectSession: (sessionId: string) => void;
}

interface ProjectEntry {
  kind: "project";
  name: string;
  path: string;
  active: boolean;
  lastActive: number;
}

interface ChatEntry {
  kind: "chat";
  sessionId: string;
  title: string;
  timestamp: number;
  isCode: boolean;
}

type ResultEntry = ProjectEntry | ChatEntry;

// ── Helpers ─────────────────────────────────────────────────

function timeLabel(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return "Past hour";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    const now = new Date();
    const then = new Date(ts);
    if (now.getDate() === then.getDate() && now.getMonth() === then.getMonth() && now.getFullYear() === then.getFullYear()) {
      return "Today";
    }
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (then.getDate() === yesterday.getDate() && then.getMonth() === yesterday.getMonth() && then.getFullYear() === yesterday.getFullYear()) {
      return "Yesterday";
    }
    return "Today";
  }
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

function dirName(p: string): string {
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || p;
}

/** Detect if a session looks like a code session (has tool use, code blocks, file edits). */
function isCodeSession(messages: Array<{ text: string; type: string }>): boolean {
  return messages.some(
    (m) => m.type === "code" || m.type === "file_edit" || m.type === "tool_use" || m.type === "bash"
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

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: "var(--text-dim)", flexShrink: 0 }}>
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  );
}

function CodeBracketIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: "var(--text-dim)", flexShrink: 0 }}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function ChatBubbleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: "var(--text-dim)", flexShrink: 0 }}>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function TensorLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <rect x="3" y="3" width="18" height="18" rx="4" fill="var(--accent)" opacity="0.15" />
      <path d="M8 8h8M12 8v8" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ── Styles ──────────────────────────────────────────────────

const S = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    backdropFilter: "blur(2px)",
    WebkitBackdropFilter: "blur(2px)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: 600,
    maxHeight: "70vh",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    display: "flex",
    flexDirection: "column" as const,
    boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
    overflow: "hidden",
  },
  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 16px",
    borderBottom: "1px solid var(--border)",
  },
  input: {
    flex: 1,
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm, 4px)",
    outline: "none",
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    padding: "8px 12px",
    lineHeight: "1.4",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--text-dim)",
    cursor: "pointer",
    padding: 4,
    borderRadius: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  closeBtnHover: {
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
  },
  results: {
    flex: 1,
    overflowY: "auto" as const,
    minHeight: 0,
  },
  sectionHeader: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-dim)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    padding: "12px 16px 6px",
    userSelect: "none" as const,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 16px",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    color: "var(--text-secondary)",
    borderRadius: 0,
    transition: "background 0.08s",
  },
  rowHover: {
    background: "var(--bg-hover)",
  },
  rowSelected: {
    background: "var(--bg-hover)",
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowRight: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  timeLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--text-dim)",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  empty: {
    padding: "40px 16px",
    textAlign: "center" as const,
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    color: "var(--text-dim)",
  },
};

// ── Component ───────────────────────────────────────────────

function SearchPanel({ isOpen, onClose, sessions, onSelectSession }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [selIdx, setSelIdx] = useState(0);
  const [hovIdx, setHovIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state on open
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setSelIdx(0);
    setHovIdx(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  // Derive projects from sessions (group by inferred project directory from title)
  const projects = useMemo((): ProjectEntry[] => {
    const seen = new Map<string, { count: number; lastActive: number }>();
    for (const s of sessions) {
      // Try to extract a project path from session title or messages
      let path = "";
      // Look for directory-like patterns in title
      if (s.title.startsWith("/") || s.title.startsWith("~")) {
        path = s.title;
      } else {
        // Check first message for working directory hints
        for (const m of s.messages) {
          const match = m.text.match(/(?:^|\s)(\/[\w/.-]+(?:\/[\w.-]+){2,})/);
          if (match) { path = match[1]; break; }
        }
      }
      if (!path) continue;
      // Normalize to directory
      const dir = path.replace(/\/[^/]+\.[^/]+$/, ""); // strip trailing file
      const existing = seen.get(dir);
      if (existing) {
        existing.count++;
        if (s.timestamp > existing.lastActive) existing.lastActive = s.timestamp;
      } else {
        seen.set(dir, { count: 1, lastActive: s.timestamp });
      }
    }
    const out: ProjectEntry[] = [];
    Array.from(seen.entries()).forEach(([p, { lastActive }]) => {
      out.push({
        kind: "project",
        name: dirName(p),
        path: p,
        active: Date.now() - lastActive < 300000, // active if used in last 5min
        lastActive,
      });
    });
    return out.sort((a, b) => b.lastActive - a.lastActive);
  }, [sessions]);

  // Build chat entries from sessions
  const chats = useMemo((): ChatEntry[] => {
    return sessions
      .map((s) => ({
        kind: "chat" as const,
        sessionId: s.id,
        title: s.title || "Untitled chat",
        timestamp: s.timestamp,
        isCode: isCodeSession(s.messages),
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [sessions]);

  // Filter results based on query
  const filtered = useMemo((): { projects: ProjectEntry[]; chats: ChatEntry[] } => {
    const q = query.trim().toLowerCase();
    if (!q) return { projects: projects.slice(0, 5), chats };

    const fp = projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)
    );
    const fc = chats.filter((c) => {
      if (c.title.toLowerCase().includes(q)) return true;
      // Also search session messages
      const sess = sessions.find((s) => s.id === c.sessionId);
      if (!sess) return false;
      return sess.messages.some((m) => m.text.toLowerCase().includes(q));
    });
    return { projects: fp, chats: fc };
  }, [query, projects, chats, sessions]);

  // Flat list for keyboard navigation
  const flatList = useMemo((): ResultEntry[] => {
    const out: ResultEntry[] = [];
    for (const p of filtered.projects) out.push(p);
    for (const c of filtered.chats) out.push(c);
    return out;
  }, [filtered]);

  // Reset selection when results change
  useEffect(() => { setSelIdx(0); }, [flatList.length, query]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector("[data-selected='true']");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selIdx]);

  // Select handler
  const selectEntry = useCallback((entry: ResultEntry) => {
    if (entry.kind === "chat") {
      onSelectSession(entry.sessionId);
    }
    // For projects, select the most recent session in that project
    if (entry.kind === "project") {
      const sess = sessions.find((s) => {
        if (s.title.includes(entry.path) || s.title.includes(entry.name)) return true;
        return s.messages.some((m) => m.text.includes(entry.path));
      });
      if (sess) onSelectSession(sess.id);
    }
    onClose();
  }, [sessions, onSelectSession, onClose]);

  // Keyboard handler
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelIdx((i) => Math.min(i + 1, flatList.length - 1));
      setHovIdx(null);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelIdx((i) => Math.max(i - 1, 0));
      setHovIdx(null);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flatList[selIdx]) selectEntry(flatList[selIdx]);
    }
  }, [isOpen, flatList, selIdx, selectEntry, onClose]);

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  if (!isOpen) return null;

  const hasProjects = filtered.projects.length > 0;
  const hasChats = filtered.chats.length > 0;
  const hasResults = hasProjects || hasChats;

  // Compute the flat index offset for chats (projects come first)
  const chatIdxOffset = filtered.projects.length;

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.card} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Search chats and projects">

        {/* Search input */}
        <div style={S.inputRow}>
          <SearchIcon />
          <input
            ref={inputRef}
            style={S.input}
            type="text"
            placeholder="Search chats and projects"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label="Search chats and projects"
          />
          <button
            style={S.closeBtn}
            onClick={onClose}
            aria-label="Close search"
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, S.closeBtnHover)}
            onMouseLeave={(e) => Object.assign(e.currentTarget.style, S.closeBtn)}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Results */}
        <div style={S.results} ref={listRef}>

          {/* Projects section */}
          {hasProjects && (
            <>
              <div style={S.sectionHeader}>Projects</div>
              {filtered.projects.map((p, i) => {
                const idx = i;
                const isSelected = selIdx === idx && hovIdx === null;
                const isHovered = hovIdx === idx;
                return (
                  <div
                    key={p.path}
                    data-selected={isSelected || isHovered}
                    style={{
                      ...S.row,
                      ...(isSelected || isHovered ? S.rowSelected : {}),
                    }}
                    onClick={() => selectEntry(p)}
                    onMouseEnter={() => { setHovIdx(idx); setSelIdx(idx); }}
                    onMouseLeave={() => setHovIdx(null)}
                  >
                    <FolderIcon />
                    <span style={S.rowText}>{p.name}</span>
                    <span style={S.rowRight}>
                      {p.active && <TensorLogo />}
                    </span>
                  </div>
                );
              })}
            </>
          )}

          {/* Chats section */}
          {hasChats && (
            <>
              <div style={S.sectionHeader}>Chats</div>
              {filtered.chats.map((c, i) => {
                const idx = chatIdxOffset + i;
                const isSelected = selIdx === idx && hovIdx === null;
                const isHovered = hovIdx === idx;
                return (
                  <div
                    key={c.sessionId}
                    data-selected={isSelected || isHovered}
                    style={{
                      ...S.row,
                      ...(isSelected || isHovered ? S.rowSelected : {}),
                    }}
                    onClick={() => selectEntry(c)}
                    onMouseEnter={() => { setHovIdx(idx); setSelIdx(idx); }}
                    onMouseLeave={() => setHovIdx(null)}
                  >
                    {c.isCode ? <CodeBracketIcon /> : <ChatBubbleIcon />}
                    <span style={S.rowText}>{c.title}</span>
                    <span style={S.timeLabel}>{timeLabel(c.timestamp)}</span>
                  </div>
                );
              })}
            </>
          )}

          {/* Empty state */}
          {!hasResults && query.trim() && (
            <div style={S.empty}>No results for "{query.trim()}"</div>
          )}
          {!hasResults && !query.trim() && sessions.length === 0 && (
            <div style={S.empty}>No chats or projects yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(SearchPanel);
