import { useEffect, useRef, useState } from 'react';
import { COLORS } from '../ludoLayout';

const QUICK = ['👍', '😂', '😮', '😡', '🎲', 'GG', 'Good luck!', 'Hurry up!'];

export default function Chat({ messages, myId, onSend, collapsible = false }) {
  const [open, setOpen] = useState(!collapsible);
  const [text, setText] = useState('');
  const [seen, setSeen] = useState(0);
  const listRef = useRef(null);

  // Mark messages as read while the panel is open
  useEffect(() => {
    if (open) setSeen(messages.length);
  }, [open, messages.length]);

  // Keep the newest message in view
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  const unread = open ? 0 : messages.length - seen;

  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };

  return (
    <div className="chat">
      {collapsible && (
        <button type="button" className="chat-toggle" onClick={() => setOpen(!open)}>
          💬 Chat {unread > 0 && <span className="badge">{unread}</span>} {open ? '▾' : '▸'}
        </button>
      )}

      {open && (
        <>
          <div className="chat-list" ref={listRef}>
            {messages.length === 0 && <div className="chat-empty">No messages yet. Say hi! 👋</div>}
            {messages.map((m) => (
              <div key={m.id} className={'msg' + (m.from === myId ? ' mine' : '')}>
                <span className="msg-name" style={{ color: m.color ? COLORS[m.color] : '#6b7280' }}>
                  {m.from === myId ? 'You' : m.name}
                </span>
                <span className="msg-text">{m.text}</span>
              </div>
            ))}
          </div>

          <div className="quick">
            {QUICK.map((q) => (
              <button type="button" key={q} onClick={() => onSend(q)}>{q}</button>
            ))}
          </div>

          <form className="chat-form" onSubmit={submit}>
            <input
              className="input"
              value={text}
              maxLength={200}
              placeholder="Type a message..."
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" className="btn dark">Send</button>
          </form>
        </>
      )}
    </div>
  );
}