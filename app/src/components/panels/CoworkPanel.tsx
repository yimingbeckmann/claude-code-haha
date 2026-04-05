import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';

// ── Types ─────────────────────────────────────────────────────────────

export interface CoworkPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (text: string) => void;
  apiBase: string;
}

interface WatchedFile { id: string; path: string; lastModified: number; hasChanges: boolean; }
type EventKind = 'user-edit' | 'ai-suggestion' | 'user-accept' | 'user-reject' | 'watch-add' | 'watch-remove';
interface ActivityEvent { id: string; kind: EventKind; timestamp: number; description: string; filePath?: string; diff?: string; }
type Scope = 'current-file' | 'all-watched' | 'entire-project';
interface CoworkSettings { autoSuggestOnSave: boolean; showInlineSuggestions: boolean; suggestionDelay: number; scope: Scope; }
type SectionId = 'files' | 'activity' | 'settings' | 'actions';

// ── Styles ────────────────────────────────────────────────────────────

const CSS = `
/* Layout */
.cowork-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex; justify-content: flex-end;
  z-index: 9000; backdrop-filter: blur(2px);
}
.cowork-panel {
  width: 480px; max-width: 100vw; height: 100vh;
  background: var(--bg-primary, #08080c);
  border-left: 1px solid var(--border, rgba(255,255,255,0.04));
  display: flex; flex-direction: column; overflow: hidden;
  animation: cowork-in 0.2s ease-out;
}
@keyframes cowork-in {
  from { transform: translateX(100%); opacity: 0.6; }
  to   { transform: translateX(0);    opacity: 1; }
}

/* Header */
.cowork-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary, #0c0c14);
  flex-shrink: 0;
}
.cowork-header-left { display: flex; align-items: center; gap: 10px; }
.cowork-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.cowork-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--success, #22c55e);
  box-shadow: 0 0 6px rgba(34,197,94,0.4);
  flex-shrink: 0;
}
.cowork-close {
  background: none; border: none;
  color: var(--text-secondary); cursor: pointer;
  padding: 4px; display: flex; border-radius: 4px;
}
.cowork-close:hover { color: var(--text-primary); }

/* Description banner */
.cowork-desc {
  padding: 10px 16px; font-size: 12px; line-height: 1.5;
  color: var(--text-secondary);
  background: var(--bg-tertiary, rgba(255,255,255,0.03));
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

/* Scrollable body */
.cowork-body {
  flex: 1; overflow-y: auto; padding: 12px 16px;
  display: flex; flex-direction: column; gap: 14px;
}
.cowork-body::-webkit-scrollbar { width: 5px; }
.cowork-body::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.06); border-radius: 3px;
}

/* Collapsible sections */
.cowork-section {
  background: var(--bg-secondary, #0c0c14);
  border-radius: var(--radius-lg, 8px);
  border: 1px solid var(--border); overflow: hidden;
}
.cowork-sh {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--text-secondary);
  background: var(--bg-tertiary, rgba(255,255,255,0.03));
  border-bottom: 1px solid var(--border);
  cursor: pointer; user-select: none;
}
.cowork-sh:hover { color: var(--text-primary); }
.cowork-sh-left { display: flex; align-items: center; gap: 6px; }
.cowork-chev { transition: transform 0.2s; display: inline-flex; }
.cowork-chev.open { transform: rotate(90deg); }
.cowork-sb { overflow: hidden; }
.cowork-sb.off { display: none; }

/* File rows */
.cowork-fr { display:flex; align-items:center; padding:7px 12px; gap:8px; border-bottom:1px solid var(--border); font-size:12px; font-family:var(--font-mono); transition:background .12s; }
.cowork-fr:last-child { border-bottom:none; }
.cowork-fr:hover { background:var(--bg-hover,rgba(255,255,255,.05)); }
.cowork-fi { color:var(--info,#3b82f6); flex-shrink:0; display:flex; }
.cowork-fp { flex:1; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cowork-ft { font-size:10px; color:var(--text-muted); flex-shrink:0; }
.cowork-fc { width:6px; height:6px; border-radius:50%; background:var(--warning,#f59e0b); flex-shrink:0; }
.cowork-fx { background:none; border:none; color:var(--text-muted); cursor:pointer; padding:2px; display:flex; border-radius:4px; flex-shrink:0; }
.cowork-fx:hover { color:var(--error,#ef4444); }
.cowork-empty { padding:14px 12px; text-align:center; font-size:12px; color:var(--text-muted); }
.cowork-fbtns { display:flex; gap:6px; padding:8px 12px; border-top:1px solid var(--border); }
.cowork-addrow { display:flex; gap:6px; padding:8px 12px; border-top:1px solid var(--border); }
.cowork-addin { flex:1; background:var(--bg-primary,#08080c); color:var(--text-primary); border:1px solid var(--border); border-radius:4px; padding:5px 8px; font-size:12px; font-family:var(--font-mono); outline:none; }
.cowork-addin:focus { border-color:var(--accent,#f97316); }
.cowork-addin::placeholder { color:var(--text-muted); }

/* Buttons */
.cowork-btn { background:var(--bg-tertiary,rgba(255,255,255,.03)); color:var(--text-primary); border:1px solid var(--border); border-radius:4px; padding:5px 10px; font-size:11px; font-weight:500; cursor:pointer; transition:all .15s; white-space:nowrap; font-family:var(--font-mono); }
.cowork-btn:hover { border-color:var(--border-hover,rgba(255,255,255,.08)); background:var(--bg-hover); }
.cowork-btn-p { background:var(--accent,#f97316); color:#fff; border-color:var(--accent); }
.cowork-btn-p:hover { background:var(--accent-bright,#fb923c); border-color:var(--accent-bright); }
.cowork-btn-s { padding:3px 8px; font-size:10px; }

/* Activity feed */
.cowork-al { max-height:280px; overflow-y:auto; }
.cowork-al::-webkit-scrollbar { width:4px; }
.cowork-al::-webkit-scrollbar-thumb { background:rgba(255,255,255,.05); border-radius:2px; }
.cowork-ev { display:flex; align-items:flex-start; gap:8px; padding:8px 12px; border-bottom:1px solid var(--border); font-size:12px; transition:background .12s; }
.cowork-ev:last-child { border-bottom:none; }
.cowork-ev:hover { background:var(--bg-hover); }
.cowork-ei { flex-shrink:0; width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; margin-top:1px; }
.cowork-ei.user-edit      { background:var(--info-dim,rgba(59,130,246,.12)); color:var(--info,#3b82f6); }
.cowork-ei.ai-suggestion  { background:var(--purple-dim,rgba(168,85,247,.12)); color:var(--purple,#a855f7); }
.cowork-ei.user-accept    { background:var(--success-dim,rgba(34,197,94,.12)); color:var(--success,#22c55e); }
.cowork-ei.user-reject,
.cowork-ei.watch-remove   { background:var(--error-dim,rgba(239,68,68,.12)); color:var(--error,#ef4444); }
.cowork-ei.watch-add      { background:var(--accent-dim,rgba(249,115,22,.15)); color:var(--accent,#f97316); }
.cowork-eb { flex:1; min-width:0; }
.cowork-ed { color:var(--text-primary); line-height:1.45; }
.cowork-et { font-size:10px; color:var(--text-muted); margin-top:2px; }
.cowork-dt { background:none; border:none; color:var(--purple,#a855f7); font-size:11px; cursor:pointer; padding:2px 0; margin-top:4px; font-family:var(--font-mono); }
.cowork-dt:hover { color:var(--accent-bright,#fb923c); }
.cowork-df { margin-top:6px; background:var(--bg-primary,#08080c); border:1px solid var(--border); border-radius:4px; padding:8px 10px; font-size:11px; font-family:var(--font-mono); line-height:1.55; white-space:pre-wrap; word-break:break-all; max-height:180px; overflow-y:auto; }
.cowork-da { color:var(--success,#22c55e); }
.cowork-dd { color:var(--error,#ef4444); text-decoration:line-through; }
.cowork-dc { color:var(--text-muted); }

/* Settings */
.cowork-sr { display:flex; align-items:center; justify-content:space-between; padding:9px 12px; gap:12px; border-bottom:1px solid var(--border); }
.cowork-sr:last-child { border-bottom:none; }
.cowork-si { flex:1; min-width:0; }
.cowork-sl { font-size:12px; font-weight:500; color:var(--text-primary); }
.cowork-sd { font-size:10px; color:var(--text-muted); margin-top:1px; line-height:1.3; }
.cowork-tog { position:relative; width:36px; height:20px; border-radius:10px; cursor:pointer; transition:background-color .2s; border:none; padding:0; outline:none; flex-shrink:0; }
.cowork-tog[data-on="true"]  { background-color:var(--accent,#f97316); }
.cowork-tog[data-on="false"] { background-color:rgba(255,255,255,.08); }
.cowork-tog::after { content:""; position:absolute; top:2px; width:16px; height:16px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.3); transition:left .2s; }
.cowork-tog[data-on="true"]::after  { left:18px; }
.cowork-tog[data-on="false"]::after { left:2px; }
.cowork-slr { display:flex; align-items:center; gap:8px; flex-shrink:0; }
.cowork-sli { -webkit-appearance:none; appearance:none; width:100px; height:4px; border-radius:2px; background:rgba(255,255,255,.08); outline:none; cursor:pointer; }
.cowork-sli::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:var(--accent,#f97316); cursor:pointer; border:none; }
.cowork-slv { font-size:11px; font-family:var(--font-mono); color:var(--text-secondary); min-width:32px; text-align:right; }
.cowork-sel { background:var(--bg-primary,#08080c); color:var(--text-primary); border:1px solid var(--border); border-radius:4px; padding:4px 8px; font-size:11px; font-family:var(--font-mono); outline:none; cursor:pointer; }
.cowork-sel:focus { border-color:var(--accent,#f97316); }
.cowork-sel option { background:var(--bg-primary); color:var(--text-primary); }

/* Quick actions */
.cowork-ag { display:flex; flex-direction:column; gap:6px; padding:10px 12px; }
.cowork-ab { display:flex; align-items:center; gap:8px; width:100%; padding:9px 12px; background:var(--bg-primary,#08080c); border:1px solid var(--border); border-radius:var(--radius-md,6px); color:var(--text-primary); font-size:12px; font-family:var(--font-mono); cursor:pointer; transition:all .15s; text-align:left; }
.cowork-ab:hover { border-color:var(--accent,#f97316); background:var(--bg-hover); }
.cowork-ai { display:flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:4px; flex-shrink:0; }
.cowork-ai.rev { background:var(--info-dim); color:var(--info); }
.cowork-ai.exp { background:var(--purple-dim); color:var(--purple); }
.cowork-ai.tst { background:var(--success-dim); color:var(--success); }
`;

