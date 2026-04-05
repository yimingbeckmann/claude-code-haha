import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// -- Types --------------------------------------------------------------------

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
}

interface FilePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  initialPath?: string;
  onFileSelect?: (path: string) => void;
}

interface SelectedFile {
  name: string;
  content: string;
}

// -- API helper ---------------------------------------------------------------

async function fetchPath(path: string): Promise<any> {
  const API =
    (window as any).__CLAW_CONFIG__?.apiBase || 'http://127.0.0.1:8899';
  const res = await fetch(`${API}/filesystem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// -- Helpers ------------------------------------------------------------------

function getExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : '';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function guessLanguage(name: string): string {
  const ext = getExtension(name);
  const map: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript (JSX)', js: 'JavaScript', jsx: 'JavaScript (JSX)',
    py: 'Python', rs: 'Rust', go: 'Go', java: 'Java', c: 'C', cpp: 'C++',
    css: 'CSS', scss: 'SCSS', html: 'HTML', json: 'JSON', md: 'Markdown',
    sh: 'Shell', bash: 'Shell', zsh: 'Shell', yaml: 'YAML', yml: 'YAML',
    toml: 'TOML', sql: 'SQL', xml: 'XML', rb: 'Ruby', php: 'PHP',
    swift: 'Swift', kt: 'Kotlin', lua: 'Lua', r: 'R',
  };
  return map[ext] || 'Plain Text';
}

function fileIcon(name: string): string {
  const ext = getExtension(name);
  if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) return '{}';
  if (['css', 'scss'].includes(ext)) return ' #';
  if (['json', 'yaml', 'yml'].includes(ext)) return '<>';
  if (ext === 'md') return ' *';
  if (ext === 'py') return ' >';
  if (['sh', 'bash', 'zsh'].includes(ext)) return ' $';
  if (ext === 'html') return ' <';
  return ' -';
}

function sortEntries(entries: FileEntry[]): FileEntry[] {
  const dirs = entries.filter(e => e.type === 'directory');
  const files = entries.filter(e => e.type === 'file');
  const cmp = (a: FileEntry, b: FileEntry) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  dirs.sort(cmp);
  files.sort(cmp);
  return [...dirs, ...files];
}

function pathSegments(p: string): { name: string; path: string }[] {
  // Handle tilde-prefixed paths
  if (p === '~') return [{ name: '~', path: '~' }];
  if (p.startsWith('~/')) {
    const rest = p.slice(2).split('/').filter(Boolean);
    const segments = [{ name: '~', path: '~' }];
    for (let i = 0; i < rest.length; i++) {
      segments.push({
        name: rest[i],
        path: '~/' + rest.slice(0, i + 1).join('/'),
      });
    }
    return segments;
  }

  // Absolute paths: collapse /Users/<name> to ~
  const parts = p.split('/').filter(Boolean);
  if (parts.length >= 2 && parts[0] === 'Users') {
    const segments = [{ name: '~', path: '/' + parts.slice(0, 2).join('/') }];
    for (let i = 2; i < parts.length; i++) {
      segments.push({
        name: parts[i],
        path: '/' + parts.slice(0, i + 1).join('/'),
      });
    }
    return segments;
  }

  // Generic path
  const segments: { name: string; path: string }[] = [];
  for (let i = 0; i < parts.length; i++) {
    segments.push({
      name: parts[i],
      path: '/' + parts.slice(0, i + 1).join('/'),
    });
  }
  return segments;
}

// -- Styles (inline, using CSS variables) -------------------------------------

const S = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 9998,
    background: 'rgba(0,0,0,0.35)',
  },

  panel: {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    bottom: 0,
    width: 'min(680px, 85vw)',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column' as const,
    background: 'var(--bg-primary)',
    borderLeft: '1px solid var(--border)',
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    color: 'var(--text-primary)',
    boxShadow: '-4px 0 32px rgba(0,0,0,0.5)',
    transition: 'transform 0.2s ease-out',
  },

  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },

  toolBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  pathInput: {
    flex: 1,
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    padding: '4px 8px',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    minWidth: 0,
  },

  breadcrumbs: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: '6px 12px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    flexWrap: 'wrap' as const,
    fontSize: 12,
    background: 'var(--bg-secondary)',
  },

  breadcrumbSep: {
    color: 'var(--text-muted)',
    margin: '0 2px',
    userSelect: 'none' as const,
  },

  breadcrumbItem: {
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    padding: '1px 3px',
    borderRadius: 'var(--radius-sm)',
  },

  breadcrumbItemLast: {
    cursor: 'default',
    color: 'var(--text-primary)',
    fontWeight: 600,
    padding: '1px 3px',
  },

  body: {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    overflow: 'hidden',
  },

  fileTree: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '4px 0',
  },

  fileEntry: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 14px',
    cursor: 'pointer',
    fontSize: 12,
    lineHeight: '22px',
    userSelect: 'none' as const,
  },

  fileEntryIcon: {
    width: 22,
    textAlign: 'center' as const,
    flexShrink: 0,
    fontWeight: 700,
    fontSize: 11,
  },

  fileEntryName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },

  fileEntrySize: {
    fontSize: 10,
    color: 'var(--text-muted)',
    flexShrink: 0,
  },

  previewPane: {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    overflow: 'hidden',
    borderTop: '1px solid var(--border)',
  },

  previewHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },

  previewContent: {
    display: 'flex',
    flex: 1,
    overflow: 'auto',
    background: 'var(--bg-primary)',
  },

  lineNumbers: {
    padding: '10px 0',
    textAlign: 'right' as const,
    userSelect: 'none' as const,
    flexShrink: 0,
    borderRight: '1px solid var(--border)',
    minWidth: 44,
    background: 'var(--bg-secondary)',
  },

  lineNum: {
    padding: '0 10px',
    lineHeight: '20px',
    fontSize: 11,
    color: 'var(--text-muted)',
  },

  codeArea: {
    flex: 1,
    padding: '10px 0',
    overflowX: 'auto' as const,
  },

  codeLine: {
    padding: '0 14px',
    lineHeight: '20px',
    whiteSpace: 'pre' as const,
    fontSize: 12,
  },

  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    flexDirection: 'column' as const,
    gap: 8,
    color: 'var(--text-muted)',
    fontSize: 12,
  },

  errorBanner: {
    padding: '8px 12px',
    background: 'var(--error-dim)',
    color: 'var(--error)',
    fontSize: 12,
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },

  loadingBar: {
    height: 2,
    background: 'var(--accent)',
    animation: 'shimmer 1.5s linear infinite',
    backgroundSize: '200% 100%',
    backgroundImage:
      'linear-gradient(90deg, var(--accent) 0%, var(--accent-bright) 50%, var(--accent) 100%)',
  },
};

// -- Component ----------------------------------------------------------------

export default function FilePreview({
  isOpen,
  onClose,
  initialPath,
  onFileSelect,
}: FilePreviewProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || '~');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState(initialPath || '~');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [hoveredEntry, setHoveredEntry] = useState<string | null>(null);
  const [slideIn, setSlideIn] = useState(false);

  const pathInputRef = useRef<HTMLInputElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  // Slide-in animation
  useEffect(() => {
    if (isOpen) {
      // Trigger on next frame for CSS transition
      requestAnimationFrame(() => setSlideIn(true));
    } else {
      setSlideIn(false);
    }
  }, [isOpen]);

  // Load directory when currentPath changes
  const loadDirectory = useCallback(async (dirPath: string) => {
    setLoading(true);
    setError(null);
    setSelectedFile(null);
    try {
      const data = await fetchPath(dirPath);
      if (data.type === 'directory' && Array.isArray(data.entries)) {
        setEntries(sortEntries(data.entries));
        setCurrentPath(dirPath);
        setPathInput(dirPath);
      } else {
        setError('Path is not a directory');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load directory');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load file content
  const loadFile = useCallback(
    async (fileName: string) => {
      setLoading(true);
      setError(null);
      const filePath =
        currentPath === '/'
          ? '/' + fileName
          : currentPath + '/' + fileName;
      try {
        const data = await fetchPath(filePath);
        if (data.type === 'file' && typeof data.content === 'string') {
          setSelectedFile({ name: fileName, content: data.content });
          if (onFileSelect) {
            onFileSelect(filePath);
          }
        } else {
          setError('Could not read file content');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to read file');
      } finally {
        setLoading(false);
      }
    },
    [currentPath, onFileSelect],
  );

  // Initial load
  useEffect(() => {
    if (isOpen) {
      loadDirectory(currentPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Navigate into a directory
  const navigateTo = useCallback(
    (path: string) => {
      loadDirectory(path);
    },
    [loadDirectory],
  );

  // Navigate up one level
  const navigateUp = useCallback(() => {
    if (currentPath === '/' || currentPath === '~') return;
    const parent = currentPath.replace(/\/[^/]+\/?$/, '') || '/';
    navigateTo(parent);
  }, [currentPath, navigateTo]);

  // Navigate home
  const navigateHome = useCallback(() => {
    navigateTo('~');
  }, [navigateTo]);

  // Refresh current directory
  const refresh = useCallback(() => {
    setSelectedFile(null);
    loadDirectory(currentPath);
  }, [currentPath, loadDirectory]);

  // Handle entry click
  const handleEntryClick = useCallback(
    (entry: FileEntry) => {
      if (entry.type === 'directory') {
        const next =
          currentPath === '/'
            ? '/' + entry.name
            : currentPath + '/' + entry.name;
        navigateTo(next);
      } else {
        loadFile(entry.name);
      }
    },
    [currentPath, navigateTo, loadFile],
  );

  // Handle path input submit
  const handlePathSubmit = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        navigateTo(pathInput.trim());
      }
    },
    [pathInput, navigateTo],
  );

  // Back to file list from preview
  const backToList = useCallback(() => {
    setSelectedFile(null);
  }, []);

  // Copy content to clipboard
  const copyContent = useCallback(() => {
    if (!selectedFile) return;
    navigator.clipboard.writeText(selectedFile.content).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    });
  }, [selectedFile]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedFile) {
          setSelectedFile(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, selectedFile]);

  // Breadcrumb segments
  const segments = useMemo(() => pathSegments(currentPath), [currentPath]);

  // File content lines
  const contentLines = useMemo(() => {
    if (!selectedFile) return [];
    return selectedFile.content.split('\n');
  }, [selectedFile]);

  if (!isOpen) return null;

  // -- Render -----------------------------------------------------------------

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="file-explorer-overlay"
        style={{
          ...S.overlay,
          opacity: slideIn ? 1 : 0,
          transition: 'opacity 0.2s ease-out',
        }}
        onClick={onClose}
      />

      {/* Side panel */}
      <div
        className="file-explorer"
        style={{
          ...S.panel,
          transform: slideIn ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        {/* Toolbar */}
        <div className="file-toolbar" style={S.toolbar}>
          <button
            style={S.toolBtn}
            onClick={navigateUp}
            title="Go up (parent directory)"
          >
            {'\u2190'}
          </button>
          <button style={S.toolBtn} onClick={navigateHome} title="Home (~)">
            ~
          </button>
          <input
            ref={pathInputRef}
            type="text"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={handlePathSubmit}
            style={S.pathInput}
            spellCheck={false}
            placeholder="Enter path..."
          />
          <button
            style={S.toolBtn}
            onClick={refresh}
            title="Refresh"
          >
            {'\u21BB'}
          </button>
          <button
            style={S.toolBtn}
            onClick={onClose}
            title="Close (Esc)"
          >
            {'\u2715'}
          </button>
        </div>

        {/* Breadcrumbs */}
        <div className="file-breadcrumbs" style={S.breadcrumbs}>
          {segments.map((seg, i) => (
            <React.Fragment key={seg.path}>
              {i > 0 && (
                <span style={S.breadcrumbSep}>/</span>
              )}
              {i === segments.length - 1 ? (
                <span style={S.breadcrumbItemLast}>{seg.name}</span>
              ) : (
                <span
                  style={S.breadcrumbItem}
                  onClick={() => navigateTo(seg.path)}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = 'var(--accent)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = 'var(--text-secondary)')
                  }
                >
                  {seg.name}
                </span>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Loading indicator */}
        {loading && <div style={S.loadingBar} />}

        {/* Error banner */}
        {error && (
          <div style={S.errorBanner}>
            Error: {error}
          </div>
        )}

        {/* Body */}
        <div style={S.body}>
          {selectedFile ? (
            /* -- File content preview -- */
            <div className="file-preview-pane" style={S.previewPane}>
              <div style={S.previewHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    style={S.toolBtn}
                    onClick={backToList}
                    title="Back to file list"
                  >
                    {'\u2190'} Back
                  </button>
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      fontWeight: 600,
                    }}
                  >
                    {selectedFile.name}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      padding: '1px 6px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    {guessLanguage(selectedFile.name)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    style={S.toolBtn}
                    onClick={copyContent}
                    title="Copy file content"
                  >
                    {copyFeedback ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    style={S.toolBtn}
                    onClick={() => {
                      /* placeholder: open in editor */
                    }}
                    title="Open in editor"
                  >
                    Open in Editor
                  </button>
                </div>
              </div>
              <div className="file-preview-content" style={S.previewContent}>
                {/* Line numbers */}
                <div className="file-line-numbers" style={S.lineNumbers}>
                  {contentLines.map((_, i) => (
                    <div key={i} style={S.lineNum}>
                      {i + 1}
                    </div>
                  ))}
                </div>
                {/* Code */}
                <div style={S.codeArea}>
                  {contentLines.map((line, i) => (
                    <div key={i} style={S.codeLine}>
                      {line || '\u200B'}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* -- File tree listing -- */
            <>
              {entries.length > 0 ? (
                <div
                  className="file-tree"
                  style={S.fileTree}
                  ref={treeRef}
                >
                  {entries.map((entry) => {
                    const isDir = entry.type === 'directory';
                    const hovered = hoveredEntry === entry.name;
                    return (
                      <div
                        key={entry.name}
                        className="file-entry"
                        style={{
                          ...S.fileEntry,
                          background: hovered
                            ? 'var(--bg-hover)'
                            : 'transparent',
                        }}
                        onClick={() => handleEntryClick(entry)}
                        onMouseEnter={() => setHoveredEntry(entry.name)}
                        onMouseLeave={() => setHoveredEntry(null)}
                      >
                        <span
                          style={{
                            ...S.fileEntryIcon,
                            color: isDir
                              ? 'var(--accent)'
                              : 'var(--text-secondary)',
                          }}
                        >
                          {isDir ? '[+]' : fileIcon(entry.name)}
                        </span>
                        <span
                          style={{
                            ...S.fileEntryName,
                            color: isDir
                              ? 'var(--text-primary)'
                              : 'var(--text-secondary)',
                            fontWeight: isDir ? 500 : 400,
                          }}
                        >
                          {entry.name}
                        </span>
                        {!isDir && entry.size != null && (
                          <span style={S.fileEntrySize}>
                            {formatSize(entry.size)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : !loading && !error ? (
                <div style={S.emptyState}>
                  <span style={{ fontSize: 20, opacity: 0.3 }}>--</span>
                  <span>Empty directory</span>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}
