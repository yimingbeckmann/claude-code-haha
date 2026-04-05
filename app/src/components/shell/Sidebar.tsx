import React, { useState, useCallback, useEffect, useRef } from "react";
import "../../styles/sidebar.css";

/* ── Public types ── */

export interface SidebarSession {
  id: string;
  title: string;
  timestamp: number;
  archived?: boolean;
  pinned?: boolean;
  cloud?: boolean;
  model?: string;
}

export type NavPanel = "sessions" | "search" | "agents" | "tasks" | "scheduled" | "dispatch" | "memory" | "settings" | "customize" | "kairos" | "swarm" | "security-review" | "insights" | "stickers" | "undercover" | "ultra-review" | "verifiers" | null;

export interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
  sessions: SidebarSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onRenameSession?: (id: string, name: string) => void;
  onArchiveSession?: (id: string) => void;
  onDuplicateSession?: (id: string) => void;
  onDeleteSession?: (id: string) => void;
  onPinSession?: (id: string) => void;
  userName?: string;
  /* Panel callbacks */
  onOpenSearch?: () => void;
  onOpenScheduled?: () => void;
  onOpenDispatch?: () => void;
  onOpenCustomize?: () => void;
  onOpenAgents?: () => void;
  onOpenTasks?: () => void;
  onOpenMemory?: () => void;
  activePanel?: NavPanel;
  /** Connection status: "connected" | "disconnected" | "connecting" */
  connectionStatus?: "connected" | "disconnected" | "connecting";
  version?: string;
  onOpenHelp?: () => void;
  /* New feature toggles */
  onOpenFileTree?: () => void;
  onOpenHistory?: () => void;
  onOpenMCP?: () => void;
  onOpenExport?: () => void;
  onOpenSystemPrompt?: () => void;
  /* New panel toggles */
  onOpenKairos?: () => void;
  onOpenSwarm?: () => void;
  onOpenSecurityReview?: () => void;
  onOpenInsights?: () => void;
  onOpenStickers?: () => void;
  onOpenUndercover?: () => void;
  onOpenUltraReview?: () => void;
  onOpenVerifiers?: () => void;
}

/* ── Helpers ── */

interface ContextMenuState {
  sessionId: string;
  x: number;
  y: number;
}

function getTimeGroup(ts: number): string {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 6 * 86400000;
  if (ts >= todayStart) return "Today";
  if (ts >= yesterdayStart) return "Yesterday";
  if (ts >= weekStart) return "This week";
  return "Older";
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= todayStart) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const TIME_GROUP_ORDER = ["Today", "Yesterday", "This week", "Older"];

/* ── SVG icon components ── */

function IconSessions() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v7a1.5 1.5 0 01-1.5 1.5H5L2 14V3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconAgents() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10.5 10c2.5 0 4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconTasks() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconScheduled() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5V8l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDispatch() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 8l11-5-3 11-2.5-4.5L2 8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7.5 9.5L13 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconMemory() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1C5.5 1 3 3 3 5.5c0 1.5.8 2.8 2 3.5v2a1 1 0 001 1h4a1 1 0 001-1V9c1.2-.7 2-2 2-3.5C13 3 10.5 1 8 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6 13h4v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 1v1.5M8 13.5V15M14.5 8H13M3 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5L3.4 3.4"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
      />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconChevron({ direction }: { direction: "left" | "right" | "down" }) {
  const d =
    direction === "left"
      ? "M10 3L5 8l5 5"
      : direction === "right"
        ? "M6 3l5 5-5 5"
        : "M4 6l4 4 4-4";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRename() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M11 1l4 4-9 9H2v-4l9-9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M5 1l6 3-2 4 4 4H3l4-4-2-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6 12v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconArchive() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 6v7a1 1 0 001 1h10a1 1 0 001-1V6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 9h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconDelete() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 4h12M5 4V2.5A1.5 1.5 0 016.5 1h3A1.5 1.5 0 0111 2.5V4M13 4v9.5a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 13.5V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCollapse() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconHelp() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 6a2 2 0 113 1.7c-.5.4-1 .8-1 1.3v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="12" r="0.5" fill="currentColor" />
    </svg>
  );
}

/* ── New panel icons ── */

