import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function AssistantTextMessage({ text }: { text: string; model?: string }) {
  return (
    <div className="cli-assistant-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: ({ children, className, ...props }) => {
            const isBlock = className?.startsWith("language-") || (props.node?.position?.start.line !== props.node?.position?.end.line);
            if (isBlock) {
              const lang = className?.replace("language-", "") || "";
              const codeText = String(children).replace(/\n$/, "");
              return (
                <div className="code-block">
                  <div className="code-block-header">
                    <span className="code-lang">{lang || "code"}</span>
                    <button className="code-copy-btn" onClick={() => navigator.clipboard.writeText(codeText)}>Copy</button>
                  </div>
                  <pre><code>{codeText}</code></pre>
                </div>
              );
            }
            return <code className="inline-code">{children}</code>;
          },
          table: ({ children }) => <table className="md-table">{children}</table>,
          th: ({ children }) => <th className="md-th">{children}</th>,
          td: ({ children }) => <td className="md-td">{children}</td>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
