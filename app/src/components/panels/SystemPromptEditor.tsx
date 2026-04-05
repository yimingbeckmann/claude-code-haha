import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";

// ── Types ───────────────────────────────────────────────────

export interface SystemPromptEditorProps {
  isOpen: boolean;
  onClose: () => void;
  currentPrompt: string;
  onSave: (prompt: string) => void;
  projectPath?: string;
  apiBase: string;
}

interface TemplateEntry {
  name: string;
  content: string;
}

interface VariableEntry {
  token: string;
  label: string;
}

// ── Constants ───────────────────────────────────────────────

const ACCENT = "#e84520";
const ACCENT_HOVER = "#d13d1b";

const TEMPLATES: TemplateEntry[] = [
  {
    name: "Code Review Expert",
    content: `You are a senior code reviewer with deep expertise across multiple languages and frameworks.

Focus on:
- Code correctness and edge cases
- Performance implications
- Security vulnerabilities
- Naming clarity and readability
- DRY violations and abstraction opportunities
- Test coverage gaps

Project: {{project_name}}
Language: {{language}}
Framework: {{framework}}
Working directory: {{cwd}}

Be direct. Flag issues by severity: CRITICAL, WARNING, SUGGESTION.
Provide inline fixes, not just descriptions.`,
  },
  {
    name: "Full-Stack Developer",
    content: `You are a full-stack developer working on {{project_name}}.

Stack: {{language}} / {{framework}}
Working directory: {{cwd}}

Guidelines:
- Write production-ready code with proper error handling
- Follow the existing codebase conventions and patterns
- Include TypeScript types where applicable
- Consider both frontend UX and backend reliability
- Use existing utilities before creating new ones
- Write tests for critical paths
- Keep components focused and composable`,
  },
  {
    name: "Bug Fixer",
    content: `You are a debugging specialist for {{project_name}}.

Working directory: {{cwd}}
Language: {{language}}

Approach:
1. Reproduce the issue — understand the exact steps and expected vs actual behavior
2. Isolate the root cause — read the relevant code, check recent changes
3. Apply the minimal targeted fix — do not refactor unrelated code
4. Verify the fix — confirm it resolves the issue without regressions
5. If a fix doesn't work, revert it before trying the next approach

Never layer fix on top of fix. One change at a time.`,
  },
  {
    name: "Documentation Writer",
    content: `You are a technical documentation writer for {{project_name}}.

Framework: {{framework}}
Language: {{language}}

Guidelines:
- Write clear, concise documentation
- Include code examples for every API or function
- Document parameters, return types, and edge cases
- Use consistent formatting (headers, lists, code blocks)
- Write for the developer who will maintain this code in 6 months
- Keep README sections focused: Overview, Setup, Usage, API, Contributing`,
  },
  {
    name: "Security Auditor",
    content: `You are a security auditor reviewing {{project_name}}.

Language: {{language}}
Framework: {{framework}}
Working directory: {{cwd}}

Audit checklist:
- Input validation and sanitization
- Authentication and authorization flows
- SQL injection, XSS, CSRF vulnerabilities
- Secrets management (no hardcoded keys, tokens, passwords)
- Dependency vulnerabilities
- File upload and path traversal risks
- Rate limiting and abuse prevention
- Logging sensitive data

Rate findings: CRITICAL / HIGH / MEDIUM / LOW / INFO.
Provide remediation steps for each finding.`,
  },
  {
    name: "Performance Optimizer",
    content: `You are a performance optimization specialist for {{project_name}}.

Language: {{language}}
Framework: {{framework}}
Working directory: {{cwd}}

Focus areas:
- Identify hot paths and bottlenecks
- Reduce unnecessary re-renders (React) or recomputations
- Optimize database queries and N+1 problems
- Bundle size and code splitting opportunities
- Memory leaks and garbage collection pressure
- Caching strategies (memoization, HTTP caching, CDN)
- Lazy loading and deferred execution

Always measure before and after. Provide benchmarks or profiling steps.`,
  },
];

