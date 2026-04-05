import { useState, useEffect, useRef, useCallback } from "react";
import { config } from "../../config";
import LogoHeader from "./LogoHeader";
import StatusLine from "./StatusLine";
import Sidebar, { type SidebarSession, type NavPanel } from "./Sidebar";
import SessionToolbar from "./SessionToolbar";
import WelcomeScreen from "./WelcomeScreen";
import TerminalPanel from "./TerminalPanel";
import FilePreview from "./FilePreview";
import GitPanel from "./GitPanel";
import SettingsDialog, { type Settings } from "../dialogs/SettingsDialog";
import DiffReviewPanel from "../dialogs/DiffReviewPanel";
import SlashCommandMenu from "../input/SlashCommandMenu";
import UserMessage from "../messages/UserMessage";
import AssistantTextMessage from "../messages/AssistantTextMessage";
import AssistantThinkingMessage from "../messages/AssistantThinkingMessage";
import ToolUseMessage from "../messages/ToolUseMessage";
import ToolGroup from "../messages/ToolGroup";
import BashOutputMessage from "../messages/BashOutputMessage";
import FileEditMessage from "../messages/FileEditMessage";
import SystemMessage from "../messages/SystemMessage";
import StreamingText from "../messages/StreamingText";
import Spinner from "../status/Spinner";
import TaskList, { type TaskItem } from "../status/TaskList";
import BackgroundTaskBadge, { type BackgroundTask } from "../status/BackgroundTaskBadge";
import CommandPalette from "../input/CommandPalette";
// PermissionModeSelector used inline in InputBar
import PermissionDialog from "../dialogs/PermissionDialog";
import PhoenixBackground from "../PhoenixBackground";
// New components
import SearchPanel from "../panels/SearchPanel";
import ScheduledPanel from "../panels/ScheduledPanel";
import DispatchPanel from "../panels/DispatchPanel";
import CustomizePanel from "../panels/CustomizePanel";
import CoworkPanel from "../panels/CoworkPanel";
import ModelSelector from "../input/ModelSelector";
import InputBar from "../input/InputBar";
// ModeSelector available for future use
import { ToastProvider } from "../status/NotificationToast";
import ShortcutsDialog from "../dialogs/ShortcutsDialog";
import PlanMode from "../status/PlanMode";
import BuddyPanel from "../panels/BuddyPanel";
import GemmaSetup from "../panels/GemmaSetup";
// New message type components
import ToolResultMessage from "../messages/ToolResultMessage";
import AgentMessage from "../messages/AgentMessage";
import MemoryMessage from "../messages/MemoryMessage";
import PlanMessage from "../messages/PlanMessage";
import RateLimitMessage from "../messages/RateLimitMessage";
import ErrorMessage from "../messages/ErrorMessage";
import CompactMessage from "../messages/CompactMessage";
// New panels
import AgentPanel from "../panels/AgentPanel";
// ── Feature panels ──
import FileTreePanel from "../panels/FileTreePanel";
import TabBar from "./TabBar";
import ImageDropZone, { ImagePreviewBar } from "../input/ImageDropZone";
import DiffViewer from "../dialogs/DiffViewer";
import ConversationHistory from "../panels/ConversationHistory";
import SystemPromptEditor from "../panels/SystemPromptEditor";
import ExportPanel from "../panels/ExportPanel";
import InlineEditor from "../panels/InlineEditor";
import MCPPanel from "../panels/MCPPanel";
import BackgroundTaskPanel, { type BGTask } from "../status/BackgroundTaskPanel";
import StreamingToolOutput from "../messages/StreamingToolOutput";
// ── New feature panels ──
import KairosPanel from "../panels/KairosPanel";
import SwarmPanel from "../panels/SwarmPanel";
import SecurityReviewPanel from "../panels/SecurityReviewPanel";
import InsightsPanel from "../panels/InsightsPanel";
import StickerPanel from "../panels/StickerPanel";
import UndercoverPanel from "../panels/UndercoverPanel";
import UltraReviewPanel from "../panels/UltraReviewPanel";
import VerifiersPanel from "../panels/VerifiersPanel";

export interface UIMessage {
  id: string;
  type: "user" | "assistant" | "thinking" | "tool_use" | "tool_result" | "bash" | "system" | "error" | "file_edit" | "agent" | "memory" | "plan" | "rate_limit" | "compact";
  text: string;
  toolName?: string;
  toolInput?: string;
  toolId?: string;
  isError?: boolean;
  errorType?: "api" | "tool" | "network" | "permission" | "stream" | "unknown";
  details?: string | null;
  retryable?: boolean;
  model?: string;
  timestamp: number;
  needsPermission?: boolean;
  permissionDetail?: string;
  filePath?: string;
  diff?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  matchCount?: number;
  fileCount?: number;
  isRunning?: boolean;
  durationMs?: number;
  isStreaming?: boolean;
  redacted?: boolean;
  // Agent message fields
  agentName?: string;
  agentStatus?: "spawned" | "running" | "completed" | "failed";
  agentDescription?: string;
  agentDepth?: number;
  // Memory message fields
  memoryAction?: "saved" | "read" | "updated" | "deleted";
  memoryFileName?: string;
  memoryContent?: string;
  // Plan message fields
  planTitle?: string;
  planSteps?: Array<{ text: string; status: "pending" | "in_progress" | "done"; substeps?: Array<{ text: string; status: string }> }>;
  planIsActive?: boolean;
  // Rate limit fields
  retryAfterMs?: number;
  // Compact fields
  beforeTokens?: number;
  afterTokens?: number;
  compactMessageCount?: number;
}

interface AgentInfo {
  id: string;
  name: string;
  description: string;
  model: string;
  status: "idle" | "running" | "completed" | "failed";
  progress?: number;
  startTime: number;
  messages?: Array<{ type: string; text: string }>;
}

interface TodoTask {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

interface SessionInfo {
  id: string;
  model: string;
  tools: string[];
  permissionMode: string;
  cwd: string;
}

type PermissionMode = "ask" | "auto-accept" | "plan" | "auto" | "bypass";

const PERMISSION_MODES: PermissionMode[] = ["ask", "auto-accept", "plan", "auto", "bypass"];

let msgIdCounter = 0;
function nextId() { return `msg-${Date.now()}-${++msgIdCounter}`; }

const BASH_TOOLS = new Set(["Bash", "run_bash"]);
const EDIT_TOOLS = new Set(["Edit", "edit_file", "Write", "write_file"]);
const SEARCH_TOOLS = new Set(["Grep", "Glob", "search_files", "search_content"]);
const FILE_TOOLS = new Set(["Read", "read_file", "Edit", "edit_file", "Write", "write_file"]);

function parseToolInput(toolName: string, inputStr: string): {
  command?: string;
  file_path?: string;
  pattern?: string;
  path?: string;
} {
  try {
    const parsed = JSON.parse(inputStr);
    if (BASH_TOOLS.has(toolName)) {
      return { command: parsed.command };
    }
    if (FILE_TOOLS.has(toolName)) {
      return { file_path: parsed.file_path || parsed.path };
    }
    if (toolName === "Grep" || toolName === "search_content") {
      return { pattern: parsed.pattern, path: parsed.path };
    }
    if (toolName === "Glob" || toolName === "search_files") {
      return { pattern: parsed.pattern };
    }
    return parsed;
  } catch {
    return {};
  }
}

function splitStdoutStderr(output: string): { stdout: string; stderr: string } {
  // Heuristic: lines starting with common stderr prefixes
  const lines = output.split("\n");
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  for (const line of lines) {
    if (/^(error|warning|Error|Warning|WARN|ERR|fatal|FATAL|panic)[\s:]/i.test(line) ||
        /^\s+at\s+/.test(line)) {
      stderrLines.push(line);
    } else {
      stdoutLines.push(line);
    }
  }
  return {
    stdout: stdoutLines.join("\n"),
    stderr: stderrLines.join("\n"),
  };
}

function extractDiffFromResult(output: string): string | null {
  // Look for unified diff markers
  if (output.includes("@@") && (output.includes("---") || output.includes("+++"))) {
    return output;
  }
  return null;
}

function countMatches(output: string): { matchCount: number; fileCount: number } {
  const lines = output.split("\n").filter(l => l.trim());
  const files = new Set<string>();
  let matchCount = 0;
  for (const line of lines) {
    // ripgrep-style: file:line:content or just file paths
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      files.add(line.slice(0, colonIdx));
      matchCount++;
    } else if (line.trim()) {
      files.add(line.trim());
      matchCount++;
    }
  }
  return { matchCount, fileCount: files.size };
}

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.1;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.stop(ctx.currentTime + 0.15);
  } catch {}
}

function flashDocumentTitle() {
  const original = document.title;
  let count = 0;
  const interval = setInterval(() => {
    document.title = count % 2 === 0 ? "✓ Done" : original;
    count++;
    if (count >= 6) {
      clearInterval(interval);
      document.title = original;
    }
  }, 500);
}

function fireCompletionNotification() {
  let channel: string = "auto";
  try {
    const saved = localStorage.getItem("tensor-settings");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.notifChannel) channel = parsed.notifChannel;
    }
  } catch {}

  if (channel === "none") return;

  if (channel === "auto") {
    channel = document.hasFocus() ? "visual" : "sound";
  }

  if (channel === "sound") {
    playNotificationSound();
  } else if (channel === "visual") {
    flashDocumentTitle();
  }
}

