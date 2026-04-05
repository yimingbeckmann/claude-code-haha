import { useState, useCallback, useEffect, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Settings {
  theme: string;
  fontSize: number;
  reducedMotion: boolean;
  apiKeys: Record<string, string>;
  defaultModel: string;
  effortLevel: string;
  permissionMode: string;
  permissionRules: Array<{ tool: string; rule: string }>;
  clawMd: string;
  autoMemory: boolean;
  keyBindings: Array<{ key: string; action: string }>;
  mcpServers: Array<{ name: string; url: string; type: string; enabled: boolean }>;
  telemetry: boolean;
  dataSharing: boolean;
  version: string;
  platform: string;
  editorMode: string;
  language: string;
  outputStyle: string;
  thinkingMode: boolean;
  autoCompact: boolean;
  notifChannel: string;
}

export interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  sessionId?: string;
  model?: string;
  cwd?: string;
  connected?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  contextPercent?: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

type TabId = 'general' | 'model' | 'permissions' | 'tools' | 'memory' | 'advanced' | 'status';

interface TabDef {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { id: 'general', label: 'General', icon: '\u2699' },
  { id: 'model', label: 'Model', icon: '\u2726' },
  { id: 'permissions', label: 'Permissions', icon: '\u26BF' },
  { id: 'tools', label: 'Tools', icon: '\u2692' },
  { id: 'memory', label: 'Memory', icon: '\u2B59' },
  { id: 'advanced', label: 'Advanced', icon: '\u2318' },
  { id: 'status', label: 'Status', icon: '\u25C9' },
];

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet' },
  { value: 'claude-opus-4-6', label: 'Claude Opus' },
  { value: 'claude-haiku-4', label: 'Claude Haiku' },
];

const EFFORT_DESCRIPTIONS: Record<string, string> = {
  low: 'Faster responses, less detail. Good for simple tasks.',
  medium: 'Balanced speed and depth. Recommended for most tasks.',
  high: 'Thorough analysis, slower responses. Best for complex work.',
};

const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  ask: 'Ask before executing any tool that modifies files or runs commands.',
  'auto-accept': 'Automatically approve all tool calls without confirmation.',
  plan: 'Show a plan before execution and ask for approval.',
  bypass: 'Skip all permission checks. Use with caution.',
};

const THEME_SWATCHES: Record<string, { bg: string; fg: string; accent: string }> = {
  dark: { bg: '#1a1a2e', fg: '#e0e0e0', accent: '#7c3aed' },
  light: { bg: '#fafafa', fg: '#1a1a1a', accent: '#6d28d9' },
  'high-contrast': { bg: '#000000', fg: '#ffffff', accent: '#fbbf24' },
  system: { bg: 'linear-gradient(135deg, #fafafa 50%, #1a1a2e 50%)', fg: '#888', accent: '#7c3aed' },
};

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ko', label: 'Korean' },
  { value: 'pt', label: 'Portuguese' },
];

const TOOL_OPTIONS = [
  'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'Agent', 'NotebookEdit',
];

const ACTION_OPTIONS = [
  { value: 'submit', label: 'Submit message' },
  { value: 'newline', label: 'New line' },
  { value: 'clear', label: 'Clear input' },
  { value: 'cancel', label: 'Cancel' },
  { value: 'settings', label: 'Open settings' },
  { value: 'escape', label: 'Close dialog' },
];

/* ------------------------------------------------------------------ */
/*  CSS-in-JS styles (injected via <style> tag)                        */
/* ------------------------------------------------------------------ */

