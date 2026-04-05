import { useState, useEffect, useCallback, useRef, memo } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface FileTreePanelProps {
  isOpen: boolean;
  onClose: () => void;
  rootPath: string;
  onFileSelect: (path: string) => void;
  apiBase: string;
}

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}

interface TreeNode {
  entry: FileEntry;
  children: TreeNode[] | null;   // null = not loaded yet
  isExpanded: boolean;
  isLoading: boolean;
  error: string | null;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const CSS = `
.ftree-overlay { position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; justify-content:flex-start; z-index:9998; backdrop-filter:blur(3px); }
.ftree-panel { display:flex; flex-direction:column; width:340px; max-width:92vw; height:100vh; background:var(--bg-primary,#0a0a12); border-right:1px solid var(--border,#2a2a3e); box-shadow:8px 0 30px rgba(0,0,0,.4); color:var(--text-primary,#e4e4ed); font-family:var(--font-mono,"JetBrains Mono","Fira Code",monospace); overflow:hidden; animation:ftree-slide .2s ease-out; }
@keyframes ftree-slide { from{transform:translateX(-100%);opacity:.8} to{transform:translateX(0);opacity:1} }

.ftree-header { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid var(--border,#2a2a3e); flex-shrink:0; position:sticky; top:0; z-index:2; background:var(--bg-primary,#0a0a12); }
.ftree-header h2 { margin:0; font-size:13px; font-weight:600; color:var(--text-primary,#e4e4ed); letter-spacing:.02em; }
.ftree-close-btn { background:none; border:none; cursor:pointer; color:var(--text-dim,#6a6a82); padding:4px; display:flex; align-items:center; border-radius:4px; transition:color .15s,background .15s; }
.ftree-close-btn:hover { color:var(--text-primary,#e4e4ed); background:var(--bg-hover,rgba(255,255,255,.06)); }

.ftree-search-wrap { padding:8px 12px; border-bottom:1px solid var(--border,#2a2a3e); flex-shrink:0; position:sticky; top:46px; z-index:2; background:var(--bg-primary,#0a0a12); }
.ftree-search { display:flex; align-items:center; gap:8px; background:var(--bg-secondary,#12121e); border:1px solid var(--border,#2a2a3e); border-radius:6px; padding:6px 10px; transition:border-color .15s; }
.ftree-search:focus-within { border-color:#e84520; }
.ftree-search input { flex:1; background:none; border:none; outline:none; color:var(--text-primary,#e4e4ed); font-family:var(--font-mono,"JetBrains Mono","Fira Code",monospace); font-size:12px; line-height:1.4; }
.ftree-search input::placeholder { color:var(--text-dim,#6a6a82); }

.ftree-body { flex:1; overflow-y:auto; overflow-x:hidden; padding:4px 0; }
.ftree-body::-webkit-scrollbar { width:5px; }
.ftree-body::-webkit-scrollbar-track { background:transparent; }
.ftree-body::-webkit-scrollbar-thumb { background:var(--border,#2a2a3e); border-radius:3px; }
.ftree-body::-webkit-scrollbar-thumb:hover { background:#3a3a52; }

.ftree-row { display:flex; align-items:center; gap:4px; padding:3px 12px 3px 0; cursor:pointer; font-size:12.5px; color:var(--text-secondary,#c0c0d0); transition:background .08s; user-select:none; white-space:nowrap; min-height:26px; position:relative; }
.ftree-row:hover { background:var(--bg-hover,rgba(255,255,255,.04)); }
.ftree-row-selected { background:rgba(232,69,32,.08); }
.ftree-row-selected:hover { background:rgba(232,69,32,.12); }

.ftree-indent { display:inline-flex; flex-shrink:0; position:relative; }
.ftree-guide { position:absolute; top:0; bottom:0; width:1px; background:var(--border,#2a2a3e); opacity:.4; }

.ftree-chevron { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; flex-shrink:0; color:var(--text-dim,#6a6a82); transition:transform .15s ease; }
.ftree-chevron-expanded { transform:rotate(90deg); }
.ftree-chevron-hidden { visibility:hidden; }

.ftree-icon { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; flex-shrink:0; margin-right:4px; }

.ftree-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; }
.ftree-name-dir { font-weight:500; }

.ftree-size { flex-shrink:0; font-size:11px; color:var(--text-dim,#6a6a82); margin-left:auto; padding-left:8px; font-variant-numeric:tabular-nums; }

.ftree-empty { padding:24px 16px; text-align:center; font-size:12px; color:var(--text-dim,#6a6a82); }
.ftree-error { padding:12px 16px; font-size:12px; color:#ef4444; }
.ftree-loading { padding:12px 16px; font-size:12px; color:var(--text-dim,#6a6a82); display:flex; align-items:center; gap:8px; }

.ftree-spinner { width:12px; height:12px; border:2px solid var(--border,#2a2a3e); border-top-color:#e84520; border-radius:50%; animation:ftree-spin .6s linear infinite; flex-shrink:0; }
@keyframes ftree-spin { to{transform:rotate(360deg)} }

.ftree-children { overflow:hidden; }
.ftree-children-enter { animation:ftree-expand .15s ease-out; }
@keyframes ftree-expand { from{opacity:0;max-height:0} to{opacity:1;max-height:2000px} }

.ftree-root-path { font-size:11px; color:var(--text-dim,#6a6a82); padding:6px 16px; border-bottom:1px solid var(--border,#2a2a3e); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-shrink:0; }

.ftree-status { padding:6px 16px; border-top:1px solid var(--border,#2a2a3e); font-size:11px; color:var(--text-dim,#6a6a82); flex-shrink:0; display:flex; align-items:center; justify-content:space-between; }
`;

/* ------------------------------------------------------------------ */
/*  Inline SVG Icons                                                   */
/* ------------------------------------------------------------------ */

const S = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function CloseIcon() {
  return <svg {...S}><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></svg>;
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-dim)', flexShrink: 0 }}>
      <circle cx="7" cy="7" r="4.5" /><line x1="10.5" y1="10.5" x2="14" y2="14" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 4 10 8 6 12" />
    </svg>
  );
}

