import { useState, useEffect, useRef, useCallback, memo } from "react";
import { config } from "../../config";
import SlashCommandMenu from "./SlashCommandMenu";
import PermissionModeSelector from "./PermissionModeSelector";
import VoiceInput from "./VoiceInput";

// ── Types ───────────────────────────────────────────────────

interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onAbort?: () => void;
  streaming?: boolean;
  model: string;
  onModelChange: (model: string) => void;
  permissionMode: string;
  onPermissionModeChange: (mode: string) => void;
  placeholder?: string;
  showSlashMenu?: boolean;
  slashQuery?: string;
  onSlashSelect?: (cmd: string) => void;
  onSlashDismiss?: () => void;
  editorMode?: string;
}

// ── Constants ───────────────────────────────────────────────

interface ModelOption { value: string; label: string; group: string; }
const MODELS: ModelOption[] = [
  // Claude
  { value: "claude-sonnet-4-20250514", label: "Sonnet 4", group: "Claude" },
  { value: "claude-opus-4-20250514", label: "Opus 4", group: "Claude" },
  { value: "claude-haiku-3-20250307", label: "Haiku 3.5", group: "Claude" },
  { value: "claude-sonnet-4-0", label: "Sonnet (latest)", group: "Claude" },
  // Local (Ollama)
  { value: "qwen3:235b", label: "Qwen 3 235B", group: "Local" },
  { value: "qwen3:32b", label: "Qwen 3 32B", group: "Local" },
  { value: "gemma4:26b", label: "Gemma 4 26B", group: "Local" },
  { value: "gemma4:31b", label: "Gemma 4 31B", group: "Local" },
  { value: "gemma4:e2b", label: "Gemma 4 E2B", group: "Local" },
  { value: "gemma4:e4b", label: "Gemma 4 E4B", group: "Local" },
];
const MODEL_GROUPS = [...new Set(MODELS.map((m) => m.group))];

interface AttachItem { id: string; label: string; icon: string; }
const ATTACH_ITEMS: AttachItem[] = [
  { id: "file", label: "Attach file", icon: "M4 2h5l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" },
  { id: "image", label: "Attach image", icon: "M3 3h10a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" },
  { id: "context", label: "Add context", icon: "M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5" },
  { id: "clipboard", label: "Paste from clipboard", icon: "M5 2h6a1 1 0 011 1v1H4V3a1 1 0 011-1zM3 5h10v8a1 1 0 01-1 1H4a1 1 0 01-1-1V5z" },
];

// ── Styles ──────────────────────────────────────────────────

