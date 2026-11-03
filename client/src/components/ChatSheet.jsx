import { useState } from 'react';

const EMOJIS = ['😀', '😂', '😍', '😎', '😡', '😭', '😮', '🤔', '👍', '👏', '🎉', '🔥', '🙏', '💔', '😴', '🤝'];
const PHRASES = ['Good luck!', 'Well played!', 'Nice move!', 'Hurry up!', 'Oops!', 'Unlucky 😅', 'GG', 'Rematch?'];

export default function ChatSheet({ open, onClose, onSend }) {
  const [text, setText] = useState('');
  if (!open) return null;

  const send = (t) => {
    const v = t.trim();
    if (!v) return;
    onSend(v);
    setText('');
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />

        <div className="emoji-grid">
          {EMOJIS.map((e) => (
            <button type="button" key={e} onClick={() => send(e)}>{e}</button>
          ))}
        </div>

        <div className="phrase-list">
          {PHRASES.map((p) => (
            <button type="button" key={p} onClick={() => send(p)}>{p}</button>
          ))}
        </div>

        <form
          className="sheet-form"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <input
            className="input"
            value={text}
            maxLength={200}
            placeholder="Type a message..."
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn dark">Send</button>
        </form>
      </div>
    </div>
  );
}