import {
  useState, useEffect, useRef, useCallback, useMemo,
  type CSSProperties, type MouseEvent as RME,
} from "react";
import {
  onNotification, ToastIcon,
  type Toast, type ToastType, type HookEventSource,
} from "./NotificationToast";

/* ── Constants ─────────────────────────────────────────────────────────── */

const STORAGE_KEY = "tensor-notifications";
const MAX_STORED = 100;

/* ── Types ─────────────────────────────────────────────────────────────── */

interface StoredNotification {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  hookSource?: HookEventSource;
  timestamp: number;
  read: boolean;
}

type TimeGroup = "Today" | "Yesterday" | "Older";

/* ── localStorage helpers ──────────────────────────────────────────────── */

function loadNotifications(): StoredNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupt or unavailable
  }
  return [];
}

function saveNotifications(items: StoredNotification[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage full or unavailable, ignore
  }
}

/* ── Date grouping helpers ─────────────────────────────────────────────── */

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getTimeGroup(ts: number): TimeGroup {
  const now = Date.now();
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - 86_400_000;
  if (ts >= todayStart) return "Today";
  if (ts >= yesterdayStart) return "Yesterday";
  return "Older";
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

/* ── Inline hover helper (matches LogoHeader pattern) ──────────────────── */

function hov(base: CSSProperties, hover: CSSProperties) {
  return {
    style: base,
    onMouseEnter: (e: RME<HTMLElement>) => Object.assign(e.currentTarget.style, hover),
    onMouseLeave: (e: RME<HTMLElement>) => Object.assign(e.currentTarget.style, base),
  };
}

/* ── Color map ─────────────────────────────────────────────────────────── */

const TYPE_COLORS: Record<ToastType, string> = {
  info:    "#3b82f6",
  success: "#22c55e",
  warning: "#eab308",
  error:   "#ef4444",
  agent:   "#a855f7",
};

const HOOK_COLORS: Record<HookEventSource, string> = {
  PreToolUse:    "#60a5fa",
  PostToolUse:   "#34d399",
  Stop:          "#fbbf24",
  Notification:  "#a78bfa",
};

/* ── Styles ────────────────────────────────────────────────────────────── */

const bellBtnBase: CSSProperties = {
  position: "relative", display: "inline-flex", alignItems: "center",
  justifyContent: "center", width: 28, height: 28, borderRadius: 4,
  background: "none", border: "none", cursor: "pointer",
  color: "var(--text-muted)", transition: "background 0.15s, color 0.15s",
};
const bellBtnHover: CSSProperties = {
  ...bellBtnBase, background: "var(--bg-active)", color: "var(--text-secondary)",
};

const badgeStyle: CSSProperties = {
  position: "absolute", top: 2, right: 2, minWidth: 14, height: 14,
  borderRadius: 7, background: "var(--error, #ef4444)", color: "#fff",
  fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center",
  justifyContent: "center", padding: "0 3px", lineHeight: 1,
  pointerEvents: "none",
};

const panelStyle: CSSProperties = {
  position: "absolute", top: "calc(100% + 6px)", right: 0, width: 360,
  maxHeight: 480, background: "var(--bg-secondary, #12121a)",
  border: "1px solid var(--border-hover, #3a3a48)", borderRadius: 8,
  boxShadow: "0 8px 24px rgba(0,0,0,0.45)", zIndex: 1000,
  display: "flex", flexDirection: "column", overflow: "hidden",
  fontFamily: "var(--font-mono)", fontSize: 12,
};

const headerStyle: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 14px", borderBottom: "1px solid var(--border, #2a2a36)",
  flexShrink: 0,
};

const headerTitle: CSSProperties = {
  color: "var(--text-primary)", fontSize: 13, fontWeight: 600,
};

const headerBtnBase: CSSProperties = {
  background: "none", border: "none", color: "var(--text-muted)",
  fontSize: 10, cursor: "pointer", padding: "2px 6px", borderRadius: 3,
  fontFamily: "var(--font-mono)", transition: "background 0.15s, color 0.15s",
};
const headerBtnHover: CSSProperties = {
  ...headerBtnBase, background: "var(--bg-active)", color: "var(--text-secondary)",
};

const groupLabel: CSSProperties = {
  color: "var(--text-dim)", fontSize: 10, fontWeight: 600,
  letterSpacing: "0.04em", textTransform: "uppercase",
  padding: "8px 14px 4px",
};

const itemBase: CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 14px",
  cursor: "pointer", transition: "background 0.12s", borderLeft: "3px solid transparent",
};
const itemUnread: CSSProperties = {
  ...itemBase, background: "rgba(255,255,255,0.02)",
};
const itemHover: CSSProperties = {
  ...itemBase, background: "var(--bg-active)",
};

const emptyStyle: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: "40px 14px", color: "var(--text-dim)", fontSize: 12,
};

const expandedMsg: CSSProperties = {
  color: "var(--text-secondary)", fontSize: 11, lineHeight: "1.5",
  marginTop: 4, padding: "6px 8px", background: "var(--bg-tertiary, #1a1a24)",
  borderRadius: 4, whiteSpace: "pre-wrap", wordBreak: "break-word",
};

