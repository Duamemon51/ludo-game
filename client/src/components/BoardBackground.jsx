import {
  COLORS, PATH, LANES, START, SAFE, BASE_SPOTS, HOME_TRIANGLES,
} from '../ludoLayout';
import './BoardBackground.css';

const BLOCKS = [
  ['red', 0, 0],
  ['green', 9, 0],
  ['yellow', 9, 9],
  ['blue', 0, 9],
];

// Flat, printed-board look: no gradients, no gloss, crisp dark grid lines.
const INK = '#2a1a0e';
const GRID = 'rgba(42,26,14,.8)';
const PAPER = '#fbf4e2';
const STAR = 'M0-.42.12-.14.42-.13.18.06.26.36 0 .19-.26.36-.18.06-.42-.13-.12-.14Z';
const ARROW = 'M-.3-.17H.04V-.34L.34 0 .04.34V.17H-.3Z';

export default function BoardBackground({ turn, captures }) {
  return (
    <>
      <defs>
        {/* fine paper grain */}
        <filter id="bb-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 .35  0 0 0 0 .25  0 0 0 0 .1  0 0 0 .55 0" />
        </filter>
      </defs>

      <rect width="15" height="15" fill={PAPER} />

      {BLOCKS.map(([color, x, y]) => (
        <g key={color}>
          <rect x={x} y={y} width="6" height="6" fill={COLORS[color]} stroke={GRID} strokeWidth="0.06" />
          {/* white nest area */}
          <rect x={x + 0.9} y={y + 0.9} width="4.2" height="4.2" rx="0.55" fill="#fffdf6" stroke={INK} strokeWidth="0.07" />
          {BASE_SPOTS[color].map(([cx, cy], index) => (
            <g key={index}>
              <circle cx={cx} cy={cy} r="0.64" fill={COLORS[color]} stroke={INK} strokeWidth="0.07" />
              <circle cx={cx} cy={cy} r="0.4" fill="#fffdf6" stroke={INK} strokeOpacity=".55" strokeWidth="0.04" />
            </g>
          ))}
          {turn === color && (
            <rect
              className="glow"
              x={x + 0.1}
              y={y + 0.1}
              width="5.8"
              height="5.8"
              fill="none"
              stroke="#fff"
              strokeWidth="0.22"
            />
          )}
        </g>
      ))}

      {PATH.map(([row, column], absolutePosition) => {
        const owner = Object.keys(START).find((color) => START[color] === absolutePosition);
        return (
          <g key={absolutePosition}>
            <rect
              x={column}
              y={row}
              width="1"
              height="1"
              fill={owner ? COLORS[owner] : '#fffdf6'}
              stroke={GRID}
              strokeWidth="0.06"
            />
            {SAFE.includes(absolutePosition) && (
              <path
                d={STAR}
                transform={`translate(${column + 0.5} ${row + 0.52}) scale(0.95)`}
                fill={owner ? '#fff' : '#4a3a28'}
                strokeLinejoin="round"
              />
            )}
          </g>
        );
      })}

      {Object.entries(LANES).flatMap(([color, cells]) =>
        cells.map(([row, column], index) => (
          <g key={`${color}-${index}`}>
            <rect
              x={column}
              y={row}
              width="1"
              height="1"
              fill={COLORS[color]}
              stroke={GRID}
              strokeWidth="0.06"
            />
            {index === 0 && cells[1] && (
              <path
                d={ARROW}
                transform={`translate(${column + 0.5} ${row + 0.5}) rotate(${(Math.atan2(cells[1][0] - row, cells[1][1] - column) * 180) / Math.PI})`}
                fill="#fff"
              />
            )}
          </g>
        ))
      )}

      {Object.keys(captures).filter((color) => captures[color] < 1).map((color) => {
        const [row, column] = LANES[color][0];
        return (
          <g
            key={`${color}-home-lock`}
            transform={`translate(${column + 0.5} ${row + 0.5}) scale(0.035) translate(-12 -12)`}
            pointerEvents="none"
            fill="none"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" fill="#3b2412" />
            <path d="m6 18 12-12" />
          </g>
        );
      })}

      {Object.entries(HOME_TRIANGLES).map(([color, points]) => (
        <polygon key={color} points={points} fill={COLORS[color]} stroke={GRID} strokeWidth="0.06" strokeLinejoin="round" />
      ))}

      {/* paper grain over everything, very light */}
      <rect width="15" height="15" filter="url(#bb-grain)" opacity=".16" pointerEvents="none" />

      {/* printed board border */}
      <rect x="0.05" y="0.05" width="14.9" height="14.9" fill="none" stroke={INK} strokeWidth="0.1" />
    </>
  );
}