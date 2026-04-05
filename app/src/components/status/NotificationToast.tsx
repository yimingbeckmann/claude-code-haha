import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type CSSProperties,
} from "react";

export type ToastType = "info" | "success" | "warning" | "error" | "agent";

export type HookEventSource = "PreToolUse" | "PostToolUse" | "Stop" | "Notification";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, 0 = persistent
  hookSource?: HookEventSource;
  timestamp?: number;
}

export interface ToastContextValue {
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const MAX_VISIBLE = 5;
const DEFAULT_DURATION = 5000;
const ERROR_DURATION = 10000;

let toastCounter = 0;
function generateId(): string {
  return `toast-${++toastCounter}-${Date.now()}`;
}

const COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  info:    { bg: "rgba(59,130,246,0.12)",  border: "#3b82f6",  icon: "#3b82f6" },
  success: { bg: "rgba(34,197,94,0.12)",   border: "#22c55e",  icon: "#22c55e" },
  warning: { bg: "rgba(234,179,8,0.12)",   border: "#eab308",  icon: "#eab308" },
  error:   { bg: "rgba(239,68,68,0.12)",   border: "#ef4444",  icon: "#ef4444" },
  agent:   { bg: "rgba(168,85,247,0.12)",  border: "#a855f7",  icon: "#a855f7" },
};

export function ToastIcon({ type }: { type: ToastType }) {
  const c = COLORS[type].icon;
  const shared = {
    width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: c,
    strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  if (type === "info") return (
    <svg {...shared}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
  if (type === "success") return (
    <svg {...shared}><path d="M20 6L9 17l-5-5" /></svg>
  );
  if (type === "warning") return (
    <svg {...shared}>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
  if (type === "agent") return (
    <svg {...shared}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
    </svg>
  );
  return (
    <svg {...shared}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

const toastKeyframes = `
@keyframes toastSlideIn {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
@keyframes toastFadeOut {
  from { transform: translateX(0);    opacity: 1; }
  to   { transform: translateX(40px); opacity: 0; }
}
@keyframes toastProgress {
  from { width: 100%; }
  to   { width: 0%; }
}
`;

interface InternalToast extends Toast {
  dismissing: boolean;
}

function getDuration(t: Omit<Toast, "id">): number {
  if (t.duration !== undefined) return t.duration;
  return t.type === "error" ? ERROR_DURATION : DEFAULT_DURATION;
}

const HOOK_SOURCE_COLORS: Record<HookEventSource, string> = {
  PreToolUse:    "#60a5fa",
  PostToolUse:   "#34d399",
  Stop:          "#fbbf24",
  Notification:  "#a78bfa",
};

function ToastItem({ toast, onRemove }: { toast: InternalToast; onRemove: (id: string) => void }) {
  const colors = COLORS[toast.type];
  const duration = getDuration(toast);
  const isPersistent = duration === 0;

  const containerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    width: "340px",
    backgroundColor: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: "8px",
    overflow: "hidden",
    boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
    animation: toast.dismissing
      ? "toastFadeOut 0.25s ease-out forwards"
      : "toastSlideIn 0.3s ease-out",
    pointerEvents: "auto",
  };

  const closeBtnStyle: CSSProperties = {
    background: "none", border: "none", cursor: "pointer", padding: "2px",
    color: "var(--color-text-dim, #888)", flexShrink: 0, marginLeft: "auto", lineHeight: 1,
  };

  return (
    <div style={containerStyle}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px" }}>
        <span style={{ flexShrink: 0, marginTop: "1px" }}>
          <ToastIcon type={toast.type} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: "var(--color-text, #e0e0e0)", fontSize: "13px", fontWeight: 600, lineHeight: "1.3" }}>
              {toast.title}
            </span>
            {toast.hookSource && (
              <span style={{
                fontSize: "9px", fontWeight: 600, letterSpacing: "0.03em",
                padding: "1px 5px", borderRadius: "3px",
                background: `${HOOK_SOURCE_COLORS[toast.hookSource]}20`,
                color: HOOK_SOURCE_COLORS[toast.hookSource],
                whiteSpace: "nowrap", flexShrink: 0,
              }}>
                {toast.hookSource}
              </span>
            )}
          </div>
          {toast.message && (
            <div style={{ color: "var(--color-text-dim, #999)", fontSize: "12px", lineHeight: "1.4", marginTop: "2px" }}>
              {toast.message}
            </div>
          )}
        </div>
        <button style={closeBtnStyle} onClick={() => onRemove(toast.id)} aria-label="Dismiss notification">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      {!isPersistent && (
        <div style={{
          height: "3px", backgroundColor: colors.border,
          animation: `toastProgress ${duration}ms linear forwards`, transformOrigin: "left",
        }} />
      )}
    </div>
  );
}

/* ── Global notification event bus ── */

type NotificationListener = (toast: Toast) => void;
const notificationListeners = new Set<NotificationListener>();

export function onNotification(listener: NotificationListener): () => void {
  notificationListeners.add(listener);
  return () => { notificationListeners.delete(listener); };
}

function emitNotification(toast: Toast): void {
  for (const fn of notificationListeners) {
    try { fn(toast); } catch { /* listener errors should not break toasts */ }
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<InternalToast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    // Start dismiss animation
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t)));
    // Remove from DOM after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 250);
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback((input: Omit<Toast, "id">) => {
    const id = generateId();
    const duration = getDuration(input);
    const ts = input.timestamp ?? Date.now();
    const newToast: InternalToast = { ...input, id, timestamp: ts, dismissing: false };

    // Emit to notification center listeners
    emitNotification(newToast);

    setToasts((prev) => {
      const updated = [...prev, newToast];
      if (updated.length > MAX_VISIBLE) {
        const oldest = updated[0];
        if (oldest && !oldest.dismissing) {
          setTimeout(() => removeToast(oldest.id), 0);
        }
      }
      return updated;
    });

    if (duration > 0) {
      const timer = setTimeout(() => {
        removeToast(id);
        timersRef.current.delete(id);
      }, duration);
      timersRef.current.set(id, timer);
    }
  }, [removeToast]);

  useEffect(() => {
    return () => {
      for (const t of timersRef.current.values()) clearTimeout(t);
    };
  }, []);

  const containerStyle: CSSProperties = {
    position: "fixed", bottom: "20px", right: "20px",
    display: "flex", flexDirection: "column", gap: "8px",
    zIndex: 9999, pointerEvents: "none",
  };

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <style>{toastKeyframes}</style>
      <div style={containerStyle}>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
