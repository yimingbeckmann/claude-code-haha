import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DiffFileEntry {
  path: string;
  diff: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface DiffViewerProps {
  files: DiffFileEntry[];
  onAccept: (path: string) => void;
  onReject: (path: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onClose: () => void;
  isOpen: boolean;
}

/* ------------------------------------------------------------------ */
/*  Parsed diff structures                                             */
/* ------------------------------------------------------------------ */

interface ParsedLine {
  type: 'added' | 'removed' | 'context' | 'header';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

interface ParsedHunk {
  header: string;
  lines: ParsedLine[];
}

interface ParsedFile {
  path: string;
  hunks: ParsedHunk[];
  additions: number;
  deletions: number;
}

/* ------------------------------------------------------------------ */
/*  Unified diff parser                                                */
/* ------------------------------------------------------------------ */

function parseDiff(raw: string): ParsedHunk[] {
  const lines = raw.split('\n');
  const hunks: ParsedHunk[] = [];
  let current: ParsedHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    // Skip file headers
    if (line.startsWith('---') || line.startsWith('+++')) continue;

    if (line.startsWith('@@')) {
      // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      oldLine = match ? parseInt(match[1], 10) : 1;
      newLine = match ? parseInt(match[2], 10) : 1;
      current = { header: line, lines: [] };
      hunks.push(current);
      continue;
    }

    if (!current) {
      // Lines before first hunk header -- start an implicit hunk
      current = { header: '', lines: [] };
      hunks.push(current);
      oldLine = 1;
      newLine = 1;
    }

    if (line.startsWith('+')) {
      current.lines.push({
        type: 'added',
        content: line.slice(1),
        newLineNum: newLine,
      });
      newLine++;
    } else if (line.startsWith('-')) {
      current.lines.push({
        type: 'removed',
        content: line.slice(1),
        oldLineNum: oldLine,
      });
      oldLine++;
    } else {
      // Context line (may start with a space, or be empty)
      const content = line.startsWith(' ') ? line.slice(1) : line;
      current.lines.push({
        type: 'context',
        content,
        oldLineNum: oldLine,
        newLineNum: newLine,
      });
      oldLine++;
      newLine++;
    }
  }

  return hunks;
}

function countChanges(hunks: ParsedHunk[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'added') additions++;
      else if (line.type === 'removed') deletions++;
    }
  }
  return { additions, deletions };
}

/* ------------------------------------------------------------------ */
/*  File extension color helper                                        */
/* ------------------------------------------------------------------ */

function extensionColor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: '#3178c6',
    tsx: '#3178c6',
    js: '#f7df1e',
    jsx: '#f7df1e',
    py: '#3572a5',
    rs: '#dea584',
    go: '#00add8',
    css: '#563d7c',
    scss: '#c6538c',
    html: '#e34c26',
    json: '#a0a0a0',
    md: '#888',
    yaml: '#cb171e',
    yml: '#cb171e',
    toml: '#9c4221',
    sh: '#4eaa25',
    sql: '#e38c00',
  };
  return map[ext] ?? 'var(--text-secondary, #888)';
}

/* ------------------------------------------------------------------ */
/*  Side-by-side diff builder                                          */
/* ------------------------------------------------------------------ */

interface SideBySidePair {
  left: ParsedLine | null;
  right: ParsedLine | null;
}

function buildSideBySide(lines: ParsedLine[]): SideBySidePair[] {
  const pairs: SideBySidePair[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.type === 'context') {
      pairs.push({ left: line, right: line });
      i++;
    } else if (line.type === 'removed') {
      // Collect consecutive removed, then consecutive added
      const removed: ParsedLine[] = [];
      while (i < lines.length && lines[i].type === 'removed') {
        removed.push(lines[i]);
        i++;
      }
      const added: ParsedLine[] = [];
      while (i < lines.length && lines[i].type === 'added') {
        added.push(lines[i]);
        i++;
      }
      const maxLen = Math.max(removed.length, added.length);
      for (let k = 0; k < maxLen; k++) {
        pairs.push({
          left: removed[k] ?? null,
          right: added[k] ?? null,
        });
      }
    } else if (line.type === 'added') {
      pairs.push({ left: null, right: line });
      i++;
    } else {
      i++;
    }
  }

  return pairs;
}