function FolderIcon({ open }: { open: boolean }) {
  return open ? (
    <svg {...S} style={{ color: '#e8a030' }}>
      <path d="M1.5 12.5V4a1 1 0 011-1h3.25l1.5 1.5H13a1 1 0 011 1v1H5.5a1.5 1.5 0 00-1.4 1L2.5 12.5" />
      <path d="M2.5 12.5l1.6-5A1.5 1.5 0 015.5 6.5H14l-1.8 5.5a1 1 0 01-.95.7H3a.5.5 0 01-.5-.7z" />
    </svg>
  ) : (
    <svg {...S} style={{ color: '#c89830' }}>
      <path d="M2.5 13V3.5a1 1 0 011-1h3.25l1.5 1.5h5.25a1 1 0 011 1V13a1 1 0 01-1 1h-10a1 1 0 01-1-1z" />
    </svg>
  );
}

function FileIconGeneric() {
  return (
    <svg {...S} style={{ color: 'var(--text-dim)' }}>
      <path d="M4 1.5h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1v-12a1 1 0 011-1z" />
      <polyline points="9 1.5 9 5.5 13 5.5" />
    </svg>
  );
}

function TsIcon() {
  return (
    <svg {...S} style={{ color: '#3178c6' }}>
      <rect x="1" y="1" width="14" height="14" rx="2" strokeWidth="0" fill="#3178c6" opacity=".15" />
      <text x="8" y="11.5" textAnchor="middle" fill="#3178c6" fontSize="9" fontWeight="700" fontFamily="monospace" stroke="none">TS</text>
    </svg>
  );
}

function JsIcon() {
  return (
    <svg {...S} style={{ color: '#f0db4f' }}>
      <rect x="1" y="1" width="14" height="14" rx="2" strokeWidth="0" fill="#f0db4f" opacity=".15" />
      <text x="8" y="11.5" textAnchor="middle" fill="#f0db4f" fontSize="9" fontWeight="700" fontFamily="monospace" stroke="none">JS</text>
    </svg>
  );
}

function CssIcon() {
  return (
    <svg {...S} style={{ color: '#56b6c2' }}>
      <rect x="1" y="1" width="14" height="14" rx="2" strokeWidth="0" fill="#56b6c2" opacity=".12" />
      <text x="8" y="11.5" textAnchor="middle" fill="#56b6c2" fontSize="8" fontWeight="700" fontFamily="monospace" stroke="none">CSS</text>
    </svg>
  );
}

