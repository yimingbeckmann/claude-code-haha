import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ── Types ───────────────────────────────────────────────────

export interface InlineEditorProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string;
  initialContent?: string;
  onSave: (content: string, filePath: string) => void;
  apiBase: string;
  readOnly?: boolean;
}

interface Toast {
  message: string;
  type: "success" | "error";
  id: number;
}

// ── Helpers ─────────────────────────────────────────────────

const LANG_MAP: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript (JSX)", js: "JavaScript", jsx: "JavaScript (JSX)",
  py: "Python", rs: "Rust", go: "Go", rb: "Ruby", java: "Java", kt: "Kotlin",
  swift: "Swift", c: "C", cpp: "C++", h: "C Header", hpp: "C++ Header",
  cs: "C#", php: "PHP", html: "HTML", css: "CSS", scss: "SCSS", less: "LESS",
  json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", xml: "XML",
  md: "Markdown", sh: "Shell", bash: "Bash", zsh: "Zsh", fish: "Fish",
  sql: "SQL", graphql: "GraphQL", gql: "GraphQL", proto: "Protocol Buffers",
  dockerfile: "Dockerfile", makefile: "Makefile", cmake: "CMake",
  lua: "Lua", vim: "Vim Script", el: "Emacs Lisp", zig: "Zig", nim: "Nim",
  dart: "Dart", r: "R", jl: "Julia", ex: "Elixir", exs: "Elixir",
  erl: "Erlang", hs: "Haskell", ml: "OCaml", fs: "F#", clj: "Clojure",
  svelte: "Svelte", vue: "Vue", tf: "Terraform", ini: "INI", cfg: "Config",
  env: "Environment", lock: "Lock File", txt: "Plain Text", log: "Log",
};

