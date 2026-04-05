import { useState, useEffect, useCallback, useRef, useMemo } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MCPServerInfo {
  name: string;
  status: "connected" | "disconnected" | "error";
  enabled: boolean;
  supportsResources: boolean;
  resourceCount: number;
  authStatus: "authenticated" | "needs_auth" | "auth_failed";
}

interface MCPResource {
  uri: string;
  name: string;
  mimeType: string;
  description: string;
}

interface MCPResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string;   // base64
  size: number;
}

export interface MCPResourceBrowserProps {
  apiBase: string;
  servers: Array<{
    name: string;
    status?: "connected" | "disconnected" | "error";
    enabled: boolean;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const RESOURCE_CSS = `
/* Server selector */
.mcpr-selector { padding: 8px 0; }
.mcpr-select { width: 100%; background: var(--bg-tertiary, #1a1a24); border: 1px solid var(--border, #2a2a36); border-radius: 4px; padding: 6px 8px; font-size: 12px; color: var(--text-primary); font-family: var(--font-mono); cursor: pointer; appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236a6a82' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 8px center; padding-right: 24px; }
.mcpr-select:focus { outline: none; border-color: var(--accent, #e84520); }
.mcpr-select option { background: var(--bg-primary, #0a0a0f); color: var(--text-primary); }

/* Auth indicator */
.mcpr-auth { display: flex; align-items: center; gap: 6px; padding: 6px 0; font-size: 11px; color: var(--text-secondary); }
.mcpr-auth-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.mcpr-auth-dot.authenticated { background: var(--success, #22c55e); }
.mcpr-auth-dot.needs_auth { background: var(--warning, #f59e0b); }
.mcpr-auth-dot.auth_failed { background: var(--error, #ef4444); }
.mcpr-auth-btn { background: none; border: 1px solid var(--border, #2a2a36); color: var(--text-secondary); border-radius: 4px; padding: 2px 8px; font-size: 10px; cursor: pointer; font-family: var(--font-mono); transition: all 0.15s; margin-left: auto; }
.mcpr-auth-btn:hover { color: var(--text-primary); border-color: var(--text-muted); }

/* Controls bar */
.mcpr-controls { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-bottom: 1px solid var(--border, #2a2a36); margin-bottom: 8px; }
.mcpr-search { flex: 1; background: var(--bg-tertiary, #1a1a24); border: 1px solid var(--border, #2a2a36); border-radius: 4px; padding: 5px 8px; font-size: 11px; color: var(--text-primary); font-family: var(--font-mono); box-sizing: border-box; }
.mcpr-search:focus { outline: none; border-color: var(--accent, #e84520); }
.mcpr-search::placeholder { color: var(--text-muted); }
.mcpr-icon-btn { background: none; border: 1px solid var(--border, #2a2a36); color: var(--text-secondary); border-radius: 4px; padding: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
.mcpr-icon-btn:hover { color: var(--text-primary); border-color: var(--text-muted); }
.mcpr-icon-btn.active { color: var(--accent, #e84520); border-color: var(--accent, #e84520); }

/* Auto-refresh toggle */
.mcpr-auto-refresh { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--text-muted); }

/* Resource list */
.mcpr-list { display: flex; flex-direction: column; gap: 4px; }
.mcpr-item { border: 1px solid var(--border, #2a2a36); border-radius: 6px; padding: 8px 10px; background: var(--bg-secondary, #12121a); cursor: pointer; transition: border-color 0.15s; }
.mcpr-item:hover { border-color: var(--accent, #e84520); }
.mcpr-item.selected { border-color: var(--accent, #e84520); background: rgba(232, 69, 32, 0.05); }
.mcpr-item-top { display: flex; align-items: center; justify-content: space-between; }
.mcpr-item-name { font-size: 12px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mcpr-item-mime { font-size: 10px; color: var(--text-muted); background: var(--bg-tertiary, #1a1a24); padding: 1px 5px; border-radius: 3px; flex-shrink: 0; }
.mcpr-item-uri { font-size: 10px; color: var(--text-dim); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mcpr-item-desc { font-size: 11px; color: var(--text-secondary); margin-top: 3px; line-height: 1.4; }

/* Resource viewer */
.mcpr-viewer { margin-top: 8px; border: 1px solid var(--border, #2a2a36); border-radius: 6px; background: var(--bg-secondary, #12121a); overflow: hidden; }
.mcpr-viewer-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid var(--border, #2a2a36); background: var(--bg-tertiary, #1a1a24); }
.mcpr-viewer-title { font-size: 12px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.mcpr-viewer-actions { display: flex; gap: 4px; flex-shrink: 0; }
.mcpr-viewer-content { padding: 10px; max-height: 300px; overflow: auto; }
.mcpr-viewer-content::-webkit-scrollbar { width: 5px; }
.mcpr-viewer-content::-webkit-scrollbar-track { background: transparent; }
.mcpr-viewer-content::-webkit-scrollbar-thumb { background: var(--border, #2a2a36); border-radius: 3px; }
.mcpr-code-block { font-family: var(--font-mono); font-size: 11px; line-height: 1.5; color: var(--text-primary); white-space: pre-wrap; word-break: break-word; background: var(--bg-code, #0d0d14); border-radius: 4px; padding: 8px; }
.mcpr-binary-info { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px; text-align: center; }
.mcpr-binary-icon { font-size: 28px; opacity: 0.3; }
.mcpr-binary-type { font-size: 12px; color: var(--text-secondary); }
.mcpr-binary-size { font-size: 11px; color: var(--text-muted); }

/* Badge */
.mcpr-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; border-radius: 8px; background: var(--accent, #e84520); color: #fff; font-size: 9px; font-weight: 700; padding: 0 4px; margin-left: 6px; }

/* Empty state */
.mcpr-empty { text-align: center; padding: 24px 12px; color: var(--text-muted); font-size: 11px; }
.mcpr-empty-icon { font-size: 24px; margin-bottom: 6px; opacity: 0.3; }

/* Loading */
.mcpr-loading { text-align: center; padding: 20px; color: var(--text-muted); font-size: 11px; }

/* Toast */
.mcpr-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--success, #22c55e); color: #fff; padding: 6px 16px; border-radius: 4px; font-size: 12px; font-weight: 500; z-index: 10000; animation: mcpr-toast-in 0.2s ease-out; box-shadow: 0 4px 16px rgba(0,0,0,.4); }
@keyframes mcpr-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const AUTH_LABELS: Record<string, string> = {
  authenticated: "Authenticated",
  needs_auth: "Needs authentication",
  auth_failed: "Auth failed",
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function isTextMime(mime: string): boolean {
  if (!mime) return true;
  return (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    mime.includes("yaml") ||
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("markdown")
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MCPResourceBrowser({ apiBase, servers }: MCPResourceBrowserProps) {
  const [serverInfos, setServerInfos] = useState<MCPServerInfo[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>("");
  const [resources, setResources] = useState<MCPResource[]>([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedResource, setSelectedResource] = useState<MCPResource | null>(null);
  const [resourceContent, setResourceContent] = useState<MCPResourceContent | null>(null);
  const [loadingServers, setLoadingServers] = useState(true);
  const [loadingResources, setLoadingResources] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  // Inject styles
  useEffect(() => {
    if (styleRef.current) return;
    const el = document.createElement("style");
    el.textContent = RESOURCE_CSS;
    document.head.appendChild(el);
    styleRef.current = el;
    return () => {
      el.remove();
      styleRef.current = null;
    };
  }, []);

  // Toast
  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  // Fetch server infos with resource support
  const fetchServerInfos = useCallback(() => {
    setLoadingServers(true);
    fetch(`${apiBase}/mcp-servers/resources/info`)
      .then((r) => r.json())
      .then((data) => {
        const infos: MCPServerInfo[] = Array.isArray(data.servers) ? data.servers : [];
        setServerInfos(infos);
        // Auto-select first server that supports resources
        if (!selectedServer && infos.length > 0) {
          const first = infos.find((s) => s.supportsResources && s.status === "connected");
          if (first) setSelectedServer(first.name);
        }
        setLoadingServers(false);
      })
      .catch(() => {
        // Fallback: derive from parent servers prop
        const fallback: MCPServerInfo[] = servers
          .filter((s) => s.enabled && s.status === "connected")
          .map((s) => ({
            name: s.name,
            status: s.status || "disconnected",
            enabled: s.enabled,
            supportsResources: true,
            resourceCount: 0,
            authStatus: "authenticated" as const,
          }));
        setServerInfos(fallback);
        if (!selectedServer && fallback.length > 0) {
          setSelectedServer(fallback[0].name);
        }
        setLoadingServers(false);
      });
  }, [apiBase, servers, selectedServer]);

  useEffect(() => {
    fetchServerInfos();
  }, [fetchServerInfos]);

  // Fetch resources for selected server
  const fetchResources = useCallback(() => {
    if (!selectedServer) {
      setResources([]);
      return;
    }
    setLoadingResources(true);
    fetch(`${apiBase}/mcp-servers/${encodeURIComponent(selectedServer)}/resources`)
      .then((r) => r.json())
      .then((data) => {
        setResources(Array.isArray(data.resources) ? data.resources : []);
        setLoadingResources(false);
      })
      .catch(() => {
        setResources([]);
        setLoadingResources(false);
      });
  }, [apiBase, selectedServer]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  // Auto-refresh
  useEffect(() => {
    if (refreshTimer.current) {
      clearInterval(refreshTimer.current);
      refreshTimer.current = null;
    }
    if (autoRefresh && selectedServer) {
      refreshTimer.current = setInterval(() => {
        fetchResources();
      }, 5000);
    }
    return () => {
      if (refreshTimer.current) {
        clearInterval(refreshTimer.current);
        refreshTimer.current = null;
      }
    };
  }, [autoRefresh, selectedServer, fetchResources]);

  // Fetch resource content
  const fetchContent = useCallback(
    (resource: MCPResource) => {
      setLoadingContent(true);
      setResourceContent(null);
      fetch(
        `${apiBase}/mcp-servers/${encodeURIComponent(selectedServer)}/resources/read?uri=${encodeURIComponent(resource.uri)}`
      )
        .then((r) => r.json())
        .then((data) => {
          setResourceContent(data.content || null);
          setLoadingContent(false);
        })
        .catch(() => {
          setResourceContent(null);
          setLoadingContent(false);
        });
    },
    [apiBase, selectedServer]
  );

  // Select a resource
  const handleSelectResource = useCallback(
    (resource: MCPResource) => {
      if (selectedResource?.uri === resource.uri) {
        // Collapse
        setSelectedResource(null);
        setResourceContent(null);
      } else {
        setSelectedResource(resource);
        fetchContent(resource);
      }
    },
    [selectedResource, fetchContent]
  );

  // Authenticate
  const handleAuth = useCallback(
    (serverName: string) => {
      fetch(`${apiBase}/mcp-servers/${encodeURIComponent(serverName)}/auth`, {
        method: "POST",
      })
        .then((r) => r.json())
        .then(() => {
          showToast("Authentication initiated");
          fetchServerInfos();
        })
        .catch(() => showToast("Authentication failed"));
    },
    [apiBase, showToast, fetchServerInfos]
  );

  // Copy URI
  const handleCopyURI = useCallback(
    async (uri: string) => {
      try {
        await navigator.clipboard.writeText(uri);
        showToast("URI copied");
      } catch {
        showToast("Failed to copy");
      }
    },
    [showToast]
  );

  // Save binary
  const handleSaveBinary = useCallback(() => {
    if (!resourceContent?.blob || !selectedResource) return;
    const byteChars = atob(resourceContent.blob);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: resourceContent.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedResource.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Download started");
  }, [resourceContent, selectedResource, showToast]);

  // Refresh content
  const handleRefreshContent = useCallback(() => {
    if (selectedResource) {
      fetchContent(selectedResource);
    }
  }, [selectedResource, fetchContent]);

  // Filtered resources
  const filteredResources = useMemo(() => {
    if (!searchFilter.trim()) return resources;
    const q = searchFilter.toLowerCase();
    return resources.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.uri.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.mimeType?.toLowerCase().includes(q)
    );
  }, [resources, searchFilter]);

  // Current server info
  const currentServerInfo = useMemo(
    () => serverInfos.find((s) => s.name === selectedServer),
    [serverInfos, selectedServer]
  );

  // Servers that support resources
  const resourceServers = useMemo(
    () => serverInfos.filter((s) => s.supportsResources),
    [serverInfos]
  );

  if (loadingServers) {
    return <div className="mcpr-loading">Loading servers...</div>;
  }

  if (resourceServers.length === 0) {
    return (
      <div className="mcpr-empty">
        <div className="mcpr-empty-icon">&#128194;</div>
        <div>No servers with resource support</div>
        <div style={{ marginTop: 4, fontSize: 10 }}>
          Connect an MCP server that exposes resources
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Server selector */}
      <div className="mcpr-selector">
        <select
          className="mcpr-select"
          value={selectedServer}
          onChange={(e) => {
            setSelectedServer(e.target.value);
            setSelectedResource(null);
            setResourceContent(null);
            setSearchFilter("");
          }}
        >
          {resourceServers.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name} ({s.resourceCount})
            </option>
          ))}
        </select>
      </div>

      {/* Auth status */}
      {currentServerInfo && (
        <div className="mcpr-auth">
          <span className={`mcpr-auth-dot ${currentServerInfo.authStatus}`} />
          <span>{AUTH_LABELS[currentServerInfo.authStatus] || currentServerInfo.authStatus}</span>
          {currentServerInfo.authStatus !== "authenticated" && (
            <button
              className="mcpr-auth-btn"
              onClick={() => handleAuth(currentServerInfo.name)}
            >
              Authenticate
            </button>
          )}
        </div>
      )}

      {/* Controls: search, refresh, auto-refresh */}
      <div className="mcpr-controls">
        <input
          className="mcpr-search"
          placeholder="Filter resources..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
        />
        <button
          className="mcpr-icon-btn"
          onClick={fetchResources}
          title="Refresh resource list"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
          </svg>
        </button>
        <button
          className={`mcpr-icon-btn ${autoRefresh ? "active" : ""}`}
          onClick={() => setAutoRefresh((v) => !v)}
          title={autoRefresh ? "Disable auto-refresh" : "Enable auto-refresh (5s)"}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </button>
      </div>

      {/* Resource list */}
      {loadingResources ? (
        <div className="mcpr-loading">Loading resources...</div>
      ) : filteredResources.length === 0 ? (
        <div className="mcpr-empty">
          <div className="mcpr-empty-icon">&#128196;</div>
          <div>{searchFilter ? "No matching resources" : "No resources available"}</div>
        </div>
      ) : (
        <div className="mcpr-list">
          {filteredResources.map((r) => (
            <div
              key={r.uri}
              className={`mcpr-item ${selectedResource?.uri === r.uri ? "selected" : ""}`}
              onClick={() => handleSelectResource(r)}
            >
              <div className="mcpr-item-top">
                <span className="mcpr-item-name">{r.name}</span>
                {r.mimeType && <span className="mcpr-item-mime">{r.mimeType}</span>}
              </div>
              <div className="mcpr-item-uri">{r.uri}</div>
              {r.description && <div className="mcpr-item-desc">{r.description}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Resource viewer */}
      {selectedResource && (
        <div className="mcpr-viewer">
          <div className="mcpr-viewer-header">
            <span className="mcpr-viewer-title">{selectedResource.name}</span>
            <div className="mcpr-viewer-actions">
              <button
                className="mcpr-icon-btn"
                onClick={() => handleCopyURI(selectedResource.uri)}
                title="Copy URI"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              </button>
              <button
                className="mcpr-icon-btn"
                onClick={handleRefreshContent}
                title="Refresh content"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                </svg>
              </button>
            </div>
          </div>
          <div className="mcpr-viewer-content">
            {loadingContent ? (
              <div className="mcpr-loading">Loading content...</div>
            ) : !resourceContent ? (
              <div className="mcpr-empty" style={{ padding: 12 }}>
                Failed to load content
              </div>
            ) : isTextMime(resourceContent.mimeType) && resourceContent.text != null ? (
              <div className="mcpr-code-block">{resourceContent.text}</div>
            ) : (
              <div className="mcpr-binary-info">
                <div className="mcpr-binary-icon">&#128190;</div>
                <div className="mcpr-binary-type">{resourceContent.mimeType || "Binary file"}</div>
                <div className="mcpr-binary-size">{formatBytes(resourceContent.size)}</div>
                <button
                  className="mcp-btn accent"
                  onClick={handleSaveBinary}
                  style={{ marginTop: 4 }}
                >
                  Save File
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="mcpr-toast">{toast}</div>}
    </>
  );
}