function JsonIcon() {
  return (
    <svg {...S} style={{ color: '#cb8f36' }}>
      <path d="M5 3c-1.5 0-2 1-2 2v1.5C3 7.5 2 8 2 8s1 .5 1 1.5V11c0 1 .5 2 2 2" stroke="#cb8f36" />
      <path d="M11 3c1.5 0 2 1 2 2v1.5c0 1 1 1.5 1 1.5s-1 .5-1 1.5V11c0 1-.5 2-2 2" stroke="#cb8f36" />
    </svg>
  );
}

function MdIcon() {
  return (
    <svg {...S} style={{ color: '#6a9eed' }}>
      <rect x="1" y="1" width="14" height="14" rx="2" strokeWidth="0" fill="#6a9eed" opacity=".12" />
      <text x="8" y="11.5" textAnchor="middle" fill="#6a9eed" fontSize="7.5" fontWeight="700" fontFamily="monospace" stroke="none">MD</text>
    </svg>
  );
}

function getFileIcon(name: string, isDir: boolean, isExpanded: boolean) {
  if (isDir) return <FolderIcon open={isExpanded} />;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'ts': case 'tsx': return <TsIcon />;
    case 'js': case 'jsx': return <JsIcon />;
    case 'css': case 'scss': case 'less': return <CssIcon />;
    case 'json': return <JsonIcon />;
    case 'md': case 'mdx': return <MdIcon />;
    default: return <FileIconGeneric />;
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatSize(bytes: number): string {
  if (bytes < 0) return '';
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' K';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' M';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' G';
}

function basename(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || path;
}

function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    // Directories first, then alphabetical (case-insensitive)
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

function matchesFilter(name: string, filter: string): boolean {
  if (!filter) return true;
  const lower = name.toLowerCase();
  const filterLower = filter.toLowerCase();
  // Support simple fuzzy: each character of the filter appears in order
  let fi = 0;
  for (let i = 0; i < lower.length && fi < filterLower.length; i++) {
    if (lower[i] === filterLower[fi]) fi++;
  }
  return fi === filterLower.length;
}

/** Count total visible files in a tree (for status bar). */
function countNodes(nodes: TreeNode[]): { files: number; dirs: number } {
  let files = 0, dirs = 0;
  for (const n of nodes) {
    if (n.entry.isDirectory) {
      dirs++;
      if (n.children) {
        const sub = countNodes(n.children);
        files += sub.files;
        dirs += sub.dirs;
      }
    } else {
      files++;
    }
  }
  return { files, dirs };
}

/* ------------------------------------------------------------------ */
/*  Tree Row Component                                                 */
/* ------------------------------------------------------------------ */

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  filter: string;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onDoubleClick: (path: string) => void;
}

const INDENT_PX = 16;

