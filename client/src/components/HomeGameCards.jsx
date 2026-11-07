const SOFT = { filter: "drop-shadow(0 2px 1px rgba(0,0,0,.25))", display: "block" };

function Pawn({ x, y = 0, k = 1, id, light, mid, dark }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <defs>
        <linearGradient id={`${id}-b`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={dark} />
          <stop offset=".3" stopColor={light} />
          <stop offset=".6" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
        <radialGradient id={`${id}-h`} cx=".35" cy=".28" r=".85">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".22" stopColor={light} />
          <stop offset=".62" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </radialGradient>
      </defs>
      {/* contact shadow */}
      <ellipse cx="2" cy="56" rx="14" ry="4.5" fill="#000" opacity=".35" />
      {/* thick base disc (extruded) */}
      <ellipse cx="0" cy="56" rx="11.5" ry="4" fill={dark} />
      <path d="M-11.5 52v4a11.5 4 0 0 0 23 0v-4Z" fill={dark} />
      <ellipse cx="0" cy="52" rx="11.5" ry="4" fill={`url(#${id}-b)`} />
      <ellipse cx="-3" cy="51" rx="5" ry="1.2" fill="#fff" opacity=".45" />
      {/* body */}
      <path d="M-8.5 52C-8.5 43 -4 38 -3.5 31L3.5 31C4 38 8.5 43 8.5 52Q0 56 -8.5 52Z" fill={`url(#${id}-b)`} />
      {/* collar */}
      <ellipse cx="0" cy="32.5" rx="7.4" ry="2.9" fill={dark} />
      <ellipse cx="0" cy="31.4" rx="7.4" ry="2.9" fill={`url(#${id}-b)`} />
      <ellipse cx="-2.4" cy="30.8" rx="3" ry=".9" fill="#fff" opacity=".55" />
      {/* head sphere */}
      <circle cx="0" cy="23" r="8.6" fill={`url(#${id}-h)`} />
      <circle cx="0" cy="23" r="8.6" fill="none" stroke={dark} strokeOpacity=".35" strokeWidth=".6" />
      <ellipse cx="-2.9" cy="19.2" rx="3" ry="2" fill="#fff" opacity=".85" transform="rotate(-25 -2.9 19.2)" />
      <circle cx="3.4" cy="27.4" r="1.4" fill="#fff" opacity=".25" />
    </g>
  );
}

