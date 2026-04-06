import { feature } from 'bun:bundle'
import type { PartialCompactDirection } from '../../types/message.js'

// Dead code elimination: conditional import for proactive mode
/* eslint-disable @typescript-eslint/no-require-imports */
const proactiveModule =
  feature('PROACTIVE') || feature('KAIROS')
    ? (require('../../proactive/index.js') as typeof import('../../proactive/index.js'))
    : null
/* eslint-enable @typescript-eslint/no-require-imports */

// Aggressive no-tools preamble. The cache-sharing fork path inherits the
// parent's full tool set (required for cache-key match), and on Sonnet 4.6+
// adaptive-thinking models the model sometimes attempts a tool call despite
// the weaker trailer instruction. With maxTurns: 1, a denied tool call means
// no text output → falls through to the streaming fallback (2.79% on 4.6 vs
// 0.01% on 4.5). Putting this FIRST and making it explicit about rejection
// consequences prevents the wasted turn.
const NO_TOOLS_PREAMBLE = `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.

- Do NOT use Read, Bash, Grep, Glob, Edit, Write, or ANY other tool.
- You already have all the context you need in the conversation above.
- Tool calls will be REJECTED and will waste your only turn — you will fail the task.
- Your entire response must be plain text: an <analysis> block followed by a <summary> block.

`

// Two variants: BASE scopes to "the conversation", PARTIAL scopes to "the
// recent messages". The <analysis> block is a drafting scratchpad that
// formatCompactSummary() strips before the summary reaches context.
const DETAILED_ANALYSIS_INSTRUCTION_BASE = `Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Chronologically analyze each message and section of the conversation. For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests on the Mac
   - Key decisions, workflows, and automation patterns
   - Specific details like:
     - apps and windows that were opened, focused, or manipulated
     - MacMind actions invoked (with the arguments passed and the observable results)
     - files, documents, and system state that were touched or modified
     - the user's Mac state (active app, focused window, selection, clipboard, pending workflows) at key moments
   - Errors, permission prompts, or failed actions that you ran into and how you resolved them
   - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
2. Double-check for accuracy and completeness, addressing each required element thoroughly.`

const DETAILED_ANALYSIS_INSTRUCTION_PARTIAL = `Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Analyze the recent messages chronologically. For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests on the Mac
   - Key decisions, workflows, and automation patterns
   - Specific details like:
     - apps and windows that were opened, focused, or manipulated
     - MacMind actions invoked (with the arguments passed and the observable results)
     - files, documents, and system state that were touched or modified
     - the user's Mac state (active app, focused window, selection, clipboard, pending workflows) at key moments
   - Errors, permission prompts, or failed actions that you ran into and how you resolved them
   - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
2. Double-check for accuracy and completeness, addressing each required element thoroughly.`

