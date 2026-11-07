import GameDice from './GameDice';
import Bubble from './Bubble';
import PlayerProfile from './PlayerProfile';
import { COLORS } from '../ludoLayout';

export default function PlayerPanel({
  seat, vertical, side, active, isMe, pct, dice, diceRollId, canRoll, onRoll, onChat, bubble, soundMuted, avatar,
}) {
  return (
    <div className={`panel ${side}${active ? ' active' : ''}`} style={{ '--c': COLORS[seat.color] }}>
      <div className="pmain">
        <PlayerProfile seat={seat} isMe={isMe} pct={pct} onChat={onChat} avatar={avatar} />

        {active && (
          <GameDice
            value={dice}
            rollId={diceRollId}
            color={seat.color}
            canRoll={canRoll}
            soundMuted={soundMuted}
            onRoll={onRoll}
          />
        )}
      </div>

      {bubble && <Bubble key={bubble.id} text={bubble.text} vertical={vertical} side={side} />}
    </div>
  );
}