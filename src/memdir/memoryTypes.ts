/**
 * Memory type taxonomy.
 *
 * Memories are constrained to four types capturing context NOT derivable
 * from the current Mac state. Current window titles, UI coordinates,
 * running PIDs, and clipboard contents are derivable (by screenshotting or
 * querying the live system / MACHELPER.md) and should NOT be saved as
 * memories.
 *
 * The two TYPES_SECTION_* exports below are intentionally duplicated rather
 * than generated from a shared spec — keeping them flat makes per-mode edits
 * trivial without reasoning through a helper's conditional rendering.
 */

export const MEMORY_TYPES = [
  'user',
  'feedback',
  'project',
  'reference',
] as const

export type MemoryType = (typeof MEMORY_TYPES)[number]

/**
 * Parse a raw frontmatter value into a MemoryType.
 * Invalid or missing values return undefined — legacy files without a
 * `type:` field keep working, files with unknown types degrade gracefully.
 */
export function parseMemoryType(raw: unknown): MemoryType | undefined {
  if (typeof raw !== 'string') return undefined
  return MEMORY_TYPES.find(t => t === raw)
}

/**
 * `## Types of memory` section for COMBINED mode (private + team directories).
 * Includes <scope> tags and team/private qualifiers in examples.
 */
export const TYPES_SECTION_COMBINED: readonly string[] = [
  '## Types of memory',
  '',
  'There are several discrete types of memory that you can store in your memory system. Each type below declares a <scope> of `private`, `team`, or guidance for choosing between the two.',
  '',
  '<types>',
  '<type>',
  '    <name>user</name>',
  '    <scope>always private</scope>',
  "    <description>Contain information about the user's role, goals, responsibilities, and daily Mac habits. Great user memories help you tailor your future automation behavior to the user's preferences and workflow. Your goal in reading and writing these memories is to build up an understanding of who the user is, which apps they live in, and how you can be most helpful to them specifically. For example, you should automate for a product manager who spends their day in Calendar and Mail differently than a designer who lives in Figma. Keep in mind, that the aim here is to be helpful to the user. Avoid writing memories about the user that could be viewed as a negative judgement or that are not relevant to the work you're trying to accomplish together.</description>",
  "    <when_to_save>When you learn any details about the user's role, preferred apps, daily workflow, automation goals, or Mac environment</when_to_save>",
  "    <how_to_use>When your work should be informed by the user's profile or perspective. For example, if the user asks you to set up a recurring task, choose the tools and app idioms (Shortcuts, osascript, Calendar, Reminders) that match the apps they already use day-to-day.</how_to_use>",
  '    <examples>',
  "    user: I'm a product manager — my day is mostly Calendar, Mail, and Slack, and I'm trying to automate as much of the meeting-prep churn as possible",
  '    assistant: [saves private user memory: user is a PM, heavy Calendar/Mail/Slack user on macOS, focus is automating meeting-prep workflows]',
  '',
  "    user: I basically live in Figma and Sketch — I barely touch the terminal, so keep the automations GUI-driven where possible",
  '    assistant: [saves private user memory: designer, primary apps Figma + Sketch, avoids terminal — prefer Shortcuts/MacMind GUI actions over osascript or shell scripts when both would work]',
  '    </examples>',
  '</type>',
  '<type>',
  '    <name>feedback</name>',
  '    <scope>default to private. Save as team only when the guidance is clearly a shared-Mac convention that every user of this machine should follow (e.g., a hardware constraint, a fleet-wide policy), not a personal style preference.</scope>',
  "    <description>Guidance the user has given you about how to approach Mac automation — both what to avoid and what to keep doing. These are a very important type of memory to read and write as they allow you to remain coherent and responsive to how the user wants their machine driven. Record from failure AND success: if you only save corrections, you will avoid past mistakes but drift away from approaches the user has already validated, and may grow overly cautious. Before saving a private feedback memory, check that it doesn't contradict a team feedback memory — if it does, either don't save it or note the override explicitly.</description>",
  '    <when_to_save>Any time the user corrects your approach ("no not that", "don\'t", "stop doing X") OR confirms a non-obvious approach worked ("yes exactly", "perfect, keep doing that", accepting an unusual choice without pushback). Corrections are easy to notice; confirmations are quieter — watch for them. In both cases, save what is applicable to future automations, especially if surprising or not obvious from just observing the running app. Include *why* so you can judge edge cases later.</when_to_save>',
  '    <how_to_use>Let these memories guide your behavior so that the user does not need to offer the same guidance twice.</how_to_use>',
  '    <body_structure>Lead with the rule itself, then a **Why:** line (the reason the user gave — often a past incident or strong preference) and a **How to apply:** line (when/where this guidance kicks in). Knowing *why* lets you judge edge cases instead of blindly following the rule.</body_structure>',
  '    <examples>',
  "    user: don't click the \"What's New\" dialog when Chrome launches — I dismiss it manually, your click always misses and ends up opening the release notes tab",
  "    assistant: [saves private feedback memory: never try to dismiss Chrome's \"What's New\" dialog on launch. Reason: the MacMind click coordinate is unreliable and has previously opened the release notes tab by accident. How to apply: when automating Chrome, wait for the user to dismiss the dialog before continuing]",
  '',
  "    user: always wait 2 seconds after launching Slack before doing anything — it has a slow splash and your first click lands on the loading screen",
  '    assistant: [saves private feedback memory: after `open -a Slack`, sleep 2s before any MacMind action. Reason: Slack splash eats the first input event. How to apply: add a wait step in every Slack-launching workflow]',
  '',
  "    user: just use osascript for Mail — the MacMind mouse clicks keep missing the sidebar folders on my ultrawide",
  '    assistant: [saves private feedback memory: for Mail automation, prefer osascript (`tell application "Mail"`) over MacMind mouse clicks. Reason: sidebar coordinates are unreliable on the user\'s ultrawide display. How to apply: default to AppleScript for Mail; only fall back to mouse if a specific action has no AppleScript equivalent]',
  '    </examples>',
  '</type>',
  '<type>',
  '    <name>project</name>',
  '    <scope>private or team, but strongly bias toward private (most Mac-automation projects are single-user)</scope>',
  '    <description>Information that you learn about ongoing automation work, workflows the user is building, recurring jobs, or incidents with a specific app or script — context that is not otherwise derivable from looking at the current state of the Mac. Project memories help you understand the broader motivation behind the automations the user is composing.</description>',
  '    <when_to_save>When you learn what automation the user is building, why, or by when. These states change relatively quickly (workflows get shipped, cron jobs get retired) so try to keep your understanding of this up to date. Always convert relative dates in user messages to absolute dates when saving (e.g., "tomorrow" → "2026-04-06"), so the memory remains interpretable after time passes.</when_to_save>',
  "    <how_to_use>Use these memories to more fully understand the details and nuance behind the user's request and make better informed automation suggestions.</how_to_use>",
  '    <body_structure>Lead with the fact or decision, then a **Why:** line (the motivation — often a constraint, deadline, or recurring pain point) and a **How to apply:** line (how this should shape your suggestions). Project memories decay fast, so the why helps future-you judge whether the memory is still load-bearing.</body_structure>',
  '    <examples>',
  "    user: I'm putting together an end-of-day shutdown workflow — it should quit Slack, Mail, and Zoom, set Do Not Disturb, and lock the screen at 6pm on weekdays",
  '    assistant: [saves private project memory: user is building a weekday 6pm end-of-day shutdown workflow. Steps so far: quit Slack/Mail/Zoom, enable Do Not Disturb, lock screen. Why: wind-down ritual, stop after-hours notifications. How to apply: when user mentions "shutdown" or EOD automation, extend this workflow rather than starting fresh]',
  '',
  "    user: the Mail archive cleanup script runs nightly at 10pm via launchd — it moves anything older than 30 days out of the inbox",
  '    assistant: [saves private project memory: nightly Mail archive job runs at 22:00 via launchd, archives inbox mail older than 30 days. Why: keep inbox zero-ish overnight. How to apply: before suggesting changes to Mail automation, check for conflicts with this scheduled job]',
  '',
  "    user: researching a new Shortcuts workflow for invoicing — grab the Numbers template, fill in the client, export as PDF, and stage it in a Mail draft",
  '    assistant: [saves private project memory: WIP invoicing Shortcut: open Numbers template → fill client → export PDF → create Mail draft with PDF attached. Status: researching as of 2026-04-05. Why: replaces manual monthly invoice workflow. How to apply: offer Shortcuts actions (not osascript) when extending this — user wants it living in the Shortcuts gallery]',
  '    </examples>',
  '</type>',
  '<type>',
  '    <name>reference</name>',
  '    <scope>usually private (points at the user\'s own accounts, files, and services)</scope>',
  '    <description>Stores pointers to where information can be found outside the current Mac state — URLs, file paths on disk, API endpoints, app documentation. These memories let you remember where to look to find up-to-date information without having to re-discover it every session.</description>',
  '    <when_to_save>When you learn about resources in external systems and their purpose. For example, the URL of the user\'s main calendar, the local path to a Shortcuts library, or the endpoint of a local HTTP daemon.</when_to_save>',
  '    <how_to_use>When the user references an external resource or information that may live outside the current Mac state.</how_to_use>',
  '    <examples>',
  "    user: my main calendar is at https://calendar.google.com/calendar/u/0/r — any scheduling automation should read from that, not iCloud",
  '    assistant: [saves private reference memory: user\'s primary calendar is Google Calendar at https://calendar.google.com/calendar/u/0/r, NOT iCloud. Use this as the source of truth for scheduling automations]',
  '',
  "    user: if you need a prebuilt Shortcut, check the gallery at shortcuts.apple.com before writing one from scratch",
  '    assistant: [saves private reference memory: Apple Shortcuts gallery at https://shortcuts.apple.com — browse here for prebuilt workflows before building new ones]',
  '',
  "    user: the MacMind daemon exposes its action list at http://127.0.0.1:8484/actions — fetch that when you forget what capabilities it has",
  '    assistant: [saves private reference memory: MacMind HTTP API action list is at http://127.0.0.1:8484/actions. Fetch this before assuming a capability is (or is not) available]',
  '    </examples>',
  '</type>',
  '</types>',
  '',
]

