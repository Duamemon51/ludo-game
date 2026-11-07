import { useEffect, useState } from 'react';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const TURN = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };
const CUBE = [[1, 'rotateY(0deg)'], [6, 'rotateY(180deg)'], [3, 'rotateY(90deg)'], [4, 'rotateY(-90deg)'], [2, 'rotateX(90deg)'], [5, 'rotateX(-90deg)']];

function Dice() {
  const [roll, setRoll] = useState({ face: 5, spins: 0 });
  const rollDice = () => setRoll((r) => ({ face: 1 + Math.floor(Math.random() * 6), spins: r.spins + 2 }));
  useEffect(() => { const t = setTimeout(rollDice, 300); return () => clearTimeout(t); }, []);
  const [x, y] = TURN[roll.face];
  const turn = 360 * roll.spins;
  return (
    <div className="ls-dice" role="button" tabIndex={0} aria-label="Roll the dice" onClick={rollDice}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && rollDice()}>
      <div className="ls-cube" style={{ transform: `rotateX(${x + turn}deg) rotateY(${y + turn}deg)` }}>
        {CUBE.map(([n, t]) => (
          <div key={n} className={`ls-face f${n}`} style={{ transform: `${t} translateZ(24px)` }}>
            {Array.from({ length: 9 }, (_, i) => (PIPS[n].includes(i) ? <i key={i} /> : <b key={i} />))}
          </div>
        ))}
      </div>
      <span className="ls-dice-shadow" />
    </div>
  );
}

const UserIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4.5 4.2-6.5 8-6.5s7 2 8 6.5" /></svg>
);
const LockIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.5" r="1.2" fill="currentColor" /></svg>
);
const Spark = ({ cls }) => (
  <svg className={`ls-spark ${cls}`} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6Z" fill="#fcc419" stroke="#b97a00" strokeWidth="1" strokeLinejoin="round" /></svg>
);

const Yard = ({ pos, c, d }) => (
  <span className={`ls-yard ${pos}`} style={{ '--c': c, '--d': d }} aria-hidden="true">
    <span className="spot" /><span className="pawn" />
  </span>
);

