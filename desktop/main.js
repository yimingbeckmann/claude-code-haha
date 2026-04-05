const { app, BrowserWindow, Menu, ipcMain, dialog, session, systemPreferences, Tray, nativeImage } = require("electron");
const path = require("path");
const net = require("net");
const http = require("http");
const { spawn, execSync } = require("child_process");
const fs = require("fs");

let pty;
try { pty = require("node-pty"); } catch { pty = null; }

const { startBridgeServer } = require("./bridge-server");

let mainWindow = null;
let backendProcess = null;
let backendPort = null;
let spaPort = null;
let bridgeServer = null;
let ptyProcess = null;
let tray = null;

// ─── Toggle states for menu items ───────────────────────────────
const toggleState = {
  kairos: false,
  undercover: false,
  briefMode: false,
};

const isDev = !app.isPackaged;
const userDataPath = app.getPath("userData");
const configPath = path.join(userDataPath, "config.json");
const venvPath = path.join(userDataPath, "python-env");

// ─── Config persistence ──────────────────────────────────────────
function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

function writeConfig(data) {
  const current = readConfig();
  fs.writeFileSync(configPath, JSON.stringify({ ...current, ...data }, null, 2));
}

// ─── Port allocation ─────────────────────────────────────────────
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

// ─── Python venv ─────────────────────────────────────────────────
function findPython() {
  for (const cmd of ["python3", "python"]) {
    try {
      const version = execSync(`${cmd} --version 2>&1`, { encoding: "utf-8" }).trim();
      if (version.includes("3.")) return cmd;
    } catch {}
  }
  return null;
}

function ensureVenv(pythonCmd) {
  const pip = path.join(venvPath, "bin", "pip");
  if (fs.existsSync(pip)) return true;

  console.log("Creating Python virtual environment...");
  execSync(`${pythonCmd} -m venv "${venvPath}"`, { stdio: "inherit" });

  const backendDir = isDev
    ? path.join(__dirname, "..", "backend")
    : path.join(process.resourcesPath, "backend");
  const reqFile = path.join(backendDir, "requirements.txt");

  if (fs.existsSync(reqFile)) {
    console.log("Installing Python dependencies...");
    execSync(`"${pip}" install -r "${reqFile}"`, { stdio: "inherit" });
  } else {
    // Install minimal deps
    execSync(`"${pip}" install fastapi uvicorn openai httpx`, { stdio: "inherit" });
  }
  return true;
}