/**
 * `## Types of memory` section for INDIVIDUAL-ONLY mode (single directory).
 * No <scope> tags. Examples use plain `[saves X memory: …]`. Prose that
 * only makes sense with a private/team split is reworded.
 */
export const TYPES_SECTION_INDIVIDUAL: readonly string[] = [
  '## Types of memory',
  '',
  'There are several discrete types of memory that you can store in your memory system:',
  '',
  '<types>',
  '<type>',
  '    <name>user</name>',
  "    <description>Contain information about the user's role, goals, responsibilities, and daily Mac habits. Great user memories help you tailor your future automation behavior to the user's preferences and workflow. Your goal in reading and writing these memories is to build up an understanding of who the user is, which apps they live in, and how you can be most helpful to them specifically. For example, you should automate for a product manager who spends their day in Calendar and Mail differently than a researcher who lives in Preview and Zotero. Keep in mind, that the aim here is to be helpful to the user. Avoid writing memories about the user that could be viewed as a negative judgement or that are not relevant to the work you're trying to accomplish together.</description>",
  "    <when_to_save>When you learn any details about the user's role, preferred apps, daily workflow, automation goals, or Mac environment</when_to_save>",
  "    <how_to_use>When your work should be informed by the user's profile or perspective. For example, if the user asks you to set up a recurring task, choose the tools and app idioms (Shortcuts, osascript, Calendar, Reminders) that match the apps they already use day-to-day.</how_to_use>",
  '    <examples>',
  "    user: I'm a researcher — most of my day is reading papers in Preview and tagging them in Zotero",
  '    assistant: [saves user memory: academic researcher, primary apps Preview + Zotero for PDF review/annotation — automations should integrate with Zotero library and Preview annotations rather than generic PDF tools]',
  '',
  "    user: I basically live in Figma and Sketch — I barely touch the terminal, so keep the automations GUI-driven where possible",
  '    assistant: [saves user memory: designer, primary apps Figma + Sketch, avoids terminal — prefer Shortcuts/MacMind GUI actions over osascript or shell scripts when both would work]',
  '    </examples>',
  '</type>',
  '<type>',
  '    <name>feedback</name>',
  '    <description>Guidance the user has given you about how to approach Mac automation — both what to avoid and what to keep doing. These are a very important type of memory to read and write as they allow you to remain coherent and responsive to how the user wants their machine driven. Record from failure AND success: if you only save corrections, you will avoid past mistakes but drift away from approaches the user has already validated, and may grow overly cautious.</description>',
  '    <when_to_save>Any time the user corrects your approach ("no not that", "don\'t", "stop doing X") OR confirms a non-obvious approach worked ("yes exactly", "perfect, keep doing that", accepting an unusual choice without pushback). Corrections are easy to notice; confirmations are quieter — watch for them. In both cases, save what is applicable to future automations, especially if surprising or not obvious from just observing the running app. Include *why* so you can judge edge cases later.</when_to_save>',
  '    <how_to_use>Let these memories guide your behavior so that the user does not need to offer the same guidance twice.</how_to_use>',
  '    <body_structure>Lead with the rule itself, then a **Why:** line (the reason the user gave — often a past incident or strong preference) and a **How to apply:** line (when/where this guidance kicks in). Knowing *why* lets you judge edge cases instead of blindly following the rule.</body_structure>',
  '    <examples>',
  "    user: don't click the \"What's New\" dialog when Chrome launches — I dismiss it manually, your click always misses and ends up opening the release notes tab",
  "    assistant: [saves feedback memory: never try to dismiss Chrome's \"What's New\" dialog on launch. Reason: the MacMind click coordinate is unreliable and has previously opened the release notes tab by accident. How to apply: when automating Chrome, wait for the user to dismiss the dialog before continuing]",
  '',
  "    user: always wait 2 seconds after launching Slack before doing anything — it has a slow splash and your first click lands on the loading screen",
  '    assistant: [saves feedback memory: after `open -a Slack`, sleep 2s before any MacMind action. Reason: Slack splash eats the first input event. How to apply: add a wait step in every Slack-launching workflow]',
  '',
  "    user: just use osascript for Mail — the MacMind mouse clicks keep missing the sidebar folders on my ultrawide",
  '    assistant: [saves feedback memory: for Mail automation, prefer osascript (`tell application "Mail"`) over MacMind mouse clicks. Reason: sidebar coordinates are unreliable on the user\'s ultrawide display. How to apply: default to AppleScript for Mail; only fall back to mouse if a specific action has no AppleScript equivalent]',
  '    </examples>',
  '</type>',
  '<type>',
  '    <name>project</name>',
  '    <description>Information that you learn about ongoing automation work, workflows the user is building, recurring jobs, or incidents with a specific app or script — context that is not otherwise derivable from looking at the current state of the Mac. Project memories help you understand the broader motivation behind the automations the user is composing.</description>',
  '    <when_to_save>When you learn what automation the user is building, why, or by when. These states change relatively quickly (workflows get shipped, cron jobs get retired) so try to keep your understanding of this up to date. Always convert relative dates in user messages to absolute dates when saving (e.g., "tomorrow" → "2026-04-06"), so the memory remains interpretable after time passes.</when_to_save>',
  "    <how_to_use>Use these memories to more fully understand the details and nuance behind the user's request and make better informed automation suggestions.</how_to_use>",
  '    <body_structure>Lead with the fact or decision, then a **Why:** line (the motivation — often a constraint, deadline, or recurring pain point) and a **How to apply:** line (how this should shape your suggestions). Project memories decay fast, so the why helps future-you judge whether the memory is still load-bearing.</body_structure>',
  '    <examples>',
  "    user: I'm putting together an end-of-day shutdown workflow — it should quit Slack, Mail, and Zoom, set Do Not Disturb, and lock the screen at 6pm on weekdays",
  '    assistant: [saves project memory: user is building a weekday 6pm end-of-day shutdown workflow. Steps so far: quit Slack/Mail/Zoom, enable Do Not Disturb, lock screen. Why: wind-down ritual, stop after-hours notifications. How to apply: when user mentions "shutdown" or EOD automation, extend this workflow rather than starting fresh]',
  '',
  "    user: the Mail archive cleanup script runs nightly at 10pm via launchd — it moves anything older than 30 days out of the inbox",
  '    assistant: [saves project memory: nightly Mail archive job runs at 22:00 via launchd, archives inbox mail older than 30 days. Why: keep inbox zero-ish overnight. How to apply: before suggesting changes to Mail automation, check for conflicts with this scheduled job]',
  '',
  "    user: researching a new Shortcuts workflow for invoicing — grab the Numbers template, fill in the client, export as PDF, and stage it in a Mail draft",
  '    assistant: [saves project memory: WIP invoicing Shortcut: open Numbers template → fill client → export PDF → create Mail draft with PDF attached. Status: researching as of 2026-04-05. Why: replaces manual monthly invoice workflow. How to apply: offer Shortcuts actions (not osascript) when extending this — user wants it living in the Shortcuts gallery]',
  '    </examples>',
  '</type>',
  '<type>',
  '    <name>reference</name>',
  '    <description>Stores pointers to where information can be found outside the current Mac state — URLs, file paths on disk, API endpoints, app documentation. These memories let you remember where to look to find up-to-date information without having to re-discover it every session.</description>',
  '    <when_to_save>When you learn about resources in external systems and their purpose. For example, the URL of the user\'s main calendar, the local path to a Shortcuts library, or the endpoint of a local HTTP daemon.</when_to_save>',
  '    <how_to_use>When the user references an external resource or information that may live outside the current Mac state.</how_to_use>',
  '    <examples>',
  "    user: my main calendar is at https://calendar.google.com/calendar/u/0/r — any scheduling automation should read from that, not iCloud",
  '    assistant: [saves reference memory: user\'s primary calendar is Google Calendar at https://calendar.google.com/calendar/u/0/r, NOT iCloud. Use this as the source of truth for scheduling automations]',
  '',
  "    user: if you need a prebuilt Shortcut, check the gallery at shortcuts.apple.com before writing one from scratch",
  '    assistant: [saves reference memory: Apple Shortcuts gallery at https://shortcuts.apple.com — browse here for prebuilt workflows before building new ones]',
  '',
  "    user: the MacMind daemon exposes its action list at http://127.0.0.1:8484/actions — fetch that when you forget what capabilities it has",
  '    assistant: [saves reference memory: MacMind HTTP API action list is at http://127.0.0.1:8484/actions. Fetch this before assuming a capability is (or is not) available]',
  '    </examples>',
  '</type>',
  '</types>',
  '',
]

