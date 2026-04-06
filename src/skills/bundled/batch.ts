import { AGENT_TOOL_NAME } from '../../tools/AgentTool/constants.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../../tools/AskUserQuestionTool/prompt.js'
import { ENTER_PLAN_MODE_TOOL_NAME } from '../../tools/EnterPlanModeTool/constants.js'
import { EXIT_PLAN_MODE_TOOL_NAME } from '../../tools/ExitPlanModeTool/constants.js'
import { SKILL_TOOL_NAME } from '../../tools/SkillTool/constants.js'
import { registerBundledSkill } from '../bundledSkills.js'

const MIN_AGENTS = 3
const MAX_AGENTS = 20

const WORKER_INSTRUCTIONS = `After you finish your unit of work:
1. **Simplify** — Invoke the \`${SKILL_TOOL_NAME}\` tool with \`skill: "simplify"\` to tighten up any workflow or script you produced.
2. **Verify** — Run the verification step from the coordinator's prompt (below). This is usually a screenshot, a file check, a log tail, or a "did the notification appear" observation. If the recipe says to skip verification for this unit, skip it.
3. **Report** — End with a single line: \`RESULT: <ok | failed — reason>\` so the coordinator can tally outcomes. Include any artifact paths (screenshots, output files, log snippets) the coordinator may need to inspect.`

function buildPrompt(instruction: string): string {
  return `# Batch: Parallel Mac Automation Orchestration

You are orchestrating a parallelizable Mac automation job — fanning out across multiple apps, files, windows, monitors, or filesystem targets where the units of work are genuinely independent.

## !! Critical Safety Warning: Shared Mac State !!

**Most MacMind UI actions mutate shared state and CANNOT run concurrently.** A single Mac has exactly one:
- Keyboard focus / frontmost app
- Mouse cursor
- Clipboard
- Screen capture session
- Active input method

Any batch unit that does \`click\`, \`type\`, \`keystroke\`, \`activate <app>\`, clipboard copy/paste, drag, screenshot-then-click, or any UI scripting against the frontmost window will **stomp on sibling units** running in parallel. Running two UI-scripting workers at once produces corrupted clicks, lost keystrokes, paste into the wrong app, or mid-action focus steals.

**Use \`/batch\` ONLY for genuinely independent work.** Good examples:

- **Process multiple files**: transcode a folder of videos, rename/tag/move a batch of files, extract text from many PDFs — pure filesystem work, no GUI interaction.
- **Screenshot multiple monitors / multiple displays**: the screenshot APIs can capture each display without stealing focus.
- **Send multiple notifications**: \`osascript display notification\` and NotificationCenter APIs are non-blocking and independent per-notification.
- **Independent filesystem ops**: \`du\` on several directory trees, \`shasum\` across many files, parallel downloads to distinct paths, log rotation across separate log files.
- **Parallel shell/CLI work**: independent \`brew\` queries, \`git\` operations on separate repos, independent network fetches.
- **Multi-host remote work**: SSH into several machines and do work on each (shared state is per-host, not shared).

**DO NOT use \`/batch\` for**: anything that clicks, types, activates apps, uses the clipboard, relies on frontmost-window state, drags, uses accessibility actions on the focused app, or captures a specific window. Those belong in a single sequential workflow — run them one at a time in the foreground.

If in doubt, **ask**: "does this unit read or write the keyboard, mouse, clipboard, frontmost app, or focused window?" If yes for any two sibling units, they are not independent and \`/batch\` is the wrong tool.

## User Instruction

${instruction}

## Phase 1: Research and Plan (Plan Mode)

Call the \`${ENTER_PLAN_MODE_TOOL_NAME}\` tool now to enter plan mode, then:

1. **Understand the scope.** Launch one or more subagents (in the foreground — you need their results) to research what this instruction touches. Enumerate the targets: which files, which apps, which windows, which monitors, which URLs, which remote hosts. Understand any conventions or constraints the user cares about.

2. **Independence check.** For every pair of candidate units, confirm they share no mutable Mac state (focus, clipboard, cursor, frontmost app, active document). If any two units would both need to drive the GUI, **abort the batch plan** and recommend a sequential workflow instead. Explain this to the user in your plan.

3. **Decompose into independent units.** Break the work into ${MIN_AGENTS}–${MAX_AGENTS} self-contained units. Each unit must:
   - Touch only its own file(s) / target(s) / remote host — no overlap with sibling units
   - Not depend on another unit finishing first (no ordering)
   - Not require keyboard focus, mouse, clipboard, or the frontmost-app slot — OR, if it does, be the ONLY unit using that slot (there can be at most one "UI worker")
   - Be roughly uniform in size (split large units, merge trivial ones)

   Scale the count to the actual work: a handful of targets → closer to ${MIN_AGENTS}; dozens → closer to ${MAX_AGENTS}. Do not spawn more agents than you have real independent targets.

4. **Determine the verification recipe.** Figure out how a worker can confirm its unit actually succeeded — not just that its commands returned zero. Look for:
   - A screenshot + visual check (for GUI-producing work: did the window appear, did the file open)
   - A filesystem check (\`ls\`, \`stat\`, \`shasum\`, \`file\`, read the first N bytes) for file-producing work
   - A log tail or a \`grep\` of a known log file for daemon/service work
   - An \`osascript\` query of the target app's state (is this tab open, is this note saved)
   - A Shortcut or \`open -a\` round-trip test

   If you cannot find a concrete verification path, use the \`${ASK_USER_QUESTION_TOOL_NAME}\` tool to ask the user how to verify this batch. Offer 2–3 specific options based on what you found. Do not skip this — workers cannot ask the user themselves.

   Write the recipe as a short, concrete set of steps that a worker can execute autonomously.

5. **Write the plan.** In your plan include:
   - A summary of what you found during research
   - The independence check: which Mac-shared-state resources each unit touches, and confirmation that no two units collide
   - A numbered list of work units — for each: a short title, its targets (files/apps/hosts), and a one-line description of the change
   - The verification recipe (or "skip verification because …" if the user chose that)
   - The exact worker instructions you will give each agent (the shared template)

6. Call \`${EXIT_PLAN_MODE_TOOL_NAME}\` to present the plan for approval.

## Phase 2: Spawn Workers (After Plan Approval)

Once the plan is approved, spawn one background agent per work unit using the \`${AGENT_TOOL_NAME}\` tool with \`run_in_background: true\`. Launch them all in a single message block so they start in parallel.

For each agent, the prompt must be fully self-contained. Include:
- The overall goal (the user's instruction)
- This unit's specific target (title, target list, action — copied verbatim from your plan)
- Any conventions or constraints the user cares about
- The verification recipe from your plan (or "skip verification because …")
- A reminder that this worker must NOT touch shared Mac UI state (focus/clipboard/mouse) unless the plan explicitly designated it as the sole UI worker
- The worker instructions below, copied verbatim:

\`\`\`
${WORKER_INSTRUCTIONS}
\`\`\`

Use \`subagent_type: "general-purpose"\` unless a more specific agent type fits.

## Phase 3: Track Progress

After launching all workers, render an initial status table:

| # | Unit | Target | Status | Result |
|---|------|--------|--------|--------|
| 1 | <title> | <target> | running | — |
| 2 | <title> | <target> | running | — |

As background-agent completion notifications arrive, parse the \`RESULT: …\` line from each agent's output and re-render the table with \`done\` / \`failed\` and the result note. Keep a brief failure reason for any agent that did not succeed.

When all agents have reported, render the final table and a one-line summary (e.g., "18/20 units succeeded; 2 failed — see notes").
`
}

