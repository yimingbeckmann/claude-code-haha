import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TerminalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onResize: (height: number) => void;
}

interface CommandEntry {
  id: string;
  command: string;
  output: string;
  exitCode: number | null; // null = still running
  startTime: number;
  endTime: number | null;
  cwd: string;
}

interface TerminalTab {
  id: string;
  label: string;
  history: CommandEntry[];
  cwd: string;
  isRunning: boolean;
}

/* ------------------------------------------------------------------ */
/*  ANSI color map (16 basic)                                          */
/* ------------------------------------------------------------------ */

const ANSI_COLORS: Record<number, string> = {
  30: '#1e1e1e', 31: '#e06c75', 32: '#98c379', 33: '#e5c07b',
  34: '#61afef', 35: '#c678dd', 36: '#56b6c2', 37: '#abb2bf',
  90: '#5c6370', 91: '#e06c75', 92: '#98c379', 93: '#e5c07b',
  94: '#61afef', 95: '#c678dd', 96: '#56b6c2', 97: '#ffffff',
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: '#1e1e1e', 41: '#e06c75', 42: '#98c379', 43: '#e5c07b',
  44: '#61afef', 45: '#c678dd', 46: '#56b6c2', 47: '#abb2bf',
  100: '#5c6370', 101: '#e06c75', 102: '#98c379', 103: '#e5c07b',
  104: '#61afef', 105: '#c678dd', 106: '#56b6c2', 107: '#ffffff',
};

function parseAnsi(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let fg: string | undefined;
  let bg: string | undefined;
  let bold = false;
  let italic = false;
  let underline = false;
  let idx = 0;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const segment = text.slice(lastIndex, match.index);
      const style: CSSProperties = {};
      if (fg) style.color = fg;
      if (bg) style.backgroundColor = bg;
      if (bold) style.fontWeight = 'bold';
      if (italic) style.fontStyle = 'italic';
      if (underline) style.textDecoration = 'underline';
      parts.push(<span key={idx++} style={style}>{segment}</span>);
    }
    lastIndex = regex.lastIndex;

    const codes = match[1].split(';').map(Number);
    for (const code of codes) {
      if (code === 0) { fg = undefined; bg = undefined; bold = false; italic = false; underline = false; }
      else if (code === 1) bold = true;
      else if (code === 3) italic = true;
      else if (code === 4) underline = true;
      else if (ANSI_COLORS[code]) fg = ANSI_COLORS[code];
      else if (ANSI_BG_COLORS[code]) bg = ANSI_BG_COLORS[code];
    }
  }

  if (lastIndex < text.length) {
    const segment = text.slice(lastIndex);
    const style: CSSProperties = {};
    if (fg) style.color = fg;
    if (bg) style.backgroundColor = bg;
    if (bold) style.fontWeight = 'bold';
    if (italic) style.fontStyle = 'italic';
    if (underline) style.textDecoration = 'underline';
    parts.push(<span key={idx++} style={style}>{segment}</span>);
  }

  return parts.length ? parts : [text];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

let _idCounter = 0;
const uid = () => `t-${Date.now()}-${++_idCounter}`;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.floor(s % 60);
  return `${m}m ${rs}s`;
}

function createTab(index: number): TerminalTab {
  return {
    id: uid(),
    label: `Terminal ${index}`,
    history: [],
    cwd: '~',
    isRunning: false,
  };
}

/* ------------------------------------------------------------------ */
/*  Inline keyframe injection (once)                                   */
/* ------------------------------------------------------------------ */

