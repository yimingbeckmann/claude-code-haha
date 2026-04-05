import { useState, useEffect, useRef, useCallback, memo } from "react";

// ── Types ───────────────────────────────────────────────────

export interface DroppedImage {
  file: File;
  dataUrl: string;
  name: string;
}

interface ImageDropZoneProps {
  children: React.ReactNode;
  onImageDrop: (images: DroppedImage[]) => void;
  disabled?: boolean;
}

interface ImagePreviewBarProps {
  images: Array<{ dataUrl: string; name: string }>;
  onRemove: (index: number) => void;
}

type DragState = "idle" | "dragover" | "processing";

// ── Constants ───────────────────────────────────────────────

const ACCEPTED_TYPES = new Set([
  "image/png",
  "image/jpg",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const ACCEPTED_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const TOAST_DURATION = 2000;

// ── Styles ──────────────────────────────────────────────────

const STYLES = `
/* Drop zone wrapper */
.idz-wrapper { position:relative; flex:1; min-height:0; display:flex; flex-direction:column; overflow:visible; }

/* Overlay */
.idz-overlay {
  position:absolute; inset:0; z-index:100;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px;
  background:rgba(232, 69, 32, 0.06);
  border:2px dashed var(--accent, #e84520);
  border-radius:var(--radius-md, 8px);
  pointer-events:none;
  animation:idzFadeIn .2s ease-out, idzPulse 2s ease-in-out infinite;
}
.idz-overlay-icon {
  display:flex; align-items:center; justify-content:center;
  width:48px; height:48px;
  border-radius:var(--radius-md, 8px);
  background:var(--accent-dim, rgba(232,69,32,0.15));
  color:var(--accent, #e84520);
}
.idz-overlay-text {
  font-family:var(--font-mono, monospace);
  font-size:13px; font-weight:500;
  color:var(--accent-text, #ff7a50);
  letter-spacing:0.3px;
}
.idz-overlay-hint {
  font-family:var(--font-mono, monospace);
  font-size:10px;
  color:var(--text-muted, rgba(255,255,255,0.30));
}

/* Processing spinner */
.idz-processing {
  position:absolute; inset:0; z-index:100;
  display:flex; align-items:center; justify-content:center; gap:8px;
  background:rgba(0,0,0,0.3);
  border-radius:var(--radius-md, 8px);
  pointer-events:none;
  animation:idzFadeIn .15s ease-out;
}
.idz-processing-text {
  font-family:var(--font-mono, monospace);
  font-size:12px;
  color:var(--text-secondary, rgba(255,255,255,0.55));
}
.idz-spinner {
  width:16px; height:16px;
  border:2px solid var(--border, #2a2a36);
  border-top-color:var(--accent, #e84520);
  border-radius:50%;
  animation:idzSpin .6s linear infinite;
}

/* Toast container */
.idz-toast-container {
  position:fixed; bottom:80px; right:16px; z-index:9999;
  display:flex; flex-direction:column; gap:8px;
  pointer-events:none;
}
.idz-toast {
  display:flex; align-items:center; gap:8px;
  padding:8px 12px;
  background:var(--bg-elevated, #1e1e2a);
  border:1px solid var(--border, #2a2a36);
  border-radius:var(--radius-md, 8px);
  box-shadow:var(--shadow-md, 0 4px 12px rgba(0,0,0,0.5));
  animation:idzToastIn .25s ease-out;
  transition:opacity .4s ease-out, transform .4s ease-out;
}
.idz-toast--fading {
  opacity:0;
  transform:translateY(8px);
}
.idz-toast-thumb {
  width:32px; height:32px;
  border-radius:4px;
  object-fit:cover;
  border:1px solid var(--border-subtle, rgba(255,255,255,0.04));
  flex-shrink:0;
}
.idz-toast-name {
  font-family:var(--font-mono, monospace);
  font-size:11px;
  color:var(--text-secondary, rgba(255,255,255,0.55));
  max-width:160px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.idz-toast--error {
  border-color:var(--error, #ef4444);
}
.idz-toast--error .idz-toast-name {
  color:var(--error-text, #f87171);
}

/* Preview bar */
.ipb-bar {
  display:flex; align-items:center; gap:6px;
  padding:6px 12px;
  overflow-x:auto;
  scrollbar-width:thin;
}
.ipb-bar::-webkit-scrollbar { height:3px; }
.ipb-bar::-webkit-scrollbar-thumb { background:var(--scrollbar-thumb, rgba(255,255,255,0.06)); border-radius:2px; }
.ipb-item {
  position:relative;
  width:40px; height:40px;
  flex-shrink:0;
  border-radius:var(--radius-sm, 4px);
  overflow:hidden;
  border:1px solid var(--border, #2a2a36);
  transition:border-color .15s;
}
.ipb-item:hover { border-color:var(--border-hover, #3a3a48); }
.ipb-thumb {
  width:100%; height:100%;
  object-fit:cover;
  display:block;
}
.ipb-remove {
  position:absolute; top:-1px; right:-1px;
  width:16px; height:16px;
  border:none; border-radius:0 var(--radius-sm, 4px) 0 var(--radius-sm, 4px);
  background:var(--bg-overlay, rgba(0,0,0,0.6));
  color:var(--text-secondary, rgba(255,255,255,0.55));
  font-size:10px; font-family:var(--font-mono, monospace);
  cursor:pointer; display:flex; align-items:center; justify-content:center;
  opacity:0; transition:opacity .15s, color .12s, background .12s;
  padding:0; line-height:1;
}
.ipb-item:hover .ipb-remove { opacity:1; }
.ipb-remove:hover { color:#fff; background:var(--error, #ef4444); }

/* Keyframes */
@keyframes idzFadeIn { from { opacity:0; } to { opacity:1; } }
@keyframes idzPulse {
  0%, 100% { background:rgba(232,69,32,0.06); }
  50% { background:rgba(232,69,32,0.10); }
}
@keyframes idzSpin { to { transform:rotate(360deg); } }
@keyframes idzToastIn {
  from { opacity:0; transform:translateY(12px) scale(0.95); }
  to { opacity:1; transform:translateY(0) scale(1); }
}
`;

// ── Helpers ─────────────────────────────────────────────────

function isAcceptedImage(file: File): boolean {
  if (ACCEPTED_TYPES.has(file.type)) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ACCEPTED_EXTENSIONS.has(ext);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// ── Toast state (module-level to share across instances) ─────

interface ToastItem {
  id: number;
  dataUrl?: string;
  name: string;
  error?: boolean;
  fading: boolean;
}

let toastIdCounter = 0;

// ── ImageDropZone Component ─────────────────────────────────

function ImageDropZone({ children, onImageDrop, disabled = false }: ImageDropZoneProps) {
  const [dragState, setDragState] = useState<DragState>("idle");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dragCountRef = useRef(0);
  const injectedRef = useRef(false);

  // Inject styles once
  useEffect(() => {
    if (injectedRef.current) return;
    injectedRef.current = true;
    const el = document.createElement("style");
    el.textContent = STYLES;
    document.head.appendChild(el);
    return () => { el.remove(); injectedRef.current = false; };
  }, []);

  // Toast management
  const addToast = useCallback((name: string, dataUrl?: string, error?: boolean) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, name, dataUrl, error, fading: false }]);
    // Start fading after a delay
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => t.id === id ? { ...t, fading: true } : t));
    }, TOAST_DURATION - 400);
    // Remove after full duration
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION);
  }, []);

  // Process dropped/pasted files
  const processFiles = useCallback(async (files: File[]) => {
    if (disabled) return;

    const imageFiles = files.filter(isAcceptedImage);
    if (imageFiles.length === 0) return;

    setDragState("processing");

    const results: DroppedImage[] = [];
    for (const file of imageFiles) {
      if (file.size > MAX_FILE_SIZE) {
        addToast(`${file.name} exceeds 10 MB`, undefined, true);
        continue;
      }
      try {
        const dataUrl = await readAsDataUrl(file);
        const img: DroppedImage = { file, dataUrl, name: file.name };
        results.push(img);
        addToast(file.name, dataUrl);
      } catch {
        addToast(`Failed to read ${file.name}`, undefined, true);
      }
    }

    setDragState("idle");

    if (results.length > 0) {
      onImageDrop(results);
    }
  }, [disabled, onImageDrop, addToast]);

  // Drag handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragCountRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setDragState("dragover");
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setDragState("idle");
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current = 0;

    if (disabled) {
      setDragState("idle");
      return;
    }

    const files: File[] = [];
    if (e.dataTransfer.files) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        files.push(e.dataTransfer.files[i]);
      }
    }
    processFiles(files);
  }, [disabled, processFiles]);

  // Clipboard paste handler (Ctrl/Cmd+V with image data)
  useEffect(() => {
    if (disabled) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file" && isAcceptedImage(item.getAsFile()!)) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        processFiles(imageFiles);
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [disabled, processFiles]);

  return (
    <div
      className="idz-wrapper"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Drag-over overlay */}
      {dragState === "dragover" && (
        <div className="idz-overlay">
          <div className="idz-overlay-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <span className="idz-overlay-text">Drop images here</span>
          <span className="idz-overlay-hint">PNG, JPG, GIF, WebP, SVG (max 10 MB)</span>
        </div>
      )}

      {/* Processing overlay */}
      {dragState === "processing" && (
        <div className="idz-processing">
          <div className="idz-spinner" />
          <span className="idz-processing-text">Processing...</span>
        </div>
      )}

      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="idz-toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`idz-toast${t.error ? " idz-toast--error" : ""}${t.fading ? " idz-toast--fading" : ""}`}>
              {t.dataUrl ? (
                <img className="idz-toast-thumb" src={t.dataUrl} alt={t.name} />
              ) : t.error ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--error, #ef4444)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="6" />
                  <line x1="6" y1="6" x2="10" y2="10" />
                  <line x1="10" y1="6" x2="6" y2="10" />
                </svg>
              ) : null}
              <span className="idz-toast-name">{t.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ImagePreviewBar Component ───────────────────────────────

export function ImagePreviewBar({ images, onRemove }: ImagePreviewBarProps) {
  if (images.length === 0) return null;

  return (
    <div className="ipb-bar">
      {images.map((img, idx) => (
        <div key={`${img.name}-${idx}`} className="ipb-item" title={img.name}>
          <img className="ipb-thumb" src={img.dataUrl} alt={img.name} />
          <button
            type="button"
            className="ipb-remove"
            onClick={() => onRemove(idx)}
            title="Remove"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Exports ─────────────────────────────────────────────────

export default memo(ImageDropZone);
