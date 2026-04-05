import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";

// -- Types ------------------------------------------------------------------

interface ProjectSelectorProps {
  sessions: Array<{ id: string; cwd?: string; timestamp: number }>;
  currentProject: string | null;
  onSelectProject: (project: string | null) => void;
}

interface ProjectInfo {
  path: string; name: string; displayPath: string;
  sessionCount: number; lastActive: number;
}

// -- Helpers ----------------------------------------------------------------

function shortenPath(p: string): string {
  const home = typeof window !== "undefined" ? (window as any).__HOME_DIR__ ?? "/Users" : "/Users";
  return p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

function dirName(p: string): string {
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || p;
}

function relTime(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
}

function deriveProjects(sessions: ProjectSelectorProps["sessions"]): ProjectInfo[] {
  const map = new Map<string, { count: number; lastActive: number }>();
  for (const s of sessions) {
    if (!s.cwd) continue;
    const e = map.get(s.cwd);
    if (e) { e.count++; if (s.timestamp > e.lastActive) e.lastActive = s.timestamp; }
    else map.set(s.cwd, { count: 1, lastActive: s.timestamp });
  }
  const out: ProjectInfo[] = [];
  for (const [path, { count, lastActive }] of map) {
    out.push({ path, name: dirName(path), displayPath: shortenPath(path), sessionCount: count, lastActive });
  }
  return out.sort((a, b) => b.lastActive - a.lastActive);
}

// -- Styles (inline, .proj- prefix) ----------------------------------------

const S = `
.proj-root { position: relative; display: inline-flex; align-items: center; gap: 4px; }
.proj-trigger { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-tertiary); color: var(--text-secondary); font-family: var(--font-mono); font-size: 12px; cursor: pointer; transition: background .15s, border-color .15s, color .15s; white-space: nowrap; line-height: 1.4; }
.proj-trigger:hover { background: var(--bg-hover); border-color: var(--border-hover); color: var(--text-primary); }
.proj-chev { transition: transform .15s ease; }
.proj-chev--open { transform: rotate(180deg); }
.proj-gear { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: transparent; color: var(--text-muted); cursor: pointer; transition: background .15s, color .15s, border-color .15s; }
.proj-gear:hover { background: var(--bg-hover); color: var(--text-secondary); border-color: var(--border-hover); }
.proj-drop { position: absolute; top: calc(100% + 4px); left: 0; min-width: 280px; max-height: 400px; overflow-y: auto; background: var(--bg-secondary); border: 1px solid var(--border-hover); border-radius: var(--radius-lg); box-shadow: 0 4px 20px rgba(0,0,0,.4); z-index: 1000; animation: fadeIn .12s ease-out; }
.proj-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 10px; border: none; background: transparent; color: var(--text-secondary); font-family: var(--font-mono); font-size: 12px; cursor: pointer; text-align: left; transition: background .1s; }
.proj-item:hover, .proj-item--f { background: var(--bg-hover); }
.proj-item--a { color: var(--text-primary); }
.proj-item--a .proj-name { font-weight: 500; }
.proj-info { flex: 1; min-width: 0; overflow: hidden; }
.proj-name { display: block; font-size: 12px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.proj-path { display: block; font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.proj-meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.proj-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 16px; padding: 0 4px; border-radius: 8px; background: var(--bg-active); color: var(--text-muted); font-size: 10px; font-family: var(--font-mono); line-height: 1; }
.proj-time { font-size: 10px; color: var(--text-dim); white-space: nowrap; }
.proj-div { height: 1px; margin: 4px 0; background: var(--border); }
.proj-add { display: flex; align-items: center; gap: 6px; width: 100%; padding: 6px 10px; border: none; background: transparent; color: var(--text-muted); font-family: var(--font-mono); font-size: 12px; cursor: pointer; text-align: left; transition: background .1s, color .1s; }
.proj-add:hover, .proj-add--f { background: var(--bg-hover); color: var(--text-secondary); }
.proj-input { width: 100%; padding: 6px 10px; border: none; border-top: 1px solid var(--border); background: var(--bg-tertiary); color: var(--text-primary); font-family: var(--font-mono); font-size: 12px; outline: none; }
.proj-input::placeholder { color: var(--text-dim); }
.proj-check { color: var(--accent); font-size: 11px; flex-shrink: 0; margin-left: auto; }
.proj-sp { padding: 8px 10px; animation: fadeIn .15s ease-out; }
.proj-sp-title { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; font-weight: 500; }
.proj-sp-row { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 6px; }
.proj-sp-lbl { font-size: 11px; color: var(--text-muted); min-width: 60px; padding-top: 2px; }
.proj-sp-val { flex: 1; font-size: 11px; color: var(--text-secondary); background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 3px 6px; font-family: var(--font-mono); resize: vertical; outline: none; min-height: 24px; }
.proj-sp-val:focus { border-color: var(--border-hover); }
`;

// -- Component --------------------------------------------------------------

function ProjectSelector({ sessions, currentProject, onSelectProject }: ProjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [addMode, setAddMode] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLInputElement>(null);

  const projects = useMemo(() => deriveProjects(sessions), [sessions]);
  const itemCount = 1 + projects.length + 1;
  const cur = currentProject ? projects.find((p) => p.path === currentProject) : null;
  const label = cur ? cur.name : "All projects";

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false); setAddMode(false); setFocusIdx(-1);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // Keyboard nav
  const onKey = useCallback((e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (addMode) setAddMode(false);
      else { setOpen(false); setFocusIdx(-1); }
      return;
    }
    if (addMode) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, itemCount - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (focusIdx === 0) { onSelectProject(null); setOpen(false); setFocusIdx(-1); }
      else if (focusIdx >= 1 && focusIdx <= projects.length) { onSelectProject(projects[focusIdx - 1].path); setOpen(false); setFocusIdx(-1); }
      else if (focusIdx === projects.length + 1) setAddMode(true);
    }
  }, [open, addMode, focusIdx, itemCount, projects, onSelectProject]);

  useEffect(() => {
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onKey]);

  // Focus add input
  useEffect(() => { if (addMode) requestAnimationFrame(() => addRef.current?.focus()); }, [addMode]);

  const toggle = useCallback(() => {
    setOpen((p) => { if (p) { setAddMode(false); setFocusIdx(-1); } return !p; });
  }, []);

  const pick = useCallback((path: string | null) => {
    onSelectProject(path); setOpen(false); setFocusIdx(-1);
  }, [onSelectProject]);

  const commitAdd = useCallback(() => {
    const v = addValue.trim();
    if (v) onSelectProject(v);
    setAddMode(false); setAddValue(""); setOpen(false); setFocusIdx(-1);
  }, [addValue, onSelectProject]);

  const cls = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

  return (
    <>
      <style>{S}</style>
      <div className="proj-root" ref={rootRef}>
        <button type="button" className="proj-trigger" onClick={toggle} aria-haspopup="listbox" aria-expanded={open}>
          <span>{label}</span>
          <svg className={cls("proj-chev", open && "proj-chev--open")} width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {currentProject && (
          <button type="button" className="proj-gear" onClick={() => setSettingsOpen((p) => !p)} title="Project settings">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 1v1.5M8 13.5V15M14.5 8H13M3 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5L3.4 3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}

        {open && (
          <div className="proj-drop" role="listbox">
            {/* All projects */}
            <button type="button" className={cls("proj-item", !currentProject && "proj-item--a", focusIdx === 0 && "proj-item--f")} role="option" aria-selected={!currentProject} onClick={() => pick(null)} onMouseEnter={() => setFocusIdx(0)}>
              <span className="proj-info"><span className="proj-name">All projects</span></span>
              <span className="proj-meta"><span className="proj-badge">{sessions.length}</span></span>
              {!currentProject && <span className="proj-check">{"\u2713"}</span>}
            </button>

            <div className="proj-div" />

            {projects.map((p, i) => {
              const idx = i + 1;
              const active = currentProject === p.path;
              return (
                <button type="button" key={p.path} className={cls("proj-item", active && "proj-item--a", focusIdx === idx && "proj-item--f")} role="option" aria-selected={active} onClick={() => pick(p.path)} onMouseEnter={() => setFocusIdx(idx)}>
                  <span className="proj-info">
                    <span className="proj-name">{p.name}</span>
                    <span className="proj-path">{p.displayPath}</span>
                  </span>
                  <span className="proj-meta">
                    <span className="proj-badge">{p.sessionCount}</span>
                    <span className="proj-time">{relTime(p.lastActive)}</span>
                  </span>
                  {active && <span className="proj-check">{"\u2713"}</span>}
                </button>
              );
            })}

            {projects.length > 0 && <div className="proj-div" />}

            {!addMode ? (
              <button type="button" className={cls("proj-add", focusIdx === projects.length + 1 && "proj-add--f")} onClick={() => setAddMode(true)} onMouseEnter={() => setFocusIdx(projects.length + 1)}>
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>Add project...</span>
              </button>
            ) : (
              <input ref={addRef} className="proj-input" type="text" placeholder="/path/to/project" value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitAdd(); } if (e.key === "Escape") { e.preventDefault(); setAddMode(false); setAddValue(""); } }}
                onBlur={() => setTimeout(() => { setAddMode(false); setAddValue(""); }, 150)}
              />
            )}
          </div>
        )}

        {settingsOpen && currentProject && cur && (
          <div className="proj-drop" style={{ minWidth: 300 }}>
            <div className="proj-sp">
              <div className="proj-sp-title">{cur.name} -- settings</div>
              <div className="proj-sp-row">
                <span className="proj-sp-lbl">TENSOR.md</span>
                <textarea className="proj-sp-val" rows={3} placeholder="Project-specific instructions..." defaultValue="" />
              </div>
              <div className="proj-sp-row">
                <span className="proj-sp-lbl">Tools</span>
                <input className="proj-sp-val" type="text" placeholder="Bash, Read, Edit, Grep..." defaultValue="" />
              </div>
              <div className="proj-sp-row">
                <span className="proj-sp-lbl">Model</span>
                <input className="proj-sp-val" type="text" placeholder="default" defaultValue="" />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default memo(ProjectSelector);
