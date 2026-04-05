export type CommandCategory =
  | "session"
  | "code"
  | "model"
  | "tools"
  | "navigation"
  | "info"
  | "view";

export interface Command {
  id: string;
  label: string;
  description: string;
  category: CommandCategory;
  shortcut?: string;
  icon: string;
  action: string;
  requiresArg?: boolean;
  argPlaceholder?: string;
  execute: (ctx: CommandContext) => void;
}

export interface CommandContext {
  createSession: () => void;
  clearMessages: () => void;
  setModel: (model: string) => void;
  togglePanel: (panel: string) => void;
  openSettings: () => void;
  exportChat: () => void;
  sendMessage: (text: string) => void;
  setAgentMode: (enabled: boolean) => void;
  showTasks: () => void;
  compactContext: () => void;
  showCost: () => void;
  showStats: () => void;
  showHelp: () => void;
  showDoctor: () => void;
  toggleFastMode: () => void;
  toggleVimMode: () => void;
  setEffort: (level: string) => void;
  showDiff: () => void;
  showPermissions: () => void;
  runCommit: () => void;
  toggleSearch: () => void;
  resumeSession: () => void;
  branchConversation: () => void;
  showStatus: () => void;
  setTheme: (theme: string) => void;
  shareConversation: () => void;
  renameSession: (name: string) => void;
  initProject: () => void;
  showMcp: () => void;
  showHooks: () => void;
  showSkills: () => void;
  addDir: (path: string) => void;
  showContext: () => void;
  showMemory: () => void;
  showVersion: () => void;
  showAgents: () => void;
  forkConversation: () => void;
  rewindConversation: () => void;
  showInsights: () => void;
  toggleKairos: () => void;
  toggleUndercover: () => void;
  toggleBrief: () => void;
  showSwarmStatus: () => void;
}

export const categoryMeta: Record<CommandCategory, { label: string; icon: string }> = {
  session:    { label: "Session",    icon: ">" },
  code:       { label: "Code",       icon: "{}" },
  model:      { label: "Model",      icon: "#" },
  tools:      { label: "Tools",      icon: "~" },
  navigation: { label: "Navigation", icon: "/" },
  info:       { label: "Info",       icon: "i" },
  view:       { label: "View",       icon: "[]" },
};

export const CATEGORY_ORDER: CommandCategory[] = [
  "session",
  "code",
  "model",
  "tools",
  "navigation",
  "info",
  "view",
];