function IconKairos() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 6h4M6 9h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <text x="8" y="8" textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize="8" fontWeight="bold" fontFamily="var(--font-mono)">K</text>
    </svg>
  );
}

function IconSwarm() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="4" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="4" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 6v2M6.5 10L5 10.5M9.5 10l1.5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5L2.5 4v4c0 3.5 2.5 5.5 5.5 6.5 3-1 5.5-3 5.5-6.5V4L8 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6 8l1.5 1.5L10 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 14h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 11V8M6 11V5M9 11V7M12 11V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconStar() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5l2 4 4.5.5-3.25 3 .75 4.5L8 11.5l-4 2 .75-4.5L1.5 6l4.5-.5 2-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="10.5" r="1" fill="currentColor" />
    </svg>
  );
}

function IconMagnifier() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 5v4M5 7h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconCheckmark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Injected footer styles ── */

const FOOTER_STYLE = `
.sidebar-footer-enhanced {
  border-top: 1px solid var(--border);
  padding: var(--space-2) var(--space-3);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.sidebar-footer-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 10px;
  color: var(--text-dim);
  font-family: var(--font-mono);
}

.sidebar-footer-status {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sidebar-footer-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sidebar-footer-dot--connected {
  background: var(--success);
  box-shadow: 0 0 4px rgba(34, 197, 94, 0.4);
}

.sidebar-footer-dot--disconnected {
  background: var(--error);
}

.sidebar-footer-dot--connecting {
  background: var(--warning);
  animation: pulse 1.5s ease-in-out infinite;
}

.sidebar-footer-sep {
  color: var(--text-dim);
  opacity: 0.3;
}

.sidebar-footer-help {
  display: flex;
  align-items: center;
  gap: 3px;
  background: none;
  border: none;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 10px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  transition: color 0.12s, background 0.12s;
  margin-left: auto;
}

.sidebar-footer-help:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.sidebar-footer-collapse-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* ── Header styles ── */

.sidebar-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-3) var(--space-1);
  flex-shrink: 0;
}

.sidebar-header-logo {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  overflow: hidden;
}

.sidebar-header-logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--radius-sm);
}

.sidebar-header-title {
  flex: 1;
  font-family: var(--font-sans);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-header-collapse {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-dim);
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.12s, background 0.12s;
  opacity: 0;
}

.sidebar-header:hover .sidebar-header-collapse {
  opacity: 0.6;
}

.sidebar-header-collapse:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
  opacity: 1;
}

.sidebar--collapsed .sidebar-header {
  justify-content: center;
  padding: var(--space-3) var(--space-2) var(--space-1);
}

.sidebar--collapsed .sidebar-header-title,
.sidebar--collapsed .sidebar-header-collapse {
  display: none;
}

/* ── Model badge on session items ── */

.sidebar-item-model {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  background: var(--bg-badge);
  color: var(--text-dim);
  flex-shrink: 0;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.12s;
}

.sidebar-item:hover .sidebar-item-model {
  opacity: 0.7;
}

.sidebar-item-time-text {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  white-space: nowrap;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.sidebar-item:hover .sidebar-item-time-text {
  opacity: 0.7;
}

.sidebar--collapsed .sidebar-item-model,
.sidebar--collapsed .sidebar-item-time-text {
  display: none;
}

.sidebar--collapsed .sidebar-footer-enhanced {
  padding: var(--space-2) var(--space-1);
  align-items: center;
}

.sidebar--collapsed .sidebar-footer-row {
  display: none;
}

.sidebar--collapsed .sidebar-footer-help {
  display: none;
}

.sidebar--collapsed .sidebar-header-logo {
  margin: 0 auto;
}
`;

/* ── Component ── */