const BASE_COMPACT_PROMPT = `Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and the Mac automation work you performed on their behalf.
This summary should be thorough in capturing what apps and windows were manipulated, which MacMind actions were invoked, what files and documents were touched, and the resulting Mac state — everything essential for continuing to act as the user's Mac coworker without losing context.

${DETAILED_ANALYSIS_INSTRUCTION_BASE}

Your summary should include the following sections:

1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail — what they want their Mac to do, what outcome they are after.
2. Mac Actions Performed and Results: Enumerate the concrete actions you took on the Mac in chronological order. For each action, describe what app or window was manipulated, the observable result (what changed on screen or on disk), any files that were edited, and which MacMind actions ran with the key arguments and the responses/values they returned. Pay special attention to the most recent messages. Include enough detail that the work can be resumed or audited without replaying the transcript.
3. Apps, Documents, and Files Touched: List every app, document, URL, and file path the session affected, with a brief note on how each was affected (opened, focused, edited, saved, moved, closed, etc.).
4. MacMind Actions and Argument Shapes: For MacMind actions that matter for continuing the work, note the action name and the shape/key arguments used (and any non-obvious argument conventions you discovered). Skip trivial or purely read-only calls unless they are load-bearing for the current task.
5. Errors and Fixes: List errors, failed actions, permission prompts, denied accessibility/automation access, unexpected UI states, and how you resolved them. Pay special attention to specific user feedback, especially if the user told you to do something differently.
6. Problem Solving: Document problems solved and any ongoing troubleshooting efforts around the Mac workflow.
7. All User Messages: List ALL user messages that are not tool results, verbatim or near-verbatim. These are critical for understanding the user's feedback and changing intent.
8. Pending Tasks: Outline any pending tasks the user has explicitly asked you to work on.
9. Current Work: Describe in detail precisely what was being worked on immediately before this summary request — which app, which window, which workflow step — paying special attention to the most recent messages from both user and assistant.
10. Mac State at Compaction Time: Capture the live Mac state snapshot needed to resume cleanly: currently active/frontmost app, focused window and document, any text selection or cursor position that matters, clipboard contents if relevant, any multi-step workflow that is mid-flight and which step it's on, and the known permission state (accessibility, automation, screen recording, etc.) including any prompts that are still pending.
11. Optional Next Step: List the next step you will take that is related to the most recent work you were doing. IMPORTANT: ensure that this step is DIRECTLY in line with the user's most recent explicit requests, and the task you were working on immediately before this summary request. If your last task was concluded, then only list next steps if they are explicitly in line with the user's request. Do not start on tangential requests or really old requests that were already completed without confirming with the user first.
                       If there is a next step, include direct quotes from the most recent conversation showing exactly what task you were working on and where you left off. This should be verbatim to ensure there's no drift in task interpretation.

Here's an example of how your output should be structured:

<example>
<analysis>
[Your thought process, ensuring all points are covered thoroughly and accurately]
</analysis>

<summary>
1. Primary Request and Intent:
   [Detailed description of what the user wanted done on their Mac]

2. Mac Actions Performed and Results:
   - [Action 1: app/window manipulated, observable result, files edited, MacMind action + key args + result]
   - [Action 2: ...]
   - [...]

3. Apps, Documents, and Files Touched:
   - [App / document / file path] — [how it was affected]
   - [...]

4. MacMind Actions and Argument Shapes:
   - [action_name] — [key arguments / shape / conventions]
   - [...]

5. Errors and Fixes:
    - [Error or failed action]:
      - [How you fixed it]
      - [User feedback, if any]
    - [...]

6. Problem Solving:
   [Description of solved problems and ongoing troubleshooting]

7. All User Messages:
    - [Detailed non-tool-use user message]
    - [...]

8. Pending Tasks:
   - [Task 1]
   - [Task 2]
   - [...]

9. Current Work:
   [Precise description of the Mac workflow step in progress]

10. Mac State at Compaction Time:
    - Frontmost app: [app]
    - Focused window/document: [window]
    - Selection / cursor / clipboard: [if relevant]
    - In-flight workflow: [which multi-step workflow and which step]
    - Permission state: [accessibility / automation / screen recording / pending prompts]

11. Optional Next Step:
    [Optional next step to take]

</summary>
</example>

Please provide your summary based on the conversation so far, following this structure and ensuring precision and thoroughness in your response.

There may be additional summarization instructions provided in the included context. If so, remember to follow these instructions when creating the above summary. Examples of instructions include:
<example>
## Compact Instructions
When summarizing the conversation focus on the Calendar and Mail automation steps, and remember which permission prompts were denied and how you worked around them.
</example>

<example>
# Summary instructions
When you are using compact — please focus on the exact MacMind action arguments used and the resulting window/app state. Include key action payloads verbatim.
</example>
`