const MISSING_INSTRUCTION_MESSAGE = `Provide an instruction describing the Mac automation batch you want to run.

Examples:
  /batch transcode every .mov in ~/Movies/raw to h265 .mp4 in ~/Movies/out
  /batch take a screenshot of each connected display and save to ~/Desktop
  /batch run \`brew outdated\` on each of my three dev machines over SSH
  /batch extract text from every PDF in ~/Documents/receipts-2025

Remember: batch is for GENUINELY INDEPENDENT work. Anything that needs the keyboard, mouse, clipboard, or frontmost app should run as a single sequential workflow, not a batch.`

export function registerBatchSkill(): void {
  registerBundledSkill({
    name: 'batch',
    description:
      'Fan out Mac automation across multiple apps, files, windows, or hosts in parallel — only where the work is genuinely independent of shared GUI state.',
    whenToUse:
      'Use when the user wants to run the same Mac automation across many independent targets (batch file processing, multi-monitor screenshots, independent filesystem ops, multi-host remote work). Do NOT use for workflows that need keyboard/mouse/clipboard/frontmost-app — those share state and must run sequentially.',
    argumentHint: '<instruction>',
    userInvocable: true,
    disableModelInvocation: true,
    async getPromptForCommand(args) {
      const instruction = args.trim()
      if (!instruction) {
        return [{ type: 'text', text: MISSING_INSTRUCTION_MESSAGE }]
      }

      return [{ type: 'text', text: buildPrompt(instruction) }]
    },
  })
}
