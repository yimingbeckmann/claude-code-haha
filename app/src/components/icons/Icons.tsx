import type { ReactElement } from "react";

const S = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function SearchIcon() {
  return <svg {...S}><circle cx="7" cy="7" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/></svg>;
}

export function BugIcon() {
  return <svg {...S}><circle cx="8" cy="9" r="4"/><path d="M5.5 5.5L3 3M10.5 5.5L13 3"/><line x1="4" y1="9" x2="1" y2="9"/><line x1="12" y1="9" x2="15" y2="9"/><line x1="4.5" y1="12" x2="2.5" y2="14"/><line x1="11.5" y1="12" x2="13.5" y2="14"/><line x1="8" y1="5" x2="8" y2="3"/></svg>;
}

export function PlusIcon() {
  return <svg {...S}><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>;
}

export function TestIcon() {
  return <svg {...S}><path d="M6 2v4L4.5 9.5a3 3 0 105 0L8 6V2"/><line x1="5" y1="2" x2="9" y2="2"/><circle cx="7" cy="11" r="1"/></svg>;
}

export function RefactorIcon() {
  return <svg {...S}><polyline points="4 2 4 6 8 6"/><path d="M4 6L8 2"/><polyline points="12 14 12 10 8 10"/><path d="M12 10L8 14"/></svg>;
}

export function GearIcon() {
  return <svg {...S}><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.1 3.1l1 1M11.9 11.9l1 1M3.1 12.9l1-1M11.9 4.1l1-1"/></svg>;
}

export function FileIcon() {
  return <svg {...S}><path d="M4 2h5l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/><polyline points="9 2 9 6 13 6"/></svg>;
}

export function TerminalIcon() {
  return <svg {...S}><polyline points="4 6 7 8.5 4 11"/><line x1="9" y1="11" x2="12" y2="11"/></svg>;
}

export function EditIcon() {
  return <svg {...S}><path d="M11 2l3 3-9 9H2v-3z"/></svg>;
}

export function CopyIcon() {
  return <svg {...S}><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M5 11H3a1 1 0 01-1-1V3a1 1 0 011-1h7a1 1 0 011 1v2"/></svg>;
}

export function CheckIcon() {
  return <svg {...S}><polyline points="3 8 6.5 12 13 4"/></svg>;
}

export function XIcon() {
  return <svg {...S}><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>;
}

export function ChevronDown() {
  return <svg {...S}><polyline points="4 6 8 10 12 6"/></svg>;
}

export function ChevronRight() {
  return <svg {...S}><polyline points="6 4 10 8 6 12"/></svg>;
}

export function WarningIcon() {
  return <svg {...S}><path d="M8 1L15 14H1z" fill="none"/><line x1="8" y1="6" x2="8" y2="9"/><circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none"/></svg>;
}

const ICON_MAP: Record<string, () => ReactElement> = {
  search: SearchIcon,
  bug: BugIcon,
  plus: PlusIcon,
  test: TestIcon,
  refactor: RefactorIcon,
  gear: GearIcon,
  file: FileIcon,
  terminal: TerminalIcon,
  edit: EditIcon,
  copy: CopyIcon,
  check: CheckIcon,
  x: XIcon,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  warning: WarningIcon,
};

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const Comp = ICON_MAP[name];
  if (!Comp) return <span style={{ width: size, height: size, display: "inline-block" }} />;
  return <span style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Comp /></span>;
}