const DEFAULTS: Settings = {
  theme: "dark",
  fontSize: 14,
  reducedMotion: false,
  apiKeys: {},
  defaultModel: "claude-sonnet-4-6",
  effortLevel: "high",
  permissionMode: "ask",
  permissionRules: [],
  clawMd: "",
  autoMemory: true,
  keyBindings: [],
  mcpServers: [],
  telemetry: false,
  dataSharing: false,
  version: "2.4.0",
  platform: "darwin",
  editorMode: "normal",
  language: "English",
  outputStyle: "normal",
  thinkingMode: false,
  autoCompact: true,
  notifChannel: "auto",
};

export default function AppShell() {
  // ── Existing state ──
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>(() => {
    const savedModel = typeof localStorage !== "undefined" ? localStorage.getItem("tensor-model") : null;
    return { id: "", model: savedModel || "claude-sonnet-4-6", tools: [], permissionMode: "bypass", cwd: "~" };
  });
  const [connected, setConnected] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [inputTokens, setInputTokens] = useState(0);
  const [outputTokens, setOutputTokens] = useState(0);
  const [costUsd, setCostUsd] = useState(0);
  const [contextPercent, setContextPercent] = useState(0);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [showPalette, setShowPalette] = useState(false);
  const [paletteFilter, setPaletteFilter] = useState("");
  const [pendingPermission, setPendingPermission] = useState<{
    toolName: string; toolId?: string; input: string; detail: string; filePath?: string; diff?: string;
  } | null>(null);

  // ── Agent & Task state ──
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [todoTasks, setTodoTasks] = useState<TodoTask[]>([]);
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [editorMode, setEditorMode] = useState<string>("normal");
  const [effortLevel, setEffortLevel] = useState<string>("high");

  // ── New state ──
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showDiffReview, setShowDiffReview] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [showGitPanel, setShowGitPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("bypass");
  const [linesAdded, setLinesAdded] = useState(0);
  const [linesRemoved, setLinesRemoved] = useState(0);
  const [gitBranch, _setGitBranch] = useState("main");
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([]);
  const [sessionStartTime] = useState<Date>(new Date());
  const [showTaskList, setShowTaskList] = useState(true);
  const [, setTerminalHeight] = useState(300);
  const [sessions, setSessions] = useState<SidebarSession[]>([]);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  // New panel state
  const [activePanel, setActivePanel] = useState<NavPanel>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showScheduled, setShowScheduled] = useState(false);
  const [showDispatch, setShowDispatch] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [showCowork, setShowCowork] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showBuddy, setShowBuddy] = useState(false);
  const [showGemma, setShowGemma] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [completionText, setCompletionText] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<"code" | "chat" | "plan">("code");
  const [planData, setPlanData] = useState<{ title: string; steps: any[] } | null>(null);
  // ── New feature state ──
  const [showFileTree, setShowFileTree] = useState(false);
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [showConversationHistory, setShowConversationHistory] = useState(false);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showInlineEditor, setShowInlineEditor] = useState(false);
  const [showMCPPanel, setShowMCPPanel] = useState(false);
  const [showBGTaskPanel, setShowBGTaskPanel] = useState(false);
  // ── New feature panel state ──
  const [showKairos, setShowKairos] = useState(false);
  const [showSwarm, setShowSwarm] = useState(false);
  const [showSecurityReview, setShowSecurityReview] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [showUndercover, setShowUndercover] = useState(false);
  const [showUltraReview, setShowUltraReview] = useState(false);
  const [showVerifiers, setShowVerifiers] = useState(false);
  const [inlineEditorPath, setInlineEditorPath] = useState("");
  const [attachedImages, setAttachedImages] = useState<Array<{ file: File; dataUrl: string; name: string }>>([]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [diffFiles, setDiffFiles] = useState<Array<{ path: string; diff: string; status: "pending" | "accepted" | "rejected" }>>([]);
  const [bgTasks, setBgTasks] = useState<BGTask[]>([]);
  const [appSettings, setAppSettings] = useState<Settings>(() => {
    try {
      const saved = localStorage.getItem("tensor-settings");
      if (saved) return { ...DEFAULTS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULTS;
  });

  useEffect(() => {
    try { localStorage.setItem("tensor-settings", JSON.stringify(appSettings)); } catch {}
  }, [appSettings]);

  useEffect(() => {
    if (appSettings.permissionMode && sessionId) {
      setPermissionMode(appSettings.permissionMode as PermissionMode);
      fetch(`${API}/sessions/${sessionId}/permission-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: appSettings.permissionMode }),
      }).catch(() => {});
    }
  }, [appSettings.permissionMode]);

  // Sync effortLevel state with appSettings and push to bridge
  useEffect(() => {
    if (appSettings.effortLevel) {
      setEffortLevel(appSettings.effortLevel);
      if (sessionId) {
        fetch(`${API}/sessions/${sessionId}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ effortLevel: appSettings.effortLevel, thinkingMode: appSettings.thinkingMode }),
        }).catch(() => {});
      }
    }
  }, [appSettings.effortLevel, appSettings.thinkingMode]);

  // Load CLAW.md from bridge on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${config.apiBase}/claw-md`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.content === "string") {
          setAppSettings((prev) => ({ ...prev, clawMd: data.content }));
        }
      } catch { /* bridge unavailable */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced save of CLAW.md when edited
  const clawMdRef = useRef(appSettings.clawMd);
  useEffect(() => {
    if (clawMdRef.current === appSettings.clawMd) return;
    clawMdRef.current = appSettings.clawMd;
    const timer = setTimeout(async () => {
      try {
        await fetch(`${config.apiBase}/claw-md`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: appSettings.clawMd }),
        });
      } catch { /* bridge unavailable */ }
    }, 1000);
    return () => clearTimeout(timer);
  }, [appSettings.clawMd]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const activeToolUsesRef = useRef<Map<string, { name: string; startTime: number; msgId: string }>>(new Map());
  const currentThinkingIdRef = useRef<string | null>(null);
  const turnResponseLenRef = useRef(0); // cumulative chars of model-generated output for token estimate
  const [turnTokenEstimate, setTurnTokenEstimate] = useState(0);

  const API = config.apiBase;
  const STREAM_API = config.streamBase || config.apiBase;

  // Auto-scroll — stick to bottom during streaming unless user scrolled up
  const userScrolledUpRef = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      userScrolledUpRef.current = !atBottom;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (userScrolledUpRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    // Use requestAnimationFrame for reliable scroll after DOM update
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages, streamingText, turnTokenEstimate]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', appSettings.theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : appSettings.theme);
  }, [appSettings.theme]);

  // Apply font size to document
  useEffect(() => {
    document.documentElement.style.setProperty('--font-size-base', `${appSettings.fontSize}px`);
    document.documentElement.style.setProperty('--font-size-mono', `${appSettings.fontSize}px`);
  }, [appSettings.fontSize]);

  // Apply reduced motion preference
  useEffect(() => {
    document.documentElement.classList.toggle('reduced-motion', appSettings.reducedMotion);
  }, [appSettings.reducedMotion]);

  // ── WebSocket Connection for real-time CLI<->GUI sync ──
  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    try {
      const wsUrl = API.replace(/^http/, "ws") + "/ws";
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        // Subscribe to current session
        if (sessionId) {
          ws.send(JSON.stringify({ type: "subscribe", sessionId }));
        }
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          handleWsEvent(msg);
        } catch {}
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsReconnectRef.current = setTimeout(connectWs, 3000);
      };

      ws.onerror = () => ws.close();
    } catch {
      wsReconnectRef.current = setTimeout(connectWs, 3000);
    }
  }, [API, sessionId]);

  useEffect(() => {
    connectWs();
    return () => {
      if (wsReconnectRef.current) clearTimeout(wsReconnectRef.current);
      wsRef.current?.close();
    };
  }, [connectWs]);

  // Subscribe when session changes
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && sessionId) {
      wsRef.current.send(JSON.stringify({ type: "subscribe", sessionId }));
    }
  }, [sessionId]);

  const handleWsEvent = useCallback((evt: any) => {
    // WebSocket is ONLY used for session snapshots and status updates.
    // ALL chat events (token, done, tool_call, tool_result, etc.) go exclusively
    // through the SSE fetch reader in sendMessage() to avoid duplicate messages.
    if (evt.type === "session_snapshot" && evt.messages) {
      const uiMsgs: UIMessage[] = evt.messages.map((m: any, i: number) => ({
        id: `snap-${i}`,
        type: m.type === "assistant" ? "assistant" : "user",
        text: m.content || "",
        timestamp: m.timestamp || Date.now(),
      }));
      setMessages(uiMsgs);
    } else if (evt.type === "status") {
      if (evt.status === "streaming") { setStreaming(true); }
      else if (evt.status === "idle") { setStreaming(false); setStreamingText(""); }
    }
  }, []);

  // Create session on mount
  useEffect(() => {
    (async () => {
      try {
        const savedModel = localStorage.getItem("tensor-model") || undefined;
        const res = await fetch(`${API}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: savedModel }),
        });
        const data = await res.json();
        setSessionId(data.session_id);
        setConnected(true);
        // Set model on the new session if we have a saved preference
        if (savedModel) {
          fetch(`${API}/sessions/${data.session_id}/model`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: savedModel }),
          }).catch(() => {});
        }
        // Add to sessions list
        setSessions((prev) => [
          { id: data.session_id, title: "New conversation", timestamp: Date.now() },
          ...prev,
        ]);
      } catch {
        setConnected(false);
      }
    })();
  }, [API]);

  const addMessage = useCallback((msg: Omit<UIMessage, "id">) => {
    const id = nextId();
    setMessages((prev) => [...prev, { ...msg, id }]);
    return id;
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<UIMessage>) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  }, []);

  // Generate a short title from user message (like Claude Code)
  const generateTitle = useCallback((userText: string): string => {
    const text = userText.trim();
    // If it starts with /, it's a command
    if (text.startsWith("/")) return text.split(" ")[0];
    // Strip markdown formatting
    const clean = text.replace(/[#*`_~\[\]()]/g, "").trim();
    // Take first sentence or first N words
    const firstSentence = clean.split(/[.!?\n]/)[0]?.trim() || clean;
    const words = firstSentence.split(/\s+/);
    if (words.length <= 6) return firstSentence;
    return words.slice(0, 6).join(" ") + "\u2026";
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !sessionId || streaming) return;

    addMessage({ type: "user", text, timestamp: Date.now() });
    setInput("");
    setStreaming(true);
    setStreamingText("");
    setCurrentTool(null);
    userScrolledUpRef.current = false; // re-stick to bottom on new message
    setCompletionText(null);
    turnResponseLenRef.current = 0;
    setTurnTokenEstimate(0);

    // Auto-title: if this is the first message in the session, generate title
    const isFirstMessage = messages.length === 0;
    if (isFirstMessage) {
      const title = generateTitle(text);
      setSessions((prev) =>
        prev.map((s) => s.id === sessionId ? { ...s, title } : s)
      );
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const streamUrl = `${STREAM_API}/sessions/${sessionId}/stream?message=${encodeURIComponent(text)}&effortLevel=${encodeURIComponent(effortLevel)}&thinkingMode=${appSettings.thinkingMode ? "true" : "false"}`;
      const res = await fetch(streamUrl, { signal: controller.signal });
      if (!res.ok) {
        const errBody = await res.text().catch(() => res.statusText);
        throw new Error(`${res.status} ${errBody}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream reader");

      const decoder = new TextDecoder();
      let buffer = "";
      let currentText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));

            if (evt.type === "system") {
              setSessionInfo({
                id: evt.session_id || sessionId,
                model: evt.model || "claude-sonnet-4-6",
                tools: evt.tools || [],
                permissionMode: evt.permissionMode || "bypass",
                cwd: evt.cwd || "~",
              });
              if (evt.permissionMode && PERMISSION_MODES.includes(evt.permissionMode)) {
                setPermissionMode(evt.permissionMode as PermissionMode);
              }
            } else if (evt.type === "assistant" && evt.message?.content) {
              for (const block of evt.message.content) {
                if (block.type === "text") {
                  currentText += block.text;
                  setStreamingText(currentText);
                  turnResponseLenRef.current += block.text.length;
                  setTurnTokenEstimate(Math.round(turnResponseLenRef.current / 4));
                } else if (block.type === "tool_use") {
                  if (currentText) {
                    addMessage({ type: "assistant", text: currentText, model: sessionInfo.model, timestamp: Date.now() });
                    currentText = "";
                    setStreamingText("");
                  }
                  const toolId = block.id || nextId();
                  const inputStr = typeof block.input === "string" ? block.input : JSON.stringify(block.input);
                  const parsed = parseToolInput(block.name, inputStr);
                  setCurrentTool(block.name);
                  const msgId = addMessage({
                    type: "tool_use", text: "", toolName: block.name, toolInput: inputStr,
                    toolId, isRunning: true, filePath: parsed.file_path, timestamp: Date.now(),
                  });
                  activeToolUsesRef.current.set(toolId, { name: block.name, startTime: Date.now(), msgId });
                }
              }
            } else if (evt.type === "thinking") {
              const chunk = evt.text || evt.content || "";
              const isRedacted = !!evt.redacted;
              turnResponseLenRef.current += chunk.length;
              setTurnTokenEstimate(Math.round(turnResponseLenRef.current / 4));
              if (currentThinkingIdRef.current && !isRedacted) {
                // Append to existing thinking message
                setMessages(prev => prev.map(m =>
                  m.id === currentThinkingIdRef.current
                    ? { ...m, text: m.text + chunk }
                    : m
                ));
              } else {
                // First thinking chunk or new redacted block — create the message
                const id = addMessage({ type: "thinking", text: chunk, isStreaming: true, redacted: isRedacted, timestamp: Date.now() });
                currentThinkingIdRef.current = isRedacted ? null : id;  // Don't track redacted for appending
              }
            } else if (evt.type === "tool_input_delta") {
              turnResponseLenRef.current += (evt.partial_json || "").length;
              setTurnTokenEstimate(Math.round(turnResponseLenRef.current / 4));
              // Stream tool input as it builds up — find the active tool_use message
              const toolId = evt.tool?.id;
              const activeInfo = toolId ? activeToolUsesRef.current.get(toolId) : undefined;
              if (activeInfo) {
                setMessages(prev => prev.map(m =>
                  m.id === activeInfo.msgId
                    ? { ...m, toolInput: (m.toolInput || "") + (evt.partial_json || "") }
                    : m
                ));
              }
            } else if (evt.type === "tool_output_delta") {
              // Partial tool output streaming — update the most recent tool_result or create one
              const toolId = evt.tool?.id;
              const activeInfo = toolId ? activeToolUsesRef.current.get(toolId) : undefined;
              if (activeInfo) {
                // Append to the tool_use message's text as a preview
                setMessages(prev => prev.map(m =>
                  m.id === activeInfo.msgId
                    ? { ...m, text: (m.text || "") + (evt.content || "") }
                    : m
                ));
              }
            } else if (evt.type === "tool_progress") {
              // Update running tool with elapsed time
              const toolId = evt.tool?.id;
              const activeInfo = toolId ? activeToolUsesRef.current.get(toolId) : undefined;
              if (activeInfo) {
                updateMessage(activeInfo.msgId, {
                  durationMs: (evt.elapsed_time_seconds || 0) * 1000,
                });
              }
            } else if (evt.type === "content_block_start") {
              if (evt.content_block?.type === "thinking") {
                const id = addMessage({ type: "thinking", text: "", isStreaming: true, timestamp: Date.now() });
                currentThinkingIdRef.current = id;
              } else if (evt.content_block?.type === "redacted_thinking") {
                addMessage({ type: "thinking", text: "", isStreaming: true, redacted: true, timestamp: Date.now() });
                // Don't track redacted — nothing to append to
              }
              // tool_use content_block_start is handled via the tool_call event
            } else if (evt.type === "content_block_stop") {
              // Finalize thinking block
              if (currentThinkingIdRef.current) {
                updateMessage(currentThinkingIdRef.current, { isStreaming: false });
                currentThinkingIdRef.current = null;
              }
            } else if (evt.type === "token") {
              currentText += evt.content;
              setStreamingText(currentText);
              turnResponseLenRef.current += (evt.content || "").length;
              setTurnTokenEstimate(Math.round(turnResponseLenRef.current / 4));
            } else if (evt.type === "stream_start") {
              currentText = "";
              setStreamingText("");
            } else if (evt.type === "tool_call" && (evt.message || evt.tool)) {
              if (currentText) {
                addMessage({ type: "assistant", text: currentText, model: sessionInfo.model, timestamp: Date.now() });
                currentText = "";
                setStreamingText("");
              }
              // Support both evt.tool (new format) and evt.message.blocks (old format)
              const toolData = evt.tool || evt.message?.blocks?.[0];
              if (toolData) {
                const toolName = toolData.name;
                const toolId = toolData.id || nextId();
                const inputStr = typeof toolData.input === "string" ? toolData.input : JSON.stringify(toolData.input || "");
                const parsed = parseToolInput(toolName, inputStr);
                setCurrentTool(toolName);
                const msgId = addMessage({
                  type: "tool_use", text: "", toolName, toolInput: inputStr,
                  toolId, isRunning: true, filePath: parsed.file_path,
                  needsPermission: evt.dangerous, permissionDetail: evt.detail, timestamp: Date.now(),
                });
                activeToolUsesRef.current.set(toolId, { name: toolName, startTime: Date.now(), msgId });
                // Show permission dialog if dangerous
                if (evt.dangerous) {
                  setPendingPermission({ toolName, input: inputStr, detail: evt.detail || "" });
                }
              }
            } else if (evt.type === "tool_result") {
              setCurrentTool(null);
              const toolInfo = evt.tool || {};
              const toolId = toolInfo.id || evt.message?.blocks?.[0]?.tool_use_id;
              const output = evt.result?.output || evt.message?.blocks?.[0]?.output || evt.message?.blocks?.[0]?.content || "";
              const isError = evt.result?.is_error || false;

              const activeInfo = toolId ? activeToolUsesRef.current.get(toolId) : undefined;
              const toolName = activeInfo?.name || toolInfo.name;
              let durationMs: number | undefined;

              if (activeInfo) {
                durationMs = Date.now() - activeInfo.startTime;
                updateMessage(activeInfo.msgId, { isRunning: false, durationMs });
                activeToolUsesRef.current.delete(toolId);
              } else {
                // Fallback: clear all running tools
                activeToolUsesRef.current.forEach((info) => {
                  updateMessage(info.msgId, { isRunning: false, durationMs: Date.now() - info.startTime });
                });
                activeToolUsesRef.current.clear();
              }

              // Use structured data from bridge when available, fall back to heuristics
              let filePath: string | undefined = evt.result?.filePath;
              let diff: string | undefined = evt.result?.diff;
              let stdout: string | undefined = evt.result?.stdout;
              let stderr: string | undefined = evt.result?.stderr;
              let exitCode: number | undefined = evt.result?.exit_code;
              let matchCount: number | undefined;
              let fileCount: number | undefined;

              if (toolName && BASH_TOOLS.has(toolName)) {
                // Use bridge-provided stdout/stderr if available, else fall back to heuristic
                if (stdout == null && stderr == null) {
                  const split = splitStdoutStderr(output);
                  stdout = split.stdout;
                  stderr = split.stderr;
                }
                if (exitCode == null) exitCode = isError ? 1 : 0;
              } else if (toolName && EDIT_TOOLS.has(toolName)) {
                if (!diff) diff = extractDiffFromResult(output) || undefined;
              } else if (toolName && SEARCH_TOOLS.has(toolName)) {
                const counts = countMatches(output);
                matchCount = counts.matchCount;
                fileCount = counts.fileCount;
              }

              addMessage({
                type: "tool_result", text: output, toolName, toolId,
                isError, durationMs, filePath, diff,
                stdout, stderr, exitCode,
                matchCount, fileCount, timestamp: Date.now(),
              });

              // Collect diffs for the diff viewer
              if (diff && filePath) {
                setDiffFiles(prev => {
                  const existing = prev.find(f => f.path === filePath);
                  if (existing) {
                    return prev.map(f => f.path === filePath ? { ...f, diff } : f);
                  }
                  return [...prev, { path: filePath, diff, status: "pending" as const }];
                });
              }
            } else if (evt.type === "result") {
              if (evt.usage) {
                setInputTokens((p) => p + (evt.usage.input_tokens || 0) + (evt.usage.cache_read_input_tokens || 0));
                setOutputTokens((p) => p + (evt.usage.output_tokens || 0));
              }
              if (evt.total_cost_usd) setCostUsd((p) => p + evt.total_cost_usd);
              const totalTokens = (evt.usage?.input_tokens || 0) + (evt.usage?.cache_read_input_tokens || 0);
              setContextPercent(Math.min(100, Math.round((totalTokens / 200000) * 100)));
              // Track line changes if provided
              if (evt.lines_added != null) setLinesAdded((p) => p + evt.lines_added);
              if (evt.lines_removed != null) setLinesRemoved((p) => p + evt.lines_removed);
            } else if (evt.type === "permission_request") {
              // Bridge server relays permission requests from CLI
              setPendingPermission({
                toolName: evt.toolName || "Unknown",
                toolId: evt.toolId,
                input: typeof evt.input === "string" ? evt.input : JSON.stringify(evt.input || ""),
                detail: evt.detail || "",
                filePath: evt.filePath,
                diff: evt.diff,
              });
            } else if (evt.type === "task_update") {
              // Todo/task updates from CLI
              if (evt.tasks) {
                setTodoTasks(evt.tasks.map((t: any, i: number) => ({
                  id: t.id || `task-${i}`,
                  content: t.content || t.text || "",
                  status: t.status || "pending",
                  activeForm: t.activeForm,
                })));
              } else if (evt.task) {
                setTodoTasks(prev => {
                  const existing = prev.find(t => t.id === evt.task.id);
                  if (existing) return prev.map(t => t.id === evt.task.id ? { ...t, ...evt.task } : t);
                  return [...prev, { id: evt.task.id || nextId(), content: evt.task.content, status: evt.task.status, activeForm: evt.task.activeForm }];
                });
              }
            } else if (evt.type === "memory_saved" || evt.type === "memory_read" || evt.type === "memory_updated" || evt.type === "memory_deleted") {
              addMessage({
                type: "memory", text: evt.content || "",
                memoryAction: evt.action || evt.type.replace("memory_", "") as any,
                memoryFileName: evt.path || evt.fileName || "",
                memoryContent: evt.content, timestamp: Date.now(),
              });
            } else if (evt.type === "plan_mode") {
              if (evt.enabled && evt.plan) {
                addMessage({
                  type: "plan", text: evt.plan.title || "Plan",
                  planTitle: evt.plan.title, planSteps: evt.plan.steps,
                  planIsActive: true, timestamp: Date.now(),
                });
              }
              setCurrentMode(evt.enabled ? "plan" : "code");
            } else if (evt.type === "agent_notification") {
              addMessage({
                type: "agent", text: evt.description || evt.message || "",
                agentName: evt.agentName || evt.name || "Agent",
                agentStatus: evt.status || "running",
                agentDescription: evt.description || "",
                agentDepth: evt.depth || 0,
                durationMs: evt.durationMs, timestamp: Date.now(),
              });
              // Update agents list
              setAgents(prev => {
                const id = evt.agentId || evt.name || nextId();
                const existing = prev.find(a => a.id === id);
                if (existing) {
                  return prev.map(a => a.id === id ? { ...a, status: evt.status || a.status, progress: evt.progress } : a);
                }
                return [...prev, {
                  id, name: evt.agentName || evt.name || "Agent",
                  description: evt.description || "", model: evt.model || sessionInfo.model,
                  status: evt.status || "running", startTime: Date.now(),
                }];
              });
            } else if (evt.type === "task_started") {
              // Sub-agent spawned — add agent message
              addMessage({
                type: "agent", text: evt.description || "",
                agentName: evt.agentName || "Agent",
                agentStatus: "spawned",
                agentDescription: evt.description || "",
                agentDepth: evt.depth || 0,
                timestamp: Date.now(),
              });
              setAgents(prev => {
                const id = evt.agentId || evt.taskId || nextId();
                return [...prev, {
                  id, name: evt.agentName || "Agent",
                  description: evt.description || "", model: evt.model || sessionInfo.model,
                  status: "running", startTime: Date.now(),
                }];
              });
            } else if (evt.type === "task_progress") {
              // Update existing agent's progress
              const id = evt.agentId || evt.taskId;
              if (id) {
                setAgents(prev => prev.map(a =>
                  a.id === id ? { ...a, status: evt.status || a.status, progress: evt.progress } : a
                ));
              }
            } else if (evt.type === "task_notification") {
              addMessage({
                type: "system", text: evt.message || "",
                timestamp: Date.now(),
              });
            } else if (evt.type === "progress") {
              // Generic progress update — could be search, download, etc.
              // Update background tasks or show inline progress
              if (evt.taskId) {
                setBackgroundTasks(prev => prev.map(t =>
                  t.id === evt.taskId ? { ...t, progress: evt.percent } : t
                ));
              }
            } else if (evt.type === "web_search") {
              addMessage({
                type: "system",
                text: `Searching: ${evt.query || ""}`,
                timestamp: Date.now(),
              });
            } else if (evt.type === "citation") {
              // Citations are informational — could be shown in assistant messages
              // For now, skip (they're embedded in the text response)
            } else if (evt.type === "prompt_suggestion") {
              // Could be used for input suggestions - store for later
              // For now, no visual rendering needed
            } else if (evt.type === "heartbeat") {
              // Connection keepalive - no action needed
            } else if (evt.type === "error") {
              addMessage({
                type: "error",
                text: evt.error || evt.message || "Unknown error",
                isError: true,
                timestamp: Date.now(),
                errorType: evt.errorType || evt.error_type || "unknown",
                details: evt.details || null,
                retryable: evt.retryable ?? false,
              });
            } else if (evt.type === "rate_limit") {
              addMessage({
                type: "rate_limit", text: evt.message || "Rate limited",
                retryAfterMs: evt.retry_after_ms || evt.retryAfterMs || 30000,
                timestamp: Date.now(),
              });
            } else if (evt.type === "compact") {
              addMessage({
                type: "compact", text: "Context compacted",
                beforeTokens: evt.beforeTokens || 0, afterTokens: evt.afterTokens || 0,
                compactMessageCount: evt.messageCount || 0, timestamp: Date.now(),
              });
            } else if (evt.type === "done") {
              // Stop streaming FIRST so the streaming text display disappears
              // before the finalized message is added (prevents duplicate render)
              setStreaming(false);
              setStreamingText("");
              setCurrentTool(null);
              if (currentText) {
                addMessage({ type: "assistant", text: currentText, model: sessionInfo.model, timestamp: Date.now() });
                currentText = "";
              }
              // Finalize any in-flight thinking message
              if (currentThinkingIdRef.current) {
                updateMessage(currentThinkingIdRef.current, { isStreaming: false });
                currentThinkingIdRef.current = null;
              }
              // Clear any tools still marked as running
              activeToolUsesRef.current.forEach((info) => {
                updateMessage(info.msgId, { isRunning: false });
              });
              activeToolUsesRef.current.clear();
              // Generate completion text
              const VERBS = ['Baked', 'Brewed', 'Churned', 'Cogitated', 'Cooked', 'Crunched', 'Sautéed', 'Worked'];
              const verb = VERBS[Math.floor(Math.random() * VERBS.length)];
              const turnDur = Date.now() - (messages.filter(m => m.type === 'user').pop()?.timestamp || Date.now());
              const durStr = turnDur < 1000 ? `${turnDur}ms` : turnDur < 60000 ? `${(turnDur/1000).toFixed(1)}s` : `${Math.floor(turnDur/60000)}m ${Math.round((turnDur%60000)/1000)}s`;
              setCompletionText(`${verb} for ${durStr}`);
              fireCompletionNotification();
            }
          } catch { /* skip parse errors */ }
        }
      }

      // Don't flush here — the "done" event handler above already added the message.
      // Flushing again would create a duplicate.
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        addMessage({ type: "error", text: `Error: ${(err as Error).message}`, isError: true, timestamp: Date.now() });
      }
    } finally {
      setStreaming(false);
      setStreamingText("");
      setCurrentTool(null);
      inputRef.current?.focus();
    }
  }, [sessionId, streaming, API, STREAM_API, addMessage, updateMessage, sessionInfo.model]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (streaming) handleAbort();
      else sendMessage(input);
    }
  };

  const handleAbort = () => {
    abortRef.current?.abort();
    setStreaming(false);
    setStreamingText("");
    setCurrentTool(null);
  };

  // ── Command Palette ──
  const handlePaletteSelect = useCallback((action: string) => {
    setShowPalette(false);
    setPaletteFilter("");
    switch (action) {
      case "new":
        setMessages([]);
        setTasks([]);
        setLinesAdded(0);
        setLinesRemoved(0);
        setSessionId(null);
        (async () => {
          try {
            const res = await fetch(`${API}/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
            const data = await res.json();
            setSessionId(data.session_id);
            setSessions((prev) => [
              { id: data.session_id, title: "New conversation", timestamp: Date.now() },
              ...prev,
            ]);
          } catch {}
        })();
        break;
      case "clear": setMessages([]); break;
      case "help":
        addMessage({ type: "system", text: "Commands: /new, /clear, /model, /compact, /help, /settings, /tasks, /cost, /doctor, /export", timestamp: Date.now() });
        break;
      case "cost":
        addMessage({ type: "system", text: `Cost: $${costUsd.toFixed(4)} | Input: ${inputTokens} | Output: ${outputTokens} | Context: ${contextPercent}%`, timestamp: Date.now() });
        break;
      case "settings":
        setShowSettings(true);
        break;
      case "git":
        setShowGitPanel((v) => !v);
        break;
      case "terminal":
        setShowTerminal((v) => !v);
        break;
      case "diff":
        setShowDiffReview((v) => !v);
        break;
      case "buddy":
        setShowBuddy((v) => !v);
        break;
      case "gemma":
        setShowGemma((v) => !v);
        break;
      // New command actions
      case "compact":
        if (sessionId) {
          fetch(`${API}/sessions/${sessionId}/compact`, { method: "POST" }).catch(() => {});
          addMessage({ type: "system", text: "Compacting context...", timestamp: Date.now() });
        }
        break;
      case "agents":
        setShowAgentPanel((v) => !v);
        break;
      case "tasks":
        setShowTaskList((v) => !v);
        break;
      case "search":
        setShowSearch((v) => !v);
        setActivePanel((prev) => prev === "search" ? null : "search");
        break;
      case "files":
        setShowFilePreview((v) => !v);
        break;
      case "file-tree":
        setShowFileTree((v) => !v);
        break;
      case "diff-viewer":
        setShowDiffViewer((v) => !v);
        break;
      case "history":
        setShowConversationHistory((v) => !v);
        break;
      case "system-prompt":
        setShowSystemPrompt((v) => !v);
        break;
      case "export":
        setShowExport((v) => !v);
        break;
      case "mcp":
        setShowMCPPanel((v) => !v);
        break;
      case "background-tasks":
        setShowBGTaskPanel((v) => !v);
        break;
      case "plan":
        setCurrentMode((prev) => prev === "plan" ? "code" : "plan");
        break;
      case "vim":
        setEditorMode((prev) => prev === "vim" ? "normal" : "vim");
        break;
      case "theme":
        setShowSettings(true);
        break;
      case "commit": case "review": case "diff_cmd": case "init": case "simplify":
      case "share": case "rename": case "branch": case "resume":
      case "model": case "fast": case "effort": case "hooks":
      case "permissions": case "skills": case "add-dir": case "context":
      case "memory": case "stats": case "status": case "doctor": case "version":
        // These commands are sent as text to the CLI backend
        sendMessage(`/${action}`);
        break;
      case "scheduled":
        setShowScheduled((v) => !v);
        setActivePanel((prev) => prev === "scheduled" ? null : "scheduled");
        break;
      case "dispatch":
        setShowDispatch((v) => !v);
        setActivePanel((prev) => prev === "dispatch" ? null : "dispatch");
        break;
      default:
        // If it looks like a slash command, send it to the backend
        if (action.startsWith("/")) sendMessage(action);
        break;
    }
  }, [API, addMessage, costUsd, inputTokens, outputTokens, contextPercent, sessionId, sendMessage]);

  // ── Global Keyboard Shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // Escape: close overlays
      if (e.key === "Escape") {
        if (pendingPermission) { /* don't close permission with escape - must choose */ }
        else if (showPalette) { setShowPalette(false); setPaletteFilter(""); }
        else if (showAgentPanel) setShowAgentPanel(false);
        else if (showSearch) { setShowSearch(false); setActivePanel(null); }
        else if (showScheduled) { setShowScheduled(false); setActivePanel(null); }
        else if (showDispatch) { setShowDispatch(false); setActivePanel(null); }
        else if (showCustomize) { setShowCustomize(false); setActivePanel(null); }
        else if (showCowork) setShowCowork(false);
        else if (showGemma) setShowGemma(false);
        else if (showBuddy) setShowBuddy(false);
        else if (showShortcuts) setShowShortcuts(false);
        else if (showModelSelector) setShowModelSelector(false);
        else if (showDiffReview) setShowDiffReview(false);
        else if (showTerminal) setShowTerminal(false);
        else if (showFilePreview) setShowFilePreview(false);
        else if (showGitPanel) setShowGitPanel(false);
        else if (showFileTree) setShowFileTree(false);
        else if (showDiffViewer) setShowDiffViewer(false);
        else if (showConversationHistory) setShowConversationHistory(false);
        else if (showSystemPrompt) setShowSystemPrompt(false);
        else if (showExport) setShowExport(false);
        else if (showInlineEditor) { setShowInlineEditor(false); setInlineEditorPath(""); }
        else if (showMCPPanel) setShowMCPPanel(false);
        else if (showBGTaskPanel) setShowBGTaskPanel(false);
        else if (showKairos) { setShowKairos(false); setActivePanel(null); }
        else if (showSwarm) { setShowSwarm(false); setActivePanel(null); }
        else if (showSecurityReview) { setShowSecurityReview(false); setActivePanel(null); }
        else if (showInsights) { setShowInsights(false); setActivePanel(null); }
        else if (showStickers) { setShowStickers(false); setActivePanel(null); }
        else if (showUndercover) { setShowUndercover(false); setActivePanel(null); }
        else if (showUltraReview) { setShowUltraReview(false); setActivePanel(null); }
        else if (showVerifiers) { setShowVerifiers(false); setActivePanel(null); }
        else if (showSettings) setShowSettings(false);
        else if (streaming) handleAbort();
        return;
      }

      // Cmd+K: command palette
      if (meta && e.key === "k") { e.preventDefault(); setShowPalette((v) => !v); return; }
      // Cmd+N: new session
      if (meta && e.key === "n") { e.preventDefault(); handlePaletteSelect("new"); return; }
      // Cmd+L: clear
      if (meta && e.key === "l") { e.preventDefault(); handlePaletteSelect("clear"); return; }
      // Cmd+B: toggle sidebar
      if (meta && e.key === "b") { e.preventDefault(); setSidebarOpen((v) => !v); return; }
      // Cmd+J: toggle terminal
      if (meta && e.key === "j") { e.preventDefault(); setShowTerminal((v) => !v); return; }
      // Ctrl+T: toggle task list
      if (e.ctrlKey && e.key === "t") { e.preventDefault(); setShowTaskList((v) => !v); return; }
      // Cmd+E: toggle file tree
      if (meta && e.key === "e") { e.preventDefault(); setShowFileTree((v) => !v); return; }
      // Cmd+Shift+E: toggle export
      if (meta && e.shiftKey && e.key === "E") { e.preventDefault(); setShowExport((v) => !v); return; }
      // Cmd+Shift+H: conversation history
      if (meta && e.shiftKey && e.key === "H") { e.preventDefault(); setShowConversationHistory((v) => !v); return; }
      // Cmd+Shift+M: MCP panel
      if (meta && e.shiftKey && e.key === "M") { e.preventDefault(); setShowMCPPanel((v) => !v); return; }
      // Cmd+?: shortcuts dialog
      if (meta && e.shiftKey && e.key === "?") { e.preventDefault(); setShowShortcuts((v) => !v); return; }
      // Shift+Tab: cycle permission modes
      if (e.shiftKey && e.key === "Tab") {
        e.preventDefault();
        setPermissionMode((prev) => {
          const idx = PERMISSION_MODES.indexOf(prev);
          return PERMISSION_MODES[(idx + 1) % PERMISSION_MODES.length];
        });
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showPalette, showDiffReview, showTerminal, showFilePreview, showGitPanel, showSettings, showSearch, showScheduled, showDispatch, showCustomize, showCowork, showGemma, showShortcuts, showModelSelector, showFileTree, showDiffViewer, showConversationHistory, showSystemPrompt, showExport, showInlineEditor, showMCPPanel, showBGTaskPanel, showKairos, showSwarm, showSecurityReview, showInsights, showStickers, showUndercover, showUltraReview, showVerifiers, streaming, handleAbort, handlePaletteSelect]);

  // ── Input change with palette & slash menu detection ──
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    // Detect / at start for command palette + slash menu
    if (val.startsWith("/") && val.length > 0 && val.length < 20) {
      setShowPalette(true);
      setPaletteFilter(val);
      setShowSlashMenu(true);
      setSlashQuery(val.slice(1));
    } else if ((showPalette || showSlashMenu) && !val.startsWith("/")) {
      setShowPalette(false);
      setPaletteFilter("");
      setShowSlashMenu(false);
      setSlashQuery("");
    } else if (showPalette) {
      setPaletteFilter(val);
      setSlashQuery(val.slice(1));
    }
    // Auto-resize textarea
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  };

  // Permission handlers — send decision to bridge server
  const handlePermAllow = useCallback(() => {
    if (pendingPermission?.toolId && sessionId) {
      fetch(`${API}/sessions/${sessionId}/permission`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId: pendingPermission.toolId, decision: "allow" }),
      }).catch(() => {});
    }
    setPendingPermission(null);
  }, [pendingPermission, sessionId, API]);

  const handlePermDeny = useCallback(() => {
    if (pendingPermission?.toolId && sessionId) {
      fetch(`${API}/sessions/${sessionId}/permission`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId: pendingPermission.toolId, decision: "deny" }),
      }).catch(() => {});
    }
    setPendingPermission(null);
  }, [pendingPermission, sessionId, API]);

  const handlePermAlwaysAllow = useCallback(() => {
    if (pendingPermission?.toolId && sessionId) {
      fetch(`${API}/sessions/${sessionId}/permission`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId: pendingPermission.toolId, decision: "always_allow" }),
      }).catch(() => {});
    }
    setPendingPermission(null);
  }, [pendingPermission, sessionId, API]);

  // ── New handlers ──
  const handleNewSession = useCallback(() => {
    handlePaletteSelect("new");
  }, [handlePaletteSelect]);

  const handleSelectSession = useCallback((id: string) => {
    setSessionId(id);
    setMessages([]);
    setStreamingText("");
  }, []);

  const handleSessionRename = useCallback((newTitle: string) => {
    if (!sessionId) return;
    setSessions((prev) =>
      prev.map((s) => s.id === sessionId ? { ...s, title: newTitle } : s)
    );
  }, [sessionId]);

  const handleKillTask = useCallback((taskId: string) => {
    setBackgroundTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const handleKillAllTasks = useCallback(() => {
    setBackgroundTasks([]);
  }, []);

  const handlePermissionModeChange = useCallback((mode: PermissionMode) => {
    setPermissionMode(mode);
    setSessionInfo((prev) => ({ ...prev, permissionMode: mode }));
  }, []);

  // Panel toggle handlers
  const handleOpenPanel = useCallback((panel: NavPanel) => {
    setActivePanel((prev) => prev === panel ? null : panel);
    if (panel === "search") setShowSearch((v) => !v);
    else if (panel === "scheduled") setShowScheduled((v) => !v);
    else if (panel === "dispatch") setShowDispatch((v) => !v);
    else if (panel === "customize") setShowCustomize((v) => !v);
    else if (panel === "kairos") setShowKairos((v) => !v);
    else if (panel === "swarm") setShowSwarm((v) => !v);
    else if (panel === "security-review") setShowSecurityReview((v) => !v);
    else if (panel === "insights") setShowInsights((v) => !v);
    else if (panel === "stickers") setShowStickers((v) => !v);
    else if (panel === "undercover") setShowUndercover((v) => !v);
    else if (panel === "ultra-review") setShowUltraReview((v) => !v);
    else if (panel === "verifiers") setShowVerifiers((v) => !v);
  }, []);

  const handleModelChange = useCallback((model: string) => {
    setSessionInfo((prev) => ({ ...prev, model }));
    setShowModelSelector(false);
    // Notify bridge server to switch model (restarts CLI with new --model flag)
    if (sessionId) {
      fetch(`${API}/sessions/${sessionId}/model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      }).catch(() => {});
    }
    // Persist choice
    try { localStorage.setItem("tensor-model", model); } catch {}
  }, [sessionId, API]);

  // ── New feature handlers ──
  const handleFileSelect = useCallback((filePath: string) => {
    setInlineEditorPath(filePath);
    setShowInlineEditor(true);
  }, []);

  const handleImageDrop = useCallback((images: Array<{ file: File; dataUrl: string; name: string }>) => {
    setAttachedImages(prev => [...prev, ...images]);
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleDiffAccept = useCallback((path: string) => {
    setDiffFiles(prev => prev.map(f => f.path === path ? { ...f, status: "accepted" as const } : f));
  }, []);

  const handleDiffReject = useCallback((path: string) => {
    setDiffFiles(prev => prev.map(f => f.path === path ? { ...f, status: "rejected" as const } : f));
  }, []);

  const handleDiffAcceptAll = useCallback(() => {
    setDiffFiles(prev => prev.map(f => ({ ...f, status: "accepted" as const })));
  }, []);

  const handleDiffRejectAll = useCallback(() => {
    setDiffFiles(prev => prev.map(f => ({ ...f, status: "rejected" as const })));
  }, []);

  const handleSaveSystemPrompt = useCallback((prompt: string) => {
    setSystemPrompt(prompt);
    setShowSystemPrompt(false);
    // Push to bridge server
    if (sessionId) {
      fetch(`${API}/system-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "write", projectPath: sessionInfo.cwd, content: prompt }),
      }).catch(() => {});
    }
  }, [sessionId, API, sessionInfo.cwd]);

  const handleInlineEditorSave = useCallback((content: string, filePath: string) => {
    fetch(`${API}/filesystem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "write", path: filePath, content }),
    }).catch(() => {});
  }, [API]);

  const handleKillBGTask = useCallback((id: string) => {
    setBgTasks(prev => prev.map(t => t.id === id ? { ...t, status: "cancelled" as const, endTime: Date.now() } : t));
  }, []);

  const handleClearCompletedBGTasks = useCallback(() => {
    setBgTasks(prev => prev.filter(t => t.status === "running"));
  }, []);

  const handleCloseSession = useCallback((id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (id === sessionId && sessions.length > 1) {
      const remaining = sessions.filter(s => s.id !== id);
      if (remaining.length > 0) {
        setSessionId(remaining[0].id);
        setMessages([]);
      }
    }
  }, [sessionId, sessions]);

  const hasMessages = messages.length > 0 || streaming;
  const currentSessionTitle = sessions.find((s) => s.id === sessionId)?.title || "New conversation";

  // Update window title
  useEffect(() => {
    document.title = currentSessionTitle === "New conversation"
      ? "Tensor Code"
      : `${currentSessionTitle} - Tensor Code`;
  }, [currentSessionTitle]);

  return (
    <ToastProvider>
    <div className={`app-shell ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}${!hasMessages ? " show-phoenix" : ""}`}>
      <PhoenixBackground />

      {/* ── Sidebar ── */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        onNewSession={handleNewSession}
        onOpenSettings={() => setShowSettings(true)}
        sessions={sessions}
        activeSessionId={sessionId}
        onSelectSession={handleSelectSession}
        onRenameSession={(id, name) => setSessions((prev) => prev.map((s) => s.id === id ? { ...s, title: name } : s))}
        onArchiveSession={(id) => setSessions((prev) => prev.map((s) => s.id === id ? { ...s, archived: true } : s))}
        onDeleteSession={(id) => setSessions((prev) => prev.filter((s) => s.id !== id))}
        onPinSession={(id) => setSessions((prev) => prev.map((s) => s.id === id ? { ...s, pinned: !s.pinned } : s))}
        onOpenSearch={() => handleOpenPanel("search")}
        onOpenScheduled={() => handleOpenPanel("scheduled")}
        onOpenDispatch={() => handleOpenPanel("dispatch")}
        onOpenCustomize={() => handleOpenPanel("customize")}
        onOpenAgents={() => setShowAgentPanel(true)}
        onOpenTasks={() => setShowTaskList((v) => !v)}
        onOpenMemory={() => sendMessage("/memory")}
        activePanel={activePanel}
        onOpenFileTree={() => setShowFileTree((v) => !v)}
        onOpenHistory={() => setShowConversationHistory(true)}
        onOpenMCP={() => setShowMCPPanel(true)}
        onOpenExport={() => setShowExport(true)}
        onOpenSystemPrompt={() => setShowSystemPrompt(true)}
        onOpenKairos={() => handleOpenPanel("kairos")}
        onOpenSwarm={() => handleOpenPanel("swarm")}
        onOpenSecurityReview={() => handleOpenPanel("security-review")}
        onOpenInsights={() => handleOpenPanel("insights")}
        onOpenStickers={() => handleOpenPanel("stickers")}
        onOpenUndercover={() => handleOpenPanel("undercover")}
        onOpenUltraReview={() => handleOpenPanel("ultra-review")}
        onOpenVerifiers={() => handleOpenPanel("verifiers")}
      />

      {/* ── File Tree Sidebar ── */}
      {showFileTree && (
        <FileTreePanel
          isOpen={showFileTree}
          onClose={() => setShowFileTree(false)}
          rootPath={sessionInfo.cwd}
          onFileSelect={handleFileSelect}
          apiBase={API}
        />
      )}

      {/* ── Main Content ── */}
      <div className="main-content">
        {/* ── Tab Bar (only when multiple sessions) ── */}
        {sessions.length > 1 && (
          <TabBar
            sessions={sessions.map(s => ({ id: s.id, title: s.title, model: s.model, timestamp: s.timestamp }))}
            activeSessionId={sessionId}
            onSelectSession={handleSelectSession}
            onCloseSession={handleCloseSession}
            onNewSession={handleNewSession}
          />
        )}

        <LogoHeader
          model={sessionInfo.model}
          permissionMode={permissionMode}
          contextPercent={contextPercent}
          sessionName={currentSessionTitle}
          connected={connected}
          tools={sessionInfo.tools}
          sessionId={sessionId || undefined}
          onSessionRename={handleSessionRename}
          diffStats={linesAdded || linesRemoved ? { added: linesAdded, removed: linesRemoved } : undefined}
          onDiffClick={() => setShowDiffReview(true)}
          onReviewCode={() => setShowDiffReview(true)}
          backgroundTaskBadge={
            backgroundTasks.length > 0 ? (
              <BackgroundTaskBadge
                tasks={backgroundTasks}
                onKillTask={handleKillTask}
                onKillAll={handleKillAllTasks}
              />
            ) : undefined
          }
        />

        <SessionToolbar
          sessionTitle={currentSessionTitle}
          onRename={handleSessionRename}
          linesAdded={linesAdded}
          linesRemoved={linesRemoved}
          onOpenDiff={() => setShowDiffReview(true)}
          onOpenPreview={(action) => {
            if (action === "start" || action === "configure") setShowFilePreview(true);
            else setShowFilePreview(false);
          }}
          onReviewCode={() => setShowDiffReview(true)}
        />

        <ImageDropZone onImageDrop={handleImageDrop} disabled={streaming}>
        <div className="message-scroll" ref={scrollRef}>
          {!hasMessages && (
            <WelcomeScreen
              model={sessionInfo.model}
              cwd={sessionInfo.cwd}
              onSuggestionClick={sendMessage}
              recentSessions={sessions.slice(0, 5).map(s => ({ id: s.id, title: s.title, timestamp: s.timestamp, model: (s as any).model }))}
              onSelectSession={handleSelectSession}
            />
          )}

          {(() => {
            // Group consecutive tool_use/tool_result/file_edit messages into compact groups
            type GroupedItem = { type: "tool_group"; messages: UIMessage[]; key: string } | { type: "single"; msg: UIMessage; idx: number };
            const grouped: GroupedItem[] = [];
            let i = 0;
            while (i < messages.length) {
              if (messages[i].type === "tool_use" || messages[i].type === "tool_result" || messages[i].type === "file_edit") {
                const toolGroup: UIMessage[] = [];
                const groupKey = messages[i].id;
                while (i < messages.length && (messages[i].type === "tool_use" || messages[i].type === "tool_result" || messages[i].type === "file_edit")) {
                  toolGroup.push(messages[i]);
                  i++;
                }
                grouped.push({ type: "tool_group", messages: toolGroup, key: groupKey });
              } else {
                grouped.push({ type: "single", msg: messages[i], idx: i });
                i++;
              }
            }

            return grouped.map((item) => {
              if (item.type === "tool_group") {
                // All tool groups render as CLI-style compact lines
                return <ToolGroup key={item.key} messages={item.messages} />;
              }
              const { msg } = item;
              switch (msg.type) {
                case "user": return <UserMessage key={msg.id} text={msg.text} />;
                case "assistant": return <AssistantTextMessage key={msg.id} text={msg.text} model={msg.model} />;
                case "thinking": return <AssistantThinkingMessage key={msg.id} text={msg.text} isStreaming={msg.isStreaming} redacted={msg.redacted} />;
                case "bash": return (
                  <BashOutputMessage
                    key={msg.id}
                    command={msg.text}
                    stdout={msg.stdout || msg.text}
                    stderr={msg.stderr}
                    exitCode={msg.exitCode}
                    timestamp={msg.timestamp}
                    durationMs={msg.durationMs}
                  />
                );
                case "tool_result": return (
                  <ToolResultMessage
                    key={msg.id}
                    toolName={msg.toolName}
                    toolId={msg.toolId}
                    output={msg.text}
                    isError={msg.isError}
                    durationMs={msg.durationMs}
                    filePath={msg.filePath}
                    matchCount={msg.matchCount}
                    fileCount={msg.fileCount}
                  />
                );
                case "file_edit": return (
                  <FileEditMessage
                    key={msg.id}
                    filePath={msg.filePath || ""}
                    diff={msg.diff}
                    timestamp={msg.timestamp}
                  />
                );
                case "agent": return (
                  <AgentMessage
                    key={msg.id}
                    agentName={msg.agentName || "Agent"}
                    description={msg.agentDescription || msg.text}
                    status={msg.agentStatus || "running"}
                    output={msg.text}
                    durationMs={msg.durationMs}
                    depth={msg.agentDepth}
                  />
                );
                case "memory": return (
                  <MemoryMessage
                    key={msg.id}
                    action={msg.memoryAction || "saved"}
                    fileName={msg.memoryFileName || ""}
                    content={msg.memoryContent}
                  />
                );
                case "plan": return (
                  <PlanMessage
                    key={msg.id}
                    title={msg.planTitle || "Plan"}
                    steps={msg.planSteps || []}
                    isActive={msg.planIsActive}
                  />
                );
                case "rate_limit": return (
                  <RateLimitMessage
                    key={msg.id}
                    message={msg.text}
                    retryAfterMs={msg.retryAfterMs}
                    onRetry={() => sendMessage(messages.filter(m => m.type === "user").pop()?.text || "")}
                  />
                );
                case "compact": return (
                  <CompactMessage
                    key={msg.id}
                    beforeTokens={msg.beforeTokens || 0}
                    afterTokens={msg.afterTokens || 0}
                    messageCount={msg.compactMessageCount || 0}
                  />
                );
                case "error": return <div className="cli-system cli-system-error" key={msg.id}>{msg.text}</div>;
                case "system": return <div className="cli-system" key={msg.id}>{msg.text}</div>;
                default: return null;
              }
            });
          })()}

          {/* Streaming assistant text — always show if there's text, even alongside tool calls */}
          {streaming && streamingText && (
            <div className="cli-assistant-text">
              <StreamingText text={streamingText} isStreaming={true} />
            </div>
          )}

          {/* Spinner — shows at bottom during streaming, below tool call messages */}
          {streaming && (
            <Spinner
              verb={currentTool ? `Using ${currentTool}` : undefined}
              toolName={currentTool || undefined}
              startTime={undefined}
              tokenCount={outputTokens + turnTokenEstimate}
            />
          )}

          {false && completionText && !streaming && (
            <div className="cli-completion">{completionText}</div>
          )}
        </div>
        </ImageDropZone>

        {/* Todo tasks from CLI above input */}
        {todoTasks.length > 0 && showTaskList && (
          <TaskList tasks={todoTasks.map(t => ({ id: t.id, description: t.content, status: t.status, activeForm: t.activeForm }))} />
        )}
        {tasks.length > 0 && showTaskList && <TaskList tasks={tasks} />}

        {/* Plan mode banner */}
        {currentMode === "plan" && (
          <PlanMode
            isActive={currentMode === "plan"}
            plan={planData}
            onExecute={() => { setCurrentMode("code"); }}
            onEdit={(p) => setPlanData(p)}
            onExit={() => { setCurrentMode("code"); setPlanData(null); }}
            onStepAction={() => {}}
          />
        )}

        {/* Image preview */}
        {attachedImages.length > 0 && (
          <ImagePreviewBar images={attachedImages} onRemove={handleRemoveImage} />
        )}

        {/* Mode selector + Input bar */}
        <div className="input-area" style={{ position: "relative" }}>
          {showPalette && (
            <CommandPalette
              visible={showPalette}
              filter={paletteFilter}
              onSelect={handlePaletteSelect}
              onClose={() => { setShowPalette(false); setPaletteFilter(""); }}
            />
          )}
          <InputBar
            value={input}
            onChange={(val) => {
              setInput(val);
              // Detect / for slash menu
              if (val.startsWith("/") && val.length > 0 && val.length < 20) {
                setShowPalette(true);
                setPaletteFilter(val);
                setShowSlashMenu(true);
                setSlashQuery(val.slice(1));
              } else if ((showPalette || showSlashMenu) && !val.startsWith("/")) {
                setShowPalette(false);
                setPaletteFilter("");
                setShowSlashMenu(false);
                setSlashQuery("");
              } else if (showPalette) {
                setPaletteFilter(val);
                setSlashQuery(val.slice(1));
              }
            }}
            onSend={sendMessage}
            onAbort={handleAbort}
            streaming={streaming}
            model={sessionInfo.model}
            onModelChange={handleModelChange}
            permissionMode={permissionMode}
            onPermissionModeChange={(m) => handlePermissionModeChange(m as PermissionMode)}
            placeholder={streaming ? "Press Enter to interrupt..." : "What do you want to do?"}
            showSlashMenu={showSlashMenu && !showPalette}
            slashQuery={slashQuery}
            onSlashSelect={(cmd) => { handlePaletteSelect(cmd); setShowSlashMenu(false); setSlashQuery(""); setInput(""); }}
            onSlashDismiss={() => { setShowSlashMenu(false); setSlashQuery(""); }}
            editorMode={editorMode}
          />
        </div>

        <StatusLine
          model={sessionInfo.model}
          permissionMode={permissionMode}
          cwd={sessionInfo.cwd}
          contextPercent={contextPercent}
          inputTokens={inputTokens}
          outputTokens={outputTokens}
          costUsd={costUsd}
          sessionId={sessionId || undefined}
          gitBranch={gitBranch}
          messageCount={messages.length}
          linesAdded={linesAdded}
          linesRemoved={linesRemoved}
          connected={connected}
          sessionStartTime={sessionStartTime.getTime()}
          streaming={streaming}
          currentTool={currentTool}
          editorMode={editorMode}
          effortLevel={effortLevel}
          agentCount={agents.length}
          activeAgents={agents.filter(a => a.status === "running").length}
          onModelClick={() => setShowModelSelector(true)}
          onPermissionClick={() => {
            setPermissionMode((prev) => {
              const idx = PERMISSION_MODES.indexOf(prev);
              return PERMISSION_MODES[(idx + 1) % PERMISSION_MODES.length];
            });
          }}
          onEffortClick={() => {
            setEffortLevel((prev) => {
              const next = prev === "low" ? "medium" : prev === "medium" ? "high" : "low";
              if (sessionId) {
                fetch(`${API}/sessions/${sessionId}/settings`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ effortLevel: next }),
                }).catch(() => {});
              }
              return next;
            });
          }}
          onEditorModeClick={() => {
            setEditorMode((prev) => prev === "vim" ? "normal" : "vim");
          }}
        />
      </div>

      {/* ── Overlay Panels ── */}

      {showDiffReview && (
        <DiffReviewPanel
          files={[]}
          onClose={() => setShowDiffReview(false)}
          onAddComment={() => {}}
          onSubmitReview={() => setShowDiffReview(false)}
          onRequestAIReview={() => {}}
        />
      )}

      {showTerminal && (
        <TerminalPanel
          isOpen={showTerminal}
          onClose={() => setShowTerminal(false)}
          onResize={setTerminalHeight}
        />
      )}

      {showFilePreview && (
        <FilePreview
          isOpen={showFilePreview}
          onClose={() => setShowFilePreview(false)}
          initialPath={sessionInfo.cwd}
        />
      )}

      {showGitPanel && (
        <GitPanel
          isOpen={showGitPanel}
          onClose={() => setShowGitPanel(false)}
        />
      )}

      {showSettings && (
        <SettingsDialog
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          settings={appSettings}
          onSettingsChange={(s) => setAppSettings(s)}
          sessionId={sessionId || undefined}
          model={sessionInfo.model}
          cwd={sessionInfo.cwd}
          connected={connected}
          inputTokens={inputTokens}
          outputTokens={outputTokens}
          costUsd={costUsd}
          contextPercent={contextPercent}
        />
      )}

      {pendingPermission && (
        <PermissionDialog
          isOpen={true}
          toolName={pendingPermission.toolName}
          toolId={pendingPermission.toolId}
          input={pendingPermission.input}
          detail={pendingPermission.detail || undefined}
          filePath={pendingPermission.filePath}
          diff={pendingPermission.diff}
          onAllow={handlePermAllow}
          onDeny={handlePermDeny}
          onAllowAlways={handlePermAlwaysAllow}
          permissionMode={permissionMode}
        />
      )}

      {/* ── New Panels ── */}

      {showSearch && (
        <SearchPanel
          isOpen={showSearch}
          onClose={() => { setShowSearch(false); setActivePanel(null); }}
          sessions={sessions.map((s) => ({ ...s, messages: [] }))}
          onSelectSession={handleSelectSession}
        />
      )}

      {showScheduled && (
        <ScheduledPanel
          isOpen={showScheduled}
          onClose={() => { setShowScheduled(false); setActivePanel(null); }}
          apiBase={API}
        />
      )}

      {showDispatch && (
        <DispatchPanel
          isOpen={showDispatch}
          onClose={() => { setShowDispatch(false); setActivePanel(null); }}
          apiBase={API}
        />
      )}

      {showCustomize && (
        <CustomizePanel
          isOpen={showCustomize}
          onClose={() => { setShowCustomize(false); setActivePanel(null); }}
          apiBase={API}
          settings={appSettings as any}
          onSettingsChange={(key, value) => setAppSettings((prev) => ({ ...prev, [key]: value }))}
        />
      )}

      {showCowork && (
        <CoworkPanel
          isOpen={showCowork}
          onClose={() => setShowCowork(false)}
          onSendMessage={sendMessage}
          apiBase={API}
        />
      )}

      {showBuddy && (
        <BuddyPanel
          isOpen={showBuddy}
          onClose={() => setShowBuddy(false)}
        />
      )}

      {showGemma && (
        <GemmaSetup
          onClose={() => setShowGemma(false)}
          onComplete={(config) => {
            setAppSettings((prev) => ({ ...prev, gemmaConfig: config }));
            setShowGemma(false);
          }}
        />
      )}

      {showShortcuts && (
        <ShortcutsDialog
          isOpen={showShortcuts}
          onClose={() => setShowShortcuts(false)}
        />
      )}

      {showModelSelector && (
        <ModelSelector
          currentModel={sessionInfo.model}
          onModelChange={handleModelChange}
        />
      )}

      {showAgentPanel && (
        <AgentPanel
          isOpen={showAgentPanel}
          onClose={() => setShowAgentPanel(false)}
          agents={agents}
          tasks={todoTasks}
          onKillAgent={(id) => setAgents(prev => prev.map(a => a.id === id ? { ...a, status: "failed" } : a))}
          onKillAllAgents={() => setAgents(prev => prev.map(a => ({ ...a, status: "failed" })))}
          onCreateAgent={(description, model) => {
            sendMessage(`Use the Agent tool to: ${description}`);
            setShowAgentPanel(false);
          }}
          apiBase={API}
        />
      )}

      {/* ── Diff Viewer ── */}
      {showDiffViewer && (
        <DiffViewer
          isOpen={showDiffViewer}
          files={diffFiles}
          onAccept={handleDiffAccept}
          onReject={handleDiffReject}
          onAcceptAll={handleDiffAcceptAll}
          onRejectAll={handleDiffRejectAll}
          onClose={() => setShowDiffViewer(false)}
        />
      )}

      {/* ── Conversation History ── */}
      {showConversationHistory && (
        <ConversationHistory
          isOpen={showConversationHistory}
          onClose={() => setShowConversationHistory(false)}
          sessions={sessions.map(s => ({ ...s, messages: [] }))}
          onSelectSession={handleSelectSession}
          onDeleteSession={(id) => setSessions(prev => prev.filter(s => s.id !== id))}
          onExportSession={() => setShowExport(true)}
        />
      )}

      {/* ── System Prompt Editor ── */}
      {showSystemPrompt && (
        <SystemPromptEditor
          isOpen={showSystemPrompt}
          onClose={() => setShowSystemPrompt(false)}
          currentPrompt={systemPrompt}
          onSave={handleSaveSystemPrompt}
          projectPath={sessionInfo.cwd}
          apiBase={API}
        />
      )}

      {/* ── Export Panel ── */}
      {showExport && (
        <ExportPanel
          isOpen={showExport}
          onClose={() => setShowExport(false)}
          messages={messages}
          sessionTitle={currentSessionTitle}
          sessionId={sessionId || ""}
        />
      )}

      {/* ── Inline Editor ── */}
      {showInlineEditor && inlineEditorPath && (
        <InlineEditor
          isOpen={showInlineEditor}
          onClose={() => { setShowInlineEditor(false); setInlineEditorPath(""); }}
          filePath={inlineEditorPath}
          onSave={handleInlineEditorSave}
          apiBase={API}
        />
      )}

      {/* ── MCP Panel ── */}
      {showMCPPanel && (
        <MCPPanel
          isOpen={showMCPPanel}
          onClose={() => setShowMCPPanel(false)}
          apiBase={API}
        />
      )}

      {/* ── KAIROS Panel ── */}
      {showKairos && (
        <KairosPanel
          isOpen={showKairos}
          onClose={() => { setShowKairos(false); setActivePanel(null); }}
        />
      )}

      {/* ── Swarm Panel ── */}
      {showSwarm && (
        <SwarmPanel
          isOpen={showSwarm}
          onClose={() => { setShowSwarm(false); setActivePanel(null); }}
          session={null}
          workers={[]}
          queue={[]}
          scratchpad=""
          results={[]}
          events={[]}
          concurrencyLimit={4}
        />
      )}

      {/* ── Security Review Panel ── */}
      {showSecurityReview && (
        <SecurityReviewPanel
          isOpen={showSecurityReview}
          onClose={() => { setShowSecurityReview(false); setActivePanel(null); }}
          data={null}
        />
      )}

      {/* ── Insights Panel ── */}
      {showInsights && (
        <InsightsPanel
          isOpen={showInsights}
          onClose={() => { setShowInsights(false); setActivePanel(null); }}
          apiBase={API}
          rootPath={sessionInfo.cwd}
        />
      )}

      {/* ── Sticker Panel ── */}
      {showStickers && (
        <StickerPanel
          isOpen={showStickers}
          onClose={() => { setShowStickers(false); setActivePanel(null); }}
          onSendMessage={sendMessage}
        />
      )}

      {/* ── Undercover Panel ── */}
      {showUndercover && (
        <UndercoverPanel
          isOpen={showUndercover}
          onClose={() => { setShowUndercover(false); setActivePanel(null); }}
          apiBase={API}
          active={false}
          onToggle={() => {}}
          autoDetect={false}
          onAutoDetectChange={() => {}}
          isPublicRepo={null}
          blocklist={[]}
          onBlocklistChange={() => {}}
          activityLog={[]}
        />
      )}

      {/* ── Ultra Review Panel ── */}
      {showUltraReview && (
        <UltraReviewPanel
          isOpen={showUltraReview}
          onClose={() => { setShowUltraReview(false); setActivePanel(null); }}
          onStartReview={() => {}}
          onApplyFix={() => {}}
          onExportReport={() => {}}
          onCancelReview={() => {}}
          reviewResult={null}
          isReviewing={false}
          reviewPhase={null}
          reviewProgress={0}
          elapsedMs={0}
        />
      )}

      {/* ── Verifiers Panel ── */}
      {showVerifiers && (
        <VerifiersPanel
          isOpen={showVerifiers}
          onClose={() => { setShowVerifiers(false); setActivePanel(null); }}
          apiBase={API}
        />
      )}

      {/* ── Background Tasks Panel ── */}
      <BackgroundTaskPanel
        isOpen={showBGTaskPanel}
        onClose={() => setShowBGTaskPanel(false)}
        tasks={bgTasks}
        onKillTask={handleKillBGTask}
        onClearCompleted={handleClearCompletedBGTasks}
      />
    </div>
    </ToastProvider>
  );
}