function DuelIcon() {
  return (
    <svg viewBox="0 6 100 74" fill="none" aria-hidden="true" style={SOFT}>
      <defs>
        <linearGradient id="du-gloss" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".5" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="du-sl" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#7a431c" />
          <stop offset="1" stopColor="#3a1d0b" />
        </linearGradient>
        <linearGradient id="du-sr" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#a35a26" />
          <stop offset="1" stopColor="#4e2810" />
        </linearGradient>
        <linearGradient id="du-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#7be07f" /><stop offset="1" stopColor="#2c8f3a" /></linearGradient>
        <linearGradient id="du-y" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ffe46b" /><stop offset="1" stopColor="#e5a800" /></linearGradient>
        <linearGradient id="du-bl" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#5db4ff" /><stop offset="1" stopColor="#1565c0" /></linearGradient>
        <linearGradient id="du-r" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ff7a72" /><stop offset="1" stopColor="#c62828" /></linearGradient>
        <linearGradient id="du-w" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#d9dee6" /></linearGradient>
        <radialGradient id="du-vs" cx=".35" cy=".3" r=".85">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset=".45" stopColor="#fcc419" />
          <stop offset="1" stopColor="#b97a00" />
        </radialGradient>
        <linearGradient id="du-dt" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#eef1f6" /></linearGradient>
        <linearGradient id="du-dl" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#e6ebf3" /><stop offset="1" stopColor="#bcc5d4" /></linearGradient>
        <linearGradient id="du-dr" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#c3cbd9" /><stop offset="1" stopColor="#8e98ab" /></linearGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx="50" cy="71" rx="38" ry="4" fill="#000" opacity=".15" />

      {/* board thickness */}
      <path d="M4 34 50 58v10L4 44Z" fill="url(#du-sl)" />
      <path d="M50 58 96 34v10L50 68Z" fill="url(#du-sr)" />
      <path d="M4 34 50 58v3L4 37Z" fill="#fcc419" opacity=".85" />
      <path d="M50 58 96 34v3L50 61Z" fill="#ffd95a" opacity=".6" />

      {/* board top */}
      <path d="M50 10 73 22 50 34 27 22Z" fill="url(#du-g)" />
      <path d="M73 22 96 34 73 46 50 34Z" fill="url(#du-y)" />
      <path d="M50 34 73 46 50 58 27 46Z" fill="url(#du-bl)" />
      <path d="M27 22 50 34 27 46 4 34Z" fill="url(#du-r)" />
      <path d="M50 16 61 22 50 28 39 22Z" fill="url(#du-w)" />
      <path d="M73 28 84 34 73 40 62 34Z" fill="url(#du-w)" />
      <path d="M50 40 61 46 50 52 39 46Z" fill="url(#du-w)" />
      <path d="M27 28 38 34 27 40 16 34Z" fill="url(#du-w)" />
      <path d="M50 10 96 34 50 58 4 34Z" fill="url(#du-gloss)" />
      <path d="M50 10 96 34 50 58 4 34Z" stroke="#fff3cc" strokeWidth="2.2" strokeLinejoin="round" />

      {/* dice shadow + cube */}
      <ellipse cx="79" cy="40" rx="11" ry="3.5" fill="#000" opacity=".3" />
      <g strokeLinejoin="round" strokeWidth="1.4">
        <path d="M66 21v12l10 5V26Z" fill="url(#du-dl)" stroke="url(#du-dl)" />
        <path d="M76 26v12l10-5V21Z" fill="url(#du-dr)" stroke="url(#du-dr)" />
        <path d="M76 16 86 21 76 26 66 21Z" fill="url(#du-dt)" stroke="url(#du-dt)" />
      </g>
      <path d="M76 16 86 21 76 26 66 21Z" stroke="#fff" strokeWidth=".6" opacity=".9" />
      <ellipse cx="76" cy="21" rx="1.9" ry="1.1" fill="#2b1a0e" />
      <ellipse cx="69.3" cy="26.4" rx="1.2" ry="1.5" fill="#2b1a0e" />
      <ellipse cx="72.8" cy="32" rx="1.2" ry="1.5" fill="#2b1a0e" />
      <ellipse cx="78.5" cy="31.5" rx="1.2" ry="1.5" fill="#2b1a0e" />
      <ellipse cx="81" cy="29.5" rx="1.2" ry="1.5" fill="#2b1a0e" />
      <ellipse cx="83.5" cy="27.5" rx="1.2" ry="1.5" fill="#2b1a0e" />

      {/* pawns */}
      <Pawn x={27} y={-5.6} k={0.8} id="dr" light="#ff8a80" mid="#e53935" dark="#8e1b1b" />
      <Pawn x={52} y={5.7} k={0.85} id="db" light="#82c0ff" mid="#1e88e5" dark="#0b3f8c" />

      {/* VS coin with thickness */}
      <ellipse cx="50" cy="70.5" rx="10" ry="9.5" fill="#7a4a00" />
      <circle cx="50" cy="68" r="9.5" fill="url(#du-vs)" stroke="#7a4a00" strokeWidth="1.2" />
      <circle cx="50" cy="68" r="7.3" fill="none" stroke="#fff3b0" strokeOpacity=".7" strokeWidth=".8" />
      <path d="M43.5 64.5a8 8 0 0 1 10-3" stroke="#fff" strokeOpacity=".8" strokeWidth="1.6" strokeLinecap="round" />
      <text x="50" y="72" textAnchor="middle" fontFamily="'Lilita One', sans-serif" fontSize="11" fill="#7a1f1a" stroke="#fff3b0" strokeWidth=".4">VS</text>
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 6 100 74" fill="none" aria-hidden="true" style={SOFT}>
      <defs>
        <linearGradient id="tg-cup" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#b8780a" />
          <stop offset=".3" stopColor="#ffe27a" />
          <stop offset=".58" stopColor="#fcc419" />
          <stop offset="1" stopColor="#a86e00" />
        </linearGradient>
        <linearGradient id="tg-base" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#6b3d00" />
          <stop offset=".5" stopColor="#d89a19" />
          <stop offset="1" stopColor="#6b3d00" />
        </linearGradient>
        <linearGradient id="tg-gold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ffd84a" /><stop offset="1" stopColor="#e0a000" /></linearGradient>
        <linearGradient id="tg-silver" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#e3eaee" /><stop offset="1" stopColor="#aab6bd" /></linearGradient>
        <linearGradient id="tg-bronze" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#e8a468" /><stop offset="1" stopColor="#b9722f" /></linearGradient>
        <linearGradient id="tg-shine" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".5" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="77" rx="40" ry="3" fill="#000" opacity=".15" />

      {/* 2nd place */}
      <path d="M6 56h26v20H6Z" fill="url(#tg-silver)" />
      <path d="M32 56l6-5v20l-6 5Z" fill="#7f8c93" />
      <path d="M6 56l6-5h26l-6 5Z" fill="#f4f7f9" />
      <path d="M6 56h26v20H6Z" fill="url(#tg-shine)" />
      <text x="19" y="71" textAnchor="middle" fontFamily="'Lilita One', sans-serif" fontSize="13" fill="#566a75">2</text>

      {/* 3rd place */}
      <path d="M68 62h26v14H68Z" fill="url(#tg-bronze)" />
      <path d="M68 62l6-5h26l-6 5Z" fill="#f6c597" />
      <path d="M94 62l6-5v14l-6 5Z" fill="#8a4f1e" />
      <path d="M68 62h26v14H68Z" fill="url(#tg-shine)" />
      <text x="81" y="73" textAnchor="middle" fontFamily="'Lilita One', sans-serif" fontSize="11" fill="#6e3a12">3</text>

      {/* 1st place */}
      <path d="M32 44h36v32H32Z" fill="url(#tg-gold)" />
      <path d="M32 44l6-5h36l-6 5Z" fill="#fff0a0" />
      <path d="M68 44l6-5v32l-6 5Z" fill="#a86e00" />
      <path d="M32 44h36v32H32Z" fill="url(#tg-shine)" />
      <text x="50" y="68" textAnchor="middle" fontFamily="'Lilita One', sans-serif" fontSize="21" fill="#7a4d00" stroke="#fff0a0" strokeWidth=".5">1</text>

      {/* cup */}
      <g transform="translate(53 42) scale(.78) translate(-32 -58)">
        <ellipse cx="32" cy="58" rx="18" ry="3" fill="#000" opacity=".3" />
        <path d="M15 12H8c0 12 4 18 12 20" stroke="#8a5a00" strokeWidth="5.5" strokeLinecap="round" />
        <path d="M49 12h7c0 12-4 18-12 20" stroke="#8a5a00" strokeWidth="5.5" strokeLinecap="round" />
        <path d="M15 12H8c0 12 4 18 12 20" stroke="url(#tg-cup)" strokeWidth="4" strokeLinecap="round" />
        <path d="M49 12h7c0 12-4 18-12 20" stroke="url(#tg-cup)" strokeWidth="4" strokeLinecap="round" />
        <path d="M14 8h36v14c0 12-8 18-18 18S14 34 14 22V8Z" fill="url(#tg-cup)" stroke="#a86e00" strokeWidth="1" />
        <ellipse cx="32" cy="8" rx="18" ry="4" fill="#ffe27a" />
        <ellipse cx="32" cy="8.6" rx="15" ry="2.8" fill="#8a5a00" />
        <path d="M28 40h8l1 8H27l1-8Z" fill="url(#tg-cup)" />
        <rect x="22" y="47" width="20" height="5" rx="2" fill="url(#tg-cup)" />
        <rect x="17" y="51" width="30" height="8" rx="2.5" fill="url(#tg-base)" />
        <rect x="17" y="51" width="30" height="2.5" rx="1.2" fill="#fff" opacity=".3" />
        <path d="M20 14c0 11 4 17 8 20" stroke="#fff" strokeOpacity=".7" strokeWidth="3.2" strokeLinecap="round" />
        <path d="m32 15 2.3 4.7 5.1.7-3.7 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1-3.7-3.6 5.1-.7L32 15Z" fill="#fff3b0" stroke="#b8780a" strokeWidth=".8" strokeLinejoin="round" />
      </g>

      {/* sparkles */}
      <path d="M12 22 13.6 26.4 18 28 13.6 29.6 12 34 10.4 29.6 6 28 10.4 26.4Z" fill="#fff3b0" />
      <path d="M90 14 91.2 17.8 95 19 91.2 20.2 90 24 88.8 20.2 85 19 88.8 17.8Z" fill="#fff3b0" />
      <path d="M86 40 87 42.8 90 44 87 45.2 86 48 85 45.2 82 44 85 42.8Z" fill="#fff" opacity=".85" />
    </svg>
  );
}

