import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className="code-copy-btn" onClick={() => {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export default function StreamingText({ text, isStreaming }: StreamingTextProps) {
  return (
    <div className="streaming-text">
      <ReactMarkdown remarkPlugins={[remarkGfm]}
        components={{
          code: ({ children, className }) => {
            const isBlock = className?.startsWith("language-");
            const lang = className?.replace("language-", "") || "";
            if (isBlock) {
              return (
                <div className="code-block">
                  <div className="code-block-header">
                    <span className={`code-lang code-lang-${lang}`}>{lang || "code"}</span>
                    <CopyButton text={String(children).replace(/\n$/, "")} />
                  </div>
                  <pre><code>{String(children).replace(/\n$/, "")}</code></pre>
                </div>
              );
            }
            return <code className="inline-code">{children}</code>;
          },
          table: ({ children }) => (
            <div className="table-wrapper">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
      {isStreaming && <span className="cursor animate-blink">|</span>}
    </div>
  );
}
