import {
  useState, useRef, useEffect,
  type ReactNode, type CSSProperties, type MouseEvent as RME,
} from "react";
import NotificationCenter from "../status/NotificationCenter";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface DiffStats { added: number; removed: number }
interface PreviewState { running: boolean; url?: string }

interface LogoHeaderProps {
  model: string;
  permissionMode: string;
  contextPercent: number;
  sessionName?: string;
  connected: boolean;
  tools: string[];
  sessionId?: string;
  onSessionRename?: (name: string) => void;
  previewState?: PreviewState;
  onPreviewStart?: () => void;
  onPreviewStop?: () => void;
  diffStats?: DiffStats;
  onDiffClick?: () => void;
  onReviewCode?: () => void;
  backgroundTaskBadge?: ReactNode;
  continueInOptions?: string[];
  onContinueIn?: (target: string) => void;
  /** Export the current conversation. */
  onExportChat?: () => void;
  /** Fork / branch the conversation. */
  onBranchConversation?: () => void;
  /** Open the preview panel. */
  onPreview?: () => void;
  /** True while the model is streaming a response. */
  streaming?: boolean;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function modeColor(m: string) {
  if (m === "auto")   return { bg: "rgba(175,135,255,0.12)", fg: "var(--color-auto-accept)" };
  if (m === "plan")   return { bg: "rgba(72,150,140,0.12)",  fg: "var(--color-plan-mode)" };
  if (m === "bypass") return { bg: "rgba(255,107,128,0.12)", fg: "var(--color-bypass)" };
  return { bg: "rgba(177,185,249,0.12)", fg: "var(--color-permission)" };
}

/** onMouseEnter/Leave that apply inline hover styles. */
function hov(base: CSSProperties, hover: CSSProperties) {
  return {
    style: base,
    onMouseEnter: (e: RME<HTMLElement>) => Object.assign(e.currentTarget.style, hover),
    onMouseLeave: (e: RME<HTMLElement>) => Object.assign(e.currentTarget.style, base),
  };
}

const Chevron = ({ size = 10 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 6l4 4 4-4" />
  </svg>
);

/* ── Styles (theme CSS vars) ───────────────────────────────────────────── */

const bar: CSSProperties = { display:"flex", alignItems:"center", height:36,
  padding:"0 14px", borderBottom:"1px solid var(--border)",
  background:"var(--bg-secondary)", position:"relative", gap:6,
  fontFamily:"var(--font-mono)", fontSize:12, userSelect:"none" };
const left: CSSProperties = { display:"flex", alignItems:"center", gap:8, flexShrink:0 };
const brand: CSSProperties = { color:"var(--text-muted)", fontSize:11, fontWeight:500,
  letterSpacing:"0.02em", whiteSpace:"nowrap" };
const ver: CSSProperties = { color:"var(--text-dim)", fontSize:10,
  background:"var(--bg-tertiary)", borderRadius:"var(--radius-sm)",
  padding:"1px 5px", whiteSpace:"nowrap" };
const center: CSSProperties = { flex:1, display:"flex", alignItems:"center",
  justifyContent:"center", minWidth:0, position:"relative" };
const titleWrap: CSSProperties = { display:"inline-flex", alignItems:"center",
  gap:4, maxWidth:280, position:"relative" };
const titleBase: CSSProperties = { color:"var(--text-secondary)", fontSize:11,
  whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
  cursor:"pointer", padding:"1px 6px", borderRadius:3, background:"none" };
const titleHov: CSSProperties = { ...titleBase, background:"var(--bg-tertiary)",
  color:"var(--text-primary)" };
const titleInput: CSSProperties = { background:"var(--bg-tertiary)",
  border:"1px solid var(--accent)", color:"var(--text-primary)", fontSize:11,
  fontFamily:"var(--font-mono)", padding:"2px 6px", borderRadius:3,
  outline:"none", maxWidth:220, textAlign:"center" };
const chevBtn: CSSProperties = { background:"none", border:"none",
  color:"var(--text-dim)", cursor:"pointer", padding:"2px", display:"flex",
  alignItems:"center", borderRadius:3 };
const right: CSSProperties = { display:"flex", alignItems:"center", gap:10, flexShrink:0 };
const modelS: CSSProperties = { color:"var(--accent)", fontSize:11, whiteSpace:"nowrap" };
const badgeFn = (bg: string, fg: string): CSSProperties => ({ fontSize:10, padding:"1px 6px",
  borderRadius:"var(--radius-sm)", whiteSpace:"nowrap", fontWeight:500,
  letterSpacing:"0.02em", background:bg, color:fg });
const toolsBase: CSSProperties = { background:"none", border:"none", color:"var(--text-dim)",
  fontSize:10, fontFamily:"var(--font-mono)", cursor:"pointer", padding:"1px 4px",
  borderRadius:3, whiteSpace:"nowrap" };
const toolsHov: CSSProperties = { ...toolsBase, background:"var(--bg-tertiary)",
  color:"var(--text-muted)" };
const diffS: CSSProperties = { display:"inline-flex", gap:4, fontSize:10,
  fontFamily:"var(--font-mono)", padding:"1px 5px", borderRadius:3,
  background:"var(--bg-tertiary)", border:"none", cursor:"pointer" };
const dotFn = (on: boolean, pulse: boolean): CSSProperties => ({ width:7, height:7,
  borderRadius:"50%", background: on ? "var(--success)" : "var(--error)", flexShrink:0,
  animation: pulse && on ? "pulse 1.2s ease-in-out infinite" : "none",
  boxShadow: pulse && on ? "0 0 4px var(--success)" : "none" });
const prevBase: CSSProperties = { background:"none", border:"1px solid var(--border)",
  color:"var(--text-muted)", fontSize:10, fontFamily:"var(--font-mono)",
  cursor:"pointer", padding:"2px 8px", borderRadius:"var(--radius-sm)",
  display:"inline-flex", alignItems:"center", gap:4, whiteSpace:"nowrap" };
const prevHov: CSSProperties = { ...prevBase, borderColor:"var(--border-hover)",
  color:"var(--text-primary)" };
const dd: CSSProperties = { position:"absolute", top:"calc(100% + 4px)", left:"50%",
  transform:"translateX(-50%)", background:"var(--bg-secondary)",
  border:"1px solid var(--border-hover)", borderRadius:6, padding:4, zIndex:60,
  minWidth:170, boxShadow:"0 4px 16px rgba(0,0,0,0.4)" };
const ddBase: CSSProperties = { display:"flex", alignItems:"center", gap:8, width:"100%",
  background:"none", border:"none", color:"var(--text-secondary)", fontSize:11,
  fontFamily:"var(--font-mono)", padding:"5px 10px", borderRadius:4,
  cursor:"pointer", textAlign:"left" };
const ddHov: CSSProperties = { ...ddBase, background:"var(--bg-active)",
  color:"var(--text-primary)" };
const ddLabel: CSSProperties = { color:"var(--text-dim)", fontSize:10,
  padding:"4px 10px 2px", letterSpacing:"0.04em", textTransform:"uppercase" };
const ddSep: CSSProperties = { height:1, background:"var(--border)", margin:"3px 6px" };
const toolsList: CSSProperties = { position:"absolute", top:"100%", right:14,
  background:"var(--bg-secondary)", border:"1px solid var(--border-hover)",
  borderRadius:6, padding:6, display:"flex", flexWrap:"wrap", gap:4, zIndex:50,
  maxWidth:320, boxShadow:"0 4px 16px rgba(0,0,0,0.4)" };
const toolTag: CSSProperties = { fontSize:10, padding:"2px 6px", borderRadius:3,
  background:"var(--bg-active)", color:"var(--text-secondary)",
  fontFamily:"var(--font-mono)" };

/* ═══════════════════════════════════════════════════════════════════════════
 * LogoHeader
 *
 * Layout:
 *   [Tensor Code v2.4.0]  ---  [Session title v]  ---  [model] [mode] [N tools] [+X/-Y] (o) [> Preview]
 *
 * - Left:   Brand text (dim) + version badge
 * - Center: Session title (click = inline rename; chevron = dropdown menu)
 *           Dropdown actions: Rename / Copy session ID / Export chat / Branch
 * - Right:  Model name, permission-mode badge, tools count, diff stats (+N/-M),
 *           connection dot (pulses green while streaming), Preview button
 * ═══════════════════════════════════════════════════════════════════════ */

export default function LogoHeader({
  model, permissionMode, sessionName, connected, tools, sessionId,
  onSessionRename, diffStats, onDiffClick, backgroundTaskBadge,
  onExportChat, onBranchConversation, onPreview, streaming = false,
}: LogoHeaderProps) {

  const [showTools, setShowTools] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sessionName ?? "");

  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toolsWrapRef = useRef<HTMLDivElement>(null);

  // Auto-focus rename input
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Keep draft in sync with external name changes
  useEffect(() => {
    if (!editing) setDraft(sessionName ?? "");
  }, [sessionName, editing]);

  // Click-outside to close menus
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setShowMenu(false);
      if (toolsWrapRef.current && !toolsWrapRef.current.contains(e.target as Node))
        setShowTools(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  /* ── Handlers ─────────────────────────────────────────────────────── */

  function commitRename() {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== sessionName && onSessionRename) onSessionRename(t);
    else setDraft(sessionName ?? "");
  }

  function startRename() {
    setDraft(sessionName ?? "");
    setEditing(true);
    setShowMenu(false);
  }

  function copyId() {
    if (sessionId) navigator.clipboard.writeText(sessionId).catch(() => {});
    setShowMenu(false);
  }

  /* ── Derived ──────────────────────────────────────────────────────── */

  const hasDiff = diffStats && (diffStats.added > 0 || diffStats.removed > 0);
  const mc = modeColor(permissionMode);
  const displayTitle = sessionName || "New conversation";

  /* ── Render ───────────────────────────────────────────────────────── */

  return (
    <div style={bar} className="logo-header">

      {/* -- Left --------------------------------------------------------- */}
      <div style={left}>
        {backgroundTaskBadge}
      </div>

      {/* -- Center: title + dropdown ------------------------------------- */}
      <div style={center}>
        <div style={titleWrap} ref={menuRef}>
          {editing ? (
            <input
              ref={inputRef} style={titleInput} value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") { setDraft(sessionName ?? ""); setEditing(false); }
              }}
              maxLength={80}
            />
          ) : (
            <span
              {...hov(titleBase, titleHov)}
              onClick={startRename}
              title={onSessionRename ? "Click to rename" : undefined}
            >
              {displayTitle}
            </span>
          )}

