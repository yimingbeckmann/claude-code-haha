import { useState, useCallback, useEffect, useRef, memo, useMemo } from "react";

// -- Types ----------------------------------------------------------

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface FetchState {
  entries: FileEntry[];
  loading: boolean;
  error: string | null;
  cachedDir: string;
}

export interface FileMentionAutocompleteProps {
  query: string;       // text after the @ symbol
  visible: boolean;
  apiBase: string;     // e.g. "http://localhost:3000/api"
  onSelect: (filePath: string) => void;
  onDismiss: () => void;
}

// -- Constants & helpers --------------------------------------------

const MAX_VISIBLE = 10;
const ITEM_H = 30;
const DEBOUNCE = 150;

function getParentDir(q: string): string {
  const t = q.replace(/^\/+/, "");
  const i = t.lastIndexOf("/");
  return i === -1 ? "." : t.slice(0, i) || ".";
}

function getBasename(q: string): string {
  const t = q.replace(/^\/+/, "");
  const i = t.lastIndexOf("/");
  return i === -1 ? t : t.slice(i + 1);
}

function fuzzyMatch(text: string, pat: string): { matches: boolean; score: number; indices: number[] } {
  if (!pat) return { matches: true, score: 0, indices: [] };
  const lo = text.toLowerCase(), p = pat.toLowerCase();
  const indices: number[] = [];
  let pi = 0, score = 0, prev = -1;
  for (let i = 0; i < lo.length && pi < p.length; i++) {
    if (lo[i] === p[pi]) {
      indices.push(i);
      if (prev === i - 1) score += 2;            // consecutive bonus
      if (i === 0 || "/.-_".includes(text[i - 1])) score += 3; // boundary bonus
      score++;
      prev = i;
      pi++;
    }
  }
  return { matches: pi === p.length, score, indices };
}

const EXT_COLORS: Record<string, string> = {
  ts: "var(--cyan)", tsx: "var(--cyan)", js: "var(--warning)", jsx: "var(--warning)",
  py: "var(--success)", rs: "var(--accent)", go: "var(--info)",
  css: "var(--purple)", scss: "var(--purple)",
  json: "var(--text-muted)", yaml: "var(--text-muted)", yml: "var(--text-muted)",
  md: "var(--text-secondary)", txt: "var(--text-secondary)",
};

function extColor(name: string, dir: boolean): string {
  if (dir) return "var(--warning)";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_COLORS[ext] ?? "var(--text-muted)";
}

function typeTag(name: string, dir: boolean): string {
  if (dir) return "dir";
  return name.split(".").pop()?.toLowerCase() || "file";
}

// -- Styles ---------------------------------------------------------

const STYLES = `
.fma-overlay { position:absolute; bottom:100%; left:0; right:0; margin-bottom:4px; z-index:100; }
.fma-container { background:var(--bg-secondary); border:1px solid var(--border-hover); border-radius:var(--radius-lg); box-shadow:0 -4px 24px rgba(0,0,0,.5); overflow:hidden; display:flex; flex-direction:column; animation:fadeIn .12s ease-out; }
.fma-header { display:flex; align-items:center; justify-content:space-between; padding:6px 12px; border-bottom:1px solid var(--border); }
.fma-header-label { font-size:10px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:.5px; }
.fma-header-path { font-size:10px; color:var(--text-dim); font-family:var(--font-mono); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.fma-list { overflow-y:auto; padding:2px 0; }
.fma-item { display:flex; align-items:center; gap:8px; height:${ITEM_H}px; padding:0 12px; cursor:pointer; background:transparent; transition:background .1s; font-family:var(--font-mono); font-size:12px; color:var(--text-secondary); }
.fma-item:hover,.fma-item[data-selected="true"] { background:var(--bg-hover); color:var(--text-primary); }
.fma-item[data-selected="true"] { background:var(--accent-dim); }
.fma-item-icon { font-size:10px; font-weight:600; width:24px; text-align:center; flex-shrink:0; }
.fma-item-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.fma-item-match { font-weight:700; color:var(--accent); }
.fma-item-type { font-size:10px; color:var(--text-dim); flex-shrink:0; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.fma-loading { display:flex; align-items:center; gap:8px; padding:12px; font-size:11px; color:var(--text-muted); }
.fma-loading-dot { width:4px; height:4px; border-radius:50%; background:var(--accent); animation:pulse 1.2s ease-in-out infinite; }
.fma-empty { padding:14px 12px; text-align:center; font-size:12px; color:var(--text-muted); }
.fma-error { padding:10px 12px; font-size:11px; color:var(--error); }
.fma-footer { display:flex; gap:12px; padding:5px 12px; border-top:1px solid var(--border); font-size:10px; color:var(--text-dim); }
.fma-kbd { display:inline-block; background:var(--bg-tertiary); border:1px solid var(--border); border-radius:3px; padding:0 4px; font-size:9px; font-family:var(--font-mono); color:var(--text-muted); margin-right:3px; }
`;

// -- Highlighted name -----------------------------------------------

function HiName({ text, indices }: { text: string; indices: number[] }) {
  if (!indices.length) return <>{text}</>;
  const set = new Set(indices);
  const parts: React.ReactNode[] = [];
  let buf = "", inM = false;
  for (let i = 0; i <= text.length; i++) {
    const m = set.has(i);
    if (i === text.length || m !== inM) {
      if (buf) {
        parts.push(
          inM ? <span key={i} className="fma-item-match">{buf}</span>
               : <span key={i}>{buf}</span>
        );
      }
      buf = i < text.length ? text[i] : "";
      inM = m;
    } else {
      buf += text[i];
    }
  }
  return <>{parts}</>;
}

