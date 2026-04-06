import { isPlanModeInterviewPhaseEnabled } from '../../utils/planModeV2.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../AskUserQuestionTool/prompt.js'

const WHAT_HAPPENS_SECTION = `## What Happens in Plan Mode

In plan mode, you'll:
1. Inspect the current state of the Mac - which apps are open, relevant folders, system settings, and anything else needed to understand the starting point
2. Identify which apps, files, and system surfaces the workflow will touch
3. Design the automation: ordered steps, expected state after each step, and rollback if a step fails
4. Present your workflow plan to the user for approval
5. Use ${ASK_USER_QUESTION_TOOL_NAME} if you need to clarify which apps, which files, or which behavior the user wants
6. Exit plan mode with ExitPlanMode once the user has approved the workflow, then execute it

`

function getEnterPlanModeToolPromptExternal(): string {
  // When interview phase is enabled, omit the "What Happens" section —
  // detailed workflow instructions arrive via the plan_mode attachment (messages.ts).
  const whatHappens = isPlanModeInterviewPhaseEnabled()
    ? ''
    : WHAT_HAPPENS_SECTION

  return `Use this tool proactively when the user asks for a plan before acting, or when you're about to start a non-trivial Mac automation that will change real machine state. Getting user sign-off on the workflow before launching apps, moving files, or changing settings prevents wasted effort and, more importantly, prevents unwanted changes to the user's actual Mac. This tool transitions you into plan mode where you can inspect current machine state and design a workflow for user approval.

**Plan mode is especially valuable for Mac work because every action affects real machine state** - launched apps, moved files, sent messages, and changed settings cannot always be silently undone. Getting the workflow right on paper first is cheap; getting it wrong on the live machine is expensive.

## When to Use This Tool

**Prefer using EnterPlanMode** for Mac workflows unless they're single trivial actions. Use it when ANY of these conditions apply:

1. **Multi-App Workflows**: The task coordinates two or more apps
   - Example: "Set up my morning workspace" - which apps to launch, in what order, where to place each window, what to focus first
   - Example: "Prep for my 2pm meeting" - open Calendar, then Zoom link, then Notes, then mute Slack

2. **State-Changing Automations**: The workflow will modify files, settings, or accounts
   - Example: "Organize my Downloads folder" - what counts as a category, what to do with duplicates, dry-run vs actually move
   - Example: "Archive old projects" - what "old" means, where to move them, whether to compress

3. **Multiple Valid Approaches**: The workflow can be solved in several different ways
   - Example: "Back up my notes" - iCloud vs local folder vs export to Markdown
   - Example: "Clean up my desktop" - sort by type, by date, or by project

4. **Workflows That Need Rollback Planning**: Something could go wrong mid-workflow
   - Example: "Bulk rename files in this folder" - what's the rollback if the rename is wrong
   - Example: "Change display arrangement and wallpaper" - how to restore if user dislikes it

5. **Multi-Step Sequences Where Order Matters**: Launching things in the wrong order breaks the flow
   - Example: "Start a recording session" - OBS must launch before the capture source, mic must be unmuted before recording begins

6. **Unclear Requirements**: You need to inspect the Mac before you can define the workflow
   - Example: "Tidy up my Applications folder" - need to see what's there first
   - Example: "Help me process my unread Mail" - need to see how many there are and what they look like

7. **User Explicitly Asks for a Plan**: Any time the user says "plan", "before you do anything", "show me what you'd do", etc.

## When NOT to Use This Tool

Only skip EnterPlanMode for simple Mac actions:
- Single trivial actions (launch one app, quit one app, open one file)
- Tasks where the user has given very specific, detailed step-by-step instructions
- Pure read-only research (use a TaskCreate sub-agent instead)
- The user explicitly says "just do it" or "go"

${whatHappens}## Examples

### GOOD - Use EnterPlanMode:
User: "Plan a multi-app workflow for starting my work day"
- Plan which apps to launch, in what order, expected state at each step, and rollback if an app fails to open

User: "Organize my Downloads folder"
- State-changing, needs category definitions, needs duplicate handling policy, needs confirmation before moving

User: "Set up my machine for a recording session"
- Multi-app, order-sensitive (OBS, audio, camera, notifications disabled), rollback needed if the user wants to go back to normal

User: "Help me triage this week's Mail"
- Unclear scope, changes Mail state (read/flagged/archived), user should approve the triage rules first

User: "Archive old projects in ~/Projects"
- Ambiguous definition of "old", destructive-ish action, worth approving first

### BAD - Don't use EnterPlanMode:
User: "Open Safari"
- Single trivial action

User: "Quit Slack"
- Single trivial action

User: "What apps are currently running?"
- Read-only research, delegate via TaskCreate instead

User: "Just start Mail and Calendar"
- Explicit "just", clear sequence, no planning needed

## Important Notes

- This tool REQUIRES user approval - they must consent to entering plan mode
- If unsure whether to use it for a Mac workflow, err on the side of planning - the cost of a wrong action on a real machine is much higher than the cost of one extra planning round
- Users appreciate being consulted before their Mac state is modified
`
}

