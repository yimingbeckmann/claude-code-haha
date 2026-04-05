import { useState, useEffect, useCallback, useRef, memo } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InsightsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  rootPath: string;
}

interface LanguageStat {
  language: string;
  loc: number;
  files: number;
  color: string;
}

interface LargestFile {
  path: string;
  name: string;
  size: number;
  language: string;
}

interface ComplexityHotspot {
  path: string;
  name: string;
  complexity: number;
  lines: number;
}

interface CommitDay {
  date: string;
  count: number;
}

interface ActiveAuthor {
  name: string;
  commits: number;
}

interface CodeHotspot {
  path: string;
  name: string;
  changes: number;
}

interface DependencyGroup {
  ecosystem: string;
  count: number;
  icon: string;
}

interface InsightsData {
  overview: {
    totalFiles: number;
    totalLoc: number;
    repoSize: string;
    gitCommits: number;
    branches: number;
  };
  languages: LanguageStat[];
  largestFiles: LargestFile[];
  complexityHotspots: ComplexityHotspot[];
  recentActivity: CommitDay[];
  activeAuthors: ActiveAuthor[];
  codeHotspots: CodeHotspot[];
  dependencies: DependencyGroup[];
  techStack: string[];
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const CSS = `
.insights-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.6);
  display: flex; justify-content: flex-end; z-index: 9998;
  backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
}
.insights-panel {
  display: flex; flex-direction: column; width: 720px; max-width: 96vw;
  height: 100vh; background: var(--bg-primary, #0a0a0f);
  border-left: 1px solid var(--border, #2a2a36);
  box-shadow: -8px 0 30px rgba(0,0,0,.4);
  color: var(--text-primary, rgba(255,255,255,.9));
  font-family: var(--font-mono, "JetBrains Mono", "Fira Code", monospace);
  overflow: hidden; animation: insights-slide .2s ease-out;
}
@keyframes insights-slide {
  from { transform: translateX(100%); opacity: .8; }
  to   { transform: translateX(0); opacity: 1; }
}

/* Header */
.insights-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-bottom: 1px solid var(--border, #2a2a36); flex-shrink: 0;
}
.insights-header h2 {
  margin: 0; font-size: 15px; font-weight: 600;
  display: flex; align-items: center; gap: 8px;
}
.insights-header-actions {
  display: flex; align-items: center; gap: 8px;
}
.insights-close-btn {
  background: none; border: none; cursor: pointer; color: var(--text-secondary, #6a6a82);
  padding: 4px; display: flex; align-items: center; border-radius: 4px; transition: color .15s, background .15s;
}
.insights-close-btn:hover { color: var(--text-primary, #e4e4ed); background: var(--bg-hover, rgba(255,255,255,.06)); }

/* Refresh button */
.insights-refresh-btn {
  display: flex; align-items: center; gap: 6px;
  background: var(--bg-tertiary, #1a1a24); border: 1px solid var(--border, #2a2a36);
  color: var(--text-secondary, #9898b0); border-radius: 6px;
  padding: 5px 12px; font-size: 11px; font-weight: 500; cursor: pointer;
  font-family: var(--font-mono); transition: all .15s;
}
.insights-refresh-btn:hover { border-color: var(--accent, #e84520); color: var(--text-primary, #e4e4ed); }
.insights-refresh-btn:disabled { opacity: .4; cursor: default; }
.insights-refresh-btn svg.spinning { animation: insights-spin .8s linear infinite; }
@keyframes insights-spin { to { transform: rotate(360deg); } }

/* Scrollable body */
.insights-body {
  flex: 1; overflow-y: auto; padding: 16px 20px; min-height: 0;
}
.insights-body::-webkit-scrollbar { width: 5px; }
.insights-body::-webkit-scrollbar-track { background: transparent; }
.insights-body::-webkit-scrollbar-thumb { background: var(--border, #2a2a36); border-radius: 3px; }

/* Dashboard grid */
.insights-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.insights-grid-full {
  grid-column: 1 / -1;
}

/* Card base */
.insights-card {
  background: var(--bg-secondary, #12121a);
  border: 1px solid var(--border, #2a2a36);
  border-radius: 8px;
  padding: 14px 16px;
  transition: border-color .15s;
}
.insights-card:hover { border-color: var(--border-hover, #3a3a48); }

/* Section title */
.insights-section-title {
  font-size: 11px; font-weight: 700; color: var(--text-secondary, #6a6a82);
  text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px;
  display: flex; align-items: center; gap: 6px;
}
.insights-section-title svg { color: var(--accent, #e84520); flex-shrink: 0; }

/* Overview stat grid */
.insights-stat-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 12px;
}
.insights-stat {
  text-align: center;
}
.insights-stat-value {
  font-size: 20px; font-weight: 700; color: var(--text-primary, #e4e4ed);
  line-height: 1.2; font-variant-numeric: tabular-nums;
}
.insights-stat-label {
  font-size: 10px; color: var(--text-secondary, #9898b0); text-transform: uppercase;
  letter-spacing: .5px; margin-top: 2px;
}

/* Language bars */
.insights-lang-row {
  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
}
.insights-lang-label {
  font-size: 11px; color: var(--text-secondary, #9898b0); width: 80px;
  text-align: right; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;
}
.insights-lang-bar-wrap {
  flex: 1; height: 14px; background: var(--bg-tertiary, #1a1a24);
  border-radius: 3px; overflow: hidden; position: relative;
}
.insights-lang-bar {
  height: 100%; border-radius: 3px; transition: width .4s ease-out;
  min-width: 2px;
}
.insights-lang-count {
  font-size: 10px; color: var(--text-secondary, #9898b0); width: 56px;
  text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums;
}

/* Tables */
.insights-table {
  width: 100%; border-collapse: collapse; font-size: 11px;
}
.insights-table th {
  text-align: left; font-weight: 600; color: var(--text-secondary, #6a6a82);
  text-transform: uppercase; letter-spacing: .5px; font-size: 10px;
  padding: 4px 8px 6px; border-bottom: 1px solid var(--border, #2a2a36);
}
.insights-table td {
  padding: 5px 8px; color: var(--text-primary, rgba(255,255,255,.85));
  border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.04));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;
}
.insights-table tr:last-child td { border-bottom: none; }
.insights-table .rank {
  color: var(--text-secondary, #9898b0); font-variant-numeric: tabular-nums; width: 28px;
}
.insights-table .num {
  text-align: right; font-variant-numeric: tabular-nums; color: var(--accent-text, #ff7a50);
}

/* Mini bar chart (commits per day) */
.insights-mini-chart {
  display: flex; align-items: flex-end; gap: 3px; height: 56px; padding-top: 4px;
}
.insights-mini-bar-wrap {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
  min-width: 0;
}
.insights-mini-bar {
  width: 100%; background: var(--accent, #e84520); border-radius: 2px 2px 0 0;
  transition: height .3s ease-out; min-height: 0;
  opacity: .85;
}
.insights-mini-bar:hover { opacity: 1; }
.insights-mini-bar-label {
  font-size: 8px; color: var(--text-muted, rgba(255,255,255,.3));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;
  text-align: center;
}

/* Author list */
.insights-author-row {
  display: flex; align-items: center; gap: 8px; padding: 4px 0;
}
.insights-author-avatar {
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--bg-tertiary, #1a1a24); border: 1px solid var(--border, #2a2a36);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: var(--accent-text, #ff7a50);
  flex-shrink: 0; text-transform: uppercase;
}
.insights-author-name {
  flex: 1; font-size: 12px; color: var(--text-primary, #e4e4ed);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.insights-author-count {
  font-size: 11px; color: var(--text-secondary, #9898b0);
  font-variant-numeric: tabular-nums; flex-shrink: 0;
}

/* Hotspot list */
.insights-hotspot-row {
  display: flex; align-items: center; gap: 8px; padding: 4px 0;
  font-size: 11px;
}
.insights-hotspot-name {
  flex: 1; color: var(--text-primary, #e4e4ed);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.insights-hotspot-count {
  color: var(--accent-text, #ff7a50); font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

/* Dependencies */
.insights-dep-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
}
.insights-dep-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; background: var(--bg-tertiary, #1a1a24);
  border-radius: 6px; border: 1px solid var(--border-subtle, rgba(255,255,255,.04));
}
.insights-dep-icon {
  font-size: 14px; flex-shrink: 0; width: 20px; text-align: center;
}
.insights-dep-label {
  flex: 1; font-size: 11px; color: var(--text-primary, #e4e4ed);
}
.insights-dep-count {
  font-size: 11px; color: var(--accent-text, #ff7a50);
  font-weight: 600; font-variant-numeric: tabular-nums; flex-shrink: 0;
}

/* Tech stack badges */
.insights-badges {
  display: flex; flex-wrap: wrap; gap: 6px;
}
.insights-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px; font-size: 11px; font-weight: 500;
  background: var(--accent-dim, rgba(232,69,32,.15));
  color: var(--accent-text, #ff7a50);
  border-radius: 12px; border: 1px solid rgba(232,69,32,.2);
  white-space: nowrap;
}

/* Loading skeletons */
.insights-skeleton {
  background: linear-gradient(90deg, var(--bg-tertiary, #1a1a24) 25%, var(--bg-elevated, #1e1e2a) 50%, var(--bg-tertiary, #1a1a24) 75%);
  background-size: 200% 100%;
  animation: insights-shimmer 1.5s ease-in-out infinite;
  border-radius: 4px;
}
@keyframes insights-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.insights-skeleton-line {
  height: 12px; margin-bottom: 8px; border-radius: 4px;
}
.insights-skeleton-bar {
  height: 14px; margin-bottom: 6px; border-radius: 3px;
}
.insights-skeleton-stat {
  height: 32px; border-radius: 4px;
}

/* Empty / error state */
.insights-empty {
  text-align: center; padding: 40px 20px; color: var(--text-muted, rgba(255,255,255,.3));
  font-size: 12px;
}
.insights-empty-icon {
  font-size: 32px; margin-bottom: 8px; opacity: .3;
}

/* Root path subtitle */
.insights-root-path {
  font-size: 11px; color: var(--text-dim, rgba(255,255,255,.15));
  padding: 6px 20px; border-bottom: 1px solid var(--border, #2a2a36);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0;
}
`;

// ---------------------------------------------------------------------------
// Language color palette
// ---------------------------------------------------------------------------

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f0db4f",
  Python: "#3572a5",
  Rust: "#dea584",
  Go: "#00add8",
  Java: "#b07219",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  Ruby: "#cc342d",
  PHP: "#4f5d95",
  Swift: "#f05138",
  Kotlin: "#a97bff",
  Dart: "#00b4ab",
  Scala: "#c22d40",
  Shell: "#89e051",
  Bash: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
  SCSS: "#c6538c",
  JSON: "#cb8f36",
  YAML: "#cb171e",
  TOML: "#9c4221",
  Markdown: "#083fa1",
  SQL: "#e38c00",
  Lua: "#000080",
  Zig: "#ec915c",
  Elixir: "#6e4a7e",
  Haskell: "#5e5086",
  OCaml: "#3be133",
  Vue: "#41b883",
  Svelte: "#ff3e00",
};

