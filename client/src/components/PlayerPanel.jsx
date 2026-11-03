import Dice from './Dice';
import Bubble from './Bubble';
import { COLORS } from '../ludoLayout';

export default function PlayerPanel({
  seat, vertical, side, active, isMe, pct, dice, diceRollId, canRoll, onRoll, onChat, bubble,
}) {
  const initial = seat.isBot ? '🤖' : (seat.name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className={`panel ${side}${active ? ' active' : ''}`} style={{ '--c': COLORS[seat.color] }}>
      <div className="pmain">
        <button
          type="button"
          className={'avatar-ring' + (isMe ? ' me' : '')}
          style={{ '--pct': `${pct}%` }}
          disabled={!isMe}
          onClick={onChat}
          aria-label={isMe ? 'Open chat' : seat.name}
        >
          <span className="avatar" style={{ color: seat.color === 'yellow' ? '#222' : '#fff' }}>
            {initial}
          </span>
          {isMe && <span className="chat-badge">💬</span>}
        </button>

        {active && (
          <Dice
            value={dice}
            rollId={diceRollId}
            color={seat.color}
            canRoll={canRoll}
            onRoll={onRoll}
          />
        )}
      </div>

      <div className="pname">
        {seat.name}
        {isMe ? ' (you)' : ''}
      </div>

      {bubble && <Bubble key={bubble.id} text={bubble.text} vertical={vertical} side={side} />}
    </div>
  );
}