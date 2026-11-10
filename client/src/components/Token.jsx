import { COLORS } from '../ludoLayout';

/* ---------- color helpers ---------- */
function mix(hex, target, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const t = target === 'w' ? 255 : 0;
  const o = c.map((v) => Math.round(v + (t - v) * amt));
  return `rgb(${o[0]}, ${o[1]}, ${o[2]})`;
}
const light = (h, a) => mix(h, 'w', a);
const dark = (h, a) => mix(h, 'b', a);

/* Put <PawnDefs /> once inside the board <svg>. */
export function PawnDefs() {
  return (
    <defs>
      {/* ground shadow */}
      <radialGradient id="rt-shadow">
        <stop offset="0" stopColor="#000" stopOpacity="0.7" />
        <stop offset="0.55" stopColor="#000" stopOpacity="0.3" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>

      {/* white enamel ring */}
      <linearGradient id="rt-white" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.55" stopColor="#f2f2f2" />
        <stop offset="1" stopColor="#b9bcc4" />
      </linearGradient>

      {/* white center bead */}
      <radialGradient id="rt-bead" cx="0.35" cy="0.3" r="0.85">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.6" stopColor="#ececec" />
        <stop offset="1" stopColor="#a9adb6" />
      </radialGradient>

      <radialGradient id="rt-shine" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </radialGradient>

      {Object.entries(COLORS).map(([name, c]) => (
        <g key={name}>
          {/* outer colored disc: top face */}
          <radialGradient id={`rt-${name}-face`} cx="0.35" cy="0.27" r="0.95">
            <stop offset="0" stopColor={light(c, 0.55)} />
            <stop offset="0.35" stopColor={light(c, 0.12)} />
            <stop offset="0.7" stopColor={c} />
            <stop offset="1" stopColor={dark(c, 0.5)} />
          </radialGradient>
          {/* disc side wall */}
          <linearGradient id={`rt-${name}-wall`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={dark(c, 0.45)} />
            <stop offset="0.25" stopColor={light(c, 0.3)} />
            <stop offset="0.55" stopColor={c} />
            <stop offset="1" stopColor={dark(c, 0.7)} />
          </linearGradient>
          {/* inner raised dome */}
          <radialGradient id={`rt-${name}-dome`} cx="0.36" cy="0.28" r="0.9">
            <stop offset="0" stopColor={light(c, 0.75)} />
            <stop offset="0.25" stopColor={light(c, 0.3)} />
            <stop offset="0.6" stopColor={c} />
            <stop offset="1" stopColor={dark(c, 0.62)} />
          </radialGradient>
        </g>
      ))}
    </defs>
  );
}

/**
 * t         item from layoutTokens(): { color, idx, pos, x, y, scale }
 * className extra classes: 'captured' | 'killer' | 'homing' | 'winner-token'
 * style     extra inline style (--mid-dx, --mid-dy, --home-dx, --home-dy)
 * movable   shows the pulsing ring and pointer cursor
 */
export default function Token({ t, className = '', style, movable = false, onClick, elementRef }) {
  const n = t.color;
  const s = t.scale * 0.95;
  const CY = -0.04; // center of the top face

  return (
    // single group: moves with the original `.token` CSS transition
    <g
      ref={elementRef}
      className={`token${movable ? ' movable' : ''}${className ? ` ${className}` : ''}`}
      style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${s})`, ...style }}
      onClick={onClick}
    >
      <g>
        {/* ground shadow */}
        <ellipse cx="0.05" cy="0.38" rx="0.52" ry="0.2" fill="url(#rt-shadow)" />

        {/* movable ring */}
        {movable && (
          <circle className="ring" cx="0" cy={CY + 0.04} r="0.5" fill="none" stroke="#fff" strokeWidth="0.07" />
        )}

        {/* ===== outer colored disc: thickness ===== */}
        <circle cx="0" cy={CY + 0.11} r="0.4" fill={`url(#rt-${n}-wall)`} />
        <rect x="-0.4" y={CY} width="0.8" height="0.11" fill={`url(#rt-${n}-wall)`} />

        {/* ===== outer colored disc: top face ===== */}
        <circle cx="0" cy={CY} r="0.4" fill={`url(#rt-${n}-face)`} />
        <circle cx="0" cy={CY} r="0.4" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="0.014" />

        {/* ===== white enamel ring (with tiny dark edges for depth) ===== */}
        <circle cx="0" cy={CY} r="0.322" fill="none" stroke="#000" strokeOpacity="0.28" strokeWidth="0.085" />
        <circle cx="0" cy={CY} r="0.315" fill="none" stroke="url(#rt-white)" strokeWidth="0.07" />
        <circle cx="0" cy={CY} r="0.348" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="0.008" />

        {/* ===== inner colored dome (raised) ===== */}
        <circle cx="0" cy={CY + 0.035} r="0.255" fill={`url(#rt-${n}-wall)`} />
        <circle cx="0" cy={CY} r="0.255" fill={`url(#rt-${n}-dome)`} />

        {/* ===== white center bead ===== */}
        <circle cx="0.01" cy={CY + 0.025} r="0.095" fill="#000" opacity="0.3" />
        <circle cx="0" cy={CY} r="0.092" fill="url(#rt-bead)" />
        <circle cx="-0.03" cy={CY - 0.032} r="0.026" fill="#fff" />

        {/* ===== gloss on the whole disc ===== */}
        <ellipse
          cx="-0.12" cy={CY - 0.21} rx="0.2" ry="0.075"
          fill="url(#rt-shine)"
          transform={`rotate(-30 -0.12 ${CY - 0.21})`}
        />
        <ellipse
          cx="-0.2" cy={CY - 0.25} rx="0.05" ry="0.022"
          fill="#fff"
          transform={`rotate(-30 -0.2 ${CY - 0.25})`}
        />
        {/* rim light bottom-right */}
        <path
          d={`M 0.14 ${CY + 0.33} A 0.36 0.36 0 0 0 0.3 ${CY + 0.2}`}
          fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="0.02" strokeLinecap="round"
        />

        {/* bigger invisible hit area */}
        <circle cx="0" cy="0" r="0.5" fill="transparent" />
      </g>
    </g>
  );
}