const KEYFRAMES_ID = '__terminal-panel-keyframes__';
function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes tp-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  `;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const S = {
  root: (isOpen: boolean, height: number): CSSProperties => ({
    display: isOpen ? 'flex' : 'none',
    flexDirection: 'column',
    position: 'relative',
    height,
    minHeight: 120,
    maxHeight: '80vh',
    background: '#0a0a0f',
    borderTop: '1px solid #1e1e2e',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    fontSize: 13,
    color: '#abb2bf',
    overflow: 'hidden',
  }),

  resizeHandle: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    cursor: 'ns-resize',
    zIndex: 10,
    background: 'transparent',
  } as CSSProperties,

  resizeHandleHover: {
    background: '#f97316',
  } as CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    height: 36,
    background: '#0d0d14',
    borderBottom: '1px solid #1e1e2e',
    flexShrink: 0,
  } as CSSProperties,

  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
  } as CSSProperties,

  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  } as CSSProperties,

  cwd: {
    fontSize: 11,
    color: '#5c6370',
    marginLeft: 8,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 200,
  } as CSSProperties,

  tab: (active: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    fontSize: 12,
    color: active ? '#f97316' : '#5c6370',
    background: active ? '#14141f' : 'transparent',
    border: 'none',
    borderBottom: active ? '2px solid #f97316' : '2px solid transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'color 0.15s, background 0.15s',
  }),

  tabClose: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    borderRadius: 3,
    border: 'none',
    background: 'transparent',
    color: '#5c6370',
    fontSize: 14,
    lineHeight: 1,
    cursor: 'pointer',
    padding: 0,
  } as CSSProperties,

  addTab: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderRadius: 4,
    border: 'none',
    background: 'transparent',
    color: '#5c6370',
    fontSize: 16,
    cursor: 'pointer',
    padding: 0,
  } as CSSProperties,

  headerBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    color: '#5c6370',
    fontSize: 12,
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: 3,
  } as CSSProperties,

  outputArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 12px',
  } as CSSProperties,

  commandBlock: {
    marginBottom: 12,
  } as CSSProperties,

  commandHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  } as CSSProperties,

  prompt: {
    color: '#f97316',
    fontWeight: 'bold',
    userSelect: 'none',
  } as CSSProperties,

  commandText: {
    color: '#e5e5e5',
    flex: 1,
  } as CSSProperties,

  badge: (code: number | null): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 'bold',
    padding: '1px 6px',
    borderRadius: 8,
    color: '#0a0a0f',
    background: code === null ? '#f97316' : code === 0 ? '#98c379' : '#e06c75',
    minWidth: 18,
  }),

  timing: {
    fontSize: 10,
    color: '#5c6370',
  } as CSSProperties,

  copyBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: '1px solid #2a2a3a',
    color: '#5c6370',
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 3,
    cursor: 'pointer',
  } as CSSProperties,

  outputPre: {
    margin: '4px 0 0 18px',
    padding: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    fontSize: 12,
    lineHeight: 1.5,
  } as CSSProperties,

  collapseBtn: {
    display: 'inline-block',
    background: 'transparent',
    border: 'none',
    color: '#f97316',
    fontSize: 11,
    cursor: 'pointer',
    padding: '2px 0',
    marginTop: 2,
    marginLeft: 18,
  } as CSSProperties,

  inputRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
    borderTop: '1px solid #1e1e2e',
    background: '#0d0d14',
    flexShrink: 0,
  } as CSSProperties,

  inputPrefix: {
    color: '#f97316',
    fontWeight: 'bold',
    marginRight: 8,
    userSelect: 'none',
  } as CSSProperties,

  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#e5e5e5',
    fontSize: 13,
    fontFamily: 'inherit',
    caretColor: '#f97316',
  } as CSSProperties,

  pulsingDot: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#f97316',
    animation: 'tp-pulse 1.2s ease-in-out infinite',
  } as CSSProperties,

  searchOverlay: {
    position: 'absolute' as const,
    top: 40,
    left: 12,
    right: 12,
    background: '#14141f',
    border: '1px solid #f97316',
    borderRadius: 6,
    padding: '8px 12px',
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  } as CSSProperties,

  searchInput: {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#e5e5e5',
    fontSize: 13,
    fontFamily: 'inherit',
    caretColor: '#f97316',
    width: '100%',
  } as CSSProperties,

  searchLabel: {
    fontSize: 11,
    color: '#5c6370',
  } as CSSProperties,

  searchMatch: {
    fontSize: 12,
    color: '#abb2bf',
    padding: '2px 0',
  } as CSSProperties,
};

/* ------------------------------------------------------------------ */
/*  Simulated command execution                                        */
/* ------------------------------------------------------------------ */

function simulateCommand(
  command: string,
  cwd: string,
): { output: string; exitCode: number; newCwd: string } {
  const trimmed = command.trim();
  if (!trimmed) return { output: '', exitCode: 0, newCwd: cwd };

  if (trimmed.startsWith('cd ')) {
    const target = trimmed.slice(3).trim() || '~';
    return { output: '', exitCode: 0, newCwd: target };
  }
  if (trimmed === 'pwd') {
    return { output: cwd, exitCode: 0, newCwd: cwd };
  }

  // Default: echo back
  return {
    output: `\x1b[33m[simulated]\x1b[0m Command executed: ${trimmed}`,
    exitCode: 0,
    newCwd: cwd,
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const COLLAPSE_THRESHOLD = 20;

function TerminalPanel({ isOpen, onClose, onResize }: TerminalPanelProps) {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [createTab(1)]);
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);
  const [panelHeight, setPanelHeight] = useState(320);
  const [collapsedOutputs, setCollapsedOutputs] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resizeHover, setResizeHover] = useState(false);
  const [historySearch, setHistorySearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatch, setSearchMatch] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const tabCounter = useRef(1);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  useEffect(() => {
    ensureKeyframes();
  }, []);

  // Auto-scroll on new output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [activeTab?.history.length]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen, activeTabId]);

  /* ---- Resize handle ---- */
  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeRef.current = { startY: e.clientY, startH: panelHeight };
      const onMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const delta = resizeRef.current.startY - ev.clientY;
        const newH = Math.max(120, Math.min(window.innerHeight * 0.8, resizeRef.current.startH + delta));
        setPanelHeight(newH);
        onResize(newH);
      };
      const onUp = () => {
        resizeRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [panelHeight, onResize],
  );

  /* ---- Tab management ---- */
  const addTab = useCallback(() => {
    tabCounter.current += 1;
    const t = createTab(tabCounter.current);
    setTabs((prev) => [...prev, t]);
    setActiveTabId(t.id);
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (next.length === 0) {
          const t = createTab(++tabCounter.current);
          setActiveTabId(t.id);
          return [t];
        }
        if (activeTabId === id) {
          const idx = prev.findIndex((t) => t.id === id);
          const newActive = next[Math.min(idx, next.length - 1)];
          setActiveTabId(newActive.id);
        }
        return next;
      });
    },
    [activeTabId],
  );

  /* ---- Command execution ---- */
  const runCommand = useCallback(
    (cmd: string) => {
      if (!cmd.trim()) return;

      const entryId = uid();
      const startTime = Date.now();

      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== activeTabId) return t;
          const entry: CommandEntry = {
            id: entryId,
            command: cmd,
            output: '',
            exitCode: null,
            startTime,
            endTime: null,
            cwd: t.cwd,
          };
          return { ...t, history: [...t.history, entry], isRunning: true };
        }),
      );

      // Simulate async execution
      setTimeout(() => {
        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== activeTabId) return t;
            const currentCwd = t.cwd;
            const { output, exitCode, newCwd } = simulateCommand(cmd, currentCwd);
            return {
              ...t,
              cwd: newCwd,
              isRunning: false,
              history: t.history.map((h) =>
                h.id === entryId
                  ? { ...h, output, exitCode, endTime: Date.now() }
                  : h,
              ),
            };
          }),
        );
      }, 200 + Math.random() * 400);

      setInputValue('');
      setHistoryIndex(-1);
    },
    [activeTabId],
  );

  /* ---- Collapse toggle ---- */
  const toggleCollapse = useCallback((id: string) => {
    setCollapsedOutputs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* ---- Copy ---- */
  const copyOutput = useCallback((entry: CommandEntry) => {
    const text = `$ ${entry.command}\n${entry.output}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }, []);

  /* ---- Clear ---- */
  const clearTerminal = useCallback(() => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId ? { ...t, history: [] } : t,
      ),
    );
  }, [activeTabId]);

  /* ---- History navigation ---- */
  const allCommands = activeTab.history.map((h) => h.command);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      // Ctrl+R history search
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        setHistorySearch(true);
        setSearchQuery('');
        setSearchMatch(null);
        setTimeout(() => searchRef.current?.focus(), 0);
        return;
      }

      if (e.key === 'Enter') {
        runCommand(inputValue);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (allCommands.length === 0) return;
        const next = historyIndex < allCommands.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(next);
        setInputValue(allCommands[allCommands.length - 1 - next] || '');
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex <= 0) {
          setHistoryIndex(-1);
          setInputValue('');
          return;
        }
        const next = historyIndex - 1;
        setHistoryIndex(next);
        setInputValue(allCommands[allCommands.length - 1 - next] || '');
      }
    },
    [inputValue, runCommand, allCommands, historyIndex],
  );

  /* ---- History search ---- */
  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        setHistorySearch(false);
        inputRef.current?.focus();
        return;
      }
      if (e.key === 'Enter' && searchMatch) {
        setInputValue(searchMatch);
        setHistorySearch(false);
        inputRef.current?.focus();
      }
    },
    [searchMatch],
  );

  const handleSearchChange = useCallback(
    (val: string) => {
      setSearchQuery(val);
      if (!val) {
        setSearchMatch(null);
        return;
      }
      const lower = val.toLowerCase();
      const match = [...allCommands].reverse().find((c) => c.toLowerCase().includes(lower));
      setSearchMatch(match ?? null);
    },
    [allCommands],
  );

  /* ---- Render output block ---- */
  const renderOutput = (entry: CommandEntry) => {
    if (!entry.output) return null;
    const lines = entry.output.split('\n');
    const isLong = lines.length > COLLAPSE_THRESHOLD;
    const isCollapsed = collapsedOutputs.has(entry.id);
    const shouldCollapse = isLong && !isCollapsed;

    const displayedLines = shouldCollapse
      ? lines.slice(0, COLLAPSE_THRESHOLD)
      : lines;

    return (
      <>
        <pre style={S.outputPre}>
          {displayedLines.map((line, i) => (
            <React.Fragment key={i}>
              {parseAnsi(line)}
              {i < displayedLines.length - 1 && '\n'}
            </React.Fragment>
          ))}
        </pre>
        {isLong && (
          <button
            style={S.collapseBtn}
            onClick={() => toggleCollapse(entry.id)}
          >
            {shouldCollapse
              ? `... ${lines.length - COLLAPSE_THRESHOLD} more lines (click to expand)`
              : 'Collapse'}
          </button>
        )}
      </>
    );
  };

  if (!isOpen) return null;

  return (
    <div style={S.root(isOpen, panelHeight)}>
      {/* Resize handle */}
      <div
        style={{
          ...S.resizeHandle,
          ...(resizeHover ? S.resizeHandleHover : {}),
        }}
        onMouseDown={onResizeStart}
        onMouseEnter={() => setResizeHover(true)}
        onMouseLeave={() => setResizeHover(false)}
      />

      {/* Header / tab bar */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          {tabs.map((t) => (
            <button
              key={t.id}
              style={S.tab(t.id === activeTabId)}
              onClick={() => setActiveTabId(t.id)}
            >
              {t.isRunning && <span style={S.pulsingDot} />}
              {t.label}
              <span
                style={S.tabClose}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                title="Close tab"
              >
                ×
              </span>
            </button>
          ))}
          <button style={S.addTab} onClick={addTab} title="New terminal">
            +
          </button>
          <span style={S.cwd} title={activeTab.cwd}>
            {activeTab.cwd}
          </span>
        </div>

        <div style={S.headerRight}>
          <button
            style={S.headerBtn}
            onClick={clearTerminal}
            title="Clear terminal"
          >
            Clear
          </button>
          <button style={S.headerBtn} onClick={onClose} title="Close panel">
            ✕
          </button>
        </div>
      </div>

      {/* History search overlay */}
      {historySearch && (
        <div style={S.searchOverlay}>
          <span style={S.searchLabel}>reverse-i-search:</span>
          <input
            ref={searchRef}
            style={S.searchInput}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="type to search history..."
          />
          {searchMatch && (
            <span style={S.searchMatch}>
              match: <span style={{ color: '#f97316' }}>{searchMatch}</span>
            </span>
          )}
          {searchQuery && !searchMatch && (
            <span style={{ ...S.searchMatch, color: '#e06c75' }}>
              no match
            </span>
          )}
        </div>
      )}

      {/* Output area */}
      <div ref={outputRef} style={S.outputArea}>
        {activeTab.history.map((entry) => (
          <div key={entry.id} style={S.commandBlock}>
            <div style={S.commandHeader}>
              <span style={S.prompt}>$</span>
              <span style={S.commandText}>{entry.command}</span>

              {/* Exit code badge */}
              <span style={S.badge(entry.exitCode)}>
                {entry.exitCode === null ? '...' : entry.exitCode}
              </span>

              {/* Execution time */}
              {entry.endTime && (
                <span style={S.timing}>
                  {formatDuration(entry.endTime - entry.startTime)}
                </span>
              )}

              {/* Copy button */}
              <button
                style={S.copyBtn}
                onClick={() => copyOutput(entry)}
                title="Copy command + output"
              >
                {copiedId === entry.id ? 'Copied' : 'Copy'}
              </button>
            </div>

            {renderOutput(entry)}
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={S.inputRow}>
        <span style={S.inputPrefix}>$</span>
        <input
          ref={inputRef}
          style={S.input}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter command..."
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </div>
  );
}

export default TerminalPanel;