// ─── Backend lifecycle ───────────────────────────────────────────
async function startBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }

  backendPort = await getFreePort();
  const cfg = readConfig();
  const apiKey = cfg.apiKey || "";
  const workspace = cfg.workspace || app.getPath("home");

  const backendDir = isDev
    ? path.join(__dirname, "..", "backend")
    : path.join(process.resourcesPath, "backend");

  const pythonBin = path.join(venvPath, "bin", "python");

  const env = {
    ...process.env,
    OPENAI_API_KEY: apiKey,
    WORKSPACE_ROOT: workspace,
    SHARED_WORKSPACE: "1",
  };

  backendProcess = spawn(
    pythonBin,
    ["-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", String(backendPort)],
    { cwd: backendDir, env, stdio: ["ignore", "pipe", "pipe"] }
  );

  backendProcess.stdout.on("data", (d) => console.log("[backend]", d.toString().trim()));
  backendProcess.stderr.on("data", (d) => console.log("[backend]", d.toString().trim()));
  backendProcess.on("exit", (code) => {
    console.log(`Backend exited with code ${code}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(
        `document.dispatchEvent(new CustomEvent("claw-backend-disconnected"))`
      );
    }
  });

  // Wait for backend to be ready
  const maxWait = 15000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(`http://127.0.0.1:${backendPort}/sessions`);
      if (res.ok) {
        console.log(`Backend ready on port ${backendPort}`);
        return backendPort;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Backend failed to start within 15 seconds");
}

// ─── IPC handlers ────────────────────────────────────────────────
function setupIPC() {
  ipcMain.handle("get-config", () => {
    const cfg = readConfig();
    return {
      apiBase: `http://127.0.0.1:${backendPort}`,
      streamBase: `http://127.0.0.1:${backendPort}`,
      spaPort: spaPort,
      workspaceRoot: cfg.workspace || app.getPath("home"),
      hasApiKey: !!cfg.apiKey,
    };
  });

  ipcMain.handle("request-mic-permission", async () => {
    if (process.platform === "darwin" && systemPreferences.askForMediaAccess) {
      const granted = await systemPreferences.askForMediaAccess("microphone");
      return { granted };
    }
    return { granted: true }; // Non-macOS, assume granted
  });

  ipcMain.handle("get-mic-permission", () => {
    if (process.platform === "darwin" && systemPreferences.getMediaAccessStatus) {
      const status = systemPreferences.getMediaAccessStatus("microphone");
      return { status }; // "not-determined", "granted", "denied", "restricted"
    }
    return { status: "granted" };
  });

  ipcMain.handle("set-api-key", async (_e, key) => {
    writeConfig({ apiKey: key });
    process.env.ANTHROPIC_API_KEY = key;
    // Restart bridge or Python backend
    if (bridgeServer) {
      bridgeServer.close();
      bridgeServer = startBridgeServer(backendPort);
    } else {
      await startBackend();
    }
    return { success: true };
  });

  ipcMain.handle("get-api-key", () => {
    const cfg = readConfig();
    const key = cfg.apiKey || "";
    return key ? `...${key.slice(-4)}` : "";
  });

  ipcMain.handle("choose-workspace", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Choose Workspace Folder",
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const dir = result.filePaths[0];
      writeConfig({ workspace: dir });
      await startBackend();
      return dir;
    }
    return null;
  });

  ipcMain.handle("restart-backend", async () => {
    await startBackend();
    return { port: backendPort };
  });
}

// ─── Static SPA server ───────────────────────────────────────────
async function startSpaServer() {
  const rendererDir = path.join(__dirname, "renderer");
  const mimeTypes = {
    ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
    ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
    ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff",
  };
  const configScript = `<script>window.__CLAW_CONFIG__={apiBase:"http://127.0.0.1:${backendPort}",streamBase:"http://127.0.0.1:${backendPort}"};</script>`;
  const server = http.createServer((req, res) => {
    let filePath = path.join(rendererDir, req.url === "/" ? "index.html" : req.url);
    if (!fs.existsSync(filePath)) filePath = path.join(rendererDir, "index.html");
    const ext = path.extname(filePath);
    res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
    let content = fs.readFileSync(filePath);
    // Inject config into HTML pages before <head> content
    if (ext === ".html") {
      content = content.toString().replace("<head>", "<head>" + configScript);
    }
    res.end(content);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      spaPort = server.address().port;
      console.log(`SPA server on port ${spaPort}`);
      resolve(spaPort);
    });
  });
}

