import { useEffect, useState } from 'react';

const PIPS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
const TURN = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };
const CUBE = [
  [1, 'rotateY(0deg)'],
  [6, 'rotateY(180deg)'],
  [3, 'rotateY(90deg)'],
  [4, 'rotateY(-90deg)'],
  [2, 'rotateX(90deg)'],
  [5, 'rotateX(-90deg)'],
];

export default function HomeDice() {
  const [roll, setRoll] = useState({ face: 5, spins: 0 });
  const rollDice = () =>
    setRoll((current) => ({ face: 1 + Math.floor(Math.random() * 6), spins: current.spins + 2 }));

  useEffect(() => {
    const timer = setTimeout(rollDice, 350);
    return () => clearTimeout(timer);
  }, []);

  const [x, y] = TURN[roll.face];
  const turn = 360 * roll.spins;

  return (
    <>
      <style>{`
        .lh-dice {
          position: relative;
          width: 56px;
          height: 56px;
          margin: 8px 0 22px;
          perspective: 400px;
          cursor: pointer;
          outline: none;
          transform: scale(1.35);
        }
        .lh-dice:focus-visible .lh-cube {
          outline: 3px solid var(--gold, #fcc419);
          outline-offset: 6px;
          border-radius: 12px;
        }
        .lh-cube {
          position: relative;
          width: 56px;
          height: 56px;
          transform-style: preserve-3d;
          transition: transform 1.2s cubic-bezier(.2,.9,.25,1.05);
        }
        .lh-face {
          position: absolute;
          inset: 0;
          display: grid;
          grid-template: repeat(3, 1fr) / repeat(3, 1fr);
          padding: 8px;
          border-radius: 10px;
          backface-visibility: hidden;
          background: radial-gradient(circle at 30% 25%, #fff 0%, #f6f1e4 60%, #ddd5c0 100%);
          box-shadow: inset 0 0 0 1px rgba(0,0,0,.12), inset -3px -3px 6px rgba(0,0,0,.12);
        }
        .lh-face i {
          width: 10px;
          height: 10px;
          margin: auto;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, #5a4a3a, #140b04);
          box-shadow: 0 1px 0 #fff;
        }
        .lh-face.f1 i {
          width: 15px;
          height: 15px;
          background: radial-gradient(circle at 35% 30%, #ff7b73, #b71c1c);
        }
        .lh-dice-shadow {
          position: absolute;
          left: 6px;
          right: 6px;
          bottom: -12px;
          height: 10px;
          border-radius: 50%;
          background: rgba(0,0,0,.55);
          filter: blur(4px);
        }
        @media (max-height: 700px) {
          .lh-dice { margin: 2px 0 14px; transform: scale(1.1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .lh-cube { transition: none; }
        }
      `}</style>
      <div
        className="lh-dice"
        role="button"
        tabIndex={0}
        aria-label="Roll the dice"
        onClick={rollDice}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            rollDice();
          }
        }}
      >
        <div
          className="lh-cube"
          style={{ transform: `rotateX(${x + turn}deg) rotateY(${y + turn}deg)` }}
        >
          {CUBE.map(([number, transform]) => (
            <div
              key={number}
              className={`lh-face f${number}`}
              style={{ transform: `${transform} translateZ(28px)` }}
            >
              {Array.from({ length: 9 }, (_, index) =>
                PIPS[number].includes(index) ? <i key={index} /> : <b key={index} />
              )}
            </div>
          ))}
        </div>
        <span className="lh-dice-shadow" />
      </div>
    </>
  );
}