// ── Helpers ───────────────────────────────────────────────────────────

let _idc = 0;
const uid = () => `cw-${Date.now()}-${++_idc}`;

function shortenPath(p: string): string {
  const s = p.replace(/\\/g, '/').split('/');
  return s.length <= 3 ? s.join('/') : s.slice(0, 1).join('/') + '/.../' + s.slice(-2).join('/');
}

function relTime(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 5) return 'just now';
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

// ── Inline SVG icons (14x14) ─────────────────────────────────────────

const I: React.SVGProps<SVGSVGElement> = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
const Ic = (d: string) => <svg {...I}><path d={d} /></svg>;
const IcFile = () => <svg {...I}><path d="M4 2h5l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" /><polyline points="9 2 9 6 13 6" /></svg>;
const IcX = () => <svg {...I}><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></svg>;
const IcChev = () => <svg {...I} width={12} height={12}><polyline points="6 4 10 8 6 12" /></svg>;
const IcPlus = () => <svg {...I}><line x1="8" y1="3" x2="8" y2="13" /><line x1="3" y1="8" x2="13" y2="8" /></svg>;
const IcFolder = () => Ic("M2 4v9a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1H8L6.5 3H3a1 1 0 00-1 1z");
const IcEdit = () => <svg {...I} width={10} height={10}><path d="M11 2l3 3-9 9H2v-3z" /></svg>;
const IcSpark = () => <svg {...I} width={10} height={10}><path d="M8 1v4M8 11v4M1 8h4M11 8h4M3.5 3.5l2 2M10.5 10.5l2 2M3.5 12.5l2-2M10.5 5.5l2-2" /></svg>;
const IcCheck = () => <svg {...I} width={10} height={10}><polyline points="3 8 6.5 12 13 4" /></svg>;
const IcSearch = () => <svg {...I}><circle cx="7" cy="7" r="4.5" /><line x1="10.5" y1="10.5" x2="14" y2="14" /></svg>;
const IcBulb = () => <svg {...I}><path d="M8 2a4.5 4.5 0 00-1.5 8.75V12a1 1 0 001 1h1a1 1 0 001-1v-1.25A4.5 4.5 0 008 2z" /><line x1="6.5" y1="14" x2="9.5" y2="14" /></svg>;
const IcTest = () => <svg {...I}><path d="M6 2v4L4.5 9.5a3 3 0 105 0L8 6V2" /><line x1="5" y1="2" x2="9" y2="2" /></svg>;

