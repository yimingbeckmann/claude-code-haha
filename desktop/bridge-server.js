/**
 * Bridge server that wraps the machelper runtime as an HTTP API.
 * Spawns ONE persistent CLI process per session using --input-format stream-json
 * so that conversation history is maintained across messages.
 * Exposes REST + SSE endpoints for the React GUI.
 */
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");

const sessions = new Map(); // sessionId -> { process, messages, status, listeners, ... }
const wsClients = new Set();

let WebSocketServer;
try { WebSocketServer = require("ws").Server; } catch { WebSocketServer = null; }

function findBun() {
  const paths = [
    path.join(process.env.HOME || "", ".bun", "bin", "bun"),
    "/opt/homebrew/bin/bun",
    "/usr/local/bin/bun",
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return "bun";
}

const BUN = findBun();
// Read env vars lazily — they are set by main.js ensureRuntimeDir() after require() time
function getRuntimeDir() {
  return process.env.CLAUDE_RUNTIME_DIR || path.join(__dirname, "..", "machelper-runtime");
}
function getWorkspace() {
  return process.env.WORKSPACE_ROOT || process.env.HOME || "/tmp";
}
function getApiKey() { return process.env.ANTHROPIC_API_KEY || ""; }
function getOpenaiKey() { return process.env.OPENAI_API_KEY || "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"; }

// ─── Session management ──────────────────────────────────────

function createSession(idOrCwd, cwd2, model) {
  const isIdProvided = typeof idOrCwd === "string" && idOrCwd.startsWith("session-");
  const id = isIdProvided ? idOrCwd : `session-${randomUUID().slice(0, 8)}`;
  const cwd = isIdProvided ? (cwd2 || getWorkspace()) : (idOrCwd || getWorkspace());
  if (sessions.has(id)) return id;

  const session = {
    id,
    process: null,
    buffer: "",        // stdout accumulator for line splitting
    messages: [],
    listeners: new Set(),
    sseResponses: new Set(), // active SSE response objects
    status: "idle",
    createdAt: Date.now(),
    cwd: cwd || getWorkspace(),
    model: model || null,  // CLI --model flag
    lastToolUse: null,
    tasks: new Map(),           // taskId -> { id, status, description, ... }
    pendingPermissions: new Map(), // toolId -> permission request details
    settings: {
      permissionMode: "ask",
      effortLevel: null,
      thinkingMode: false,
    },
  };
  sessions.set(id, session);

  // Spawn persistent CLI process (only for Claude models; local models use Ollama)
  if (!isLocalModel(session.model)) {
    spawnCLI(session);
  }
  return id;
}

function spawnCLI(session) {
  const env = {
    ...process.env,
    HOME: process.env.HOME,
    PATH: process.env.PATH,
    DISABLE_TELEMETRY: "1",
    MACHELPER_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    MACHELPER_REMOTE: "1",  // unlock tool_progress events with elapsed time during bash runs
  };
  // Remove inherited empty API keys so CLI uses OAuth from ~/.claude.json
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.ANTHROPIC_BASE_URL;
  const apiKey = getApiKey();
  const openaiKey = getOpenaiKey();
  if (apiKey) { env.ANTHROPIC_API_KEY = apiKey; env.ANTHROPIC_AUTH_TOKEN = apiKey; }
  if (openaiKey) { env.OPENAI_API_KEY = openaiKey; }

  const args = [
    "run", "./src/entrypoints/cli.tsx",
    "--print",
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--permission-mode", "bypassPermissions",
  ];

  // Add model if it's a Claude model (local models go through Ollama, not CLI)
  if (session.model && isClaudeModel(session.model)) {
    args.push("--model", session.model);
  }

  // Add effort level if set
  if (session.settings.effortLevel) {
    args.push("--effort", session.settings.effortLevel);
  }

  const proc = spawn(BUN, args, {
    cwd: getRuntimeDir(),
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  session.process = proc;
  session.buffer = "";

  proc.stdout.on("data", (chunk) => {
    session.buffer += chunk.toString();
    const lines = session.buffer.split("\n");
    session.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        handleCLIEvent(session, event);
      } catch { /* skip non-JSON */ }
    }
  });

  proc.stderr.on("data", (chunk) => {
    const text = chunk.toString().trim();
    if (text) {
      broadcastSSE(session, { type: "error", error: text });
    }
  });

  proc.on("close", (code) => {
    console.log(`[bridge] CLI process for ${session.id} exited with code ${code}`);
    session.process = null;
    session.status = "idle";
    // Notify all SSE listeners the session ended
    broadcastSSE(session, { type: "done", message: { role: "assistant", blocks: [] } });
    closeAllSSE(session);
  });

  console.log(`[bridge] Spawned persistent CLI for session ${session.id} (pid: ${proc.pid})`);
}

// ─── CLI event processing ────────────────────────────────────

function handleCLIEvent(session, event) {
  // Map CLI stream-json events to frontend-expected SSE events

  if (event.type === "system") {
    broadcastSSE(session, {
      type: "system",
      message: event.message || event.text || "",
      subtype: event.subtype || null,
      session_id: event.session_id,
      model: event.model,
      tools: event.tools,
      permissionMode: event.permissionMode,
      cwd: event.cwd,
    });
  } else if (event.type === "assistant" && event.message?.content) {
    // With --include-partial-messages, "assistant" events contain the FULL accumulated
    // text so far (not deltas). content_block_delta events already stream the text
    // incrementally, so we skip text blocks here to avoid duplication.
    // Only forward tool_use blocks that might not have been streamed via deltas.
    for (const block of event.message.content) {
      if (block.type === "tool_use") {
        // Only forward if we haven't seen this tool_use via content_block_start
        if (!session.lastToolUse || session.lastToolUse.id !== block.id) {
          session.lastToolUse = { name: block.name, id: block.id };
          session._lastToolInput = block.input || null;
          broadcastSSE(session, {
            type: "tool_call",
            tool: { name: block.name, id: block.id, input: block.input },
            message: { role: "assistant", blocks: [{ type: "tool_use", name: block.name, input: JSON.stringify(block.input) }] },
          });
        }
      }
    }
  } else if (event.type === "content_block_start") {
    if (event.content_block?.type === "tool_use") {
      session.lastToolUse = { name: event.content_block.name, id: event.content_block.id };
      session._lastToolInput = null;          // reset for new tool
      session._partialToolJson = "";          // accumulator for input_json_delta
      broadcastSSE(session, {
        type: "tool_call",
        tool: { name: event.content_block.name, id: event.content_block.id, input: {} },
        message: { role: "assistant", blocks: [{ type: "tool_use", name: event.content_block.name, input: "{}" }] },
      });
    } else if (event.content_block?.type === "thinking") {
      broadcastSSE(session, { type: "thinking", content: "", redacted: !!event.content_block.redacted });
    } else if (event.content_block?.type === "redacted_thinking") {
      broadcastSSE(session, { type: "thinking", content: "", redacted: true });
    }
  } else if (event.type === "content_block_stop") {
    // Finalize accumulated tool input so it's available for the next tool_result
    if (session._partialToolJson) {
      try { session._lastToolInput = JSON.parse(session._partialToolJson); } catch {
        session._lastToolInput = session._partialToolJson;
      }
      session._partialToolJson = "";
    }
    broadcastSSE(session, { type: "content_block_stop", index: event.index || 0 });
  } else if (event.type === "content_block_delta") {
    if (event.delta?.text) {
      broadcastSSE(session, { type: "token", content: event.delta.text });
      session._fullResponse = (session._fullResponse || "") + event.delta.text;
    } else if (event.delta?.type === "thinking_delta" && event.delta?.thinking) {
      broadcastSSE(session, { type: "thinking", content: event.delta.thinking });
    } else if (event.delta?.type === "input_json_delta" && event.delta?.partial_json) {
      session._partialToolJson = (session._partialToolJson || "") + event.delta.partial_json;
      broadcastSSE(session, {
        type: "tool_input_delta",
        tool: session.lastToolUse,
        partial_json: event.delta.partial_json,
      });
    } else if (event.delta?.type === "citation_delta" || event.delta?.type === "citations_delta") {
      broadcastSSE(session, {
        type: "citation",
        citation: event.delta.citation || event.delta,
      });
    }
  } else if (event.type === "server_tool_use" || event.type === "web_search_result") {
    broadcastSSE(session, {
      type: "web_search",
      query: event.query || event.input?.query || "",
      results: event.results || [],
      url: event.url || null,
    });
  } else if (event.type === "tool_output" || event.type === "tool_stdout") {
    // Partial tool output (e.g., streaming bash stdout)
    broadcastSSE(session, {
      type: "tool_output_delta",
      tool: session.lastToolUse,
      content: event.content || event.text || event.output || "",
      stream: event.stream || "stdout",  // "stdout" or "stderr"
    });
  } else if (event.type === "result") {
    const resultText = typeof event.result === "string" ? event.result : JSON.stringify(event.result);
    const isError = !!event.is_error;
    const toolInfo = session.lastToolUse || {};

    if (event.subtype === "tool_result") {
      // Extract structured fields from the tool context for richer GUI rendering
      const enriched = { output: resultText, is_error: isError };

      // Attempt to extract filePath from the preceding tool_use input
      if (session._lastToolInput) {
        try {
          const inp = typeof session._lastToolInput === "string"
            ? JSON.parse(session._lastToolInput) : session._lastToolInput;
          if (inp.file_path) enriched.filePath = inp.file_path;
          else if (inp.path) enriched.filePath = inp.path;
          if (inp.command != null) enriched.command = inp.command;
        } catch {}
      }

      // For Bash-like tools: separate exit code if the CLI provides it
      const tn = (toolInfo.name || "").toLowerCase();
      if (tn === "bash" || tn === "run_bash") {
        enriched.exit_code = event.exit_code ?? (isError ? 1 : 0);
        // Real stdout/stderr separation when CLI provides it
        if (event.stdout != null) enriched.stdout = event.stdout;
        if (event.stderr != null) enriched.stderr = event.stderr;
      }

      // For Edit/Write tools: try to extract diff from result text
      if (tn === "edit" || tn === "edit_file" || tn === "write" || tn === "write_file") {
        if (resultText.includes("@@") && (resultText.includes("---") || resultText.includes("+++"))) {
          enriched.diff = resultText;
        }
      }

      broadcastSSE(session, {
        type: "tool_result",
        tool: toolInfo,
        result: enriched,
        message: { role: "tool", blocks: [{ type: "tool_result", output: resultText }] },
      });
    } else {
      // Final result — includes usage/cost
      // If CLI sent the full response here (no streaming tokens), extract it
      if (!session._fullResponse && resultText && !isError) {
        broadcastSSE(session, { type: "token", content: resultText });
        session._fullResponse = resultText;
      }

      broadcastSSE(session, {
        type: "result",
        result: resultText,
        is_error: isError,
        usage: event.usage,
        total_cost_usd: event.total_cost_usd,
        lines_added: event.lines_added,
        lines_removed: event.lines_removed,
      });

      // Turn complete — record and notify
      session.status = "idle";
      if (session._fullResponse) {
        session.messages.push({ type: "assistant", content: session._fullResponse, timestamp: Date.now() });
      }
      const doneMsg = {
        role: "assistant",
        blocks: [{ type: "text", text: session._fullResponse || "(no response)" }],
      };
      broadcastSSE(session, { type: "done", message: doneMsg });
      session._fullResponse = "";
      closeAllSSE(session);
    }
  } else if (event.type === "permission_request" || (event.type === "tool_use" && event.needsPermission)) {
    // Permission request from CLI — store and broadcast to GUI
    const toolId = event.toolId || event.id || (event.tool && event.tool.id) || randomUUID();
    const toolName = event.toolName || event.tool_name || (event.tool && event.tool.name) || "unknown";
    const permData = {
      type: "permission_request",
      toolName,
      toolId,
      input: event.input || (event.tool && event.tool.input) || {},
      detail: event.detail || event.description || event.message || "",
      filePath: event.filePath || event.file_path || null,
      diff: event.diff || null,
    };
    session.pendingPermissions.set(toolId, permData);
    broadcastSSE(session, permData);
  } else if (event.type === "task_update") {
    // Background task status update
    const taskId = event.taskId || event.task_id || event.id;
    if (taskId) {
      session.tasks.set(taskId, {
        id: taskId,
        status: event.status || "running",
        description: event.description || event.message || "",
        updatedAt: Date.now(),
      });
    }
    broadcastSSE(session, {
      type: "task_update",
      taskId,
      status: event.status,
      description: event.description || event.message || "",
    });
  } else if (event.type === "memory_saved" || event.type === "memory_read" || event.type === "memory_updated" || event.type === "memory_deleted") {
    broadcastSSE(session, {
      type: event.type,
      action: event.type.replace("memory_", ""),
      path: event.path || event.file || null,
      content: event.content || null,
      fileName: event.fileName || event.file_name || null,
    });
  } else if (event.type === "plan_mode") {
    broadcastSSE(session, {
      type: "plan_mode",
      enabled: !!event.enabled,
      plan: event.plan || null,
    });
  } else if (event.type === "agent_notification") {
    broadcastSSE(session, {
      type: "agent_notification",
      agentId: event.agentId || event.agent_id || null,
      message: event.message || "",
      status: event.status || null,
      toolUseId: event.toolUseId || event.tool_use_id || null,
    });
  } else if (event.type === "task_started" || event.type === "task_progress") {
    // Forward sub-agent / background task lifecycle events
    broadcastSSE(session, {
      type: event.type,
      taskId: event.taskId || event.task_id || event.id || null,
      agentId: event.agentId || event.agent_id || null,
      agentName: event.agentName || event.agent_name || null,
      description: event.description || event.message || "",
      status: event.status || (event.type === "task_started" ? "running" : "in_progress"),
      progress: event.progress || null,
      model: event.model || null,
      depth: event.depth || 0,
    });
  } else if (event.type === "task_notification") {
    broadcastSSE(session, {
      type: "task_notification",
      taskId: event.taskId || event.task_id || event.id || null,
      message: event.message || event.text || "",
      status: event.status || null,
    });
  } else if (event.type === "rate_limit" || event.type === "rate-limit") {
    // Only broadcast if there's actual rate limit data (not a false positive)
    const retryMs = event.retry_after_ms || event.retryAfterMs || event.retry_after;
    if (retryMs) {
      broadcastSSE(session, {
        type: "rate_limit",
        message: event.message || event.error || "Rate limited — waiting to retry",
        retry_after_ms: retryMs,
      });
    }
  } else if (event.type === "compact") {
    broadcastSSE(session, {
      type: "compact",
      beforeTokens: event.before_tokens || event.beforeTokens || 0,
      afterTokens: event.after_tokens || event.afterTokens || 0,
      messageCount: event.message_count || event.messageCount || 0,
    });
  } else if (event.type === "progress") {
    broadcastSSE(session, {
      type: "progress",
      taskId: event.taskId || event.task_id || null,
      percent: event.percent || event.progress || 0,
      message: event.message || "",
    });
  } else if (event.type === "tool_progress") {
    // Long-running tool progress (e.g., Bash elapsed time)
    broadcastSSE(session, {
      type: "tool_progress",
      tool: session.lastToolUse,
      elapsed_time_seconds: event.elapsed_time_seconds || event.elapsed || 0,
      message: event.message || "",
    });
  } else if (event.type === "tool_use_summary") {
    // Cumulative tool call summary
    broadcastSSE(session, {
      type: "tool_use_summary",
      summary: event.summary || event.text || "",
      tool_calls: event.tool_calls || [],
    });
  } else if (event.type === "rate_limit_event") {
    // Detailed rate limit info — only broadcast if actual retry info present
    const retryMs = event.rate_limit_info?.retry_after_ms || event.retry_after_ms;
    if (retryMs) {
      broadcastSSE(session, {
        type: "rate_limit",
        message: event.message || "Rate limited",
        retry_after_ms: retryMs,
        rate_limit_info: event.rate_limit_info || null,
      });
    }
  } else if (event.type === "control_request") {
    // Permission request via SDK control protocol
    if (event.subtype === "can_use_tool") {
      const toolId = event.id || event.toolId || randomUUID();
      const permData = {
        type: "permission_request",
        toolName: event.toolName || event.tool_name || (event.tool && event.tool.name) || "unknown",
        toolId,
        input: event.input || (event.tool && event.tool.input) || {},
        detail: event.detail || event.description || event.message || "",
        filePath: event.filePath || event.file_path || null,
        diff: event.diff || null,
      };
      session.pendingPermissions.set(toolId, permData);
      broadcastSSE(session, permData);
    } else if (event.subtype === "elicitation") {
      broadcastSSE(session, {
        type: "elicitation",
        id: event.id || randomUUID(),
        message: event.message || "",
        schema: event.schema || null,
      });
    }
  } else if (event.type === "keep_alive") {
    // Forward as heartbeat to keep SSE connections alive
    broadcastSSE(session, { type: "heartbeat" });
  } else if (event.type === "prompt_suggestion") {
    broadcastSSE(session, {
      type: "prompt_suggestion",
      suggestions: event.suggestions || [event.text || event.prompt || ""],
    });
  } else if (event.type === "error" || event.type === "stream_error") {
    broadcastSSE(session, {
      type: "error",
      error: event.error || event.message || "Unknown error",
      errorType: event.error_type || event.errorType || (event.type === "stream_error" ? "stream" : "unknown"),
      details: event.details || event.stack || null,
      retryable: event.retryable ?? false,
    });
  }
}

// ─── Model routing helpers ───────────────────────────────────

function isLocalModel(model) {
  if (!model) return false;
  return model.startsWith("gemma") || model.startsWith("llama") || model.startsWith("mistral") || model.startsWith("phi") || model.startsWith("qwen") || model.startsWith("deepseek");
}

function isClaudeModel(model) {
  if (!model) return true; // default to Claude
  return model.startsWith("claude") || model === "sonnet" || model === "opus" || model === "haiku";
}

// ─── Send message to session (routes to CLI or Ollama) ───────

function sendToSession(sessionId, userMessage) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  // Record user message
  session.messages.push({ type: "user", content: userMessage, timestamp: Date.now() });
  session.status = "streaming";
  session._fullResponse = "";
  session.lastToolUse = null;

  if (isLocalModel(session.model)) {
    sendToOllama(session, userMessage);
  } else {
    sendToCLI(session, userMessage);
  }
}

