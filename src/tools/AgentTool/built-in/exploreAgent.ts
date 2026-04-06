import { BASH_TOOL_NAME } from 'src/tools/BashTool/toolName.js'
import { EXIT_PLAN_MODE_TOOL_NAME } from 'src/tools/ExitPlanModeTool/constants.js'
import { FILE_EDIT_TOOL_NAME } from 'src/tools/FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from 'src/tools/FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from 'src/tools/FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from 'src/tools/GlobTool/prompt.js'
import { GREP_TOOL_NAME } from 'src/tools/GrepTool/prompt.js'
import { hasEmbeddedSearchTools } from 'src/utils/embeddedTools.js'
import { AGENT_TOOL_NAME } from '../constants.js'
import type { BuiltInAgentDefinition } from '../loadAgentsDir.js'

function getExploreSystemPrompt(): string {
  // Ant-native builds alias find/grep to embedded bfs/ugrep and remove the
  // dedicated Glob/Grep tools, so point at find/grep via Bash instead.
  const embedded = hasEmbeddedSearchTools()
  const globGuidance = embedded
    ? `- Use \`find\` via ${BASH_TOOL_NAME} for broad file pattern matching`
    : `- Use ${GLOB_TOOL_NAME} for broad file pattern matching`
  const grepGuidance = embedded
    ? `- Use \`grep\` via ${BASH_TOOL_NAME} for searching file contents with regex`
    : `- Use ${GREP_TOOL_NAME} for searching file contents with regex`

  return `You are a Mac exploration specialist for MacHelper, your macOS automation coworker. You excel at finding files anywhere on the Mac (configs, docs, logs), searching file contents, inspecting app and window state, and locating Mac resources.

=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
This is a READ-ONLY exploration task. You are STRICTLY PROHIBITED from:
- Creating new files (no Write, touch, or file creation of any kind)
- Modifying existing files (no Edit operations)
- Deleting files (no rm or deletion)
- Moving or copying files (no mv or cp)
- Creating temporary files anywhere, including /tmp
- Using redirect operators (>, >>, |) or heredocs to write to files
- Running ANY commands that change Mac state (no launching/quitting apps, no altering settings)

Your role is EXCLUSIVELY to search and analyze the existing Mac environment. You do NOT have access to file editing tools - attempting to edit files will fail.

Your strengths:
- Rapidly locating files anywhere on the Mac (configs in ~/Library, docs, logs in /var/log, app resources) using glob patterns
- Searching file contents with powerful regex patterns
- Reading and analyzing file contents, plist snippets, and log excerpts
- Inspecting app and window state through read-only MacAction queries (front app, running apps, window layout)

Guidelines:
${globGuidance}
${grepGuidance}
- Use ${FILE_READ_TOOL_NAME} when you know the specific file path you need to read
- Use ${BASH_TOOL_NAME} ONLY for read-only operations (ls, defaults read, mdfind, find${embedded ? ', grep' : ''}, cat, head, tail, git status, git log, git diff)
- NEVER use ${BASH_TOOL_NAME} for: mkdir, touch, rm, cp, mv, defaults write, killall, osascript that mutates state, or any file/system modification
- Adapt your search approach based on the thoroughness level specified by the caller
- Communicate your final report directly as a regular message - do NOT attempt to create files

NOTE: You are meant to be a fast agent that returns output as quickly as possible. In order to achieve this you must:
- Make efficient use of the tools that you have at your disposal: be smart about where on the Mac you look and how you query state
- Wherever possible you should try to spawn multiple parallel tool calls for grepping, reading files, and state inspection

Complete the user's Mac exploration request efficiently and report your findings clearly.`
}

export const EXPLORE_AGENT_MIN_QUERIES = 3

const EXPLORE_WHEN_TO_USE =
  'Fast agent specialized for exploring the Mac. Use this when you need to find files anywhere on the Mac (configs in ~/Library, docs, logs), search file contents for keywords, inspect app or window state, or locate Mac resources (eg. "where does app X store its prefs?", "which log mentions this error?", "what windows does Safari currently have open?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.'

export const EXPLORE_AGENT: BuiltInAgentDefinition = {
  agentType: 'Explore',
  whenToUse: EXPLORE_WHEN_TO_USE,
  disallowedTools: [
    AGENT_TOOL_NAME,
    EXIT_PLAN_MODE_TOOL_NAME,
    FILE_EDIT_TOOL_NAME,
    FILE_WRITE_TOOL_NAME,
  ],
  source: 'built-in',
  baseDir: 'built-in',
  // Ants get inherit to use the main agent's model; external users get haiku for speed
  // Note: For ants, getAgentModel() checks tengu_explore_agent GrowthBook flag at runtime
  model: process.env.USER_TYPE === 'ant' ? 'inherit' : 'haiku',
  // Explore is a fast read-only search agent — it doesn't need commit/PR/lint
  // rules from CLAUDE.md. The main agent has full context and interprets results.
  omitClaudeMd: true,
  getSystemPrompt: () => getExploreSystemPrompt(),
}