/**
 * `## What NOT to save in memory` section. Identical across both modes.
 */
export const WHAT_NOT_TO_SAVE_SECTION: readonly string[] = [
  '## What NOT to save in memory',
  '',
  '- UI coordinates, element positions, or window geometry — these change between launches, across displays, and on app updates. Query the live UI each time instead.',
  '- Current window titles, focused-app state, or frontmost-window info — read them fresh via MacMind or `osascript` when needed.',
  '- Temporary clipboard contents — ephemeral by definition.',
  '- Specific running PIDs, port numbers of already-running processes, or other runtime handles — look them up at use time.',
  '- Screen OCR snapshots or screenshot descriptions — re-capture the screen when you need to know what is currently visible.',
  '- Anything already documented in MACHELPER.md files.',
  '- Ephemeral task details: in-progress work, temporary state, current conversation context.',
  '',
  // H2: explicit-save gate. Eval-validated (memory-prompt-iteration case 3,
  // 0/2 → 3/3): prevents "save this week's PR list" → activity-log noise.
  'These exclusions apply even when the user explicitly asks you to save. If they ask you to save a list of open windows or a clipboard snapshot, ask what was *surprising* or *non-obvious* about it — that is the part worth keeping.',
]

/**
 * Recall-side drift caveat. Single bullet under `## When to access memories`.
 * Proactive: verify memory against current state before answering.
 */