/* ------------------------------------------------------------------ */
/*  CSS (injected via <style> tag)                                     */
/* ------------------------------------------------------------------ */

const DIFF_VIEWER_CSS = `
/* ── Overlay ── */
.dv-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: var(--bg-primary, #0a0a0f);
  display: flex;
  flex-direction: column;
  color: var(--text-primary, rgba(255, 255, 255, 0.90));
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  animation: dv-fadein 0.15s ease-out;
}

@keyframes dv-fadein {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* ── Header ── */
.dv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border, #2a2a36);
  background: var(--bg-code, #0d0d14);
  flex-shrink: 0;
}

.dv-header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.dv-title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.dv-counter {
  font-size: 12px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.55));
  background: var(--bg-badge, rgba(255, 255, 255, 0.06));
  padding: 3px 10px;
  border-radius: 10px;
}

.dv-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dv-btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--border, #2a2a36);
  background: var(--bg-surface, #15151f);
  color: var(--text-primary, #ccc);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.dv-btn:hover {
  background: var(--bg-elevated, #1e1e2a);
  border-color: var(--border-hover, #3a3a48);
}

.dv-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dv-btn-accept {
  background: var(--success-dim, rgba(34, 197, 94, 0.12));
  border-color: rgba(34, 197, 94, 0.3);
  color: var(--success-text, #4ade80);
}

.dv-btn-accept:hover {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.5);
}

.dv-btn-reject {
  background: var(--error-dim, rgba(239, 68, 68, 0.12));
  border-color: rgba(239, 68, 68, 0.3);
  color: var(--error-text, #f87171);
}

.dv-btn-reject:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
}

.dv-btn-primary {
  background: var(--accent, #e84520);
  border-color: var(--accent, #e84520);
  color: #fff;
  font-weight: 600;
}

.dv-btn-primary:hover {
  background: var(--accent-hover, #f06030);
  border-color: var(--accent-hover, #f06030);
}

.dv-close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary, #888);
  font-size: 18px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.dv-close-btn:hover {
  background: var(--bg-hover, rgba(255, 255, 255, 0.05));
  color: #fff;
}

/* ── Body ── */
.dv-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── Sidebar ── */
.dv-sidebar {
  width: 280px;
  min-width: 280px;
  border-right: 1px solid var(--border, #2a2a36);
  overflow-y: auto;
  background: var(--bg-secondary, #12121a);
  flex-shrink: 0;
  scrollbar-width: thin;
  scrollbar-color: #2a2a3a transparent;
}

.dv-sidebar::-webkit-scrollbar {
  width: 6px;
}

.dv-sidebar::-webkit-scrollbar-track {
  background: transparent;
}

.dv-sidebar::-webkit-scrollbar-thumb {
  background: #2a2a3a;
  border-radius: 3px;
}

.dv-sidebar-header {
  padding: 10px 12px 8px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted, rgba(255, 255, 255, 0.30));
  text-transform: uppercase;
  letter-spacing: 0.8px;
  border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.04));
}

.dv-file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.1s;
  font-size: 13px;
}

.dv-file-item:hover {
  background: var(--bg-hover, rgba(255, 255, 255, 0.05));
}

.dv-file-item.dv-selected {
  background: var(--bg-active, rgba(255, 255, 255, 0.08));
  border-left-color: var(--accent, #e84520);
}

.dv-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dv-status-dot.pending {
  background: var(--warning, #f59e0b);
}

.dv-status-dot.accepted {
  background: var(--success, #22c55e);
}

.dv-status-dot.rejected {
  background: var(--error, #ef4444);
}

.dv-file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dv-file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary, #d0d0d0);
  font-size: 13px;
}

.dv-file-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted, rgba(255, 255, 255, 0.30));
  font-size: 11px;
}

.dv-file-stats {
  display: flex;
  gap: 5px;
  font-size: 11px;
  font-family: "SF Mono", "Fira Code", "Cascadia Code", Menlo, Consolas, monospace;
  flex-shrink: 0;
}

.dv-stat-add {
  color: var(--success-text, #4ade80);
}

.dv-stat-del {
  color: var(--error-text, #f87171);
}

/* ── Main content ── */
.dv-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── File header (sticky) ── */
.dv-file-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-code, #0d0d14);
  border-bottom: 1px solid var(--border, #2a2a36);
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 10;
}

.dv-file-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.dv-file-header-path {
  font-family: "SF Mono", "Fira Code", "Cascadia Code", Menlo, Consolas, monospace;
  font-size: 13px;
  color: var(--text-primary, #d0d0d0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dv-file-header-ext {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg-badge, rgba(255, 255, 255, 0.06));
  font-family: "SF Mono", "Fira Code", "Cascadia Code", Menlo, Consolas, monospace;
}

.dv-file-header-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.dv-file-header-status.pending {
  background: var(--warning-dim, rgba(245, 158, 11, 0.12));
  color: var(--warning-text, #fbbf24);
}

.dv-file-header-status.accepted {
  background: var(--success-dim, rgba(34, 197, 94, 0.12));
  color: var(--success-text, #4ade80);
}

.dv-file-header-status.rejected {
  background: var(--error-dim, rgba(239, 68, 68, 0.12));
  color: var(--error-text, #f87171);
}

.dv-file-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dv-view-toggle {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--border, #2a2a36);
  background: var(--bg-surface, #15151f);
  color: var(--text-secondary, #888);
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.dv-view-toggle:hover {
  background: var(--bg-elevated, #1e1e2a);
  color: var(--text-primary, #ccc);
}

.dv-view-toggle.active {
  background: var(--accent-dim, rgba(232, 69, 32, 0.15));
  border-color: rgba(232, 69, 32, 0.3);
  color: var(--accent-text, #ff7a50);
}

/* ── Diff pane ── */
.dv-diff-pane {
  flex: 1;
  overflow: auto;
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: #2a2a3a transparent;
}

.dv-diff-pane::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.dv-diff-pane::-webkit-scrollbar-track {
  background: transparent;
}

.dv-diff-pane::-webkit-scrollbar-thumb {
  background: #2a2a3a;
  border-radius: 3px;
}

/* ── Hunk header ── */
.dv-hunk-header {
  padding: 6px 16px;
  background: rgba(99, 102, 241, 0.06);
  color: var(--info-text, #60a5fa);
  font-family: "SF Mono", "Fira Code", "Cascadia Code", Menlo, Consolas, monospace;
  font-size: 12px;
  border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.04));
  border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.04));
  user-select: none;
}

/* ── Unified diff table ── */
.dv-table {
  width: 100%;
  border-collapse: collapse;
  font-family: "SF Mono", "Fira Code", "Cascadia Code", Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.55;
}

.dv-line {
  transition: filter 0.1s;
}

.dv-line:hover {
  filter: brightness(1.15);
}

.dv-line-num {
  width: 48px;
  min-width: 48px;
  padding: 0 8px;
  text-align: right;
  color: var(--text-muted, rgba(255, 255, 255, 0.30));
  user-select: none;
  vertical-align: top;
  border-right: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.04));
  font-size: 12px;
}

.dv-line-content {
  padding: 0 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

.dv-line-prefix {
  display: inline-block;
  width: 1ch;
  user-select: none;
  color: var(--text-muted, rgba(255, 255, 255, 0.30));
}

/* Unified line types */
.dv-line-added {
  background: rgba(34, 197, 94, 0.15);
}

.dv-line-added .dv-line-num {
  background: rgba(34, 197, 94, 0.1);
  color: var(--success-text, #4ade80);
}

.dv-line-added .dv-line-content {
  color: #d4edda;
}

.dv-line-added .dv-line-prefix {
  color: var(--success-text, #4ade80);
}

.dv-line-removed {
  background: rgba(239, 68, 68, 0.15);
}

.dv-line-removed .dv-line-num {
  background: rgba(239, 68, 68, 0.1);
  color: var(--error-text, #f87171);
}

.dv-line-removed .dv-line-content {
  color: #f8d7da;
}

.dv-line-removed .dv-line-prefix {
  color: var(--error-text, #f87171);
}

.dv-line-context {
  background: transparent;
}

.dv-line-context .dv-line-content {
  color: var(--text-secondary, rgba(255, 255, 255, 0.55));
}

/* ── Side-by-side layout ── */
.dv-sbs-table {
  width: 100%;
  border-collapse: collapse;
  font-family: "SF Mono", "Fira Code", "Cascadia Code", Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.55;
  table-layout: fixed;
}

.dv-sbs-table .dv-sbs-num {
  width: 48px;
  min-width: 48px;
  padding: 0 8px;
  text-align: right;
  color: var(--text-muted, rgba(255, 255, 255, 0.30));
  user-select: none;
  vertical-align: top;
  font-size: 12px;
}

.dv-sbs-table .dv-sbs-content {
  padding: 0 12px;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: hidden;
}

.dv-sbs-table .dv-sbs-divider {
  width: 1px;
  background: var(--border, #2a2a36);
  padding: 0;
}

.dv-sbs-row {
  transition: filter 0.1s;
}

.dv-sbs-row:hover {
  filter: brightness(1.15);
}

/* Side-by-side cell coloring */
.dv-sbs-cell-removed {
  background: rgba(239, 68, 68, 0.15);
}

.dv-sbs-cell-removed .dv-sbs-num {
  background: rgba(239, 68, 68, 0.1);
  color: var(--error-text, #f87171);
}

.dv-sbs-cell-removed .dv-sbs-content {
  color: #f8d7da;
}

.dv-sbs-cell-added {
  background: rgba(34, 197, 94, 0.15);
}

.dv-sbs-cell-added .dv-sbs-num {
  background: rgba(34, 197, 94, 0.1);
  color: var(--success-text, #4ade80);
}

.dv-sbs-cell-added .dv-sbs-content {
  color: #d4edda;
}

.dv-sbs-cell-changed {
  background: rgba(245, 158, 11, 0.1);
}

.dv-sbs-cell-changed .dv-sbs-num {
  background: rgba(245, 158, 11, 0.08);
  color: var(--warning-text, #fbbf24);
}

.dv-sbs-cell-empty {
  background: var(--bg-hover, rgba(255, 255, 255, 0.02));
}

.dv-sbs-cell-context .dv-sbs-content {
  color: var(--text-secondary, rgba(255, 255, 255, 0.55));
}

/* ── Empty state ── */
.dv-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted, rgba(255, 255, 255, 0.30));
  font-size: 14px;
}

/* ── Keyboard hint bar ── */
.dv-kbd-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 16px;
  border-top: 1px solid var(--border, #2a2a36);
  background: var(--bg-secondary, #12121a);
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted, rgba(255, 255, 255, 0.30));
}

.dv-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  font-size: 10px;
  font-family: "SF Mono", "Fira Code", "Cascadia Code", Menlo, Consolas, monospace;
  font-weight: 500;
  color: var(--text-secondary, #d4d4e4);
  background: var(--bg-surface, #1a1a2e);
  border: 1px solid var(--border, #2e2e48);
  border-radius: 3px;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.3);
  line-height: 1;
  margin-right: 4px;
}
`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const DiffViewer: React.FC<DiffViewerProps> = ({
  files,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  onClose,
  isOpen,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'unified' | 'side-by-side'>('unified');
  const sidebarRef = useRef<HTMLDivElement>(null);
  const diffPaneRef = useRef<HTMLDivElement>(null);

  // ── Parse all files ──
  const parsed = useMemo<ParsedFile[]>(() => {
    return files.map((f) => {
      const hunks = parseDiff(f.diff);
      const { additions, deletions } = countChanges(hunks);
      return { path: f.path, hunks, additions, deletions };
    });
  }, [files]);

  const selectedFile = files[selectedIndex] ?? null;
  const selectedParsed = parsed[selectedIndex] ?? null;

  // ── Review counter ──
  const reviewedCount = useMemo(
    () => files.filter((f) => f.status !== 'pending').length,
    [files],
  );

  // ── Inject stylesheet ──
  useEffect(() => {
    const id = 'dv-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = DIFF_VIEWER_CSS;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, []);

  // ── Clamp selected index when files change ──
  useEffect(() => {
    if (selectedIndex >= files.length) {
      setSelectedIndex(Math.max(0, files.length - 1));
    }
  }, [files.length, selectedIndex]);

  // ── Scroll selected file into view in sidebar ──
  useEffect(() => {
    const el = sidebarRef.current?.querySelector('.dv-selected');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // ── Scroll diff pane to top when switching files ──
  useEffect(() => {
    if (diffPaneRef.current) {
      diffPaneRef.current.scrollTop = 0;
    }
  }, [selectedIndex]);

  // ── Navigate files ──
  const goNext = useCallback(() => {
    setSelectedIndex((prev) => Math.min(files.length - 1, prev + 1));
  }, [files.length]);

  const goPrev = useCallback(() => {
    setSelectedIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const acceptCurrent = useCallback(() => {
    if (selectedFile) onAccept(selectedFile.path);
  }, [selectedFile, onAccept]);

  const rejectCurrent = useCallback(() => {
    if (selectedFile) onReject(selectedFile.path);
  }, [selectedFile, onReject]);

  // ── Keyboard shortcuts ──
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLInputElement
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'escape':
          e.preventDefault();
          onClose();
          break;
        case 'a':
          e.preventDefault();
          acceptCurrent();
          break;
        case 'r':
          e.preventDefault();
          rejectCurrent();
          break;
        case 'n':
          e.preventDefault();
          goNext();
          break;
        case 'p':
          e.preventDefault();
          goPrev();
          break;
      }
    },
    [onClose, acceptCurrent, rejectCurrent, goNext, goPrev],
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // ── Render unified diff ──
  const renderUnified = useCallback(
    (pf: ParsedFile) => {
      return pf.hunks.map((hunk, hi) => (
        <React.Fragment key={hi}>
          {hunk.header && (
            <div className="dv-hunk-header">{hunk.header}</div>
          )}
          <table className="dv-table">
            <tbody>
              {hunk.lines.map((line, li) => {
                const cls =
                  line.type === 'added'
                    ? 'dv-line dv-line-added'
                    : line.type === 'removed'
                      ? 'dv-line dv-line-removed'
                      : 'dv-line dv-line-context';

                const prefix =
                  line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';

                return (
                  <tr key={`${hi}-${li}`} className={cls}>
                    <td className="dv-line-num">
                      {line.type !== 'added' ? (line.oldLineNum ?? '') : ''}
                    </td>
                    <td className="dv-line-num">
                      {line.type !== 'removed' ? (line.newLineNum ?? '') : ''}
                    </td>
                    <td className="dv-line-content">
                      <span className="dv-line-prefix">{prefix}</span>
                      {line.content}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </React.Fragment>
      ));
    },
    [],
  );

  // ── Render side-by-side diff ──
  const renderSideBySide = useCallback(
    (pf: ParsedFile) => {
      return pf.hunks.map((hunk, hi) => {
        const pairs = buildSideBySide(hunk.lines);

        return (
          <React.Fragment key={hi}>
            {hunk.header && (
              <div className="dv-hunk-header">{hunk.header}</div>
            )}
            <table className="dv-sbs-table">
              <tbody>
                {pairs.map((pair, pi) => {
                  const { left, right } = pair;

                  // Determine cell classes
                  let leftCls = 'dv-sbs-cell-context';
                  let rightCls = 'dv-sbs-cell-context';

                  if (left && right && left.type === 'removed' && right.type === 'added') {
                    // Changed line pair
                    leftCls = 'dv-sbs-cell-changed';
                    rightCls = 'dv-sbs-cell-changed';
                  } else {
                    if (left?.type === 'removed') leftCls = 'dv-sbs-cell-removed';
                    if (!left) leftCls = 'dv-sbs-cell-empty';
                    if (right?.type === 'added') rightCls = 'dv-sbs-cell-added';
                    if (!right) rightCls = 'dv-sbs-cell-empty';
                  }

                  return (
                    <tr key={`${hi}-${pi}`} className="dv-sbs-row">
                      {/* Left (old) side */}
                      <td className={`dv-sbs-num ${leftCls}`}>
                        {left?.oldLineNum ?? ''}
                      </td>
                      <td className={`dv-sbs-content ${leftCls}`}>
                        {left?.content ?? ''}
                      </td>
                      {/* Divider */}
                      <td className="dv-sbs-divider" />
                      {/* Right (new) side */}
                      <td className={`dv-sbs-num ${rightCls}`}>
                        {right?.newLineNum ?? (right?.type === 'context' ? right.newLineNum : '')}
                      </td>
                      <td className={`dv-sbs-content ${rightCls}`}>
                        {right?.content ?? ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </React.Fragment>
        );
      });
    },
    [],
  );

  if (!isOpen) return null;

  return (
    <div className="dv-overlay">
      {/* Header */}
      <div className="dv-header">
        <div className="dv-header-left">
          <span className="dv-title">Diff Viewer</span>
          <span className="dv-counter">
            {reviewedCount} of {files.length} changes reviewed
          </span>
        </div>
        <div className="dv-header-actions">
          <button className="dv-btn dv-btn-accept" onClick={onAcceptAll}>
            Accept All
          </button>
          <button className="dv-btn dv-btn-reject" onClick={onRejectAll}>
            Reject All
          </button>
          <button className="dv-close-btn" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="dv-body">
        {/* Sidebar */}
        <div className="dv-sidebar" ref={sidebarRef}>
          <div className="dv-sidebar-header">
            Changed Files ({files.length})
          </div>
          {files.map((file, idx) => {
            const pf = parsed[idx];
            const dir = file.path.includes('/')
              ? file.path.substring(0, file.path.lastIndexOf('/'))
              : '';
            const filename = file.path.split('/').pop() ?? file.path;

            return (
              <div
                key={file.path}
                className={`dv-file-item ${idx === selectedIndex ? 'dv-selected' : ''}`}
                onClick={() => setSelectedIndex(idx)}
                title={file.path}
              >
                <span className={`dv-status-dot ${file.status}`} />
                <div className="dv-file-info">
                  <span className="dv-file-name">{filename}</span>
                  {dir && <span className="dv-file-path">{dir}</span>}
                </div>
                <span className="dv-file-stats">
                  <span className="dv-stat-add">+{pf?.additions ?? 0}</span>
                  <span className="dv-stat-del">-{pf?.deletions ?? 0}</span>
                </span>
              </div>
            );
          })}
        </div>

        {/* Main area */}
        <div className="dv-main">
          {selectedFile && selectedParsed ? (
            <>
              {/* Sticky file header */}
              <div className="dv-file-header">
                <div className="dv-file-header-left">
                  <span
                    className="dv-file-header-ext"
                    style={{ color: extensionColor(selectedFile.path) }}
                  >
                    {selectedFile.path.split('.').pop()?.toUpperCase() ?? ''}
                  </span>
                  <span className="dv-file-header-path">{selectedFile.path}</span>
                  <span className={`dv-file-header-status ${selectedFile.status}`}>
                    {selectedFile.status}
                  </span>
                </div>
                <div className="dv-file-header-actions">
                  <button
                    className={`dv-view-toggle ${viewMode === 'unified' ? 'active' : ''}`}
                    onClick={() => setViewMode('unified')}
                  >
                    Unified
                  </button>
                  <button
                    className={`dv-view-toggle ${viewMode === 'side-by-side' ? 'active' : ''}`}
                    onClick={() => setViewMode('side-by-side')}
                  >
                    Split
                  </button>
                  <button
                    className="dv-btn dv-btn-accept"
                    onClick={() => onAccept(selectedFile.path)}
                  >
                    Accept
                  </button>
                  <button
                    className="dv-btn dv-btn-reject"
                    onClick={() => onReject(selectedFile.path)}
                  >
                    Reject
                  </button>
                </div>
              </div>

              {/* Diff content */}
              <div className="dv-diff-pane" ref={diffPaneRef}>
                {viewMode === 'unified'
                  ? renderUnified(selectedParsed)
                  : renderSideBySide(selectedParsed)}
              </div>
            </>
          ) : (
            <div className="dv-empty">Select a file to view its diff</div>
          )}
        </div>
      </div>

      {/* Keyboard shortcut hints */}
      <div className="dv-kbd-bar">
        <span><kbd className="dv-kbd">A</kbd> Accept</span>
        <span><kbd className="dv-kbd">R</kbd> Reject</span>
        <span><kbd className="dv-kbd">N</kbd> Next file</span>
        <span><kbd className="dv-kbd">P</kbd> Prev file</span>
        <span><kbd className="dv-kbd">Esc</kbd> Close</span>
      </div>
    </div>
  );
};

export default DiffViewer;
