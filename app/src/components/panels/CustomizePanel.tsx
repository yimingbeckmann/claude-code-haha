import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MemoryEntry {
  id: string;
  title: string;
  content: string;
  type: 'user' | 'feedback' | 'project' | 'reference';
  createdAt: number;
}

export interface CustomizePanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  settings: Record<string, any>;
  onSettingsChange: (key: string, value: any) => void;
}

type SectionId = 'system-prompt' | 'tensor-md' | 'memory' | 'preferences' | 'api-keys';

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'system-prompt', label: 'System Prompt' },
  { id: 'tensor-md', label: 'TENSOR.md' },
  { id: 'memory', label: 'Memory' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'api-keys', label: 'API Keys' },
];

const MEMORY_TYPES: MemoryEntry['type'][] = ['user', 'feedback', 'project', 'reference'];

const MODEL_OPTIONS = [
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
];

const PERMISSION_MODES = [
  { value: 'ask', label: 'Ask' }, { value: 'auto-accept', label: 'Auto-accept' },
  { value: 'plan', label: 'Plan' }, { value: 'auto', label: 'Auto' },
  { value: 'bypass', label: 'Bypass' },
];

const THEME_OPTIONS = [
  { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

const CODE_FONTS = [
  { value: 'JetBrains Mono', label: 'JetBrains Mono' },
  { value: 'Fira Code', label: 'Fira Code' },
  { value: 'Source Code Pro', label: 'Source Code Pro' },
  { value: 'IBM Plex Mono', label: 'IBM Plex Mono' },
  { value: 'Cascadia Code', label: 'Cascadia Code' },
  { value: 'monospace', label: 'System Monospace' },
];

const SK = {
  systemPrompt: 'tensor-customize-system-prompt',
  tensorMd: 'tensor-customize-tensor-md',
  memories: 'tensor-customize-memories',
  preferences: 'tensor-customize-preferences',
  apiKeys: 'tensor-customize-api-keys',
};

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const CSS = `
.custom-panel-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; justify-content:flex-end; z-index:9998; backdrop-filter:blur(3px); }
.custom-panel { display:flex; flex-direction:column; width:520px; max-width:96vw; height:100vh; background:var(--bg-primary,#0a0a12); border-left:1px solid var(--border,#2a2a3e); box-shadow:-8px 0 30px rgba(0,0,0,.4); color:#e4e4ed; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; overflow:hidden; animation:custom-slide .2s ease-out; }
@keyframes custom-slide { from{transform:translateX(100%);opacity:.8} to{transform:translateX(0);opacity:1} }
.custom-panel-header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px; border-bottom:1px solid #2a2a3e; flex-shrink:0; }
.custom-panel-header h2 { margin:0; font-size:15px; font-weight:600; color:#e4e4ed; }
.custom-close-btn { background:none; border:none; cursor:pointer; color:#6a6a82; padding:4px; display:flex; align-items:center; border-radius:4px; transition:color .15s; }
.custom-close-btn:hover { color:#e4e4ed; }
.custom-nav { display:flex; padding:0 12px; border-bottom:1px solid #2a2a3e; flex-shrink:0; background:#0d0d16; overflow-x:auto; }
.custom-nav::-webkit-scrollbar { height:0; }
.custom-nav-btn { padding:9px 14px; font-size:12px; font-weight:500; color:#9898b0; background:none; border:none; border-bottom:2px solid transparent; cursor:pointer; transition:color .15s,border-color .15s; white-space:nowrap; }
.custom-nav-btn:hover { color:#e4e4ed; }
.custom-nav-btn.custom-nav-active { color:#f97316; border-bottom-color:#f97316; font-weight:600; }
.custom-body { flex:1; overflow-y:auto; padding:20px; }
.custom-body::-webkit-scrollbar { width:5px; }
.custom-body::-webkit-scrollbar-track { background:transparent; }
.custom-body::-webkit-scrollbar-thumb { background:#2a2a3e; border-radius:3px; }
.custom-section-title { font-size:11px; font-weight:700; color:#6a6a82; text-transform:uppercase; letter-spacing:1px; margin:0 0 6px; }
.custom-section-desc { font-size:12px; color:#7a7a96; margin:0 0 12px; line-height:1.5; }
.custom-textarea { display:block; width:100%; box-sizing:border-box; background:#1a1a2e; color:#e4e4ed; border:1px solid #2a2a3e; border-radius:6px; padding:10px 12px; font-size:13px; font-family:"JetBrains Mono","Fira Code",monospace; outline:none; resize:vertical; min-height:100px; line-height:1.5; transition:border-color .15s; }
.custom-textarea:focus { border-color:#f97316; }
.custom-textarea::placeholder { color:#6a6a82; }
.custom-char-count { font-size:11px; color:#6a6a82; text-align:right; margin-top:4px; }
.custom-btn-row { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }
.custom-btn { padding:7px 16px; font-size:12px; font-weight:500; border-radius:6px; border:1px solid #2a2a3e; background:#1a1a2e; color:#e4e4ed; cursor:pointer; transition:all .15s; }
.custom-btn:hover { border-color:#3a3a52; background:#22223a; }
.custom-btn:disabled { opacity:.4; cursor:default; }
.custom-btn-primary { background:#f97316; border-color:#f97316; color:#fff; }
.custom-btn-primary:hover { background:#ea6c10; border-color:#ea6c10; }
.custom-btn-danger { color:#ef4444; border-color:transparent; background:transparent; padding:4px 8px; }
.custom-btn-danger:hover { background:rgba(239,68,68,.1); }
.custom-saved-toast { font-size:11px; color:#22c55e; margin-right:auto; align-self:center; }
.custom-memory-list { display:flex; flex-direction:column; gap:8px; margin-bottom:16px; }
.custom-memory-item { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; background:#0f0f1a; border:1px solid #1e1e32; border-radius:6px; }
.custom-memory-body { flex:1; min-width:0; }
.custom-memory-header { display:flex; align-items:center; gap:8px; margin-bottom:3px; }
.custom-memory-title { font-size:13px; font-weight:500; color:#e4e4ed; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.custom-memory-content { font-size:12px; color:#9898b0; line-height:1.45; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.custom-badge { display:inline-block; font-size:10px; font-weight:600; padding:1px 6px; border-radius:3px; text-transform:uppercase; letter-spacing:.4px; }
.custom-badge-user { background:rgba(59,130,246,.15); color:#60a5fa; }
.custom-badge-feedback { background:rgba(168,85,247,.15); color:#c084fc; }
.custom-badge-project { background:rgba(34,197,94,.15); color:#4ade80; }
.custom-badge-reference { background:rgba(249,115,22,.15); color:#fb923c; }
.custom-empty { text-align:center; padding:30px 0; color:#6a6a82; font-size:13px; }
.custom-form-group { margin-bottom:10px; }
.custom-form-label { display:block; font-size:12px; font-weight:500; color:#9898b0; margin-bottom:4px; }
.custom-input { display:block; width:100%; box-sizing:border-box; background:#1a1a2e; color:#e4e4ed; border:1px solid #2a2a3e; border-radius:6px; padding:7px 10px; font-size:13px; outline:none; transition:border-color .15s; }
.custom-input:focus { border-color:#f97316; }
.custom-input::placeholder { color:#6a6a82; }
.custom-select { display:block; width:100%; box-sizing:border-box; background:#1a1a2e; color:#e4e4ed; border:1px solid #2a2a3e; border-radius:6px; padding:7px 10px; font-size:13px; outline:none; cursor:pointer; }
.custom-select:focus { border-color:#f97316; }
.custom-select option { background:#1a1a2e; color:#e4e4ed; }
.custom-pref-row { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #1a1a2e; gap:16px; }
.custom-pref-row:last-child { border-bottom:none; }
.custom-pref-label { font-size:13px; font-weight:500; color:#e4e4ed; }
.custom-pref-desc { font-size:11.5px; color:#7a7a96; margin-top:2px; line-height:1.4; }
.custom-pref-select { background:#1a1a2e; color:#e4e4ed; border:1px solid #2a2a3e; border-radius:6px; padding:6px 10px; font-size:13px; outline:none; min-width:160px; cursor:pointer; }
.custom-pref-select:focus { border-color:#f97316; }
.custom-pref-select option { background:#1a1a2e; color:#e4e4ed; }
.custom-slider-wrap { display:flex; align-items:center; gap:10px; }
.custom-slider { -webkit-appearance:none; appearance:none; width:120px; height:4px; border-radius:2px; background:#2a2a3e; outline:none; cursor:pointer; }
.custom-slider::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:#f97316; cursor:pointer; border:2px solid #0a0a12; }
.custom-slider::-moz-range-thumb { width:14px; height:14px; border-radius:50%; background:#f97316; cursor:pointer; border:2px solid #0a0a12; }
.custom-slider-value { font-size:12px; color:#9898b0; font-family:"JetBrains Mono","Fira Code",monospace; min-width:40px; text-align:right; }
.custom-api-row { margin-bottom:14px; }
.custom-api-input-wrap { display:flex; gap:6px; }
.custom-api-input { flex:1; background:#1a1a2e; color:#e4e4ed; border:1px solid #2a2a3e; border-radius:6px; padding:7px 10px; font-size:13px; font-family:"JetBrains Mono","Fira Code",monospace; outline:none; transition:border-color .15s; }
.custom-api-input:focus { border-color:#f97316; }
.custom-api-input::placeholder { color:#6a6a82; }
.custom-toggle-vis { background:#1a1a2e; border:1px solid #2a2a3e; border-radius:6px; color:#6a6a82; cursor:pointer; padding:0 10px; display:flex; align-items:center; transition:color .15s; }
.custom-toggle-vis:hover { color:#e4e4ed; border-color:#3a3a52; }
.custom-conn-status { display:flex; align-items:center; gap:6px; font-size:12px; margin-top:4px; }
.custom-conn-dot { width:7px; height:7px; border-radius:50%; }
.custom-conn-dot-ok { background:#22c55e; box-shadow:0 0 5px rgba(34,197,94,.35); }
.custom-conn-dot-err { background:#ef4444; box-shadow:0 0 5px rgba(239,68,68,.3); }
.custom-conn-dot-pending { background:#f59e0b; box-shadow:0 0 5px rgba(245,158,11,.3); }
.custom-divider { border:none; border-top:1px solid #1e1e32; margin:16px 0; }
.custom-add-form { background:#0f0f1a; border:1px solid #1e1e32; border-radius:6px; padding:14px; }
.custom-add-form-title { font-size:12px; font-weight:600; color:#9898b0; margin:0 0 10px; }
`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch { return fallback; }
}

function save(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'k';
  return String(n);
}

/* Inline SVG icon helpers */
const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M2 4h12M5 4V2.5A1.5 1.5 0 016.5 1h3A1.5 1.5 0 0111 2.5V4M13 4v9.5a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 13.5V4" />
  </svg>
);