const CSS = `
.hg-cards{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding-top:22px}
.hg-card{position:relative;height:112px;padding:0;border:0;border-radius:16px;cursor:pointer;color:#fff;
  font-family:'Lilita One',sans-serif;-webkit-tap-highlight-color:transparent;
  box-shadow:0 4px 0 rgba(0,0,0,.35),inset 0 2px 0 rgba(255,255,255,.35)}
.hg-card:active:not(:disabled){transform:translateY(2px);box-shadow:0 2px 0 rgba(0,0,0,.35),inset 0 2px 0 rgba(255,255,255,.35)}
.hg-card:disabled{filter:grayscale(.5) brightness(.8);cursor:default}
.hg-duel{background:linear-gradient(180deg,#ffb83d,#f2840a)}
.hg-tour{background:linear-gradient(180deg,#ab82ff,#6a3fe0)}
.hg-icon{position:absolute;left:0;right:0;top:-20px;height:94px;pointer-events:none}
.hg-icon svg{width:100%;height:100%}
.hg-text{position:absolute;left:0;right:0;bottom:0;height:38px;border-radius:0 0 16px 16px;
  background:rgba(0,0,0,.22);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.05}
.hg-text strong{font-size:16px;font-weight:400;letter-spacing:.3px;text-shadow:0 1px 0 rgba(0,0,0,.3)}
.hg-text small{font-size:11px;opacity:.9}
`;

export default function HomeGameCards({ loading, active, onChooseMatch, onChooseTournament }) {
  return (
    <>
      <style>{CSS}</style>
      <div className="hg-cards">
        <button type="button" className="hg-card hg-duel" disabled={loading} onClick={onChooseMatch}>
          <span className="hg-icon" aria-hidden="true"><DuelIcon /></span>
          <span className="hg-text">
            <strong>1 vs 1</strong>
            <small>Min bet 300</small>
          </span>
        </button>
        <button type="button" className="hg-card hg-tour" disabled={loading || !active} onClick={onChooseTournament}>
          <span className="hg-icon" aria-hidden="true"><TrophyIcon /></span>
          <span className="hg-text">
            <strong>Tournament</strong>
            <small>Join a bracket</small>
          </span>
        </button>
      </div>
    </>
  );
}