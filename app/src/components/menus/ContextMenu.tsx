import {
  useState, useEffect, useRef, useCallback,
  type CSSProperties, type ReactNode,
} from "react";

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
  submenu?: MenuItem[];
}

export interface ContextMenuProps {
  items: MenuItem[];
  position: { x: number; y: number };
  onSelect: (itemId: string) => void;
  onClose: () => void;
}

const menuKeyframes = `
@keyframes ctxMenuFadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}
`;

function SubmenuArrow() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function MenuItemRow({ item, focused, onPointerEnter, onClick }: {
  item: MenuItem; focused: boolean; onPointerEnter: () => void; onClick: () => void;
}) {
  if (item.divider) {
    return (
      <div style={{ height: "1px", backgroundColor: "var(--color-border, #333)", margin: "4px 0" }} />
    );
  }

  const rowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "6px 12px",
    cursor: item.disabled ? "default" : "pointer",
    backgroundColor: focused && !item.disabled
      ? "var(--color-bg-hover, rgba(255,255,255,0.08))"
      : "transparent",
    color: item.disabled
      ? "var(--color-text-disabled, #555)"
      : item.danger
        ? "#ef4444"
        : "var(--color-text, #e0e0e0)",
    opacity: item.disabled ? 0.5 : 1,
    fontSize: "13px",
    borderRadius: "4px",
    margin: "0 4px",
    userSelect: "none",
    transition: "background-color 0.1s ease",
  };

  const dim = "var(--color-text-dim, #777)";
  const iconColor = item.disabled ? "var(--color-text-disabled, #555)" : item.danger ? "#ef4444" : "var(--color-text-dim, #999)";
  const iconSlot: CSSProperties = { width: "16px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: iconColor };
  const hintStyle: CSSProperties = { marginLeft: "auto", color: dim, fontSize: "11px", flexShrink: 0 };

  return (
    <div role="menuitem" aria-disabled={item.disabled || false}
      style={rowStyle} onPointerEnter={onPointerEnter}
      onClick={item.disabled ? undefined : onClick}
    >
      <span style={iconSlot}>{item.icon ?? null}</span>
      <span style={{ flex: 1, whiteSpace: "nowrap" }}>{item.label}</span>
      {item.shortcut && !item.submenu && (
        <span style={hintStyle}>{item.shortcut}</span>
      )}
      {item.submenu && item.submenu.length > 0 && (
        <span style={hintStyle}><SubmenuArrow /></span>
      )}
    </div>
  );
}

function MenuPanel({ items, position, onSelect, onClose, isSubmenu }: {
  items: MenuItem[];
  position: { x: number; y: number };
  onSelect: (itemId: string) => void;
  onClose: () => void;
  isSubmenu?: boolean;
}) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [submenuOpenId, setSubmenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [adjustedPos, setAdjustedPos] = useState(position);
  useEffect(() => {
    if (!menuRef.current) return;
    const r = menuRef.current.getBoundingClientRect();
    let { x, y } = position;
    if (x + r.width > window.innerWidth) x = window.innerWidth - r.width - 4;
    if (y + r.height > window.innerHeight) y = window.innerHeight - r.height - 4;
    setAdjustedPos({ x: Math.max(4, x), y: Math.max(4, y) });
  }, [position]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const skipDividers = (start: number, dir: 1 | -1) => {
      let n = start;
      while (n >= 0 && n < items.length && items[n].divider) n += dir;
      return n >= 0 && n < items.length ? n : start - dir;
    };
    if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation();
      submenuOpenId ? setSubmenuOpenId(null) : onClose(); return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((p) => skipDividers(p + 1, 1));
      setSubmenuOpenId(null); return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((p) => skipDividers(p - 1, -1));
      setSubmenuOpenId(null); return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const f = items[focusedIndex];
      if (f?.submenu?.length && !f.disabled) setSubmenuOpenId(f.id);
      return;
    }
    if (e.key === "ArrowLeft" && isSubmenu) { e.preventDefault(); onClose(); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      const f = items[focusedIndex];
      if (f && !f.disabled && !f.divider) {
        f.submenu?.length ? setSubmenuOpenId(f.id) : onSelect(f.id);
      }
    }
  }, [focusedIndex, items, onClose, onSelect, submenuOpenId, isSubmenu]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Close on outside click (root menu only)
  useEffect(() => {
    if (isSubmenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, isSubmenu]);

  // Cleanup hover delay timer
  useEffect(() => {
    return () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); };
  }, []);

  const panelStyle: CSSProperties = {
    position: "fixed",
    left: `${adjustedPos.x}px`,
    top: `${adjustedPos.y}px`,
    minWidth: "180px",
    backgroundColor: "var(--color-bg-surface, #1e1e1e)",
    border: "1px solid var(--color-border, #333)",
    borderRadius: "8px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
    padding: "4px 0",
    zIndex: 10000,
    animation: "ctxMenuFadeIn 0.12s ease-out",
  };

  function onItemPointerEnter(index: number, item: MenuItem) {
    setFocusedIndex(index);
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (item.submenu && item.submenu.length > 0 && !item.disabled) {
      hoverTimerRef.current = setTimeout(() => setSubmenuOpenId(item.id), 200);
    } else {
      hoverTimerRef.current = setTimeout(() => setSubmenuOpenId(null), 200);
    }
  }

  function onItemClick(item: MenuItem) {
    if (item.disabled) return;
    if (item.submenu && item.submenu.length > 0) {
      setSubmenuOpenId(item.id);
      return;
    }
    onSelect(item.id);
  }

  function getSubmenuPos(index: number): { x: number; y: number } {
    if (!menuRef.current) return { x: adjustedPos.x + 180, y: adjustedPos.y };
    const rect = menuRef.current.getBoundingClientRect();
    let y = rect.top + 4;
    for (let i = 0; i < index; i++) y += items[i].divider ? 9 : 30;
    return { x: rect.right - 2, y };
  }

  return (
    <div ref={menuRef} style={panelStyle} role="menu">
      {items.map((item, i) => (
        <div key={item.id} style={{ position: "relative" }}>
          <MenuItemRow
            item={item}
            focused={focusedIndex === i}
            onPointerEnter={() => onItemPointerEnter(i, item)}
            onClick={() => onItemClick(item)}
          />
          {submenuOpenId === item.id && item.submenu && item.submenu.length > 0 && (
            <MenuPanel
              items={item.submenu}
              position={getSubmenuPos(i)}
              onSelect={onSelect}
              onClose={() => setSubmenuOpenId(null)}
              isSubmenu
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function ContextMenu({ items, position, onSelect, onClose }: ContextMenuProps) {
  const handleSelect = useCallback((itemId: string) => {
    onSelect(itemId);
    onClose();
  }, [onSelect, onClose]);

  return (
    <>
      <style>{menuKeyframes}</style>
      <MenuPanel
        items={items}
        position={position}
        onSelect={handleSelect}
        onClose={onClose}
      />
    </>
  );
}