/* ═══════════════════════════════════════════════════════════════════════════
 * NotificationCenter
 *
 * Bell icon with unread count badge. Click to open a dropdown panel showing
 * notification history, grouped by time (Today / Yesterday / Older).
 * Listens to the global notification event bus from NotificationToast.
 * Persists up to 100 notifications in localStorage.
 * ═══════════════════════════════════════════════════════════════════════ */

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<StoredNotification[]>(loadNotifications);
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* ── Persist to localStorage on change ── */
  useEffect(() => {
    saveNotifications(notifications);
  }, [notifications]);

  /* ── Subscribe to toast events ── */
  useEffect(() => {
    return onNotification((toast: Toast) => {
      const entry: StoredNotification = {
        id: toast.id,
        type: toast.type,
        title: toast.title,
        message: toast.message,
        hookSource: toast.hookSource,
        timestamp: toast.timestamp ?? Date.now(),
        read: false,
      };
      setNotifications((prev) => {
        const updated = [entry, ...prev];
        if (updated.length > MAX_STORED) {
          return updated.slice(0, MAX_STORED);
        }
        return updated;
      });
    });
  }, []);

  /* ── Close on outside click ── */
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  /* ── Derived ── */
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const grouped = useMemo(() => {
    const groups: Record<TimeGroup, StoredNotification[]> = {
      Today: [], Yesterday: [], Older: [],
    };
    for (const n of notifications) {
      groups[getTimeGroup(n.timestamp)].push(n);
    }
    return groups;
  }, [notifications]);

  /* ── Handlers ── */
  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setExpandedId(null);
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
    // Mark as read on expand
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  /* ── Render ── */
  const groupOrder: TimeGroup[] = ["Today", "Yesterday", "Older"];

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      {/* Bell button */}
      <button
        {...hov(bellBtnBase, bellBtnHover)}
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        title="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={badgeStyle}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={headerStyle}>
            <span style={headerTitle}>Notifications</span>
            <div style={{ display: "flex", gap: 6 }}>
              {unreadCount > 0 && (
                <button {...hov(headerBtnBase, headerBtnHover)} onClick={markAllRead}>
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button {...hov(headerBtnBase, headerBtnHover)} onClick={clearAll}>
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {notifications.length === 0 ? (
              <div style={emptyStyle}>No notifications</div>
            ) : (
              groupOrder.map((group) => {
                const items = grouped[group];
                if (items.length === 0) return null;
                return (
                  <div key={group}>
                    <div style={groupLabel}>{group}</div>
                    {items.map((n) => (
                      <NotificationItem
                        key={n.id}
                        notification={n}
                        expanded={expandedId === n.id}
                        onToggle={() => toggleExpand(n.id)}
                      />
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Notification item ─────────────────────────────────────────────────── */

function NotificationItem({
  notification: n,
  expanded,
  onToggle,
}: {
  notification: StoredNotification;
  expanded: boolean;
  onToggle: () => void;
}) {
  const color = TYPE_COLORS[n.type];
  const baseStyle: CSSProperties = n.read ? itemBase : {
    ...itemUnread, borderLeftColor: color,
  };

  return (
    <div
      style={baseStyle}
      onClick={onToggle}
      onMouseEnter={(e) => Object.assign(e.currentTarget.style, itemHover)}
      onMouseLeave={(e) => Object.assign(e.currentTarget.style, n.read ? itemBase : {
        ...itemUnread, borderLeftColor: color,
      })}
    >
      {/* Icon */}
      <span style={{ flexShrink: 0, marginTop: 1 }}>
        <ToastIcon type={n.type} />
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            color: n.read ? "var(--text-secondary)" : "var(--text-primary)",
            fontSize: 12, fontWeight: n.read ? 400 : 600, lineHeight: "1.3",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            flex: 1, minWidth: 0,
          }}>
            {n.title}
          </span>
          <span style={{
            color: "var(--text-dim)", fontSize: 10, whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {formatTimestamp(n.timestamp)}
          </span>
        </div>

        {/* Hook source label */}
        {n.hookSource && (
          <span style={{
            display: "inline-block", marginTop: 2,
            fontSize: 9, fontWeight: 600, letterSpacing: "0.03em",
            padding: "1px 5px", borderRadius: 3,
            background: `${HOOK_COLORS[n.hookSource]}20`,
            color: HOOK_COLORS[n.hookSource],
          }}>
            {n.hookSource}
          </span>
        )}

        {/* Collapsed message preview */}
        {!expanded && n.message && (
          <div style={{
            color: "var(--text-dim)", fontSize: 11, lineHeight: "1.3",
            marginTop: 2, overflow: "hidden", textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {n.message}
          </div>
        )}

        {/* Expanded message */}
        {expanded && n.message && (
          <div style={expandedMsg}>{n.message}</div>
        )}
      </div>

      {/* Unread dot */}
      {!n.read && (
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: color, flexShrink: 0, marginTop: 5,
        }} />
      )}
    </div>
  );
}