const STYLES = `
.input-bar-container { border-top:1px solid var(--border); background:var(--bg-primary); position:relative; }
.input-bar-slash-anchor { position:relative; }
.input-bar-row { display:flex; align-items:flex-end; gap:0; min-height:40px; }
.input-bar-plus-btn { display:flex; align-items:center; justify-content:center; width:32px; height:32px; margin:4px 2px 4px 6px; border:1px solid var(--border); border-radius:var(--radius-md); background:transparent; color:var(--text-dim); cursor:pointer; flex-shrink:0; transition:color .15s,border-color .15s,background .15s; }
.input-bar-plus-btn:hover { color:var(--text-muted); border-color:var(--border-hover); background:var(--bg-hover); }
.input-bar-plus-btn--open { color:var(--text-secondary); border-color:var(--border-hover); background:var(--bg-active); }
.input-bar-attach-menu { position:absolute; bottom:calc(100% + 4px); left:6px; min-width:190px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); box-shadow:0 -2px 12px rgba(0,0,0,.35); z-index:200; overflow:hidden; animation:fadeIn .15s ease-out; }
.input-bar-attach-item { display:flex; align-items:center; gap:8px; width:100%; padding:7px 10px; border:none; background:transparent; color:var(--text-secondary); font-size:12px; font-family:var(--font-mono); cursor:pointer; text-align:left; transition:background .12s,color .12s; }
.input-bar-attach-item:hover { background:var(--bg-hover); color:var(--text-primary); }
.input-bar-attach-icon { display:flex; align-items:center; justify-content:center; width:16px; height:16px; color:var(--text-dim); flex-shrink:0; }
.input-bar-textarea { flex:1; background:transparent; border:none; outline:none; color:var(--text-primary); font-family:var(--font-mono); font-size:13px; line-height:1.5; padding:8px 6px; resize:none; min-height:28px; max-height:200px; overflow-y:auto; }
.input-bar-textarea::placeholder { color:var(--text-dim); }
.input-bar-textarea:disabled { opacity:.5; }
.input-bar-controls { display:flex; align-items:center; gap:6px; margin:0 4px 6px 0; flex-shrink:0; }
.input-bar-model-wrap { position:relative; display:inline-block; }
.input-bar-model-btn { display:inline-flex; align-items:center; gap:3px; padding:2px 6px; border:none; border-radius:var(--radius-sm); background:transparent; color:var(--text-dim); font-size:10px; font-family:var(--font-mono); cursor:pointer; white-space:nowrap; transition:color .12s,background .12s; }
.input-bar-model-btn:hover { color:var(--text-muted); background:var(--bg-hover); }
.input-bar-model-chevron { display:inline-flex; transition:transform .15s; }
.input-bar-model-chevron--open { transform:rotate(180deg); }
.input-bar-model-dd { position:absolute; bottom:calc(100% + 4px); right:0; min-width:180px; max-height:340px; overflow-y:auto; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); box-shadow:0 -2px 12px rgba(0,0,0,.35); z-index:200; animation:fadeIn .15s ease-out; }
.input-bar-model-hdr { display:flex; align-items:center; padding:5px 8px; border-bottom:1px solid var(--border-subtle); position:sticky; top:0; background:var(--bg-secondary); }
.input-bar-model-hdr span { font-size:10px; color:var(--text-dim); font-weight:600; text-transform:uppercase; letter-spacing:.5px; font-family:var(--font-mono); }
.input-bar-model-opt { display:flex; align-items:center; justify-content:space-between; width:100%; padding:6px 10px; border:none; background:transparent; color:var(--text-secondary); font-size:11px; font-family:var(--font-mono); cursor:pointer; text-align:left; transition:background .12s; }
.input-bar-model-opt:hover { background:var(--bg-hover); }
.input-bar-model-opt--active { background:var(--bg-active); color:var(--text-primary); }
.input-bar-send { width:28px; height:28px; border-radius:50%; border:none; background:var(--bg-tertiary); color:var(--text-dim); display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0; margin:0 8px 6px 0; flex-shrink:0; transition:background .15s,color .15s; }
.input-bar-send:disabled { opacity:.25; cursor:default; }
.input-bar-send:hover:not(:disabled) { opacity:.85; }
.input-bar-send--active { background:var(--accent); color:#fff; }
.input-bar-send--abort { background:var(--error); color:#fff; }
.input-bar-footer { display:flex; align-items:center; gap:6px; padding:0 12px 4px; font-size:10px; color:var(--text-dim); font-family:var(--font-mono); }
.input-bar-footer-sep { color:var(--text-dim); opacity:.5; }
.input-bar-vim-indicator { display:inline-flex; align-items:center; padding:0 6px; font-size:10px; font-family:var(--font-mono); font-weight:600; letter-spacing:.5px; }
.input-bar-vim-normal { color:#80e0a0; }
.input-bar-vim-insert { color:#f0c060; }
.input-bar-textarea--vim-normal { caret-color:transparent; }
`;

// ── Component ───────────────────────────────────────────────