          {!editing && (
            <button style={chevBtn} onClick={() => setShowMenu((v) => !v)}
              aria-label="Session actions">
              <Chevron />
            </button>
          )}

          {showMenu && (
            <div style={dd}>
              <div style={ddLabel}>Session</div>

              {onSessionRename && (
                <button {...hov(ddBase, ddHov)} onClick={startRename}>
                  Rename
                </button>
              )}

              {sessionId && (
                <button {...hov(ddBase, ddHov)} onClick={copyId}>
                  Copy session ID
                </button>
              )}

              {onExportChat && (
                <>
                  <div style={ddSep} />
                  <button {...hov(ddBase, ddHov)}
                    onClick={() => { onExportChat(); setShowMenu(false); }}>
                    Export chat
                  </button>
                </>
              )}

              {onBranchConversation && (
                <button {...hov(ddBase, ddHov)}
                  onClick={() => { onBranchConversation(); setShowMenu(false); }}>
                  Branch conversation
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* -- Right -------------------------------------------------------- */}
      <div style={right}>
        <span style={modelS}>{model}</span>
        <span style={badgeFn(mc.bg, mc.fg)}>{permissionMode}</span>

        <div style={{ position: "relative" as const }} ref={toolsWrapRef}>
          <button {...hov(toolsBase, toolsHov)}
            onClick={() => setShowTools((v) => !v)}
            title={`${tools.length} tools available`}>
            {tools.length} tools
          </button>
        </div>

        {hasDiff && (
          <button style={diffS} onClick={onDiffClick} title="View file changes">
            <span style={{ color: "var(--success)" }}>+{diffStats.added}</span>
            <span style={{ color: "var(--error)" }}>-{diffStats.removed}</span>
          </button>
        )}

        <NotificationCenter />

        <span style={dotFn(connected, streaming)}
          title={connected ? (streaming ? "Streaming..." : "Connected") : "Disconnected"} />

        {onPreview && (
          <button {...hov(prevBase, prevHov)} onClick={onPreview}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2l10 6-10 6V2z" />
            </svg>
            Preview
          </button>
        )}
      </div>

      {/* -- Tools dropdown ----------------------------------------------- */}
      {showTools && (
        <div style={toolsList}>
          {tools.map((t) => <span key={t} style={toolTag}>{t}</span>)}
        </div>
      )}
    </div>
  );
}