function sendToCLI(session, userMessage) {
  if (!session.process) {
    spawnCLI(session);
  }

  const sdkMessage = JSON.stringify({
    type: "user",
    session_id: session.id,
    message: {
      role: "user",
      content: userMessage,
    },
    parent_tool_use_id: null,
  });

  session.process.stdin.write(sdkMessage + "\n");
}

// ─── Ollama integration with full tool-use agent loop ────────

const OLLAMA_TOOLS = [
  {
    type: "function",
    function: {
      name: "Bash",
      description: "Run a bash command and return stdout/stderr. Use for installing packages, running scripts, git commands, file operations, etc.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The bash command to execute" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Read",
      description: "Read a file's contents. Returns the text content of the file.",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Absolute path to the file to read" },
        },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Write",
      description: "Write content to a file, creating it if it doesn't exist or overwriting if it does.",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Absolute path to the file to write" },
          content: { type: "string", description: "The full content to write to the file" },
        },
        required: ["file_path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Edit",
      description: "Replace a specific string in a file with a new string. The old_string must match exactly (including whitespace).",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Absolute path to the file to edit" },
          old_string: { type: "string", description: "The exact text to find and replace" },
          new_string: { type: "string", description: "The replacement text" },
        },
        required: ["file_path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Glob",
      description: "Find files matching a glob pattern (e.g. '**/*.js', 'src/**/*.tsx'). Returns matching file paths.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Glob pattern to match files" },
          path: { type: "string", description: "Directory to search in (defaults to workspace root)" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Grep",
      description: "Search file contents for a regex pattern. Returns matching lines with file paths and line numbers.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regex pattern to search for" },
          path: { type: "string", description: "File or directory to search in (defaults to workspace root)" },
          include: { type: "string", description: "Glob pattern to filter files (e.g. '*.js')" },
        },
        required: ["pattern"],
      },
    },
  },
];

