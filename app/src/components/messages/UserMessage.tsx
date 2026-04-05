export default function UserMessage({ text }: { text: string }) {
  return (
    <div className="cc-user-row">
      <div className="cc-user-bubble">
        <span className="cc-user-text">{text}</span>
      </div>
    </div>
  );
}
