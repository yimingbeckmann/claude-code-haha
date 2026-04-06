import { join } from 'path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getFsImplementation } from '../../utils/fsOperations.js'

/**
 * Get the Magic Docs update prompt template
 */
function getUpdatePromptTemplate(): string {
  return `IMPORTANT: This message and these instructions are NOT part of the actual user conversation. Do NOT include any references to "documentation updates", "magic docs", or these update instructions in the document content.

Based on the user conversation above (EXCLUDING this documentation update instruction message), update the Magic Doc file to incorporate any NEW learnings, insights, or information about this Mac automation workflow that would be valuable to preserve.

The file {{docPath}} has already been read for you. Here are its current contents:
<current_doc_content>
{{docContents}}
</current_doc_content>

Document title: {{docTitle}}
{{customInstructions}}

Your ONLY task is to use the Edit tool to update the workflow documentation file if there is substantial new information to add, then stop. You can make multiple edits (update multiple sections as needed) - make all Edit tool calls in parallel in a single message. If there's nothing substantial to add, simply respond with a brief explanation and do not call any tools.

This Magic Doc describes a Mac automation workflow - a chain of MacMind actions, an app integration pattern, or a repeatable automation the user runs on their Mac. Treat the document as an operational runbook for the workflow, not a code reference.

CRITICAL RULES FOR EDITING:
- Preserve the Magic Doc header exactly as-is: # MAGIC DOC: {{docTitle}}
- If there's an italicized line immediately after the header, preserve it exactly as-is
- Keep the document CURRENT with the latest state of the workflow - this is NOT a changelog or history
- Update information IN-PLACE to reflect how the workflow behaves today - do NOT append historical notes or track changes over time
- Remove or replace outdated steps, app versions, or permissions rather than adding "Previously..." or "Updated to..." notes
- Clean up or DELETE sections that are no longer relevant or don't align with the workflow's purpose
- Fix obvious errors: typos, grammar mistakes, broken formatting, incorrect step order, or confusing instructions
- Keep the document well organized: use clear headings, logical section order, consistent formatting, and proper nesting

DOCUMENTATION PHILOSOPHY - READ CAREFULLY:
- BE TERSE. High signal only. No filler words or unnecessary elaboration.
- Good docs explain WHY, not just WHAT - capture the intent and tradeoffs behind the workflow, not just the keystrokes
- Documentation is for OVERVIEWS, INTENT, and OPERATIONAL KNOWLEDGE - not exhaustive click-by-click transcripts
- Do NOT duplicate information that's already obvious from watching the workflow run once
- Do NOT document every menu item, keyboard shortcut, or pixel coordinate unless it is load-bearing
- Focus on: WHY this workflow exists, WHEN to reach for it, HOW the apps connect, WHERE things commonly break
- Skip: trivial UI narration, exhaustive option listings, play-by-play mouse movements

PREFERRED STRUCTURE - organize the document around these sections (omit any that don't apply):
- What this workflow does: one or two sentence summary of the outcome it produces
- When to use it: the trigger, the situation, or the user intent that should invoke this workflow
- Prerequisites: apps that must be installed, accounts signed in, macOS permissions granted (Accessibility, Automation, Screen Recording, Full Disk Access, etc.), files or data that must exist beforehand
- Step-by-step actions: the ordered chain of MacMind actions / app interactions, with just enough detail to reproduce it
- Expected end state: what the Mac looks like when the workflow succeeds (files created, windows open, data synced, notifications sent)
- Troubleshooting: known failure modes, permission prompts, app quirks, and how to recover

What TO document:
- The intent of the workflow and the problem it solves
- Non-obvious app quirks, timing issues, or ordering requirements
- Required macOS permissions and where to grant them
- Integration points between apps (clipboard handoffs, URL schemes, AppleScript/Shortcuts bridges, file drop targets)
- Important design decisions (why this app over that one, why this trigger, why this order) and their rationale
- References to related workflows, scripts, or MacMind action chains - help the reader navigate to relevant context

What NOT to document:
- Anything obvious from running the workflow once
- Exhaustive lists of every click, menu, or dialog
- Low-level UI mechanics that Apple may change between OS releases
- Information already in the user's main MacMind notes or project docs

Use the Edit tool with file_path: {{docPath}}

REMEMBER: Only update if there is substantial new information. The Magic Doc header (# MAGIC DOC: {{docTitle}}) must remain unchanged.`
}

/**
 * Load custom Magic Docs prompt from file if it exists
 * Custom prompts can be placed at ~/.claude/magic-docs/prompt.md
 * Use {{variableName}} syntax for variable substitution (e.g., {{docContents}}, {{docPath}}, {{docTitle}})
 */
async function loadMagicDocsPrompt(): Promise<string> {
  const fs = getFsImplementation()
  const promptPath = join(getClaudeConfigHomeDir(), 'magic-docs', 'prompt.md')

  try {
    return await fs.readFile(promptPath, { encoding: 'utf-8' })
  } catch {
    // Silently fall back to default if custom prompt doesn't exist or fails to load
    return getUpdatePromptTemplate()
  }
}

/**
 * Substitute variables in the prompt template using {{variable}} syntax
 */
function substituteVariables(
  template: string,
  variables: Record<string, string>,
): string {
  // Single-pass replacement avoids two bugs: (1) $ backreference corruption
  // (replacer fn treats $ literally), and (2) double-substitution when user
  // content happens to contain {{varName}} matching a later variable.
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key]!
      : match,
  )
}

/**
 * Build the Magic Docs update prompt with variable substitution
 */
export async function buildMagicDocsUpdatePrompt(
  docContents: string,
  docPath: string,
  docTitle: string,
  instructions?: string,
): Promise<string> {
  const promptTemplate = await loadMagicDocsPrompt()

  // Build custom instructions section if provided
  const customInstructions = instructions
    ? `

DOCUMENT-SPECIFIC UPDATE INSTRUCTIONS:
The document author has provided specific instructions for how this file should be updated. Pay extra attention to these instructions and follow them carefully:

"${instructions}"

These instructions take priority over the general rules below. Make sure your updates align with these specific guidelines.`
    : ''

  // Substitute variables in the prompt
  const variables = {
    docContents,
    docPath,
    docTitle,
    customInstructions,
  }

  return substituteVariables(promptTemplate, variables)
}