const PARTIAL_COMPACT_PROMPT = `Your task is to create a detailed summary of the RECENT portion of the conversation — the messages that follow earlier retained context. The earlier messages are being kept intact and do NOT need to be summarized. Focus your summary on the Mac automation work (apps manipulated, MacMind actions invoked, files touched, errors handled) that happened in the recent messages only.

${DETAILED_ANALYSIS_INSTRUCTION_PARTIAL}

Your summary should include the following sections:

1. Primary Request and Intent: Capture the user's explicit requests and intents from the recent messages.
2. Mac Actions Performed and Results: Enumerate the concrete Mac actions you took recently. For each, describe the app/window manipulated, the observable result, any files edited, and which MacMind actions ran with key arguments and results.
3. Apps, Documents, and Files Touched: List apps, documents, URLs, and file paths affected in the recent portion, each with a brief note on how.
4. MacMind Actions and Argument Shapes: For the MacMind actions that matter for continuing, note the action name and key argument shape / conventions.
5. Errors and Fixes: List errors, failed actions, permission prompts, and how they were resolved.
6. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
7. All User Messages: List ALL user messages from the recent portion that are not tool results.
8. Pending Tasks: Outline any pending tasks from the recent messages.
9. Current Work: Describe precisely what Mac workflow step was being worked on immediately before this summary request.
10. Mac State at Compaction Time: Frontmost app, focused window/document, relevant selection/clipboard, in-flight multi-step workflow and its current step, known permission state and any pending prompts.
11. Optional Next Step: List the next step related to the most recent work. Include direct quotes from the most recent conversation.

Here's an example of how your output should be structured:

<example>
<analysis>
[Your thought process, ensuring all points are covered thoroughly and accurately]
</analysis>

<summary>
1. Primary Request and Intent:
   [Detailed description]

2. Mac Actions Performed and Results:
   - [Action 1: app/window, result, files edited, MacMind action + args + result]
   - [...]

3. Apps, Documents, and Files Touched:
   - [App / document / file path] — [how affected]

4. MacMind Actions and Argument Shapes:
   - [action_name] — [key arguments / shape]

5. Errors and Fixes:
    - [Error or failed action]:
      - [How you fixed it]

6. Problem Solving:
   [Description]

7. All User Messages:
    - [Detailed non-tool-use user message]

8. Pending Tasks:
   - [Task 1]

9. Current Work:
   [Precise description of current work]

10. Mac State at Compaction Time:
    - Frontmost app: [app]
    - Focused window/document: [window]
    - Selection / cursor / clipboard: [if relevant]
    - In-flight workflow: [which step]
    - Permission state: [accessibility / automation / screen recording / pending prompts]

11. Optional Next Step:
    [Optional next step to take]

</summary>
</example>

Please provide your summary based on the RECENT messages only (after the retained earlier context), following this structure and ensuring precision and thoroughness in your response.
`

// 'up_to': model sees only the summarized prefix (cache hit). Summary will
// precede kept recent messages, hence "Context for Continuing Work" section.
const PARTIAL_COMPACT_UP_TO_PROMPT = `Your task is to create a detailed summary of this conversation. This summary will be placed at the start of a continuing session; newer messages that build on this context will follow after your summary (you do not see them here). Summarize thoroughly so that someone reading only your summary and then the newer messages can fully understand what happened on the user's Mac and continue the work as their Mac coworker.

${DETAILED_ANALYSIS_INSTRUCTION_BASE}

Your summary should include the following sections:

1. Primary Request and Intent: Capture the user's explicit requests and intents in detail — what they want their Mac to do.
2. Mac Actions Performed and Results: Enumerate the concrete Mac actions taken in chronological order. For each, describe the app/window manipulated, the observable result, any files edited, and which MacMind actions ran with key arguments and results.
3. Apps, Documents, and Files Touched: List every app, document, URL, and file path the session affected, each with a brief note on how.
4. MacMind Actions and Argument Shapes: For the MacMind actions that matter for continuing, note the action name and key argument shape / conventions discovered.
5. Errors and Fixes: List errors, failed actions, permission prompts, and how they were resolved.
6. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
7. All User Messages: List ALL user messages that are not tool results.
8. Pending Tasks: Outline any pending tasks.
9. Work Completed: Describe what was accomplished on the Mac by the end of this portion.
10. Mac State at Compaction Time: Frontmost app, focused window/document, relevant selection/clipboard, any in-flight multi-step workflow and which step it's on, known permission state (accessibility, automation, screen recording, etc.) and any pending prompts.
11. Context for Continuing Work: Summarize the context, decisions, and Mac/workflow state that would be needed to understand and continue the work in subsequent messages.

Here's an example of how your output should be structured:

<example>
<analysis>
[Your thought process, ensuring all points are covered thoroughly and accurately]
</analysis>

<summary>
1. Primary Request and Intent:
   [Detailed description]

2. Mac Actions Performed and Results:
   - [Action 1: app/window, result, files edited, MacMind action + args + result]
   - [...]

3. Apps, Documents, and Files Touched:
   - [App / document / file path] — [how affected]

4. MacMind Actions and Argument Shapes:
   - [action_name] — [key arguments / shape]

5. Errors and Fixes:
    - [Error or failed action]:
      - [How you fixed it]

6. Problem Solving:
   [Description]

7. All User Messages:
    - [Detailed non-tool-use user message]

8. Pending Tasks:
   - [Task 1]

9. Work Completed:
   [Description of what was accomplished]

10. Mac State at Compaction Time:
    - Frontmost app: [app]
    - Focused window/document: [window]
    - Selection / cursor / clipboard: [if relevant]
    - In-flight workflow: [which step]
    - Permission state: [accessibility / automation / screen recording / pending prompts]

11. Context for Continuing Work:
    [Key context, decisions, or Mac/workflow state needed to continue]

</summary>
</example>

Please provide your summary following this structure, ensuring precision and thoroughness in your response.
`

