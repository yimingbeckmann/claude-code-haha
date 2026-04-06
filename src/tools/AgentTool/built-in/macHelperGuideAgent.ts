import { BASH_TOOL_NAME } from 'src/tools/BashTool/toolName.js'
import { FILE_READ_TOOL_NAME } from 'src/tools/FileReadTool/prompt.js'
import { GLOB_TOOL_NAME } from 'src/tools/GlobTool/prompt.js'
import { GREP_TOOL_NAME } from 'src/tools/GrepTool/prompt.js'
import { SEND_MESSAGE_TOOL_NAME } from 'src/tools/SendMessageTool/constants.js'
import { WEB_FETCH_TOOL_NAME } from 'src/tools/WebFetchTool/prompt.js'
import { WEB_SEARCH_TOOL_NAME } from 'src/tools/WebSearchTool/prompt.js'
import { isUsing3PServices } from 'src/utils/auth.js'
import { hasEmbeddedSearchTools } from 'src/utils/embeddedTools.js'
import { getSettings_DEPRECATED } from 'src/utils/settings/settings.js'
import { jsonStringify } from '../../../utils/slowOperations.js'
import type {
  AgentDefinition,
  BuiltInAgentDefinition,
} from '../loadAgentsDir.js'

const MACHELPER_DOCS_MAP_URL =
  'https://code.claude.com/docs/en/machelper_docs_map.md'
const CDP_DOCS_MAP_URL = 'https://platform.claude.com/llms.txt'

export const MACHELPER_GUIDE_AGENT_TYPE = 'machelper-guide'

function getMacHelperGuideBasePrompt(): string {
  // Ant-native builds alias find/grep to embedded bfs/ugrep and remove the
  // dedicated Glob/Grep tools, so point at find/grep instead.
  const localSearchHint = hasEmbeddedSearchTools()
    ? `${FILE_READ_TOOL_NAME}, \`find\`, and \`grep\``
    : `${FILE_READ_TOOL_NAME}, ${GLOB_TOOL_NAME}, and ${GREP_TOOL_NAME}`

  return `You are the MacHelper guide agent. Your primary responsibility is helping users understand and use MacHelper — your macOS automation coworker — effectively. You answer questions about MacHelper features, slash commands, MCP servers, settings, IDE integrations, keyboard shortcuts, the MacMind action catalog, and how to onboard common Mac workflows.

**Your expertise spans three domains:**

1. **MacHelper** (the CLI tool): Installation, configuration, hooks, skills, slash commands, subagents, MCP servers, keyboard shortcuts, IDE integrations, settings, sandboxing, and Mac automation workflows.

2. **MacMind action catalog**: The ~57 actions exposed by the MacMind HTTP daemon at localhost:8484, which MacHelper reaches through the \`MacAction\` tool. Actions cover app/window control, file/Finder operations, keyboard/mouse input, screen capture + OCR, accessibility queries, clipboard, notifications, system settings, and more. You help users pick the right action for the workflow they want to automate.

3. **Onboarding common Mac workflows**: Translating user intent ("archive last week's emails", "reopen yesterday's project tabs", "convert a screenshot folder into a PDF") into a concrete MacHelper workflow — which slash command, which subagent, which MacAction sequence, and which permissions to grant first (Accessibility, Automation, Screen Recording, Full Disk Access, Input Monitoring).

**Documentation sources:**

- **MacHelper docs** (${MACHELPER_DOCS_MAP_URL}): Fetch this for questions about the MacHelper CLI tool, including:
  - Installation, setup, and getting started
  - Hooks (pre/post command execution)
  - Custom skills and slash commands
  - MCP server configuration (including the MacMind MCP)
  - IDE integrations (VS Code, JetBrains)
  - Settings files and configuration
  - Keyboard shortcuts and hotkeys
  - Subagents and plugins
  - Sandboxing and macOS permission model

- **Claude Agent SDK / Claude API docs** (${CDP_DOCS_MAP_URL}): Fetch this only when the user asks about the underlying Agent SDK or the Claude API that MacHelper is built on. This is secondary to the MacHelper + MacMind focus.

**Approach:**
1. Determine whether the user is asking about MacHelper configuration, the MacMind action catalog, a specific Mac workflow, or the underlying SDK/API
2. Use ${WEB_FETCH_TOOL_NAME} to fetch the appropriate docs map
3. Identify the most relevant documentation URLs from the map
4. Fetch the specific documentation pages
5. For action catalog questions, walk through which MacAction(s) apply and what arguments they take
6. For workflow questions, propose a concrete sequence: required permissions → relevant subagent/slash command → MacAction steps → verification approach
7. Use ${WEB_SEARCH_TOOL_NAME} if docs don't cover the topic
8. Reference local project files (CLAUDE.md, .claude/ directory, settings.json) when relevant using ${localSearchHint}

**Guidelines:**
- Always prioritize official documentation over assumptions
- Keep responses concise and actionable
- Include specific examples, command invocations, or MacAction snippets when helpful
- Reference exact documentation URLs in your responses
- Proactively flag macOS permissions a workflow will need before the user hits a silent failure
- Help users discover features by suggesting related slash commands, shortcuts, subagents, or MacActions

Complete the user's request by providing accurate, documentation-based guidance for MacHelper and Mac workflow automation.`
}

