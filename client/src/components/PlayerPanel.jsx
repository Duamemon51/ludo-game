import { useCallback, useEffect, useRef, useState } from 'react';
import GameDice from './GameDice';
import Bubble from './Bubble';
import PlayerProfile from './PlayerProfile';
import { COLORS } from '../ludoLayout';

// Dice face pip positions (3x3 grid, cells 1-9)
const PIPS = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

function MiniDie({ value, latest }) {
  const pips = PIPS[value] || [];
  return (
    <span
      className={`rh-die${latest ? ' latest' : ''}${value === 6 ? ' six' : ''}`}
      title={`Rolled ${value}`}
    >
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((cell) => (
        <i key={cell} className={pips.includes(cell) ? 'on' : ''} />
      ))}
    </span>
  );
}

export default function PlayerPanel({
  seat, vertical, side, active, isMe, pct, dice, diceRollId, rolledDice, rolledDiceIds, usedDiceIds = [], canRoll, onRoll, onChat, chatEnabled, bubble, soundMuted, avatar, onDisableAutoMode,
}) {
  const historyRef = useRef(null);
  const [settledDiceRollId, setSettledDiceRollId] = useState(0);
  const onRollSettled = useCallback((rollId) => {
    setSettledDiceRollId((current) => Math.max(current, rollId));
  }, []);
  const firstHistoryRollId = diceRollId - rolledDice.length + 1;
  const visibleRolls = rolledDice
    .map((value, index) => ({
      value,
      id: rolledDiceIds?.[index] ?? index,
      animationId: firstHistoryRollId + index,
    }))
    .filter(({ id, animationId }) => animationId <= settledDiceRollId && !usedDiceIds.includes(id));

  // Keep the latest unused roll visible.
  useEffect(() => {
    const el = historyRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [visibleRolls.length]);

  return (
    <div className={`panel ${vertical} ${side}${active ? ' active' : ''}`} style={{ '--c': COLORS[seat.color] }}>
      <style>{`
        .roll-history {
          position: absolute;
          top: -30px;
          left: 0;
          z-index: 8;
          display: flex;
          align-items: center;
          gap: 5px;
          /* padding so glow / scale / pop are not clipped by overflow */
          padding: 5px 7px;
          border: 0;
          background: transparent;
          box-shadow: none;
          backdrop-filter: none;
          pointer-events: none;
          color: #fff;
          animation: rh-slide 0.3s ease-out;
          max-width: min(180px, calc(100vw - 20px));
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
        }
        .roll-history::-webkit-scrollbar { display: none; }
        .panel.right .roll-history { left: auto; right: 0; }

        .rh-die {
          flex: none;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: repeat(3, 1fr);
          width: 19px;
          height: 19px;
          padding: 2.5px;
          box-sizing: border-box;
          border-radius: 5px;
          background: linear-gradient(145deg, #ffffff, #dfe5ee);
          box-shadow:
            0 2px 3px rgba(0, 0, 0, 0.4),
            inset 0 -1px 2px rgba(0, 0, 0, 0.15);
          opacity: 0.8;
          transform: scale(0.9);
          transition: transform 0.2s, opacity 0.2s;
        }
        .rh-die i {
          width: 3.5px;
          height: 3.5px;
          place-self: center;
          border-radius: 50%;
          background: transparent;
        }
        .rh-die i.on {
          background: radial-gradient(circle at 35% 30%, #475569, #0f172a);
        }

        /* Latest roll: bigger, glowing, pop-in */
        .rh-die.latest {
          opacity: 1;
          transform: scale(1.1);
          box-shadow:
            0 0 0 1.5px var(--c),
            0 0 8px var(--c),
            0 1px 3px rgba(0, 0, 0, 0.4);
          animation: rh-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        /* Six: golden die with red pips */
        .rh-die.six {
          background: linear-gradient(145deg, #fde68a, #f59e0b);
        }
        .rh-die.six i.on {
          background: radial-gradient(circle at 35% 30%, #ef4444, #7f1d1d);
        }

        @keyframes rh-pop {
          0%   { transform: scale(0.2) rotate(-200deg); opacity: 0; }
          70%  { transform: scale(1.25) rotate(15deg); opacity: 1; }
          100% { transform: scale(1.1) rotate(0); }
        }
        @keyframes rh-slide {
          from { transform: translateY(6px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .roll-history, .rh-die.latest { animation: none; }
        }
      `}</style>

      <div className="pmain">
        <PlayerProfile
          seat={seat}
          isMe={isMe}
          pct={pct}
          onChat={onChat}
          chatEnabled={chatEnabled}
          avatar={avatar}
          onDisableAutoMode={onDisableAutoMode}
        />

        {active && (
          <GameDice
            value={dice}
            rollId={diceRollId}
            color={seat.color}
            canRoll={canRoll}
            soundMuted={soundMuted}
            onRollSettled={onRollSettled}
            onRoll={onRoll}
          />
        )}
      </div>

      {active && visibleRolls.length > 0 && (
        <div
          ref={historyRef}
          className="roll-history"
          aria-label={`Available dice this turn: ${visibleRolls.map(({ value }) => value).join(', ')}`}
        >
          {visibleRolls.map(({ value, id }, index) => (
            <MiniDie
              key={`${id}-${value}`}
              value={value}
              latest={index === visibleRolls.length - 1}
            />
          ))}
        </div>
      )}

      {chatEnabled && bubble && <Bubble key={bubble.id} text={bubble.text} vertical={vertical} side={side} />}
    </div>
  );
}