function getEnterPlanModeToolPromptAnt(): string {
  // When interview phase is enabled, omit the "What Happens" section —
  // detailed workflow instructions arrive via the plan_mode attachment (messages.ts).
  const whatHappens = isPlanModeInterviewPhaseEnabled()
    ? ''
    : WHAT_HAPPENS_SECTION

  return `Use this tool when the user asks for a plan before you touch their Mac, or when a Mac workflow has genuine ambiguity about the right approach and getting user input before acting would prevent unwanted state changes or significant rework. This tool transitions you into plan mode where you can inspect current machine state and design a workflow for user approval.

**Plan mode is especially valuable for Mac work because every action affects real machine state.** Launched apps, moved files, sent messages, and changed settings cannot always be silently undone, so getting the workflow right on paper first is usually worth the round trip.

## When to Use This Tool

Plan mode is valuable when the Mac workflow is genuinely unclear or genuinely impactful. Use it when:

1. **User Explicitly Requests a Plan**: The user says "plan this", "before you do anything", "show me the steps first", etc.

2. **Significant Workflow Ambiguity**: Multiple reasonable approaches exist and the choice meaningfully affects machine state
   - Example: "Organize my Downloads folder" - by type vs by date vs by project
   - Example: "Back up my notes" - iCloud vs local folder vs Markdown export

3. **Multi-App Workflows Where Order and State Matter**: Which apps, in what order, expected state after each step, rollback if a step fails
   - Example: "Set up my morning workspace" across Mail, Calendar, Slack, browser
   - Example: "Prep for a recording session" - OBS, audio, camera, notification settings

4. **Unclear Requirements**: You need to inspect the Mac before you can define the workflow
   - Example: "Tidy up my Applications folder" - need to see what's there first
   - Example: "Triage my Mail" - need to see scope first

5. **High-Impact or Hard-to-Reverse Actions**: Bulk file operations, settings changes, messages that will actually be sent
   - Example: "Bulk rename files in this folder"
   - Example: "Archive old projects"

## When NOT to Use This Tool

Skip plan mode when the right Mac action is obvious and low-impact:
- Single trivial actions (open one app, quit one app, open one file)
- Read-only research tasks (use TaskCreate with a research sub-agent instead)
- The user has given specific, step-by-step instructions
- The user says "just do it", "go", or "let's do X" - they want action, not a plan

When in doubt for low-impact actions, prefer starting work and using ${ASK_USER_QUESTION_TOOL_NAME} for specific questions over entering a full planning phase. When in doubt for actions that modify real machine state, prefer planning.

${whatHappens}## Examples

### GOOD - Use EnterPlanMode:
User: "Plan a multi-app workflow for my morning routine"
- Explicit plan request; ordered multi-app sequence; benefits from rollback-if-X-fails thinking

User: "Organize my Downloads folder"
- Genuinely ambiguous categories; state-changing; worth approving first

User: "Set up my machine for a livestream"
- Order-sensitive multi-app workflow; high cost of getting it wrong mid-stream

### BAD - Don't use EnterPlanMode:
User: "Open Safari"
- Trivial single action

User: "What apps are running?"
- Read-only research; use TaskCreate instead

User: "Just launch Mail and Calendar"
- Explicit "just"; straightforward

User: "Can we start cleaning up my desktop?"
- User wants to get started on a low-impact task; begin and ask questions as needed

## Important Notes

- This tool REQUIRES user approval - they must consent to entering plan mode
- For Mac automations that modify real state, err on the side of planning
`
}

export function getEnterPlanModeToolPrompt(): string {
  return process.env.USER_TYPE === 'ant'
    ? getEnterPlanModeToolPromptAnt()
    : getEnterPlanModeToolPromptExternal()
}
