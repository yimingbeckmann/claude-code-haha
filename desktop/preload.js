const { contextBridge, ipcRenderer } = require("electron");

// Inject config before the SPA loads via a script tag
const backendPort = process.env.CLAW_BACKEND_PORT || "8899";
document.addEventListener("DOMContentLoaded", () => {
  const script = document.createElement("script");
  script.textContent = `window.__CLAW_CONFIG__ = { apiBase: "http://127.0.0.1:${backendPort}", streamBase: "http://127.0.0.1:${backendPort}" };`;
  document.head.prepend(script);
});

contextBridge.exposeInMainWorld("clawDesktop", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  setApiKey: (key) => ipcRenderer.invoke("set-api-key", key),
  getApiKey: () => ipcRenderer.invoke("get-api-key"),
  chooseWorkspace: () => ipcRenderer.invoke("choose-workspace"),
  restartBackend: () => ipcRenderer.invoke("restart-backend"),
  showContextMenu: () => ipcRenderer.send("show-context-menu"),
  onOpenSettings: (cb) => {
    ipcRenderer.on("open-settings", cb);
    return () => ipcRenderer.removeListener("open-settings", cb);
  },
  onNewSession: (cb) => {
    ipcRenderer.on("new-session", cb);
    return () => ipcRenderer.removeListener("new-session", cb);
  },
  // Tools menu
  onToggleKairos: (cb) => {
    ipcRenderer.on("toggle-kairos", cb);
    return () => ipcRenderer.removeListener("toggle-kairos", cb);
  },
  onLaunchSwarm: (cb) => {
    ipcRenderer.on("launch-swarm", cb);
    return () => ipcRenderer.removeListener("launch-swarm", cb);
  },
  onLaunchBuddy: (cb) => {
    ipcRenderer.on("launch-buddy", cb);
    return () => ipcRenderer.removeListener("launch-buddy", cb);
  },
  onLaunchStickers: (cb) => {
    ipcRenderer.on("launch-stickers", cb);
    return () => ipcRenderer.removeListener("launch-stickers", cb);
  },
  onToggleUndercover: (cb) => {
    ipcRenderer.on("toggle-undercover", cb);
    return () => ipcRenderer.removeListener("toggle-undercover", cb);
  },
  // Code menu
  onLaunchUltraReview: (cb) => {
    ipcRenderer.on("launch-ultra-review", cb);
    return () => ipcRenderer.removeListener("launch-ultra-review", cb);
  },
  onLaunchSecurityReview: (cb) => {
    ipcRenderer.on("launch-security-review", cb);
    return () => ipcRenderer.removeListener("launch-security-review", cb);
  },
  onLaunchInitVerifiers: (cb) => {
    ipcRenderer.on("launch-init-verifiers", cb);
    return () => ipcRenderer.removeListener("launch-init-verifiers", cb);
  },
  onLaunchInsights: (cb) => {
    ipcRenderer.on("launch-insights", cb);
    return () => ipcRenderer.removeListener("launch-insights", cb);
  },
  // Session menu
  onSessionFork: (cb) => {
    ipcRenderer.on("session-fork", cb);
    return () => ipcRenderer.removeListener("session-fork", cb);
  },
  onSessionRewind: (cb) => {
    ipcRenderer.on("session-rewind", cb);
    return () => ipcRenderer.removeListener("session-rewind", cb);
  },
  // View menu
  onToggleBriefMode: (cb) => {
    ipcRenderer.on("toggle-brief-mode", cb);
    return () => ipcRenderer.removeListener("toggle-brief-mode", cb);
  },
  platform: process.platform,
});