const OLLAMA_SYSTEM_PROMPT = `You are an expert AI coding assistant with access to tools for reading, writing, and editing files, running bash commands, and searching code. You work in the user's project directory.

Key principles:
- Use tools to explore the codebase before making changes
- Read files before editing them to understand context
- Make targeted, minimal changes
- Use Bash for running tests, installing packages, git operations
- Use Grep/Glob to find relevant files before reading them
- Explain what you're doing and why

Current working directory: CWD_PLACEHOLDER`;

/** Execute a tool call and return the result string */
function executeOllamaTool(name, args, cwd) {
  return new Promise((resolve) => {
    const { execSync } = require("child_process");
    try {
      switch (name) {
        case "Bash": {
          const cmd = args.command || "";
          const output = execSync(cmd, {
            cwd,
            encoding: "utf-8",
            timeout: 60000,
            maxBuffer: 1024 * 1024 * 5,
            env: { ...process.env, PATH: `${process.env.HOME}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` },
          });
          resolve(output || "(no output)");
          break;
        }
        case "Read": {
          const fp = args.file_path || "";
          if (!fs.existsSync(fp)) { resolve(`Error: File not found: ${fp}`); break; }
          const stat = fs.statSync(fp);
          if (stat.size > 512 * 1024) { resolve(`Error: File too large (${(stat.size / 1024).toFixed(0)}KB). Read a smaller portion with Bash.`); break; }
          const content = fs.readFileSync(fp, "utf-8");
          const lines = content.split("\n");
          const numbered = lines.map((l, i) => `${i + 1}\t${l}`).join("\n");
          resolve(numbered);
          break;
        }
        case "Write": {
          const fp = args.file_path || "";
          const dir = path.dirname(fp);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(fp, args.content || "", "utf-8");
          resolve(`Successfully wrote ${(args.content || "").length} bytes to ${fp}`);
          break;
        }
        case "Edit": {
          const fp = args.file_path || "";
          if (!fs.existsSync(fp)) { resolve(`Error: File not found: ${fp}`); break; }
          const text = fs.readFileSync(fp, "utf-8");
          const oldStr = args.old_string || "";
          const newStr = args.new_string || "";
          if (!text.includes(oldStr)) { resolve(`Error: old_string not found in ${fp}. Read the file first to get exact content.`); break; }
          const count = text.split(oldStr).length - 1;
          if (count > 1) { resolve(`Error: old_string matches ${count} locations in ${fp}. Provide more context to make it unique.`); break; }
          fs.writeFileSync(fp, text.replace(oldStr, newStr), "utf-8");
          resolve(`Successfully edited ${fp}`);
          break;
        }
        case "Glob": {
          const pattern = args.pattern || "*";
          const dir = args.path || cwd;
          // Use find as a simple glob (rg --files --glob is faster but may not exist)
          const output = execSync(`find "${dir}" -path "*/${pattern}" -o -name "${pattern}" 2>/dev/null | head -50`, {
            cwd, encoding: "utf-8", timeout: 10000,
          });
          resolve(output || "(no matches)");
          break;
        }
        case "Grep": {
          const pat = args.pattern || "";
          const dir = args.path || cwd;
          const inc = args.include ? `--include="${args.include}"` : "";
          const output = execSync(`grep -rn ${inc} "${pat}" "${dir}" 2>/dev/null | head -80`, {
            cwd, encoding: "utf-8", timeout: 15000,
          });
          resolve(output || "(no matches)");
          break;
        }
        default:
          resolve(`Unknown tool: ${name}`);
      }
    } catch (err) {
      // For Bash, include stderr in the result
      if (name === "Bash" && err.stdout) {
        resolve(`${err.stdout}\n${err.stderr || ""}`.trim() || `Exit code ${err.status}`);
      } else {
        resolve(`Error: ${err.message}`);
      }
    }
  });
}

