import { useState, useEffect, useCallback } from "react";
import MCPResourceBrowser from "./MCPResourceBrowser";

interface MCPServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
  status?: "connected" | "disconnected" | "error";
}

interface MCPPanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  onServersChange?: (servers: MCPServer[]) => void;
}

const STYLES = `
.mcp-panel { position: fixed; top: 0; right: 0; width: 420px; height: 100vh; background: var(--bg-primary); border-left: 1px solid var(--border); z-index: 200; display: flex; flex-direction: column; font-family: var(--font-mono); animation: mcp-slide-in 0.2s ease-out; }
@keyframes mcp-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
.mcp-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.mcp-title { font-size: 14px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px; }
.mcp-close { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 4px; border-radius: 4px; }
.mcp-close:hover { color: var(--text-primary); background: var(--bg-hover); }
.mcp-body { flex: 1; overflow-y: auto; padding: 12px; }
.mcp-server-card { border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 8px; background: var(--bg-secondary); transition: border-color 0.15s; }
.mcp-server-card:hover { border-color: var(--accent, #e84520); }
.mcp-server-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.mcp-server-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.mcp-server-status { font-size: 10px; display: flex; align-items: center; gap: 4px; }
.mcp-dot { width: 6px; height: 6px; border-radius: 50%; }
.mcp-dot.connected { background: var(--success, #22c55e); }
.mcp-dot.disconnected { background: var(--text-muted); }
.mcp-dot.error { background: var(--error, #ef4444); }
.mcp-server-cmd { font-size: 11px; color: var(--text-dim); margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mcp-server-actions { display: flex; gap: 6px; }
.mcp-btn { background: none; border: 1px solid var(--border); color: var(--text-secondary); border-radius: 4px; padding: 3px 8px; font-size: 10px; cursor: pointer; font-family: var(--font-mono); transition: all 0.15s; }
.mcp-btn:hover { color: var(--text-primary); border-color: var(--text-muted); }
.mcp-btn.danger:hover { color: var(--error); border-color: var(--error); }
.mcp-btn.accent { background: var(--accent, #e84520); color: #fff; border-color: var(--accent); }
.mcp-btn.accent:hover { opacity: 0.9; }
.mcp-toggle { position: relative; width: 32px; height: 18px; border-radius: 9px; background: var(--bg-tertiary); border: 1px solid var(--border); cursor: pointer; transition: background 0.2s; }
.mcp-toggle.on { background: var(--accent, #e84520); border-color: var(--accent); }
.mcp-toggle-knob { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; transition: transform 0.2s; }
.mcp-toggle.on .mcp-toggle-knob { transform: translateX(14px); }
.mcp-add-section { padding: 16px 0; border-top: 1px solid var(--border); margin-top: 8px; }
.mcp-add-title { font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; }
.mcp-input { width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 4px; padding: 6px 8px; font-size: 12px; color: var(--text-primary); font-family: var(--font-mono); margin-bottom: 6px; box-sizing: border-box; }
.mcp-input:focus { outline: none; border-color: var(--accent, #e84520); }
.mcp-input::placeholder { color: var(--text-muted); }
.mcp-empty { text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 12px; }
.mcp-empty-icon { font-size: 32px; margin-bottom: 8px; opacity: 0.3; }
.mcp-templates { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 12px; }
.mcp-template { border: 1px solid var(--border); border-radius: 6px; padding: 8px; cursor: pointer; transition: all 0.15s; }
.mcp-template:hover { border-color: var(--accent); background: rgba(232, 69, 32, 0.05); }
.mcp-template-name { font-size: 11px; font-weight: 600; color: var(--text-primary); }
.mcp-template-desc { font-size: 10px; color: var(--text-dim); margin-top: 2px; }
.mcp-tabs { display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0; background: var(--bg-secondary, #12121a); }
.mcp-tab { padding: 8px 16px; font-size: 12px; font-weight: 500; color: var(--text-secondary); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-family: var(--font-mono); transition: color 0.15s, border-color 0.15s; display: flex; align-items: center; gap: 6px; }
.mcp-tab:hover { color: var(--text-primary); }
.mcp-tab.active { color: var(--accent, #e84520); border-bottom-color: var(--accent, #e84520); font-weight: 600; }
.mcp-tab-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; border-radius: 8px; background: var(--bg-tertiary, #1a1a24); color: var(--text-muted); font-size: 9px; font-weight: 700; padding: 0 4px; }
.mcp-tab.active .mcp-tab-badge { background: var(--accent, #e84520); color: #fff; }
`;

const TEMPLATES: { name: string; command: string; args: string[]; description: string }[] = [
  { name: "Filesystem", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"], description: "File system access" },
  { name: "GitHub", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], description: "GitHub API integration" },
  { name: "Postgres", command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres"], description: "PostgreSQL database" },
  { name: "Brave Search", command: "npx", args: ["-y", "@modelcontextprotocol/server-brave-search"], description: "Web search via Brave" },
  { name: "Puppeteer", command: "npx", args: ["-y", "@modelcontextprotocol/server-puppeteer"], description: "Browser automation" },
  { name: "Memory", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], description: "Persistent memory store" },
];

type MCPTab = "servers" | "resources";