function langColor(lang: string): string {
  return LANG_COLORS[lang] || "#6b7280";
}

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={spinning ? "spinning" : ""}>
      <path d="M1.5 8a6.5 6.5 0 0111.48-4.19" />
      <polyline points="13 1 13 4 10 4" />
      <path d="M14.5 8a6.5 6.5 0 01-11.48 4.19" />
      <polyline points="3 15 3 12 6 12" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="8" width="3" height="6" rx=".5" />
      <rect x="6.5" y="4" width="3" height="10" rx=".5" />
      <rect x="12" y="2" width="3" height="12" rx=".5" />
    </svg>
  );
}

function OverviewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="5 4 1 8 5 12" />
      <polyline points="11 4 15 8 11 12" />
      <line x1="9" y1="2" x2="7" y2="14" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 1.5h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1v-12a1 1 0 011-1z" />
      <polyline points="9 1.5 9 5.5 13 5.5" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.86 2.57a1.3 1.3 0 012.28 0l5.4 9.63A1.3 1.3 0 0113.4 14H2.6a1.3 1.3 0 01-1.14-1.8z" />
      <line x1="8" y1="6" x2="8" y2="9" />
      <circle cx="8" cy="11.5" r=".5" fill="currentColor" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 8 4 8 6 3 8 13 10 6 12 8 15 8" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1 13.5c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" />
      <circle cx="12" cy="5.5" r="1.8" />
      <path d="M12.5 9c1.8.3 3.2 1.8 3.2 3.5" />
    </svg>
  );
}

function FireIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1s-1.5 3-1.5 5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5c0-2-1.5-5-1.5-5z" />
      <path d="M4.5 6S3 8.5 3 10.5C3 13 5.24 15 8 15s5-2 5-4.5c0-2-1.5-4.5-1.5-4.5S10 8 10 9.5A2 2 0 018 11.5 2 2 0 016 9.5c0-1.5 1.5-3.5 1.5-3.5" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1L1.5 4.5v7L8 15l6.5-3.5v-7L8 1z" />
      <line x1="8" y1="8" x2="8" y2="15" />
      <polyline points="1.5 4.5 8 8 14.5 4.5" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 4l7-3 7 3-7 3-7-3z" />
      <path d="M1 8l7 3 7-3" />
      <path d="M1 12l7 3 7-3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

function basename(p: string): string {
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || p;
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function SkeletonCard({ lines, full }: { lines: number; full?: boolean }) {
  return (
    <div className={`insights-card${full ? " insights-grid-full" : ""}`}>
      <div className="insights-skeleton insights-skeleton-line" style={{ width: "40%" }} />
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="insights-skeleton insights-skeleton-bar"
          style={{ width: `${60 + Math.random() * 40}%`, animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="insights-grid">
      <div className="insights-card insights-grid-full">
        <div className="insights-skeleton insights-skeleton-line" style={{ width: "30%" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="insights-skeleton insights-skeleton-stat" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      </div>
      <SkeletonCard lines={6} full />
      <SkeletonCard lines={5} />
      <SkeletonCard lines={5} />
      <SkeletonCard lines={3} full />
      <SkeletonCard lines={4} />
      <SkeletonCard lines={4} />
      <SkeletonCard lines={3} full />
      <SkeletonCard lines={2} full />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchInsights(apiBase: string, rootPath: string, signal?: AbortSignal): Promise<InsightsData> {
  const res = await fetch(`${apiBase}/insights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: rootPath }),
    signal,
  });

  if (res.ok) {
    const data = await res.json();
    return normalizeData(data);
  }

  // If the endpoint doesn't exist yet, fall back to filesystem-based analysis
  return analyzeFromFilesystem(apiBase, rootPath, signal);
}

async function analyzeFromFilesystem(apiBase: string, rootPath: string, signal?: AbortSignal): Promise<InsightsData> {
  let files: Array<{ name: string; path: string; size: number; isDirectory: boolean }> = [];
  let gitInfo = {
    commits: 0,
    branches: 0,
    authors: [] as ActiveAuthor[],
    recentActivity: [] as CommitDay[],
    hotspots: [] as CodeHotspot[],
  };

  try {
    const fsRes = await fetch(`${apiBase}/filesystem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list-recursive", path: rootPath }),
      signal,
    });
    if (fsRes.ok) {
      const data = await fsRes.json();
      files = Array.isArray(data) ? data : (data.entries ?? data.files ?? []);
    }
  } catch { /* proceed with empty */ }

  try {
    const gitRes = await fetch(`${apiBase}/git-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: rootPath }),
      signal,
    });
    if (gitRes.ok) {
      gitInfo = await gitRes.json();
    }
  } catch { /* proceed with empty */ }

  const langMap = new Map<string, { loc: number; files: number }>();
  const onlyFiles = files.filter((f) => !f.isDirectory);
  let totalLoc = 0;
  let totalSize = 0;

  for (const f of onlyFiles) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    const lang = extToLang(ext);
    if (!lang) continue;
    const est = langMap.get(lang) || { loc: 0, files: 0 };
    const estimatedLoc = Math.max(1, Math.round(f.size / 35));
    est.loc += estimatedLoc;
    est.files += 1;
    totalLoc += estimatedLoc;
    totalSize += f.size;
    langMap.set(lang, est);
  }

  const languages: LanguageStat[] = Array.from(langMap.entries())
    .map(([language, stat]) => ({ language, loc: stat.loc, files: stat.files, color: langColor(language) }))
    .sort((a, b) => b.loc - a.loc)
    .slice(0, 12);

  const largestFiles: LargestFile[] = onlyFiles
    .sort((a, b) => b.size - a.size)
    .slice(0, 10)
    .map((f) => ({
      path: f.path,
      name: basename(f.path || f.name),
      size: f.size,
      language: extToLang(f.name.split(".").pop()?.toLowerCase() ?? "") || "Other",
    }));

  const allNames = new Set(files.map((f) => basename(f.path || f.name).toLowerCase()));
  const techStack = detectTechStack(allNames);
  const dependencies = detectDependencies(allNames, onlyFiles);

  const complexityHotspots: ComplexityHotspot[] = onlyFiles
    .filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      return ["ts", "tsx", "js", "jsx", "py", "rs", "go", "java", "c", "cpp", "rb", "php", "swift", "kt"].includes(ext);
    })
    .sort((a, b) => b.size - a.size)
    .slice(0, 10)
    .map((f) => ({
      path: f.path,
      name: basename(f.path || f.name),
      complexity: Math.round(f.size / 25),
      lines: Math.round(f.size / 35),
    }));

  return {
    overview: {
      totalFiles: onlyFiles.length,
      totalLoc,
      repoSize: formatSize(totalSize),
      gitCommits: gitInfo.commits || 0,
      branches: gitInfo.branches || 0,
    },
    languages,
    largestFiles,
    complexityHotspots,
    recentActivity: gitInfo.recentActivity || generatePlaceholderActivity(),
    activeAuthors: gitInfo.authors || [],
    codeHotspots: gitInfo.hotspots || [],
    dependencies,
    techStack,
  };
}

function normalizeData(raw: any): InsightsData {
  return {
    overview: {
      totalFiles: raw.overview?.totalFiles ?? 0,
      totalLoc: raw.overview?.totalLoc ?? 0,
      repoSize: raw.overview?.repoSize ?? "0 B",
      gitCommits: raw.overview?.gitCommits ?? 0,
      branches: raw.overview?.branches ?? 0,
    },
    languages: (raw.languages ?? []).map((l: any) => ({
      ...l,
      color: l.color || langColor(l.language),
    })),
    largestFiles: raw.largestFiles ?? [],
    complexityHotspots: raw.complexityHotspots ?? [],
    recentActivity: raw.recentActivity ?? [],
    activeAuthors: raw.activeAuthors ?? [],
    codeHotspots: raw.codeHotspots ?? [],
    dependencies: raw.dependencies ?? [],
    techStack: raw.techStack ?? [],
  };
}

function extToLang(ext: string): string | null {
  const map: Record<string, string> = {
    ts: "TypeScript", tsx: "TypeScript",
    js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
    py: "Python", pyi: "Python",
    rs: "Rust",
    go: "Go",
    java: "Java",
    c: "C", h: "C",
    cpp: "C++", cc: "C++", cxx: "C++", hpp: "C++",
    cs: "C#",
    rb: "Ruby",
    php: "PHP",
    swift: "Swift",
    kt: "Kotlin", kts: "Kotlin",
    dart: "Dart",
    scala: "Scala",
    sh: "Shell", bash: "Shell", zsh: "Shell",
    html: "HTML", htm: "HTML",
    css: "CSS",
    scss: "SCSS",
    json: "JSON",
    yaml: "YAML", yml: "YAML",
    toml: "TOML",
    md: "Markdown", mdx: "Markdown",
    sql: "SQL",
    lua: "Lua",
    zig: "Zig",
    ex: "Elixir", exs: "Elixir",
    hs: "Haskell",
    ml: "OCaml", mli: "OCaml",
    vue: "Vue",
    svelte: "Svelte",
  };
  return map[ext] || null;
}

function detectTechStack(names: Set<string>): string[] {
  const stack: string[] = [];
  const checks: [string[], string][] = [
    [["package.json"], "Node.js"],
    [["tsconfig.json"], "TypeScript"],
    [["next.config.js", "next.config.ts", "next.config.mjs"], "Next.js"],
    [["vite.config.ts", "vite.config.js", "vite.config.mjs"], "Vite"],
    [["webpack.config.js", "webpack.config.ts"], "Webpack"],
    [["tailwind.config.js", "tailwind.config.ts"], "Tailwind CSS"],
    [["cargo.toml"], "Rust/Cargo"],
    [["go.mod"], "Go"],
    [["requirements.txt", "pyproject.toml", "setup.py", "pipfile"], "Python"],
    [["gemfile"], "Ruby"],
    [["pom.xml", "build.gradle", "build.gradle.kts"], "Java/JVM"],
    [["pubspec.yaml"], "Flutter/Dart"],
    [["docker-compose.yml", "docker-compose.yaml", "dockerfile"], "Docker"],
    [[".github"], "GitHub Actions"],
    [["vercel.json"], "Vercel"],
    [["netlify.toml"], "Netlify"],
    [[".eslintrc.js", ".eslintrc.json", "eslint.config.js", "eslint.config.mjs"], "ESLint"],
    [["jest.config.js", "jest.config.ts", "vitest.config.ts", "vitest.config.js"], "Testing"],
    [["prisma"], "Prisma"],
    [[".env", ".env.local", ".env.example"], "Env Config"],
  ];

  for (const [fileNames, label] of checks) {
    if (fileNames.some((f) => names.has(f))) {
      stack.push(label);
    }
  }
  return stack;
}

function detectDependencies(names: Set<string>, files: Array<{ name: string; size: number }>): DependencyGroup[] {
  const deps: DependencyGroup[] = [];

  if (names.has("package.json")) {
    const pkg = files.find((f) => basename(f.name).toLowerCase() === "package.json");
    const est = pkg ? Math.max(1, Math.round(pkg.size / 80)) : 0;
    deps.push({ ecosystem: "npm", count: est, icon: "npm" });
  }
  if (names.has("requirements.txt") || names.has("pyproject.toml")) {
    const req = files.find((f) => {
      const n = basename(f.name).toLowerCase();
      return n === "requirements.txt" || n === "pyproject.toml";
    });
    const est = req ? Math.max(1, Math.round(req.size / 30)) : 0;
    deps.push({ ecosystem: "pip", count: est, icon: "pip" });
  }
  if (names.has("cargo.toml")) {
    const cargo = files.find((f) => basename(f.name).toLowerCase() === "cargo.toml");
    const est = cargo ? Math.max(1, Math.round(cargo.size / 60)) : 0;
    deps.push({ ecosystem: "cargo", count: est, icon: "cargo" });
  }
  if (names.has("go.mod")) {
    const gomod = files.find((f) => basename(f.name).toLowerCase() === "go.mod");
    const est = gomod ? Math.max(1, Math.round(gomod.size / 50)) : 0;
    deps.push({ ecosystem: "go mod", count: est, icon: "go" });
  }
  if (names.has("gemfile")) {
    const gem = files.find((f) => basename(f.name).toLowerCase() === "gemfile");
    const est = gem ? Math.max(1, Math.round(gem.size / 40)) : 0;
    deps.push({ ecosystem: "gems", count: est, icon: "gem" });
  }
  if (names.has("pom.xml") || names.has("build.gradle") || names.has("build.gradle.kts")) {
    deps.push({ ecosystem: "maven/gradle", count: 0, icon: "java" });
  }
  if (names.has("pubspec.yaml")) {
    const pub = files.find((f) => basename(f.name).toLowerCase() === "pubspec.yaml");
    const est = pub ? Math.max(1, Math.round(pub.size / 40)) : 0;
    deps.push({ ecosystem: "pub", count: est, icon: "dart" });
  }

  return deps;
}

function generatePlaceholderActivity(): CommitDay[] {
  const days: CommitDay[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  return days;
}

const DEP_ICONS: Record<string, string> = {
  npm: "\u{1F4E6}",
  pip: "\u{1F40D}",
  cargo: "\u2699\uFE0F",
  go: "\u{1F439}",
  gem: "\u{1F48E}",
  java: "\u2615",
  dart: "\u{1F3AF}",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OverviewCard({ data }: { data: InsightsData["overview"] }) {
  return (
    <div className="insights-card insights-grid-full">
      <div className="insights-section-title"><OverviewIcon /> Project Overview</div>
      <div className="insights-stat-grid">
        <div className="insights-stat">
          <div className="insights-stat-value">{formatNumber(data.totalFiles)}</div>
          <div className="insights-stat-label">Files</div>
        </div>
        <div className="insights-stat">
          <div className="insights-stat-value">{formatNumber(data.totalLoc)}</div>
          <div className="insights-stat-label">Lines of Code</div>
        </div>
        <div className="insights-stat">
          <div className="insights-stat-value">{data.repoSize}</div>
          <div className="insights-stat-label">Repo Size</div>
        </div>
        <div className="insights-stat">
          <div className="insights-stat-value">{formatNumber(data.gitCommits)}</div>
          <div className="insights-stat-label">Commits</div>
        </div>
        <div className="insights-stat">
          <div className="insights-stat-value">{data.branches}</div>
          <div className="insights-stat-label">Branches</div>
        </div>
      </div>
    </div>
  );
}

function LanguageBreakdown({ languages }: { languages: LanguageStat[] }) {
  const maxLoc = languages.length > 0 ? languages[0].loc : 1;
  return (
    <div className="insights-card insights-grid-full">
      <div className="insights-section-title"><CodeIcon /> Language Breakdown</div>
      {languages.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No source files detected</div>
      ) : (
        languages.map((l) => (
          <div key={l.language} className="insights-lang-row">
            <span className="insights-lang-label" title={l.language}>{l.language}</span>
            <div className="insights-lang-bar-wrap">
              <div
                className="insights-lang-bar"
                style={{ width: `${Math.max(2, (l.loc / maxLoc) * 100)}%`, background: l.color }}
              />
            </div>
            <span className="insights-lang-count">{formatNumber(l.loc)}</span>
          </div>
        ))
      )}
    </div>
  );
}

function LargestFilesTable({ files }: { files: LargestFile[] }) {
  return (
    <div className="insights-card">
      <div className="insights-section-title"><FileIcon /> Largest Files</div>
      {files.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No data</div>
      ) : (
        <table className="insights-table">
          <thead>
            <tr>
              <th>#</th>
              <th>File</th>
              <th style={{ textAlign: "right" }}>Size</th>
              <th>Lang</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f, i) => (
              <tr key={f.path}>
                <td className="rank">{i + 1}</td>
                <td title={f.path}>{f.name}</td>
                <td className="num">{formatSize(f.size)}</td>
                <td>{f.language}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ComplexityTable({ hotspots }: { hotspots: ComplexityHotspot[] }) {
  return (
    <div className="insights-card">
      <div className="insights-section-title"><AlertIcon /> Complexity Hotspots</div>
      {hotspots.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No data</div>
      ) : (
        <table className="insights-table">
          <thead>
            <tr>
              <th>#</th>
              <th>File</th>
              <th style={{ textAlign: "right" }}>Score</th>
              <th style={{ textAlign: "right" }}>Lines</th>
            </tr>
          </thead>
          <tbody>
            {hotspots.map((h, i) => (
              <tr key={h.path}>
                <td className="rank">{i + 1}</td>
                <td title={h.path}>{h.name}</td>
                <td className="num">{h.complexity}</td>
                <td className="num">{formatNumber(h.lines)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RecentActivityChart({ activity }: { activity: CommitDay[] }) {
  const maxCount = Math.max(1, ...activity.map((d) => d.count));
  return (
    <div className="insights-card insights-grid-full">
      <div className="insights-section-title"><ActivityIcon /> Recent Activity (14 days)</div>
      <div className="insights-mini-chart">
        {activity.map((d) => (
          <div key={d.date} className="insights-mini-bar-wrap" title={`${d.date}: ${d.count} commits`}>
            <div
              className="insights-mini-bar"
              style={{ height: d.count > 0 ? `${Math.max(4, (d.count / maxCount) * 100)}%` : "0" }}
            />
            <span className="insights-mini-bar-label">{shortDate(d.date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActiveAuthorsList({ authors }: { authors: ActiveAuthor[] }) {
  return (
    <div className="insights-card">
      <div className="insights-section-title"><UsersIcon /> Active Authors</div>
      {authors.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No git history</div>
      ) : (
        authors.slice(0, 8).map((a) => (
          <div key={a.name} className="insights-author-row">
            <span className="insights-author-avatar">{a.name.charAt(0)}</span>
            <span className="insights-author-name">{a.name}</span>
            <span className="insights-author-count">{a.commits} commits</span>
          </div>
        ))
      )}
    </div>
  );
}

function CodeHotspotsList({ hotspots }: { hotspots: CodeHotspot[] }) {
  return (
    <div className="insights-card">
      <div className="insights-section-title"><FireIcon /> Code Hotspots</div>
      {hotspots.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No git history</div>
      ) : (
        hotspots.slice(0, 8).map((h) => (
          <div key={h.path} className="insights-hotspot-row">
            <span className="insights-hotspot-name" title={h.path}>{h.name}</span>
            <span className="insights-hotspot-count">{h.changes} changes</span>
          </div>
        ))
      )}
    </div>
  );
}

function DependenciesCard({ dependencies }: { dependencies: DependencyGroup[] }) {
  return (
    <div className="insights-card insights-grid-full">
      <div className="insights-section-title"><PackageIcon /> Dependencies</div>
      {dependencies.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No dependency files detected</div>
      ) : (
        <div className="insights-dep-grid">
          {dependencies.map((d) => (
            <div key={d.ecosystem} className="insights-dep-item">
              <span className="insights-dep-icon">{DEP_ICONS[d.icon] || "\u{1F4E6}"}</span>
              <span className="insights-dep-label">{d.ecosystem}</span>
              <span className="insights-dep-count">{d.count > 0 ? `~${d.count}` : "--"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TechStackCard({ stack }: { stack: string[] }) {
  return (
    <div className="insights-card insights-grid-full">
      <div className="insights-section-title"><StackIcon /> Tech Stack</div>
      {stack.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No frameworks detected</div>
      ) : (
        <div className="insights-badges">
          {stack.map((s) => (
            <span key={s} className="insights-badge">{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function InsightsPanel({ isOpen, onClose, apiBase, rootPath }: InsightsPanelProps) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  // Inject styles
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

  // Fetch data
  const analyze = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);

    fetchInsights(apiBase, rootPath, ac.signal)
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message || "Analysis failed");
        setLoading(false);
      });
  }, [apiBase, rootPath]);

  // Auto-analyze on open
  useEffect(() => {
    if (!isOpen) return;
    analyze();
    return () => { abortRef.current?.abort(); };
  }, [isOpen, analyze]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="insights-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="insights-panel" role="dialog" aria-label="Codebase Insights">

          {/* Header */}
          <div className="insights-header">
            <h2><ChartIcon /> Codebase Insights</h2>
            <div className="insights-header-actions">
              <button
                className="insights-refresh-btn"
                onClick={analyze}
                disabled={loading}
                title="Re-analyze codebase"
              >
                <RefreshIcon spinning={loading} /> {loading ? "Analyzing..." : "Refresh"}
              </button>
              <button className="insights-close-btn" onClick={onClose} aria-label="Close">
                <CloseIcon />
              </button>
            </div>
          </div>

          {/* Root path */}
          <div className="insights-root-path" title={rootPath}>{rootPath}</div>

          {/* Body */}
          <div className="insights-body">
            {error && !data && (
              <div className="insights-empty">
                <div className="insights-empty-icon" style={{ color: "var(--error)" }}>!</div>
                <div style={{ color: "var(--error-text)" }}>{error}</div>
                <div style={{ marginTop: 8 }}>
                  <button className="insights-refresh-btn" onClick={analyze}>
                    <RefreshIcon /> Retry
                  </button>
                </div>
              </div>
            )}

            {loading && !data && <LoadingSkeleton />}

            {data && (
              <div className="insights-grid">
                <OverviewCard data={data.overview} />
                <LanguageBreakdown languages={data.languages} />
                <LargestFilesTable files={data.largestFiles} />
                <ComplexityTable hotspots={data.complexityHotspots} />
                <RecentActivityChart activity={data.recentActivity} />
                <ActiveAuthorsList authors={data.activeAuthors} />
                <CodeHotspotsList hotspots={data.codeHotspots} />
                <DependenciesCard dependencies={data.dependencies} />
                <TechStackCard stack={data.techStack} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default memo(InsightsPanel);
