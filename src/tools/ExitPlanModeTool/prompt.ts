// External stub for ExitPlanModeTool prompt - excludes Ant-only allowedPrompts section

// Hardcoded to avoid relative import issues in stub
const ASK_USER_QUESTION_TOOL_NAME = 'AskUserQuestion'

export const EXIT_PLAN_MODE_V2_TOOL_PROMPT = `Use this tool when you are in plan mode, have finished writing your Mac workflow plan to the plan file, and are ready for the user to approve it so you can execute the workflow against their real machine.

## How This Tool Works
- You should have already written your Mac workflow plan to the plan file specified in the plan mode system message
- This tool does NOT take the plan content as a parameter - it will read the plan from the file you wrote
- This tool simply signals that you're done planning and ready for the user to review and approve the workflow
- The user will see the contents of your plan file when they review it
- After the user approves, plan mode exits and you begin executing the workflow against the Mac

## When to Use This Tool
IMPORTANT: Only use this tool when you are planning a Mac workflow that will actually change machine state (launching apps, moving files, sending messages, changing settings, etc.) or that the user explicitly asked you to plan. For pure read-only Mac research where you're just gathering information about the machine (what's installed, what's in a folder, what's on the calendar) - do NOT use this tool; delegate that work via TaskCreate instead.

## Before Using This Tool
Ensure your Mac workflow plan is complete and unambiguous:
- Every step names the specific app, file, or system surface it will touch
- The expected state after each step is clear
- Rollback behavior is defined for any step that could leave the machine in a bad state
- If you still have unresolved questions about which apps, which files, or which behavior the user wants, use ${ASK_USER_QUESTION_TOOL_NAME} first (in earlier phases of plan mode)
- Once your workflow is finalized, use THIS tool to request approval

**Important:** Do NOT use ${ASK_USER_QUESTION_TOOL_NAME} to ask "Is this plan okay?" or "Should I proceed?" - that's exactly what THIS tool does. ExitPlanMode inherently requests user approval of your Mac workflow.

## Examples

1. Initial task: "What apps do I have installed?" - Do not use the exit plan mode tool; this is pure research. Delegate via TaskCreate instead.
2. Initial task: "Automate my morning launch sequence across Mail, Calendar, Slack, and my browser" - Use the exit plan mode tool after you have finished planning the ordered workflow, expected state at each step, and rollback behavior.
3. Initial task: "Organize my Downloads folder" - If unsure about categorization rules or duplicate handling, use ${ASK_USER_QUESTION_TOOL_NAME} first, then use the exit plan mode tool after the workflow is clarified.
4. Initial task: "Plan out how you'd set up my machine for a recording session" - The user explicitly asked for a plan; write the workflow to the plan file, then use this tool to request approval before touching any real Mac state.
`