const VARIABLES: VariableEntry[] = [
  { token: "{{project_name}}", label: "Project name" },
  { token: "{{language}}", label: "Primary language" },
  { token: "{{framework}}", label: "Framework" },
  { token: "{{cwd}}", label: "Working directory" },
];

// ── Helpers ─────────────────────────────────────────────────

function storageKey(projectPath?: string): string {
  const base = "sysprompt-editor";
  return projectPath ? `${base}::${projectPath}` : base;
}

function loadFromStorage(projectPath?: string): string | null {
  try {
    return localStorage.getItem(storageKey(projectPath));
  } catch {
    return null;
  }
}

function saveToStorage(value: string, projectPath?: string): void {
  try {
    localStorage.setItem(storageKey(projectPath), value);
  } catch {
    /* noop */
  }
}

function dirName(p: string): string {
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || p;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

// ── Syntax Highlighting ─────────────────────────────────────

function highlightSyntax(text: string): React.ReactElement[] {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const parts: React.ReactElement[] = [];
    let remaining = line;
    let key = 0;

    // Process the line for highlights
    while (remaining.length > 0) {
      // Match {{variables}}
      const varMatch = remaining.match(/\{\{[\w_]+\}\}/);
      // Match markdown headers
      const headerMatch = remaining.match(/^(#{1,6}\s)/);

      if (varMatch && varMatch.index !== undefined) {
        if (varMatch.index > 0) {
          const beforeText = remaining.slice(0, varMatch.index);
          if (headerMatch && parts.length === 0) {
            parts.push(
              <span key={key++} style={{ color: "#60a5fa", fontWeight: 600 }}>
                {beforeText}
              </span>
            );
          } else {
            parts.push(<span key={key++}>{beforeText}</span>);
          }
        }
        parts.push(
          <span
            key={key++}
            style={{
              color: ACCENT,
              background: "rgba(232, 69, 32, 0.12)",
              borderRadius: 3,
              padding: "0 2px",
            }}
          >
            {varMatch[0]}
          </span>
        );
        remaining = remaining.slice(varMatch.index + varMatch[0].length);
      } else {
        if (headerMatch && parts.length === 0) {
          parts.push(
            <span key={key++} style={{ color: "#60a5fa", fontWeight: 600 }}>
              {remaining}
            </span>
          );
        } else {
          parts.push(<span key={key++}>{remaining}</span>);
        }
        remaining = "";
      }
    }

    if (parts.length === 0) {
      parts.push(<span key={0}>{"\u00A0"}</span>);
    }

    return (
      <div key={i} style={{ minHeight: 20, lineHeight: "20px" }}>
        {parts}
      </div>
    );
  });
}

// ── Styles (embedded CSS) ───────────────────────────────────

const CSS = `
.spe-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; justify-content:center; align-items:center; z-index:9999; backdrop-filter:blur(3px); -webkit-backdrop-filter:blur(3px); }
.spe-panel { display:flex; flex-direction:column; width:860px; max-width:96vw; height:90vh; max-height:90vh; background:var(--bg-primary,#0a0a12); border:1px solid var(--border,#2a2a3e); border-radius:12px; box-shadow:0 24px 64px rgba(0,0,0,.6); color:#e4e4ed; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; overflow:hidden; animation:spe-appear .18s ease-out; }
@keyframes spe-appear { from{transform:scale(.97);opacity:.7} to{transform:scale(1);opacity:1} }

.spe-header { display:flex; align-items:center; gap:12px; padding:16px 20px; border-bottom:1px solid #2a2a3e; flex-shrink:0; }
.spe-header-title { font-size:15px; font-weight:600; color:#e4e4ed; margin:0; display:flex; align-items:center; gap:10px; }
.spe-header-badge { display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:500; color:#9898b0; background:#1a1a2e; border:1px solid #2a2a3e; border-radius:4px; padding:2px 8px; font-family:"JetBrains Mono","Fira Code",monospace; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.spe-unsaved-dot { width:8px; height:8px; border-radius:50%; background:${ACCENT}; flex-shrink:0; animation:spe-pulse 2s infinite; }
@keyframes spe-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
.spe-header-spacer { flex:1; }
.spe-close-btn { background:none; border:none; cursor:pointer; color:#6a6a82; padding:6px; display:flex; align-items:center; border-radius:4px; transition:color .15s,background .15s; }
.spe-close-btn:hover { color:#e4e4ed; background:#1a1a2e; }

.spe-body { flex:1; display:flex; flex-direction:column; overflow:hidden; min-height:0; }

/* Editor area */
.spe-editor-wrap { flex:1; display:flex; flex-direction:column; padding:16px 20px 8px; min-height:0; }
.spe-editor-label { font-size:11px; font-weight:700; color:#6a6a82; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }
.spe-editor-container { flex:1; display:flex; position:relative; background:#0f0f1a; border:1px solid #2a2a3e; border-radius:8px; overflow:hidden; min-height:0; transition:border-color .15s; }
.spe-editor-container:focus-within { border-color:${ACCENT}; }
.spe-gutter { flex-shrink:0; width:44px; padding:10px 0; background:#0a0a14; border-right:1px solid #1e1e32; overflow:hidden; user-select:none; -webkit-user-select:none; }
.spe-gutter-line { height:20px; line-height:20px; text-align:right; padding-right:10px; font-family:"JetBrains Mono","Fira Code",monospace; font-size:11px; color:#3a3a52; }
.spe-highlight-layer { position:absolute; top:0; left:44px; right:0; bottom:0; padding:10px 12px; font-family:"JetBrains Mono","Fira Code",monospace; font-size:13px; line-height:20px; color:#e4e4ed; pointer-events:none; overflow:auto; white-space:pre-wrap; word-wrap:break-word; }
.spe-textarea { flex:1; background:transparent; color:transparent; caret-color:#e4e4ed; border:none; outline:none; resize:none; padding:10px 12px; font-family:"JetBrains Mono","Fira Code",monospace; font-size:13px; line-height:20px; white-space:pre-wrap; word-wrap:break-word; min-height:0; }
.spe-textarea::placeholder { color:#4a4a62; }
.spe-textarea::selection { background:rgba(232,69,32,.25); }
.spe-editor-footer { display:flex; align-items:center; justify-content:space-between; padding:6px 0; }
.spe-char-count { font-family:"JetBrains Mono","Fira Code",monospace; font-size:11px; color:#6a6a82; }

/* Collapsible sections */
.spe-sections { flex-shrink:0; overflow-y:auto; max-height:35%; padding:0 20px 8px; }
.spe-sections::-webkit-scrollbar { width:5px; }
.spe-sections::-webkit-scrollbar-track { background:transparent; }
.spe-sections::-webkit-scrollbar-thumb { background:#2a2a3e; border-radius:3px; }

.spe-section { margin-bottom:10px; }
.spe-section-toggle { display:flex; align-items:center; gap:6px; background:none; border:none; cursor:pointer; color:#9898b0; font-size:12px; font-weight:600; padding:6px 0; width:100%; text-align:left; transition:color .15s; }
.spe-section-toggle:hover { color:#e4e4ed; }
.spe-section-toggle svg { transition:transform .15s; }
.spe-section-content { padding:6px 0 2px; }

/* Template chips */
.spe-template-grid { display:flex; flex-wrap:wrap; gap:6px; }
.spe-template-chip { padding:6px 12px; font-size:12px; font-weight:500; color:#9898b0; background:#1a1a2e; border:1px solid #2a2a3e; border-radius:6px; cursor:pointer; transition:all .15s; white-space:nowrap; }
.spe-template-chip:hover { color:#e4e4ed; border-color:#3a3a52; background:#22223a; }
.spe-template-chip:active { border-color:${ACCENT}; color:${ACCENT}; }

/* Variable chips */
.spe-var-grid { display:flex; flex-wrap:wrap; gap:6px; }
.spe-var-chip { display:inline-flex; align-items:center; gap:6px; padding:5px 10px; font-size:12px; color:#9898b0; background:#1a1a2e; border:1px solid #2a2a3e; border-radius:6px; cursor:pointer; transition:all .15s; font-family:"JetBrains Mono","Fira Code",monospace; }
.spe-var-chip:hover { color:${ACCENT}; border-color:${ACCENT}; background:rgba(232,69,32,.06); }
.spe-var-chip-label { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:#6a6a82; font-size:11px; }

/* Storage row */
.spe-storage-row { display:flex; flex-wrap:wrap; gap:6px; }
.spe-storage-btn { padding:5px 12px; font-size:12px; font-weight:500; color:#9898b0; background:#1a1a2e; border:1px solid #2a2a3e; border-radius:6px; cursor:pointer; transition:all .15s; display:inline-flex; align-items:center; gap:5px; }
.spe-storage-btn:hover { color:#e4e4ed; border-color:#3a3a52; background:#22223a; }
.spe-storage-btn:disabled { opacity:.4; cursor:default; }

/* Footer */
.spe-footer { display:flex; align-items:center; gap:8px; padding:14px 20px; border-top:1px solid #2a2a3e; flex-shrink:0; }
.spe-footer-spacer { flex:1; }
.spe-btn { padding:8px 18px; font-size:13px; font-weight:500; border-radius:6px; border:1px solid #2a2a3e; background:#1a1a2e; color:#e4e4ed; cursor:pointer; transition:all .15s; }
.spe-btn:hover { border-color:#3a3a52; background:#22223a; }
.spe-btn:disabled { opacity:.4; cursor:default; }
.spe-btn-primary { background:${ACCENT}; border-color:${ACCENT}; color:#fff; font-weight:600; }
.spe-btn-primary:hover { background:${ACCENT_HOVER}; border-color:${ACCENT_HOVER}; }
.spe-btn-danger { color:#ef4444; border-color:transparent; background:transparent; padding:8px 12px; }
.spe-btn-danger:hover { background:rgba(239,68,68,.1); }
.spe-toast { font-size:12px; color:#22c55e; margin-right:auto; }
`;

// ── Icons ───────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s" }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

// ── Component ───────────────────────────────────────────────

function SystemPromptEditor({
  isOpen,
  onClose,
  currentPrompt,
  onSave,
  projectPath,
  apiBase,
}: SystemPromptEditorProps) {
  const [draft, setDraft] = useState(currentPrompt);
  const [savedPrompt, setSavedPrompt] = useState(currentPrompt);
  const [toast, setToast] = useState("");
  const [showTemplates, setShowTemplates] = useState(true);
  const [showVariables, setShowVariables] = useState(true);
  const [showStorage, setShowStorage] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [savingFile, setSavingFile] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const hasUnsaved = draft !== savedPrompt;

  // Sync when panel opens or currentPrompt changes
  useEffect(() => {
    if (!isOpen) return;
    // Try loading from localStorage first
    const stored = loadFromStorage(projectPath);
    const initial = stored ?? currentPrompt;
    setDraft(initial);
    setSavedPrompt(currentPrompt);
    setToast("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [isOpen, currentPrompt, projectPath]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      // Cmd/Ctrl+S to save
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, draft]);

  // Sync scroll between textarea, highlight layer, and gutter
  const handleScroll = useCallback(() => {
    const ta = textareaRef.current;
    const hl = highlightRef.current;
    const gt = gutterRef.current;
    if (ta && hl) {
      hl.scrollTop = ta.scrollTop;
      hl.scrollLeft = ta.scrollLeft;
    }
    if (ta && gt) {
      gt.scrollTop = ta.scrollTop;
    }
  }, []);

  // Line numbers
  const lineCount = useMemo(() => {
    return draft.split("\n").length;
  }, [draft]);

  const lineNumbers = useMemo(() => {
    const nums: React.ReactElement[] = [];
    for (let i = 1; i <= lineCount; i++) {
      nums.push(
        <div key={i} className="spe-gutter-line">
          {i}
        </div>
      );
    }
    return nums;
  }, [lineCount]);

  // Highlighted content
  const highlighted = useMemo(() => highlightSyntax(draft), [draft]);

  // Character count and token estimate
  const charCount = draft.length;
  const tokenEstimate = estimateTokens(draft);

  // Insert text at cursor
  const insertAtCursor = useCallback(
    (text: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const before = draft.slice(0, start);
      const after = draft.slice(end);
      const newVal = before + text + after;
      setDraft(newVal);
      requestAnimationFrame(() => {
        ta.focus();
        const pos = start + text.length;
        ta.setSelectionRange(pos, pos);
      });
    },
    [draft]
  );

  // Template click handler
  const applyTemplate = useCallback(
    (template: TemplateEntry) => {
      const confirmReplace =
        draft.trim().length === 0 ||
        window.confirm(
          `Replace current prompt with "${template.name}" template?`
        );
      if (confirmReplace) {
        setDraft(template.content);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    },
    [draft]
  );

  // Save handler
  const handleSave = useCallback(() => {
    onSave(draft);
    saveToStorage(draft, projectPath);
    setSavedPrompt(draft);
    setToast("Saved");
    setTimeout(() => setToast(""), 2000);
  }, [draft, onSave, projectPath]);

  // Reset to default (original currentPrompt)
  const handleReset = useCallback(() => {
    if (
      draft === currentPrompt ||
      window.confirm("Reset to the default prompt? Unsaved changes will be lost.")
    ) {
      setDraft(currentPrompt);
      setSavedPrompt(currentPrompt);
      saveToStorage(currentPrompt, projectPath);
    }
  }, [draft, currentPrompt, projectPath]);

  // Load from .claude/system-prompt
  const handleLoadFile = useCallback(async () => {
    if (!projectPath) return;
    setLoadingFile(true);
    try {
      const resp = await fetch(
        `${apiBase}/read-file?path=${encodeURIComponent(
          projectPath + "/.claude/system-prompt"
        )}`
      );
      if (!resp.ok) throw new Error("File not found");
      const data = await resp.text();
      setDraft(data);
      setToast("Loaded from .claude/system-prompt");
      setTimeout(() => setToast(""), 2500);
    } catch {
      setToast("Could not load .claude/system-prompt");
      setTimeout(() => setToast(""), 2500);
    } finally {
      setLoadingFile(false);
    }
  }, [projectPath, apiBase]);

  // Save to .claude/system-prompt
  const handleSaveFile = useCallback(async () => {
    if (!projectPath) return;
    setSavingFile(true);
    try {
      const resp = await fetch(`${apiBase}/write-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: projectPath + "/.claude/system-prompt",
          content: draft,
        }),
      });
      if (!resp.ok) throw new Error("Write failed");
      setToast("Saved to .claude/system-prompt");
      setTimeout(() => setToast(""), 2500);
    } catch {
      setToast("Could not save to .claude/system-prompt");
      setTimeout(() => setToast(""), 2500);
    } finally {
      setSavingFile(false);
    }
  }, [projectPath, apiBase, draft]);

  if (!isOpen) return null;

  return (
    <>
      <style>{CSS}</style>
      <div className="spe-overlay" onClick={onClose}>
        <div
          className="spe-panel"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="System Prompt Editor"
        >
          {/* Header */}
          <div className="spe-header">
            <h2 className="spe-header-title">
              System Prompt
              {hasUnsaved && <span className="spe-unsaved-dot" title="Unsaved changes" />}
            </h2>
            {projectPath && (
              <span className="spe-header-badge" title={projectPath}>
                <FolderIcon />
                {dirName(projectPath)}
              </span>
            )}
            <div className="spe-header-spacer" />
            <button className="spe-close-btn" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          {/* Body */}
          <div className="spe-body">
            {/* Editor */}
            <div className="spe-editor-wrap">
              <div className="spe-editor-label">Prompt</div>
              <div className="spe-editor-container">
                {/* Line number gutter */}
                <div className="spe-gutter" ref={gutterRef}>
                  {lineNumbers}
                </div>
                {/* Syntax highlight layer */}
                <div className="spe-highlight-layer" ref={highlightRef}>
                  {highlighted}
                </div>
                {/* Actual textarea */}
                <textarea
                  ref={textareaRef}
                  className="spe-textarea"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onScroll={handleScroll}
                  placeholder="Enter your system prompt..."
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
              <div className="spe-editor-footer">
                <span className="spe-char-count">
                  {formatCount(charCount)} chars &middot; ~{formatCount(tokenEstimate)} tokens
                </span>
              </div>
            </div>

            {/* Collapsible sections */}
            <div className="spe-sections">
              {/* Templates */}
              <div className="spe-section">
                <button
                  className="spe-section-toggle"
                  onClick={() => setShowTemplates((v) => !v)}
                >
                  <ChevronIcon open={showTemplates} />
                  Templates
                </button>
                {showTemplates && (
                  <div className="spe-section-content">
                    <div className="spe-template-grid">
                      {TEMPLATES.map((t) => (
                        <button
                          key={t.name}
                          className="spe-template-chip"
                          onClick={() => applyTemplate(t)}
                          title={`Apply "${t.name}" template`}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Variables */}
              <div className="spe-section">
                <button
                  className="spe-section-toggle"
                  onClick={() => setShowVariables((v) => !v)}
                >
                  <ChevronIcon open={showVariables} />
                  Variables
                </button>
                {showVariables && (
                  <div className="spe-section-content">
                    <div className="spe-var-grid">
                      {VARIABLES.map((v) => (
                        <button
                          key={v.token}
                          className="spe-var-chip"
                          onClick={() => insertAtCursor(v.token)}
                          title={`Insert ${v.token}`}
                        >
                          <span>{v.token}</span>
                          <span className="spe-var-chip-label">{v.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Per-project storage */}
              <div className="spe-section">
                <button
                  className="spe-section-toggle"
                  onClick={() => setShowStorage((v) => !v)}
                >
                  <ChevronIcon open={showStorage} />
                  Project Storage
                </button>
                {showStorage && (
                  <div className="spe-section-content">
                    <div className="spe-storage-row">
                      <button
                        className="spe-storage-btn"
                        onClick={handleLoadFile}
                        disabled={!projectPath || loadingFile}
                        title="Load prompt from .claude/system-prompt in project directory"
                      >
                        <DownloadIcon />
                        {loadingFile ? "Loading..." : "Load from .claude/system-prompt"}
                      </button>
                      <button
                        className="spe-storage-btn"
                        onClick={handleSaveFile}
                        disabled={!projectPath || savingFile}
                        title="Save prompt to .claude/system-prompt in project directory"
                      >
                        <UploadIcon />
                        {savingFile ? "Saving..." : "Save to .claude/system-prompt"}
                      </button>
                    </div>
                    {!projectPath && (
                      <div style={{ fontSize: 11, color: "#6a6a82", marginTop: 6 }}>
                        No project path set. File storage requires a project context.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="spe-footer">
            {toast && <span className="spe-toast">{toast}</span>}
            <div className="spe-footer-spacer" />
            <button className="spe-btn spe-btn-danger" onClick={handleReset}>
              Reset to Default
            </button>
            <button className="spe-btn" onClick={onClose}>
              Cancel
            </button>
            <button className="spe-btn spe-btn-primary" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default memo(SystemPromptEditor);