/** Call Ollama's OpenAI-compatible API (non-streaming for tool loop, streaming for final response) */
function ollamaChat(model, messages, tools, stream) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      messages,
      tools: tools && tools.length > 0 ? tools : undefined,
      stream,
    });

    const req = http.request({
      hostname: "127.0.0.1",
      port: 11434,
      path: "/v1/chat/completions",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout: 120000,
    }, (res) => {
      if (stream) {
        resolve(res); // Return the stream for the caller to handle
        return;
      }
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Failed to parse Ollama response: " + data.slice(0, 300)));
        }
      });
    });

    req.on("error", (e) => reject(new Error(`Cannot connect to Ollama: ${e.message}`)));
    req.on("timeout", () => { req.destroy(); reject(new Error("Ollama request timed out")); });
    req.write(body);
    req.end();
  });
}

/** Stream the final text response from Ollama to the session's SSE clients */
function streamOllamaResponse(session, responseStream) {
  return new Promise((resolve) => {
    let buffer = "";
    let fullResponse = "";

    responseStream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        const jsonStr = trimmed.startsWith("data: ") ? trimmed.slice(6) : trimmed;
        try {
          const data = JSON.parse(jsonStr);
          const delta = data.choices?.[0]?.delta;
          if (delta?.content) {
            fullResponse += delta.content;
            broadcastSSE(session, { type: "token", content: delta.content });
          }
        } catch { /* skip */ }
      }
    });

    responseStream.on("end", () => {
      resolve(fullResponse);
    });

    responseStream.on("error", (err) => {
      broadcastSSE(session, { type: "error", error: `Ollama stream error: ${err.message}` });
      resolve(fullResponse);
    });
  });
}

