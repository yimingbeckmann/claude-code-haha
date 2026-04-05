import {
  useState, useRef, useEffect, useCallback,
  type CSSProperties, type MouseEvent as RME, type DragEvent as RDE,
} from "react";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface Session {
  id: string;
  title: string;
  model?: string;
  timestamp: number;
  isModified?: boolean;
}

interface TabBarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCloseSession: (id: string) => void;
  onNewSession: () => void;
  maxTabs?: number;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function truncate(s: string, max = 20): string {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}

/** Returns a model-indicator color: orange for Claude variants, green for local. */
function modelDotColor(model?: string): string {
  if (!model) return "var(--text-dim)";
  const m = model.toLowerCase();
  if (m.includes("claude") || m.includes("opus") || m.includes("sonnet") || m.includes("haiku"))
    return "#e88a3a";
  return "#4caf82";
}

/** onMouseEnter/Leave that apply inline hover styles. */
function hov(base: CSSProperties, hover: CSSProperties) {
  return {
    style: base,
    onMouseEnter: (e: RME<HTMLElement>) => Object.assign(e.currentTarget.style, hover),
    onMouseLeave: (e: RME<HTMLElement>) => Object.assign(e.currentTarget.style, base),
  };
}

/* ── Context menu actions ─────────────────────────────────────────────── */

type ContextAction = "close" | "close-others" | "close-all" | "duplicate" | "pin";

interface ContextMenu {
  x: number;
  y: number;
  sessionId: string;
}

/* ── Styles ────────────────────────────────────────────────────────────── */

const barOuter: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  height: 32,
  background: "var(--bg-secondary)",
  borderBottom: "1px solid var(--border)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  userSelect: "none",
  overflow: "hidden",
};

const scrollArea: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flex: 1,
  overflowX: "auto",
  overflowY: "hidden",
  scrollbarWidth: "none",           /* Firefox */
  height: "100%",
};

const tabBase: CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: "100%",
  padding: "0 10px",
  cursor: "pointer",
  whiteSpace: "nowrap",
  color: "var(--text-dim)",
  background: "transparent",
  border: "none",
  borderRight: "1px solid var(--border)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  transition: "color 0.15s, background 0.15s",
  flexShrink: 0,
  outline: "none",
};

const tabHover: CSSProperties = {
  ...tabBase,
  color: "var(--text-muted)",
  background: "var(--bg-tertiary)",
};

const tabActive: CSSProperties = {
  ...tabBase,
  color: "var(--text-primary)",
  background: "var(--bg-primary)",
};

const tabActiveHover: CSSProperties = {
  ...tabActive,
  background: "var(--bg-primary)",
};

const accentLine: CSSProperties = {
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  height: 2,
  background: "var(--accent, #e84520)",
  borderRadius: "1px 1px 0 0",
};

const modelDot = (color: string): CSSProperties => ({
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: color,
  flexShrink: 0,
});

const modifiedDot: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "var(--accent, #e84520)",
  flexShrink: 0,
};

const closeBtnBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 16,
  height: 16,
  borderRadius: 3,
  background: "transparent",
  border: "none",
  color: "var(--text-dim)",
  fontSize: 13,
  lineHeight: 1,
  cursor: "pointer",
  padding: 0,
  opacity: 0,
  transition: "opacity 0.12s, background 0.12s, color 0.12s",
  flexShrink: 0,
};

const closeBtnHover: CSSProperties = {
  ...closeBtnBase,
  opacity: 1,
  background: "rgba(255,255,255,0.08)",
  color: "var(--text-primary)",
};

const newBtnBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 24,
  borderRadius: 4,
  background: "transparent",
  border: "none",
  color: "var(--text-dim)",
  fontSize: 16,
  cursor: "pointer",
  flexShrink: 0,
  marginLeft: 2,
  marginRight: 4,
  transition: "background 0.15s, color 0.15s",
};

const newBtnHover: CSSProperties = {
  ...newBtnBase,
  background: "var(--bg-tertiary)",
  color: "var(--text-primary)",
};

const ctxMenu: CSSProperties = {
  position: "fixed",
  zIndex: 999,
  background: "var(--bg-secondary)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: 4,
  minWidth: 160,
  boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
};

const ctxItemBase: CSSProperties = {
  display: "block",
  width: "100%",
  background: "none",
  border: "none",
  color: "var(--text-secondary)",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  padding: "5px 10px",
  borderRadius: 4,
  cursor: "pointer",
  textAlign: "left",
};

const ctxItemHover: CSSProperties = {
  ...ctxItemBase,
  background: "var(--bg-active, var(--bg-tertiary))",
  color: "var(--text-primary)",
};

const ctxSep: CSSProperties = {
  height: 1,
  background: "var(--border)",
  margin: "3px 6px",
};