function getExtension(path: string): string {
  const base = path.split("/").pop() || "";
  // Handle dotfiles and special names
  const lower = base.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile") return "makefile";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

function getLanguage(path: string): string {
  const ext = getExtension(path);
  return LANG_MAP[ext] || (ext ? ext.toUpperCase() : "Plain Text");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function pathSegments(filePath: string): string[] {
  return filePath.split("/").filter(Boolean);
}

/** Simple per-line syntax classification for coloring */
function classifyLine(line: string, ext: string): "comment" | "string" | "normal" {
  const trimmed = line.trimStart();
  // Comment patterns by language family
  const slashComment = ["ts", "tsx", "js", "jsx", "java", "kt", "swift", "c", "cpp",
    "h", "hpp", "cs", "go", "rs", "dart", "zig", "scala", "proto", "graphql", "gql"];
  const hashComment = ["py", "rb", "sh", "bash", "zsh", "fish", "yaml", "yml", "toml",
    "r", "jl", "pl", "makefile", "dockerfile", "cmake", "tf", "ini", "cfg", "env"];
  const dashComment = ["hs", "lua", "sql", "elm"];
  const semicolonComment = ["el", "clj", "asm", "lisp"];

  if (slashComment.includes(ext) && (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*"))) {
    return "comment";
  }
  if (hashComment.includes(ext) && trimmed.startsWith("#")) return "comment";
  if (dashComment.includes(ext) && trimmed.startsWith("--")) return "comment";
  if (semicolonComment.includes(ext) && trimmed.startsWith(";")) return "comment";
  if (ext === "html" || ext === "xml" || ext === "svg") {
    if (trimmed.startsWith("<!--")) return "comment";
  }
  if (ext === "css" || ext === "scss" || ext === "less") {
    if (trimmed.startsWith("/*") || trimmed.startsWith("*")) return "comment";
  }

  // Rough string-dominant line detection
  const quoteCount = (line.match(/['""`]/g) || []).length;
  if (quoteCount >= 2 && trimmed.startsWith('"') || trimmed.startsWith("'") || trimmed.startsWith("`")) {
    return "string";
  }

  return "normal";
}

// ── Icons ───────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ── Styles ──────────────────────────────────────────────────

const S = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    backdropFilter: "blur(2px)",
    WebkitBackdropFilter: "blur(2px)",
    zIndex: 1000,
    display: "flex",
    justifyContent: "flex-end",
  },
  panel: {
    width: "60%",
    minWidth: 480,
    maxWidth: "100%",
    height: "100%",
    background: "var(--bg-primary)",
    borderLeft: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column" as const,
    boxShadow: "-8px 0 32px rgba(0,0,0,0.5)",
    overflow: "hidden",
  },

  // Header
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    flexShrink: 0,
  },
  breadcrumbs: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--text-secondary)",
  },
  breadcrumbSeg: {
    cursor: "pointer",
    padding: "2px 4px",
    borderRadius: 3,
    whiteSpace: "nowrap" as const,
    transition: "background 0.1s, color 0.1s",
  },
  breadcrumbSegHover: {
    background: "var(--bg-hover)",
    color: "var(--text-primary)",
  },
  breadcrumbLast: {
    color: "var(--text-primary)",
    fontWeight: 600,
  },
  chevron: {
    color: "var(--text-dim)",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
  },
  langBadge: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 500,
    color: "var(--accent-text)",
    background: "var(--accent-muted)",
    padding: "2px 8px",
    borderRadius: "var(--radius-full)",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
    textTransform: "uppercase" as const,
    letterSpacing: "0.03em",
  },
  modifiedBadge: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 500,
    color: "var(--warning-text)",
    background: "var(--warning-dim)",
    padding: "2px 8px",
    borderRadius: "var(--radius-full)",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  headerBtn: {
    background: "none",
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    padding: "5px 10px",
    borderRadius: "var(--radius-sm)",
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    transition: "background 0.1s, color 0.1s, border-color 0.1s",
    flexShrink: 0,
  },
  headerBtnHover: {
    background: "var(--bg-hover)",
    color: "var(--text-primary)",
    borderColor: "var(--border-hover)",
  },
  saveBtn: {
    background: "var(--accent)",
    border: "1px solid var(--accent)",
    color: "#fff",
    cursor: "pointer",
    padding: "5px 12px",
    borderRadius: "var(--radius-sm)",
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    fontWeight: 600,
    transition: "background 0.1s, opacity 0.1s",
    flexShrink: 0,
  },
  saveBtnHover: {
    background: "var(--accent-hover)",
  },
  saveBtnDisabled: {
    opacity: 0.4,
    cursor: "default",
  },

  // Editor area
  editorWrap: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
    position: "relative" as const,
    minHeight: 0,
  },
  gutter: {
    width: 52,
    flexShrink: 0,
    background: "var(--bg-secondary)",
    borderRight: "1px solid var(--border)",
    overflow: "hidden",
    userSelect: "none" as const,
  },
  gutterInner: {
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    lineHeight: "20px",
    padding: "12px 0",
    color: "var(--text-dim)",
    textAlign: "right" as const,
  },
  gutterLine: {
    paddingRight: 12,
    paddingLeft: 4,
    height: 20,
    display: "block",
  },
  gutterLineActive: {
    color: "var(--text-secondary)",
    background: "rgba(255,255,255,0.03)",
  },
  editorScroll: {
    flex: 1,
    overflow: "auto",
    position: "relative" as const,
  },
  syntaxLayer: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    pointerEvents: "none" as const,
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    lineHeight: "20px",
    padding: "12px 14px",
    whiteSpace: "pre" as const,
    tabSize: 2,
    color: "transparent",
    overflow: "hidden",
  },
  textarea: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    lineHeight: "20px",
    padding: "12px 14px",
    background: "transparent",
    color: "var(--text-primary)",
    border: "none",
    outline: "none",
    resize: "none" as const,
    whiteSpace: "pre" as const,
    tabSize: 2,
    caretColor: "var(--accent)",
    overflow: "auto",
  },
  textareaReadOnly: {
    cursor: "default",
  },
  activeLineHighlight: {
    position: "absolute" as const,
    left: 0,
    right: 0,
    height: 20,
    background: "rgba(255,255,255,0.03)",
    pointerEvents: "none" as const,
    transition: "top 0.05s",
  },
  contentSizer: {
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    lineHeight: "20px",
    padding: "12px 14px",
    whiteSpace: "pre" as const,
    tabSize: 2,
    minHeight: "100%",
    visibility: "hidden" as const,
    pointerEvents: "none" as const,
  },

  // Footer
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "6px 16px",
    borderTop: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--text-dim)",
    flexShrink: 0,
    userSelect: "none" as const,
  },
  footerItem: {
    whiteSpace: "nowrap" as const,
  },
  footerSpacer: {
    flex: 1,
  },

  // Loading
  loadingWrap: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column" as const,
    gap: 12,
  },
  loadingSkeleton: {
    width: "80%",
    maxWidth: 400,
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 4,
    background: "var(--bg-tertiary)",
  },
  loadingLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--text-dim)",
    marginTop: 8,
  },

  // Error state
  errorWrap: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column" as const,
    gap: 10,
    padding: 32,
  },
  errorIcon: {
    color: "var(--error-text)",
    fontSize: 28,
  },
  errorTitle: {
    fontFamily: "var(--font-mono)",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--error-text)",
  },
  errorMsg: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--text-dim)",
    textAlign: "center" as const,
    maxWidth: 360,
    lineHeight: "1.5",
  },

  // Toast
  toastWrap: {
    position: "fixed" as const,
    bottom: 20,
    right: 20,
    zIndex: 1100,
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    pointerEvents: "none" as const,
  },
  toast: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    padding: "8px 16px",
    borderRadius: "var(--radius-sm)",
    boxShadow: "var(--shadow-md)",
    pointerEvents: "auto" as const,
    animation: "ie-toast-in 0.2s ease-out",
  },
  toastSuccess: {
    background: "var(--success-dim)",
    color: "var(--success-text)",
    border: "1px solid var(--success)",
  },
  toastError: {
    background: "var(--error-dim)",
    color: "var(--error-text)",
    border: "1px solid var(--error)",
  },

  // Confirm dialog
  confirmOverlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    zIndex: 1050,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmCard: {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    padding: "20px 24px",
    maxWidth: 360,
    boxShadow: "var(--shadow-lg)",
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
  },
  confirmTitle: {
    fontFamily: "var(--font-mono)",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  confirmMsg: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--text-secondary)",
    lineHeight: "1.5",
  },
  confirmActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
  },
  confirmBtn: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    padding: "6px 14px",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    border: "1px solid var(--border)",
    background: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
    transition: "background 0.1s",
  },
  confirmBtnDanger: {
    background: "var(--error)",
    border: "1px solid var(--error)",
    color: "#fff",
  },
};

