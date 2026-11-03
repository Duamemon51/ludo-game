import { useEffect, useState } from 'react';
import {
  COLORS, LIGHT, PATH, LANES, START, SAFE, BASE_SPOTS, layoutTokens,
} from '../ludoLayout';

const BLOCKS = [
  ['red', 0, 0],
  ['green', 9, 0],
  ['yellow', 9, 9],
  ['blue', 0, 9],
];
const TRIANGLES = {
  red: '6,6 6,9 7.5,7.5',
  green: '6,6 9,6 7.5,7.5',
  yellow: '9,6 9,9 7.5,7.5',
  blue: '6,9 9,9 7.5,7.5',
};
const RADIUS = 0.36;
const HOP_MS = 140;

export default function Board({ tokens, turn, myColor, movable, onMove }) {
  // `shown` follows `tokens` one square at a time, so tokens hop like in real Ludo
  const [shown, setShown] = useState(tokens);

  useEffect(() => {
    const id = setInterval(() => {
      setShown((cur) => {
        let changed = false;
        const next = {};
        for (const color of Object.keys(tokens)) {
          next[color] = (cur[color] || tokens[color]).map((p, i) => {
            const target = tokens[color][i];
            if (p === target) return p;
            changed = true;
            if (p >= 0 && target > p) return p + 1; // hop forward one square
            return target;                          // leaving base or captured: jump
          });
        }
        return changed ? next : cur;
      });
    }, HOP_MS);
    return () => clearInterval(id);
  }, [tokens]);

  const items = layoutTokens(shown);

  return (
    <svg viewBox="0 0 15 15" className="board">
      <rect width="15" height="15" fill="#fff" />

      {/* Home bases */}
      {BLOCKS.map(([color, x, y]) => (
        <g key={color}>
          <rect x={x} y={y} width="6" height="6" fill={COLORS[color]} />
          <rect x={x + 1} y={y + 1} width="4" height="4" rx="0.5" fill="#fff" />
          {BASE_SPOTS[color].map(([cx, cy], i) => (
            <circle
              key={i} cx={cx} cy={cy} r="0.55"
              fill={LIGHT[color]} stroke={COLORS[color]} strokeWidth="0.06"
            />
          ))}
          {turn === color && (
            <rect
              className="glow" x={x + 0.1} y={y + 0.1} width="5.8" height="5.8"
              fill="none" stroke="#fff" strokeWidth="0.22"
            />
          )}
        </g>
      ))}

      {/* Main track */}
      {PATH.map(([r, c], abs) => {
        const owner = Object.keys(START).find((k) => START[k] === abs);
        return (
          <g key={abs}>
            <rect
              x={c} y={r} width="1" height="1"
              fill={owner ? COLORS[owner] : '#fff'} stroke="#555" strokeWidth="0.04"
            />
            {SAFE.includes(abs) && (
              <text
                x={c + 0.5} y={r + 0.5} fontSize="0.8" textAnchor="middle"
                dominantBaseline="central" fill={owner ? '#fff' : '#9e9e9e'}
              >
                ★
              </text>
            )}
          </g>
        );
      })}

      {/* Home lanes */}
      {Object.entries(LANES).map(([color, cells]) =>
        cells.map(([r, c], i) => (
          <rect
            key={color + i} x={c} y={r} width="1" height="1"
            fill={COLORS[color]} stroke="#555" strokeWidth="0.04"
          />
        ))
      )}

      {/* Center */}
      {Object.entries(TRIANGLES).map(([color, points]) => (
        <polygon key={color} points={points} fill={COLORS[color]} stroke="#555" strokeWidth="0.04" />
      ))}

      {/* Tokens */}
      {items.map((t) => {
        const settled = shown[t.color][t.idx] === tokens[t.color][t.idx];
        const canMove = t.color === myColor && movable.includes(t.idx) && settled;
        const r = RADIUS * t.scale;
        return (
          <g
            key={t.color + t.idx}
            className={'token' + (canMove ? ' movable' : '')}
            style={{ transform: `translate(${t.x}px, ${t.y}px)` }}
            onClick={canMove ? () => onMove(t.idx) : undefined}
          >
                       {canMove && <circle r={0.7} fill="transparent" />}
            {canMove && (
              <circle className="ring" r={r + 0.17} fill="none" stroke="#111" strokeWidth="0.1" />
            )}
            <circle r={r} fill={COLORS[t.color]} stroke="#1f2937" strokeWidth="0.07" />
            <circle r={r * 0.45} fill="rgba(255,255,255,0.4)" />
          </g>
        );
      })}
    </svg>
  );
}