import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

interface AssistantThinkingMessageProps {
  text: string;
  isStreaming?: boolean;
  timestamp?: number;
  redacted?: boolean;
}

export default function AssistantThinkingMessage({
  text,
  isStreaming,
  redacted,
}: AssistantThinkingMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const startRef = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [finalDuration, setFinalDuration] = useState<number | null>(null);

  // Duration tracking: tick every 100ms while streaming
  useEffect(() => {
    if (!isStreaming) {
      setFinalDuration(Date.now() - startRef.current);
      return;
    }

    startRef.current = Date.now();
    setFinalDuration(null);

    const id = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 100);

    return () => clearInterval(id);
  }, [isStreaming]);

  const durationSec =
    finalDuration != null
      ? (finalDuration / 1000).toFixed(1)
      : (elapsed / 1000).toFixed(1);

  const canExpand = !redacted && text.trim().length > 0;

  const label = redacted
    ? "\u2234 Thinking\u2026"
    : isStreaming
      ? `\u2234 Thinking (${durationSec}s)`
      : `\u2234 Thought for ${durationSec}s`;

  const toggle = () => {
    if (canExpand) setExpanded((v) => !v);
  };

  return (
    <div className="cli-thinking">
      <div
        className="cli-thinking-line"
        onClick={toggle}
        role={canExpand ? "button" : undefined}
        tabIndex={canExpand ? 0 : undefined}
        onKeyDown={
          canExpand
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle();
                }
              }
            : undefined
        }
        style={{ cursor: canExpand ? "pointer" : "default" }}
      >
        <span className="cli-thinking-label">{label}</span>
      </div>
      {expanded && text && (
        <div className="cli-thinking-content">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
