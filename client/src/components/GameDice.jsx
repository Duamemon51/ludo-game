import { useCallback, useEffect, useRef, useState } from 'react';
import { COLORS } from '../ludoLayout';

const DOTS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
// rotation that brings each number to the front
const TURN = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };
// where each number sits on the cube
const CUBE = [
  [1, 'rotateY(0deg)'], [6, 'rotateY(180deg)'], [3, 'rotateY(90deg)'],
  [4, 'rotateY(-90deg)'], [2, 'rotateX(90deg)'], [5, 'rotateX(-90deg)'],
];

const ROLL_MS = 850;

export default function GameDice({ value, color, canRoll, onRoll, rollId, soundMuted }) {
  const [settledRoll, setSettledRoll] = useState(null);
  const diceAudio = useRef(null);
  const previousRollId = useRef(rollId);
  const ownRollSoundPending = useRef(false);
  const rolling = value != null && settledRoll !== rollId;

  useEffect(() => {
    // CC0 sound: "Dice Rolling Sound - WOOD SURFACE" by Christopherderp.
    diceAudio.current = new Audio('/sounds/dice-roll.mp3');
    diceAudio.current.preload = 'auto';
    return () => {
      diceAudio.current?.pause();
      diceAudio.current = null;
    };
  }, []);

  const playDiceAudio = useCallback(() => {
    const audio = diceAudio.current;
    if (!audio || soundMuted) return;
    audio.currentTime = 0;
    audio.play().catch((error) => {
      console.warn('Could not play dice roll sound:', error);
    });
  }, [soundMuted]);

  useEffect(() => {
    if (soundMuted) diceAudio.current?.pause();
  }, [soundMuted]);

  useEffect(() => {
    if (value == null || rollId == null) return;
    if (previousRollId.current !== rollId) {
      if (ownRollSoundPending.current) ownRollSoundPending.current = false;
      else playDiceAudio();
    }
    previousRollId.current = rollId;
    const land = setTimeout(() => setSettledRoll(rollId), ROLL_MS);
    return () => clearTimeout(land);
  }, [playDiceAudio, rollId, value]);
  const [x, y] = TURN[value ?? 1];

  return (
    <button
      className={'gd' + (canRoll ? ' can-roll' : '') + (rolling ? ' rolling' : '')}
      style={{
        '--c': color ? COLORS[color] : '#9ca3af',
        '--roll': `${ROLL_MS}ms`,
        '--face-x': `${x}deg`,
        '--face-y': `${y}deg`,
      }}
      disabled={!canRoll || rolling}
      onClick={() => {
        ownRollSoundPending.current = true;
        playDiceAudio();
        onRoll();
      }}
      aria-label="Roll dice"
    >
      <style>{`
        .gd {
          --size: var(--gd-size, 40px);
          position: relative; display: block; flex: none;
          width: var(--size); height: var(--size); margin: 0; padding: 0;
          border: 0; background: none; border-radius: 20%; opacity: 1;
          perspective: calc(var(--size) * 7);
          cursor: default; -webkit-tap-highlight-color: transparent;
        }
        .gd:disabled { opacity: 1; }
        .gd.can-roll { cursor: pointer; }
        .gd:focus-visible { outline: 3px solid var(--c); outline-offset: 6px; }

        .gd-shadow {
          position: absolute; left: 8%; right: 8%; bottom: -16%; height: 14%;
          border-radius: 50%; background: rgba(0, 0, 0, .55); filter: blur(5px);
        }
        .gd.can-roll .gd-shadow { background: color-mix(in srgb, var(--c) 40%, #000); }

        .gd-hop { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform .15s; will-change: transform; }
        .gd.can-roll:hover .gd-hop { transform: translateY(-3px); }
        .gd.can-roll:active .gd-hop { transform: translateY(1px) scale(.96); }
        .gd.rolling .gd-hop { transition: none; }

        .gd-tumble {
          position: absolute; inset: 0; transform-style: preserve-3d;
          will-change: transform;
        }
        .gd-tumble.rolling { animation: gd-tumble var(--roll) cubic-bezier(.2, .65, .25, 1) both; }
        .gd-cube {
          position: absolute; inset: 0; transform-style: preserve-3d;
        }
        .gd-face {
          position: absolute; inset: 0; display: grid; grid-template: repeat(3, 1fr) / repeat(3, 1fr);
          padding: 14%; border-radius: 18%; backface-visibility: hidden;
          background: radial-gradient(circle at 30% 25%, #fff 0%, #f6f1e4 60%, #ddd5c0 100%);
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .12), inset -3px -3px 6px rgba(0, 0, 0, .1),
            inset 0 -5px 7px color-mix(in srgb, var(--c) 28%, transparent), inset 0 2px 2px #fff;
        }
        .gd-dot { display: grid; place-items: center; }
        .gd-dot.on::before {
          content: ""; width: 78%; aspect-ratio: 1; border-radius: 50%;
          background: radial-gradient(circle at 35% 28%, color-mix(in srgb, var(--c) 45%, #fff) 0 12%, var(--c) 48%, color-mix(in srgb, var(--c) 55%, #000) 100%);
          box-shadow: inset 0 -1px 1px rgba(0, 0, 0, .3), 0 1px 0 #fff;
        }
        .gd-face.f1 .gd-dot.on::before { width: 100%; }
        .gd-face.q { grid-template: 1fr / 1fr; place-items: center; padding: 0; }
        .gd-q {
          font: 800 calc(var(--size) * .55) / 1 'Trebuchet MS', system-ui, sans-serif;
          color: #c8b98c; text-shadow: 0 1px 0 #fff, 0 -1px 0 rgba(90, 60, 10, .35);
        }

        @keyframes gd-tumble {
          0% { transform: rotateX(-90deg) rotateY(90deg); }
          50% { transform: rotateX(450deg) rotateY(810deg); }
          78% { transform: rotateX(calc(var(--face-x) + 720deg)) rotateY(calc(var(--face-y) + 1080deg)); }
          92% { transform: rotateX(calc(var(--face-x) + 936deg)) rotateY(calc(var(--face-y) + 1296deg)); }
          100% { transform: rotateX(calc(var(--face-x) + 1080deg)) rotateY(calc(var(--face-y) + 1440deg)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .gd-hop { transition: none; }
          .gd-tumble { transition: none; }
          .gd-tumble.rolling { animation: gd-tumble-reduced var(--roll) ease-out both !important; }
          @keyframes gd-tumble-reduced {
            from { transform: rotateX(-90deg) rotateY(90deg); }
            to { transform: rotateX(calc(var(--face-x) + 720deg)) rotateY(calc(var(--face-y) + 720deg)); }
          }
        }
      `}</style>

      <span className="gd-shadow" />
      <span className="gd-hop">
        <span className={'gd-tumble' + (rolling ? ' rolling' : '')}>
          <span
            className="gd-cube"
            style={{ transform: rolling ? 'rotateX(0deg) rotateY(0deg)' : `rotateX(${x}deg) rotateY(${y}deg)` }}
          >
            {CUBE.map(([n, t]) => (
              <span
                key={n}
                className={`gd-face f${n}` + (n === 1 && value == null ? ' q' : '')}
                style={{ transform: `${t} translateZ(calc(var(--size) / 2))` }}
              >
                {n === 1 && value == null ? (
                  <span className="gd-q">?</span>
                ) : (
                  Array.from({ length: 9 }, (_, i) => (
                    <span key={i} className={'gd-dot' + (DOTS[n].includes(i) ? ' on' : '')} />
                  ))
                )}
              </span>
            ))}
          </span>
        </span>
      </span>
    </button>
  );
}