const fadeLeft: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: 24,
  height: "100%",
  pointerEvents: "none",
  background: "linear-gradient(to right, var(--bg-secondary), transparent)",
  zIndex: 2,
};

const fadeRight: CSSProperties = {
  position: "absolute",
  top: 0,
  right: 32,
  width: 24,
  height: "100%",
  pointerEvents: "none",
  background: "linear-gradient(to left, var(--bg-secondary), transparent)",
  zIndex: 2,
};

const dragOverStyle: CSSProperties = {
  borderLeft: "2px solid var(--accent, #e84520)",
};

/* ═══════════════════════════════════════════════════════════════════════════
 * TabBar
 *
 * Multi-session tab bar placed between header and message area.
 * Supports drag-to-reorder, right-click context menu, middle-click close,
 * overflow scroll with fade indicators, and a "+" new-session button.
 * ═══════════════════════════════════════════════════════════════════════ */

export default function TabBar({
  sessions,
  activeSessionId,
  onSelectSession,
  onCloseSession,
  onNewSession,
  maxTabs = 20,
}: TabBarProps) {

  const scrollRef = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<ContextMenu | null>(null);
  const [overflowL, setOverflowL] = useState(false);
  const [overflowR, setOverflowR] = useState(false);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[]>(() => sessions.map((s) => s.id));
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set());

  /* ── Keep orderedIds in sync with external session list ────────────── */

  useEffect(() => {
    setOrderedIds((prev) => {
      const current = new Set(sessions.map((s) => s.id));
      // Keep existing order for ids that still exist, append new ones
      const kept = prev.filter((id) => current.has(id));
      const added = sessions.filter((s) => !kept.includes(s.id)).map((s) => s.id);
      return [...kept, ...added];
    });
  }, [sessions]);

  /* ── Overflow fade detection ───────────────────────────────────────── */

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setOverflowL(el.scrollLeft > 4);
    setOverflowR(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkOverflow();
    el.addEventListener("scroll", checkOverflow, { passive: true });
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", checkOverflow); ro.disconnect(); };
  }, [checkOverflow]);

  // Re-check when sessions change
  useEffect(checkOverflow, [sessions, checkOverflow]);

  /* ── Click-outside closes context menu ─────────────────────────────── */

  useEffect(() => {
    if (!context) return;
    function handle(e: MouseEvent) { setContext(null); void e; }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [context]);

  /* ── Scroll active tab into view ───────────────────────────────────── */

  useEffect(() => {
    if (!activeSessionId || !scrollRef.current) return;
    const tab = scrollRef.current.querySelector(`[data-tab-id="${activeSessionId}"]`) as HTMLElement | null;
    tab?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeSessionId]);

  /* ── Drag and drop reorder ─────────────────────────────────────────── */

  function handleDragStart(e: RDE<HTMLDivElement>, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    // Make the drag ghost slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      requestAnimationFrame(() => {
        (e.currentTarget as HTMLElement).style.opacity = "0.4";
      });
    }
  }

  function handleDragEnd(e: RDE<HTMLDivElement>) {
    setDragId(null);
    setDragOver(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
  }

  function handleDragOver(e: RDE<HTMLDivElement>, id: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== dragId) setDragOver(id);
  }

  function handleDrop(e: RDE<HTMLDivElement>, targetId: string) {
    e.preventDefault();
    if (!dragId || dragId === targetId) { setDragOver(null); return; }
    setOrderedIds((prev) => {
      const from = prev.indexOf(dragId);
      const to = prev.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, dragId);
      return next;
    });
    setDragOver(null);
    setDragId(null);
  }

  /* ── Context menu handler ──────────────────────────────────────────── */

  function handleContext(e: RME<HTMLDivElement>, id: string) {
    e.preventDefault();
    setContext({ x: e.clientX, y: e.clientY, sessionId: id });
  }

  function execCtx(action: ContextAction) {
    if (!context) return;
    const sid = context.sessionId;
    setContext(null);

    switch (action) {
      case "close":
        onCloseSession(sid);
        break;
      case "close-others":
        sessions.forEach((s) => { if (s.id !== sid) onCloseSession(s.id); });
        break;
      case "close-all":
        sessions.forEach((s) => onCloseSession(s.id));
        break;
      case "duplicate":
        // Duplicate triggers a new session -- the parent decides if it clones content
        onNewSession();
        break;
      case "pin":
        setPinnedIds((prev) => {
          const next = new Set(prev);
          if (next.has(sid)) next.delete(sid); else next.add(sid);
          return next;
        });
        break;
    }
  }

  /* ── Middle-click close ────────────────────────────────────────────── */

  function handleAuxClick(e: RME<HTMLDivElement>, id: string) {
    if (e.button === 1) {
      e.preventDefault();
      onCloseSession(id);
    }
  }

  /* ── Build ordered session list ────────────────────────────────────── */

  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const ordered = orderedIds
    .filter((id) => sessionMap.has(id))
    .map((id) => sessionMap.get(id)!);

  // Sort pinned tabs to the front
  const pinned = ordered.filter((s) => pinnedIds.has(s.id));
  const unpinned = ordered.filter((s) => !pinnedIds.has(s.id));
  const displayed = [...pinned, ...unpinned];

  const canAdd = sessions.length < maxTabs;

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <div style={barOuter} className="tab-bar">
      {/* Webkit scrollbar hide */}
      <style>{`
        .tab-bar .tab-scroll::-webkit-scrollbar { display: none; }
        .tab-bar .tab-item:hover .tab-close { opacity: 1 !important; }
      `}</style>

      {overflowL && <div style={fadeLeft} />}

      <div ref={scrollRef} style={scrollArea} className="tab-scroll">
        {displayed.map((session) => {
          const isActive = session.id === activeSessionId;
          const isPinned = pinnedIds.has(session.id);
          const isDragTarget = dragOver === session.id && dragId !== session.id;
          const isHovered = hoveredTab === session.id;

          const baseStyle = isActive ? tabActive : tabBase;
          const hoverStyle = isActive ? tabActiveHover : tabHover;
          const merged: CSSProperties = {
            ...(isHovered && !isActive ? hoverStyle : baseStyle),
            ...(isDragTarget ? dragOverStyle : {}),
            ...(dragId === session.id ? { opacity: 0.4 } : {}),
          };

          return (
            <div
              key={session.id}
              data-tab-id={session.id}
              className="tab-item"
              style={merged}
              draggable={!isPinned}
              onClick={() => onSelectSession(session.id)}
              onAuxClick={(e) => handleAuxClick(e, session.id)}
              onContextMenu={(e) => handleContext(e, session.id)}
              onMouseEnter={() => setHoveredTab(session.id)}
              onMouseLeave={() => setHoveredTab(null)}
              onDragStart={(e) => handleDragStart(e, session.id)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, session.id)}
              onDrop={(e) => handleDrop(e, session.id)}
            >
              {/* Model color dot */}
              {session.model && (
                <span
                  style={modelDot(modelDotColor(session.model))}
                  title={session.model}
                />
              )}

              {/* Pin indicator */}
              {isPinned && (
                <span style={{ color: "var(--text-dim)", fontSize: 10, lineHeight: 1 }}
                  title="Pinned">
                  {"\u{1F4CC}"}
                </span>
              )}

              {/* Title */}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {truncate(session.title)}
              </span>

              {/* Modified dot */}
              {session.isModified && <span style={modifiedDot} title="Unsaved changes" />}

              {/* Close button (visible on hover via CSS class) */}
              {!isPinned && (
                <button
                  className="tab-close"
                  style={closeBtnBase}
                  onMouseEnter={(e) => Object.assign(e.currentTarget.style, closeBtnHover)}
                  onMouseLeave={(e) => Object.assign(e.currentTarget.style, { ...closeBtnBase, opacity: isHovered ? 1 : 0 })}
                  onClick={(e) => { e.stopPropagation(); onCloseSession(session.id); }}
                  title="Close tab"
                >
                  \u00D7
                </button>
              )}

              {/* Active accent underline */}
              {isActive && <div style={accentLine} />}
            </div>
          );
        })}

        {/* New session button */}
        {canAdd && (
          <button
            {...hov(newBtnBase, newBtnHover)}
            onClick={onNewSession}
            title="New session"
          >
            +
          </button>
        )}
      </div>

      {overflowR && <div style={fadeRight} />}

      {/* ── Context menu ──────────────────────────────────────────────── */}
      {context && (
        <div
          style={{ ...ctxMenu, top: context.y, left: context.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button {...hov(ctxItemBase, ctxItemHover)} onClick={() => execCtx("close")}>
            Close
          </button>
          <button {...hov(ctxItemBase, ctxItemHover)} onClick={() => execCtx("close-others")}>
            Close Others
          </button>
          <button {...hov(ctxItemBase, ctxItemHover)} onClick={() => execCtx("close-all")}>
            Close All
          </button>
          <div style={ctxSep} />
          <button {...hov(ctxItemBase, ctxItemHover)} onClick={() => execCtx("duplicate")}>
            Duplicate
          </button>
          <button {...hov(ctxItemBase, ctxItemHover)} onClick={() => execCtx("pin")}>
            {pinnedIds.has(context.sessionId) ? "Unpin" : "Pin"}
          </button>
        </div>
      )}
    </div>
  );
}