// ─── PTY for embedded terminal ───────────────────────────────────
function setupPTY() {
  if (!pty) { console.error("node-pty not available"); return; }

  const HOME_DIR = process.env.HOME || "/Users/yiming";
  const bunPaths = [
    path.join(HOME_DIR, ".bun", "bin", "bun"),
    "/opt/homebrew/bin/bun",
    "/usr/local/bin/bun",
  ];
  let bunBin = null;
  for (const p of bunPaths) { if (fs.existsSync(p)) { bunBin = p; break; } }
  if (!bunBin) { console.error("bun not found at:", bunPaths); return; }

  // Use the runtime dir resolved at startup (ensureRuntimeDir)
  const runtimeDir = process.env.CLAUDE_RUNTIME_DIR || path.join(process.env.HOME || "", "Applications", "claw-code", "claude-code-runtime");

  const cfg = readConfig();
  const extraPaths = [`${HOME_DIR}/.bun/bin`, "/opt/homebrew/bin", "/usr/local/bin"];
  // Strip ALL CLAUDE_CODE_* and SDK vars from Electron's env to prevent interference
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("CLAUDE_CODE_") || key.startsWith("CLAUDE_AGENT_") ||
        key === "CLAUDECODE" || key === "OPERON_SANDBOXED_NETWORK" ||
        key === "DEFAULT_LLM_MODEL" || key === "ENABLE_TOOL_SEARCH" ||
        key === "MCP_CONNECTION_NONBLOCKING" || key === "DISABLE_AUTOUPDATER" ||
        key === "DISABLE_MICROCOMPACT" || key === "USE_STAGING_OAUTH" ||
        key === "USE_LOCAL_OAUTH" || key === "WORKSPACE_ROOT" ||
        key === "API_TIMEOUT_MS" || key === "ANTHROPIC_API_KEY" ||
        key === "ANTHROPIC_AUTH_TOKEN" || key === "ANTHROPIC_BASE_URL" ||
        key === "OPENAI_API_KEY" || key === "OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE") {
      delete env[key];
    }
  }
  Object.assign(env, {
    PATH: [...extraPaths, process.env.PATH || ""].join(":"),
    DISABLE_TELEMETRY: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    CLAUDE_CODE_REMOTE: "1",
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
  });
  // Only re-add if user explicitly stored a key in the app config
  if (cfg.apiKey) { env.ANTHROPIC_API_KEY = cfg.apiKey; env.ANTHROPIC_AUTH_TOKEN = cfg.apiKey; }
  if (cfg.openaiKey) { env.OPENAI_API_KEY = cfg.openaiKey; }

  // Pass --model to keep CLI tab consistent with GUI tab
  const savedModel = cfg.model || "claude-sonnet-4-6";
  // Use bash to run bin/claude-haha — same path as terminal which works
  const shellBin = "/bin/bash";
  const ptyArgs = ["-c", `exec "${runtimeDir}/bin/claude-haha" --dangerously-skip-permissions --model ${savedModel}`];

  console.log("Spawning PTY with bash in", runtimeDir, "model:", savedModel);
  fs.writeFileSync("/tmp/pty-debug.json", JSON.stringify({ env, args: ptyArgs, cwd: runtimeDir, shell: shellBin }, null, 2));

  ptyProcess = pty.spawn(shellBin, ptyArgs, {
    name: "xterm-256color",
    cols: 120,
    rows: 40,
    cwd: runtimeDir,
    env,
  });

  ptyProcess.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("pty-output", data);
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    console.log(`PTY exited with code ${exitCode}`);
    // Restart after a brief delay
    setTimeout(() => { if (mainWindow && !mainWindow.isDestroyed()) setupPTY(); }, 1000);
  });

  // IPC: receive input from renderer
  ipcMain.removeAllListeners("pty-input");
  ipcMain.on("pty-input", (_e, data) => {
    if (ptyProcess) ptyProcess.write(data);
  });

  ipcMain.removeAllListeners("pty-resize");
  ipcMain.on("pty-resize", (_e, { cols, rows }) => {
    if (ptyProcess) ptyProcess.resize(cols, rows);
  });
}