export const commands: Command[] = [
  // ── Session ──────────────────────────────────────────────────
  {
    id: "new", label: "new", description: "Start new conversation",
    category: "session", shortcut: "Ctrl+N", icon: "+", action: "session.new",
    execute: (ctx) => ctx.createSession(),
  },
  {
    id: "clear", label: "clear", description: "Clear conversation messages",
    category: "session", shortcut: "Ctrl+L", icon: "x", action: "session.clear",
    execute: (ctx) => ctx.clearMessages(),
  },
  {
    id: "compact", label: "compact", description: "Compact context window",
    category: "session", shortcut: "Ctrl+Shift+C", icon: "=", action: "session.compact",
    execute: (ctx) => ctx.compactContext(),
  },
  {
    id: "resume", label: "resume", description: "Resume a previous session",
    category: "session", icon: "<", action: "session.resume",
    execute: (ctx) => ctx.resumeSession(),
  },
  {
    id: "export", label: "export", description: "Export conversation as Markdown",
    category: "session", icon: "v", action: "session.export",
    execute: (ctx) => ctx.exportChat(),
  },
  {
    id: "share", label: "share", description: "Share conversation link",
    category: "session", icon: "^", action: "session.share",
    execute: (ctx) => ctx.shareConversation(),
  },
  {
    id: "rename", label: "rename", description: "Rename current session",
    category: "session", icon: "a", action: "session.rename",
    requiresArg: true, argPlaceholder: "new name",
    execute: (ctx) => ctx.renameSession(""),
  },
  {
    id: "branch", label: "branch", description: "Branch conversation from here",
    category: "session", icon: "Y", action: "session.branch",
    execute: (ctx) => ctx.branchConversation(),
  },
  {
    id: "fork", label: "fork", description: "Fork conversation into parallel branches",
    category: "session", icon: "Y", action: "session.fork",
    execute: (ctx) => ctx.forkConversation(),
  },
  {
    id: "rewind", label: "rewind", description: "Rewind to earlier conversation state",
    category: "session", icon: "<", action: "session.rewind",
    execute: (ctx) => ctx.rewindConversation(),
  },

  // ── Code ─────────────────────────────────────────────────────
  {
    id: "commit", label: "commit", description: "Create git commit with AI message",
    category: "code", icon: "+", action: "code.commit",
    execute: (ctx) => ctx.runCommit(),
  },
  {
    id: "diff", label: "diff", description: "Show pending git diff",
    category: "code", icon: "+-", action: "code.diff",
    execute: (ctx) => ctx.showDiff(),
  },
  {
    id: "review", label: "review", description: "AI code review for issues",
    category: "code", shortcut: "Ctrl+Shift+R", icon: "*", action: "code.review",
    execute: (ctx) => ctx.sendMessage("Review the code for bugs, security issues, and best practices."),
  },
  {
    id: "plan", label: "plan", description: "Enter plan mode for implementation",
    category: "code", icon: "-", action: "code.plan",
    execute: (ctx) => ctx.sendMessage("Entering plan mode. Describe what you want to build."),
  },
  {
    id: "init", label: "init", description: "Initialize project configuration",
    category: "code", icon: ">", action: "code.init",
    execute: (ctx) => ctx.initProject(),
  },
  {
    id: "simplify", label: "simplify", description: "Simplify and clean up code",
    category: "code", icon: "~", action: "code.simplify",
    execute: (ctx) => ctx.sendMessage("Review changed code for reuse, quality, and efficiency, then simplify."),
  },
  {
    id: "test", label: "test", description: "Generate unit tests for code",
    category: "code", icon: "!", action: "code.test",
    execute: (ctx) => ctx.sendMessage("Generate comprehensive unit tests for the provided code."),
  },
  {
    id: "refactor", label: "refactor", description: "Suggest refactoring improvements",
    category: "code", icon: ">", action: "code.refactor",
    execute: (ctx) => ctx.sendMessage("Analyze code and suggest refactoring improvements."),
  },
  {
    id: "fix", label: "fix", description: "Fix bugs in selected code",
    category: "code", icon: "!", action: "code.fix",
    execute: (ctx) => ctx.sendMessage("Find and fix bugs in the code."),
  },
  {
    id: "explain", label: "explain", description: "Explain how code works",
    category: "code", icon: "?", action: "code.explain",
    execute: (ctx) => ctx.sendMessage("Explain how this code works step by step."),
  },
  {
    id: "optimize", label: "optimize", description: "Optimize code for performance",
    category: "code", icon: ">>", action: "code.optimize",
    execute: (ctx) => ctx.sendMessage("Optimize this code for better performance."),
  },
  {
    id: "ultrareview", label: "ultrareview", description: "Deep Opus-powered code review",
    category: "code", icon: "**", action: "code.ultrareview",
    execute: (ctx) => ctx.sendMessage("/ultrareview"),
  },
  {
    id: "security-review", label: "security-review", description: "Run security audit on project",
    category: "code", icon: "!", action: "code.securityReview",
    execute: (ctx) => ctx.sendMessage("/security-review"),
  },
  {
    id: "init-verifiers", label: "init-verifiers", description: "Set up verification pipelines",
    category: "code", icon: "!", action: "code.initVerifiers",
    execute: (ctx) => ctx.sendMessage("/init-verifiers"),
  },

  // ── Model ────────────────────────────────────────────────────
  {
    id: "model", label: "model", description: "Switch AI model",
    category: "model", icon: "#", action: "model.switch",
    requiresArg: true, argPlaceholder: "model name",
    execute: () => {},
  },
  {
    id: "fast", label: "fast", description: "Toggle fast mode (Haiku)",
    category: "model", icon: ">>", action: "model.fast",
    execute: (ctx) => ctx.toggleFastMode(),
  },
  {
    id: "effort", label: "effort", description: "Set reasoning effort level",
    category: "model", icon: "@", action: "model.effort",
    requiresArg: true, argPlaceholder: "low | medium | high",
    execute: (ctx) => ctx.setEffort("high"),
  },
  {
    id: "agent", label: "agent", description: "Toggle autonomous agent mode",
    category: "model", icon: "^", action: "model.agent",
    execute: (ctx) => ctx.setAgentMode(true),
  },
  {
    id: "brief", label: "brief", description: "Toggle concise output mode",
    category: "model", icon: ".", action: "model.brief",
    execute: (ctx) => ctx.toggleBrief(),
  },

  // ── Tools ────────────────────────────────────────────────────
  {
    id: "mcp", label: "mcp", description: "Manage MCP server connections",
    category: "tools", icon: "<>", action: "tools.mcp",
    execute: (ctx) => ctx.showMcp(),
  },
  {
    id: "hooks", label: "hooks", description: "Configure automation hooks",
    category: "tools", icon: "~>", action: "tools.hooks",
    execute: (ctx) => ctx.showHooks(),
  },
  {
    id: "permissions", label: "permissions", description: "View and edit permission rules",
    category: "tools", icon: "%", action: "tools.permissions",
    execute: (ctx) => ctx.showPermissions(),
  },
  {
    id: "skills", label: "skills", description: "Browse available skills",
    category: "tools", icon: "*", action: "tools.skills",
    execute: (ctx) => ctx.showSkills(),
  },
  {
    id: "vim", label: "vim", description: "Toggle vim keybindings",
    category: "tools", icon: "vi", action: "tools.vim",
    execute: (ctx) => ctx.toggleVimMode(),
  },
  {
    id: "buddy", label: "buddy", description: "Toggle coding buddy companion",
    category: "tools", icon: "~", action: "tools.buddy",
    execute: (ctx) => ctx.togglePanel("buddy"),
  },
  {
    id: "gemma", label: "gemma", description: "Set up local Gemma model",
    category: "tools", icon: "\u2B21", action: "tools.gemma",
    execute: (ctx) => ctx.togglePanel("gemma"),
  },
  {
    id: "schedule", label: "schedule", description: "Create a scheduled task",
    category: "tools", icon: "@", action: "tools.schedule",
    execute: (ctx) => ctx.sendMessage("Set up a scheduled task."),
  },
  {
    id: "loop", label: "loop", description: "Run a command on interval",
    category: "tools", icon: "O", action: "tools.loop",
    requiresArg: true, argPlaceholder: "interval command",
    execute: (ctx) => ctx.sendMessage("Set up a recurring command."),
  },
  {
    id: "stickers", label: "stickers", description: "Browse and insert ASCII stickers",
    category: "tools", icon: "*", action: "tools.stickers",
    execute: (ctx) => ctx.togglePanel("stickers"),
  },
  {
    id: "kairos", label: "kairos", description: "Toggle KAIROS always-on mode",
    category: "tools", icon: "K", action: "tools.kairos",
    execute: (ctx) => ctx.toggleKairos(),
  },
  {
    id: "undercover", label: "undercover", description: "Toggle undercover mode",
    category: "tools", icon: "?", action: "tools.undercover",
    execute: (ctx) => ctx.toggleUndercover(),
  },
  {
    id: "swarm", label: "swarm", description: "Launch multi-agent swarm",
    category: "tools", icon: "^", action: "tools.swarm",
    execute: (ctx) => ctx.togglePanel("swarm"),
  },
  {
    id: "swarm-status", label: "swarm-status", description: "View swarm dashboard",
    category: "tools", icon: "=", action: "tools.swarmStatus",
    execute: (ctx) => ctx.showSwarmStatus(),
  },

  // ── Navigation ───────────────────────────────────────────────
  {
    id: "add-dir", label: "add-dir", description: "Add working directory to session",
    category: "navigation", icon: "+", action: "nav.addDir",
    requiresArg: true, argPlaceholder: "path",
    execute: (ctx) => ctx.addDir(""),
  },
  {
    id: "context", label: "context", description: "View and manage context window",
    category: "navigation", icon: "[]", action: "nav.context",
    execute: (ctx) => ctx.showContext(),
  },
  {
    id: "files", label: "files", description: "Browse project files",
    category: "navigation", shortcut: "Ctrl+Shift+E", icon: "[]", action: "nav.files",
    execute: (ctx) => ctx.togglePanel("files"),
  },
  {
    id: "memory", label: "memory", description: "View and edit memory files",
    category: "navigation", icon: "M", action: "nav.memory",
    execute: (ctx) => ctx.showMemory(),
  },

  // ── Info ──────────────────────────────────────────────────────
  {
    id: "help", label: "help", description: "Show all available commands",
    category: "info", shortcut: "Ctrl+/", icon: "?", action: "info.help",
    execute: (ctx) => ctx.showHelp(),
  },
  {
    id: "cost", label: "cost", description: "Show token usage and cost",
    category: "info", icon: "$", action: "info.cost",
    execute: (ctx) => ctx.showCost(),
  },
  {
    id: "stats", label: "stats", description: "Show session statistics",
    category: "info", icon: "=", action: "info.stats",
    execute: (ctx) => ctx.showStats(),
  },
  {
    id: "status", label: "status", description: "Show system and session status",
    category: "info", icon: "*", action: "info.status",
    execute: (ctx) => ctx.showStatus(),
  },
  {
    id: "doctor", label: "doctor", description: "Run environment diagnostics",
    category: "info", icon: "+", action: "info.doctor",
    execute: (ctx) => ctx.showDoctor(),
  },
  {
    id: "version", label: "version", description: "Show app version info",
    category: "info", icon: "v", action: "info.version",
    execute: (ctx) => ctx.showVersion(),
  },
  {
    id: "changelog", label: "changelog", description: "View recent changes",
    category: "info", icon: "~", action: "info.changelog",
    execute: (ctx) => ctx.sendMessage("Show the recent changelog."),
  },
  {
    id: "insights", label: "insights", description: "Show codebase analytics and insights",
    category: "info", icon: "=", action: "info.insights",
    execute: (ctx) => ctx.showInsights(),
  },

  // ── View ──────────────────────────────────────────────────────
  {
    id: "settings", label: "settings", description: "Open settings panel",
    category: "view", shortcut: "Ctrl+,", icon: "#", action: "view.settings",
    execute: (ctx) => ctx.openSettings(),
  },
  {
    id: "theme", label: "theme", description: "Switch color theme",
    category: "view", icon: "#", action: "view.theme",
    requiresArg: true, argPlaceholder: "theme name",
    execute: (ctx) => ctx.setTheme("dark"),
  },
  {
    id: "terminal", label: "terminal", description: "Toggle terminal panel",
    category: "view", shortcut: "Ctrl+`", icon: ">_", action: "view.terminal",
    execute: (ctx) => ctx.togglePanel("terminal"),
  },
  {
    id: "git", label: "git", description: "Toggle git panel",
    category: "view", shortcut: "Ctrl+Shift+G", icon: "*", action: "view.git",
    execute: (ctx) => ctx.togglePanel("git"),
  },
  {
    id: "search", label: "search", description: "Open file search panel",
    category: "view", shortcut: "Ctrl+Shift+F", icon: "/", action: "view.search",
    execute: (ctx) => ctx.toggleSearch(),
  },
  {
    id: "agents", label: "agents", description: "Manage background agents",
    category: "view", icon: "^", action: "view.agents",
    execute: (ctx) => ctx.showAgents(),
  },
  {
    id: "tasks", label: "tasks", description: "View and manage task list",
    category: "view", icon: "~", action: "view.tasks",
    execute: (ctx) => ctx.showTasks(),
  },
];