const SETTINGS_CSS = `
.sd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  animation: sd-fadeIn 0.15s ease;
}
@keyframes sd-fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.sd-modal {
  width: min(960px, 92vw);
  height: min(680px, 88vh);
  background: var(--bg-primary, #0f0f1a);
  border: 1px solid var(--border, #2a2a3e);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  font-family: var(--font-mono, 'SF Mono', 'Fira Code', monospace);
  font-size: 13px;
  color: var(--text-primary, #e0e0e0);
}
.sd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 46px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border, #2a2a3e);
  flex-shrink: 0;
}
.sd-header-title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.sd-close-btn {
  background: none;
  border: none;
  color: var(--text-muted, #888);
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
  font-family: var(--font-mono, monospace);
}
.sd-close-btn:hover {
  background: var(--bg-hover, #1e1e30);
  color: var(--text-primary, #e0e0e0);
}
.sd-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.sd-sidebar {
  width: 180px;
  flex-shrink: 0;
  background: var(--bg-secondary, #12121f);
  border-right: 1px solid var(--border, #2a2a3e);
  overflow-y: auto;
  padding: 8px 0;
}
.sd-tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  background: transparent;
  color: var(--text-muted, #888);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  font-weight: 400;
  border: none;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.sd-tab-btn:hover {
  background: var(--bg-hover, #1e1e30);
  color: var(--text-primary, #e0e0e0);
}
.sd-tab-btn.active {
  background: var(--bg-hover, #1e1e30);
  color: var(--text-primary, #e0e0e0);
  font-weight: 600;
  border-left: 2px solid var(--accent, #7c3aed);
  padding-left: 14px;
}
.sd-tab-icon {
  font-size: 14px;
  width: 18px;
  text-align: center;
  flex-shrink: 0;
}
.sd-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px 48px;
}
.sd-content::-webkit-scrollbar {
  width: 6px;
}
.sd-content::-webkit-scrollbar-thumb {
  background: var(--border, #2a2a3e);
  border-radius: 3px;
}
.sd-section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary, #e0e0e0);
  margin: 0 0 16px;
}
.sd-subtitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
  margin: 24px 0 10px;
}
.sd-label {
  display: block;
  font-size: 12px;
  color: var(--text-muted, #888);
  margin-bottom: 4px;
}
.sd-desc {
  font-size: 11px;
  color: var(--text-muted, #888);
  margin-top: 2px;
}
.sd-field {
  margin-bottom: 16px;
}
.sd-input {
  width: 100%;
  background: var(--bg-tertiary, #181828);
  border: 1px solid var(--border, #2a2a3e);
  border-radius: 4px;
  padding: 7px 10px;
  color: var(--text-primary, #e0e0e0);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.sd-input:focus {
  border-color: var(--accent, #7c3aed);
}
.sd-textarea {
  width: 100%;
  background: var(--bg-tertiary, #181828);
  border: 1px solid var(--border, #2a2a3e);
  border-radius: 4px;
  padding: 8px 10px;
  color: var(--text-primary, #e0e0e0);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  outline: none;
  resize: vertical;
  min-height: 120px;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.sd-textarea:focus {
  border-color: var(--accent, #7c3aed);
}
.sd-select {
  width: 100%;
  background: var(--bg-tertiary, #181828);
  border: 1px solid var(--border, #2a2a3e);
  border-radius: 4px;
  padding: 7px 10px;
  color: var(--text-primary, #e0e0e0);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
  cursor: pointer;
}
.sd-select:focus {
  border-color: var(--accent, #7c3aed);
}
.sd-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}
.sd-row-label {
  font-size: 12px;
  font-weight: 500;
}
.sd-toggle {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  border: 1px solid var(--border, #2a2a3e);
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  transition: background 0.15s;
}
.sd-toggle.on {
  background: var(--accent, #7c3aed);
}
.sd-toggle.off {
  background: var(--bg-tertiary, #181828);
}
.sd-toggle-dot {
  position: absolute;
  top: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text-primary, #e0e0e0);
  transition: left 0.15s;
}
.sd-toggle.on .sd-toggle-dot {
  left: 18px;
}
.sd-toggle.off .sd-toggle-dot {
  left: 2px;
}
.sd-btn {
  border: none;
  border-radius: 4px;
  padding: 6px 14px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.1s;
}
.sd-btn:hover { opacity: 0.85; }
.sd-btn-primary {
  background: var(--accent, #7c3aed);
  color: #fff;
}
.sd-btn-danger {
  background: #dc2626;
  color: #fff;
}
.sd-btn-outline {
  background: transparent;
  color: var(--text-primary, #e0e0e0);
  border: 1px solid var(--border, #2a2a3e);
}
.sd-btn-small {
  padding: 4px 10px;
  font-size: 11px;
}
.sd-card {
  background: var(--bg-secondary, #12121f);
  border: 1px solid var(--border, #2a2a3e);
  border-radius: 6px;
  padding: 14px;
  margin-bottom: 12px;
}
.sd-card-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sd-mono {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--text-muted, #888);
  background: var(--bg-tertiary, #181828);
  padding: 2px 6px;
  border-radius: 3px;
}
.sd-swatch-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.sd-swatch {
  width: 100px;
  height: 64px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 10px;
  transition: transform 0.1s;
  border: 2px solid var(--border, #2a2a3e);
}
.sd-swatch:hover { transform: scale(1.04); }
.sd-swatch.active {
  border-color: var(--accent, #7c3aed);
  box-shadow: 0 0 0 1px var(--accent, #7c3aed);
}
.sd-slider-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}
.sd-slider-wrap input[type="range"] {
  flex: 1;
  accent-color: var(--accent, #7c3aed);
  height: 4px;
}
.sd-slider-val {
  min-width: 32px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
  background: var(--bg-tertiary, #181828);
  padding: 2px 6px;
  border-radius: 3px;
}
.sd-radio-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sd-radio-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid var(--border, #2a2a3e);
  transition: border-color 0.1s, background 0.1s;
}
.sd-radio-item:hover {
  background: var(--bg-hover, #1e1e30);
}
.sd-radio-item.active {
  border-color: var(--accent, #7c3aed);
  background: rgba(124, 58, 237, 0.08);
}
.sd-radio-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--border, #2a2a3e);
  flex-shrink: 0;
  margin-top: 1px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sd-radio-item.active .sd-radio-dot {
  border-color: var(--accent, #7c3aed);
}
.sd-radio-dot-inner {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent, #7c3aed);
  display: none;
}
.sd-radio-item.active .sd-radio-dot-inner {
  display: block;
}
.sd-list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--bg-secondary, #12121f);
  border: 1px solid var(--border, #2a2a3e);
  border-radius: 4px;
  margin-bottom: 6px;
}
.sd-list-item-grow { flex: 1; }
.sd-bar-track {
  width: 100%;
  height: 8px;
  background: var(--bg-tertiary, #181828);
  border-radius: 4px;
  overflow: hidden;
}
.sd-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}
.sd-info-grid {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 8px 16px;
  font-size: 12px;
}
.sd-info-label {
  color: var(--text-muted, #888);
}
.sd-info-value {
  color: var(--text-primary, #e0e0e0);
  font-weight: 500;
}
.sd-divider {
  height: 1px;
  background: var(--border, #2a2a3e);
  margin: 20px 0;
}
.sd-password-wrap {
  position: relative;
}
.sd-password-wrap .sd-reveal-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-muted, #888);
  cursor: pointer;
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  padding: 2px 6px;
  border-radius: 3px;
}
.sd-password-wrap .sd-reveal-btn:hover {
  color: var(--text-primary, #e0e0e0);
  background: var(--bg-hover, #1e1e30);
}
.sd-status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}
.sd-status-dot.connected { background: #22c55e; }
.sd-status-dot.disconnected { background: #dc2626; }
`;