function getFeedbackGuideline(): string {
  // For 3P services (Bedrock/Vertex/Foundry), /feedback command is disabled
  // Direct users to the appropriate feedback channel instead
  if (isUsing3PServices()) {
    return `- When you cannot find an answer or the feature doesn't exist, direct the user to ${MACRO.ISSUES_EXPLAINER}`
  }
  return "- When you cannot find an answer or the feature doesn't exist, direct the user to use /feedback to report a feature request or bug"
}

export const MACHELPER_GUIDE_AGENT: BuiltInAgentDefinition = {
  agentType: MACHELPER_GUIDE_AGENT_TYPE,
  whenToUse: `Use this agent when the user asks questions ("Can MacHelper...", "Does MacHelper...", "How do I...") about: (1) MacHelper features, slash commands, hooks, subagents, MCP servers, settings, IDE integrations, and keyboard shortcuts; (2) the MacMind action catalog (~57 actions exposed via the MacAction tool) and which action fits a given automation need; (3) how to onboard common Mac workflows — picking the right MacActions, permissions, and verification steps to automate a user intent end-to-end. **IMPORTANT:** Before spawning a new agent, check if there is already a running or recently completed machelper-guide agent that you can continue via ${SEND_MESSAGE_TOOL_NAME}.`,
  // Ant-native builds: Glob/Grep tools are removed; use Bash (with embedded
  // bfs/ugrep via find/grep aliases) for local file search instead.
  tools: hasEmbeddedSearchTools()
    ? [
        BASH_TOOL_NAME,
        FILE_READ_TOOL_NAME,
        WEB_FETCH_TOOL_NAME,
        WEB_SEARCH_TOOL_NAME,
      ]
    : [
        GLOB_TOOL_NAME,
        GREP_TOOL_NAME,
        FILE_READ_TOOL_NAME,
        WEB_FETCH_TOOL_NAME,
        WEB_SEARCH_TOOL_NAME,
      ],
  source: 'built-in',
  baseDir: 'built-in',
  model: 'haiku',
  permissionMode: 'dontAsk',
  getSystemPrompt({ toolUseContext }) {
    const commands = toolUseContext.options.commands

    // Build context sections
    const contextSections: string[] = []

    // 1. Custom skills
    const customCommands = commands.filter(cmd => cmd.type === 'prompt')
    if (customCommands.length > 0) {
      const commandList = customCommands
        .map(cmd => `- /${cmd.name}: ${cmd.description}`)
        .join('\n')
      contextSections.push(
        `**Available custom skills in this project:**\n${commandList}`,
      )
    }

    // 2. Custom agents from .claude/agents/
    const customAgents =
      toolUseContext.options.agentDefinitions.activeAgents.filter(
        (a: AgentDefinition) => a.source !== 'built-in',
      )
    if (customAgents.length > 0) {
      const agentList = customAgents
        .map((a: AgentDefinition) => `- ${a.agentType}: ${a.whenToUse}`)
        .join('\n')
      contextSections.push(
        `**Available custom agents configured:**\n${agentList}`,
      )
    }

    // 3. MCP servers
    const mcpClients = toolUseContext.options.mcpClients
    if (mcpClients && mcpClients.length > 0) {
      const mcpList = mcpClients
        .map((client: { name: string }) => `- ${client.name}`)
        .join('\n')
      contextSections.push(`**Configured MCP servers:**\n${mcpList}`)
    }

    // 4. Plugin commands
    const pluginCommands = commands.filter(
      cmd => cmd.type === 'prompt' && cmd.source === 'plugin',
    )
    if (pluginCommands.length > 0) {
      const pluginList = pluginCommands
        .map(cmd => `- /${cmd.name}: ${cmd.description}`)
        .join('\n')
      contextSections.push(`**Available plugin skills:**\n${pluginList}`)
    }

    // 5. User settings
    const settings = getSettings_DEPRECATED()
    if (Object.keys(settings).length > 0) {
      // eslint-disable-next-line no-restricted-syntax -- human-facing UI, not tool_result
      const settingsJson = jsonStringify(settings, null, 2)
      contextSections.push(
        `**User's settings.json:**\n\`\`\`json\n${settingsJson}\n\`\`\``,
      )
    }

    // Add the feedback guideline (conditional based on whether user is using 3P services)
    const feedbackGuideline = getFeedbackGuideline()
    const basePromptWithFeedback = `${getMacHelperGuideBasePrompt()}
${feedbackGuideline}`

    // If we have any context to add, append it to the base system prompt
    if (contextSections.length > 0) {
      return `${basePromptWithFeedback}

---

# User's Current Configuration

The user has the following custom setup in their environment:

${contextSections.join('\n\n')}

When answering questions, consider these configured features and proactively suggest them when relevant.`
    }

    // Return the base prompt if no context to add
    return basePromptWithFeedback
  },
}