function InputBar({
  value, onChange, onSend, onAbort, streaming = false,
  model, onModelChange, permissionMode, onPermissionModeChange,
  placeholder, showSlashMenu = false, slashQuery = "",
  onSlashSelect, onSlashDismiss, editorMode = "normal",
}: InputBarProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const attachRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const injected = useRef(false);

  // ── Vim mode state ─────────────────────────────────────────
  const [vimState, setVimState] = useState<"normal" | "insert">("normal");
  const pendingKey = useRef<string | null>(null);

  // Reset to normal mode when vim is enabled, or clear when disabled
  useEffect(() => {
    if (editorMode === "vim") setVimState("normal");
  }, [editorMode]);

  // Inject styles once
  useEffect(() => {
    if (injected.current) return;
    injected.current = true;
    const el = document.createElement("style");
    el.textContent = STYLES;
    document.head.appendChild(el);
    return () => { el.remove(); injected.current = false; };
  }, []);

  // Close menus on outside click
  useEffect(() => {
    if (!attachOpen && !modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (attachOpen && attachRef.current && !attachRef.current.contains(e.target as Node)) setAttachOpen(false);
      if (modelOpen && modelRef.current && !modelRef.current.contains(e.target as Node)) setModelOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [attachOpen, modelOpen]);

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, []);
  useEffect(() => { autoResize(); }, [value, autoResize]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      // Block input in vim normal mode (keydown preventDefault handles most cases,
      // but some input methods/browsers can still fire onChange)
      if (editorMode === "vim" && vimState === "normal") return;
      onChange(e.target.value);
    },
    [onChange, editorMode, vimState],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // ── Enter to send (always active) ──
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (streaming && onAbort) onAbort();
        else if (value.trim()) onSend(value);
        return;
      }

      // ── Vim keybindings ──
      if (editorMode !== "vim") return;
      const ta = taRef.current;
      if (!ta) return;

      if (vimState === "normal") {
        // Almost all keys in normal mode should be swallowed
        const passThrough = ["Enter", "Tab"];
        if (!passThrough.includes(e.key)) e.preventDefault();

        const pos = ta.selectionStart;

        // "dd" – clear entire line
        if (e.key === "d") {
          if (pendingKey.current === "d") {
            pendingKey.current = null;
            onChange("");
            return;
          }
          pendingKey.current = "d";
          return;
        }
        pendingKey.current = null;

        switch (e.key) {
          case "i":
            setVimState("insert");
            break;
          case "a":
            setVimState("insert");
            ta.setSelectionRange(pos + 1, pos + 1);
            break;
          case "A":
            setVimState("insert");
            ta.setSelectionRange(value.length, value.length);
            break;
          case "I":
            setVimState("insert");
            ta.setSelectionRange(0, 0);
            break;
          case "o":
            setVimState("insert");
            onChange(value + "\n");
            setTimeout(() => {
              ta.setSelectionRange(value.length + 1, value.length + 1);
            }, 0);
            break;
          case "h":
          case "ArrowLeft":
            ta.setSelectionRange(Math.max(0, pos - 1), Math.max(0, pos - 1));
            break;
          case "l":
          case "ArrowRight":
            ta.setSelectionRange(Math.min(value.length, pos + 1), Math.min(value.length, pos + 1));
            break;
          case "j":
          case "ArrowDown": {
            // Move cursor down one line
            const before = value.slice(0, pos);
            const lineStart = before.lastIndexOf("\n") + 1;
            const col = pos - lineStart;
            const afterPos = value.indexOf("\n", pos);
            if (afterPos !== -1) {
              const nextLineStart = afterPos + 1;
              const nextLineEnd = value.indexOf("\n", nextLineStart);
              const nextLen = (nextLineEnd === -1 ? value.length : nextLineEnd) - nextLineStart;
              const target = nextLineStart + Math.min(col, nextLen);
              ta.setSelectionRange(target, target);
            }
            break;
          }
          case "k":
          case "ArrowUp": {
            // Move cursor up one line
            const before = value.slice(0, pos);
            const lineStart = before.lastIndexOf("\n") + 1;
            const col = pos - lineStart;
            if (lineStart > 0) {
              const prevLineEnd = lineStart - 1;
              const prevBefore = value.slice(0, prevLineEnd);
              const prevLineStart = prevBefore.lastIndexOf("\n") + 1;
              const prevLen = prevLineEnd - prevLineStart;
              const target = prevLineStart + Math.min(col, prevLen);
              ta.setSelectionRange(target, target);
            }
            break;
          }
          case "w": {
            // Jump forward to start of next word
            const after = value.slice(pos);
            const m = after.match(/^\s*\S*\s*/);
            const jump = m ? m[0].length : 0;
            const np = Math.min(value.length, pos + (jump || 1));
            ta.setSelectionRange(np, np);
            break;
          }
          case "b": {
            // Jump backward to start of previous word
            const before = value.slice(0, pos);
            const m = before.match(/\S+\s*$/);
            const np = m ? pos - m[0].length : 0;
            ta.setSelectionRange(np, np);
            break;
          }
          case "e": {
            // Jump forward to end of word
            const after = value.slice(pos + 1);
            const m = after.match(/^\s*\S*/);
            const jump = m ? m[0].length : 0;
            const np = Math.min(value.length, pos + 1 + jump);
            ta.setSelectionRange(np, np);
            break;
          }
          case "0":
          case "Home": {
            // Start of line
            const before = value.slice(0, pos);
            const ls = before.lastIndexOf("\n") + 1;
            ta.setSelectionRange(ls, ls);
            break;
          }
          case "$":
          case "End": {
            // End of line
            const eol = value.indexOf("\n", pos);
            const ep = eol === -1 ? value.length : eol;
            ta.setSelectionRange(ep, ep);
            break;
          }
          case "x": {
            // Delete char under cursor
            if (pos < value.length) {
              onChange(value.slice(0, pos) + value.slice(pos + 1));
              setTimeout(() => ta.setSelectionRange(pos, pos), 0);
            }
            break;
          }
          case "Escape":
            // Already in normal mode, do nothing
            break;
        }
      } else {
        // ── Insert mode: only Escape exits ──
        if (e.key === "Escape") {
          e.preventDefault();
          setVimState("normal");
          // Move cursor back one position (vim behavior)
          const pos = ta.selectionStart;
          if (pos > 0) ta.setSelectionRange(pos - 1, pos - 1);
        }
      }
    },
    [streaming, value, onSend, onAbort, editorMode, vimState, onChange],
  );

  // Voice input: track where voice text starts so we can replace interim words
  const voiceBaseRef = useRef(""); // text before voice started
  const voiceFinalRef = useRef(""); // committed (final) voice words
  const voiceActiveRef = useRef(false);

  const handleVoice = useCallback(
    (text: string, isFinal: boolean) => {
      // isFinal=true with empty text means voice session ended
      if (isFinal && !text) {
        voiceActiveRef.current = false;
        voiceBaseRef.current = "";
        voiceFinalRef.current = "";
        taRef.current?.focus();
        return;
      }

      // First voice callback — snapshot the existing text
      if (!voiceActiveRef.current) {
        voiceActiveRef.current = true;
        voiceBaseRef.current = value ? value + " " : "";
        voiceFinalRef.current = "";
      }

      // Append finalized words to committed buffer (these won't change)
      voiceFinalRef.current += text;

      // Build the full text: base + committed final words
      const full = voiceBaseRef.current + voiceFinalRef.current;
      onChange(full);
    },
    [value, onChange],
  );

  const handleAttach = useCallback(
    (id: string) => {
      setAttachOpen(false);
      if (id === "file" || id === "image") {
        const inp = document.createElement("input");
        inp.type = "file";
        if (id === "image") inp.accept = "image/*";
        inp.click();
      } else if (id === "clipboard") {
        navigator.clipboard.readText().then((t) => { if (t) onChange(value + t); }).catch(() => {});
      }
    },
    [value, onChange],
  );

  const [pulling, setPulling] = useState<string | null>(null);

  const handleModelSelect = useCallback(
    (v: string) => {
      setModelOpen(false);
      onModelChange(v);

      // Auto-pull local models via Ollama so they're ready to use
      const isLocal = MODELS.find((m) => m.value === v)?.group === "Local";
      if (isLocal) {
        setPulling(v);
        fetch(`${config.apiBase}/ollama-pull`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: v }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.error) console.error("Ollama pull error:", data.error);
            setPulling(null);
          })
          .catch(() => setPulling(null));
      }
    },
    [onModelChange],
  );

  const modelLabel = MODELS.find((m) => m.value === model)?.label ?? model;
  const canSend = value.trim().length > 0;
  const ph = streaming ? "Press Enter to interrupt..." : placeholder ?? "Reply...";

  return (
    <div className="input-bar-container">
      {showSlashMenu && onSlashSelect && onSlashDismiss && (
        <div className="input-bar-slash-anchor">
          <SlashCommandMenu query={slashQuery} visible={showSlashMenu} onSelect={onSlashSelect} onDismiss={onSlashDismiss} />
        </div>
      )}

      <div className="input-bar-row">
        {/* + attach button */}
        <div ref={attachRef} style={{ position: "relative" }}>
          <button type="button" className={`input-bar-plus-btn${attachOpen ? " input-bar-plus-btn--open" : ""}`} onClick={() => setAttachOpen((p) => !p)} title="Attach file or context">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="3" x2="8" y2="13" /><line x1="3" y1="8" x2="13" y2="8" />
            </svg>
          </button>
          {attachOpen && (
            <div className="input-bar-attach-menu">
              {ATTACH_ITEMS.map((item) => (
                <button key={item.id} type="button" className="input-bar-attach-item" onClick={() => handleAttach(item.id)}>
                  <span className="input-bar-attach-icon">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon} /></svg>
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Vim mode indicator */}
        {editorMode === "vim" && (
          <span className={`input-bar-vim-indicator ${vimState === "normal" ? "input-bar-vim-normal" : "input-bar-vim-insert"}`}>
            {vimState === "normal" ? "NRM" : "INS"}
          </span>
        )}

        {/* Textarea */}
        <textarea ref={taRef} className={`input-bar-textarea${editorMode === "vim" && vimState === "normal" ? " input-bar-textarea--vim-normal" : ""}`} value={value} onChange={handleChange} onKeyDown={handleKeyDown} placeholder={ph} rows={1} autoFocus />

        {/* Controls strip */}
        <div className="input-bar-controls">
          <PermissionModeSelector mode={permissionMode as any} onModeChange={(m) => onPermissionModeChange(m)} />

          {/* Model selector */}
          <div ref={modelRef} className="input-bar-model-wrap">
            <button type="button" className="input-bar-model-btn" onClick={() => setModelOpen((p) => !p)} title="Select model">
              {pulling ? "Pulling..." : modelLabel}
              <span className={`input-bar-model-chevron${modelOpen ? " input-bar-model-chevron--open" : ""}`}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 6 8 10 12 6" /></svg>
              </span>
            </button>
            {modelOpen && (
              <div className="input-bar-model-dd">
                {MODEL_GROUPS.map((group) => (
                  <div key={group}>
                    <div className="input-bar-model-hdr"><span>{group}</span></div>
                    {MODELS.filter((m) => m.group === group).map((opt) => {
                      const active = opt.value === model;
                      return (
                        <button key={opt.value} type="button" className={`input-bar-model-opt${active ? " input-bar-model-opt--active" : ""}`} onClick={() => handleModelSelect(opt.value)}>
                          <span>{opt.label}</span>
                          {active && <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{"\u2713"}</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          <VoiceInput onTranscript={handleVoice} disabled={streaming} />
        </div>

        {/* Send / Abort */}
        {streaming ? (
          <button type="button" className="input-bar-send input-bar-send--abort" onClick={onAbort} title="Stop (Enter)">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="0" y="0" width="10" height="10" rx="1" /></svg>
          </button>
        ) : (
          <button type="button" className={`input-bar-send${canSend ? " input-bar-send--active" : ""}`} onClick={() => onSend(value)} disabled={!canSend} title="Send (Enter)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        )}
      </div>

      <div className="input-bar-footer">
        <span>{modelLabel}</span>
        <span className="input-bar-footer-sep">&middot;</span>
        {editorMode === "vim" ? (
          <>
            <span className={vimState === "normal" ? "input-bar-vim-normal" : "input-bar-vim-insert"} style={{ fontWeight: 600 }}>
              {vimState === "normal" ? "-- NORMAL --" : "-- INSERT --"}
            </span>
            <span className="input-bar-footer-sep">&middot;</span>
            <span>{vimState === "normal" ? "i insert  hjkl move  w/b word  dd clear" : "Esc normal mode"}</span>
          </>
        ) : (
          <>
            <span>Enter send</span>
            <span className="input-bar-footer-sep">&middot;</span>
            <span>Shift+Enter newline</span>
          </>
        )}
        <span className="input-bar-footer-sep">&middot;</span>
        <span>/ commands</span>
      </div>
    </div>
  );
}

export default memo(InputBar);
