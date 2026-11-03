import { useEffect, useState } from 'react';
import { COLORS } from '../ludoLayout';

// Which of the 9 grid cells hold a dot for each face
const DOTS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export default function Dice({ value, color, canRoll, onRoll }) {
  const [shown, setShown] = useState(null);
  const [rolling, setRolling] = useState(false);

  // Whenever the server sends a new roll, tumble through random faces, then land
  useEffect(() => {
    if (value == null) {
      setShown(null);
      setRolling(false);
      return;
    }
    setRolling(true);
    const spin = setInterval(() => setShown(1 + Math.floor(Math.random() * 6)), 80);
    const land = setTimeout(() => {
      clearInterval(spin);
      setShown(value);
      setRolling(false);
    }, 600);
    return () => {
      clearInterval(spin);
      clearTimeout(land);
    };
  }, [value]);

  return (
    <button
      className={'dice' + (rolling ? ' rolling' : '') + (canRoll ? ' can-roll' : '')}
      style={{ '--c': color ? COLORS[color] : '#9ca3af' }}
      disabled={!canRoll}
      onClick={onRoll}
      aria-label="Roll dice"
    >
      {shown == null ? (
        <span className="dice-q">?</span>
      ) : (
        <div className="dice-face">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className={'dot' + (DOTS[shown].includes(i) ? ' on' : '')} />
          ))}
        </div>
      )}
    </button>
  );
}