export const MEMORY_DRIFT_CAVEAT =
  '- Memory records can become stale over time. Use memory as context for what was true at a given point in time. Before answering the user or building assumptions based solely on information in memory records, verify that the memory is still correct and up-to-date by reading the current state of the files or resources. If a recalled memory conflicts with current information, trust what you observe now — and update or remove the stale memory rather than acting on it.'

/**
 * `## When to access memories` section. Includes MEMORY_DRIFT_CAVEAT.
 *
 * H6 (branch-pollution evals #22856, case 5 1/3 on capy): the "ignore" bullet
 * is the delta. Failure mode: user says "ignore memory about X" → Claude reads
 * code correctly but adds "not Y as noted in memory" — treats "ignore" as
 * "acknowledge then override" rather than "don't reference at all." The bullet
 * names that anti-pattern explicitly.
 *
 * Token budget (H6a): merged old bullets 1+2, tightened both. Old 4 lines
 * were ~70 tokens; new 4 lines are ~73 tokens. Net ~+3.
 */
export const WHEN_TO_ACCESS_SECTION: readonly string[] = [
  '## When to access memories',
  '- When memories seem relevant, or the user references prior-conversation work.',
  '- You MUST access memory when the user explicitly asks you to check, recall, or remember.',
  '- If the user says to *ignore* or *not use* memory: proceed as if MEMORY.md were empty. Do not apply remembered facts, cite, compare against, or mention memory content.',
  MEMORY_DRIFT_CAVEAT,
]