function TreeRow({ node, depth, selectedPath, filter, onToggle, onSelect, onDoubleClick }: TreeRowProps) {
  const { entry, isExpanded, isLoading, error, children } = node;
  const isDir = entry.isDirectory;
  const isSelected = selectedPath === entry.path;

  // Filter: skip files that don't match, but always show directories
  if (!isDir && filter && !matchesFilter(entry.name, filter)) return null;

  const handleClick = useCallback(() => {
    if (isDir) {
      onToggle(entry.path);
    } else {
      onSelect(entry.path);
    }
  }, [isDir, entry.path, onToggle, onSelect]);

  const handleDoubleClick = useCallback(() => {
    if (!isDir) {
      onDoubleClick(entry.path);
    }
  }, [isDir, entry.path, onDoubleClick]);

  // Build indent with guide lines
  const indentEl = (
    <span className="ftree-indent" style={{ width: depth * INDENT_PX, minWidth: depth * INDENT_PX }}>
      {Array.from({ length: depth }, (_, i) => (
        <span key={i} className="ftree-guide" style={{ left: i * INDENT_PX + 7 }} />
      ))}
    </span>
  );

  // Filter children if expanded
  const visibleChildren = (() => {
    if (!isDir || !isExpanded || !children) return null;
    const filtered = filter
      ? children.filter(c => c.entry.isDirectory || matchesFilter(c.entry.name, filter))
      : children;
    if (filtered.length === 0 && filter) return null;
    return filtered;
  })();

  // If directory has no matching children and doesn't match itself, hide
  if (isDir && filter && !matchesFilter(entry.name, filter) && visibleChildren === null) {
    return null;
  }

  return (
    <>
      <div
        className={`ftree-row${isSelected ? ' ftree-row-selected' : ''}`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        title={entry.path}
        role="treeitem"
        aria-expanded={isDir ? isExpanded : undefined}
        aria-selected={isSelected}
      >
        {indentEl}
        <span className={`ftree-chevron${isExpanded ? ' ftree-chevron-expanded' : ''}${!isDir ? ' ftree-chevron-hidden' : ''}`}>
          {isDir && (isLoading ? <span className="ftree-spinner" /> : <ChevronIcon />)}
        </span>
        <span className="ftree-icon">
          {getFileIcon(entry.name, isDir, isExpanded)}
        </span>
        <span className={`ftree-name${isDir ? ' ftree-name-dir' : ''}`}>
          {entry.name}
        </span>
        {!isDir && entry.size >= 0 && (
          <span className="ftree-size">{formatSize(entry.size)}</span>
        )}
      </div>
      {isDir && isExpanded && (
        <div className="ftree-children ftree-children-enter" role="group">
          {error && <div className="ftree-error" style={{ paddingLeft: (depth + 1) * INDENT_PX + 12 }}>{error}</div>}
          {isLoading && !children && (
            <div className="ftree-loading" style={{ paddingLeft: (depth + 1) * INDENT_PX + 12 }}>
              <span className="ftree-spinner" /> Loading...
            </div>
          )}
          {visibleChildren && visibleChildren.map(child => (
            <TreeRow
              key={child.entry.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              filter={filter}
              onToggle={onToggle}
              onSelect={onSelect}
              onDoubleClick={onDoubleClick}
            />
          ))}
          {children && children.length === 0 && !isLoading && (
            <div className="ftree-empty" style={{ paddingLeft: (depth + 1) * INDENT_PX + 12, textAlign: 'left' }}>
              Empty directory
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

function FileTreePanel({ isOpen, onClose, rootPath, onFileSelect, apiBase }: FileTreePanelProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [rootError, setRootError] = useState<string | null>(null);
  const [rootLoading, setRootLoading] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch directory listing ──────────────────────────────────

  const fetchDir = useCallback(async (dirPath: string, signal?: AbortSignal): Promise<FileEntry[]> => {
    const res = await fetch(`${apiBase}/filesystem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', path: dirPath }),
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `HTTP ${res.status}`);
    }
    const data = await res.json();
    // Normalize response — expect array of { name, path, isDirectory, size }
    const entries: FileEntry[] = (Array.isArray(data) ? data : data.entries ?? data.files ?? []).map((e: any) => ({
      name: e.name ?? basename(e.path ?? ''),
      path: e.path ?? `${dirPath}/${e.name}`,
      isDirectory: e.isDirectory ?? e.is_directory ?? e.type === 'directory',
      size: e.size ?? -1,
    }));
    return sortEntries(entries);
  }, [apiBase]);

  // ── Load root directory ──────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    setRootError(null);
    setRootLoading(true);
    setTree([]);
    setFilter('');

    const ac = new AbortController();
    abortRef.current = ac;

    fetchDir(rootPath, ac.signal)
      .then(entries => {
        setTree(entries.map(e => ({
          entry: e,
          children: null,
          isExpanded: false,
          isLoading: false,
          error: null,
        })));
        setRootLoading(false);
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        setRootError(err.message || 'Failed to load directory');
        setRootLoading(false);
      });

    return () => { ac.abort(); };
  }, [isOpen, rootPath, fetchDir]);

  // ── Toggle expand/collapse ───────────────────────────────────

  const updateNodeAtPath = useCallback((nodes: TreeNode[], targetPath: string, updater: (node: TreeNode) => TreeNode): TreeNode[] => {
    return nodes.map(n => {
      if (n.entry.path === targetPath) return updater(n);
      if (n.children && targetPath.startsWith(n.entry.path + '/')) {
        return { ...n, children: updateNodeAtPath(n.children, targetPath, updater) };
      }
      return n;
    });
  }, []);

  const handleToggle = useCallback((path: string) => {
    setTree(prev => {
      // Find the node
      const findNode = (nodes: TreeNode[]): TreeNode | null => {
        for (const n of nodes) {
          if (n.entry.path === path) return n;
          if (n.children) {
            const found = findNode(n.children);
            if (found) return found;
          }
        }
        return null;
      };
      const node = findNode(prev);
      if (!node) return prev;

      // If already expanded, collapse
      if (node.isExpanded) {
        return updateNodeAtPath(prev, path, n => ({ ...n, isExpanded: false }));
      }

      // If children already loaded, just expand
      if (node.children !== null) {
        return updateNodeAtPath(prev, path, n => ({ ...n, isExpanded: true }));
      }

      // Need to fetch children
      const updated = updateNodeAtPath(prev, path, n => ({ ...n, isExpanded: true, isLoading: true, error: null }));

      fetchDir(path)
        .then(entries => {
          setTree(current =>
            updateNodeAtPath(current, path, n => ({
              ...n,
              isLoading: false,
              children: entries.map(e => ({
                entry: e,
                children: null,
                isExpanded: false,
                isLoading: false,
                error: null,
              })),
            }))
          );
        })
        .catch(err => {
          if (err.name === 'AbortError') return;
          setTree(current =>
            updateNodeAtPath(current, path, n => ({
              ...n,
              isLoading: false,
              error: err.message || 'Failed to load',
              children: [],
            }))
          );
        });

      return updated;
    });
  }, [fetchDir, updateNodeAtPath]);

  // ── Select file ──────────────────────────────────────────────

  const handleSelect = useCallback((path: string) => {
    setSelectedPath(path);
    onFileSelect(path);
  }, [onFileSelect]);

  const handleDoubleClick = useCallback((path: string) => {
    setSelectedPath(path);
    onFileSelect(path);
  }, [onFileSelect]);

  // ── Keyboard handling ────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Focus search on open
  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [isOpen]);

  // ── Stats ────────────────────────────────────────────────────

  const stats = tree.length > 0 ? countNodes(tree) : null;

  // ── Render ───────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <>
      <style>{CSS}</style>
      <div className="ftree-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="ftree-panel" ref={panelRef} tabIndex={-1} role="tree" aria-label="File tree">

          {/* Header */}
          <div className="ftree-header">
            <h2>Files</h2>
            <button className="ftree-close-btn" onClick={onClose} aria-label="Close file tree">
              <CloseIcon />
            </button>
          </div>

          {/* Root path display */}
          <div className="ftree-root-path" title={rootPath}>
            {rootPath}
          </div>

          {/* Search filter */}
          <div className="ftree-search-wrap">
            <div className="ftree-search">
              <SearchIcon />
              <input
                ref={searchRef}
                type="text"
                placeholder="Filter files..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              {filter && (
                <button
                  onClick={() => { setFilter(''); searchRef.current?.focus(); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 2, display: 'flex' }}
                  aria-label="Clear filter"
                >
                  <CloseIcon />
                </button>
              )}
            </div>
          </div>

          {/* Tree body */}
          <div className="ftree-body">
            {rootLoading && (
              <div className="ftree-loading">
                <span className="ftree-spinner" /> Loading directory...
              </div>
            )}
            {rootError && (
              <div className="ftree-error">{rootError}</div>
            )}
            {!rootLoading && !rootError && tree.length === 0 && (
              <div className="ftree-empty">No files found</div>
            )}
            {tree.map(node => (
              <TreeRow
                key={node.entry.path}
                node={node}
                depth={0}
                selectedPath={selectedPath}
                filter={filter}
                onToggle={handleToggle}
                onSelect={handleSelect}
                onDoubleClick={handleDoubleClick}
              />
            ))}
          </div>

          {/* Status bar */}
          {stats && (
            <div className="ftree-status">
              <span>{stats.dirs} folder{stats.dirs !== 1 ? 's' : ''}, {stats.files} file{stats.files !== 1 ? 's' : ''}</span>
              {filter && <span style={{ color: '#e84520' }}>Filtered</span>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default memo(FileTreePanel);
