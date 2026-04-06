# MacHelper

<p align="center">
  <img src="docs/images/banner.jpg" alt="MacHelper Banner" width="800">
</p>

<div align="center">

**MacHelper — Mac automation coworker powered by MacMind**

</div>

MacHelper is a Mac automation coworker that lives in your terminal. It drives real Mac apps end-to-end — clicking, typing, reading screen state, and orchestrating multi-step workflows across the native stack — so you can hand off real work instead of just getting advice. Under the hood it is powered by the MacMind runtime, which exposes a native accessibility / computer-use bridge to your Mac's applications and system state.

Think of it as a coworker who actually sits at your Mac: you describe what you want done, MacHelper opens the apps, navigates the UI, reads the screen, recovers from failures, and reports back.

<p align="center">
  <a href="#features">Features</a> · <a href="#architecture-overview">Architecture</a> · <a href="#quick-start">Quick Start</a> · <a href="docs/guide/env-vars.md">Env Vars</a> · <a href="docs/guide/faq.md">FAQ</a> · <a href="docs/guide/global-usage.md">Global Usage</a> · <a href="#more-documentation">More Documentation</a>
</p>

---

## Features

- Native Mac automation via MacMind — drive any application through accessibility, keystrokes, clicks, and screen reads
- Full Ink TUI for interactive Mac automation sessions
- `--print` headless mode for scripting and scheduled automations
- MCP servers, plugins, and Skills for packaging reusable Mac workflows
- Support for custom API endpoints and models ([Third-Party Models Guide](docs/guide/third-party-models.md))
- **Memory System** (cross-session persistent memory) — [Usage Guide](docs/memory/01-usage-guide.md)
- **Multi-Agent System** (agent orchestration, parallel Mac automation tasks, Teams collaboration) — [Usage Guide](docs/agent/01-usage-guide.md) | [Implementation](docs/agent/02-implementation.md)
- **Skills System** (packaged Mac automation capability plugins, custom workflows) — [Usage Guide](docs/skills/01-usage-guide.md) | [Implementation](docs/skills/02-implementation.md)
- **Computer Use desktop control** — screen, mouse, keyboard, clipboard — [Guide](docs/features/computer-use.md) | [Architecture](docs/features/computer-use-architecture.md)
- Fallback Recovery CLI mode (`MACHELPER_FORCE_RECOVERY_CLI=1 ./bin/machelper`)

---

## Architecture Overview

<table>
  <tr>
    <td align="center" width="25%"><img src="docs/images/01-overall-architecture.png" alt="Overall architecture"><br><b>Overall architecture</b></td>
    <td align="center" width="25%"><img src="docs/images/02-request-lifecycle.png" alt="Request lifecycle"><br><b>Request lifecycle</b></td>
    <td align="center" width="25%"><img src="docs/images/03-tool-system.png" alt="Tool system"><br><b>Tool system</b></td>
    <td align="center" width="25%"><img src="docs/images/04-multi-agent.png" alt="Multi-agent"><br><b>Multi-agent</b></td>
  </tr>
  <tr>
    <td align="center" width="25%"><img src="docs/images/05-terminal-ui.png" alt="Terminal UI"><br><b>Terminal UI</b></td>
    <td align="center" width="25%"><img src="docs/images/06-permission-security.png" alt="Permissions and security"><br><b>Permissions and security</b></td>
    <td align="center" width="25%"><img src="docs/images/07-services-layer.png" alt="Services layer"><br><b>Services layer</b></td>
    <td align="center" width="25%"><img src="docs/images/08-state-data-flow.png" alt="State and data flow"><br><b>State and data flow</b></td>
  </tr>
</table>

---

## Quick Start

### 1. Install Bun

```bash
# macOS
curl -fsSL https://bun.sh/install | bash

# macOS (Homebrew)
brew install bun
```

### 2. Install dependencies and configure

```bash
bun install
cp .env.example .env
# Edit .env with your API key; see docs/guide/env-vars.md
```

### 3. Launch

```bash
./bin/machelper                          # Interactive TUI mode
./bin/machelper -p "your prompt here"    # Headless mode
./bin/machelper --help                   # All options
```

### 4. Global usage (optional)

Add `bin/` to your PATH to launch from any directory; see [Global Usage Guide](docs/guide/global-usage.md):

```bash
export PATH="$HOME/path/to/machelper/bin:$PATH"
```

---

## Tech Stack

| Category | Tech |
|------|------|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript |
| Terminal UI | React + [Ink](https://github.com/vadimdemedes/ink) |
| CLI parser | Commander.js |
| API | Anthropic SDK |
| Protocols | MCP, LSP |
| Native bridge | MacMind (accessibility / computer-use) |

---

## More Documentation

| Doc | Description |
|------|------|
| [Environment Variables](docs/guide/env-vars.md) | Full environment variable reference and configuration |
| [Third-Party Models](docs/guide/third-party-models.md) | Connecting non-Anthropic models |
| [Memory System](docs/memory/01-usage-guide.md) | Cross-session persistent memory usage and implementation |
| [Multi-Agent System](docs/agent/01-usage-guide.md) | Agent orchestration, parallel task execution, and Teams collaboration |
| [Skills System](docs/skills/01-usage-guide.md) | Extensible capability plugins, custom workflows, and conditional activation |
| [Computer Use](docs/features/computer-use.md) | Desktop control (screen, mouse, keyboard) — [Architecture](docs/features/computer-use-architecture.md) |
| [Global Usage](docs/guide/global-usage.md) | Launch MacHelper from any directory |
| [FAQ](docs/guide/faq.md) | Common errors and troubleshooting |
| [Project Structure](docs/reference/project-structure.md) | Source tree layout |

---

## Disclaimer

MacHelper is a Mac automation coworker built on top of the MacMind runtime. It is intended for automating your own Mac and personal workflows. Always review what automation you grant it access to before running unattended sessions.
