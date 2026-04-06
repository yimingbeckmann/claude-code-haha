import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'

export const DESCRIPTION = 'Create a new Mac research or Mac automation task (spawns a sub-agent)'

export function getPrompt(): string {
  const teammateContext = isAgentSwarmsEnabled()
    ? ' and potentially assigned to teammates'
    : ''

  const teammateTips = isAgentSwarmsEnabled()
    ? `- Include enough detail in the description for another agent to understand and complete the task
- New tasks are created with status 'pending' and no owner - use TaskUpdate with the \`owner\` parameter to assign them
`
    : ''

  return `Use this tool to spawn sub-agents for Mac research and Mac automation work. TaskCreate delegates a self-contained unit of work to a sub-agent so the main conversation stays focused on orchestration. It also helps the user see the progress of ongoing automations and research against their Mac.

## When to Use This Tool

Use this tool proactively in these scenarios:

- Multi-step Mac workflows - When automating something that takes 3 or more distinct steps across one or more apps
- Non-trivial Mac research - Inspecting system state, scanning folders, enumerating installed apps, querying Mail/Calendar/Notes, etc., where the result should be reported back as a summary
- Mac automation tasks that change real machine state - Launching apps, moving files, sending messages, tweaking settings - and you want the work isolated to a sub-agent${teammateContext}
- Plan mode - When using plan mode for a Mac workflow, create a task list to track each step of the workflow
- User explicitly requests a task list - When the user directly asks you to use the task/todo list
- User provides multiple things to do on their Mac - When users give a list of Mac actions (numbered or comma-separated), create one task per action
- After receiving new instructions - Immediately capture the user's Mac-side requirements as tasks
- When you start working on a task - Mark it as in_progress BEFORE touching the machine
- After completing a task - Mark it as completed and add any follow-up tasks discovered while interacting with the Mac

## When NOT to Use This Tool

Skip using this tool when:
- There is only a single, straightforward Mac action (e.g., "open Safari", "quit Slack")
- The task is trivial and tracking it provides no organizational benefit
- The task can be completed in less than 3 trivial steps on the Mac
- The task is purely conversational or informational and does not touch the machine

NOTE that you should not use this tool if there is only one trivial thing to do on the Mac. In that case just do it directly.

## When to Delegate to a Sub-Agent

Delegate via TaskCreate (rather than doing the work inline) when:
- The work is a well-scoped Mac research question with a clear deliverable (e.g., "enumerate and report")
- The work is a self-contained automation sequence that you want to run without interleaving with the main conversation
- You need to run multiple independent Mac workflows in parallel (spawn one sub-agent per workflow)
- The work is noisy (lots of file listings, app queries, AppleScript output) and you want the main thread to only see a summary

Do NOT delegate when the main agent already has the context loaded and the task is a single quick action - just do it.

## Agent-Type Guidance

Match the sub-agent type to the shape of the work:
- **Mac research agents** - Read-only inspection of the machine: which apps are installed, what's in a folder, what's on the calendar, what Mail threads match a query. Deliverable is a written summary.
- **Mac automation agents** - Make changes to real machine state: launch apps in a specific order, organize files, send messages, change settings. Deliverable is a report of actions taken and final state.
- **Mixed agents** - First inspect, then act based on what was found (e.g., "find duplicate downloads and delete the older copies"). Make the inspect/act boundary explicit in the description.

## Task Fields

- **subject**: A brief, actionable title in imperative form (e.g., "Organize Downloads folder by file type")
- **description**: What needs to be done on the Mac, with enough detail for a sub-agent to execute without re-asking the user
- **activeForm** (optional): Present continuous form shown in the spinner when the task is in_progress (e.g., "Organizing Downloads folder"). If omitted, the spinner shows the subject instead.

All tasks are created with status \`pending\`.

## Examples

- subject: "Research which apps are installed and report" / description: "List all apps in /Applications and ~/Applications, group by category (productivity, dev, media, etc.), and report back with counts and notable items."
- subject: "Automate the morning launch sequence" / description: "Launch Mail, Calendar, Slack, and the user's default browser to their work homepage. Arrange windows on the primary display and report final window layout."
- subject: "Organize files in Downloads folder by type" / description: "Scan ~/Downloads, create subfolders (Images, Documents, Archives, Installers, Other), and move each file into the matching subfolder. Report counts per category."
- subject: "Find all Mail threads matching a subject and summarize" / description: "Search Mail for threads with subject matching '<query>' in the last 30 days, read each thread, and produce a bullet summary of senders, dates, and key points."

## Tips

- Create tasks with clear, specific subjects that describe the Mac-side outcome
- Include enough detail in the description that the sub-agent does not need to re-ask the user for context
- After creating tasks, use TaskUpdate to set up dependencies (blocks/blockedBy) when one workflow must complete before another starts
${teammateTips}- Check TaskList first to avoid creating duplicate Mac workflows
`
}
