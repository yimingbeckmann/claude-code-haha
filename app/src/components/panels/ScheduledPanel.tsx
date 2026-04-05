import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  prompt: string;
  schedule: {
    type: "hourly" | "daily" | "weekly" | "monthly" | "custom";
    time?: string;
    dayOfWeek?: number;
    cronExpr?: string;
  };
  taskType: "local" | "remote";
  cwd?: string;
  worktree: boolean;
  model: string;
  permissions: string;
  enabled: boolean;
  lastRun?: {
    timestamp: number;
    status: "success" | "error" | "running";
    summary: string;
    durationMs: number;
  };
  nextRun?: number;
  createdAt: number;
}

interface RunHistoryEntry {
  timestamp: number;
  status: "success" | "error";
  summary: string;
  durationMs: number;
}

interface ScheduledPanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "tensor-scheduled-tasks";
const HISTORY_KEY = "tensor-scheduled-history";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const MODEL_OPTIONS = [
  { value: "opus-4.6", label: "Opus 4.6" },
  { value: "sonnet-4.5", label: "Sonnet 4.5" },
  { value: "haiku-3.5", label: "Haiku 3.5" },
];

const PERMISSION_OPTIONS = [
  { value: "ask", label: "Ask permissions" },
  { value: "allow-all", label: "Allow all" },
  { value: "deny-all", label: "Deny all" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadTasks(): ScheduledTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTasks(tasks: ScheduledTask[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function loadHistory(taskId: string): RunHistoryEntry[] {
  try {
    const raw = localStorage.getItem(`${HISTORY_KEY}-${taskId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function formatTimestamp(ts: number): string {
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

function formatFutureTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = ts - now.getTime();

  if (diff < 0) return "overdue";
  if (diff < 60_000) return "in <1m";
  if (diff < 3_600_000) return `in ${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `in ${Math.floor(diff / 3_600_000)}h`;

  const month = d.toLocaleString("default", { month: "short" });
  const day = d.getDate();
  const time = d.toLocaleTimeString("default", { hour: "2-digit", minute: "2-digit" });
  return `${month} ${day}, ${time}`;
}

function describeSchedule(schedule: ScheduledTask["schedule"]): string {
  const time = schedule.time || "00:00";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const timeStr = `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;

  switch (schedule.type) {
    case "hourly":
      return "Every hour";
    case "daily":
      return `Daily at ${timeStr}`;
    case "weekly":
      return `Every ${DAY_NAMES[schedule.dayOfWeek ?? 1]} at ${timeStr}`;
    case "monthly":
      return `Monthly on the 1st at ${timeStr}`;
    case "custom":
      return schedule.cronExpr ? `Cron: ${schedule.cronExpr}` : "Custom schedule";
    default:
      return "Unknown schedule";
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function formatTime12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

const ClockIcon = ({ size = 48 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
    <circle cx="24" cy="24" r="15" stroke="currentColor" strokeWidth="1.5" />
    <path d="M24 14v10l7 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="24" cy="24" r="2" fill="currentColor" />
  </svg>
);

const MonitorIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="2" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M5.5 14h5M8 11v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const CloudIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M4.5 12.5h7.25a3.25 3.25 0 00.5-6.462A4.5 4.5 0 003.5 8.5h-.25a2.25 2.25 0 001.25 4z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
    <path d="M7 6.5v3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <circle cx="7" cy="4.5" r="0.7" fill="currentColor" />
  </svg>
);

const FolderIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1.5 3.5A1 1 0 012.5 2.5h2.8a1 1 0 01.7.3l1 1h4.5a1 1 0 011 1v6a1 1 0 01-1 1h-9a1 1 0 01-1-1v-6.3z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const XIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScheduledPanel({ isOpen, onClose, apiBase }: ScheduledPanelProps) {
  // apiBase is available for future API integration with scheduled task endpoints
  void apiBase;

  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showNewDropdown, setShowNewDropdown] = useState(false);
  const [dialogType, setDialogType] = useState<"local" | "remote" | null>(null);
  const [runHistory, setRunHistory] = useState<RunHistoryEntry[]>([]);

  // Create form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formFrequency, setFormFrequency] = useState<ScheduledTask["schedule"]["type"]>("daily");
  const [formTime, setFormTime] = useState("09:00");
  const [formDayOfWeek, setFormDayOfWeek] = useState(1);
  const [formCwd, setFormCwd] = useState("");
  const [formWorktree, setFormWorktree] = useState(false);
  const [formModel, setFormModel] = useState("opus-4.6");
  const [formPermissions, setFormPermissions] = useState("ask");
  const [formCronExpr, setFormCronExpr] = useState("");
  const [remoteTab, setRemoteTab] = useState<"connectors" | "permissions">("connectors");

  const dropdownRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Load tasks on mount
  useEffect(() => {
    if (isOpen) {
      setTasks(loadTasks());
    }
  }, [isOpen]);

  // Load history when selecting a task
  useEffect(() => {
    if (selectedTaskId) {
      setRunHistory(loadHistory(selectedTaskId));
    }
  }, [selectedTaskId]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dialogType) {
          setDialogType(null);
        } else if (selectedTaskId) {
          setSelectedTaskId(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose, selectedTaskId, dialogType]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showNewDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowNewDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNewDropdown]);

  // Focus prompt textarea when dialog opens
  useEffect(() => {
    if (dialogType && promptRef.current) {
      setTimeout(() => promptRef.current?.focus(), 100);
    }
  }, [dialogType]);

  // Persist tasks
  const persistTasks = useCallback((updated: ScheduledTask[]) => {
    setTasks(updated);
    saveTasks(updated);
  }, []);

  // Compute next run timestamp
  const computeNextRun = useCallback((schedule: ScheduledTask["schedule"]): number | undefined => {
    const now = new Date();
    const [h, m] = (schedule.time || "00:00").split(":").map(Number);

    switch (schedule.type) {
      case "hourly": {
        const next = new Date(now);
        next.setMinutes(0, 0, 0);
        next.setHours(next.getHours() + 1);
        return next.getTime();
      }
      case "daily": {
        const next = new Date(now);
        next.setHours(h, m, 0, 0);
        if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
        return next.getTime();
      }
      case "weekly": {
        const day = schedule.dayOfWeek ?? 1;
        const next = new Date(now);
        next.setHours(h, m, 0, 0);
        const diff = (day - now.getDay() + 7) % 7;
        if (diff === 0 && next.getTime() <= now.getTime()) {
          next.setDate(next.getDate() + 7);
        } else {
          next.setDate(next.getDate() + diff);
        }
        return next.getTime();
      }
      case "monthly": {
        const next = new Date(now.getFullYear(), now.getMonth(), 1, h, m, 0, 0);
        if (next.getTime() <= now.getTime()) next.setMonth(next.getMonth() + 1);
        return next.getTime();
      }
      default:
        return undefined;
    }
  }, []);

  // Reset form
  const resetForm = useCallback(() => {
    setFormName("");
    setFormDescription("");
    setFormPrompt("");
    setFormFrequency("daily");
    setFormTime("09:00");
    setFormDayOfWeek(1);
    setFormCwd("");
    setFormWorktree(false);
    setFormModel("opus-4.6");
    setFormPermissions("ask");
    setFormCronExpr("");
    setRemoteTab("connectors");
  }, []);

  // Open new task dialog
  const openDialog = useCallback((type: "local" | "remote") => {
    resetForm();
    setDialogType(type);
    setShowNewDropdown(false);
  }, [resetForm]);

  // Create task
  const handleCreate = useCallback(() => {
    if (!formName.trim() || !formDescription.trim()) return;
    const schedule: ScheduledTask["schedule"] = {
      type: formFrequency,
      time: formFrequency !== "hourly" ? formTime : undefined,
      dayOfWeek: formFrequency === "weekly" ? formDayOfWeek : undefined,
      cronExpr: formFrequency === "custom" ? formCronExpr : undefined,
    };
    const newTask: ScheduledTask = {
      id: generateId(),
      name: formName.trim(),
      description: formDescription.trim(),
      prompt: formPrompt.trim(),
      schedule,
      taskType: dialogType || "local",
      cwd: formCwd || undefined,
      worktree: formWorktree,
      model: formModel,
      permissions: formPermissions,
      enabled: true,
      nextRun: computeNextRun(schedule),
      createdAt: Date.now(),
    };
    const updated = [newTask, ...tasks];
    persistTasks(updated);
    resetForm();
    setDialogType(null);
  }, [formName, formDescription, formPrompt, formFrequency, formTime, formDayOfWeek, formCronExpr, formCwd, formWorktree, formModel, formPermissions, dialogType, tasks, persistTasks, computeNextRun, resetForm]);

  // Toggle enabled
  const handleToggleEnabled = useCallback((taskId: string) => {
    const updated = tasks.map((t) => {
      if (t.id !== taskId) return t;
      const enabled = !t.enabled;
      return { ...t, enabled, nextRun: enabled ? computeNextRun(t.schedule) : undefined };
    });
    persistTasks(updated);
  }, [tasks, persistTasks, computeNextRun]);

  // Delete task
  const handleDelete = useCallback((taskId: string) => {
    const updated = tasks.filter((t) => t.id !== taskId);
    persistTasks(updated);
    if (selectedTaskId === taskId) setSelectedTaskId(null);
  }, [tasks, persistTasks, selectedTaskId]);

  // Derived
  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  // -------------------------------------------------------------------------
  // Inline Styles
  // -------------------------------------------------------------------------

  const styles = {
    container: {
      position: "fixed" as const,
      inset: 0,
      display: "flex",
      flexDirection: "column" as const,
      background: "var(--bg-primary)",
      overflow: "hidden",
      zIndex: 5000,
    },
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "24px 32px 0",
      flexShrink: 0,
    },
    headerTitle: {
      fontSize: "22px",
      fontWeight: 700,
      color: "var(--text-primary)",
      letterSpacing: "-0.01em",
    },
    newTaskBtnWrap: {
      position: "relative" as const,
    },
    newTaskBtn: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "7px 14px",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--border)",
      background: "var(--bg-secondary)",
      color: "var(--text-primary)",
      fontSize: "13px",
      fontWeight: 500,
      cursor: "pointer",
      transition: "all 0.15s",
    },
    dropdown: {
      position: "absolute" as const,
      top: "calc(100% + 6px)",
      right: 0,
      minWidth: "200px",
      background: "var(--bg-secondary)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      zIndex: 100,
      overflow: "hidden",
    },
    dropdownItem: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "10px 14px",
      cursor: "pointer",
      color: "var(--text-primary)",
      fontSize: "13px",
      background: "transparent",
      border: "none",
      width: "100%",
      textAlign: "left" as const,
      transition: "background 0.12s",
    },
    dropdownIcon: {
      color: "var(--text-muted)",
      display: "flex",
      alignItems: "center",
      flexShrink: 0,
    },
    descriptionText: {
      fontSize: "13px",
      color: "var(--text-secondary)",
      padding: "8px 32px 0",
      lineHeight: 1.5,
    },
    codeInline: {
      background: "var(--bg-tertiary)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)",
      padding: "1px 5px",
      fontFamily: "var(--font-mono)",
      fontSize: "12px",
      color: "var(--text-primary)",
    },
    body: {
      flex: 1,
      overflow: "auto",
      display: "flex",
      flexDirection: "column" as const,
    },
    // Empty state
    empty: {
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
      gap: "12px",
      padding: "60px 24px",
    },
    emptyIcon: {
      color: "var(--text-dim)",
      opacity: 0.45,
      marginBottom: "4px",
    },
    emptyText: {
      fontSize: "15px",
      fontWeight: 500,
      color: "var(--text-secondary)",
    },
    // Task card
    taskList: {
      padding: "16px 32px",
      display: "flex",
      flexDirection: "column" as const,
      gap: "8px",
    },
    taskCard: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "14px 16px",
      background: "var(--bg-secondary)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
      cursor: "pointer",
      transition: "all 0.12s",
    },
    taskCardLeft: {
      display: "flex",
      flexDirection: "column" as const,
      gap: "4px",
      flex: 1,
      minWidth: 0,
    },
    taskCardName: {
      fontSize: "14px",
      fontWeight: 600,
      color: "var(--text-primary)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap" as const,
    },
    taskCardMeta: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      fontSize: "12px",
      color: "var(--text-muted)",
    },
    taskCardRight: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      flexShrink: 0,
    },
    statusPill: (status?: string) => ({
      fontSize: "11px",
      fontWeight: 500,
      padding: "2px 8px",
      borderRadius: "10px",
      ...(status === "success"
        ? { background: "rgba(52, 199, 89, 0.12)", color: "#34c759" }
        : status === "error"
          ? { background: "rgba(255, 59, 48, 0.12)", color: "var(--error)" }
          : status === "running"
            ? { background: "rgba(52, 120, 246, 0.12)", color: "#3478f6" }
            : { background: "var(--bg-tertiary)", color: "var(--text-muted)" }),
    }),
    // Toggle switch
    toggleTrack: (enabled: boolean) => ({
      position: "relative" as const,
      width: "34px",
      height: "20px",
      borderRadius: "10px",
      background: enabled ? "var(--accent)" : "var(--bg-tertiary)",
      border: `1px solid ${enabled ? "var(--accent)" : "var(--border)"}`,
      cursor: "pointer",
      transition: "all 0.2s",
      flexShrink: 0,
    }),
    toggleThumb: (enabled: boolean) => ({
      position: "absolute" as const,
      top: "2px",
      left: enabled ? "16px" : "2px",
      width: "14px",
      height: "14px",
      borderRadius: "50%",
      background: enabled ? "#fff" : "var(--text-muted)",
      transition: "all 0.2s",
    }),
    // Modal overlay
    modalOverlay: {
      position: "fixed" as const,
      inset: 0,
      background: "rgba(0, 0, 0, 0.55)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2000,
      backdropFilter: "blur(2px)",
    },
    modal: {
      width: "560px",
      maxWidth: "calc(100vw - 40px)",
      maxHeight: "calc(100vh - 80px)",
      background: "var(--bg-primary)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      display: "flex",
      flexDirection: "column" as const,
      overflow: "hidden",
      boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
    },
    modalHeader: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "20px 24px 16px",
      borderBottom: "1px solid var(--border)",
    },
    modalTitle: {
      fontSize: "16px",
      fontWeight: 600,
      color: "var(--text-primary)",
    },
    modalCloseBtn: {
      background: "none",
      border: "none",
      color: "var(--text-muted)",
      cursor: "pointer",
      padding: "4px",
      borderRadius: "var(--radius-sm)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "color 0.15s",
    },
    modalBody: {
      flex: 1,
      overflowY: "auto" as const,
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column" as const,
      gap: "16px",
    },
    modalFooter: {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: "10px",
      padding: "16px 24px",
      borderTop: "1px solid var(--border)",
    },
    infoBanner: {
      display: "flex",
      alignItems: "flex-start",
      gap: "10px",
      padding: "10px 14px",
      background: "var(--bg-tertiary)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
      fontSize: "12px",
      color: "var(--text-secondary)",
      lineHeight: 1.5,
    },
    infoBannerIcon: {
      color: "var(--text-muted)",
      flexShrink: 0,
      marginTop: "1px",
    },
    fieldLabel: {
      fontSize: "12px",
      fontWeight: 600,
      color: "var(--text-secondary)",
      marginBottom: "6px",
      display: "flex",
      alignItems: "center",
      gap: "2px",
    },
    requiredStar: {
      color: "var(--error)",
    },
    textInput: {
      width: "100%",
      padding: "8px 12px",
      background: "var(--bg-secondary)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)",
      color: "var(--text-primary)",
      fontSize: "13px",
      outline: "none",
      transition: "border-color 0.15s",
      boxSizing: "border-box" as const,
    },
    textareaWrap: {
      position: "relative" as const,
      display: "flex",
      flexDirection: "column" as const,
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
      background: "var(--bg-secondary)",
      overflow: "hidden",
      transition: "border-color 0.15s",
    },
    textarea: {
      width: "100%",
      minHeight: "120px",
      padding: "12px 14px",
      background: "transparent",
      border: "none",
      color: "var(--text-primary)",
      fontSize: "13px",
      lineHeight: 1.6,
      resize: "vertical" as const,
      outline: "none",
      fontFamily: "inherit",
      boxSizing: "border-box" as const,
    },
    textareaFooter: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "6px 10px",
      borderTop: "1px solid var(--border)",
      background: "var(--bg-tertiary)",
    },
    selectPill: {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      padding: "4px 10px",
      background: "var(--bg-secondary)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)",
      color: "var(--text-secondary)",
      fontSize: "11px",
      cursor: "pointer",
      transition: "all 0.12s",
    },
    folderRow: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
    },
    folderBtn: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "7px 14px",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)",
      background: "var(--bg-secondary)",
      color: "var(--text-secondary)",
      fontSize: "12px",
      cursor: "pointer",
      transition: "all 0.12s",
    },
    checkbox: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontSize: "12px",
      color: "var(--text-secondary)",
      cursor: "pointer",
    },
    frequencyRow: {
      display: "flex",
      alignItems: "flex-end",
      gap: "12px",
    },
    select: {
      padding: "8px 30px 8px 12px",
      background: "var(--bg-secondary)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)",
      color: "var(--text-primary)",
      fontSize: "13px",
      outline: "none",
      cursor: "pointer",
      appearance: "none" as const,
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
      backgroundRepeat: "no-repeat",
      backgroundPosition: "right 10px center",
      transition: "border-color 0.15s",
    },
    timePill: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "6px 14px",
      background: "var(--bg-secondary)",
      border: "1px solid var(--border)",
      borderRadius: "20px",
      color: "var(--text-primary)",
      fontSize: "13px",
      fontWeight: 500,
    },
    schedNote: {
      fontSize: "11px",
      color: "var(--text-dim)",
      lineHeight: 1.5,
      fontStyle: "italic" as const,
    },
    btnCancel: {
      padding: "8px 18px",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--border)",
      background: "var(--bg-secondary)",
      color: "var(--text-secondary)",
      fontSize: "13px",
      fontWeight: 500,
      cursor: "pointer",
      transition: "all 0.15s",
    },
    btnCreate: (disabled: boolean) => ({
      padding: "8px 18px",
      borderRadius: "var(--radius-md)",
      border: "none",
      background: disabled ? "var(--bg-tertiary)" : "var(--accent)",
      color: disabled ? "var(--text-muted)" : "#fff",
      fontSize: "13px",
      fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "all 0.15s",
      opacity: disabled ? 0.5 : 1,
    }),
    // Detail view
    detailBackBtn: {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      background: "none",
      border: "none",
      color: "var(--text-secondary)",
      fontSize: "12px",
      cursor: "pointer",
      padding: "4px 8px",
      borderRadius: "var(--radius-sm)",
      transition: "all 0.15s",
    },
    detailTitle: {
      fontSize: "18px",
      fontWeight: 700,
      color: "var(--text-primary)",
    },
    detailSection: {
      display: "flex",
      flexDirection: "column" as const,
      gap: "6px",
    },
    detailLabel: {
      fontSize: "10px",
      fontWeight: 600,
      textTransform: "uppercase" as const,
      letterSpacing: "0.06em",
      color: "var(--text-muted)",
    },
    detailValue: {
      fontSize: "13px",
      color: "var(--text-primary)",
    },
    detailPrompt: {
      fontSize: "13px",
      color: "var(--text-primary)",
      background: "var(--bg-secondary)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)",
      padding: "12px 14px",
      whiteSpace: "pre-wrap" as const,
      lineHeight: 1.6,
      maxHeight: "200px",
      overflowY: "auto" as const,
    },
    detailGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "16px",
    },
    historyItem: {
      display: "flex",
      alignItems: "flex-start",
      gap: "8px",
      padding: "10px 12px",
      borderBottom: "1px solid var(--border)",
      fontSize: "12px",
    },
    // Remote dialog tabs
    tabRow: {
      display: "flex",
      borderBottom: "1px solid var(--border)",
      gap: 0,
    },
    tab: (active: boolean) => ({
      padding: "8px 16px",
      fontSize: "13px",
      fontWeight: active ? 600 : 400,
      color: active ? "var(--text-primary)" : "var(--text-muted)",
      background: "none",
      border: "none",
      borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
      cursor: "pointer",
      transition: "all 0.12s",
    }),
  };

  // -------------------------------------------------------------------------
  // Render: Empty state
  // -------------------------------------------------------------------------

  const renderEmptyState = () => (
    <div style={styles.empty}>
      <div style={styles.emptyIcon}>
        <ClockIcon size={56} />
      </div>
      <div style={styles.emptyText}>No scheduled tasks yet.</div>
    </div>
  );

  // -------------------------------------------------------------------------
  // Render: Task card
  // -------------------------------------------------------------------------

  const renderTaskCard = (task: ScheduledTask) => (
    <div
      key={task.id}
      style={styles.taskCard}
      onClick={() => setSelectedTaskId(task.id)}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-hover)";
        (e.currentTarget as HTMLDivElement).style.background = "var(--bg-tertiary)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLDivElement).style.background = "var(--bg-secondary)";
      }}
    >
      <div style={styles.taskCardLeft}>
        <div style={styles.taskCardName}>{task.name}</div>
        <div style={styles.taskCardMeta}>
          <span>{describeSchedule(task.schedule)}</span>
          {task.lastRun && (
            <>
              <span style={{ color: "var(--text-dim)" }}>|</span>
              <span style={styles.statusPill(task.lastRun.status)}>
                {task.lastRun.status === "success" ? "Succeeded" : task.lastRun.status === "error" ? "Failed" : "Running"}
              </span>
            </>
          )}
          {task.nextRun && task.enabled && (
            <>
              <span style={{ color: "var(--text-dim)" }}>|</span>
              <span>Next: {formatFutureTimestamp(task.nextRun)}</span>
            </>
          )}
        </div>
      </div>
      <div style={styles.taskCardRight} onClick={(e) => e.stopPropagation()}>
        <div
          style={styles.toggleTrack(task.enabled)}
          onClick={() => handleToggleEnabled(task.id)}
          title={task.enabled ? "Disable" : "Enable"}
        >
          <div style={styles.toggleThumb(task.enabled)} />
        </div>
      </div>
    </div>
  );

  // -------------------------------------------------------------------------
  // Render: Detail view
  // -------------------------------------------------------------------------

  const renderDetailView = () => {
    if (!selectedTask) return null;
    return (
      <div style={{ flex: 1, overflow: "auto", padding: "24px 32px", display: "flex", flexDirection: "column" as const, gap: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            style={styles.detailBackBtn}
            onClick={() => setSelectedTaskId(null)}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              style={{ ...styles.btnCancel, fontSize: "12px", padding: "5px 12px" }}
              onClick={() => handleDelete(selectedTask.id)}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--error)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--error)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
              }}
            >
              Delete
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={styles.detailTitle}>{selectedTask.name}</div>
          <div style={styles.statusPill(selectedTask.lastRun?.status)}>
            {selectedTask.enabled ? (selectedTask.lastRun?.status === "error" ? "Error" : "Active") : "Paused"}
          </div>
        </div>

        {selectedTask.description && (
          <div style={styles.detailSection}>
            <div style={styles.detailLabel}>Description</div>
            <div style={styles.detailValue}>{selectedTask.description}</div>
          </div>
        )}

        {selectedTask.prompt && (
          <div style={styles.detailSection}>
            <div style={styles.detailLabel}>Prompt</div>
            <div style={styles.detailPrompt}>{selectedTask.prompt}</div>
          </div>
        )}

        <div style={styles.detailGrid}>
          <div style={styles.detailSection}>
            <div style={styles.detailLabel}>Schedule</div>
            <div style={styles.detailValue}>{describeSchedule(selectedTask.schedule)}</div>
          </div>
          <div style={styles.detailSection}>
            <div style={styles.detailLabel}>Type</div>
            <div style={{ ...styles.detailValue, display: "flex", alignItems: "center", gap: "6px" }}>
              {selectedTask.taskType === "local" ? <MonitorIcon /> : <CloudIcon />}
              {selectedTask.taskType === "local" ? "Local" : "Remote"}
            </div>
          </div>
          <div style={styles.detailSection}>
            <div style={styles.detailLabel}>Model</div>
            <div style={styles.detailValue}>
              {MODEL_OPTIONS.find((o) => o.value === selectedTask.model)?.label || selectedTask.model}
            </div>
          </div>
          <div style={styles.detailSection}>
            <div style={styles.detailLabel}>Created</div>
            <div style={styles.detailValue}>{formatTimestamp(selectedTask.createdAt)}</div>
          </div>
          {selectedTask.cwd && (
            <div style={styles.detailSection}>
              <div style={styles.detailLabel}>Directory</div>
              <div style={{ ...styles.detailValue, fontFamily: "var(--font-mono)", fontSize: "12px" }}>{selectedTask.cwd}</div>
            </div>
          )}
          <div style={styles.detailSection}>
            <div style={styles.detailLabel}>Permissions</div>
            <div style={styles.detailValue}>
              {PERMISSION_OPTIONS.find((o) => o.value === selectedTask.permissions)?.label || selectedTask.permissions}
            </div>
          </div>
        </div>

        <div style={styles.detailSection}>
          <div style={styles.detailLabel}>Run History</div>
          {runHistory.length === 0 ? (
            <div style={{ fontSize: "12px", color: "var(--text-dim)", padding: "8px 0" }}>No runs recorded yet.</div>
          ) : (
            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
              {runHistory.slice(0, 10).map((entry, idx) => (
                <div key={idx} style={styles.historyItem}>
                  <span style={{ flexShrink: 0, marginTop: "1px", color: entry.status === "success" ? "#34c759" : "var(--error)" }}>
                    {entry.status === "success" ? (
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8.5l3.5 3.5L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    )}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: "2px", minWidth: 0 }}>
                    <span style={{ color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {entry.summary}
                    </span>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                      {formatTimestamp(entry.timestamp)} -- {formatDuration(entry.durationMs)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Render: New Local Task Dialog
  // -------------------------------------------------------------------------

  const renderLocalDialog = () => (
    <div style={styles.modalOverlay} onClick={() => setDialogType(null)}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>New scheduled task</div>
          <button
            style={styles.modalCloseBtn}
            onClick={() => setDialogType(null)}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
          >
            <XIcon />
          </button>
        </div>
        <div style={styles.modalBody}>
          {/* Info banner */}
          <div style={styles.infoBanner}>
            <span style={styles.infoBannerIcon}><InfoIcon /></span>
            <span>Local tasks only run while your computer is awake.</span>
          </div>

          {/* Name */}
          <div>
            <div style={styles.fieldLabel}>Name <span style={styles.requiredStar}>*</span></div>
            <input
              style={styles.textInput}
              type="text"
              placeholder="e.g. Daily code review"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--accent)"; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          {/* Description */}
          <div>
            <div style={styles.fieldLabel}>Description <span style={styles.requiredStar}>*</span></div>
            <input
              style={styles.textInput}
              type="text"
              placeholder="Brief description of what this task does"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--accent)"; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          {/* Prompt textarea with footer bar */}
          <div>
            <div style={styles.fieldLabel}>Prompt</div>
            <div style={styles.textareaWrap}>
              <textarea
                ref={promptRef}
                style={styles.textarea}
                placeholder="What should Tensor do when this task runs?"
                value={formPrompt}
                onChange={(e) => setFormPrompt(e.target.value)}
              />
              <div style={styles.textareaFooter}>
                <div style={{ display: "flex", gap: "8px" }}>
                  <div
                    style={styles.selectPill}
                    onClick={() => {
                      const idx = PERMISSION_OPTIONS.findIndex((o) => o.value === formPermissions);
                      setFormPermissions(PERMISSION_OPTIONS[(idx + 1) % PERMISSION_OPTIONS.length].value);
                    }}
                  >
                    {PERMISSION_OPTIONS.find((o) => o.value === formPermissions)?.label}
                    <ChevronDownIcon />
                  </div>
                  <div
                    style={styles.selectPill}
                    onClick={() => {
                      const idx = MODEL_OPTIONS.findIndex((o) => o.value === formModel);
                      setFormModel(MODEL_OPTIONS[(idx + 1) % MODEL_OPTIONS.length].value);
                    }}
                  >
                    {MODEL_OPTIONS.find((o) => o.value === formModel)?.label}
                    <ChevronDownIcon />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Folder + Worktree */}
          <div style={styles.folderRow}>
            <button
              style={styles.folderBtn}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-hover)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
              onClick={() => {
                const folder = prompt("Enter folder path:");
                if (folder) setFormCwd(folder);
              }}
            >
              <FolderIcon />
              {formCwd || "Select folder"}
            </button>
            <label style={styles.checkbox}>
              <input
                type="checkbox"
                checked={formWorktree}
                onChange={(e) => setFormWorktree(e.target.checked)}
                style={{ accentColor: "var(--accent)" }}
              />
              worktree
            </label>
          </div>

          {/* Frequency */}
          <div>
            <div style={styles.fieldLabel}>Frequency</div>
            <div style={styles.frequencyRow}>
              <select
                style={{ ...styles.select, minWidth: "130px" }}
                value={formFrequency}
                onChange={(e) => setFormFrequency(e.target.value as ScheduledTask["schedule"]["type"])}
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom</option>
              </select>

              {formFrequency === "weekly" && (
                <select
                  style={{ ...styles.select, minWidth: "120px" }}
                  value={formDayOfWeek}
                  onChange={(e) => setFormDayOfWeek(Number(e.target.value))}
                >
                  {DAY_NAMES.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
              )}

              {formFrequency === "custom" && (
                <input
                  style={{ ...styles.textInput, maxWidth: "200px" }}
                  type="text"
                  placeholder="0 9 * * 1-5"
                  value={formCronExpr}
                  onChange={(e) => setFormCronExpr(e.target.value)}
                />
              )}
            </div>
          </div>

          {/* Time pill */}
          {formFrequency !== "hourly" && formFrequency !== "custom" && (
            <div>
              <div style={styles.fieldLabel}>Time</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={styles.timePill}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M8 4.5V8l2.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {formatTime12(formTime)}
                </div>
                <input
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-primary)",
                    fontSize: "12px",
                    padding: "4px 8px",
                    outline: "none",
                    colorScheme: "dark",
                  }}
                />
              </div>
            </div>
          )}

          {/* Scheduling note */}
          <div style={styles.schedNote}>
            Scheduled tasks use a randomized delay of several minutes for server performance.
          </div>
        </div>

        {/* Footer */}
        <div style={styles.modalFooter}>
          <button
            style={styles.btnCancel}
            onClick={() => setDialogType(null)}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
          >
            Cancel
          </button>
          <button
            style={styles.btnCreate(!formName.trim() || !formDescription.trim())}
            disabled={!formName.trim() || !formDescription.trim()}
            onClick={handleCreate}
          >
            Create task
          </button>
        </div>
      </div>
    </div>
  );

  // -------------------------------------------------------------------------
  // Render: New Remote Task Dialog
  // -------------------------------------------------------------------------

  const renderRemoteDialog = () => (
    <div style={styles.modalOverlay} onClick={() => setDialogType(null)}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>New scheduled task</div>
          <button
            style={styles.modalCloseBtn}
            onClick={() => setDialogType(null)}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
          >
            <XIcon />
          </button>
        </div>

        <div style={styles.modalBody}>
          {/* Name */}
          <div>
            <div style={styles.fieldLabel}>Name <span style={styles.requiredStar}>*</span></div>
            <input
              style={styles.textInput}
              type="text"
              placeholder="e.g. Nightly test suite"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--accent)"; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          {/* Description */}
          <div>
            <div style={styles.fieldLabel}>Description <span style={styles.requiredStar}>*</span></div>
            <input
              style={styles.textInput}
              type="text"
              placeholder="Brief description of what this task does"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--accent)"; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          {/* Prompt textarea with footer bar */}
          <div>
            <div style={styles.fieldLabel}>Prompt</div>
            <div style={styles.textareaWrap}>
              <textarea
                ref={promptRef}
                style={styles.textarea}
                placeholder="What should Tensor do when this task runs?"
                value={formPrompt}
                onChange={(e) => setFormPrompt(e.target.value)}
              />
              <div style={styles.textareaFooter}>
                <div style={{ display: "flex", gap: "8px" }}>
                  <div
                    style={styles.selectPill}
                    onClick={() => {
                      const idx = PERMISSION_OPTIONS.findIndex((o) => o.value === formPermissions);
                      setFormPermissions(PERMISSION_OPTIONS[(idx + 1) % PERMISSION_OPTIONS.length].value);
                    }}
                  >
                    {PERMISSION_OPTIONS.find((o) => o.value === formPermissions)?.label}
                    <ChevronDownIcon />
                  </div>
                  <div
                    style={styles.selectPill}
                    onClick={() => {
                      const idx = MODEL_OPTIONS.findIndex((o) => o.value === formModel);
                      setFormModel(MODEL_OPTIONS[(idx + 1) % MODEL_OPTIONS.length].value);
                    }}
                  >
                    {MODEL_OPTIONS.find((o) => o.value === formModel)?.label}
                    <ChevronDownIcon />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Connectors / Permissions tabs */}
          <div>
            <div style={styles.tabRow}>
              <button
                style={styles.tab(remoteTab === "connectors")}
                onClick={() => setRemoteTab("connectors")}
              >
                Connectors
              </button>
              <button
                style={styles.tab(remoteTab === "permissions")}
                onClick={() => setRemoteTab("permissions")}
              >
                Permissions
              </button>
            </div>
            <div style={{ padding: "14px 0" }}>
              {remoteTab === "connectors" ? (
                <div style={{ fontSize: "12px", color: "var(--text-dim)", padding: "12px 0" }}>
                  No connectors configured. Connect a GitHub repo, Slack workspace, or other integration to give this task access.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" as const, gap: "8px" }}>
                  <label style={styles.checkbox}>
                    <input type="checkbox" defaultChecked style={{ accentColor: "var(--accent)" }} />
                    Allow reading files
                  </label>
                  <label style={styles.checkbox}>
                    <input type="checkbox" style={{ accentColor: "var(--accent)" }} />
                    Allow writing files
                  </label>
                  <label style={styles.checkbox}>
                    <input type="checkbox" style={{ accentColor: "var(--accent)" }} />
                    Allow running commands
                  </label>
                  <label style={styles.checkbox}>
                    <input type="checkbox" style={{ accentColor: "var(--accent)" }} />
                    Allow network access
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Frequency */}
          <div>
            <div style={styles.fieldLabel}>Frequency</div>
            <div style={styles.frequencyRow}>
              <select
                style={{ ...styles.select, minWidth: "130px" }}
                value={formFrequency}
                onChange={(e) => setFormFrequency(e.target.value as ScheduledTask["schedule"]["type"])}
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom</option>
              </select>

              {formFrequency === "weekly" && (
                <select
                  style={{ ...styles.select, minWidth: "120px" }}
                  value={formDayOfWeek}
                  onChange={(e) => setFormDayOfWeek(Number(e.target.value))}
                >
                  {DAY_NAMES.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
              )}

              {formFrequency === "custom" && (
                <input
                  style={{ ...styles.textInput, maxWidth: "200px" }}
                  type="text"
                  placeholder="0 9 * * 1-5"
                  value={formCronExpr}
                  onChange={(e) => setFormCronExpr(e.target.value)}
                />
              )}
            </div>
          </div>

          {/* Time pill */}
          {formFrequency !== "hourly" && formFrequency !== "custom" && (
            <div>
              <div style={styles.fieldLabel}>Time</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={styles.timePill}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M8 4.5V8l2.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {formatTime12(formTime)}
                </div>
                <input
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-primary)",
                    fontSize: "12px",
                    padding: "4px 8px",
                    outline: "none",
                    colorScheme: "dark",
                  }}
                />
              </div>
            </div>
          )}

          {/* Scheduling note */}
          <div style={styles.schedNote}>
            Scheduled tasks use a randomized delay of several minutes for server performance.
          </div>
        </div>

        {/* Footer */}
        <div style={styles.modalFooter}>
          <button
            style={styles.btnCancel}
            onClick={() => setDialogType(null)}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
          >
            Cancel
          </button>
          <button
            style={styles.btnCreate(!formName.trim() || !formDescription.trim())}
            disabled={!formName.trim() || !formDescription.trim()}
            onClick={handleCreate}
          >
            Create task
          </button>
        </div>
      </div>
    </div>
  );

  // =========================================================================
  // Main render
  // =========================================================================

  if (!isOpen) return null;

  return (
    <div style={styles.container}>
      {/* Header row */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>Scheduled tasks</div>
        <div style={styles.newTaskBtnWrap} ref={dropdownRef}>
          <button
            style={styles.newTaskBtn}
            onClick={() => setShowNewDropdown(!showNewDropdown)}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-hover)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-tertiary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-secondary)";
            }}
          >
            <PlusIcon /> New task <ChevronDownIcon />
          </button>
          {showNewDropdown && (
            <div style={styles.dropdown}>
              <button
                style={styles.dropdownItem}
                onClick={() => openDialog("local")}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-tertiary)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <span style={styles.dropdownIcon}><MonitorIcon /></span>
                New local task
              </button>
              <button
                style={styles.dropdownItem}
                onClick={() => openDialog("remote")}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-tertiary)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <span style={styles.dropdownIcon}><CloudIcon /></span>
                New remote task
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Description text */}
      <div style={styles.descriptionText}>
        Run tasks on a schedule or whenever you need them.
        Type <span style={styles.codeInline}>/schedule</span> in any existing session to set one up.
      </div>

      {/* Body: detail view, task list, or empty state */}
      <div style={styles.body}>
        {selectedTask ? (
          renderDetailView()
        ) : tasks.length === 0 ? (
          renderEmptyState()
        ) : (
          <div style={styles.taskList}>
            {tasks.map(renderTaskCard)}
          </div>
        )}
      </div>

      {/* Modal dialogs */}
      {dialogType === "local" && renderLocalDialog()}
      {dialogType === "remote" && renderRemoteDialog()}
    </div>
  );
}
