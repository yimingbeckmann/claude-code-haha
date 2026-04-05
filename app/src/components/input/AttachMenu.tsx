import { useState, useCallback, useEffect, useRef, memo } from "react";

// -- Types ----------------------------------------------------------

export interface AttachedFile {
  name: string;
  type: string;   // MIME type
  size: number;
  content?: string;  // text content if readable
  dataUrl?: string;  // base64 data URL for images
}

export interface AttachMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  onAttachFiles: (files: AttachedFile[]) => void;
  attachedFiles: AttachedFile[];
  onRemoveFile: (index: number) => void;
}

// -- Helpers --------------------------------------------------------

function formatSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function fileTag(mime: string, name: string): string {
  if (mime.startsWith("image/")) return "img";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["ts", "tsx", "js", "jsx"].includes(ext)) return "ts";
  if (ext === "py") return "py";
  if (ext === "rs") return "rs";
  if (["json", "yaml", "yml", "toml"].includes(ext)) return "cfg";
  if (["md", "txt", "csv"].includes(ext)) return "txt";
  if (["css", "scss"].includes(ext)) return "css";
  return "file";
}

const TAG_COLORS: Record<string, string> = {
  img: "var(--success)", ts: "var(--cyan)", py: "var(--warning)",
  rs: "var(--accent)", cfg: "var(--text-muted)", css: "var(--purple)",
  txt: "var(--text-secondary)", file: "var(--text-muted)",
};

async function readFile(file: File): Promise<AttachedFile> {
  const a: AttachedFile = { name: file.name, type: file.type, size: file.size };
  if (file.type.startsWith("image/")) {
    a.dataUrl = await new Promise<string>((r) => {
      const rd = new FileReader();
      rd.onload = () => r(rd.result as string);
      rd.readAsDataURL(file);
    });
  } else if (file.type.startsWith("text/") || file.size < 524288) {
    try { a.content = await file.text(); } catch { /* binary -- skip */ }
  }
  return a;
}

// -- Styles ---------------------------------------------------------

const STYLES = `
.am-trigger { display:flex; align-items:center; justify-content:center; width:28px; height:28px; border:1px solid var(--border); border-radius:var(--radius-sm); background:transparent; color:var(--text-secondary); font-size:16px; font-family:var(--font-mono); cursor:pointer; flex-shrink:0; line-height:1; user-select:none; transition:color .15s,border-color .15s,background .15s; }
.am-trigger:hover { color:var(--text-primary); border-color:var(--border-hover); background:var(--bg-hover); }
.am-trigger[data-open="true"] { color:var(--accent); border-color:var(--accent-dim); background:var(--accent-dim); }
.am-menu { position:absolute; bottom:calc(100% + 6px); left:0; min-width:220px; background:var(--bg-secondary); border:1px solid var(--border-hover); border-radius:var(--radius-md); box-shadow:0 -4px 20px rgba(0,0,0,.4); z-index:1000; overflow:hidden; padding:4px 0; animation:fadeIn .12s ease-out; }
.am-menu-header { padding:6px 10px 4px; font-size:10px; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:.5px; border-bottom:1px solid var(--border); margin-bottom:2px; }
.am-item { display:flex; align-items:center; gap:10px; width:100%; padding:7px 12px; border:none; background:transparent; color:var(--text-secondary); font-family:var(--font-mono); font-size:12px; cursor:pointer; text-align:left; transition:background .1s,color .1s; }
.am-item:hover,.am-item[data-focused="true"] { background:var(--bg-hover); color:var(--text-primary); }
.am-item-icon { width:18px; text-align:center; font-size:13px; color:var(--text-muted); flex-shrink:0; }
.am-item:hover .am-item-icon { color:var(--accent); }
.am-item-label { flex:1; }
.am-item-shortcut { font-size:10px; color:var(--text-dim); background:var(--bg-tertiary); padding:1px 5px; border-radius:3px; border:1px solid var(--border); }
.am-chips { display:flex; flex-wrap:wrap; gap:6px; padding:6px 0 2px; }
.am-chip { display:inline-flex; align-items:center; gap:6px; padding:3px 8px; background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-sm); font-family:var(--font-mono); font-size:11px; color:var(--text-secondary); max-width:220px; animation:fadeIn .15s ease-out; }
.am-chip-icon { font-size:10px; font-weight:600; flex-shrink:0; }
.am-chip-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }
.am-chip-size { font-size:10px; color:var(--text-muted); flex-shrink:0; }
.am-chip-remove { display:flex; align-items:center; justify-content:center; width:14px; height:14px; border:none; border-radius:2px; background:transparent; color:var(--text-muted); font-size:11px; cursor:pointer; flex-shrink:0; padding:0; line-height:1; transition:color .1s,background .1s; }
.am-chip-remove:hover { color:var(--error); background:var(--error-dim); }
.am-chip-thumb { width:20px; height:20px; border-radius:3px; object-fit:cover; flex-shrink:0; }
.am-drop-zone { position:relative; }
.am-drop-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(249,115,22,.06); border:2px dashed var(--accent); border-radius:var(--radius-md); z-index:50; pointer-events:none; animation:fadeIn .15s ease-out; }
.am-drop-label { font-family:var(--font-mono); font-size:12px; color:var(--accent); font-weight:500; }
.am-ctx-input { width:100%; padding:6px 10px; background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text-primary); font-family:var(--font-mono); font-size:11px; outline:none; resize:vertical; min-height:60px; max-height:120px; transition:border-color .15s; }
.am-ctx-input:focus { border-color:var(--accent-dim); }
.am-ctx-input::placeholder { color:var(--text-dim); }
.am-ctx-wrap { padding:6px 12px 8px; }
.am-ctx-actions { display:flex; justify-content:flex-end; gap:6px; margin-top:4px; }
.am-ctx-btn { padding:3px 10px; border:1px solid var(--border); border-radius:var(--radius-sm); background:transparent; color:var(--text-secondary); font-family:var(--font-mono); font-size:10px; cursor:pointer; transition:background .1s,color .1s; }
.am-ctx-btn:hover { background:var(--bg-hover); color:var(--text-primary); }
.am-ctx-btn-ok { background:var(--accent-dim); color:var(--accent); border-color:transparent; }
.am-ctx-btn-ok:hover { background:var(--accent); color:#fff; }
`;

