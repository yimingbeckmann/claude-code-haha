import { AGENT_TOOL_NAME } from '../../tools/AgentTool/constants.js'
import { registerBundledSkill } from '../bundledSkills.js'

const SIMPLIFY_PROMPT = `# Simplify: Mac Workflow Review and Cleanup

Review the most recent Mac automation workflow (or the one the user names) and tighten it up. Philosophy: **less is more — remove anything that isn't earning its keep**. A shorter, sturdier workflow beats a clever one every time.

## Phase 1: Identify the Workflow

Find the workflow under review. In order of preference:

1. The workflow file, script, AppleScript, Shortcut, or MacMind action sequence the user just mentioned or that you edited earlier in this conversation.
2. Recently modified \`.applescript\`, \`.scpt\`, \`.shortcut\`, \`.sh\`, or MacMind workflow definitions in the current directory.
3. If nothing obvious exists, ask the user which workflow to review.

Read the full workflow into context before launching review agents so they can reason about it end-to-end.

## Phase 2: Launch Three Review Agents in Parallel

Use the ${AGENT_TOOL_NAME} tool to launch all three agents concurrently in a single message. Pass each agent the full workflow text so it has complete context.

### Agent 1: Consolidation Review

Look for sequences of low-level actions that can collapse into a single higher-level action:

1. **Combine sequential actions** that always run back-to-back on the same target — multiple \`keystroke\`/\`key code\` calls that could be one \`type\`, multi-step menu navigation that could be a single menu item invocation, repeated \`System Events\` calls that could be batched.
2. **Prefer higher-level MacMind actions over low-level mouse/keyboard.** If a MacMind action exists for the task (open app, switch window, run shortcut, send notification, read/write clipboard, take screenshot), use it instead of scripting \`click at {x, y}\` or raw key events. Low-level mouse coordinates are fragile and break across displays/resolutions.
3. **Eliminate redundant waits.** Flag every \`delay\`, \`sleep\`, \`wait\`, or polling loop. Is it actually needed, or was it added to paper over a race? Can it be replaced with a proper "wait until window exists / element ready" check? Can two waits back-to-back be merged?

### Agent 2: Robustness Review

Review the workflow for fragile patterns that will break on a different Mac, different display, different app version, or different user state:

1. **Fragile UI scripting**: hardcoded screen coordinates, clicks on UI elements identified only by position, assumptions about window placement. Prefer AppleScript \`tell application\` targeting, Shortcuts actions, or accessibility-API lookups by role/title over \`click at\`.
2. **Prefer AppleScript/Shortcuts over UI scripting where possible.** Most Apple and well-behaved third-party apps expose a scriptable dictionary or a Shortcuts action — use those instead of simulating keystrokes in the GUI.
3. **Unverified assumptions**: assuming an app is already running, a specific window is frontmost, the clipboard holds what you expect, a file exists at a path. Flag each and either add a guard or remove the assumption.
4. **Stringly-typed bundle IDs, paths, and key codes** scattered through the script — hoist to named constants so they're greppable and fixable in one place.
5. **Narrating comments** (\`# now click the button\`) — delete. Keep only non-obvious WHY (this \`delay 0.5\` exists because Notes.app's window takes ~400ms to become responsive after activate).

### Agent 3: Efficiency Review

Review the workflow for wasted work:

1. **Unnecessary app launches / activations**: activating an app that's already frontmost, re-opening a document that's already open, repeated \`tell application "Finder" to activate\`.
2. **Repeated expensive reads**: re-reading the same file, re-running the same \`osascript\`, re-querying the same window list when one read would do.
3. **Missed concurrency**: independent automations run sequentially when they could run in parallel (e.g., screenshotting multiple monitors, sending several notifications, processing a batch of files). Note: most UI automation shares focus/clipboard state and **cannot** run concurrently — flag only genuinely independent work. See the \`/batch\` skill for parallel fan-out.
4. **Over-broad operations**: reading a whole Mail mailbox to find one message, scanning every file in a folder when a Spotlight query would do, \`ls\`-ing a huge directory when a glob for one file suffices.
5. **Dead branches**: error handlers that will never fire, toggles for states the script never reaches, \`if\` arms that are always true.

## Phase 3: Fix Issues

Wait for all three agents to complete. Aggregate their findings and fix each issue directly. If a finding is a false positive or not worth addressing, note it and move on — do not argue with the finding, just skip it.

When done, briefly summarize what was tightened (or confirm the workflow was already lean).
`

export function registerSimplifySkill(): void {
  registerBundledSkill({
    name: 'simplify',
    description:
      'Review a Mac automation workflow for consolidation, robustness, and efficiency, then tighten it up.',
    userInvocable: true,
    async getPromptForCommand(args) {
      let prompt = SIMPLIFY_PROMPT
      if (args) {
        prompt += `\n\n## Additional Focus\n\n${args}`
      }
      return [{ type: 'text', text: prompt }]
    },
  })
}