const NO_TOOLS_TRAILER =
  '\n\nREMINDER: Do NOT call any tools. Respond with plain text only — ' +
  'an <analysis> block followed by a <summary> block. ' +
  'Tool calls will be rejected and you will fail the task.'

export function getPartialCompactPrompt(
  customInstructions?: string,
  direction: PartialCompactDirection = 'from',
): string {
  const template =
    direction === 'up_to'
      ? PARTIAL_COMPACT_UP_TO_PROMPT
      : PARTIAL_COMPACT_PROMPT
  let prompt = NO_TOOLS_PREAMBLE + template

  if (customInstructions && customInstructions.trim() !== '') {
    prompt += `\n\nAdditional Instructions:\n${customInstructions}`
  }

  prompt += NO_TOOLS_TRAILER

  return prompt
}

export function getCompactPrompt(customInstructions?: string): string {
  let prompt = NO_TOOLS_PREAMBLE + BASE_COMPACT_PROMPT

  if (customInstructions && customInstructions.trim() !== '') {
    prompt += `\n\nAdditional Instructions:\n${customInstructions}`
  }

  prompt += NO_TOOLS_TRAILER

  return prompt
}

/**
 * Formats the compact summary by stripping the <analysis> drafting scratchpad
 * and replacing <summary> XML tags with readable section headers.
 * @param summary The raw summary string potentially containing <analysis> and <summary> XML tags
 * @returns The formatted summary with analysis stripped and summary tags replaced by headers
 */
export function formatCompactSummary(summary: string): string {
  let formattedSummary = summary

  // Strip analysis section — it's a drafting scratchpad that improves summary
  // quality but has no informational value once the summary is written.
  formattedSummary = formattedSummary.replace(
    /<analysis>[\s\S]*?<\/analysis>/,
    '',
  )

  // Extract and format summary section
  const summaryMatch = formattedSummary.match(/<summary>([\s\S]*?)<\/summary>/)
  if (summaryMatch) {
    const content = summaryMatch[1] || ''
    formattedSummary = formattedSummary.replace(
      /<summary>[\s\S]*?<\/summary>/,
      `Summary:\n${content.trim()}`,
    )
  }

  // Clean up extra whitespace between sections
  formattedSummary = formattedSummary.replace(/\n\n+/g, '\n\n')

  return formattedSummary.trim()
}

export function getCompactUserSummaryMessage(
  summary: string,
  suppressFollowUpQuestions?: boolean,
  transcriptPath?: string,
  recentMessagesPreserved?: boolean,
): string {
  const formattedSummary = formatCompactSummary(summary)

  let baseSummary = `This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.

${formattedSummary}`

  if (transcriptPath) {
    baseSummary += `\n\nIf you need specific details from before compaction (like exact code snippets, error messages, or content you generated), read the full transcript at: ${transcriptPath}`
  }

  if (recentMessagesPreserved) {
    baseSummary += `\n\nRecent messages are preserved verbatim.`
  }

  if (suppressFollowUpQuestions) {
    let continuation = `${baseSummary}
Continue the conversation from where it left off without asking the user any further questions. Resume directly — do not acknowledge the summary, do not recap what was happening, do not preface with "I'll continue" or similar. Pick up the last task as if the break never happened.`

    if (
      (feature('PROACTIVE') || feature('KAIROS')) &&
      proactiveModule?.isProactiveActive()
    ) {
      continuation += `

You are running in autonomous/proactive mode. This is NOT a first wake-up — you were already working autonomously before compaction. Continue your work loop: pick up where you left off based on the summary above. Do not greet the user or ask what to work on.`
    }

    return continuation
  }

  return baseSummary
}
