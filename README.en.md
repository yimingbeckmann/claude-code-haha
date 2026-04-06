# MacHelper — Mac automation coworker powered by MacMind

<p align="center">
  <img src="docs/images/banner.jpg" alt="MacHelper Banner" width="800">
</p>

<div align="center">

[![中文](https://img.shields.io/badge/🇨🇳_中文-Available-green)](README.md)
[![English](https://img.shields.io/badge/🇺🇸_English-Current-blue)](README.en.md)

</div>

MacHelper is a fork of [claude-code-haha](https://github.com/NanmiCoder/cc-haha) retargeted as a **Mac automation coworker**. Instead of just giving advice in the terminal, MacHelper drives your real Mac end-to-end — opening apps, clicking, typing, reading the screen, and orchestrating multi-step workflows across the native stack — by talking to the **MacMind HTTP daemon** running locally at `127.0.0.1:8484`.

Through MacMind, MacHelper gets roughly **57 actions** spanning:

- **Mouse** — move, click, double-click, right-click, drag, scroll
- **Keyboard** — typing, key combos, modifier holds, hotkeys
- **Windows** — list, focus, move, resize, minimize, close
- **Applications** — launch, quit, switch, list running apps
- **Safari** — tab control, navigation, reading page content
- **Clipboard** — read, write, history
- **Screen & OCR** — screenshots, region reads, text extraction
- **Filesystem** — read, write, list, move, delete
- **Shell** — run commands with captured output
- **Calendar** — list, create, and update events

Think of it as a coworker who actually sits at your Mac: you describe what you want done, MacHelper opens the apps, navigates the UI, reads the screen, recovers from failures, and reports back.

<p align="center">
  <a href="#features">Features</a> · <a href="#architecture-overview">Architecture</a> · <a href="#quick-start">Quick Start</a> · <a href="docs/en/guide/env-vars.md">Env Vars</a> · <a href="docs/en/guide/faq.md">FAQ</a> · <a href="docs/en/guide/global-usage.md">Global Usage</a> · <a href="#more-documentation">More Docs</a>
</p>

---

## Features

- Native Mac automation via the MacMind HTTP daemon — drive any application through accessibility, keystrokes, clicks, and screen reads
- Full Ink TUI for interactive Mac automation sessions
- `--print` headless mode for scripting and scheduled automations
- MCP servers, plugins, and Skills for packaging reusable Mac workflows
- Support for custom API endpoints and models ([Third-Party Models Guide](docs/en/guide/third-party-models.md))
- **Memory System** (cross-session persistent memory) — [Usage Guide](docs/memory/01-usage-guide.md)
- **Multi-Agent System** (agent orchestration, parallel Mac automation tasks, Teams collaboration) — [Usage Guide](docs/agent/01-usage-guide.md) | [Implementation](docs/agent/02-implementation.md)
- **Skills System** (packaged Mac automation capability plugins, custom workflows) — [Usage Guide](docs/skills/01-usage-guide.md) | [Implementation](docs/skills/02-implementation.md)
- **Computer Use desktop control** — screen, mouse, keyboard, clipboard — [Guide](docs/en/features/computer-use.md) | [Architecture](docs/en/features/computer-use-architecture.md)
- Fallback Recovery CLI mode (`MACHELPER_FORCE_RECOVERY_CLI=1 ./bin/machelper`)

---

## Architecture Overview

<table>
  <tr>
    <td align="center" width="25%"><img src="docs/images/01-overall-architecture.png" alt="Overall architecture"><br><b>Overall architecture</b></td>
    <td align="center" width="25%"><img src="docs/images/02-request-lifecycle.png" alt="Request lifecycle"><br><b>Request lifecycle</b></td>
    <td align="center" width="25%"><img src="docs/images/03-tool-system.png" alt="Tool system"><br><b>Tool system</b></td>
    <td align="center" width="25%"><img src="docs/images/04-multi-agent.png" alt="Multi-agent architecture"><br><b>Multi-agent architecture</b></td>
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
# Edit .env with your API key — see docs/en/guide/env-vars.md for details
```

### 3. Make sure the MacMind daemon is running

MacHelper talks to the MacMind daemon over HTTP at `127.0.0.1:8484`. Launch the MacMind app (or its headless daemon) before starting a session so MacHelper has a real Mac to drive.

### 4. Launch

```bash
./bin/machelper                          # Interactive TUI mode
./bin/machelper -p "your prompt here"    # Headless mode
./bin/machelper --help                   # Show all options
```

### 5. Global usage (optional)

Add `bin/` to your PATH to launch from any directory. See [Global Usage Guide](docs/en/guide/global-usage.md):

```bash
export PATH="$HOME/path/to/machelper/bin:$PATH"
```

---

## Tech Stack

| Category | Technology |
|------|------|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript |
| Terminal UI | React + [Ink](https://github.com/vadimdemedes/ink) |
| CLI parser | Commander.js |
| API | Anthropic SDK |
| Protocols | MCP, LSP |
| Native bridge | MacMind Swift daemon (HTTP at `127.0.0.1:8484`) |

---

## More Documentation

| Document | Description |
|------|------|
| [Environment Variables](docs/en/guide/env-vars.md) | Full env var reference and configuration methods |
| [Third-Party Models](docs/en/guide/third-party-models.md) | Using OpenAI / DeepSeek / Ollama and other non-Anthropic models |
| [Memory System](docs/memory/01-usage-guide.md) | Cross-session persistent memory usage and implementation |
| [Multi-Agent System](docs/agent/01-usage-guide.md) | Agent orchestration, parallel Mac automation tasks, and Teams collaboration |
| [Skills System](docs/skills/01-usage-guide.md) | Extensible capability plugins, custom workflows, and conditional activation |
| [Computer Use](docs/en/features/computer-use.md) | Desktop control (screenshots, mouse, keyboard) — [Architecture](docs/en/features/computer-use-architecture.md) |
| [Global Usage](docs/en/guide/global-usage.md) | Launch machelper from any directory |
| [FAQ](docs/en/guide/faq.md) | Common error troubleshooting |
| [Project Structure](docs/en/reference/project-structure.md) | Code directory structure |

---

## Credits

MacHelper is a fork of [claude-code-haha](https://github.com/NanmiCoder/cc-haha) — a locally runnable Ink TUI CLI. This fork retargets the project as a Mac automation coworker by wiring the tool layer to the MacMind HTTP daemon. Thanks to the upstream authors for the solid TUI and tool-loop foundation.

---

## Disclaimer

MacHelper is a Mac automation coworker built on top of the MacMind runtime. It is intended for automating your own Mac and personal workflows. Always review what automation you grant it access to before running unattended sessions.
