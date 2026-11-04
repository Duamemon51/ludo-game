import GameDice from './GameDice';
import Bubble from './Bubble';
import PlayerProfile from './PlayerProfile';
import { COLORS } from '../ludoLayout';

export default function PlayerPanel({
  seat, vertical, side, active, isMe, pct, dice, diceRollId, canRoll, onRoll, onChat, bubble,
}) {
  return (
    <div className={`panel ${side}${active ? ' active' : ''}`} style={{ '--c': COLORS[seat.color] }}>
      <div className="pmain">
        <PlayerProfile seat={seat} isMe={isMe} pct={pct} onChat={onChat} />

        {active && (
          <GameDice
            value={dice}
            rollId={diceRollId}
            color={seat.color}
            canRoll={canRoll}
            onRoll={onRoll}
          />
        )}
      </div>

      {bubble && <Bubble key={bubble.id} text={bubble.text} vertical={vertical} side={side} />}
    </div>
  );
}