// -- Menu item definitions ------------------------------------------

const MENU_ITEMS = [
  { id: "file",      icon: "+", label: "Attach file" },
  { id: "image",     icon: "~", label: "Attach image" },
  { id: "context",   icon: "#", label: "Add context" },
  { id: "clipboard", icon: ">", label: "Paste from clipboard", shortcut: "Ctrl+V" },
  { id: "mention",   icon: "@", label: "Mention file (@)" },
] as const;

// -- Component ------------------------------------------------------

function AttachMenu({ isOpen, onToggle, onAttachFiles, attachedFiles, onRemoveFile }: AttachMenuProps) {
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [ctxMode, setCtxMode] = useState(false);
  const [ctxText, setCtxText] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const dragCount = useRef(0);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onToggle();
        setCtxMode(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [isOpen, onToggle]);

  // Reset state when menu opens
  useEffect(() => {
    if (isOpen) { setFocusedIdx(0); setCtxMode(false); setCtxText(""); }
  }, [isOpen]);

  // Keyboard navigation within menu
  useEffect(() => {
    if (!isOpen || ctxMode) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIdx((i) => Math.min(i + 1, MENU_ITEMS.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); doAction(MENU_ITEMS[focusedIdx].id); }
      else if (e.key === "Escape") { e.preventDefault(); onToggle(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, focusedIdx, ctxMode]);

  // Read selected files from native picker
  const processFiles = useCallback(async (fl: FileList | null) => {
    if (!fl || fl.length === 0) return;
    const out: AttachedFile[] = [];
    for (let i = 0; i < fl.length; i++) out.push(await readFile(fl[i]));
    onAttachFiles(out);
  }, [onAttachFiles]);

  // Dispatch action for each menu item
  const doAction = useCallback(async (id: string) => {
    if (id === "file") { fileRef.current?.click(); onToggle(); }
    else if (id === "image") { imgRef.current?.click(); onToggle(); }
    else if (id === "context") { setCtxMode(true); }
    else if (id === "clipboard") {
      onToggle();
      try { const t = await navigator.clipboard.readText(); if (t.trim()) onAttachFiles([{ name: "clipboard.txt", type: "text/plain", size: new Blob([t]).size, content: t }]); } catch { /* denied */ }
    } else if (id === "mention") {
      onToggle();
      document.dispatchEvent(new CustomEvent("attach-menu:mention"));
    }
  }, [onToggle, onAttachFiles]);

  // Submit context text as an attached file
  const submitCtx = useCallback(() => {
    const t = ctxText.trim();
    if (t) {
      onAttachFiles([{
        name: "context.md", type: "text/markdown",
        size: new Blob([t]).size, content: t,
      }]);
    }
    setCtxMode(false);
    setCtxText("");
    onToggle();
  }, [ctxText, onAttachFiles, onToggle]);

  // -- Drag & drop handlers -----------------------------------------

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); dragCount.current--; if (dragCount.current === 0) setIsDragging(false); }, []);
  const onDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), []);
  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); dragCount.current = 0; setIsDragging(false); processFiles(e.dataTransfer.files); }, [processFiles]);

  // -- Render -------------------------------------------------------

  return (
    <>
      <style>{STYLES}</style>

      {/* Hidden native file inputs */}
      <input ref={fileRef} type="file" multiple style={{ display: "none" }}
        onChange={(e) => { processFiles(e.target.files); e.target.value = ""; }} />
      <input ref={imgRef} type="file" accept="image/*" multiple style={{ display: "none" }}
        onChange={(e) => { processFiles(e.target.files); e.target.value = ""; }} />

      {/* Drop zone wraps the trigger and chips */}
      <div className="am-drop-zone" onDragEnter={onDragEnter} onDragLeave={onDragLeave}
        onDragOver={onDragOver} onDrop={onDrop}>
        {isDragging && (
          <div className="am-drop-overlay">
            <span className="am-drop-label">Drop files to attach</span>
          </div>
        )}

        {/* "+" trigger button */}
        <div ref={menuRef} style={{ position: "relative", display: "inline-block" }}>
          <button type="button" className="am-trigger" data-open={isOpen}
            onClick={onToggle} title="Attach files or context">+</button>

          {/* Dropdown menu (opens upward) */}
          {isOpen && (
            <div className="am-menu">
              <div className="am-menu-header">Attach</div>
              {!ctxMode ? (
                MENU_ITEMS.map((item, idx) => (
                  <button key={item.id} type="button" className="am-item"
                    data-focused={idx === focusedIdx}
                    onClick={() => doAction(item.id)}
                    onMouseEnter={() => setFocusedIdx(idx)}>
                    <span className="am-item-icon">{item.icon}</span>
                    <span className="am-item-label">{item.label}</span>
                    {item.shortcut && <span className="am-item-shortcut">{item.shortcut}</span>}
                  </button>
                ))
              ) : (
                <div className="am-ctx-wrap">
                  <textarea className="am-ctx-input"
                    placeholder="Add instructions or context..."
                    value={ctxText}
                    onChange={(e) => setCtxText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitCtx(); }
                      if (e.key === "Escape") { e.preventDefault(); setCtxMode(false); }
                    }}
                    autoFocus />
                  <div className="am-ctx-actions">
                    <button type="button" className="am-ctx-btn" onClick={() => setCtxMode(false)}>Cancel</button>
                    <button type="button" className="am-ctx-btn am-ctx-btn-ok" onClick={submitCtx}>Add</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Attached file chips */}
        {attachedFiles.length > 0 && (
          <div className="am-chips">
            {attachedFiles.map((f, i) => {
              const tag = fileTag(f.type, f.name);
              return (
                <div key={`${f.name}-${i}`} className="am-chip">
                  {f.dataUrl
                    ? <img className="am-chip-thumb" src={f.dataUrl} alt={f.name} />
                    : <span className="am-chip-icon" style={{ color: TAG_COLORS[tag] }}>{tag}</span>}
                  <span className="am-chip-name" title={f.name}>{f.name}</span>
                  <span className="am-chip-size">{formatSize(f.size)}</span>
                  <button type="button" className="am-chip-remove"
                    onClick={() => onRemoveFile(i)} title="Remove">x</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

export default memo(AttachMenu);
