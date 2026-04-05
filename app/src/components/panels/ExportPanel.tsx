import { useState, useEffect, useCallback, useRef, useMemo } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ExportMessage {
  id: string;
  type: string;
  text: string;
  timestamp: number;
  toolName?: string;
  model?: string;
}

export interface ExportPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ExportMessage[];
  sessionTitle: string;
  sessionId: string;
}

type ExportFormat = "json" | "markdown" | "plaintext" | "html";

interface ExportOptions {
  includeToolCalls: boolean;
  includeSystemMessages: boolean;
  includeThinkingBlocks: boolean;
  includeTimestamps: boolean;
  dateFrom: string;
  dateTo: string;
}

/* ------------------------------------------------------------------ */
/*  Styles (injected CSS)                                              */
/* ------------------------------------------------------------------ */

const CSS = `
.export-panel-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.6);
  display: flex; justify-content: flex-end; z-index: 9998;
  backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
}
.export-panel {
  display: flex; flex-direction: column; width: 640px; max-width: 96vw;
  height: 100vh; background: var(--bg-primary, #0a0a0f);
  border-left: 1px solid var(--border, #2a2a36);
  box-shadow: -8px 0 30px rgba(0,0,0,.4);
  color: var(--text-primary, rgba(255,255,255,.9));
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  overflow: hidden; animation: export-slide .2s ease-out;
}
@keyframes export-slide {
  from { transform: translateX(100%); opacity: .8; }
  to   { transform: translateX(0); opacity: 1; }
}

/* Header */
.export-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-bottom: 1px solid var(--border, #2a2a36); flex-shrink: 0;
}
.export-header h2 { margin: 0; font-size: 15px; font-weight: 600; }
.export-close-btn {
  background: none; border: none; cursor: pointer; color: var(--text-secondary, #6a6a82);
  padding: 4px; display: flex; align-items: center; border-radius: 4px; transition: color .15s;
}
.export-close-btn:hover { color: var(--text-primary, #e4e4ed); }

/* Format tabs */
.export-formats {
  display: flex; padding: 0 12px; border-bottom: 1px solid var(--border, #2a2a36);
  flex-shrink: 0; background: var(--bg-secondary, #12121a); overflow-x: auto;
}
.export-formats::-webkit-scrollbar { height: 0; }
.export-format-btn {
  padding: 9px 16px; font-size: 12px; font-weight: 500;
  color: var(--text-secondary, #9898b0); background: none; border: none;
  border-bottom: 2px solid transparent; cursor: pointer;
  transition: color .15s, border-color .15s; white-space: nowrap;
}
.export-format-btn:hover { color: var(--text-primary, #e4e4ed); }
.export-format-btn.active {
  color: var(--accent, #e84520); border-bottom-color: var(--accent, #e84520); font-weight: 600;
}

/* Body scrollable area */
.export-body {
  flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 16px;
  min-height: 0;
}
.export-body::-webkit-scrollbar { width: 5px; }
.export-body::-webkit-scrollbar-track { background: transparent; }
.export-body::-webkit-scrollbar-thumb { background: var(--border, #2a2a36); border-radius: 3px; }

/* Section labels */
.export-section-title {
  font-size: 11px; font-weight: 700; color: var(--text-secondary, #6a6a82);
  text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;
}

/* Options grid */
.export-options {
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px;
}
.export-option-row {
  display: flex; align-items: center; gap: 8px; padding: 5px 0;
}
.export-option-row label {
  font-size: 13px; color: var(--text-primary, #e4e4ed); cursor: pointer; user-select: none;
}
.export-checkbox {
  appearance: none; -webkit-appearance: none; width: 16px; height: 16px;
  border: 1px solid var(--border, #2a2a36); border-radius: 3px;
  background: var(--bg-tertiary, #1a1a24); cursor: pointer; flex-shrink: 0;
  position: relative; transition: border-color .15s, background .15s;
}
.export-checkbox:checked {
  background: var(--accent, #e84520); border-color: var(--accent, #e84520);
}
.export-checkbox:checked::after {
  content: ""; position: absolute; left: 4px; top: 1px;
  width: 5px; height: 9px;
  border: solid #fff; border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.export-checkbox:focus-visible {
  box-shadow: 0 0 0 2px var(--bg-primary, #0a0a0f), 0 0 0 4px var(--accent, #e84520);
}

/* Date range */
.export-date-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.export-date-row label {
  font-size: 12px; color: var(--text-secondary, #9898b0); min-width: 36px;
}
.export-date-input {
  background: var(--bg-tertiary, #1a1a24); color: var(--text-primary, #e4e4ed);
  border: 1px solid var(--border, #2a2a36); border-radius: var(--radius-md, 6px);
  padding: 5px 8px; font-size: 12px; font-family: var(--font-mono); outline: none;
  transition: border-color .15s; color-scheme: dark;
}
.export-date-input:focus { border-color: var(--accent, #e84520); }

/* Preview */
.export-preview-wrap {
  flex: 1; min-height: 160px; display: flex; flex-direction: column;
}
.export-preview {
  flex: 1; background: var(--bg-code, #0d0d14); border: 1px solid var(--border, #2a2a36);
  border-radius: var(--radius-md, 6px); padding: 12px; overflow: auto;
  font-family: var(--font-mono); font-size: 12px; line-height: 1.6;
  color: var(--text-primary, rgba(255,255,255,.9)); white-space: pre-wrap;
  word-break: break-word; min-height: 120px; max-height: 340px;
}
.export-preview::-webkit-scrollbar { width: 5px; }
.export-preview::-webkit-scrollbar-track { background: transparent; }
.export-preview::-webkit-scrollbar-thumb { background: var(--border, #2a2a36); border-radius: 3px; }
.export-preview-html {
  all: initial; display: block; width: 100%; min-height: 120px; max-height: 340px;
  border: 1px solid var(--border, #2a2a36); border-radius: var(--radius-md, 6px);
  overflow: hidden; flex: 1;
}

/* Action bar */
.export-actions {
  display: flex; gap: 8px; padding: 14px 20px;
  border-top: 1px solid var(--border, #2a2a36); flex-shrink: 0;
}
.export-btn {
  padding: 8px 16px; font-size: 12px; font-weight: 500;
  border-radius: var(--radius-md, 6px); border: 1px solid var(--border, #2a2a36);
  background: var(--bg-tertiary, #1a1a24); color: var(--text-primary, #e4e4ed);
  cursor: pointer; transition: all .15s; display: flex; align-items: center; gap: 6px;
}
.export-btn:hover { border-color: var(--border-hover, #3a3a48); background: var(--bg-elevated, #1e1e2a); }
.export-btn:disabled { opacity: .4; cursor: default; }
.export-btn-primary {
  background: var(--accent, #e84520); border-color: var(--accent, #e84520); color: #fff;
}
.export-btn-primary:hover {
  background: var(--accent-hover, #f06030); border-color: var(--accent-hover, #f06030);
}
.export-btn-spacer { flex: 1; }

/* Toast */
.export-toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: var(--success, #22c55e); color: #fff;
  padding: 8px 20px; border-radius: var(--radius-md, 6px);
  font-size: 13px; font-weight: 500; z-index: 10000;
  animation: export-toast-in .2s ease-out;
  box-shadow: 0 4px 16px rgba(0,0,0,.4);
}
@keyframes export-toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* Message count badge */
.export-msg-count {
  font-size: 11px; color: var(--text-secondary, #9898b0);
  font-family: var(--font-mono); margin-left: auto;
}
`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function toISODate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function parseLocalDate(s: string, endOfDay = false): number {
  if (!s) return 0;
  const d = new Date(s + (endOfDay ? "T23:59:59" : "T00:00:00"));
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function isToolCall(m: ExportMessage): boolean {
  return m.type === "tool_use" || m.type === "tool_result" || m.type === "tool" || !!m.toolName;
}

function isSystemMessage(m: ExportMessage): boolean {
  return m.type === "system" || m.type === "meta" || m.type === "status";
}

function isThinkingBlock(m: ExportMessage): boolean {
  return m.type === "thinking" || m.type === "thought";
}

function roleLabel(m: ExportMessage): string {
  if (m.type === "user" || m.type === "human") return "User";
  if (m.type === "assistant" || m.type === "ai") return "Assistant";
  if (isToolCall(m)) return m.toolName ? `Tool: ${m.toolName}` : "Tool";
  if (isSystemMessage(m)) return "System";
  if (isThinkingBlock(m)) return "Thinking";
  return m.type.charAt(0).toUpperCase() + m.type.slice(1);
}

function filterMessages(msgs: ExportMessage[], opts: ExportOptions): ExportMessage[] {
  let filtered = msgs;

  if (!opts.includeToolCalls) {
    filtered = filtered.filter((m) => !isToolCall(m));
  }
  if (!opts.includeSystemMessages) {
    filtered = filtered.filter((m) => !isSystemMessage(m));
  }
  if (!opts.includeThinkingBlocks) {
    filtered = filtered.filter((m) => !isThinkingBlock(m));
  }

  const from = parseLocalDate(opts.dateFrom);
  const to = parseLocalDate(opts.dateTo, true);
  if (from > 0) {
    filtered = filtered.filter((m) => m.timestamp >= from);
  }
  if (to > 0) {
    filtered = filtered.filter((m) => m.timestamp <= to);
  }

  return filtered;
}

/* ------------------------------------------------------------------ */
/*  Export formatters                                                   */
/* ------------------------------------------------------------------ */

function toJSON(
  msgs: ExportMessage[],
  title: string,
  sessionId: string,
): string {
  return JSON.stringify(
    {
      sessionId,
      title,
      exportedAt: new Date().toISOString(),
      messageCount: msgs.length,
      messages: msgs,
    },
    null,
    2,
  );
}

function toMarkdown(
  msgs: ExportMessage[],
  title: string,
  opts: ExportOptions,
): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`*Exported on ${formatDate(Date.now())}*`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const m of msgs) {
    const role = roleLabel(m);
    if (opts.includeTimestamps) {
      lines.push(`### ${role}  `);
      lines.push(`*${formatDate(m.timestamp)}*${m.model ? `  \u00b7  model: \`${m.model}\`` : ""}`);
    } else {
      lines.push(`### ${role}${m.model ? `  \u00b7  model: \`${m.model}\`` : ""}`);
    }
    lines.push("");

    if (isToolCall(m)) {
      lines.push("```");
      lines.push(m.text);
      lines.push("```");
    } else if (m.type === "assistant" || m.type === "ai") {
      // Blockquote assistant replies
      const quoted = m.text
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
      lines.push(quoted);
    } else if (isThinkingBlock(m)) {
      lines.push("<details><summary>Thinking</summary>");
      lines.push("");
      lines.push(m.text);
      lines.push("");
      lines.push("</details>");
    } else {
      lines.push(m.text);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

function toPlainText(
  msgs: ExportMessage[],
  title: string,
  opts: ExportOptions,
): string {
  const lines: string[] = [];
  lines.push(title);
  lines.push("=".repeat(title.length));
  lines.push(`Exported: ${formatDate(Date.now())}`);
  lines.push("");

  for (const m of msgs) {
    const role = roleLabel(m);
    const ts = opts.includeTimestamps ? `  [${formatDate(m.timestamp)}]` : "";
    const model = m.model ? `  (${m.model})` : "";
    lines.push(`--- ${role}${ts}${model} ---`);
    lines.push(m.text);
    lines.push("");
  }

  return lines.join("\n");
}

function toHTML(
  msgs: ExportMessage[],
  title: string,
  opts: ExportOptions,
): string {
  function esc(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const messageBlocks = msgs
    .map((m) => {
      const role = roleLabel(m);
      const cls = isToolCall(m)
        ? "msg-tool"
        : isSystemMessage(m)
          ? "msg-system"
          : isThinkingBlock(m)
            ? "msg-thinking"
            : m.type === "user" || m.type === "human"
              ? "msg-user"
              : "msg-assistant";

      const meta: string[] = [];
      if (opts.includeTimestamps) meta.push(esc(formatDate(m.timestamp)));
      if (m.model) meta.push(`model: ${esc(m.model)}`);

      // Simple code block detection for syntax highlighting
      let body = esc(m.text);
      body = body.replace(
        /```(\w*)\n([\s\S]*?)```/g,
        (_match, lang, code) =>
          `<pre class="code-block"><code class="lang-${esc(lang || "text")}">${code}</code></pre>`,
      );
      body = body.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
      body = body.replace(/\n/g, "<br>");

      return `<div class="msg ${cls}">
  <div class="msg-role">${esc(role)}</div>
  ${meta.length > 0 ? `<div class="msg-meta">${meta.join(" &middot; ")}</div>` : ""}
  <div class="msg-body">${body}</div>
</div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0a0a0f;--bg2:#12121a;--bg3:#1a1a24;--text:rgba(255,255,255,.9);--text2:rgba(255,255,255,.55);--border:#2a2a36;--accent:#e84520;--accent2:#f06030;--mono:'SF Mono','Menlo','Monaco','Fira Code',monospace;--sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
html{background:var(--bg);color:var(--text);font-family:var(--sans);font-size:14px;line-height:1.6}
body{max-width:800px;margin:0 auto;padding:32px 24px 64px}
h1{font-size:22px;font-weight:700;margin-bottom:4px}
.export-meta{font-size:12px;color:var(--text2);margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border)}
.msg{margin-bottom:16px;padding:14px 16px;border-radius:8px;border:1px solid var(--border);background:var(--bg2)}
.msg-user{border-left:3px solid var(--accent)}
.msg-assistant{border-left:3px solid #3b82f6}
.msg-tool{border-left:3px solid #a855f7;background:var(--bg3)}
.msg-system{border-left:3px solid #6b7280;opacity:.7}
.msg-thinking{border-left:3px solid #f59e0b;background:var(--bg3);opacity:.8}
.msg-role{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--accent2);margin-bottom:2px}
.msg-assistant .msg-role{color:#60a5fa}
.msg-tool .msg-role{color:#c084fc}
.msg-system .msg-role{color:#9ca3af}
.msg-thinking .msg-role{color:#fbbf24}
.msg-meta{font-size:11px;color:var(--text2);margin-bottom:6px;font-family:var(--mono)}
.msg-body{font-size:13px;line-height:1.65}
.code-block{background:#0d0d14;border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin:8px 0;overflow-x:auto;font-family:var(--mono);font-size:12px;line-height:1.5;white-space:pre-wrap}
.inline-code{background:rgba(255,255,255,.06);padding:1px 5px;border-radius:3px;font-family:var(--mono);font-size:.92em}
@media(max-width:600px){body{padding:16px 12px 48px}.msg{padding:10px 12px}h1{font-size:18px}}
</style>
</head>
<body>
<h1>${esc(title)}</h1>
<div class="export-meta">Exported on ${esc(formatDate(Date.now()))} &middot; ${msgs.length} messages</div>
${messageBlocks}
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const FORMAT_TABS: { id: ExportFormat; label: string }[] = [
  { id: "json", label: "JSON" },
  { id: "markdown", label: "Markdown" },
  { id: "plaintext", label: "Plain Text" },
  { id: "html", label: "HTML" },
];

const FILE_EXT: Record<ExportFormat, string> = {
  json: ".json",
  markdown: ".md",
  plaintext: ".txt",
  html: ".html",
};

const MIME: Record<ExportFormat, string> = {
  json: "application/json",
  markdown: "text/markdown",
  plaintext: "text/plain",
  html: "text/html",
};

function ExportPanel({ isOpen, onClose, messages, sessionTitle, sessionId }: ExportPanelProps) {
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const [options, setOptions] = useState<ExportOptions>({
    includeToolCalls: true,
    includeSystemMessages: false,
    includeThinkingBlocks: false,
    includeTimestamps: true,
    dateFrom: "",
    dateTo: "",
  });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Inject styles on mount
  useEffect(() => {
    if (styleRef.current) return;
    const el = document.createElement("style");
    el.textContent = CSS;
    document.head.appendChild(el);
    styleRef.current = el;
    return () => {
      el.remove();
      styleRef.current = null;
    };
  }, []);

  // Toast auto-dismiss
  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // Escape closes panel
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Filtered messages
  const filtered = useMemo(() => filterMessages(messages, options), [messages, options]);

  // Generated export content
  const exportContent = useMemo(() => {
    switch (format) {
      case "json":
        return toJSON(filtered, sessionTitle, sessionId);
      case "markdown":
        return toMarkdown(filtered, sessionTitle, options);
      case "plaintext":
        return toPlainText(filtered, sessionTitle, options);
      case "html":
        return toHTML(filtered, sessionTitle, options);
    }
  }, [format, filtered, sessionTitle, sessionId, options]);

  // Write HTML to iframe
  useEffect(() => {
    if (format !== "html" || !iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(exportContent);
    doc.close();
  }, [exportContent, format]);

  // Toggle option helper
  const toggle = useCallback(
    (key: keyof ExportOptions) => {
      setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    [],
  );

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(exportContent);
      showToast("Copied to clipboard");
    } catch {
      showToast("Failed to copy");
    }
  }, [exportContent, showToast]);

  // Download file
  const handleDownload = useCallback(() => {
    const slug = sessionTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
    const filename = `${slug || "export"}-${sessionId.slice(0, 8)}${FILE_EXT[format]}`;
    const blob = new Blob([exportContent], { type: MIME[format] });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Download started");
  }, [exportContent, format, sessionTitle, sessionId, showToast]);

  // Share link (placeholder)
  const handleShare = useCallback(async () => {
    const placeholder = `https://share.tensor.app/s/${sessionId}`;
    try {
      await navigator.clipboard.writeText(placeholder);
      showToast("Share link copied (placeholder)");
    } catch {
      showToast("Failed to copy link");
    }
  }, [sessionId, showToast]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div className="export-panel-overlay" onClick={onClose}>
        <div className="export-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Export conversation">

          {/* Header */}
          <div className="export-header">
            <h2>Export Conversation</h2>
            <span className="export-msg-count">{filtered.length} / {messages.length} messages</span>
            <button className="export-close-btn" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          {/* Format tabs */}
          <div className="export-formats">
            {FORMAT_TABS.map((f) => (
              <button
                key={f.id}
                className={`export-format-btn${format === f.id ? " active" : ""}`}
                onClick={() => setFormat(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="export-body">

            {/* Options */}
            <div>
              <div className="export-section-title">Options</div>
              <div className="export-options">
                <div className="export-option-row">
                  <input
                    type="checkbox"
                    className="export-checkbox"
                    id="opt-tool"
                    checked={options.includeToolCalls}
                    onChange={() => toggle("includeToolCalls")}
                  />
                  <label htmlFor="opt-tool">Tool calls</label>
                </div>
                <div className="export-option-row">
                  <input
                    type="checkbox"
                    className="export-checkbox"
                    id="opt-system"
                    checked={options.includeSystemMessages}
                    onChange={() => toggle("includeSystemMessages")}
                  />
                  <label htmlFor="opt-system">System messages</label>
                </div>
                <div className="export-option-row">
                  <input
                    type="checkbox"
                    className="export-checkbox"
                    id="opt-thinking"
                    checked={options.includeThinkingBlocks}
                    onChange={() => toggle("includeThinkingBlocks")}
                  />
                  <label htmlFor="opt-thinking">Thinking blocks</label>
                </div>
                <div className="export-option-row">
                  <input
                    type="checkbox"
                    className="export-checkbox"
                    id="opt-timestamps"
                    checked={options.includeTimestamps}
                    onChange={() => toggle("includeTimestamps")}
                  />
                  <label htmlFor="opt-timestamps">Timestamps</label>
                </div>
              </div>
            </div>

            {/* Date range */}
            <div>
              <div className="export-section-title">Date Range</div>
              <div className="export-date-row">
                <label htmlFor="date-from">From</label>
                <input
                  type="date"
                  id="date-from"
                  className="export-date-input"
                  value={options.dateFrom}
                  onChange={(e) => setOptions((p) => ({ ...p, dateFrom: e.target.value }))}
                  max={options.dateTo || toISODate(Date.now())}
                />
                <label htmlFor="date-to">To</label>
                <input
                  type="date"
                  id="date-to"
                  className="export-date-input"
                  value={options.dateTo}
                  onChange={(e) => setOptions((p) => ({ ...p, dateTo: e.target.value }))}
                  min={options.dateFrom || undefined}
                  max={toISODate(Date.now())}
                />
              </div>
            </div>

            {/* Preview */}
            <div className="export-preview-wrap">
              <div className="export-section-title">Preview</div>
              {format === "html" ? (
                <iframe
                  ref={iframeRef}
                  className="export-preview-html"
                  sandbox="allow-same-origin"
                  title="HTML preview"
                />
              ) : (
                <div className="export-preview">{exportContent}</div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="export-actions">
            <button className="export-btn" onClick={handleCopy} title="Copy to clipboard">
              <CopyIcon /> Copy
            </button>
            <button className="export-btn export-btn-primary" onClick={handleDownload} title="Download file">
              <DownloadIcon /> Download
            </button>
            <div className="export-btn-spacer" />
            <button className="export-btn" onClick={handleShare} title="Generate share link">
              <ShareIcon /> Share Link
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && <div className="export-toast">{toast}</div>}
    </>
  );
}

export default ExportPanel;
