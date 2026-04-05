# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A locally runnable fork of the leaked Claude Code source (2026-03-31 npm registry leak). The original source couldn't run; this repo applies fixes to make the full Ink TUI and `--print` headless mode work. **Bun is required** — Node.js won't work.

## Commands

```bash
# Install dependencies
bun install

# Run interactive TUI
./bin/claude-haha

# Headless / scripting mode
./bin/claude-haha -p "your prompt"

# Pipe input
echo "explain this" | ./bin/claude-haha -p

# Force recovery CLI (simple readline fallback, no Ink)
CLAUDE_CODE_FORCE_RECOVERY_CLI=1 ./bin/claude-haha

# Windows (PowerShell, no bash script)
bun --env-file=.env ./src/entrypoints/cli.tsx
bun --env-file=.env ./src/localRecoveryCli.ts   # recovery mode
```

There is no build step or test runner configured — the project runs directly via Bun's TypeScript loader.

## Configuration

Copy `.env.example` to `.env`. Key variables:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | `x-api-key` header |
| `ANTHROPIC_AUTH_TOKEN` | `Authorization: Bearer` header (alternative) |
| `ANTHROPIC_BASE_URL` | Custom API endpoint (e.g. OpenRouter, MiniMax) |
| `ANTHROPIC_MODEL` / `ANTHROPIC_DEFAULT_*_MODEL` | Model overrides per tier |
| `API_TIMEOUT_MS` | Request timeout (default 600000) |
| `DISABLE_TELEMETRY=1` | Suppress telemetry |

## Architecture

### Startup Chain

```
bin/claude-haha (bash)
  └─ bun --env-file=.env src/entrypoints/cli.tsx
       └─ src/main.tsx          ← Commander.js CLI + React/Ink bootstrap
            └─ src/replLauncher.tsx
                 └─ src/screens/REPL.tsx   ← main interactive loop
```

`bunfig.toml` preloads `preload.ts` on every run. `preload.ts` defines the `MACRO` global (VERSION, BUILD_TIME, etc.) used throughout the codebase — these would normally be inlined at build time.

`src/entrypoints/cli.tsx` handles special fast-paths (`--version`, `--dump-system-prompt`, `--print`) before loading `main.tsx`.

### Tools

Each tool lives in `src/tools/<ToolName>/<ToolName>.ts` and extends the `Tool` base class (`src/Tool.ts`). Tools are registered in `src/tools.ts`. Some tools are conditionally loaded based on `feature()` flags or `USER_TYPE=ant`.

Core tools: `BashTool`, `FileReadTool`, `FileEditTool`, `FileWriteTool`, `GlobTool`, `GrepTool`, `AgentTool`, `SkillTool`.

### Commands

Slash commands (`/commit`, `/add-dir`, etc.) are in `src/commands/` and registered in `src/commands.ts`. The `getCommandName` / `isCommandEnabled` functions control availability.

### Services

- `src/services/api/` — Anthropic API client, retry logic, token tracking, file uploads
- `src/services/mcp/` — MCP server connection management (`MCPConnectionManager.tsx`)
- `src/services/oauth/` — OAuth flows
- `src/services/compact/` — Context window compaction

### State

Global mutable state lives in `src/bootstrap/state.ts` (session ID, token budgets, turn counters). The `src/context.ts` / `src/context/` directory provides React context for hooks.

### Skills

`src/skills/bundledSkills.ts` exports pre-bundled skills. Custom skills are loaded from disk via `loadSkillsDir.ts`. The `SkillTool` exposes them to the agent.

### Recovery CLI

`src/localRecoveryCli.ts` is a minimal readline-based fallback that bypasses Ink entirely — useful when TUI initialization fails.

### Known Fixes Applied

The upstream leaked source had these blocking bugs, all fixed here:
- TUI not starting: entry script routed no-arg launch to recovery CLI
- Startup hang: `verify` skill imported missing `.md` files (Bun text loader hangs)
- `--print` hang: missing `filePersistence/types.ts` and `ultraplan/prompt.txt` (stub files in `stubs/`)
- Enter key unresponsive: `modifiers-napi` native package missing; `isModifierPressed()` threw, breaking `handleEnter` → `onSubmit` never fired (fixed with try-catch)
- Setup skipped: `preload.ts` was setting `LOCAL_RECOVERY=1` unconditionally

## Workflow

### Planning
- Enter plan mode for any non-trivial task (3+ steps or architectural decisions). Write specs upfront.
- If something goes sideways mid-task, stop and re-plan before continuing.
- Use plan mode for verification steps, not just building.

### Subagents
- Use subagents liberally to keep the main context window clean.
- Offload research, exploration, and parallel analysis to subagents — one focused task per subagent.
- For complex problems, throw more compute at it via parallel subagents.

### Task Management
1. Write plan to `tasks/todo.md` with checkable items before starting implementation.
2. Check in on the plan before beginning.
3. Mark items complete as you go.
4. Add a review section to `tasks/todo.md` when done.
5. After any correction from the user, update `tasks/lessons.md` with the pattern — write rules that prevent the same mistake. Review `tasks/lessons.md` at session start.

### Verification
- Never mark a task complete without proving it works.
- Diff behavior between main and your changes when relevant.
- Run tests, check logs, demonstrate correctness.

### Code Quality
- For non-trivial changes, pause and ask: "Is there a more elegant way?" If a fix feels hacky, implement the elegant solution instead. Skip this for simple obvious fixes.
- Only touch what's necessary — minimal impact, no side effects.
- Find root causes; no temporary fixes.

### Bug Fixing
- When given a bug report: just fix it. Point at logs/errors/failing tests and resolve them without hand-holding.
- When fixing bugs, make minimal targeted changes — do NOT refactor surrounding code.
- Test each fix individually before moving to the next.
- When a fix doesn't work, revert and try a different approach rather than layering more changes.

## Project Identification
- This is the **Claude Code runtime** (CLI, non-Electron)
- Do NOT confuse with: Tensor Code 2 GUI (in desktop/), Chrome extensions, or other projects