// Inline keyframes for toast animation
const toastKeyframes = `
@keyframes ie-toast-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

// ── Component ───────────────────────────────────────────────

function InlineEditor({
  isOpen,
  onClose,
  filePath,
  initialContent,
  onSave,
  apiBase,
  readOnly = false,
}: InlineEditorProps) {
  // Core state
  const [content, setContent] = useState<string>(initialContent ?? "");
  const [savedContent, setSavedContent] = useState<string>(initialContent ?? "");
  const [loading, setLoading] = useState(!initialContent);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [hoveredBreadcrumb, setHoveredBreadcrumb] = useState(-1);
  const [hoveredCloseBtn, setHoveredCloseBtn] = useState(false);
  const [hoveredSaveBtn, setHoveredSaveBtn] = useState(false);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const toastIdRef = useRef(0);
  const injectedStyleRef = useRef(false);

  // Derived
  const ext = useMemo(() => getExtension(filePath), [filePath]);
  const language = useMemo(() => getLanguage(filePath), [filePath]);
  const isModified = content !== savedContent;
  const lines = useMemo(() => content.split("\n"), [content]);
  const lineCount = lines.length;
  const fileSize = useMemo(() => new Blob([content]).size, [content]);
  const segments = useMemo(() => pathSegments(filePath), [filePath]);

  // Inject keyframes once
  useEffect(() => {
    if (injectedStyleRef.current) return;
    const style = document.createElement("style");
    style.textContent = toastKeyframes;
    document.head.appendChild(style);
    injectedStyleRef.current = true;
    return () => { document.head.removeChild(style); };
  }, []);

  // Fetch file content if no initialContent provided
  useEffect(() => {
    if (!isOpen) return;
    if (initialContent !== undefined) {
      setContent(initialContent);
      setSavedContent(initialContent);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${apiBase}/filesystem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", path: filePath }),
    })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(body || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const text = typeof data === "string" ? data : (data?.content ?? data?.data ?? "");
        setContent(text);
        setSavedContent(text);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Failed to load file");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isOpen, filePath, initialContent, apiBase]);

  // Focus textarea on open
  useEffect(() => {
    if (isOpen && !loading && !error) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [isOpen, loading, error]);

  // ── Toast management ──────────────────────────────────────

  const addToast = useCallback((message: string, type: "success" | "error") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { message, type, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  // ── Save ──────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (readOnly || saving || !isModified) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/filesystem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "write", path: filePath, content }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(body || `HTTP ${res.status}`);
      }
      setSavedContent(content);
      onSave(content, filePath);
      addToast("File saved successfully", "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed";
      addToast(`Save failed: ${msg}`, "error");
    } finally {
      setSaving(false);
    }
  }, [readOnly, saving, isModified, apiBase, filePath, content, onSave, addToast]);

  // ── Close with unsaved-changes guard ──────────────────────

  const tryClose = useCallback(() => {
    if (isModified) {
      setShowConfirm(true);
    } else {
      onClose();
    }
  }, [isModified, onClose]);

  const confirmDiscard = useCallback(() => {
    setShowConfirm(false);
    onClose();
  }, [onClose]);

  // ── Keyboard shortcuts ────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (showConfirm) {
          setShowConfirm(false);
        } else {
          tryClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, handleSave, tryClose, showConfirm]);

  // ── Tab key handling ──────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      const newVal = val.substring(0, start) + "  " + val.substring(end);
      setContent(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  }, []);

  // ── Cursor tracking ───────────────────────────────────────

  const updateCursorPos = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const textBefore = ta.value.substring(0, pos);
    const lineNum = textBefore.split("\n").length;
    const lastNewline = textBefore.lastIndexOf("\n");
    const colNum = pos - (lastNewline === -1 ? 0 : lastNewline + 1) + 1;
    setCursorLine(lineNum);
    setCursorCol(colNum);
  }, []);

  // ── Scroll sync ───────────────────────────────────────────

  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    const gutter = gutterRef.current;
    if (ta && gutter) {
      gutter.scrollTop = ta.scrollTop;
    }
  }, []);

  // ── Syntax coloring layer ─────────────────────────────────

  const syntaxLines = useMemo(() => {
    return lines.map((line, i) => {
      const cls = classifyLine(line, ext);
      let color = "var(--text-primary)";
      if (cls === "comment") color = "var(--text-dim)";
      else if (cls === "string") color = "var(--success-text)";
      return (
        <div key={i} style={{ color, height: 20, overflow: "hidden" }}>
          {line || " "}
        </div>
      );
    });
  }, [lines, ext]);

  // ── Render ────────────────────────────────────────────────

  if (!isOpen) return null;

  const activeLineTop = 12 + (cursorLine - 1) * 20;

  return (
    <>
      {/* Overlay */}
      <div style={S.overlay} onClick={tryClose}>
        {/* Panel */}
        <div style={S.panel} onClick={(e) => e.stopPropagation()}>

          {/* ── Header ────────────────────── */}
          <div style={S.header}>
            <span style={{ color: "var(--text-dim)", display: "flex", flexShrink: 0 }}>
              <FileIcon />
            </span>
            <div style={S.breadcrumbs}>
              {segments.map((seg, i) => {
                const isLast = i === segments.length - 1;
                return (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    {i > 0 && <span style={S.chevron}><ChevronIcon /></span>}
                    <span
                      style={{
                        ...S.breadcrumbSeg,
                        ...(isLast ? S.breadcrumbLast : {}),
                        ...(hoveredBreadcrumb === i && !isLast ? S.breadcrumbSegHover : {}),
                      }}
                      onMouseEnter={() => setHoveredBreadcrumb(i)}
                      onMouseLeave={() => setHoveredBreadcrumb(-1)}
                      title={"/" + segments.slice(0, i + 1).join("/")}
                    >
                      {seg}
                    </span>
                  </span>
                );
              })}
            </div>
            <span style={S.langBadge}>{language}</span>
            {isModified && <span style={S.modifiedBadge}>Modified</span>}
            {!readOnly && (
              <button
                style={{
                  ...S.saveBtn,
                  ...(hoveredSaveBtn && !saving && isModified ? S.saveBtnHover : {}),
                  ...(!isModified || saving ? S.saveBtnDisabled : {}),
                }}
                disabled={!isModified || saving}
                onClick={handleSave}
                onMouseEnter={() => setHoveredSaveBtn(true)}
                onMouseLeave={() => setHoveredSaveBtn(false)}
                title="Save (Ctrl+S)"
              >
                <SaveIcon />
                {saving ? "Saving..." : "Save"}
              </button>
            )}
            <button
              style={{
                ...S.headerBtn,
                ...(hoveredCloseBtn ? S.headerBtnHover : {}),
              }}
              onClick={tryClose}
              onMouseEnter={() => setHoveredCloseBtn(true)}
              onMouseLeave={() => setHoveredCloseBtn(false)}
              title="Close (Esc)"
            >
              <CloseIcon />
            </button>
          </div>

          {/* ── Content area ──────────────── */}
          {loading ? (
            <div style={S.loadingWrap}>
              <div style={S.loadingSkeleton}>
                {[85, 60, 75, 40, 90, 55, 70, 45].map((w, i) => (
                  <div
                    key={i}
                    style={{
                      ...S.skeletonLine,
                      width: `${w}%`,
                      opacity: 0.3 + (i % 3) * 0.15,
                    }}
                  />
                ))}
              </div>
              <div style={S.loadingLabel}>Loading file...</div>
            </div>
          ) : error ? (
            <div style={S.errorWrap}>
              <div style={S.errorIcon}>!</div>
              <div style={S.errorTitle}>Failed to load file</div>
              <div style={S.errorMsg}>{error}</div>
            </div>
          ) : (
            <div style={S.editorWrap}>
              {/* Line numbers gutter */}
              <div style={S.gutter} ref={gutterRef}>
                <div style={S.gutterInner}>
                  {Array.from({ length: lineCount }, (_, i) => (
                    <span
                      key={i}
                      style={{
                        ...S.gutterLine,
                        ...(i + 1 === cursorLine ? S.gutterLineActive : {}),
                      }}
                    >
                      {i + 1}
                    </span>
                  ))}
                </div>
              </div>

              {/* Editor scroll area */}
              <div style={S.editorScroll} ref={editorScrollRef}>
                {/* Active line highlight */}
                <div style={{ ...S.activeLineHighlight, top: activeLineTop }} />

                {/* Syntax coloring layer */}
                <div style={S.syntaxLayer}>
                  {syntaxLines}
                </div>

                {/* Hidden sizer to give the container correct dimensions */}
                <div style={S.contentSizer} aria-hidden="true">
                  {content + "\n"}
                </div>

                {/* Actual textarea */}
                <textarea
                  ref={textareaRef}
                  style={{
                    ...S.textarea,
                    ...(readOnly ? S.textareaReadOnly : {}),
                    color: "transparent",
                    caretColor: "var(--accent)",
                  }}
                  value={content}
                  readOnly={readOnly}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  onChange={(e) => {
                    setContent(e.target.value);
                    updateCursorPos();
                  }}
                  onKeyDown={handleKeyDown}
                  onKeyUp={updateCursorPos}
                  onClick={updateCursorPos}
                  onScroll={syncScroll}
                />
              </div>
            </div>
          )}

          {/* ── Footer ────────────────────── */}
          <div style={S.footer}>
            <span style={S.footerItem}>
              Ln {cursorLine}, Col {cursorCol}
            </span>
            <span style={S.footerItem}>
              {formatFileSize(fileSize)}
            </span>
            <span style={S.footerItem}>UTF-8</span>
            <div style={S.footerSpacer} />
            <span style={S.footerItem}>{language}</span>
            {readOnly && (
              <span style={{ ...S.footerItem, color: "var(--warning-text)" }}>
                Read Only
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Toasts ──────────────────────── */}
      {toasts.length > 0 && (
        <div style={S.toastWrap}>
          {toasts.map((t) => (
            <div
              key={t.id}
              style={{
                ...S.toast,
                ...(t.type === "success" ? S.toastSuccess : S.toastError),
              }}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}

      {/* ── Unsaved changes confirm dialog ── */}
      {showConfirm && (
        <div style={S.confirmOverlay} onClick={() => setShowConfirm(false)}>
          <div style={S.confirmCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.confirmTitle}>Unsaved Changes</div>
            <div style={S.confirmMsg}>
              You have unsaved changes to this file. Do you want to discard them?
            </div>
            <div style={S.confirmActions}>
              <button
                style={S.confirmBtn}
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
              <button
                style={{ ...S.confirmBtn, ...S.confirmBtnDanger }}
                onClick={confirmDiscard}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default InlineEditor;
