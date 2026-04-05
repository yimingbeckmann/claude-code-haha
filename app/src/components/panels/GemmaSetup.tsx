import { useState, useEffect, useCallback, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface GemmaSetupProps {
  onClose: () => void;
  onComplete: (config: { model: string; endpoint: string }) => void;
}

interface ModelVariant {
  id: string;
  tag: string;
  label: string;
  description: string;
  ram: string;
  ramGb: number;
}

type Step = 'check-ollama' | 'install-ollama' | 'pick-model' | 'pulling' | 'testing' | 'done';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const OLLAMA_ENDPOINT = 'http://localhost:11434';

const MODEL_VARIANTS: ModelVariant[] = [
  {
    id: 'e2b',
    tag: 'gemma4:e2b',
    label: 'Edge 2B',
    description: 'Lightest, good for basic tasks',
    ram: '~10 GB',
    ramGb: 10,
  },
  {
    id: 'e4b',
    tag: 'gemma4:e4b',
    label: 'Edge 4B',
    description: 'Great balance, supports audio',
    ram: '~12 GB',
    ramGb: 12,
  },
  {
    id: '26b-a4b',
    tag: 'gemma4:26b-a4b',
    label: '26B MoE',
    description: 'Best quality/speed ratio',
    ram: '~22 GB',
    ramGb: 22,
  },
  {
    id: '31b',
    tag: 'gemma4:31b',
    label: '31B Dense',
    description: 'Highest quality',
    ram: '~24 GB',
    ramGb: 24,
  },
];

/* ------------------------------------------------------------------ */
/*  Shell helper                                                       */
/* ------------------------------------------------------------------ */

const runCommand = async (
  cmd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  if ((window as any).electronAPI?.runCommand) {
    return (window as any).electronAPI.runCommand(cmd);
  }
  throw new Error('Shell access not available');
};

/* ------------------------------------------------------------------ */
/*  CSS                                                                */
/* ------------------------------------------------------------------ */

const CSS = `
.gemma-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.gemma-dialog {
  display: flex;
  flex-direction: column;
  width: 560px;
  max-width: 94vw;
  max-height: 82vh;
  background: var(--bg-primary, #0a0a12);
  border-radius: 12px;
  border: 1px solid var(--border, #2a2a3e);
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  color: #e4e4ed;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  animation: gemma-appear 0.2s ease-out;
}

@keyframes gemma-appear {
  from { transform: translateY(12px) scale(0.97); opacity: 0; }
  to   { transform: translateY(0) scale(1); opacity: 1; }
}

.gemma-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, #2a2a3e);
  flex-shrink: 0;
}

.gemma-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #e4e4ed);
  display: flex;
  align-items: center;
  gap: 8px;
}

.gemma-close {
  background: none;
  border: none;
  cursor: pointer;
  color: #6a6a82;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: color 0.15s;
}
.gemma-close:hover { color: #e4e4ed; }

.gemma-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 20px;
}
.gemma-body::-webkit-scrollbar { width: 5px; }
.gemma-body::-webkit-scrollbar-track { background: transparent; }
.gemma-body::-webkit-scrollbar-thumb { background: #2a2a3e; border-radius: 3px; }

/* Step indicator */
.gemma-steps {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 24px;
  padding: 0 4px;
}

.gemma-step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bg-tertiary, #2a2a3e);
  flex-shrink: 0;
  transition: background 0.25s, box-shadow 0.25s;
}
.gemma-step-dot.active {
  background: var(--accent, #f97316);
  box-shadow: 0 0 8px rgba(249, 115, 22, 0.4);
}
.gemma-step-dot.done {
  background: #22c55e;
}

.gemma-step-line {
  flex: 1;
  height: 2px;
  background: var(--bg-tertiary, #2a2a3e);
  transition: background 0.25s;
}
.gemma-step-line.done {
  background: #22c55e;
}

/* Section titles and text */
.gemma-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary, #e4e4ed);
  margin: 0 0 8px;
}
.gemma-subtitle {
  font-size: 13px;
  color: var(--text-muted, #9898b0);
  margin: 0 0 20px;
  line-height: 1.5;
}

/* Model cards */
.gemma-model-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gemma-model-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: #0f0f1a;
  border: 2px solid #1e1e32;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.gemma-model-card:hover {
  border-color: #3a3a52;
  background: #13132a;
}
.gemma-model-card.selected {
  border-color: var(--accent, #f97316);
  background: rgba(249, 115, 22, 0.06);
}

.gemma-model-radio {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #3a3a52;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s;
}
.gemma-model-card.selected .gemma-model-radio {
  border-color: var(--accent, #f97316);
}
.gemma-model-radio-inner {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: transparent;
  transition: background 0.15s;
}
.gemma-model-card.selected .gemma-model-radio-inner {
  background: var(--accent, #f97316);
}

.gemma-model-info {
  flex: 1;
  min-width: 0;
}
.gemma-model-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #e4e4ed);
  margin-bottom: 2px;
}
.gemma-model-desc {
  font-size: 12px;
  color: #7a7a96;
}

.gemma-model-ram {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #9898b0);
  background: #1a1a2e;
  padding: 3px 8px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Progress bar */
.gemma-progress-wrap {
  margin: 16px 0;
}
.gemma-progress-bar-outer {
  height: 6px;
  border-radius: 3px;
  background: #1a1a2e;
  overflow: hidden;
}
.gemma-progress-bar-inner {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--accent, #f97316), #fb923c);
  transition: width 0.3s ease;
}

.gemma-progress-text {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #7a7a96;
  margin-top: 8px;
}

/* Log output */
.gemma-log {
  background: #0a0a14;
  border: 1px solid #1e1e32;
  border-radius: 6px;
  padding: 12px;
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 11px;
  color: var(--text-muted, #9898b0);
  max-height: 120px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.6;
  margin-top: 12px;
}
.gemma-log::-webkit-scrollbar { width: 4px; }
.gemma-log::-webkit-scrollbar-track { background: transparent; }
.gemma-log::-webkit-scrollbar-thumb { background: #2a2a3e; border-radius: 2px; }

/* Code block for instructions */
.gemma-code {
  display: block;
  background: #0f0f1a;
  border: 1px solid #1e1e32;
  border-radius: 6px;
  padding: 12px 14px;
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 13px;
  color: var(--accent, #f97316);
  margin: 12px 0;
  user-select: all;
  cursor: text;
}

/* Buttons */
.gemma-btn-row {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.gemma-btn {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid var(--border, #2a2a3e);
  background: #1a1a2e;
  color: var(--text-primary, #e4e4ed);
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.gemma-btn:hover { border-color: #3a3a52; background: #22223a; }
.gemma-btn:disabled { opacity: 0.4; cursor: default; }

.gemma-btn-primary {
  background: var(--accent, #f97316);
  border-color: var(--accent, #f97316);
  color: #fff;
  font-weight: 600;
}
.gemma-btn-primary:hover { background: #ea6c10; border-color: #ea6c10; }
.gemma-btn-primary:disabled { background: var(--accent, #f97316); border-color: var(--accent, #f97316); opacity: 0.4; }

/* Status indicators */
.gemma-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 12px 14px;
  border-radius: 6px;
  margin-bottom: 16px;
}
.gemma-status-checking {
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}
.gemma-status-success {
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.2);
  color: #22c55e;
}
.gemma-status-error {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.gemma-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.gemma-status-dot-spin {
  animation: gemma-pulse 1s ease-in-out infinite;
}
@keyframes gemma-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* Success done state */
.gemma-success-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(34, 197, 94, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.gemma-done-summary {
  text-align: center;
  margin-bottom: 24px;
}
.gemma-done-summary dt {
  font-size: 11px;
  color: #6a6a82;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 2px;
}
.gemma-done-summary dd {
  font-size: 14px;
  color: var(--text-primary, #e4e4ed);
  font-weight: 500;
  margin: 0 0 12px;
  font-family: "JetBrains Mono", "Fira Code", monospace;
}

/* Manual mode banner */
.gemma-manual-banner {
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 6px;
  padding: 12px 14px;
  font-size: 12px;
  color: #60a5fa;
  margin-bottom: 16px;
  line-height: 1.5;
}
`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function GemmaSetup({ onClose, onComplete }: GemmaSetupProps) {
  const [step, setStep] = useState<Step>('check-ollama');
  const [selectedModel, setSelectedModel] = useState<ModelVariant>(MODEL_VARIANTS[0]);
  const [pullProgress, setPullProgress] = useState(0);
  const [pullLog, setPullLog] = useState('');
  const [testOutput, setTestOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);
  const pullIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ---- Auto-scroll log ---- */
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [pullLog, testOutput]);

  /* ---- Cleanup intervals on unmount ---- */
  useEffect(() => {
    return () => {
      if (pullIntervalRef.current) clearInterval(pullIntervalRef.current);
    };
  }, []);

  /* ---- Step: Check Ollama ---- */
  const checkOllama = useCallback(async () => {
    setError(null);
    try {
      const result = await runCommand('which ollama');
      if (result.exitCode === 0 && result.stdout.trim()) {
        setStep('pick-model');
      } else {
        setStep('install-ollama');
      }
    } catch {
      // Shell not available -- fall back to manual mode
      setManualMode(true);
      setStep('pick-model');
    }
  }, []);

  /* ---- Trigger initial check on mount ---- */
  useEffect(() => {
    checkOllama();
  }, [checkOllama]);

  /* ---- Step: Pull model ---- */
  const startPull = useCallback(async () => {
    setStep('pulling');
    setError(null);
    setPullProgress(0);
    setPullLog('');

    try {
      // Ensure ollama serve is running in background
      try {
        await runCommand('pgrep -x ollama > /dev/null 2>&1 || (ollama serve > /dev/null 2>&1 &)');
      } catch {
        // May already be running -- ignore
      }

      setPullLog(`Pulling ${selectedModel.tag}...\n`);

      // Start the pull command
      const pullPromise = runCommand(`ollama pull ${selectedModel.tag}`);

      // Simulate progress by ramping up (ollama pull does not expose structured progress to stdout)
      let progress = 0;
      pullIntervalRef.current = setInterval(() => {
        progress += (95 - progress) * 0.04;
        const rounded = Math.min(Math.round(progress), 95);
        setPullProgress(rounded);
        setPullLog((prev) => {
          const firstLine = prev.split('\n')[0];
          const dots = '.'.repeat((Math.floor(progress / 8) % 4) + 1);
          return firstLine + `\nDownloading${dots} ${rounded}%`;
        });
      }, 800);

      const result = await pullPromise;

      if (pullIntervalRef.current) {
        clearInterval(pullIntervalRef.current);
        pullIntervalRef.current = null;
      }

      if (result.exitCode === 0) {
        setPullProgress(100);
        setPullLog((prev) => prev + '\n' + (result.stdout || 'Pull complete.'));
        // Brief pause so the user sees 100%, then test
        setTimeout(() => testModel(), 600);
      } else {
        setError(result.stderr || 'Failed to pull model. Check your connection and try again.');
        setPullLog((prev) => prev + '\n' + (result.stderr || 'Error during pull.'));
      }
    } catch (err: any) {
      if (pullIntervalRef.current) {
        clearInterval(pullIntervalRef.current);
        pullIntervalRef.current = null;
      }
      setError(err?.message || 'Failed to pull model.');
    }
  }, [selectedModel]);

  /* ---- Step: Test model ---- */
  const testModel = useCallback(async () => {
    setStep('testing');
    setError(null);
    setTestOutput('');

    try {
      setTestOutput('Sending test prompt...\n');
      const result = await runCommand(
        `ollama run ${selectedModel.tag} "Say hello in one sentence." --nowordwrap 2>&1 | head -c 500`,
      );

      if (result.exitCode === 0 && result.stdout.trim()) {
        setTestOutput((prev) => prev + result.stdout.trim() + '\n\nModel is working.');
        setStep('done');
      } else {
        setTestOutput((prev) => prev + (result.stderr || result.stdout || 'No response received.'));
        setError('Model did not respond as expected. You can still save the config and try again later.');
        setStep('done');
      }
    } catch {
      setTestOutput('Could not run test (shell not available).\nModel may still be ready if you pulled it manually.');
      setStep('done');
    }
  }, [selectedModel]);

  /* ---- Save config and finish ---- */
  const handleComplete = useCallback(() => {
    onComplete({
      model: selectedModel.tag,
      endpoint: OLLAMA_ENDPOINT,
    });
  }, [onComplete, selectedModel]);

  /* ---- Re-check Ollama after user says they installed it ---- */
  const recheckOllama = useCallback(async () => {
    setError(null);
    try {
      const result = await runCommand('which ollama');
      if (result.exitCode === 0 && result.stdout.trim()) {
        setStep('pick-model');
      } else {
        setError('Ollama not found. Make sure the installation completed and your PATH is updated.');
      }
    } catch {
      setError('Cannot verify installation -- shell access not available.');
    }
  }, []);

  /* ---- Step index for progress dots ---- */
  const TOTAL_STEPS = 5;
  const stepIndex = (() => {
    switch (step) {
      case 'check-ollama':
      case 'install-ollama':
        return 0;
      case 'pick-model':
        return 1;
      case 'pulling':
        return 2;
      case 'testing':
        return 3;
      case 'done':
        return 4;
      default:
        return 0;
    }
  })();

  /* ================================================================== */
  /*  Render                                                             */
  /* ================================================================== */

  return (
    <>
      <style>{CSS}</style>
      <div className="gemma-overlay" onClick={onClose}>
        <div className="gemma-dialog" onClick={(e) => e.stopPropagation()}>

          {/* ---- Header ---- */}
          <div className="gemma-header">
            <h2>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent, #f97316)' }}>
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              Gemma 4 Local Setup
            </h2>
            <button className="gemma-close" onClick={onClose} title="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="gemma-body">
            {/* ---- Progress dots ---- */}
            <div className="gemma-steps">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <div key={i} style={{ display: 'contents' }}>
                  <div
                    className={`gemma-step-dot${i === stepIndex ? ' active' : ''}${i < stepIndex ? ' done' : ''}`}
                  />
                  {i < TOTAL_STEPS - 1 && (
                    <div className={`gemma-step-line${i < stepIndex ? ' done' : ''}`} />
                  )}
                </div>
              ))}
            </div>

            {manualMode && (
              <div className="gemma-manual-banner">
                Shell access is not available. Showing manual instructions -- run the commands in your terminal.
              </div>
            )}

            {/* ========================================================== */}
            {/*  STEP: Checking Ollama                                      */}
            {/* ========================================================== */}
            {step === 'check-ollama' && (
              <div className="gemma-status gemma-status-checking">
                <div className="gemma-status-dot gemma-status-dot-spin" style={{ background: '#f59e0b' }} />
                Checking for Ollama installation...
              </div>
            )}

            {/* ========================================================== */}
            {/*  STEP: Install Ollama                                       */}
            {/* ========================================================== */}
            {step === 'install-ollama' && (
              <>
                <p className="gemma-title">Install Ollama</p>
                <p className="gemma-subtitle">
                  Ollama is required to run Gemma 4 locally. It manages model downloads
                  and serves an OpenAI-compatible API on your machine.
                </p>

                <div className="gemma-status gemma-status-error">
                  <div className="gemma-status-dot" style={{ background: '#ef4444' }} />
                  Ollama not found on this system
                </div>

                <p style={{ fontSize: 13, color: '#9898b0', marginBottom: 6 }}>
                  Install via Homebrew:
                </p>
                <code className="gemma-code">brew install ollama</code>

                <p style={{ fontSize: 12, color: '#6a6a82', marginTop: 12, lineHeight: 1.5 }}>
                  Or download from{' '}
                  <span style={{ color: '#60a5fa', cursor: 'pointer' }}>ollama.com</span>
                  {' '}and follow the installer.
                </p>

                {error && (
                  <div className="gemma-status gemma-status-error" style={{ marginTop: 12 }}>
                    <div className="gemma-status-dot" style={{ background: '#ef4444' }} />
                    {error}
                  </div>
                )}

                <div className="gemma-btn-row">
                  <button className="gemma-btn" onClick={onClose}>Cancel</button>
                  <button className="gemma-btn" onClick={() => setStep('pick-model')}>
                    Skip (I'll install later)
                  </button>
                  <button className="gemma-btn gemma-btn-primary" onClick={recheckOllama}>
                    I've installed it -- re-check
                  </button>
                </div>
              </>
            )}

            {/* ========================================================== */}
            {/*  STEP: Pick model variant                                   */}
            {/* ========================================================== */}
            {step === 'pick-model' && (
              <>
                <p className="gemma-title">Choose a Model Variant</p>
                <p className="gemma-subtitle">
                  Select based on your available RAM. Larger models produce better output
                  but require more memory.
                </p>

                <div className="gemma-model-grid">
                  {MODEL_VARIANTS.map((v) => (
                    <div
                      key={v.id}
                      className={`gemma-model-card${selectedModel.id === v.id ? ' selected' : ''}`}
                      onClick={() => setSelectedModel(v)}
                    >
                      <div className="gemma-model-radio">
                        <div className="gemma-model-radio-inner" />
                      </div>
                      <div className="gemma-model-info">
                        <div className="gemma-model-name">{v.label}</div>
                        <div className="gemma-model-desc">{v.description}</div>
                      </div>
                      <div className="gemma-model-ram">{v.ram}</div>
                    </div>
                  ))}
                </div>

                {manualMode && (
                  <div style={{ marginTop: 16 }}>
                    <p style={{ fontSize: 12, color: '#9898b0', marginBottom: 6 }}>
                      Run this in your terminal to pull the model:
                    </p>
                    <code className="gemma-code">ollama pull {selectedModel.tag}</code>
                  </div>
                )}

                <div className="gemma-btn-row">
                  <button className="gemma-btn" onClick={onClose}>Cancel</button>
                  {manualMode ? (
                    <button className="gemma-btn gemma-btn-primary" onClick={() => setStep('done')}>
                      I've pulled it -- finish setup
                    </button>
                  ) : (
                    <button className="gemma-btn gemma-btn-primary" onClick={startPull}>
                      Pull {selectedModel.label}
                    </button>
                  )}
                </div>
              </>
            )}

            {/* ========================================================== */}
            {/*  STEP: Pulling / downloading                                */}
            {/* ========================================================== */}
            {step === 'pulling' && (
              <>
                <p className="gemma-title">Downloading {selectedModel.label}</p>
                <p className="gemma-subtitle">
                  Pulling{' '}
                  <span style={{ fontFamily: '"JetBrains Mono","Fira Code",monospace', color: 'var(--text-primary, #e4e4ed)' }}>
                    {selectedModel.tag}
                  </span>{' '}
                  via Ollama. This may take several minutes depending on your connection.
                </p>

                <div className="gemma-progress-wrap">
                  <div className="gemma-progress-bar-outer">
                    <div
                      className="gemma-progress-bar-inner"
                      style={{ width: `${pullProgress}%` }}
                    />
                  </div>
                  <div className="gemma-progress-text">
                    <span>{pullProgress}%</span>
                    <span>{selectedModel.ram} download</span>
                  </div>
                </div>

                <div className="gemma-log" ref={logRef}>
                  {pullLog || 'Starting...'}
                </div>

                {error && (
                  <div className="gemma-status gemma-status-error" style={{ marginTop: 12 }}>
                    <div className="gemma-status-dot" style={{ background: '#ef4444' }} />
                    {error}
                  </div>
                )}

                <div className="gemma-btn-row">
                  <button className="gemma-btn" onClick={onClose}>Cancel</button>
                  {error && (
                    <button className="gemma-btn gemma-btn-primary" onClick={startPull}>
                      Retry
                    </button>
                  )}
                </div>
              </>
            )}

            {/* ========================================================== */}
            {/*  STEP: Testing model                                        */}
            {/* ========================================================== */}
            {step === 'testing' && (
              <>
                <p className="gemma-title">Testing Model</p>
                <p className="gemma-subtitle">
                  Running a quick test to verify the model responds correctly.
                </p>

                <div className="gemma-status gemma-status-checking">
                  <div className="gemma-status-dot gemma-status-dot-spin" style={{ background: '#f59e0b' }} />
                  Sending test prompt...
                </div>

                <div className="gemma-log" ref={logRef}>
                  {testOutput || 'Waiting for response...'}
                </div>
              </>
            )}

            {/* ========================================================== */}
            {/*  STEP: Done                                                 */}
            {/* ========================================================== */}
            {step === 'done' && (
              <>
                <div className="gemma-success-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>

                <p className="gemma-title" style={{ textAlign: 'center' }}>Setup Complete</p>
                <p className="gemma-subtitle" style={{ textAlign: 'center' }}>
                  Gemma 4 is ready to use as a local model.
                </p>

                <dl className="gemma-done-summary">
                  <dt>Model</dt>
                  <dd>{selectedModel.tag}</dd>
                  <dt>Endpoint</dt>
                  <dd>{OLLAMA_ENDPOINT}</dd>
                </dl>

                {testOutput && (
                  <details style={{ marginBottom: 16 }}>
                    <summary style={{ fontSize: 12, color: '#6a6a82', cursor: 'pointer', marginBottom: 8 }}>
                      Test output
                    </summary>
                    <div className="gemma-log" ref={logRef}>
                      {testOutput}
                    </div>
                  </details>
                )}

                {error && (
                  <div className="gemma-status gemma-status-error" style={{ marginBottom: 12 }}>
                    <div className="gemma-status-dot" style={{ background: '#ef4444' }} />
                    {error}
                  </div>
                )}

                <div className="gemma-btn-row" style={{ justifyContent: 'center' }}>
                  <button className="gemma-btn" onClick={onClose}>Close</button>
                  <button className="gemma-btn gemma-btn-primary" onClick={handleComplete}>
                    Save &amp; Use Gemma 4
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
