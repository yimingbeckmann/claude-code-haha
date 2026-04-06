import { isAutoMemoryEnabled } from '../../memdir/paths.js'
import { registerBundledSkill } from '../bundledSkills.js'

export function registerRememberSkill(): void {
  if (process.env.USER_TYPE !== 'ant') {
    return
  }

  const SKILL_PROMPT = `# Memory Review

## Goal
Review the user's memory landscape and produce a clear report of proposed changes, grouped by action type. Do NOT apply changes — present proposals for user approval.

## Steps

### 1. Gather all memory layers
Read MACHELPER.md and MACHELPER.local.md from the current working directory (if they exist). Your auto-memory content is already in your system prompt — review it there. Note which team memory sections exist, if any.

**Success criteria**: You have the contents of all memory layers and can compare them.

### 2. Classify each auto-memory entry
For each substantive entry in auto-memory, determine the best destination:

| Destination | What belongs there | Examples |
|---|---|---|
| **MACHELPER.md** | Stable Mac automation conventions and instructions for MacHelper in this working directory | "use Arc not Safari", "meetings go in the Work calendar", "never quit Slack without asking", "default screenshot dir is ~/Pictures/shots" |
| **MACHELPER.local.md** | Personal instructions for MacHelper specific to this user/machine, not meant to be shared | "I prefer concise responses", "always dry-run destructive actions", "ask before touching ~/Documents", "my main display is the 6K on the left" |
| **Team memory** | Org-wide knowledge that applies across machines and teammates (only if team memory is configured) | "standups are in #eng-standup at 10am", "use the Tensor workspace in Slack", "company VPN is always on" |
| **Stay in auto-memory** | Working notes, temporary context, or entries that don't clearly fit elsewhere | Session-specific observations, uncertain patterns |

**Important distinctions:**
- MACHELPER.md and MACHELPER.local.md contain instructions for MacHelper itself, not user preferences for unrelated apps (theme, IDE keybindings, etc. don't belong in either)
- Workflow practices (how you handle email triage, how meetings get scheduled, which calendar to use) are ambiguous — ask the user whether they're personal or team-wide
- When unsure, ask rather than guess

**Success criteria**: Each entry has a proposed destination or is flagged as ambiguous.

### 3. Identify cleanup opportunities
Scan across all layers for:
- **Duplicates**: Auto-memory entries already captured in MACHELPER.md or MACHELPER.local.md → propose removing from auto-memory
- **Outdated**: MACHELPER.md or MACHELPER.local.md entries contradicted by newer auto-memory entries → propose updating the older layer
- **Conflicts**: Contradictions between any two layers → propose resolution, noting which is more recent

**Success criteria**: All cross-layer issues identified.

### 4. Present the report
Output a structured report grouped by action type:
1. **Promotions** — entries to move, with destination and rationale
2. **Cleanup** — duplicates, outdated entries, conflicts to resolve
3. **Ambiguous** — entries where you need the user's input on destination
4. **No action needed** — brief note on entries that should stay put

If auto-memory is empty, say so and offer to review MACHELPER.md for cleanup.

**Success criteria**: User can review and approve/reject each proposal individually.

## Rules
- Present ALL proposals before making any changes
- Do NOT modify files without explicit user approval
- Do NOT create new files unless the target doesn't exist yet
- Ask about ambiguous entries — don't guess
`

  registerBundledSkill({
    name: 'remember',
    description:
      'Review auto-memory entries and propose promotions to MACHELPER.md, MACHELPER.local.md, or shared memory. Also detects outdated, conflicting, and duplicate entries across memory layers.',
    whenToUse:
      'Use when the user wants to review, organize, or promote their auto-memory entries. Also useful for cleaning up outdated or conflicting entries across MACHELPER.md, MACHELPER.local.md, and auto-memory.',
    userInvocable: true,
    isEnabled: () => isAutoMemoryEnabled(),
    async getPromptForCommand(args) {
      let prompt = SKILL_PROMPT

      if (args) {
        prompt += `\n## Additional context from user\n\n${args}`
      }

      return [{ type: 'text', text: prompt }]
    },
  })
}