/* ------------------------------------------------------------------ */
/*  Toggle component                                                   */
/* ------------------------------------------------------------------ */

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      className={`sd-toggle ${value ? 'on' : 'off'}`}
      onClick={() => onChange(!value)}
    >
      <div className="sd-toggle-dot" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: General                                                       */
/* ------------------------------------------------------------------ */

function GeneralTab({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div>
      <h2 className="sd-section-title">Appearance</h2>

      <div className="sd-field">
        <label className="sd-label">Theme</label>
        <div className="sd-swatch-row">
          {Object.entries(THEME_SWATCHES).map(([mode, swatch]) => (
            <div
              key={mode}
              className={`sd-swatch ${settings.theme === mode ? 'active' : ''}`}
              onClick={() => set('theme', mode)}
              style={{
                background: swatch.bg.startsWith('linear') ? swatch.bg : swatch.bg,
              }}
            >
              <div style={{
                width: 20,
                height: 3,
                borderRadius: 2,
                background: swatch.accent,
              }} />
              <span style={{ color: swatch.fg, fontWeight: 600 }}>
                {mode.charAt(0).toUpperCase() + mode.slice(1).replace('-', ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="sd-field">
        <label className="sd-label">Font size ({settings.fontSize}px)</label>
        <div className="sd-slider-wrap">
          <input
            type="range"
            min={10}
            max={20}
            value={settings.fontSize}
            onChange={(e) => set('fontSize', parseInt(e.target.value))}
          />
          <span className="sd-slider-val">{settings.fontSize}</span>
        </div>
      </div>

      <div className="sd-field">
        <label className="sd-label">Language</label>
        <select
          className="sd-select"
          value={settings.language}
          onChange={(e) => set('language', e.target.value)}
        >
          {LANGUAGE_OPTIONS.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>

      <div className="sd-field">
        <label className="sd-label">Output style</label>
        <select
          className="sd-select"
          value={settings.outputStyle}
          onChange={(e) => set('outputStyle', e.target.value)}
        >
          <option value="normal">Normal</option>
          <option value="verbose">Verbose</option>
          <option value="compact">Compact</option>
        </select>
      </div>

      <div className="sd-divider" />
      <h2 className="sd-section-title">Behavior</h2>

      <div className="sd-row">
        <div>
          <div className="sd-row-label">Reduced motion</div>
          <div className="sd-desc">Minimize animations throughout the interface</div>
        </div>
        <Toggle value={settings.reducedMotion} onChange={(v) => set('reducedMotion', v)} />
      </div>

      <div className="sd-row">
        <div>
          <div className="sd-row-label">Auto-compact</div>
          <div className="sd-desc">Automatically compact context when nearing the limit</div>
        </div>
        <Toggle value={settings.autoCompact} onChange={(v) => set('autoCompact', v)} />
      </div>

      <div className="sd-field" style={{ marginTop: 12 }}>
        <label className="sd-label">Notification channel</label>
        <select
          className="sd-select"
          value={settings.notifChannel}
          onChange={(e) => set('notifChannel', e.target.value)}
        >
          <option value="auto">Auto</option>
          <option value="sound">Sound</option>
          <option value="visual">Visual</option>
          <option value="none">None</option>
        </select>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Model                                                         */
/* ------------------------------------------------------------------ */

function ModelTab({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const [showApiKey, setShowApiKey] = useState(false);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  const apiKey = settings.apiKeys?.anthropic || '';
  const masked = showApiKey ? apiKey : apiKey ? '\u2022'.repeat(Math.min(apiKey.length, 32)) : '';

  return (
    <div>
      <h2 className="sd-section-title">Model Configuration</h2>

      <div className="sd-field">
        <label className="sd-label">Default model</label>
        <select
          className="sd-select"
          value={settings.defaultModel}
          onChange={(e) => set('defaultModel', e.target.value)}
        >
          {MODEL_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="sd-field">
        <label className="sd-label">Effort level</label>
        <div className="sd-radio-group">
          {(['low', 'medium', 'high'] as const).map((level) => (
            <div
              key={level}
              className={`sd-radio-item ${settings.effortLevel === level ? 'active' : ''}`}
              onClick={() => set('effortLevel', level)}
            >
              <div className="sd-radio-dot">
                <div className="sd-radio-dot-inner" />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>
                  {level}
                </div>
                <div className="sd-desc">{EFFORT_DESCRIPTIONS[level]}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sd-row">
        <div>
          <div className="sd-row-label">Thinking mode</div>
          <div className="sd-desc">Enable extended thinking for complex reasoning</div>
        </div>
        <Toggle value={settings.thinkingMode} onChange={(v) => set('thinkingMode', v)} />
      </div>

      <div className="sd-divider" />
      <h2 className="sd-section-title">API Key</h2>

      <div className="sd-field">
        <label className="sd-label">Anthropic API key</label>
        <div className="sd-password-wrap">
          <input
            className="sd-input"
            type={showApiKey ? 'text' : 'password'}
            placeholder="sk-ant-..."
            value={apiKey}
            onChange={(e) => set('apiKeys', { ...settings.apiKeys, anthropic: e.target.value })}
            style={{ paddingRight: 60 }}
          />
          <button
            className="sd-reveal-btn"
            onClick={() => setShowApiKey(!showApiKey)}
          >
            {showApiKey ? 'Hide' : 'Show'}
          </button>
        </div>
        <div className="sd-desc" style={{ marginTop: 4 }}>
          Used for direct API access. Leave blank to use the default authentication.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Permissions                                                   */
/* ------------------------------------------------------------------ */

function PermissionsTab({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const [newTool, setNewTool] = useState('Bash');
  const [newRule, setNewRule] = useState('allow');

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  const addRule = () => {
    const rules = [...settings.permissionRules, { tool: newTool, rule: newRule }];
    set('permissionRules', rules);
  };

  const removeRule = (idx: number) => {
    const rules = settings.permissionRules.filter((_, i) => i !== idx);
    set('permissionRules', rules);
  };

  return (
    <div>
      <h2 className="sd-section-title">Permission Mode</h2>

      <div className="sd-field">
        <div className="sd-radio-group">
          {(['ask', 'auto-accept', 'plan', 'bypass'] as const).map((mode) => (
            <div
              key={mode}
              className={`sd-radio-item ${settings.permissionMode === mode ? 'active' : ''}`}
              onClick={() => set('permissionMode', mode)}
            >
              <div className="sd-radio-dot">
                <div className="sd-radio-dot-inner" />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1).replace('-', ' ')}
                </div>
                <div className="sd-desc">{PERMISSION_DESCRIPTIONS[mode]}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sd-divider" />
      <h2 className="sd-section-title">Permission Rules</h2>
      <p className="sd-desc" style={{ marginBottom: 12 }}>
        Define per-tool permission overrides. These take precedence over the global mode.
      </p>

      {settings.permissionRules.map((rule, idx) => (
        <div key={idx} className="sd-list-item">
          <span className="sd-mono" style={{ minWidth: 80 }}>{rule.tool}</span>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: rule.rule === 'allow' ? '#22c55e' : rule.rule === 'deny' ? '#dc2626' : 'var(--accent)',
            textTransform: 'uppercase',
          }}>
            {rule.rule}
          </span>
          <div className="sd-list-item-grow" />
          <button
            className="sd-btn sd-btn-outline sd-btn-small"
            onClick={() => removeRule(idx)}
          >
            Remove
          </button>
        </div>
      ))}

      <h3 className="sd-subtitle">Add rule</h3>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label className="sd-label">Tool</label>
          <select className="sd-select" value={newTool} onChange={(e) => setNewTool(e.target.value)}>
            {TOOL_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label className="sd-label">Rule</label>
          <select className="sd-select" value={newRule} onChange={(e) => setNewRule(e.target.value)}>
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
            <option value="ask">Ask</option>
          </select>
        </div>
        <button className="sd-btn sd-btn-primary sd-btn-small" onClick={addRule}>
          Add
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Tools                                                         */
/* ------------------------------------------------------------------ */

function ToolsTab({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [newServer, setNewServer] = useState({ name: '', url: '', type: 'stdio', enabled: true });

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  const addServer = () => {
    if (!newServer.name || !newServer.url) return;
    set('mcpServers', [...settings.mcpServers, { ...newServer }]);
    setNewServer({ name: '', url: '', type: 'stdio', enabled: true });
  };

  const removeServer = (idx: number) => {
    set('mcpServers', settings.mcpServers.filter((_, i) => i !== idx));
  };

  const toggleServer = (idx: number) => {
    const servers = [...settings.mcpServers];
    servers[idx] = { ...servers[idx], enabled: !servers[idx].enabled };
    set('mcpServers', servers);
  };

  return (
    <div>
      <h2 className="sd-section-title">MCP Servers</h2>
      <p className="sd-desc" style={{ marginBottom: 16 }}>
        Model Context Protocol servers extend available tools.
      </p>

      {settings.mcpServers.map((server, idx) => (
        <div key={idx} className="sd-card">
          <div className="sd-card-row">
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{server.name}</div>
              <div className="sd-desc">{server.url}</div>
              <div className="sd-mono" style={{ marginTop: 4 }}>{server.type}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Toggle value={server.enabled} onChange={() => toggleServer(idx)} />
              <button
                className="sd-btn sd-btn-outline sd-btn-small"
                onClick={() => removeServer(idx)}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}

      <h3 className="sd-subtitle">Add server</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label className="sd-label">Name</label>
            <input
              className="sd-input"
              placeholder="my-server"
              value={newServer.name}
              onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
            />
          </div>
          <div style={{ flex: 2 }}>
            <label className="sd-label">URL</label>
            <input
              className="sd-input"
              placeholder="http://localhost:3000 or npx ..."
              value={newServer.url}
              onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label className="sd-label">Type</label>
            <select
              className="sd-select"
              value={newServer.type}
              onChange={(e) => setNewServer({ ...newServer, type: e.target.value })}
            >
              <option value="stdio">stdio</option>
              <option value="remote">remote</option>
            </select>
          </div>
          <button className="sd-btn sd-btn-primary" onClick={addServer}>
            Add server
          </button>
        </div>
      </div>

      <div className="sd-divider" />
      <h2 className="sd-section-title">Editor</h2>

      <div className="sd-field">
        <label className="sd-label">Editor mode</label>
        <select
          className="sd-select"
          value={settings.editorMode}
          onChange={(e) => set('editorMode', e.target.value)}
        >
          <option value="normal">Normal</option>
          <option value="vim">Vim</option>
        </select>
        <div className="sd-desc" style={{ marginTop: 4 }}>
          Vim mode enables vi-style keybindings in the input area.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Memory                                                        */
/* ------------------------------------------------------------------ */

function MemoryTab({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div>
      <h2 className="sd-section-title">Memory</h2>

      <div className="sd-row">
        <div>
          <div className="sd-row-label">Auto-memory</div>
          <div className="sd-desc">Automatically save context and preferences across sessions</div>
        </div>
        <Toggle value={settings.autoMemory} onChange={(v) => set('autoMemory', v)} />
      </div>

      <div className="sd-divider" />
      <h2 className="sd-section-title">CLAW.md</h2>
      <p className="sd-desc" style={{ marginBottom: 12 }}>
        Project-level instructions loaded at session start. Edits are saved automatically.
      </p>

      <div className="sd-field">
        <textarea
          className="sd-textarea"
          style={{ minHeight: 280, fontFamily: 'var(--font-mono)' }}
          placeholder="# Project instructions&#10;&#10;Add custom instructions, context, and rules here..."
          value={settings.clawMd}
          onChange={(e) => set('clawMd', e.target.value)}
        />
      </div>

      <div className="sd-desc">
        Tip: Use Markdown formatting. The content is prepended to every conversation.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Advanced                                                      */
/* ------------------------------------------------------------------ */

function AdvancedTab({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const [newKey, setNewKey] = useState('');
  const [newAction, setNewAction] = useState('submit');

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  const addBinding = () => {
    if (!newKey) return;
    set('keyBindings', [...settings.keyBindings, { key: newKey, action: newAction }]);
    setNewKey('');
  };

  const removeBinding = (idx: number) => {
    set('keyBindings', settings.keyBindings.filter((_, i) => i !== idx));
  };

  const handleResetDefaults = () => {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      onChange({
        theme: 'system',
        fontSize: 13,
        reducedMotion: false,
        apiKeys: {},
        defaultModel: 'claude-sonnet-4-6',
        effortLevel: 'medium',
        permissionMode: 'ask',
        permissionRules: [],
        clawMd: '',
        autoMemory: true,
        keyBindings: [],
        mcpServers: [],
        telemetry: true,
        dataSharing: false,
        version: settings.version,
        platform: settings.platform,
        editorMode: 'normal',
        language: 'en',
        outputStyle: 'normal',
        thinkingMode: false,
        autoCompact: true,
        notifChannel: 'auto',
      });
    }
  };

  return (
    <div>
      <h2 className="sd-section-title">Privacy</h2>

      <div className="sd-row">
        <div>
          <div className="sd-row-label">Telemetry</div>
          <div className="sd-desc">Send anonymous usage data to help improve the product</div>
        </div>
        <Toggle value={settings.telemetry} onChange={(v) => set('telemetry', v)} />
      </div>

      <div className="sd-row">
        <div>
          <div className="sd-row-label">Data sharing</div>
          <div className="sd-desc">Allow conversations to be used for model improvement</div>
        </div>
        <Toggle value={settings.dataSharing} onChange={(v) => set('dataSharing', v)} />
      </div>

      <div className="sd-divider" />
      <h2 className="sd-section-title">Key Bindings</h2>

      {settings.keyBindings.map((binding, idx) => (
        <div key={idx} className="sd-list-item">
          <span className="sd-mono" style={{ minWidth: 100 }}>{binding.key}</span>
          <span style={{ fontSize: 12 }}>{binding.action}</span>
          <div className="sd-list-item-grow" />
          <button
            className="sd-btn sd-btn-outline sd-btn-small"
            onClick={() => removeBinding(idx)}
          >
            Remove
          </button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          <label className="sd-label">Key combination</label>
          <input
            className="sd-input"
            placeholder="e.g. Ctrl+Enter"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="sd-label">Action</label>
          <select className="sd-select" value={newAction} onChange={(e) => setNewAction(e.target.value)}>
            {ACTION_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>
        <button className="sd-btn sd-btn-primary sd-btn-small" onClick={addBinding}>
          Add
        </button>
      </div>

      <div className="sd-divider" />
      <h2 className="sd-section-title">System Information</h2>

      <div className="sd-info-grid">
        <span className="sd-info-label">Version</span>
        <span className="sd-info-value">{settings.version || 'Unknown'}</span>
        <span className="sd-info-label">Platform</span>
        <span className="sd-info-value">{settings.platform || 'Unknown'}</span>
      </div>

      <div className="sd-divider" />

      <button className="sd-btn sd-btn-danger" onClick={handleResetDefaults}>
        Reset to defaults
      </button>
      <div className="sd-desc" style={{ marginTop: 6 }}>
        Revert all settings to their default values.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Status                                                        */
/* ------------------------------------------------------------------ */

function StatusTab(props: {
  connected?: boolean;
  sessionId?: string;
  model?: string;
  cwd?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  contextPercent?: number;
}) {
  const contextPct = Math.min(props.contextPercent ?? 0, 100);
  const barColor = contextPct > 80 ? '#dc2626' : contextPct > 60 ? '#f59e0b' : 'var(--accent, #7c3aed)';

  return (
    <div>
      <h2 className="sd-section-title">Session Status</h2>

      <div className="sd-card">
        <div className="sd-card-row">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className={`sd-status-dot ${props.connected ? 'connected' : 'disconnected'}`} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {props.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      <div className="sd-info-grid" style={{ marginTop: 16 }}>
        <span className="sd-info-label">Session ID</span>
        <span className="sd-mono" style={{ fontSize: 10, wordBreak: 'break-all' }}>
          {props.sessionId || 'N/A'}
        </span>
        <span className="sd-info-label">Current model</span>
        <span className="sd-info-value">{props.model || 'N/A'}</span>
        <span className="sd-info-label">Working directory</span>
        <span className="sd-mono" style={{ fontSize: 10, wordBreak: 'break-all' }}>
          {props.cwd || 'N/A'}
        </span>
      </div>

      <div className="sd-divider" />
      <h2 className="sd-section-title">Token Usage</h2>

      <div className="sd-info-grid">
        <span className="sd-info-label">Input tokens</span>
        <span className="sd-info-value">{(props.inputTokens ?? 0).toLocaleString()}</span>
        <span className="sd-info-label">Output tokens</span>
        <span className="sd-info-value">{(props.outputTokens ?? 0).toLocaleString()}</span>
        <span className="sd-info-label">Estimated cost</span>
        <span className="sd-info-value" style={{ color: '#22c55e' }}>
          ${(props.costUsd ?? 0).toFixed(4)}
        </span>
      </div>

      <div className="sd-divider" />
      <h2 className="sd-section-title">Context Window</h2>

      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="sd-desc">Usage</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{contextPct.toFixed(1)}%</span>
        </div>
        <div className="sd-bar-track">
          <div
            className="sd-bar-fill"
            style={{ width: `${contextPct}%`, background: barColor }}
          />
        </div>
      </div>
      <div className="sd-desc">
        {contextPct > 80
          ? 'Context window is nearly full. Consider compacting the conversation.'
          : contextPct > 50
          ? 'Context usage is moderate.'
          : 'Context window has plenty of room.'}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Settings Dialog                                               */
/* ------------------------------------------------------------------ */

export default function SettingsDialog({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  sessionId,
  model,
  cwd,
  connected,
  inputTokens,
  outputTokens,
  costUsd,
  contextPercent,
}: SettingsDialogProps) {
  const [tab, setTab] = useState<TabId>('general');
  const styleRef = useRef<HTMLStyleElement | null>(null);

  // Inject CSS on mount, remove on unmount
  useEffect(() => {
    if (!styleRef.current) {
      const style = document.createElement('style');
      style.setAttribute('data-settings-dialog', '');
      style.textContent = SETTINGS_CSS;
      document.head.appendChild(style);
      styleRef.current = style;
    }
    return () => {
      if (styleRef.current) {
        document.head.removeChild(styleRef.current);
        styleRef.current = null;
      }
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const renderContent = () => {
    switch (tab) {
      case 'general':
        return <GeneralTab settings={settings} onChange={onSettingsChange} />;
      case 'model':
        return <ModelTab settings={settings} onChange={onSettingsChange} />;
      case 'permissions':
        return <PermissionsTab settings={settings} onChange={onSettingsChange} />;
      case 'tools':
        return <ToolsTab settings={settings} onChange={onSettingsChange} />;
      case 'memory':
        return <MemoryTab settings={settings} onChange={onSettingsChange} />;
      case 'advanced':
        return <AdvancedTab settings={settings} onChange={onSettingsChange} />;
      case 'status':
        return (
          <StatusTab
            connected={connected}
            sessionId={sessionId}
            model={model}
            cwd={cwd}
            inputTokens={inputTokens}
            outputTokens={outputTokens}
            costUsd={costUsd}
            contextPercent={contextPercent}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="sd-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sd-modal">
        {/* Header */}
        <div className="sd-header">
          <span className="sd-header-title">Settings</span>
          <button className="sd-close-btn" onClick={onClose} title="Close (Esc)">
            &times;
          </button>
        </div>

        {/* Body: Sidebar + Content */}
        <div className="sd-body">
          <nav className="sd-sidebar">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`sd-tab-btn ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <span className="sd-tab-icon">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>

          <div className="sd-content">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