const EyeIcon = ({ open }: { open: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    {open ? (
      <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
    ) : (
      <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
    )}
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Section: System Prompt                                             */
/* ------------------------------------------------------------------ */

function SystemPromptSection() {
  const [prompt, setPrompt] = useState(() => load<string>(SK.systemPrompt, ''));
  const [saved, setSaved] = useState(false);
  const max = 8000;

  const handleSave = useCallback(() => {
    save(SK.systemPrompt, prompt);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [prompt]);

  return (
    <div>
      <div className="custom-section-title">System Prompt</div>
      <p className="custom-section-desc">
        This text will be appended to every conversation. Use it to define
        persistent behavior, tone, or constraints.
      </p>
      <textarea
        className="custom-textarea"
        value={prompt}
        onChange={(e) => { if (e.target.value.length <= max) setPrompt(e.target.value); }}
        placeholder="You are a senior engineer focused on clean, tested code..."
        rows={8}
      />
      <div className="custom-char-count">{prompt.length} / {max}</div>
      <div className="custom-btn-row">
        {saved && <span className="custom-saved-toast">Saved</span>}
        <button className="custom-btn custom-btn-primary" onClick={handleSave} disabled={!prompt.length}>
          Save
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: TENSOR.md                                                 */
/* ------------------------------------------------------------------ */

function TensorMdSection({ apiBase }: { apiBase: string }) {
  const [content, setContent] = useState(() => load<string>(SK.tensorMd, ''));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!apiBase) return;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/tensor-md`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.content) {
          setContent(data.content);
          setDraft(data.content);
          save(SK.tensorMd, data.content);
        }
      } catch { /* bridge unavailable, use localStorage */ }
    })();
    return () => { cancelled = true; };
  }, [apiBase]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      if (apiBase) {
        const res = await fetch(`${apiBase}/tensor-md`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: draft }),
        });
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      }
      setContent(draft);
      save(SK.tensorMd, draft);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    } finally { setSaving(false); }
  }, [apiBase, draft]);

  return (
    <div>
      <div className="custom-section-title">TENSOR.md</div>
      <p className="custom-section-desc">
        This file provides context to the AI about your project. It is read at
        the start of each session and informs coding style, architecture, and
        project-specific rules.
      </p>
      {editing ? (
        <>
          <textarea
            className="custom-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={"# Project Context\n\n- Language: TypeScript\n- Framework: React..."}
            rows={12}
            autoFocus
          />
          {error && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{error}</div>}
          <div className="custom-btn-row">
            {saved && <span className="custom-saved-toast">Saved</span>}
            <button className="custom-btn" onClick={() => { setEditing(false); setDraft(content); setError(''); }} disabled={saving}>Cancel</button>
            <button className="custom-btn custom-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </>
      ) : (
        <>
          {content ? (
            <pre style={{ background:'#0f0f1a', border:'1px solid #1e1e32', borderRadius:6, padding:'10px 12px', fontSize:12, fontFamily:'"JetBrains Mono","Fira Code",monospace', color:'#9898b0', whiteSpace:'pre-wrap', wordBreak:'break-word', maxHeight:240, overflowY:'auto', margin:0, lineHeight:1.5 }}>
              {content}
            </pre>
          ) : (
            <div className="custom-empty">No TENSOR.md found. Create one to give the AI project context.</div>
          )}
          <div className="custom-btn-row">
            <button className="custom-btn" onClick={() => { setDraft(content); setEditing(true); }}>
              {content ? 'Edit' : 'Create'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Memory                                                    */
/* ------------------------------------------------------------------ */

function MemorySection() {
  const [memories, setMemories] = useState<MemoryEntry[]>(() => load<MemoryEntry[]>(SK.memories, []));
  const [showForm, setShowForm] = useState(false);
  const [fTitle, setFTitle] = useState('');
  const [fContent, setFContent] = useState('');
  const [fType, setFType] = useState<MemoryEntry['type']>('user');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { save(SK.memories, memories); }, [memories]);
  useEffect(() => { if (showForm) titleRef.current?.focus(); }, [showForm]);

  const handleAdd = useCallback(() => {
    if (!fTitle.trim() || !fContent.trim()) return;
    setMemories((prev) => [{ id: genId(), title: fTitle.trim(), content: fContent.trim(), type: fType, createdAt: Date.now() }, ...prev]);
    setFTitle(''); setFContent(''); setFType('user'); setShowForm(false);
  }, [fTitle, fContent, fType]);

  return (
    <div>
      <div className="custom-section-title">Memory</div>
      <p className="custom-section-desc">
        Saved memories persist across sessions. The AI can recall these to
        maintain context about your preferences and prior decisions.
      </p>
      {memories.length > 0 ? (
        <div className="custom-memory-list">
          {memories.map((m) => (
            <div className="custom-memory-item" key={m.id}>
              <div className="custom-memory-body">
                <div className="custom-memory-header">
                  <span className="custom-memory-title">{m.title}</span>
                  <span className={`custom-badge custom-badge-${m.type}`}>{m.type}</span>
                </div>
                <div className="custom-memory-content">{m.content}</div>
              </div>
              <div style={{ flexShrink: 0, alignSelf: 'center' }}>
                <button className="custom-btn custom-btn-danger" onClick={() => setMemories((p) => p.filter((x) => x.id !== m.id))} title="Delete memory">
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="custom-empty">No saved memories yet.</div>
      )}
      {showForm ? (
        <div className="custom-add-form">
          <div className="custom-add-form-title">Add Memory</div>
          <div className="custom-form-group">
            <label className="custom-form-label">Title</label>
            <input ref={titleRef} className="custom-input" type="text" placeholder="e.g. Preferred test framework" value={fTitle} onChange={(e) => setFTitle(e.target.value)} />
          </div>
          <div className="custom-form-group">
            <label className="custom-form-label">Content</label>
            <textarea className="custom-textarea" style={{ minHeight: 64 }} placeholder="Details to remember..." value={fContent} onChange={(e) => setFContent(e.target.value)} rows={3} />
          </div>
          <div className="custom-form-group">
            <label className="custom-form-label">Type</label>
            <select className="custom-select" value={fType} onChange={(e) => setFType(e.target.value as MemoryEntry['type'])}>
              {MEMORY_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div className="custom-btn-row">
            <button className="custom-btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="custom-btn custom-btn-primary" onClick={handleAdd} disabled={!fTitle.trim() || !fContent.trim()}>Add</button>
          </div>
        </div>
      ) : (
        <div className="custom-btn-row">
          <button className="custom-btn" onClick={() => setShowForm(true)}>Add Memory</button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Preferences                                               */
/* ------------------------------------------------------------------ */

function PreferencesSection({ settings, onSettingsChange }: { settings: Record<string, any>; onSettingsChange: (k: string, v: any) => void }) {
  const prefs = useMemo(() => load<Record<string, any>>(SK.preferences, {}), []);

  const get = useCallback((key: string, fb: any) => settings[key] ?? prefs[key] ?? fb, [settings, prefs]);

  const set = useCallback((key: string, value: any) => {
    onSettingsChange(key, value);
    save(SK.preferences, { ...prefs, [key]: value });
  }, [onSettingsChange, prefs]);

  const fontSize = get('fontSize', 14) as number;
  const compactThreshold = get('autoCompactThreshold', 100000) as number;

  const Row = ({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) => (
    <div className="custom-pref-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="custom-pref-label">{label}</div>
        <div className="custom-pref-desc">{desc}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );

  return (
    <div>
      <div className="custom-section-title">Preferences</div>
      <p className="custom-section-desc">Configure default behaviors for new sessions and the editor interface.</p>

      <Row label="Default model" desc="Model used for new conversations">
        <select className="custom-pref-select" value={get('defaultModel', 'claude-sonnet-4-6')} onChange={(e) => set('defaultModel', e.target.value)}>
          {MODEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Row>

      <Row label="Default permission mode" desc="How tool permissions are handled by default">
        <select className="custom-pref-select" value={get('permissionMode', 'ask')} onChange={(e) => set('permissionMode', e.target.value)}>
          {PERMISSION_MODES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Row>

      <Row label="Auto-compact threshold" desc="Compact context when token count exceeds this limit">
        <div className="custom-slider-wrap">
          <input className="custom-slider" type="range" min={20000} max={200000} step={5000} value={compactThreshold} onChange={(e) => set('autoCompactThreshold', +e.target.value)} />
          <span className="custom-slider-value">{fmtTokens(compactThreshold)}</span>
        </div>
      </Row>

      <Row label="Theme" desc="Color scheme for the interface">
        <select className="custom-pref-select" value={get('theme', 'dark')} onChange={(e) => set('theme', e.target.value)}>
          {THEME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Row>

      <Row label="Font size" desc="Base font size in pixels">
        <div className="custom-slider-wrap">
          <input className="custom-slider" type="range" min={10} max={20} step={1} value={fontSize} onChange={(e) => set('fontSize', +e.target.value)} />
          <span className="custom-slider-value">{fontSize}px</span>
        </div>
      </Row>

      <Row label="Code font" desc="Monospace font for code blocks and the terminal">
        <select className="custom-pref-select" value={get('codeFont', 'JetBrains Mono')} onChange={(e) => set('codeFont', e.target.value)}>
          {CODE_FONTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Row>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: API Keys                                                  */
/* ------------------------------------------------------------------ */

type ConnStatus = 'idle' | 'testing' | 'ok' | 'error';

function ApiKeysSection({ apiBase }: { apiBase: string }) {
  const stored = useMemo(() => load<Record<string, string>>(SK.apiKeys, {}), []);
  const [anthropicKey, setAnthropicKey] = useState(stored.anthropicKey || '');
  const [openaiKey, setOpenaiKey] = useState(stored.openaiKey || '');
  const [baseUrl, setBaseUrl] = useState(stored.customBaseUrl || '');
  const [showA, setShowA] = useState(false);
  const [showO, setShowO] = useState(false);
  const [conn, setConn] = useState<ConnStatus>('idle');
  const [connMsg, setConnMsg] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(() => {
    save(SK.apiKeys, { anthropicKey, openaiKey, customBaseUrl: baseUrl });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [anthropicKey, openaiKey, baseUrl]);

  const testConnection = useCallback(async () => {
    setConn('testing'); setConnMsg('');
    const url = baseUrl || apiBase;
    if (!url) { setConn('error'); setConnMsg('No API base URL configured'); return; }
    try {
      const res = await fetch(`${url}/health`, {
        headers: anthropicKey ? { Authorization: `Bearer ${anthropicKey}` } : undefined,
      });
      if (res.ok) { setConn('ok'); setConnMsg('Connection successful'); }
      else { setConn('error'); setConnMsg(`Server responded with status ${res.status}`); }
    } catch (err: any) { setConn('error'); setConnMsg(err?.message || 'Connection failed'); }
  }, [apiBase, baseUrl, anthropicKey]);

  const mask = (val: string) => {
    if (!val || val.length <= 8) return '*'.repeat(val.length);
    return val.slice(0, 4) + '*'.repeat(val.length - 8) + val.slice(-4);
  };

  const KeyField = ({ label, placeholder, value, setValue, show, setShow }: {
    label: string; placeholder: string; value: string; setValue: (v: string) => void;
    show: boolean; setShow: (v: boolean) => void;
  }) => (
    <div className="custom-api-row">
      <label className="custom-form-label">{label}</label>
      <div className="custom-api-input-wrap">
        <input
          className="custom-api-input"
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={show ? value : mask(value)}
          onChange={(e) => { if (!show) setShow(true); setValue(e.target.value); }}
          onFocus={() => { if (!show) setShow(true); }}
        />
        <button className="custom-toggle-vis" onClick={() => setShow(!show)} title={show ? 'Hide' : 'Reveal'}>
          <EyeIcon open={show} />
        </button>
      </div>
    </div>
  );

  const dotClass = conn === 'ok' ? 'custom-conn-dot custom-conn-dot-ok'
    : conn === 'error' ? 'custom-conn-dot custom-conn-dot-err'
    : conn === 'testing' ? 'custom-conn-dot custom-conn-dot-pending' : '';

  const dotColor = conn === 'ok' ? '#22c55e' : conn === 'error' ? '#ef4444' : '#f59e0b';

  return (
    <div>
      <div className="custom-section-title">API Keys</div>
      <p className="custom-section-desc">
        Keys are stored locally in your browser and never sent to third-party
        servers. They authenticate directly with model providers.
      </p>
      <KeyField label="Anthropic API Key" placeholder="sk-ant-..." value={anthropicKey} setValue={setAnthropicKey} show={showA} setShow={setShowA} />
      <KeyField label="OpenAI API Key" placeholder="sk-..." value={openaiKey} setValue={setOpenaiKey} show={showO} setShow={setShowO} />
      <div className="custom-api-row">
        <label className="custom-form-label">Custom Base URL</label>
        <input className="custom-input" type="text" placeholder="https://api.example.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
      </div>
      <hr className="custom-divider" />
      {conn !== 'idle' && (
        <div className="custom-conn-status">
          <span className={dotClass} />
          <span style={{ color: dotColor }}>{conn === 'testing' ? 'Testing...' : connMsg}</span>
        </div>
      )}
      <div className="custom-btn-row">
        {saved && <span className="custom-saved-toast">Saved</span>}
        <button className="custom-btn" onClick={testConnection} disabled={conn === 'testing'}>
          {conn === 'testing' ? 'Testing...' : 'Test Connection'}
        </button>
        <button className="custom-btn custom-btn-primary" onClick={handleSave}>Save</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function CustomizePanel({ isOpen, onClose, apiBase, settings, onSettingsChange }: CustomizePanelProps) {
  const [active, setActive] = useState<SectionId>('system-prompt');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => { prev?.focus(); };
  }, [isOpen]);

  if (!isOpen) return null;

  const body = (() => {
    switch (active) {
      case 'system-prompt': return <SystemPromptSection />;
      case 'tensor-md': return <TensorMdSection apiBase={apiBase} />;
      case 'memory': return <MemorySection />;
      case 'preferences': return <PreferencesSection settings={settings} onSettingsChange={onSettingsChange} />;
      case 'api-keys': return <ApiKeysSection apiBase={apiBase} />;
    }
  })();

  return (
    <>
      <style>{CSS}</style>
      <div className="custom-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="custom-panel" ref={panelRef} tabIndex={-1}>
          <div className="custom-panel-header">
            <h2>Customize</h2>
            <button className="custom-close-btn" onClick={onClose}><CloseIcon /></button>
          </div>
          <nav className="custom-nav">
            {SECTIONS.map((s) => (
              <button key={s.id} className={`custom-nav-btn${active === s.id ? ' custom-nav-active' : ''}`} onClick={() => setActive(s.id)}>
                {s.label}
              </button>
            ))}
          </nav>
          <div className="custom-body">{body}</div>
        </div>
      </div>
    </>
  );
}