/** Main agent loop for local models — tool calls + streaming text */
async function sendToOllama(session, userMessage) {
  const cwd = session.cwd || getWorkspace();
  const systemPrompt = OLLAMA_SYSTEM_PROMPT.replace("CWD_PLACEHOLDER", cwd);

  // Build conversation history
  const messages = [{ role: "system", content: systemPrompt }];
  for (const msg of session.messages) {
    if (msg.type === "user") messages.push({ role: "user", content: msg.content });
    else if (msg.type === "assistant") messages.push({ role: "assistant", content: msg.content });
  }

  const MAX_TOOL_ROUNDS = 25; // Safety limit
  let fullAssistantText = "";

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // Non-streaming call to check for tool use
      const response = await ollamaChat(session.model, messages, OLLAMA_TOOLS, false);
      const choice = response.choices?.[0];

      if (!choice) {
        broadcastSSE(session, { type: "error", error: "Empty response from Ollama" });
        break;
      }

      const msg = choice.message;

      // If the model produced text content, stream it out
      if (msg.content) {
        broadcastSSE(session, { type: "token", content: msg.content });
        fullAssistantText += msg.content;
      }

      // Check for tool calls
      const toolCalls = msg.tool_calls;
      if (!toolCalls || toolCalls.length === 0 || choice.finish_reason === "stop") {
        // No more tool calls — done
        break;
      }

      // Add assistant message with tool calls to history
      messages.push(msg);

      // Execute each tool call
      for (const tc of toolCalls) {
        const toolName = tc.function?.name || "unknown";
        let toolArgs = {};
        try {
          toolArgs = typeof tc.function?.arguments === "string"
            ? JSON.parse(tc.function.arguments)
            : tc.function?.arguments || {};
        } catch { /* use empty args */ }

        const toolId = tc.id || randomUUID();

        // Broadcast tool_call event (same as CLI does)
        session.lastToolUse = { name: toolName, id: toolId };
        broadcastSSE(session, {
          type: "tool_call",
          tool: { name: toolName, id: toolId, input: toolArgs },
          message: { role: "assistant", blocks: [{ type: "tool_use", name: toolName, input: JSON.stringify(toolArgs) }] },
        });

        // Execute
        console.log(`[ollama-agent] Executing ${toolName}(${JSON.stringify(toolArgs).slice(0, 100)})`);
        const result = await executeOllamaTool(toolName, toolArgs, cwd);
        const resultTruncated = result.length > 50000 ? result.slice(0, 50000) + "\n... (truncated)" : result;

        // Broadcast tool_result event
        broadcastSSE(session, {
          type: "tool_result",
          tool: { name: toolName, id: toolId },
          result: { output: resultTruncated, is_error: result.startsWith("Error:") },
          message: { role: "tool", blocks: [{ type: "tool_result", output: resultTruncated }] },
        });

        // Add tool result to conversation
        messages.push({
          role: "tool",
          tool_call_id: toolId,
          content: resultTruncated,
        });
      }
    }
  } catch (err) {
    broadcastSSE(session, {
      type: "error",
      error: `Ollama agent error: ${err.message}`,
    });
  }

  // Finalize
  session._fullResponse = fullAssistantText;
  session.status = "idle";
  if (fullAssistantText) {
    session.messages.push({ type: "assistant", content: fullAssistantText, timestamp: Date.now() });
  }
  broadcastSSE(session, {
    type: "done",
    message: { role: "assistant", blocks: [{ type: "text", text: fullAssistantText || "(used tools)" }] },
  });
  closeAllSSE(session);
}

// ─── Broadcasting ────────────────────────────────────────────

function broadcastSSE(session, event) {
  const data = JSON.stringify(event);

  // SSE responses
  for (const res of session.sseResponses) {
    try { res.write(`data: ${data}\n\n`); } catch {}
  }

  // Legacy listeners
  for (const listener of session.listeners) {
    try { listener(data); } catch {}
  }

  // WebSocket clients
  const wsData = JSON.stringify({ ...event, sessionId: session.id });
  for (const client of wsClients) {
    if (client.readyState === 1 && client._subscribedSession === session.id) {
      try { client.send(wsData); } catch {}
    }
  }
}

function closeAllSSE(session) {
  for (const res of session.sseResponses) {
    try { res.end(); } catch {}
  }
  session.sseResponses.clear();
}

// ─── Audio Transcription (OpenAI Whisper API) ───────────────

function transcribeWithWhisper(audioBuffer, mimeType, apiKey) {
  return new Promise((resolve, reject) => {
    const boundary = "----WhisperBoundary" + Date.now() + Math.random().toString(36).slice(2);
    const ext = (mimeType || "").includes("webm") ? "webm" : (mimeType || "").includes("wav") ? "wav" : "webm";

    // Build multipart body
    const filePart = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mimeType || "audio/webm"}\r\n\r\n`
    );
    const modelPart = Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n--${boundary}--\r\n`
    );
    const body = Buffer.concat([filePart, audioBuffer, modelPart]);

    const options = {
      hostname: "api.openai.com",
      port: 443,
      path: "/v1/audio/transcriptions",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          const result = JSON.parse(data);
          if (result.text) {
            resolve(result.text);
          } else if (result.error) {
            reject(new Error(result.error.message || "Whisper API error"));
          } else {
            reject(new Error("No transcription returned"));
          }
        } catch {
          reject(new Error("Failed to parse Whisper response: " + data.slice(0, 200)));
        }
      });
    });

    req.on("error", (e) => reject(new Error("Whisper API request failed: " + e.message)));
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("Whisper API timeout")); });
    req.write(body);
    req.end();
  });
}

// ─── HTTP Server ─────────────────────────────────────────────

