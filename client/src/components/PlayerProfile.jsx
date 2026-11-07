import { COLORS } from '../ludoLayout';

export default function PlayerProfile({ seat, isMe, pct, onChat }) {
  const initial = seat.isBot ? '🤖' : (seat.name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="player-profile">
      <button
        type="button"
        className={'avatar-ring' + (isMe ? ' me' : '')}
        style={{ '--c': COLORS[seat.color], '--pct': `${pct}%` }}
        disabled={!isMe}
        onClick={onChat}
        aria-label={isMe ? 'Open chat' : seat.name}
      >
        <span className="avatar" style={{ color: seat.color === 'yellow' ? '#222' : '#fff' }}>
          {initial}
        </span>
        {isMe && <span className="chat-badge">💬</span>}
      </button>

      <div className={`pname${isMe ? ' player-name-you' : ''}`} title={isMe ? undefined : seat.name}>
        {isMe ? 'You' : seat.name}
      </div>
    </div>
  );
}