export default function LoginScreen({ onSignIn, loading = false, error = '' }) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');

  return (
    <main className="ls">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lilita+One&family=Baloo+2:wght@500;700&display=swap');

        .ls {
          --ink: #3b1a4a; --muted: #7a5a88; --gold: #fcc419; --gold-d: #9a6f00; --focus: #8a55f0;
          position: relative; overflow: hidden; isolation: isolate;
          min-height: 100vh; min-height: 100dvh; width: 100%;
          display: grid; place-items: center;
          padding: max(20px, env(safe-area-inset-top)) 16px max(20px, env(safe-area-inset-bottom));
          font-family: 'Baloo 2', 'Trebuchet MS', system-ui, sans-serif; color: var(--ink);
          background: radial-gradient(120% 70% at 50% 20%, #8a2a7a 0%, #5a1b63 45%, #2a0b3a 100%);
          -webkit-tap-highlight-color: transparent;
        }
        .ls::before { content: ""; position: absolute; z-index: -1; left: 50%; top: 50%; width: 560px; height: 560px; max-width: 140vw; transform: translate(-50%, -50%); border-radius: 50%; background: radial-gradient(circle, #d35cf066 0%, #a03cc633 40%, transparent 70%); pointer-events: none; }

        /* tilted board scene (same as home) */
        .ls-scene { position: absolute; inset: 0; z-index: -1; perspective: 700px; pointer-events: none;
          -webkit-mask-image: linear-gradient(#000 30%, transparent 85%); mask-image: linear-gradient(#000 30%, transparent 85%); }
        .ls-board {
          position: absolute; top: 2%; left: 50%; width: min(150%, 1300px); aspect-ratio: 1;
          transform: translateX(-50%) rotateX(58deg) rotateZ(-24deg);
          display: grid; grid-template: repeat(3, 1fr) / repeat(3, 1fr); gap: 5px; padding: 8px;
          border-radius: 18px; background: #4a1a5e; opacity: .4; box-shadow: 0 0 0 6px #7b2f9e;
        }
        .ls-board div { border-radius: 10px; background: #f6e7bd; }
        .ls-board .c { background: radial-gradient(circle, #fff 0 26%, transparent 27%), var(--c); }
        .ls-board .mid { background: conic-gradient(from 45deg, #3fa34d 0 25%, #fcc419 0 50%, #1e88e5 0 75%, #e53935 0); }
        .ls-board .t { background: repeating-linear-gradient(90deg, #f6e7bd 0 18px, #d9c28a 18px 20px); }

        /* purple frame */
        .ls-card {
          position: relative; width: min(100%, 410px); padding: 14px; border-radius: 28px;
          background:
            repeating-linear-gradient(90deg, #00000017 0 1px, transparent 1px 6px, #ffffff0d 6px 7px, transparent 7px 13px),
            linear-gradient(180deg, #7d2f8f 0%, #5a1f6e 55%, #451552 100%);
          box-shadow: inset 0 3px 0 #ffffff40, inset 0 -4px 0 #0004, 0 0 0 3px #e0a000, 0 0 0 5px #240a35, 0 12px 0 #1a0626, 0 30px 50px #0009;
        }
        .ls-card::before { content: ""; position: absolute; inset: 6px; border-radius: 22px; pointer-events: none; border: 1.5px solid #ffffff4d; }
        .ls-screw { position: absolute; width: 11px; height: 11px; border-radius: 50%; z-index: 3;
          background: radial-gradient(circle at 35% 30%, #fff6c9, #d4a73a 45%, #7a5a10); box-shadow: 0 1px 2px rgba(0,0,0,.6); }
        .ls-screw::after { content: ""; position: absolute; left: 2px; right: 2px; top: 50%; height: 1.5px; background: rgba(60,40,0,.6); transform: rotate(35deg); }
        .ls-screw:nth-of-type(1) { top: 3px; left: 3px; } .ls-screw:nth-of-type(2) { top: 3px; right: 3px; }
        .ls-screw:nth-of-type(3) { bottom: 3px; left: 3px; } .ls-screw:nth-of-type(4) { bottom: 3px; right: 3px; }

        /* cream panel with corner yards */
        .ls-in {
          position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 12px;
          padding: 20px 20px 46px; border-radius: 16px;
          background: radial-gradient(120% 80% at 50% 0%, #fffdf4 0%, #fbefcf 60%, #f1dfb2 100%);
          box-shadow: inset 0 4px 10px #3c1e0059, inset 0 0 0 2px #ffdc8259;
        }
        .ls-in > * { position: relative; z-index: 1; }
        .ls-yard {
          position: absolute; z-index: 0; width: 84px; height: 84px; border-radius: 18px;
          background: linear-gradient(135deg, color-mix(in srgb, var(--c) 70%, #fff), var(--c) 55%, var(--d));
          box-shadow: inset 0 0 0 3px rgba(0,0,0,.18), inset 0 3px 0 rgba(255,255,255,.4);
        }
        .ls-yard.tl { top: -40px; left: -40px; } .ls-yard.tr { top: -40px; right: -40px; }
        .ls-yard.bl { bottom: -80px; left: -40px; } .ls-yard.br { bottom: -80px; right: -40px; }
        .ls-yard .spot { position: absolute; width: 36px; height: 36px; border-radius: 50%;
          background: radial-gradient(circle at 50% 35%, #fff, #ece6d4); box-shadow: inset 0 3px 5px rgba(0,0,0,.35); }
        .tl .spot { right: 4px; bottom: 4px; } .tr .spot { left: 4px; bottom: 4px; } .bl .spot { right: 4px; top: 4px; } .br .spot { left: 4px; top: 4px; }
        .ls-yard .pawn { position: absolute; width: 22px; height: 34px; filter: drop-shadow(0 3px 2px rgba(0,0,0,.5)); }
        .tl .pawn { right: 11px; bottom: 6px; } .tr .pawn { left: 11px; bottom: 6px; } .bl .pawn { right: 11px; top: 6px; } .br .pawn { left: 11px; top: 6px; }
        .ls-yard .pawn::before { content: ""; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 13px; height: 13px; border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, #fff 0 10%, color-mix(in srgb, var(--c) 55%, #fff) 28%, var(--c) 65%, var(--d) 100%); }
        .ls-yard .pawn::after { content: ""; position: absolute; bottom: 0; left: 0; right: 0; height: 24px; border-radius: 45% 45% 6px 6px / 85% 85% 6px 6px;
          background: linear-gradient(90deg, var(--d), var(--c) 28%, color-mix(in srgb, var(--c) 55%, #fff) 45%, var(--c) 62%, var(--d)); box-shadow: inset 0 -4px 0 rgba(0,0,0,.25); }

        /* header */
        .ls-head { display: flex; flex-direction: column; align-items: center; }
        .ls-dice { position: relative; width: 48px; height: 48px; margin: 2px 0 12px; perspective: 360px; cursor: pointer; outline: none; }
        .ls-dice:focus-visible .ls-cube { outline: 3px solid var(--focus); outline-offset: 6px; border-radius: 10px; }
        .ls-cube { position: relative; width: 48px; height: 48px; transform-style: preserve-3d; transition: transform .45s cubic-bezier(.2,.9,.25,1.05); }
        .ls-face { position: absolute; inset: 0; display: grid; grid-template: repeat(3, 1fr) / repeat(3, 1fr); padding: 7px; border-radius: 9px; backface-visibility: hidden;
          background: radial-gradient(circle at 30% 25%, #fff, #f6f1e4 60%, #ddd5c0); box-shadow: inset 0 0 0 1px rgba(0,0,0,.12), inset -3px -3px 6px rgba(0,0,0,.12); }
        .ls-face i { width: 9px; height: 9px; margin: auto; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #5a4a3a, #140b04); box-shadow: 0 1px 0 #fff; }
        .ls-face.f1 i { width: 13px; height: 13px; background: radial-gradient(circle at 35% 30%, #ff7b73, #b71c1c); }
        .ls-dice-shadow { position: absolute; left: 5px; right: 5px; bottom: -10px; height: 9px; border-radius: 50%; background: rgba(60,30,0,.4); filter: blur(4px); }
        .ls-title { margin: 0; font-family: 'Lilita One', 'Baloo 2', sans-serif; font-weight: 400; font-size: 60px; line-height: 1; letter-spacing: 3px; }
        .ls-head { position: relative; }
        .ls-spark { position: absolute; width: 18px; height: 18px; filter: drop-shadow(0 2px 1px #0004); }
        .ls-spark.a { top: 4px; left: 6px; } .ls-spark.b { top: 30px; right: 4px; width: 13px; height: 13px; } .ls-spark.c { top: 70px; left: 14px; width: 11px; height: 11px; }
        .ls-title span { display: inline-block; color: var(--c);
          text-shadow: 0 1px 0 var(--d), 0 2px 0 var(--d), 0 3px 0 var(--d), 0 4px 0 var(--d), 0 5px 0 var(--d), 0 9px 8px rgba(0,0,0,.4);
          -webkit-text-stroke: 1.5px rgba(255,255,255,.55); paint-order: stroke fill; }
        .ls-heading { margin: 14px 0 0; padding: 5px 30px 6px; border-radius: 99px; color: #fff; font-family: 'Lilita One', sans-serif; font-weight: 400; font-size: 21px; letter-spacing: .05em; text-transform: uppercase; text-align: center;
          background: linear-gradient(180deg, #ab5cca, #6a2287 55%, #561a72); box-shadow: inset 0 0 0 2px #fcc419, inset 0 2px 0 #ffffff59, 0 3px 0 #3d1456, 0 7px 10px #0004; text-shadow: 0 1px 0 #0004; }
        .ls-desc { margin: 0; font-size: 14px; font-weight: 700; color: var(--muted); text-align: center; }

        /* fields */
        .ls-field { display: flex; flex-direction: column; gap: 6px; }
        .ls-field label { font-size: 14px; font-weight: 700; }
        .ls-inp { position: relative; }
        .ls-inp svg { position: absolute; left: 14px; top: 50%; width: 21px; height: 21px; transform: translateY(-50%); color: #8a55f0; pointer-events: none; }
        .ls-field input {
          width: 100%; padding-left: 44px !important; min-height: 48px; padding: 0 14px; font: inherit; font-weight: 700; font-size: 16px; color: var(--ink);
          background: linear-gradient(180deg, #f4e6c1, #fff9e6); border: 0; border-radius: 14px; outline: none;
          box-shadow: inset 0 3px 6px rgba(70,40,0,.4), inset 0 0 0 2px #d6bd85, 0 2px 0 rgba(255,255,255,.8);
        }
        .ls-field input::placeholder { color: #b49c70; font-weight: 500; }
        .ls-field input:focus { box-shadow: inset 0 3px 6px rgba(70,40,0,.35), inset 0 0 0 3px var(--focus), 0 2px 0 rgba(255,255,255,.8); }

        /* buttons */
        .ls-btn {
          position: relative; overflow: hidden; min-height: 50px; padding: 0 14px; border: 0; border-radius: 14px; cursor: pointer;
          font-family: 'Lilita One', sans-serif; font-size: 18px; letter-spacing: .4px;
          transition: transform .08s, box-shadow .08s;
        }
        .ls-btn.gold { margin-top: 4px; min-height: 56px; font-size: 24px; letter-spacing: .06em; text-transform: uppercase; color: #4a3000; text-shadow: 0 1px 0 rgba(255,255,255,.6);
          background: linear-gradient(180deg, #fff1a8, var(--gold) 45%, #e0a000);
          box-shadow: inset 0 0 0 2px rgba(255,255,255,.55), inset 0 -3px 0 rgba(0,0,0,.12), 0 5px 0 var(--gold-d), 0 10px 14px rgba(0,0,0,.3); }
        .ls-btn.gold::after { content: ""; position: absolute; left: 6px; right: 6px; top: 3px; height: 40%; border-radius: 10px 10px 30px 30px / 10px; background: linear-gradient(180deg, rgba(255,255,255,.4), rgba(255,255,255,0)); pointer-events: none; }
        .ls-btn.gold:active { transform: translateY(3px); box-shadow: inset 0 0 0 2px rgba(255,255,255,.55), 0 1px 0 var(--gold-d), 0 3px 6px rgba(0,0,0,.3); }
        .ls-btn:disabled { cursor: not-allowed; filter: grayscale(.5); opacity: .6; transform: none; }
        .ls-btn:focus-visible { outline: 3px solid var(--ink); outline-offset: 3px; }
        .ls-note { margin: -2px 0 0; font-size: 12px; font-weight: 500; line-height: 1.4; color: var(--muted); text-align: center; }
        .ls-note[role="alert"] { color: #b42318; font-weight: 700; }

        @media (max-height: 720px) {
          .ls { padding: 10px 12px; }
          .ls-card { padding: 10px; }
          .ls-in { gap: 8px; padding: 14px 14px 34px; }
          .ls-dice { margin: 0 0 4px; }
          .ls-heading { margin-top: 8px; }
          .ls-title { font-size: 42px; }
          .ls-field input { min-height: 44px; }
          .ls-btn.gold { min-height: 50px; }
        }
        @media (max-width: 480px) {
          .ls { width: 100%; }
          .ls-card { width: 100%; }
          .ls-yard.bl, .ls-yard.br { display: none; }
        }
        @media (prefers-reduced-motion: reduce) { .ls-cube, .ls-btn { transition: none; } }
      `}</style>

      <div className="ls-scene" aria-hidden="true">
        <div className="ls-board">
          <div className="c" style={{ '--c': '#e53935' }} /><div className="t" /><div className="c" style={{ '--c': '#3fa34d' }} />
          <div className="t" /><div className="mid" /><div className="t" />
          <div className="c" style={{ '--c': '#1e88e5' }} /><div className="t" /><div className="c" style={{ '--c': '#fcc419' }} />
        </div>
      </div>

      <form
        className="ls-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSignIn({ loginId, password });
        }}
      >
        <i className="ls-screw" /><i className="ls-screw" /><i className="ls-screw" /><i className="ls-screw" />
        <div className="ls-in">
          <Yard pos="tl" c="#e53935" d="#8e1b1b" />
          <Yard pos="tr" c="#3fa34d" d="#17531f" />
          <Yard pos="bl" c="#1e88e5" d="#0b3f8c" />
          <Yard pos="br" c="#fcc419" d="#9a6f00" />

          <div className="ls-head">
            <Spark cls="a" /><Spark cls="b" /><Spark cls="c" />
            <Dice />
            <h1 className="ls-title" aria-label="Ludo">
              <span style={{ '--c': '#e53935', '--d': '#8e1b1b' }}>L</span>
              <span style={{ '--c': '#3fa34d', '--d': '#17531f' }}>u</span>
              <span style={{ '--c': '#fcc419', '--d': '#9a6f00' }}>d</span>
              <span style={{ '--c': '#1e88e5', '--d': '#0b3f8c' }}>o</span>
            </h1>
            <h2 className="ls-heading">Welcome back</h2>
          </div>
          <div className="ls-field">
            <label htmlFor="login-id">Login ID</label>
            <div className="ls-inp">{UserIcon}<input id="login-id" type="text" autoComplete="username" placeholder="Enter your Login ID"
              value={loginId} onChange={(event) => setLoginId(event.target.value)} required /></div>
          </div>
          <div className="ls-field">
            <label htmlFor="login-password">Password</label>
            <div className="ls-inp">{LockIcon}<input id="login-password" type="password" autoComplete="current-password"
              placeholder="Enter your password"
              value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
          </div>

          {error && <p className="ls-note" role="alert">{error}</p>}
          <button className="ls-btn gold" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in  ▶'}
          </button>
        </div>
      </form>
    </main>
  );
}