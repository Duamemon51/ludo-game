import { COLORS } from '../ludoLayout';

export default function PlayerProfile({ seat, isMe, pct, onChat, chatEnabled, avatar }) {
  const initial = (seat.name || '?').trim().charAt(0).toUpperCase();
  const showAvatar = Boolean(avatar && (isMe || seat.isTakeover));

  return (
    <div className="player-profile">
      <button
        type="button"
        className={'avatar-ring' + (isMe ? ' me' : '')}
        style={{ '--c': COLORS[seat.color], '--pct': `${pct}%` }}
        disabled={!isMe || !chatEnabled}
        onClick={onChat}
        aria-label={isMe && chatEnabled ? 'Open chat' : seat.name}
      >
        {showAvatar ? (
          <img className="avatar avatar-photo" src={avatar} alt="" />
        ) : (
          <span className="avatar" style={{ color: seat.color === 'yellow' ? '#222' : '#fff' }}>
            {initial}
          </span>
        )}
        <svg className="avatar-timer" viewBox="0 0 56 56" aria-hidden="true">
          <circle className="avatar-timer-track" cx="28" cy="28" r="25" pathLength="100" />
          <circle
            className="avatar-timer-progress"
            cx="28"
            cy="28"
            r="25"
            pathLength="100"
            style={{ strokeDashoffset: `${100 - pct}` }}
          />
        </svg>
        {chatEnabled && isMe && <span className="chat-badge">💬</span>}
      </button>

      <div className={`pname${isMe ? ' player-name-you' : ''}`} title={isMe ? undefined : seat.name}>
        {isMe ? 'You' : seat.name}
      </div>
    </div>
  );
}