export default function MCPPanel({ isOpen, onClose, apiBase, onServersChange }: MCPPanelProps) {
  const [activeTab, setActiveTab] = useState<MCPTab>("servers");
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [newName, setNewName] = useState("");
  const [newCommand, setNewCommand] = useState("");
  const [newArgs, setNewArgs] = useState("");
  const [loading, setLoading] = useState(true);

  // Load servers
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`${apiBase}/mcp-servers`)
      .then(r => r.json())
      .then(data => {
        setServers(Array.isArray(data.servers) ? data.servers : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [isOpen, apiBase]);

  const saveServers = useCallback((updated: MCPServer[]) => {
    setServers(updated);
    onServersChange?.(updated);
    fetch(`${apiBase}/mcp-servers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servers: updated }),
    }).catch(() => {});
  }, [apiBase, onServersChange]);

  const addServer = useCallback(() => {
    if (!newName.trim() || !newCommand.trim()) return;
    const server: MCPServer = {
      name: newName.trim(),
      command: newCommand.trim(),
      args: newArgs.trim() ? newArgs.split(" ") : [],
      enabled: true,
      status: "disconnected",
    };
    saveServers([...servers, server]);
    setNewName("");
    setNewCommand("");
    setNewArgs("");
  }, [newName, newCommand, newArgs, servers, saveServers]);

  const addTemplate = useCallback((tmpl: typeof TEMPLATES[0]) => {
    const server: MCPServer = {
      name: tmpl.name,
      command: tmpl.command,
      args: tmpl.args,
      enabled: true,
      status: "disconnected",
    };
    saveServers([...servers, server]);
  }, [servers, saveServers]);

  const toggleServer = useCallback((idx: number) => {
    const updated = servers.map((s, i) => i === idx ? { ...s, enabled: !s.enabled } : s);
    saveServers(updated);
  }, [servers, saveServers]);

  const removeServer = useCallback((idx: number) => {
    saveServers(servers.filter((_, i) => i !== idx));
  }, [servers, saveServers]);

  if (!isOpen) return null;

  return (
    <>
      <style>{STYLES}</style>
      <div className="mcp-panel">
        <div className="mcp-header">
          <span className="mcp-title">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            MCP Servers
          </span>
          <button className="mcp-close" onClick={onClose}>&times;</button>
        </div>

        <div className="mcp-tabs">
          <button
            className={`mcp-tab ${activeTab === "servers" ? "active" : ""}`}
            onClick={() => setActiveTab("servers")}
          >
            Servers
            <span className="mcp-tab-badge">{servers.length}</span>
          </button>
          <button
            className={`mcp-tab ${activeTab === "resources" ? "active" : ""}`}
            onClick={() => setActiveTab("resources")}
          >
            Resources
          </button>
        </div>

        <div className="mcp-body">
          {activeTab === "resources" ? (
            <MCPResourceBrowser apiBase={apiBase} servers={servers} />
          ) : (
            <>
              {loading ? (
                <div className="mcp-empty">Loading...</div>
              ) : servers.length === 0 ? (
                <div className="mcp-empty">
                  <div className="mcp-empty-icon">🔌</div>
                  <div>No MCP servers configured</div>
                  <div style={{ marginTop: 4, fontSize: 11 }}>Add a server below or use a template</div>
                </div>
              ) : (
                servers.map((server, idx) => (
                  <div className="mcp-server-card" key={idx}>
                    <div className="mcp-server-top">
                      <span className="mcp-server-name">{server.name}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="mcp-server-status">
                          <span className={`mcp-dot ${server.status || "disconnected"}`} />
                          {server.status || "disconnected"}
                        </span>
                        <div
                          className={`mcp-toggle ${server.enabled ? "on" : ""}`}
                          onClick={() => toggleServer(idx)}
                        >
                          <div className="mcp-toggle-knob" />
                        </div>
                      </div>
                    </div>
                    <div className="mcp-server-cmd">
                      {server.command} {server.args?.join(" ") || ""}
                    </div>
                    <div className="mcp-server-actions">
                      <button className="mcp-btn" onClick={() => toggleServer(idx)}>
                        {server.enabled ? "Disable" : "Enable"}
                      </button>
                      <button className="mcp-btn danger" onClick={() => removeServer(idx)}>Remove</button>
                    </div>
                  </div>
                ))
              )}

              <div className="mcp-add-section">
                <div className="mcp-add-title">Add Server</div>
                <input
                  className="mcp-input"
                  placeholder="Server name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                />
                <input
                  className="mcp-input"
                  placeholder="Command (e.g., npx -y @mcp/server-fs)"
                  value={newCommand}
                  onChange={e => setNewCommand(e.target.value)}
                />
                <input
                  className="mcp-input"
                  placeholder="Arguments (space separated)"
                  value={newArgs}
                  onChange={e => setNewArgs(e.target.value)}
                />
                <button
                  className="mcp-btn accent"
                  onClick={addServer}
                  style={{ width: "100%", padding: "6px", fontSize: 12 }}
                >
                  Add Server
                </button>
              </div>

              <div className="mcp-add-section">
                <div className="mcp-add-title">Quick Templates</div>
                <div className="mcp-templates">
                  {TEMPLATES.map((tmpl) => (
                    <div
                      key={tmpl.name}
                      className="mcp-template"
                      onClick={() => addTemplate(tmpl)}
                    >
                      <div className="mcp-template-name">{tmpl.name}</div>
                      <div className="mcp-template-desc">{tmpl.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