// ─── Window ──────────────────────────────────────────────────────
function createWindow() {
  process.env.CLAW_BACKEND_PORT = String(backendPort);
  mainWindow = new BrowserWindow({
    title: "Tensor Code 2",
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#0a0a0f",
    icon: path.join(__dirname, "icons", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  mainWindow.setTitle("Tensor Code 2");

  // Load the terminal UI (has CLI + GUI tabs)
  mainWindow.loadFile(path.join(__dirname, "terminal.html"));

  mainWindow.webContents.on("did-finish-load", () => {
    try {
      setupPTY();
    } catch (err) {
      console.error("PTY setup failed:", err.message);
      // Fall back — tell renderer to show error
      mainWindow.webContents.executeJavaScript(
        `document.getElementById('terminal').innerHTML = '<div style="color:#f97316;padding:20px;font-family:monospace">PTY failed: ${err.message.replace(/'/g, "\\'")}.<br><br>Switching to GUI mode...</div>'; setTimeout(() => switchTab('gui'), 2000);`
      );
    }
  });

  mainWindow.on("closed", () => {
    if (ptyProcess) ptyProcess.kill();
    mainWindow = null;
  });
}

// ─── Menu ────────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: "Tensor Code 2",
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Settings",
          accelerator: "CmdOrCtrl+,",
          click: () => mainWindow?.webContents.send("open-settings"),
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { type: "separator" },
        {
          label: "Brief Mode",
          type: "checkbox",
          checked: toggleState.briefMode,
          accelerator: "CmdOrCtrl+Shift+B",
          click: (menuItem) => {
            toggleState.briefMode = menuItem.checked;
            mainWindow?.webContents.send("toggle-brief-mode", toggleState.briefMode);
            updateTrayMenu();
          },
        },
      ],
    },
    {
      label: "Tools",
      submenu: [
        {
          label: "KAIROS",
          type: "checkbox",
          checked: toggleState.kairos,
          accelerator: "CmdOrCtrl+Shift+K",
          click: (menuItem) => {
            toggleState.kairos = menuItem.checked;
            mainWindow?.webContents.send("toggle-kairos", toggleState.kairos);
            updateTrayMenu();
          },
        },
        {
          label: "Swarm",
          accelerator: "CmdOrCtrl+Shift+W",
          click: () => mainWindow?.webContents.send("launch-swarm"),
        },
        {
          label: "Buddy",
          accelerator: "CmdOrCtrl+Shift+Y",
          click: () => mainWindow?.webContents.send("launch-buddy"),
        },
        { type: "separator" },
        {
          label: "Stickers",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => mainWindow?.webContents.send("launch-stickers"),
        },
        {
          label: "Undercover",
          type: "checkbox",
          checked: toggleState.undercover,
          accelerator: "CmdOrCtrl+Shift+U",
          click: (menuItem) => {
            toggleState.undercover = menuItem.checked;
            mainWindow?.webContents.send("toggle-undercover", toggleState.undercover);
          },
        },
      ],
    },
    {
      label: "Code",
      submenu: [
        {
          label: "Ultra Review",
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => mainWindow?.webContents.send("launch-ultra-review"),
        },
        {
          label: "Security Review",
          click: () => mainWindow?.webContents.send("launch-security-review"),
        },
        { type: "separator" },
        {
          label: "Init Verifiers",
          click: () => mainWindow?.webContents.send("launch-init-verifiers"),
        },
        {
          label: "Insights",
          accelerator: "CmdOrCtrl+Shift+I",
          click: () => mainWindow?.webContents.send("launch-insights"),
        },
      ],
    },
    {
      label: "Session",
      submenu: [
        {
          label: "Fork",
          accelerator: "CmdOrCtrl+Shift+F",
          click: () => mainWindow?.webContents.send("session-fork"),
        },
        {
          label: "Rewind",
          accelerator: "CmdOrCtrl+Shift+Z",
          click: () => mainWindow?.webContents.send("session-rewind"),
        },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        {
          label: "New Session",
          accelerator: "CmdOrCtrl+N",
          click: () => mainWindow?.webContents.send("new-session"),
        },
        { type: "separator" },
        {
          label: "Open CLI Terminal",
          accelerator: "CmdOrCtrl+Shift+T",
          click: () => launchCLI(),
        },
        { type: "separator" },
        { role: "front" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Context menu (right-click) ─────────────────────────────────
function setupContextMenu() {
  ipcMain.on("show-context-menu", (_event) => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Fork conversation here",
        click: () => mainWindow?.webContents.send("session-fork"),
      },
      {
        label: "Rewind to this point",
        click: () => mainWindow?.webContents.send("session-rewind"),
      },
      { type: "separator" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ]);
    contextMenu.popup({ window: mainWindow });
  });
}

// ─── System tray ────────────────────────────────────────────────
function setupTray() {
  const iconPath = path.join(__dirname, "icons", "icon.png");
  if (!fs.existsSync(iconPath)) return;

  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
  tray = new Tray(trayIcon);
  tray.setToolTip("Tensor Code 2");
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    { label: "Tensor Code 2", enabled: false },
    { type: "separator" },
    {
      label: "KAIROS Mode",
      type: "checkbox",
      checked: toggleState.kairos,
      click: (menuItem) => {
        toggleState.kairos = menuItem.checked;
        mainWindow?.webContents.send("toggle-kairos", toggleState.kairos);
        buildMenu(); // sync app menu checkmarks
      },
    },
    {
      label: "Brief Mode",
      type: "checkbox",
      checked: toggleState.briefMode,
      click: (menuItem) => {
        toggleState.briefMode = menuItem.checked;
        mainWindow?.webContents.send("toggle-brief-mode", toggleState.briefMode);
        buildMenu(); // sync app menu checkmarks
      },
    },
    { type: "separator" },
    {
      label: "Show Window",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
}

// ─── CLI launcher ────────────────────────────────────────────
function launchCLI() {
  const cfg = readConfig();
  const cliDir = process.env.CLAUDE_RUNTIME_DIR || path.join(process.env.HOME || "", "Applications", "claw-code", "claude-code-runtime");

  // Find bun
  const bunPaths = [
    path.join(process.env.HOME || "", ".bun", "bin", "bun"),
    "/opt/homebrew/bin/bun",
    "/usr/local/bin/bun",
  ];
  let bunBin = "bun";
  for (const p of bunPaths) {
    if (fs.existsSync(p)) { bunBin = p; break; }
  }

  // Open Terminal.app with the CLI
  const env = {
    ANTHROPIC_API_KEY: cfg.apiKey || "",
    ANTHROPIC_BASE_URL: cfg.anthropicBaseUrl || "",
  };
  const envStr = Object.entries(env)
    .filter(([, v]) => v)
    .map(([k, v]) => `export ${k}="${v}"`)
    .join("; ");

  const cmd = `cd "${cliDir}" && ${envStr ? envStr + "; " : ""}${bunBin} run start`;

  spawn("osascript", [
    "-e",
    `tell application "Terminal" to do script "${cmd.replace(/"/g, '\\"')}"`,
  ]);
}

// ─── Ensure a usable CLI runtime with node_modules ──────────────
// electron-builder strips dirs named "node_modules"; prepare.js renames to "_modules".
// The packaged .app is read-only, so we copy the bundled runtime to a writable location
// (userData) and restore _modules -> node_modules there.
function ensureRuntimeDir() {
  // Source runtime (development checkout) — always preferred if it has node_modules
  const srcRuntime = path.join(process.env.HOME || "/Users/yiming", "Applications", "claw-code", "claude-code-runtime");
  if (fs.existsSync(path.join(srcRuntime, "node_modules"))) {
    console.log("Using source runtime:", srcRuntime);
    return srcRuntime;
  }

  // Bundled runtime — copy to writable userData location
  const bundledRT = isDev
    ? path.join(__dirname, "..", "claude-code-runtime")
    : path.join(process.resourcesPath, "claude-code-runtime");
  if (!fs.existsSync(bundledRT)) {
    console.error("No runtime found at", bundledRT);
    return bundledRT;
  }

  const writableRT = path.join(userDataPath, "claude-code-runtime");
  const writableNM = path.join(writableRT, "node_modules");

  // If writable copy already has node_modules, use it
  if (fs.existsSync(writableNM)) {
    console.log("Using cached writable runtime:", writableRT);
    return writableRT;
  }

  // Copy bundled runtime to writable location
  console.log("Copying bundled runtime to writable location...");
  if (fs.existsSync(writableRT)) fs.rmSync(writableRT, { recursive: true });
  fs.cpSync(bundledRT, writableRT, { recursive: true });

  // Restore _modules -> node_modules
  const bk = path.join(writableRT, "_modules");
  if (!fs.existsSync(writableNM) && fs.existsSync(bk)) {
    console.log("Restoring _modules -> node_modules");
    fs.renameSync(bk, writableNM);
  }

  console.log("Writable runtime ready:", writableRT);
  return writableRT;
}

// ─── App lifecycle ───────────────────────────────────────────────
// Enable Web Speech API (requires Chromium speech service)
app.commandLine.appendSwitch("enable-speech-dispatcher");

app.whenReady().then(async () => {
  app.name = "Tensor Code 2";
  app.setName("Tensor Code 2");

  // Grant microphone + media permissions for the GUI iframe
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ["media", "microphone", "audioCapture", "clipboard-read", "clipboard-sanitized-write"];
    callback(allowed.includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const allowed = ["media", "microphone", "audioCapture", "clipboard-read", "clipboard-sanitized-write"];
    return allowed.includes(permission);
  });

  // Ensure CLI runtime is available with node_modules
  const runtimeDir = ensureRuntimeDir();
  process.env.CLAUDE_RUNTIME_DIR = runtimeDir;

  if (process.platform === 'darwin') {
    try {
      const iconPath = path.join(__dirname, 'icons', 'icon.png');
      if (fs.existsSync(iconPath)) app.dock.setIcon(iconPath);
    } catch {}
  }

  // Check Python
  const pythonCmd = findPython();
  if (!pythonCmd) {
    dialog.showErrorBox(
      "Python Required",
      "Tensor Code 2 requires Python 3.10 or later.\n\nInstall it from https://www.python.org/downloads/ or via Homebrew:\n  brew install python3"
    );
    app.quit();
    return;
  }

  // Setup venv
  try {
    ensureVenv(pythonCmd);
  } catch (err) {
    dialog.showErrorBox("Setup Error", `Failed to create Python environment:\n${err.message}`);
    app.quit();
    return;
  }

  setupIPC();
  buildMenu();
  setupContextMenu();
  setupTray();

  // Start backend — try bridge server first, fall back to Python
  try {
    backendPort = await getFreePort();
    const cfg = readConfig();
    // Use stored keys if available, otherwise CLI uses OAuth from ~/.claude.json
    if (cfg.apiKey) process.env.ANTHROPIC_API_KEY = cfg.apiKey;
    if (cfg.openaiKey) process.env.OPENAI_API_KEY = cfg.openaiKey;
    process.env.WORKSPACE_ROOT = cfg.workspace || app.getPath("home");
    // CLAUDE_RUNTIME_DIR already set by ensureRuntimeDir() above

    bridgeServer = startBridgeServer(backendPort);
    console.log(`Bridge server started on port ${backendPort}`);
  } catch (err) {
    console.error("Bridge server failed, falling back to Python backend:", err);
    try {
      await startBackend();
    } catch (pyErr) {
      console.error("Python backend also failed:", pyErr);
      dialog.showErrorBox("Backend Error", `Failed to start backend:\n${pyErr.message}`);
    }
  }

  // Start SPA static server
  // In dev mode, try Vite first; if renderer/ exists, use static server as fallback
  if (!isDev || fs.existsSync(path.join(__dirname, "renderer", "index.html"))) {
    await startSpaServer();
  }

  createWindow();

  // Request macOS microphone permission AFTER window is created
  console.log("[main] Platform:", process.platform, "systemPreferences exists:", !!systemPreferences);
  console.log("[main] askForMediaAccess exists:", !!(systemPreferences && systemPreferences.askForMediaAccess));
  if (process.platform === "darwin") {
    try {
      const currentStatus = systemPreferences.getMediaAccessStatus("microphone");
      console.log("[main] Current mic status:", currentStatus);
      if (currentStatus !== "granted") {
        console.log("[main] Requesting microphone access...");
        const granted = await systemPreferences.askForMediaAccess("microphone");
        console.log("[main] Microphone permission result:", granted);
      } else {
        console.log("[main] Microphone already granted");
      }
    } catch (e) {
      console.error("[main] Microphone permission error:", e);
    }
  }
});

app.on("window-all-closed", () => {
  if (backendProcess) backendProcess.kill();
  app.quit();
});

app.on("before-quit", () => {
  if (backendProcess) backendProcess.kill();
});
