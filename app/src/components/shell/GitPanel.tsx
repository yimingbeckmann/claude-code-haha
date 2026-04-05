import { useState, useEffect, useCallback, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GitFile {
  path: string;
  indexStatus: string;   // status in the index (staged)
  workStatus: string;    // status in the working tree
  staged: boolean;
}

interface Commit {
  hash: string;
  message: string;
  date: string;
}

interface BranchInfo {
  name: string;
  ahead: number;
  behind: number;
  hasUpstream: boolean;
}

// ---------------------------------------------------------------------------
// Colors / style tokens
// ---------------------------------------------------------------------------

const ACCENT = "#f97316";
const SUCCESS = "#22c55e";
const ERROR = "#ef4444";
const MODIFIED_COLOR = "#eab308";
const UNTRACKED_COLOR = "#6b7280";
const BG_DARK = "#1a1a2e";
const BG_PANEL = "#16213e";
const BG_SURFACE = "#0f3460";
const TEXT = "#e2e8f0";
const TEXT_MUTED = "#94a3b8";
const BORDER = "#1e3a5f";

// ---------------------------------------------------------------------------
// Bridge helper
// ---------------------------------------------------------------------------

async function gitExec(
  command: string,
  cwd?: string,
): Promise<{ stdout: string; stderr: string }> {
  const API =
    (window as any).__CLAW_CONFIG__?.apiBase || "http://127.0.0.1:8899";
  const res = await fetch(`${API}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, cwd: cwd || "~" }),
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

function parseStatusLine(line: string): GitFile | null {
  // git status --porcelain format: XY PATH
  if (line.length < 4) return null;
  const indexStatus = line[0];
  const workStatus = line[1];
  const path = line.slice(3);
  // Staged if index has M/A/D/R/C and work tree is clean or also modified
  const staged =
    indexStatus !== " " && indexStatus !== "?" && indexStatus !== "!";
  return { path, indexStatus, workStatus, staged };
}

function statusLabel(s: string): string {
  switch (s) {
    case "M": return "~";   // modified
    case "A": return "+";   // added
    case "D": return "-";   // deleted
    case "R": return "R";   // renamed
    case "C": return "C";   // copied
    case "?": return "?";   // untracked
    case "!": return "!";   // ignored
    default: return s.trim() || " ";
  }
}

function statusColor(s: string): string {
  switch (s) {
    case "M": return MODIFIED_COLOR;
    case "A": return SUCCESS;
    case "D": return ERROR;
    case "?": return UNTRACKED_COLOR;
    default: return TEXT_MUTED;
  }
}

function badgeBg(s: string): string {
  return statusColor(s) + "22";
}

// ---------------------------------------------------------------------------
// Diff parser -- turns raw unified diff into renderable rows
// ---------------------------------------------------------------------------

interface DiffRow {
  type: "add" | "del" | "ctx" | "hunk" | "header";
  content: string;
  oldNum?: number;
  newNum?: number;
}

function parseDiff(raw: string): DiffRow[] {
  const rows: DiffRow[] = [];
  const lines = raw.split("\n");
  let oldNum = 0;
  let newNum = 0;
  for (const line of lines) {
    if (line.startsWith("@@")) {
      // parse hunk header: @@ -A,B +C,D @@
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldNum = parseInt(m[1], 10);
        newNum = parseInt(m[2], 10);
      }
      rows.push({ type: "hunk", content: line });
    } else if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff ") || line.startsWith("index ")) {
      rows.push({ type: "header", content: line });
    } else if (line.startsWith("+")) {
      rows.push({ type: "add", content: line.slice(1), newNum });
      newNum++;
    } else if (line.startsWith("-")) {
      rows.push({ type: "del", content: line.slice(1), oldNum });
      oldNum++;
    } else {
      // context line (starts with space or is empty)
      rows.push({ type: "ctx", content: line.startsWith(" ") ? line.slice(1) : line, oldNum, newNum });
      oldNum++;
      newNum++;
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  overlay: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    zIndex: 1000,
    display: "flex",
    justifyContent: "flex-end",
  },
  panel: {
    width: 520,
    maxWidth: "100vw",
    height: "100vh",
    background: BG_DARK,
    borderLeft: `1px solid ${BORDER}`,
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    animation: "slideInRight 0.2s ease-out",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: `1px solid ${BORDER}`,
    background: BG_PANEL,
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    overflow: "hidden",
  },
  branchIcon: {
    fontSize: 16,
    color: ACCENT,
    flexShrink: 0,
  },
  branchName: {
    fontSize: 14,
    fontWeight: 600 as const,
    color: TEXT,
    fontFamily: "monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  trackingBadge: {
    fontSize: 11,
    fontFamily: "monospace",
    padding: "2px 6px",
    borderRadius: 4,
    flexShrink: 0,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: TEXT_MUTED,
    fontSize: 18,
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 4,
    lineHeight: 1,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    overflowY: "auto" as const,
    padding: 16,
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
  },
  section: {
    background: BG_PANEL,
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    overflow: "hidden",
  },
  sectionHeader: {
    padding: "8px 12px",
    fontSize: 11,
    fontWeight: 700 as const,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: TEXT_MUTED,
    borderBottom: `1px solid ${BORDER}`,
    background: BG_SURFACE,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fileRow: {
    display: "flex",
    alignItems: "center",
    padding: "6px 12px",
    cursor: "pointer",
    gap: 8,
    borderBottom: `1px solid ${BORDER}22`,
    transition: "background 0.15s",
    fontSize: 13,
    fontFamily: "monospace",
  },
  statusBadge: {
    width: 20,
    height: 20,
    borderRadius: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 700 as const,
    flexShrink: 0,
  },
  filePath: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  stageBtn: {
    background: "none",
    border: `1px solid ${BORDER}`,
    color: TEXT_MUTED,
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 4,
    cursor: "pointer",
    flexShrink: 0,
    transition: "all 0.15s",
  },
  diffViewer: {
    background: "#0d1117",
    borderRadius: 0,
    overflow: "auto",
    maxHeight: 360,
    borderTop: `1px solid ${BORDER}`,
  },
  diffHeader: {
    padding: "6px 12px",
    fontSize: 12,
    color: TEXT_MUTED,
    borderBottom: `1px solid ${BORDER}`,
    fontFamily: "monospace",
    background: BG_SURFACE,
  },
  textarea: {
    width: "100%",
    minHeight: 72,
    background: BG_SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    color: TEXT,
    fontSize: 13,
    fontFamily: "monospace",
    padding: "8px 12px",
    resize: "vertical" as const,
    outline: "none",
    boxSizing: "border-box" as const,
  },
  commitBtnRow: {
    display: "flex",
    gap: 8,
  },
  commitBtn: {
    flex: 1,
    padding: "10px 16px",
    borderRadius: 6,
    border: "none",
    fontSize: 13,
    fontWeight: 600 as const,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  actionRow: {
    display: "flex",
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    padding: "8px 12px",
    borderRadius: 6,
    border: `1px solid ${BORDER}`,
    background: BG_SURFACE,
    color: TEXT,
    fontSize: 13,
    fontWeight: 500 as const,
    cursor: "pointer",
    transition: "all 0.15s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  commitItem: {
    padding: "8px 12px",
    borderBottom: `1px solid ${BORDER}22`,
    fontSize: 12,
    fontFamily: "monospace",
  },
  commitHash: {
    color: ACCENT,
    marginRight: 8,
  },
  commitMsg: {
    color: TEXT,
  },
  commitDate: {
    color: TEXT_MUTED,
    fontSize: 11,
    marginTop: 2,
  },
  emptyState: {
    padding: "16px 12px",
    color: TEXT_MUTED,
    fontSize: 12,
    textAlign: "center" as const,
  },
  errorBanner: {
    padding: "8px 12px",
    background: `${ERROR}18`,
    color: ERROR,
    fontSize: 12,
    fontFamily: "monospace",
    borderRadius: 6,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const,
  },
  loadingDot: {
    display: "inline-block",
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: ACCENT,
    marginRight: 6,
    animation: "pulse 1s ease-in-out infinite",
  },
};

// Diff row styles
function diffRowStyle(
  type: DiffRow["type"],
): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 1.5,
    whiteSpace: "pre",
    padding: "0 8px",
  };
  switch (type) {
    case "add":
      return { ...base, background: "rgba(34,197,94,0.10)", color: SUCCESS };
    case "del":
      return { ...base, background: "rgba(239,68,68,0.10)", color: ERROR };
    case "hunk":
      return { ...base, background: "rgba(100,100,180,0.08)", color: "#67e8f9" };
    case "header":
      return { ...base, color: TEXT_MUTED, fontStyle: "italic" };
    default:
      return { ...base, color: TEXT_MUTED };
  }
}

function diffPrefix(type: DiffRow["type"]): string {
  switch (type) {
    case "add": return "+";
    case "del": return "-";
    case "hunk": return "";
    case "header": return "";
    default: return " ";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GitPanel({ isOpen, onClose }: GitPanelProps) {
  // -- state ----------------------------------------------------------------
  const [branch, setBranch] = useState<BranchInfo>({
    name: "",
    ahead: 0,
    behind: 0,
    hasUpstream: false,
  });
  const [files, setFiles] = useState<GitFile[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedStaged, setSelectedStaged] = useState<boolean>(false);
  const [diffContent, setDiffContent] = useState<DiffRow[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -- derived --------------------------------------------------------------
  const stagedFiles = files.filter((f) => f.staged);
  const unstagedFiles = files.filter((f) => !f.staged);
  const canCommit = stagedFiles.length > 0 && commitMessage.trim().length > 0;

  // -- data fetching --------------------------------------------------------

  const refresh = useCallback(async () => {
    try {
      const [branchRes, statusRes, logRes] = await Promise.all([
        gitExec("git branch --show-current"),
        gitExec("git status --porcelain"),
        gitExec('git log --format="%h|%s|%cr" -10'),
      ]);

      // Branch
      const branchName = branchRes.stdout.trim();
      let ahead = 0;
      let behind = 0;
      let hasUpstream = false;
      if (branchName) {
        try {
          const upRes = await gitExec(
            "git rev-list --left-right --count HEAD...@{upstream}",
          );
          if (upRes.stdout.trim()) {
            const parts = upRes.stdout.trim().split(/\s+/);
            ahead = parseInt(parts[0], 10) || 0;
            behind = parseInt(parts[1], 10) || 0;
            hasUpstream = true;
          }
        } catch {
          // no upstream configured
        }
      }
      setBranch({ name: branchName || "(detached)", ahead, behind, hasUpstream });

      // Status
      const statusLines = statusRes.stdout
        .split("\n")
        .filter((l) => l.length > 0);
      const parsed: GitFile[] = [];
      for (const line of statusLines) {
        const f = parseStatusLine(line);
        if (!f) continue;
        // A file can appear both staged and unstaged (e.g. "MM")
        if (
          f.indexStatus !== " " &&
          f.indexStatus !== "?" &&
          f.workStatus !== " " &&
          f.workStatus !== "?"
        ) {
          // both staged and working tree change -- show two entries
          parsed.push({ ...f, staged: true });
          parsed.push({
            ...f,
            staged: false,
            indexStatus: f.workStatus,
          });
        } else if (f.indexStatus === "?" && f.workStatus === "?") {
          parsed.push({ path: f.path, indexStatus: "?", workStatus: "?", staged: false });
        } else {
          parsed.push(f);
        }
      }
      setFiles(parsed);

      // Log
      const logLines = logRes.stdout
        .split("\n")
        .filter((l) => l.length > 0);
      setCommits(
        logLines.map((l) => {
          const [hash, ...rest] = l.split("|");
          const date = rest.pop() || "";
          const message = rest.join("|");
          return { hash: hash.trim(), message: message.trim(), date: date.trim() };
        }),
      );

      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to fetch git status");
    }
  }, []);

  // -- poll on mount / unmount -----------------------------------------------

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    refresh().finally(() => setLoading(false));
    pollRef.current = setInterval(refresh, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isOpen, refresh]);

  // -- diff loading -----------------------------------------------------------

  const loadDiff = useCallback(
    async (path: string, staged: boolean) => {
      setDiffLoading(true);
      try {
        const cmd = staged
          ? `git diff --staged -- "${path}"`
          : `git diff -- "${path}"`;
        const res = await gitExec(cmd);
        const raw = res.stdout || res.stderr || "";
        if (raw.trim()) {
          setDiffContent(parseDiff(raw));
        } else {
          // For untracked files, show the whole file as added
          if (!staged) {
            const catRes = await gitExec(`cat "${path}"`);
            if (catRes.stdout) {
              const lines = catRes.stdout.split("\n");
              setDiffContent(
                lines.map((l, i) => ({
                  type: "add" as const,
                  content: l,
                  newNum: i + 1,
                })),
              );
            } else {
              setDiffContent([]);
            }
          } else {
            setDiffContent([]);
          }
        }
      } catch {
        setDiffContent([]);
      } finally {
        setDiffLoading(false);
      }
    },
    [],
  );

  const handleFileClick = useCallback(
    (path: string, staged: boolean) => {
      if (selectedFile === path && selectedStaged === staged) {
        setSelectedFile(null);
        setDiffContent([]);
      } else {
        setSelectedFile(path);
        setSelectedStaged(staged);
        loadDiff(path, staged);
      }
    },
    [selectedFile, selectedStaged, loadDiff],
  );

  // -- git actions -----------------------------------------------------------

  const stageFile = useCallback(
    async (path: string) => {
      setActionInProgress(`stage:${path}`);
      await gitExec(`git add -- "${path}"`);
      await refresh();
      setActionInProgress(null);
    },
    [refresh],
  );

  const unstageFile = useCallback(
    async (path: string) => {
      setActionInProgress(`unstage:${path}`);
      await gitExec(`git reset HEAD -- "${path}"`);
      await refresh();
      setActionInProgress(null);
    },
    [refresh],
  );

  const stageAll = useCallback(async () => {
    setActionInProgress("stageAll");
    await gitExec("git add -A");
    await refresh();
    setActionInProgress(null);
  }, [refresh]);

  const unstageAll = useCallback(async () => {
    setActionInProgress("unstageAll");
    await gitExec("git reset HEAD");
    await refresh();
    setActionInProgress(null);
  }, [refresh]);

  const handleCommit = useCallback(async () => {
    if (!canCommit) return;
    setActionInProgress("commit");
    const escaped = commitMessage.replace(/"/g, '\\"').replace(/\$/g, '\\$');
    const res = await gitExec(`git commit -m "${escaped}"`);
    if (res.stderr && res.stderr.includes("fatal")) {
      setError(res.stderr);
    } else {
      setCommitMessage("");
      setError(null);
    }
    await refresh();
    setActionInProgress(null);
  }, [canCommit, commitMessage, refresh]);

  const handleCommitAndPush = useCallback(async () => {
    if (!canCommit) return;
    setActionInProgress("commitPush");
    const escaped = commitMessage.replace(/"/g, '\\"').replace(/\$/g, '\\$');
    const commitRes = await gitExec(`git commit -m "${escaped}"`);
    if (commitRes.stderr && commitRes.stderr.includes("fatal")) {
      setError(commitRes.stderr);
      setActionInProgress(null);
      return;
    }
    const pushRes = await gitExec("git push");
    if (pushRes.stderr && pushRes.stderr.includes("fatal")) {
      setError(pushRes.stderr);
    } else {
      setCommitMessage("");
      setError(null);
    }
    await refresh();
    setActionInProgress(null);
  }, [canCommit, commitMessage, refresh]);

  const handlePush = useCallback(async () => {
    setActionInProgress("push");
    const res = await gitExec("git push");
    if (res.stderr && res.stderr.includes("fatal")) {
      setError(res.stderr);
    } else {
      setError(null);
    }
    await refresh();
    setActionInProgress(null);
  }, [refresh]);

  const handlePull = useCallback(async () => {
    setActionInProgress("pull");
    const res = await gitExec("git pull");
    if (res.stderr && res.stderr.includes("fatal")) {
      setError(res.stderr);
    } else {
      setError(null);
    }
    await refresh();
    setActionInProgress(null);
  }, [refresh]);

  // -- render ----------------------------------------------------------------

  if (!isOpen) return null;

  const renderTrackingBadge = () => {
    if (!branch.hasUpstream) {
      return (
        <span
          style={{
            ...styles.trackingBadge,
            background: `${UNTRACKED_COLOR}22`,
            color: UNTRACKED_COLOR,
          }}
        >
          no upstream
        </span>
      );
    }
    const parts: string[] = [];
    if (branch.ahead > 0) parts.push(`+${branch.ahead}`);
    if (branch.behind > 0) parts.push(`-${branch.behind}`);
    if (parts.length === 0) {
      return (
        <span
          style={{
            ...styles.trackingBadge,
            background: `${SUCCESS}22`,
            color: SUCCESS,
          }}
        >
          up to date
        </span>
      );
    }
    return (
      <span
        style={{
          ...styles.trackingBadge,
          background:
            branch.behind > 0 ? `${ERROR}22` : `${MODIFIED_COLOR}22`,
          color: branch.behind > 0 ? ERROR : MODIFIED_COLOR,
        }}
      >
        {parts.join(" ")}
      </span>
    );
  };

  const renderFileRow = (file: GitFile, staged: boolean) => {
    const st = staged ? file.indexStatus : file.workStatus;
    const active = selectedFile === file.path && selectedStaged === staged;
    const actionKey = staged
      ? `unstage:${file.path}`
      : `stage:${file.path}`;
    const busy = actionInProgress === actionKey;
    return (
      <div key={`${file.path}-${staged ? "s" : "u"}`}>
        <div
          style={{
            ...styles.fileRow,
            background: active ? `${ACCENT}11` : "transparent",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = `${ACCENT}11`;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = active
              ? `${ACCENT}11`
              : "transparent";
          }}
        >
          <div
            style={{
              ...styles.statusBadge,
              background: badgeBg(st),
              color: statusColor(st),
            }}
          >
            {statusLabel(st)}
          </div>
          <span
            style={{
              ...styles.filePath,
              color: statusColor(st),
              cursor: "pointer",
            }}
            onClick={() => handleFileClick(file.path, staged)}
            title={file.path}
          >
            {file.path}
          </span>
          {staged ? (
            <button
              style={{
                ...styles.stageBtn,
                color: ERROR,
                borderColor: `${ERROR}44`,
                opacity: busy ? 0.5 : 1,
              }}
              onClick={() => unstageFile(file.path)}
              disabled={busy}
            >
              {busy ? "..." : "Unstage"}
            </button>
          ) : (
            <button
              style={{
                ...styles.stageBtn,
                color: SUCCESS,
                borderColor: `${SUCCESS}44`,
                opacity: busy ? 0.5 : 1,
              }}
              onClick={() => stageFile(file.path)}
              disabled={busy}
            >
              {busy ? "..." : "Stage"}
            </button>
          )}
        </div>
        {active && (
          <div style={styles.diffViewer}>
            {diffLoading ? (
              <div style={{ padding: 12, color: TEXT_MUTED, fontSize: 12 }}>
                <span style={styles.loadingDot} /> Loading diff...
              </div>
            ) : diffContent.length === 0 ? (
              <div style={{ padding: 12, color: TEXT_MUTED, fontSize: 12 }}>
                No diff available
              </div>
            ) : (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  tableLayout: "fixed",
                }}
              >
                <tbody>
                  {diffContent.map((row, i) => (
                    <tr key={i}>
                      {row.type === "hunk" || row.type === "header" ? (
                        <td
                          colSpan={3}
                          style={diffRowStyle(row.type)}
                        >
                          {row.content}
                        </td>
                      ) : (
                        <>
                          <td
                            style={{
                              width: 36,
                              textAlign: "right",
                              padding: "0 4px",
                              color: TEXT_MUTED,
                              fontSize: 10,
                              fontFamily: "monospace",
                              userSelect: "none",
                              opacity: 0.6,
                              verticalAlign: "top",
                            }}
                          >
                            {row.oldNum ?? ""}
                          </td>
                          <td
                            style={{
                              width: 36,
                              textAlign: "right",
                              padding: "0 4px",
                              color: TEXT_MUTED,
                              fontSize: 10,
                              fontFamily: "monospace",
                              userSelect: "none",
                              opacity: 0.6,
                              verticalAlign: "top",
                            }}
                          >
                            {row.newNum ?? ""}
                          </td>
                          <td style={diffRowStyle(row.type)}>
                            <span
                              style={{
                                userSelect: "none",
                                display: "inline-block",
                                width: 12,
                              }}
                            >
                              {diffPrefix(row.type)}
                            </span>
                            {row.content}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* -- Header -------------------------------------------------------- */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.branchIcon}>*</span>
            <span style={styles.branchName}>
              {branch.name || "..."}
            </span>
            {branch.name && renderTrackingBadge()}
          </div>
          <button style={styles.closeBtn} onClick={onClose} title="Close">
            &#x2715;
          </button>
        </div>

        {/* -- Body ---------------------------------------------------------- */}
        <div style={styles.body}>
          {/* Error */}
          {error && (
            <div style={styles.errorBanner}>{error}</div>
          )}

          {/* Loading indicator */}
          {loading && (
            <div style={{ color: TEXT_MUTED, fontSize: 12 }}>
              <span style={styles.loadingDot} /> Fetching git status...
            </div>
          )}

          {/* Push / Pull row */}
          <div style={styles.actionRow}>
            <button
              style={{
                ...styles.actionBtn,
                opacity: actionInProgress === "push" ? 0.5 : 1,
              }}
              onClick={handlePush}
              disabled={!!actionInProgress}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = ACCENT;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER;
              }}
            >
              <span style={{ fontSize: 14 }}>&#8593;</span>{" "}
              {actionInProgress === "push" ? "Pushing..." : "Push"}
            </button>
            <button
              style={{
                ...styles.actionBtn,
                opacity: actionInProgress === "pull" ? 0.5 : 1,
              }}
              onClick={handlePull}
              disabled={!!actionInProgress}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = ACCENT;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER;
              }}
            >
              <span style={{ fontSize: 14 }}>&#8595;</span>{" "}
              {actionInProgress === "pull" ? "Pulling..." : "Pull"}
            </button>
          </div>

          {/* -- Staged Changes ---------------------------------------------- */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <span>Staged Changes ({stagedFiles.length})</span>
              {stagedFiles.length > 0 && (
                <button
                  style={{
                    ...styles.stageBtn,
                    color: ERROR,
                    borderColor: `${ERROR}44`,
                    opacity: actionInProgress === "unstageAll" ? 0.5 : 1,
                  }}
                  onClick={unstageAll}
                  disabled={!!actionInProgress}
                >
                  {actionInProgress === "unstageAll"
                    ? "..."
                    : "Unstage All"}
                </button>
              )}
            </div>
            {stagedFiles.length === 0 ? (
              <div style={styles.emptyState}>No staged changes</div>
            ) : (
              stagedFiles.map((f) => renderFileRow(f, true))
            )}
          </div>

          {/* -- Unstaged Changes -------------------------------------------- */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <span>Changes ({unstagedFiles.length})</span>
              {unstagedFiles.length > 0 && (
                <button
                  style={{
                    ...styles.stageBtn,
                    color: SUCCESS,
                    borderColor: `${SUCCESS}44`,
                    opacity: actionInProgress === "stageAll" ? 0.5 : 1,
                  }}
                  onClick={stageAll}
                  disabled={!!actionInProgress}
                >
                  {actionInProgress === "stageAll"
                    ? "..."
                    : "Stage All"}
                </button>
              )}
            </div>
            {unstagedFiles.length === 0 ? (
              <div style={styles.emptyState}>Working tree clean</div>
            ) : (
              unstagedFiles.map((f) => renderFileRow(f, false))
            )}
          </div>

          {/* -- Commit ------------------------------------------------------ */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <span>Commit</span>
            </div>
            <div
              style={{
                padding: 12,
                display: "flex",
                flexDirection: "column" as const,
                gap: 10,
              }}
            >
              <textarea
                style={styles.textarea}
                placeholder="Commit message..."
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                onFocus={(e) => {
                  (e.target as HTMLTextAreaElement).style.borderColor = ACCENT;
                }}
                onBlur={(e) => {
                  (e.target as HTMLTextAreaElement).style.borderColor = BORDER;
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    handleCommit();
                  }
                }}
              />
              <div style={styles.commitBtnRow}>
                <button
                  style={{
                    ...styles.commitBtn,
                    background: canCommit ? ACCENT : `${ACCENT}44`,
                    color: canCommit ? "#fff" : TEXT_MUTED,
                    cursor: canCommit ? "pointer" : "not-allowed",
                    opacity:
                      actionInProgress === "commit" ||
                      actionInProgress === "commitPush"
                        ? 0.5
                        : 1,
                  }}
                  onClick={handleCommit}
                  disabled={!canCommit || !!actionInProgress}
                >
                  {actionInProgress === "commit"
                    ? "Committing..."
                    : `Commit (${stagedFiles.length})`}
                </button>
                <button
                  style={{
                    ...styles.commitBtn,
                    background: canCommit ? SUCCESS : `${SUCCESS}44`,
                    color: canCommit ? "#fff" : TEXT_MUTED,
                    cursor: canCommit ? "pointer" : "not-allowed",
                    opacity: actionInProgress === "commitPush" ? 0.5 : 1,
                    flex: "unset",
                    padding: "10px 14px",
                  }}
                  onClick={handleCommitAndPush}
                  disabled={!canCommit || !!actionInProgress}
                  title="Commit and push"
                >
                  {actionInProgress === "commitPush"
                    ? "..."
                    : "Commit & Push"}
                </button>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: TEXT_MUTED,
                  fontFamily: "monospace",
                }}
              >
                Ctrl+Enter / Cmd+Enter to commit
              </div>
            </div>
          </div>

          {/* -- Recent Commits ---------------------------------------------- */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <span>Recent Commits ({commits.length})</span>
            </div>
            {commits.length === 0 ? (
              <div style={styles.emptyState}>No commits yet</div>
            ) : (
              commits.map((c) => (
                <div key={c.hash} style={styles.commitItem}>
                  <div>
                    <span style={styles.commitHash}>{c.hash}</span>
                    <span style={styles.commitMsg}>{c.message}</span>
                  </div>
                  <div style={styles.commitDate}>{c.date}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