/**
 * `## Trusting what you recall` section. Heavier-weight guidance on HOW to
 * treat a memory once you've recalled it — separate from WHEN to access.
 *
 * Eval-validated (memory-prompt-iteration.eval.ts, 2026-03-17):
 *   H1 (verify function/file claims): 0/2 → 3/3 via appendSystemPrompt. When
 *      buried as a bullet under "When to access", dropped to 0/3 — position
 *      matters. The H1 cue is about what to DO with a memory, not when to
 *      look, so it needs its own section-level trigger context.
 *   H5 (read-side noise rejection): 0/2 → 3/3 via appendSystemPrompt, 2/3
 *      in-place as a bullet. Partial because "snapshot" is intuitively closer
 *      to "when to access" than H1 is.
 *
 * Known gap: H1 doesn't cover slash-command claims (0/3 on the /fork case —
 * slash commands aren't files or functions in the model's ontology).
 */
export const TRUSTING_RECALL_SECTION: readonly string[] = [
  // Header wording matters: "Before recommending" (action cue at the decision
  // point) tested better than "Trusting what you recall" (abstract). The
  // appendSystemPrompt variant with this header went 3/3; the abstract header
  // went 0/3 in-place. Same body text — only the header differed.
  '## Before recommending from memory',
  '',
  'A memory that names a specific app, file, Shortcut, launchd job, or MacMind action is a claim that it existed *when the memory was written*. Apps get uninstalled, Shortcuts get renamed, launchd jobs get unloaded, MacMind actions get deprecated. Before recommending it:',
  '',
  '- If the memory names a file path: check the file exists.',
  '- If the memory names an app: confirm it is still installed (e.g., via `mdfind` or checking `/Applications`).',
  '- If the memory names a Shortcut, AppleScript handler, or MacMind action: verify it still resolves before invoking it.',
  '- If the user is about to act on your recommendation (not just asking about history), verify first.',
  '',
  '"The memory says X exists" is not the same as "X exists now."',
  '',
  'A memory that summarizes system state (a list of installed apps, a snapshot of running processes, a dump of current Shortcuts) is frozen in time. If the user asks about *current* state, re-query the Mac (via MacMind, `osascript`, `mdfind`, `launchctl list`, etc.) rather than recalling the snapshot.',
]

/**
 * Frontmatter format example with the `type` field.
 */
export const MEMORY_FRONTMATTER_EXAMPLE: readonly string[] = [
  '```markdown',
  '---',
  'name: {{memory name}}',
  'description: {{one-line description — used to decide relevance in future conversations, so be specific}}',
  `type: {{${MEMORY_TYPES.join(', ')}}}`,
  '---',
  '',
  '{{memory content — for feedback/project types, structure as: rule/fact, then **Why:** and **How to apply:** lines}}',
  '```',
]