export default function Sidebar({
  isOpen,
  onToggle,
  onNewSession,
  onOpenSettings,
  sessions,
  activeSessionId,
  onSelectSession,
  onRenameSession,
  onArchiveSession,
  onDuplicateSession: _onDuplicateSession,
  onDeleteSession,
  onPinSession,
  userName = "User",
  onOpenSearch,
  onOpenScheduled,
  onOpenDispatch,
  onOpenCustomize,
  onOpenAgents,
  onOpenTasks,
  onOpenMemory,
  activePanel = null,
  connectionStatus = "connected",
  version = "v2.4",
  onOpenHelp,
  onOpenKairos,
  onOpenSwarm,
  onOpenSecurityReview,
  onOpenInsights,
  onOpenStickers,
  onOpenUndercover,
  onOpenUltraReview,
  onOpenVerifiers,
}: SidebarProps) {
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  /* ── Close context menu on outside click ── */
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  /* ── Close context menu on Escape ── */
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [contextMenu]);

  /* ── Focus rename input ── */
  useEffect(() => {
    if (renamingId) renameRef.current?.focus();
  }, [renamingId]);

  /* ── Filter sessions by search ── */
  const filtered = sessions.filter((s) => {
    if (s.archived) return false;
    if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  /* ── Sort: pinned first, then by timestamp desc ── */
  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.timestamp - a.timestamp;
  });

  /* ── Group by time ── */
  const groups: Record<string, SidebarSession[]> = {};
  for (const s of sorted) {
    const group = getTimeGroup(s.timestamp);
    (groups[group] ??= []).push(s);
  }

  /* ── Context menu handlers ── */
  const handleContextMenu = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    setContextMenu({ sessionId, x: e.clientX, y: e.clientY });
  }, []);

  const handleContextAction = useCallback(
    (action: string) => {
      if (!contextMenu) return;
      const { sessionId } = contextMenu;
      setContextMenu(null);

      switch (action) {
        case "rename": {
          const session = sessions.find((s) => s.id === sessionId);
          setRenamingId(sessionId);
          setRenameValue(session?.title ?? "");
          break;
        }
        case "pin":
          onPinSession?.(sessionId);
          break;
        case "archive":
          onArchiveSession?.(sessionId);
          break;
        case "delete":
          onDeleteSession?.(sessionId);
          break;
      }
    },
    [contextMenu, sessions, onPinSession, onArchiveSession, onDeleteSession]
  );

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onRenameSession?.(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  }, [renamingId, renameValue, onRenameSession]);

  /* ── Nav items definition ── */
  const navItems: { key: NavPanel; label: string; icon: React.ReactNode; handler?: () => void }[] = [
    { key: "sessions", label: "Sessions", icon: <IconSessions />, handler: undefined },
    { key: "search", label: "Search", icon: <IconSearch />, handler: onOpenSearch },
    { key: "settings", label: "Settings", icon: <IconGear />, handler: onOpenSettings },
  ];

  /* ── Feature panel items ── */
  const featurePanelItems: { key: NavPanel; label: string; icon: React.ReactNode; handler?: () => void }[] = [
    { key: "kairos", label: "KAIROS", icon: <IconKairos />, handler: onOpenKairos },
    { key: "swarm", label: "Swarm", icon: <IconSwarm />, handler: onOpenSwarm },
    { key: "security-review", label: "Security Review", icon: <IconShield />, handler: onOpenSecurityReview },
    { key: "insights", label: "Insights", icon: <IconChart />, handler: onOpenInsights },
    { key: "stickers", label: "Stickers", icon: <IconStar />, handler: onOpenStickers },
    { key: "undercover", label: "Undercover", icon: <IconLock />, handler: onOpenUndercover },
    { key: "ultra-review", label: "Ultra Review", icon: <IconMagnifier />, handler: onOpenUltraReview },
    { key: "verifiers", label: "Verifiers", icon: <IconCheckmark />, handler: onOpenVerifiers },
  ];

  /* ── Quick action buttons ── */
  const quickActions = [
    { label: "Files", icon: "\u{1F4C1}", handler: onOpenAgents }, // Reuse callback - AppShell will handle
    { label: "Git", icon: "\u{1F500}", handler: onOpenTasks },
    { label: "History", icon: "\u{1F550}", handler: onOpenMemory },
  ];

  const sidebarClass = `sidebar ${isOpen ? "sidebar--expanded" : "sidebar--collapsed"}`;

  const statusLabel =
    connectionStatus === "connected"
      ? "Connected"
      : connectionStatus === "connecting"
        ? "Connecting..."
        : "Disconnected";

  return (
    <>
      <style>{FOOTER_STYLE}</style>
      <aside className={sidebarClass}>

        {/* ── New Session button ── */}
        <div className="sidebar-top">
          <button className="sidebar-new-btn" onClick={onNewSession} title="New session">
            <IconPlus />
            <span className="sidebar-new-btn-label">New session</span>
          </button>
        </div>

        {/* ── Navigation items ── */}
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`sidebar-nav-item ${activePanel === item.key ? "sidebar-nav-item--active" : ""}`}
              onClick={item.handler}
              title={item.label}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              <span className="sidebar-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* ── Feature panels ── */}
        <nav className="sidebar-nav sidebar-nav--features">
          <div className="sidebar-nav-divider" />
          {featurePanelItems.map((item) => (
            <button
              key={item.key}
              className={`sidebar-nav-item ${activePanel === item.key ? "sidebar-nav-item--active" : ""}`}
              onClick={item.handler}
              title={item.label}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              <span className="sidebar-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* ── Session search filter ── */}
        <div className="sidebar-search">
          <div className="sidebar-search-wrap">
            <svg className="sidebar-search-icon" width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              className="sidebar-search-input"
              type="text"
              placeholder="Filter sessions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="sidebar-search-clear" onClick={() => setSearch("")} title="Clear">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* ── Session list grouped by time ── */}
        <div className="sidebar-sessions">
          {sorted.length === 0 && <div className="sidebar-empty">No sessions</div>}
          {TIME_GROUP_ORDER.map((groupName) => {
            const items = groups[groupName];
            if (!items || items.length === 0) return null;
            return (
              <div className="sidebar-time-group" key={groupName}>
                <div className="sidebar-time-label">{groupName}</div>
                {items.map((s) => {
                  const isActive = s.id === activeSessionId;
                  return (
                    <div
                      key={s.id}
                      className={`sidebar-item ${isActive ? "sidebar-item--active" : ""} ${s.pinned ? "sidebar-item--pinned" : ""}`}
                      onClick={() => onSelectSession(s.id)}
                      onContextMenu={(e) => handleContextMenu(e, s.id)}
                      title={s.title}
                    >
                      <span className={`sidebar-item-dot ${isActive ? "sidebar-item-dot--active" : ""}`} />
                      {renamingId === s.id ? (
                        <input
                          ref={renameRef}
                          className="sidebar-rename-input"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") {
                              setRenamingId(null);
                              setRenameValue("");
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="sidebar-item-title">{s.title}</span>
                      )}
                      <span className="sidebar-item-time-text">{formatTime(s.timestamp)}</span>
                      {s.model && <span className="sidebar-item-model">{s.model}</span>}
                      {s.pinned && (
                        <span className="sidebar-item-pin-badge" title="Pinned">
                          <svg width="8" height="8" viewBox="0 0 16 16" fill="none">
                            <path d="M5 1l6 3-2 4 4 4H3l4-4-2-4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                          </svg>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* ── Footer ── */}
        <div className="sidebar-footer-enhanced">
          <div className="sidebar-footer-row">
            <div className="sidebar-footer-status">
              <span className={`sidebar-footer-dot sidebar-footer-dot--${connectionStatus}`} />
              <span>{statusLabel}</span>
            </div>
            <span className="sidebar-footer-sep">&middot;</span>
            <span>{version}</span>
            {onOpenHelp && (
              <button className="sidebar-footer-help" onClick={onOpenHelp} title="Help">
                <IconHelp />
                <span>Help</span>
              </button>
            )}
          </div>
          <div className="sidebar-footer-collapse-row">
            <button className="sidebar-toggle-btn" onClick={onToggle} title={isOpen ? "Collapse sidebar" : "Expand sidebar"}>
              <IconCollapse />
              <span className="sidebar-toggle-label">{isOpen ? "Collapse" : ""}</span>
            </button>
          </div>
        </div>

        {/* ── Context menu ── */}
        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="sidebar-context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button className="sidebar-context-item" onClick={() => handleContextAction("rename")}>
              <IconRename /> Rename
            </button>
            <button className="sidebar-context-item" onClick={() => handleContextAction("pin")}>
              <IconPin /> {sessions.find((s) => s.id === contextMenu.sessionId)?.pinned ? "Unpin" : "Pin"}
            </button>
            <button className="sidebar-context-item" onClick={() => handleContextAction("archive")}>
              <IconArchive /> Archive
            </button>
            <div className="sidebar-context-sep" />
            <button className="sidebar-context-item sidebar-context-item--danger" onClick={() => handleContextAction("delete")}>
              <IconDelete /> Delete
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
