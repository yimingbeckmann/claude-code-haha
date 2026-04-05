import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────

export interface DispatchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
}

interface ChatMessage {
  id: string;
  role: "tensor" | "user";
  content: string;
  timestamp: number;
}

// ── Helpers ───────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Component ─────────────────────────────────────────────────────────

export default function DispatchPanel({ isOpen, onClose, apiBase: _apiBase }: DispatchPanelProps) {
  void _apiBase; // reserved for future API integration
  const [isSetUp, setIsSetUp] = useState(false);
  const [keepAwake, setKeepAwake] = useState(false);
  const [computerUse, setComputerUse] = useState(false);
  const [codePermission, setCodePermission] = useState("auto-accept");
  const [showInfoCard, setShowInfoCard] = useState(true);
  const [showNotifBar, setShowNotifBar] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-1",
      role: "tensor",
      content: "I'm ready to help. What would you like me to work on?",
      timestamp: Date.now(),
    },
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { id: generateId(), role: "user", content: text, timestamp: Date.now() },
    ]);
    setInputValue("");
    // Simulate Tensor response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: "tensor",
          content: "I'll work on that. Let me check your files and get started.",
          timestamp: Date.now(),
        },
      ]);
    }, 1200);
  }, [inputValue]);

  if (!isOpen) return null;

  // ════════════════════════════════════════════════════════════════════
  //  STATE 1: Onboarding
  // ════════════════════════════════════════════════════════════════════

  if (!isSetUp) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9998,
          backdropFilter: "blur(4px)",
        }}
        onClick={onClose}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 520,
            maxWidth: "94vw",
            maxHeight: "90vh",
            background: "var(--bg-primary)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border)",
            overflow: "hidden",
            boxShadow: "0 25px 60px rgba(0,0,0,0.55)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Scrollable content */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "40px 32px 32px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* Illustration */}
            <div
              style={{
                fontSize: 48,
                marginBottom: 24,
                display: "flex",
                alignItems: "center",
                gap: 12,
                userSelect: "none",
              }}
            >
              <span role="img" aria-label="laptop">
                💻
              </span>
              <span
                style={{
                  fontSize: 24,
                  color: "var(--text-muted)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <span>→</span>
                <span>←</span>
              </span>
              <span role="img" aria-label="phone">
                📱
              </span>
            </div>

            {/* Title */}
            <h1
              style={{
                fontSize: 24,
                fontWeight: 700,
                margin: "0 0 8px",
                textAlign: "center",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                lineHeight: 1.3,
              }}
            >
              Dispatch from anywhere
            </h1>

            {/* Subtitle */}
            <p
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                textAlign: "center",
                margin: "0 0 28px",
                maxWidth: 400,
                lineHeight: 1.6,
              }}
            >
              Dispatch to Tensor and check in from anywhere—a task, a code
              session, in one continuous thread.
            </p>

            {/* Feature cards */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                width: "100%",
                marginBottom: 28,
              }}
            >
              {/* Card 1: Phone walkie-talkie */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  padding: "14px 16px",
                  background: "var(--bg-secondary)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    fontSize: 20,
                    flexShrink: 0,
                    width: 28,
                    textAlign: "center",
                    marginTop: 1,
                  }}
                >
                  📞
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                  }}
                >
                  Your phone is like a walkie talkie that can communicate with
                  Tensor on your computer.
                </span>
              </div>

              {/* Card 2: Message */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  padding: "14px 16px",
                  background: "var(--bg-secondary)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    fontSize: 20,
                    flexShrink: 0,
                    width: 28,
                    textAlign: "center",
                    marginTop: 1,
                  }}
                >
                  💬
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                  }}
                >
                  Just send Tensor a message, and it'll work on tasks using your
                  computer.
                </span>
              </div>

              {/* Card 3: Clock/schedule */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  padding: "14px 16px",
                  background: "var(--bg-secondary)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    fontSize: 20,
                    flexShrink: 0,
                    width: 28,
                    textAlign: "center",
                    marginTop: 1,
                  }}
                >
                  🕐
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                  }}
                >
                  Tensor can also run tasks on a schedule or whenever you need
                  them.
                </span>
              </div>

              {/* Card 4: Monitor */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  padding: "14px 16px",
                  background: "var(--bg-secondary)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    fontSize: 20,
                    flexShrink: 0,
                    width: 28,
                    textAlign: "center",
                    marginTop: 1,
                  }}
                >
                  🖥️
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                  }}
                >
                  Remember to keep your computer awake so Tensor can keep
                  working.
                </span>
              </div>
            </div>

            {/* Get started button */}
            <button
              onClick={() => setIsSetUp(true)}
              style={{
                width: "100%",
                padding: "14px 24px",
                fontSize: 15,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: 999,
                cursor: "pointer",
                marginBottom: 20,
                transition: "background 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.background =
                  "var(--bg-secondary)";
                (e.target as HTMLButtonElement).style.borderColor =
                  "var(--text-muted)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.background =
                  "var(--bg-tertiary)";
                (e.target as HTMLButtonElement).style.borderColor =
                  "var(--border)";
              }}
            >
              Get started
            </button>

            {/* Disclaimer */}
            <p
              style={{
                fontSize: 11,
                color: "var(--text-dim)",
                textAlign: "center",
                margin: 0,
                lineHeight: 1.6,
                maxWidth: 420,
              }}
            >
              Tensor will access your desktop (files, apps, and browser) to
              complete tasks you send from your phone. This may have security
              risks. Only pair devices that you own and trust.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  //  STATE 2: Active dispatch session
  // ════════════════════════════════════════════════════════════════════

  const suggestions = [
    "Review my latest PR",
    "Run the test suite",
    "Summarize recent changes",
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9998,
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 520,
          maxWidth: "94vw",
          height: "85vh",
          maxHeight: 780,
          background: "var(--bg-primary)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          overflow: "hidden",
          boxShadow: "0 25px 60px rgba(0,0,0,0.55)",
          color: "var(--text-primary)",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 600 }}>Dispatch</span>
            <span
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                transform: "translateY(1px)",
              }}
            >
              ▾
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-secondary)",
              fontSize: 20,
              padding: "4px 8px",
              borderRadius: "var(--radius-md)",
              lineHeight: 1,
            }}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Description banner */}
          <div
            style={{
              padding: "12px 20px",
              fontSize: 12,
              color: "var(--text-secondary)",
              lineHeight: 1.5,
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-secondary)",
            }}
          >
            Dispatch to Tensor and check in from anywhere—a task, a code
            session, in one continuous thread.
          </div>

          {/* ── Settings area ── */}
          <div
            style={{
              padding: "14px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            {/* Keep awake toggle */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span style={{ fontSize: 16 }}>☀️</span>
                <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
                  Keep awake
                </span>
              </div>
              {/* Toggle switch */}
              <button
                onClick={() => setKeepAwake(!keepAwake)}
                style={{
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  border: "none",
                  cursor: "pointer",
                  background: keepAwake ? "var(--accent)" : "var(--bg-tertiary)",
                  position: "relative",
                  transition: "background 0.2s",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    left: keepAwake ? 21 : 3,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }}
                />
              </button>
            </div>

            {/* Enable computer use */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <input
                  type="checkbox"
                  checked={computerUse}
                  onChange={(e) => setComputerUse(e.target.checked)}
                  style={{
                    width: 16,
                    height: 16,
                    cursor: "pointer",
                    accentColor: "var(--accent)",
                  }}
                />
                <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
                  Enable computer use
                </span>
              </div>
              <button
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--text-secondary)",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  padding: "4px 12px",
                  cursor: "pointer",
                  transition: "color 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLButtonElement).style.color =
                    "var(--text-primary)";
                  (e.target as HTMLButtonElement).style.borderColor =
                    "var(--text-muted)";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLButtonElement).style.color =
                    "var(--text-secondary)";
                  (e.target as HTMLButtonElement).style.borderColor =
                    "var(--border)";
                }}
              >
                Open settings
              </button>
            </div>

            {/* Code permissions dropdown */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{ fontSize: 13, color: "var(--text-primary)" }}
              >
                Code permissions
              </span>
              <select
                value={codePermission}
                onChange={(e) => setCodePermission(e.target.value)}
                style={{
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "4px 10px",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                <option value="auto-accept">Auto accept edits</option>
                <option value="review">Review edits</option>
                <option value="reject">Reject all edits</option>
              </select>
            </div>
          </div>

          {/* ── Outputs section ── */}
          <div
            style={{
              padding: "14px 20px 10px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-secondary)",
                textTransform: "uppercase" as const,
                letterSpacing: 0.8,
                marginBottom: 8,
              }}
            >
              Outputs
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                padding: "12px 0",
              }}
            >
              Files Tensor shares will appear here.
            </div>
          </div>

          {/* ── Info card ── */}
          {showInfoCard && (
            <div
              style={{
                margin: "12px 20px",
                padding: "14px 16px",
                background: "var(--bg-secondary)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                position: "relative",
              }}
            >
              <button
                onClick={() => setShowInfoCard(false)}
                style={{
                  position: "absolute",
                  top: 8,
                  right: 10,
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                  padding: "2px 4px",
                }}
              >
                ×
              </button>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 6,
                  paddingRight: 20,
                }}
              >
                Work with Tensor, right on your computer
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                Tensor can access your files, apps, and browser to help you get
                things done. Send a message below to get started.
              </div>
            </div>
          )}

          {/* ── Chat messages ── */}
          <div
            style={{
              flex: 1,
              padding: "8px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              minHeight: 120,
            }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems:
                    msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                {msg.role === "tensor" && (
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      marginBottom: 4,
                    }}
                  >
                    Tensor
                  </div>
                )}
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    fontSize: 13,
                    lineHeight: 1.5,
                    background:
                      msg.role === "user"
                        ? "var(--accent)"
                        : "var(--bg-secondary)",
                    color:
                      msg.role === "user" ? "#fff" : "var(--text-primary)",
                    border:
                      msg.role === "tensor"
                        ? "1px solid var(--border)"
                        : "none",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Suggestions */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 4,
              }}
            >
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setInputValue(s);
                    inputRef.current?.focus();
                  }}
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                    borderRadius: 999,
                    padding: "6px 14px",
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    cursor: "pointer",
                    transition: "color 0.15s, border-color 0.15s",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLButtonElement).style.color =
                      "var(--text-primary)";
                    (e.target as HTMLButtonElement).style.borderColor =
                      "var(--text-muted)";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.color =
                      "var(--text-secondary)";
                    (e.target as HTMLButtonElement).style.borderColor =
                      "var(--border)";
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            <div ref={chatEndRef} />
          </div>
        </div>

        {/* ── Notification bar ── */}
        {showNotifBar && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 20px",
              borderTop: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                flex: 1,
                color: "var(--text-secondary)",
                lineHeight: 1.4,
              }}
            >
              Get a push notification on your phone when Tensor messages you
              here.
            </span>
            <button
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-md)",
                padding: "5px 14px",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              Turn on
            </button>
            <button
              onClick={() => setShowNotifBar(false)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
                padding: "2px 4px",
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* ── Input bar ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-primary)",
            flexShrink: 0,
          }}
        >
          {/* Plus button */}
          <button
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              lineHeight: 1,
              fontFamily: "var(--font-mono)",
            }}
          >
            +
          </button>

          {/* Input field */}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask Tensor anything"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: "var(--text-primary)",
              fontSize: 13,
              fontFamily: "var(--font-mono)",
              outline: "none",
              padding: "4px 0",
            }}
          />

          {/* Microphone icon */}
          <button
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            🎙️
          </button>
        </div>
      </div>
    </div>
  );
}