const EVENT_ICON: Record<EventKind, () => React.ReactElement> = {
  'user-edit': IcEdit, 'ai-suggestion': IcSpark, 'user-accept': IcCheck,
  'user-reject': IcX, 'watch-add': IcPlus, 'watch-remove': IcX,
};

// ── Component ─────────────────────────────────────────────────────────

const CoworkPanel: React.FC<CoworkPanelProps> = ({ isOpen, onClose, onSendMessage, apiBase }) => {
  const [watchedFiles, setWatchedFiles] = useState<WatchedFile[]>([]);
  const [addVisible, setAddVisible] = useState(false);
  const [addValue, setAddValue] = useState('');
  const addRef = useRef<HTMLInputElement>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [expandedDiffs, setExpandedDiffs] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<CoworkSettings>({
    autoSuggestOnSave: true, showInlineSuggestions: true, suggestionDelay: 1.5, scope: 'current-file',
  });
  const [collapsed, setCollapsed] = useState<Set<SectionId>>(new Set());
  const [, setTick] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick for relative times
  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, [isOpen]);

  const push = useCallback((evt: Omit<ActivityEvent, 'id' | 'timestamp'>) => {
    setEvents((p) => [{ ...evt, id: uid(), timestamp: Date.now() }, ...p]);
  }, []);

  const toggleSec = useCallback((s: SectionId) => {
    setCollapsed((p) => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n; });
  }, []);

  const toggleDiff = useCallback((id: string) => {
    setExpandedDiffs((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  // ── Add / remove files ──

  const addFile = useCallback(() => {
    const path = addValue.trim();
    if (!path || watchedFiles.some((f) => f.path === path)) { setAddValue(''); setAddVisible(false); return; }
    setWatchedFiles((p) => [...p, { id: uid(), path, lastModified: Date.now(), hasChanges: false }]);
    push({ kind: 'watch-add', description: `Started watching ${shortenPath(path)}`, filePath: path });
    setAddValue(''); setAddVisible(false);
  }, [addValue, watchedFiles, push]);

  const addDir = useCallback(() => {
    const dir = addValue.trim() || '.';
    setWatchedFiles((p) => [...p, { id: uid(), path: `${dir}/**`, lastModified: Date.now(), hasChanges: false }]);
    push({ kind: 'watch-add', description: `Started watching directory ${shortenPath(dir)}`, filePath: dir });
    setAddValue(''); setAddVisible(false);
  }, [addValue, push]);

  const removeFile = useCallback((fid: string) => {
    setWatchedFiles((p) => {
      const f = p.find((x) => x.id === fid);
      if (f) push({ kind: 'watch-remove', description: `Stopped watching ${shortenPath(f.path)}`, filePath: f.path });
      return p.filter((x) => x.id !== fid);
    });
  }, [push]);

  useEffect(() => { if (addVisible && addRef.current) addRef.current.focus(); }, [addVisible]);

  // ── Quick actions ──

  const doAction = useCallback((cmd: string, desc: string) => {
    onSendMessage(cmd);
    push({ kind: 'user-edit', description: `Requested: ${desc}` });
  }, [onSendMessage, push]);

  // ── Escape to close ──

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isOpen, onClose]);

  // ── Poll for file changes ──

  useEffect(() => {
    if (!isOpen || watchedFiles.length === 0) return;
    const check = async () => {
      try {
        const concrete = watchedFiles.filter((f) => !f.path.includes('*'));
        if (!concrete.length) return;
        const cmd = concrete.map((f) => `stat -f "%m %N" "${f.path}" 2>/dev/null || echo "0 ${f.path}"`).join(' && ');
        const res = await fetch(`${apiBase}/execute`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmd }),
        });
        const data = await res.json();
        if (!data.stdout) return;
        const lines: string[] = data.stdout.trim().split('\n');
        setWatchedFiles((prev) => prev.map((file) => {
          const m = lines.find((l) => l.includes(file.path));
          if (!m) return file;
          const mt = parseInt(m.split(' ')[0], 10) * 1000;
          return mt > file.lastModified ? { ...file, lastModified: mt, hasChanges: true } : file;
        }));
      } catch { /* ignore */ }
    };
    pollRef.current = setInterval(check, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isOpen, apiBase, watchedFiles]);

  // ── Diff renderer ──

  const renderDiff = useMemo(() => (diff: string) =>
    diff.split('\n').map((l, i) => {
      const c = l.startsWith('+') ? 'cowork-da' : l.startsWith('-') ? 'cowork-dd' : 'cowork-dc';
      return <div key={i} className={c}>{l}</div>;
    }), []);

  if (!isOpen) return null;

  // ── Section helper ──

  const Sec = ({ id, label, count, children }: { id: SectionId; label: string; count?: number; children: React.ReactNode }) => (
    <div className="cowork-section">
      <div className="cowork-sh" onClick={() => toggleSec(id)}>
        <div className="cowork-sh-left">
          <span className={`cowork-chev ${collapsed.has(id) ? '' : 'open'}`}><IcChev /></span>
          <span>{label}{count != null ? ` (${count})` : ''}</span>
        </div>
      </div>
      <div className={`cowork-sb ${collapsed.has(id) ? 'off' : ''}`}>{children}</div>
    </div>
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="cowork-overlay" onClick={onClose}>
        <div className="cowork-panel" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="cowork-header">
            <div className="cowork-header-left">
              <div className="cowork-dot" />
              <span className="cowork-title">Cowork</span>
            </div>
            <button className="cowork-close" onClick={onClose} title="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Description */}
          <div className="cowork-desc">
            Cowork mode lets you and the AI work on files simultaneously.
            The AI watches your changes and offers suggestions.
          </div>

          {/* Body */}
          <div className="cowork-body">

            {/* ── Watched Files ── */}
            <Sec id="files" label="Watched Files" count={watchedFiles.length}>
              {watchedFiles.length === 0 ? (
                <div className="cowork-empty">No files being watched. Add a file or directory to get started.</div>
              ) : watchedFiles.map((f) => (
                <div className="cowork-fr" key={f.id} title={f.path}>
                  <span className="cowork-fi"><IcFile /></span>
                  <span className="cowork-fp">{shortenPath(f.path)}</span>
                  <span className="cowork-ft">{relTime(f.lastModified)}</span>
                  {f.hasChanges && <span className="cowork-fc" title="Modified" />}
                  <button className="cowork-fx" onClick={() => removeFile(f.id)} title="Stop watching"><IcX /></button>
                </div>
              ))}
              {addVisible && (
                <div className="cowork-addrow">
                  <input ref={addRef} className="cowork-addin" placeholder="path/to/file.ts"
                    value={addValue} onChange={(e) => setAddValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addFile(); if (e.key === 'Escape') { e.stopPropagation(); setAddVisible(false); setAddValue(''); } }}
                  />
                  <button className="cowork-btn cowork-btn-s cowork-btn-p" onClick={addFile}>Add</button>
                </div>
              )}
              <div className="cowork-fbtns">
                <button className="cowork-btn" onClick={() => setAddVisible((v) => !v)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IcPlus /> Add file</span>
                </button>
                <button className="cowork-btn" onClick={addDir}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IcFolder /> Watch directory</span>
                </button>
              </div>
            </Sec>

            {/* ── Activity Feed ── */}
            <Sec id="activity" label="Activity" count={events.length}>
              {events.length === 0 ? (
                <div className="cowork-empty">No activity yet. Start editing a watched file to see events here.</div>
              ) : (
                <div className="cowork-al">
                  {events.map((ev) => (
                    <div className="cowork-ev" key={ev.id}>
                      <div className={`cowork-ei ${ev.kind}`}>{React.createElement(EVENT_ICON[ev.kind])}</div>
                      <div className="cowork-eb">
                        <div className="cowork-ed">{ev.description}</div>
                        <div className="cowork-et">{fmtTime(ev.timestamp)}</div>
                        {ev.diff && (
                          <>
                            <button className="cowork-dt" onClick={() => toggleDiff(ev.id)}>
                              {expandedDiffs.has(ev.id) ? 'Hide diff' : 'Show suggested diff'}
                            </button>
                            {expandedDiffs.has(ev.id) && <div className="cowork-df">{renderDiff(ev.diff)}</div>}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Sec>

            {/* ── Settings ── */}
            <Sec id="settings" label="Settings">
              <div className="cowork-sr">
                <div className="cowork-si">
                  <div className="cowork-sl">Auto-suggest on save</div>
                  <div className="cowork-sd">Automatically generate suggestions when you save a file</div>
                </div>
                <button className="cowork-tog" data-on={String(settings.autoSuggestOnSave)}
                  onClick={() => setSettings((s) => ({ ...s, autoSuggestOnSave: !s.autoSuggestOnSave }))}
                  role="switch" aria-checked={settings.autoSuggestOnSave} />
              </div>
              <div className="cowork-sr">
                <div className="cowork-si">
                  <div className="cowork-sl">Show inline suggestions</div>
                  <div className="cowork-sd">Display AI suggestions directly in the editor</div>
                </div>
                <button className="cowork-tog" data-on={String(settings.showInlineSuggestions)}
                  onClick={() => setSettings((s) => ({ ...s, showInlineSuggestions: !s.showInlineSuggestions }))}
                  role="switch" aria-checked={settings.showInlineSuggestions} />
              </div>
              <div className="cowork-sr">
                <div className="cowork-si">
                  <div className="cowork-sl">Suggestion delay</div>
                  <div className="cowork-sd">Wait time after changes before generating suggestions</div>
                </div>
                <div className="cowork-slr">
                  <input className="cowork-sli" type="range" min="0.5" max="5" step="0.5"
                    value={settings.suggestionDelay}
                    onChange={(e) => setSettings((s) => ({ ...s, suggestionDelay: parseFloat(e.target.value) }))} />
                  <span className="cowork-slv">{settings.suggestionDelay.toFixed(1)}s</span>
                </div>
              </div>
              <div className="cowork-sr">
                <div className="cowork-si">
                  <div className="cowork-sl">Scope</div>
                  <div className="cowork-sd">Which files the AI analyzes for suggestions</div>
                </div>
                <select className="cowork-sel" value={settings.scope}
                  onChange={(e) => setSettings((s) => ({ ...s, scope: e.target.value as Scope }))}>
                  <option value="current-file">Current file</option>
                  <option value="all-watched">All watched files</option>
                  <option value="entire-project">Entire project</option>
                </select>
              </div>
            </Sec>

            {/* ── Quick Actions ── */}
            <Sec id="actions" label="Quick Actions">
              <div className="cowork-ag">
                <button className="cowork-ab" onClick={() => doAction('/review Review my recent changes across all watched files and flag potential issues.', 'Review my changes')}>
                  <span className="cowork-ai rev"><IcSearch /></span>
                  Review my changes
                </button>
                <button className="cowork-ab" onClick={() => doAction('/explain Summarize what I just did based on the recent file changes.', 'Explain what I just did')}>
                  <span className="cowork-ai exp"><IcBulb /></span>
                  Explain what I just did
                </button>
                <button className="cowork-ab" onClick={() => doAction('/test Write tests for the changes I have made to the watched files.', 'Write tests for changes')}>
                  <span className="cowork-ai tst"><IcTest /></span>
                  Write tests for changes
                </button>
              </div>
            </Sec>

          </div>
        </div>
      </div>
    </>
  );
};

export default CoworkPanel;