/** Simple fuzzy match: checks if all characters in the query appear in order within the target. */
export function fuzzyMatch(query: string, target: string): { match: boolean; score: number; indices: number[] } {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const indices: number[] = [];
  let qi = 0;
  let score = 0;
  let lastIdx = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      // Consecutive matches score higher
      score += (lastIdx === ti - 1) ? 3 : 1;
      // Bonus for match at start of word
      if (ti === 0 || t[ti - 1] === " " || t[ti - 1] === ":" || t[ti - 1] === "/") score += 2;
      lastIdx = ti;
      qi++;
    }
  }

  return { match: qi === q.length, score, indices };
}

export function filterCommands(query: string): (Command & { matchIndices?: number[] })[] {
  const q = query.toLowerCase().replace(/^\//, "").trim();

  // No query: show all commands
  if (!q) return commands;

  // Fuzzy match against id and description
  const results: { cmd: Command; score: number; indices: number[] }[] = [];

  for (const cmd of commands) {
    const nameResult = fuzzyMatch(q, cmd.id);
    const descResult = fuzzyMatch(q, cmd.description);

    if (nameResult.match || descResult.match) {
      // Prefer name matches; use whichever scored higher
      const best = nameResult.match && nameResult.score >= descResult.score
        ? { score: nameResult.score + 10, indices: nameResult.indices }
        : { score: descResult.score, indices: descResult.indices };
      results.push({ cmd, ...best });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.map(r => ({ ...r.cmd, matchIndices: r.indices }));
}