function startBridgeServer(port) {
  const server = http.createServer((req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, `http://localhost:${port}`);
    const parts = url.pathname.split("/").filter(Boolean);

    // POST /sessions — create session
    if (req.method === "POST" && parts[0] === "sessions" && parts.length === 1) {
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", () => {
        let cwd = getWorkspace();
        let model = null;
        try {
          const parsed = JSON.parse(body);
          cwd = parsed.cwd || getWorkspace();
          model = parsed.model || null;
        } catch {}
        const id = createSession(cwd, undefined, model);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ session_id: id, created_at: Date.now() }));
      });
      return;
    }

    // GET /sessions — list sessions
    if (req.method === "GET" && parts[0] === "sessions" && parts.length === 1) {
      const list = [];
      for (const [id, s] of sessions) {
        list.push({ id, created_at: s.createdAt, message_count: s.messages.length, status: s.status });
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sessions: list }));
      return;
    }

    // POST /sessions/:id/message — send message (waits for completion)
    if (req.method === "POST" && parts[0] === "sessions" && parts[2] === "message") {
      const sessionId = parts[1];
      if (!sessions.has(sessionId)) createSession(sessionId);
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", () => {
        try {
          const { content } = JSON.parse(body);
          sendToSession(sessionId, content);
          const session = sessions.get(sessionId);
          const checkDone = setInterval(() => {
            if (session.status === "idle" && session.messages.length > 0) {
              clearInterval(checkDone);
              const lastMsg = session.messages[session.messages.length - 1];
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({
                assistant_message: {
                  role: "assistant",
                  blocks: [{ type: "text", text: lastMsg.content || "" }],
                  timestamp: lastMsg.timestamp,
                },
              }));
            }
          }, 200);
          setTimeout(() => {
            clearInterval(checkDone);
            if (!res.writableEnded) {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ assistant_message: { role: "assistant", blocks: [{ type: "text", text: "Request timed out." }] } }));
            }
          }, 120000);
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // GET /sessions/:id/notifications
    if (req.method === "GET" && parts[0] === "sessions" && parts[2] === "notifications") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ notifications: [] }));
      return;
    }

    // POST /sessions/:id/model — set model (restart CLI only for Claude models)
    if (req.method === "POST" && parts[0] === "sessions" && parts[2] === "model") {
      const sessionId = parts[1];
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", () => {
        try {
          const { model } = JSON.parse(body);
          if (model && sessions.has(sessionId)) {
            const session = sessions.get(sessionId);
            const wasLocal = isLocalModel(session.model);
            const nowLocal = isLocalModel(model);
            session.model = model;

            if (nowLocal) {
              // Switching to local model — kill CLI (not needed for Ollama)
              if (session.process) {
                session.process.kill("SIGTERM");
                session.process = null;
              }
            } else if (wasLocal || !session.process) {
              // Switching from local to Claude, or CLI died — (re)spawn
              if (session.process) {
                session.process.kill("SIGTERM");
                session.process = null;
              }
              spawnCLI(session);
            } else {
              // Switching between Claude models — restart CLI with new --model
              session.process.kill("SIGTERM");
              session.process = null;
              spawnCLI(session);
            }
            console.log(`[bridge] Model changed to ${model} for session ${sessionId} (${nowLocal ? "ollama" : "cli"})`);
          }
        } catch {}
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    // POST /sessions/:id/permission-mode — update CLI permission mode
    if (req.method === "POST" && parts[0] === "sessions" && parts[2] === "permission-mode") {
      const sessionId = parts[1];
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", () => {
        try {
          const { mode } = JSON.parse(body);
          if (mode && sessions.has(sessionId)) {
            const session = sessions.get(sessionId);
            session.settings.permissionMode = mode;
            if (session.process) {
              const cmd = JSON.stringify({
                type: "command",
                command: `/permission-mode ${mode}`,
              });
              session.process.stdin.write(cmd + "\n");
            }
            console.log(`[bridge] Permission mode changed to ${mode} for session ${sessionId}`);
          }
        } catch {}
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    // GET /sessions/:id/stream?message=...&effortLevel=...&thinkingMode=... — SSE stream (primary chat path)
    if (req.method === "GET" && parts[0] === "sessions" && parts[2] === "stream") {
      const sessionId = parts[1];
      const message = url.searchParams.get("message");
      const effortLevel = url.searchParams.get("effortLevel");
      const thinkingMode = url.searchParams.get("thinkingMode");

      if (!sessions.has(sessionId)) createSession(sessionId);
      const session = sessions.get(sessionId);

      // Apply effort/thinking settings if provided and changed
      if (effortLevel && effortLevel !== session.settings.effortLevel) {
        session.settings.effortLevel = effortLevel;
        if (session.process) {
          const cmd = JSON.stringify({ type: "command", command: `/effort ${effortLevel}` });
          session.process.stdin.write(cmd + "\n");
        }
      }
      if (thinkingMode !== null && thinkingMode !== undefined) {
        session.settings.thinkingMode = thinkingMode === "true";
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });

      // Register this SSE response
      session.sseResponses.add(res);
      res.write(`data: ${JSON.stringify({ type: "stream_start" })}\n\n`);

      if (message) {
        sendToSession(sessionId, message);
      }

      req.on("close", () => {
        session.sseResponses.delete(res);
      });
      return;
    }

    // GET /sessions/:id/events — EventSource for live updates
    if (req.method === "GET" && parts[0] === "sessions" && parts[2] === "events") {
      const sessionId = parts[1];
      if (!sessions.has(sessionId)) createSession(sessionId);
      const session = sessions.get(sessionId);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });

      const snapshot = {
        session: {
          messages: session.messages.map((m) => ({
            role: m.type,
            blocks: [{ type: "text", text: m.content || "" }],
            timestamp: m.timestamp,
          })),
        },
      };
      res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);

      session.sseResponses.add(res);
      req.on("close", () => session.sseResponses.delete(res));
      return;
    }

    // GET /sessions/:id/messages
    if (req.method === "GET" && parts[0] === "sessions" && parts[2] === "messages") {
      const sessionId = parts[1];
      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(session.messages));
      return;
    }

    // POST /sessions/:id/abort
    if (req.method === "POST" && parts[0] === "sessions" && parts[2] === "abort") {
      const sessionId = parts[1];
      const session = sessions.get(sessionId);
      if (session?.process) {
        // Send abort signal — SIGINT allows graceful stop
        session.process.kill("SIGINT");
        session.status = "idle";
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // POST /sessions/:id/permission — respond to a permission request
    if (req.method === "POST" && parts[0] === "sessions" && parts[2] === "permission") {
      const sessionId = parts[1];
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", () => {
        try {
          const { toolId, decision } = JSON.parse(body);
          const session = sessions.get(sessionId);
          if (!session) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Session not found" }));
            return;
          }
          if (!session.process) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "No CLI process running" }));
            return;
          }
          if (!toolId || !decision) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "toolId and decision are required" }));
            return;
          }

          // Write permission response back to CLI stdin as stream-json
          const permResponse = JSON.stringify({
            type: "permission_response",
            toolId,
            decision, // "allow" | "deny" | "always_allow"
          });
          session.process.stdin.write(permResponse + "\n");

          // Remove from pending
          session.pendingPermissions.delete(toolId);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // GET /sessions/:id/settings — return current session settings
    if (req.method === "GET" && parts[0] === "sessions" && parts[2] === "settings" && parts.length === 3) {
      const sessionId = parts[1];
      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        model: session.model,
        permissionMode: session.settings.permissionMode,
        effortLevel: session.settings.effortLevel,
        thinkingMode: session.settings.thinkingMode,
        cwd: session.cwd,
        status: session.status,
      }));
      return;
    }

    // POST /sessions/:id/settings — update session settings
    if (req.method === "POST" && parts[0] === "sessions" && parts[2] === "settings" && parts.length === 3) {
      const sessionId = parts[1];
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", () => {
        try {
          const updates = JSON.parse(body);
          const session = sessions.get(sessionId);
          if (!session) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Session not found" }));
            return;
          }

          // Update local settings tracking
          if (updates.permissionMode) session.settings.permissionMode = updates.permissionMode;
          if (updates.effortLevel !== undefined) session.settings.effortLevel = updates.effortLevel;
          if (updates.thinkingMode !== undefined) session.settings.thinkingMode = !!updates.thinkingMode;

          // Send settings commands to CLI stdin if process is running
          if (session.process) {
            if (updates.permissionMode) {
              const cmd = JSON.stringify({
                type: "command",
                command: `/permission-mode ${updates.permissionMode}`,
              });
              session.process.stdin.write(cmd + "\n");
            }
            if (updates.effortLevel) {
              const cmd = JSON.stringify({
                type: "command",
                command: `/effort ${updates.effortLevel}`,
              });
              session.process.stdin.write(cmd + "\n");
            }
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, settings: session.settings }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // GET /sessions/:id/tasks — return background tasks
    if (req.method === "GET" && parts[0] === "sessions" && parts[2] === "tasks" && parts.length === 3) {
      const sessionId = parts[1];
      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return;
      }
      const tasks = [];
      for (const [id, task] of session.tasks) {
        tasks.push(task);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ tasks }));
      return;
    }

    // POST /sessions/:id/tasks/:taskId/kill — kill a background task
    if (req.method === "POST" && parts[0] === "sessions" && parts[2] === "tasks" && parts[4] === "kill" && parts.length === 5) {
      const sessionId = parts[1];
      const taskId = parts[3];
      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return;
      }
      if (session.process) {
        const cmd = JSON.stringify({
          type: "command",
          command: `/kill ${taskId}`,
        });
        session.process.stdin.write(cmd + "\n");
      }
      // Mark task as killed locally
      const task = session.tasks.get(taskId);
      if (task) {
        task.status = "killed";
        task.updatedAt = Date.now();
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // POST /sessions/:id/compact — send compact command to CLI
    if (req.method === "POST" && parts[0] === "sessions" && parts[2] === "compact" && parts.length === 3) {
      const sessionId = parts[1];
      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return;
      }
      if (!session.process) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No CLI process running" }));
        return;
      }
      const cmd = JSON.stringify({
        type: "command",
        command: "/compact",
      });
      session.process.stdin.write(cmd + "\n");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // POST /execute — direct command execution (terminal panel)
    if (req.method === "POST" && parts[0] === "execute") {
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", () => {
        try {
          const { command, cwd } = JSON.parse(body);
          const proc = spawn("sh", ["-c", command], {
            cwd: cwd || getWorkspace(),
            env: process.env,
            timeout: 30000,
          });
          let stdout = "", stderr = "";
          proc.stdout.on("data", (c) => stdout += c);
          proc.stderr.on("data", (c) => stderr += c);
          proc.on("close", () => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ stdout, stderr, cwd: cwd || getWorkspace() }));
          });
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // POST /filesystem — file browser (supports action: list, read, write, tree, search)
    if (req.method === "POST" && parts[0] === "filesystem") {
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          const action = parsed.action || "auto";
          let fpath = parsed.path || getWorkspace();
          if (fpath === "~" || fpath === ".") fpath = getWorkspace();
          fpath = fpath.replace(/^~/, process.env.HOME || "/tmp");

          if (action === "write") {
            // Write file content
            const dir = path.dirname(fpath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(fpath, parsed.content || "", "utf-8");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, path: fpath }));
            return;
          }

          if (action === "read") {
            // Read file content
            const content = fs.readFileSync(fpath, "utf-8").slice(0, 512 * 1024);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ type: "file", content, path: fpath }));
            return;
          }

          if (action === "tree") {
            // Recursive tree (max depth 4, skip node_modules/.git)
            const maxDepth = parsed.depth || 4;
            const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", "__pycache__", ".cache", ".vscode"]);
            function buildTree(dir, depth) {
              if (depth > maxDepth) return [];
              try {
                return fs.readdirSync(dir, { withFileTypes: true })
                  .filter(e => !e.name.startsWith(".") || e.name === ".claude")
                  .filter(e => !SKIP.has(e.name))
                  .sort((a, b) => {
                    if (a.isDirectory() && !b.isDirectory()) return -1;
                    if (!a.isDirectory() && b.isDirectory()) return 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map(e => {
                    const fullPath = path.join(dir, e.name);
                    if (e.isDirectory()) {
                      return { name: e.name, type: "dir", path: fullPath, children: buildTree(fullPath, depth + 1) };
                    }
                    let size = 0;
                    try { size = fs.statSync(fullPath).size; } catch {}
                    return { name: e.name, type: "file", path: fullPath, size };
                  });
              } catch { return []; }
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ type: "tree", root: fpath, children: buildTree(fpath, 0) }));
            return;
          }

          if (action === "search") {
            // Search files by name pattern
            const query = (parsed.query || "").toLowerCase();
            const results = [];
            const maxResults = parsed.limit || 50;
            function searchDir(dir, depth) {
              if (depth > 6 || results.length >= maxResults) return;
              try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const e of entries) {
                  if (results.length >= maxResults) break;
                  if (e.name.startsWith(".") || e.name === "node_modules") continue;
                  const full = path.join(dir, e.name);
                  if (e.name.toLowerCase().includes(query)) {
                    results.push({ name: e.name, path: full, type: e.isDirectory() ? "dir" : "file" });
                  }
                  if (e.isDirectory() && e.name !== "node_modules" && e.name !== ".git") {
                    searchDir(full, depth + 1);
                  }
                }
              } catch {}
            }
            searchDir(fpath, 0);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ type: "search", results }));
            return;
          }

          // Default: auto-detect (backwards compatible)
          const stat = fs.statSync(fpath);
          if (stat.isDirectory()) {
            const entries = fs.readdirSync(fpath, { withFileTypes: true })
              .filter((e) => !e.name.startsWith("."))
              .map((e) => ({
                name: e.name,
                type: e.isDirectory() ? "dir" : "file",
                size: e.isDirectory() ? 0 : (fs.statSync(path.join(fpath, e.name)).size || 0),
              }));
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ type: "directory", entries }));
          } else {
            const content = fs.readFileSync(fpath, "utf-8").slice(0, 512 * 1024);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ type: "file", content }));
          }
        } catch (err) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // POST /git — git operations for the git panel
    if (req.method === "POST" && parts[0] === "git") {
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", () => {
        try {
          const { action, cwd: gitCwd } = JSON.parse(body);
          const dir = (gitCwd || getWorkspace()).replace(/^~/, process.env.HOME || "/tmp");
          const execSync = require("child_process").execSync;
          const gitOpts = { cwd: dir, timeout: 15000, encoding: "utf-8", maxBuffer: 1024 * 1024 };

          if (action === "status") {
            const status = execSync("git status --porcelain 2>/dev/null || echo ''", gitOpts).trim();
            const branch = execSync("git branch --show-current 2>/dev/null || echo ''", gitOpts).trim();
            const log = execSync("git log --oneline -20 2>/dev/null || echo ''", gitOpts).trim();
            const remotes = execSync("git remote -v 2>/dev/null || echo ''", gitOpts).trim();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status, branch, log, remotes }));
          } else if (action === "diff") {
            const diff = execSync("git diff 2>/dev/null || echo ''", gitOpts).trim();
            const staged = execSync("git diff --cached 2>/dev/null || echo ''", gitOpts).trim();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ diff, staged }));
          } else if (action === "log") {
            const limit = 50;
            const log = execSync(`git log --oneline --graph --decorate -${limit} 2>/dev/null || echo ''`, gitOpts).trim();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ log }));
          } else if (action === "branches") {
            const branches = execSync("git branch -a 2>/dev/null || echo ''", gitOpts).trim();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ branches }));
          } else if (action === "stash-list") {
            const stashes = execSync("git stash list 2>/dev/null || echo ''", gitOpts).trim();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ stashes }));
          } else {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unknown git action: " + action }));
          }
        } catch (err) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // POST /export-conversation — export session messages
    if (req.method === "POST" && parts[0] === "export-conversation") {
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", () => {
        try {
          const { sessionId: sid, format } = JSON.parse(body);
          const session = sessions.get(sid);
          if (!session) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Session not found" }));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ messages: session.messages, format: format || "json" }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // POST /system-prompt — read/write per-project system prompts
    if (req.method === "POST" && parts[0] === "system-prompt") {
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", () => {
        try {
          const { action: spAction, projectPath, content } = JSON.parse(body);
          const dir = (projectPath || getWorkspace()).replace(/^~/, process.env.HOME || "/tmp");
          const promptFile = path.join(dir, ".claude", "system-prompt");

          if (spAction === "read") {
            const text = fs.existsSync(promptFile) ? fs.readFileSync(promptFile, "utf-8") : "";
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ content: text, path: promptFile }));
          } else if (spAction === "write") {
            const promptDir = path.dirname(promptFile);
            if (!fs.existsSync(promptDir)) fs.mkdirSync(promptDir, { recursive: true });
            fs.writeFileSync(promptFile, content || "", "utf-8");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          } else {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unknown action" }));
          }
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // GET /mcp-servers — list configured MCP servers
    if (req.method === "GET" && parts[0] === "mcp-servers") {
      try {
        const configPath = path.join(process.env.HOME || "/tmp", ".claude", "mcp-servers.json");
        const servers = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf-8")) : [];
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ servers }));
      } catch (err) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ servers: [], error: err.message }));
      }
      return;
    }

    // POST /mcp-servers — save MCP server configuration
    if (req.method === "POST" && parts[0] === "mcp-servers") {
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", () => {
        try {
          const { servers } = JSON.parse(body);
          const dir = path.join(process.env.HOME || "/tmp", ".claude");
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, "mcp-servers.json"), JSON.stringify(servers, null, 2), "utf-8");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // GET /sessions-list — list all sessions with metadata
    if (req.method === "GET" && parts[0] === "sessions-list") {
      const list = [];
      for (const [id, s] of sessions) {
        list.push({
          id,
          createdAt: s.createdAt,
          messageCount: s.messages.length,
          model: s.model,
          status: s.status,
          cwd: s.cwd,
        });
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sessions: list }));
      return;
    }

    // GET /claw-md — read ~/.claude/CLAUDE.md
    if (req.method === "GET" && parts[0] === "claw-md") {
      const mdPath = path.join(process.env.HOME || "/tmp", ".claude", "CLAUDE.md");
      try {
        const content = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, "utf-8") : "";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ content }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // POST /claw-md — save ~/.claude/CLAUDE.md
    if (req.method === "POST" && parts[0] === "claw-md") {
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", () => {
        try {
          const { content } = JSON.parse(body);
          const dir = path.join(process.env.HOME || "/tmp", ".claude");
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, "CLAUDE.md"), content || "", "utf-8");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // POST /ollama-pull — pull a model so it's ready to use
    if (req.method === "POST" && parts[0] === "ollama-pull") {
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", () => {
        try {
          const { model } = JSON.parse(body);
          if (!model) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "No model specified" }));
            return;
          }

          console.log(`[bridge] Pulling Ollama model: ${model}`);

          const pullBody = JSON.stringify({ name: model, stream: false });
          const pullReq = http.request({
            hostname: "127.0.0.1",
            port: 11434,
            path: "/api/pull",
            method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(pullBody) },
            timeout: 600000, // 10 min for large models
          }, (pullRes) => {
            let data = "";
            pullRes.on("data", (c) => data += c);
            pullRes.on("end", () => {
              console.log(`[bridge] Ollama pull complete for ${model}`);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: true, model }));
            });
          });

          pullReq.on("error", (err) => {
            console.error(`[bridge] Ollama pull failed:`, err.message);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: `Ollama not running or pull failed: ${err.message}` }));
          });

          pullReq.write(pullBody);
          pullReq.end();
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // POST /transcribe — transcribe audio via OpenAI Whisper API
    if (req.method === "POST" && parts[0] === "transcribe") {
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", async () => {
        try {
          const { audio, mimeType } = JSON.parse(body);
          if (!audio) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "No audio data provided" }));
            return;
          }

          const openaiKey = getOpenaiKey();
          if (!openaiKey) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Voice transcription requires an OpenAI API key. Set it in Settings." }));
            return;
          }

          const audioBuffer = Buffer.from(audio, "base64");
          if (audioBuffer.length < 100) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Audio too short" }));
            return;
          }

          console.log(`[bridge] Transcribing ${(audioBuffer.length / 1024).toFixed(1)}KB audio...`);
          const text = await transcribeWithWhisper(audioBuffer, mimeType || "audio/webm", openaiKey);
          console.log(`[bridge] Transcription: "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ text }));
        } catch (err) {
          console.error("[bridge] Transcription error:", err.message);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // GET /health
    if (parts[0] === "health") {
      const activeSessions = [...sessions.values()].filter(s => s.process !== null).length;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", sessions: sessions.size, active: activeSessions, runtime: getRuntimeDir() }));
      return;
    }

    // 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  // ─── WebSocket Server ──────────────────────────────────────
  if (WebSocketServer) {
    const wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (req, socket, head) => {
      if (req.url === "/ws") {
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
      } else {
        socket.destroy();
      }
    });

    wss.on("connection", (ws) => {
      ws._subscribedSession = null;
      wsClients.add(ws);
      console.log("[bridge-ws] client connected, total:", wsClients.size);

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "subscribe" && msg.sessionId) {
            ws._subscribedSession = msg.sessionId;
            const session = sessions.get(msg.sessionId);
            if (session) {
              ws.send(JSON.stringify({
                type: "session_snapshot",
                sessionId: msg.sessionId,
                messages: session.messages,
                status: session.status,
              }));
            }
          } else if (msg.type === "input" && msg.sessionId && msg.message) {
            if (!sessions.has(msg.sessionId)) createSession(msg.sessionId);
            sendToSession(msg.sessionId, msg.message);
          } else if (msg.type === "permission_response" && msg.sessionId && msg.toolId) {
            const session = sessions.get(msg.sessionId);
            if (session?.process) {
              const permResponse = JSON.stringify({
                type: "permission_response",
                toolId: msg.toolId,
                decision: msg.decision || "deny",
              });
              session.process.stdin.write(permResponse + "\n");
              session.pendingPermissions.delete(msg.toolId);
            }
          } else if (msg.type === "abort" && msg.sessionId) {
            const session = sessions.get(msg.sessionId);
            if (session?.process) {
              session.process.kill("SIGINT");
              session.status = "idle";
            }
          }
        } catch (e) {
          console.error("[bridge-ws] parse error:", e.message);
        }
      });

      ws.on("close", () => {
        wsClients.delete(ws);
        console.log("[bridge-ws] client disconnected, total:", wsClients.size);
      });
    });

    console.log("[bridge] WebSocket server enabled on /ws");
  }

  server.listen(port, "127.0.0.1", () => {
    console.log(`Bridge server running on http://127.0.0.1:${port}`);
  });

  return server;
}

if (require.main === module) {
  const port = parseInt(process.env.BRIDGE_PORT || "9111", 10);
  startBridgeServer(port);
}

module.exports = { startBridgeServer, createSession, sendToSession };