// -- Component ------------------------------------------------------

function FileMentionAutocomplete({ query, visible, apiBase, onSelect, onDismiss }: FileMentionAutocompleteProps) {
  const [selIdx, setSelIdx] = useState(0);
  const [fs, setFs] = useState<FetchState>({
    entries: [], loading: false, error: null, cachedDir: "",
  });
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const pDir = useMemo(() => getParentDir(query), [query]);
  const base = useMemo(() => getBasename(query), [query]);

  // Fetch directory listing when the parent directory changes
  useEffect(() => {
    if (!visible) return;
    if (fs.cachedDir === pDir && fs.entries.length > 0) return;

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setFs((s) => ({ ...s, loading: true, error: null }));

      try {
        const res = await fetch(`${apiBase}/filesystem`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: pDir, action: "list" }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const entries: FileEntry[] = (data.entries || data.files || []).map(
          (e: any) => ({
            name: e.name ?? e.fileName ?? "",
            path: e.path ?? e.filePath ?? "",
            isDirectory: e.isDirectory ?? e.type === "directory" ?? false,
          }),
        );
        // Directories first, then alphabetical
        entries.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        if (!ctrl.signal.aborted) {
          setFs({ entries, loading: false, error: null, cachedDir: pDir });
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setFs((s) => ({ ...s, loading: false, error: err.message || "Failed to fetch" }));
      }
    }, DEBOUNCE);

    return () => { clearTimeout(timer); abortRef.current?.abort(); };
  }, [visible, pDir, apiBase]);

  // Reset when hidden
  useEffect(() => {
    if (!visible) {
      setFs({ entries: [], loading: false, error: null, cachedDir: "" });
      setSelIdx(0);
    }
  }, [visible]);

  // Filter and rank entries via fuzzy match
  const filtered = useMemo(() => {
    if (fs.loading || fs.error) return [];
    return fs.entries
      .map((e) => ({ entry: e, ...fuzzyMatch(e.name, base) }))
      .filter((r) => r.matches)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  }, [fs.entries, fs.loading, fs.error, base]);

  // Reset selection when query changes
  useEffect(() => setSelIdx(0), [query]);

  // Keep selected item scrolled into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector("[data-selected='true']");
    if (el) (el as HTMLElement).scrollIntoView({ block: "nearest" });
  }, [selIdx]);

  // Keyboard navigation
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (!visible || !filtered.length) return;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === "ArrowDown") { stop(); setSelIdx((i) => (i < filtered.length - 1 ? i + 1 : 0)); }
    else if (e.key === "ArrowUp") { stop(); setSelIdx((i) => (i > 0 ? i - 1 : filtered.length - 1)); }
    else if (e.key === "Tab" || e.key === "Enter") { stop(); if (filtered[selIdx]) { const en = filtered[selIdx].entry; onSelect(en.isDirectory ? en.path + "/" : en.path); } }
    else if (e.key === "Escape") { stop(); onDismiss(); }
  }, [visible, filtered, selIdx, onSelect, onDismiss]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [handleKey]);

  // Click outside to dismiss
  useEffect(() => {
    if (!visible) return;
    const h = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) onDismiss();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [visible, onDismiss]);

  if (!visible) return null;

  const maxH = Math.min(filtered.length, MAX_VISIBLE) * ITEM_H + 4;

  return (
    <>
      <style>{STYLES}</style>
      <div className="fma-overlay">
        <div className="fma-container">
          <div className="fma-header">
            <span className="fma-header-label">Files</span>
            <span className="fma-header-path">{pDir === "." ? "/" : pDir}</span>
          </div>

          {fs.loading && (
            <div className="fma-loading"><span className="fma-loading-dot" /><span>Loading...</span></div>
          )}
          {fs.error && <div className="fma-error">Error: {fs.error}</div>}
          {!fs.loading && !fs.error && !filtered.length && (
            <div className="fma-empty">
              {fs.entries.length === 0 ? "No files in directory" : `No matches for "${base}"`}
            </div>
          )}

          {filtered.length > 0 && (
            <div ref={listRef} className="fma-list" style={{ maxHeight: maxH }}>
              {filtered.map((it, i) => (
                <div key={it.entry.path} className="fma-item" data-selected={i === selIdx}
                  onMouseEnter={() => setSelIdx(i)}
                  onClick={() => onSelect(it.entry.isDirectory ? it.entry.path + "/" : it.entry.path)}>
                  <span className="fma-item-icon" style={{ color: extColor(it.entry.name, it.entry.isDirectory) }}>
                    {typeTag(it.entry.name, it.entry.isDirectory)}
                  </span>
                  <span className="fma-item-name">
                    <HiName text={it.entry.name} indices={it.indices} />
                  </span>
                  <span className="fma-item-type">{it.entry.path}</span>
                </div>
              ))}
            </div>
          )}

          <div className="fma-footer">
            <span><span className="fma-kbd">Up/Down</span> navigate</span>
            <span><span className="fma-kbd">Tab</span> accept</span>
            <span><span className="fma-kbd">/</span> into dir</span>
            <span><span className="fma-kbd">Esc</span> dismiss</span>
          </div>
        </div>
      </div>
    </>
  );
}

export default memo(FileMentionAutocomplete);
