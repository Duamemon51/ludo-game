import HomeDice from "./HomeDice";

const COLORS = { red: ["#e53935", "#8e1b1b"], green: ["#3fa34d", "#17531f"], yellow: ["#fcc419", "#9a6f00"], blue: ["#1e88e5", "#0b3f8c"] };

const Pawn = ({ k }) => <span className="lh-pawn" style={{ "--pc": COLORS[k][0], "--pd": COLORS[k][1] }} aria-hidden="true" />;

export default function HomeMenu({
  name, onNameChange, onFindMatch, onCreateRoom, joinCode, onJoinCodeChange, onJoinRoom,
}) {
  const mode = 2;
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="lh">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lilita+One&family=Baloo+2:wght@500;700&display=swap');

        .lh {
          --ink: #3b2412; --gold: #fcc419; --gold-d: #9a6f00;
          position: relative; overflow: hidden; isolation: isolate;
          width: 100%;
          min-height: 100vh; min-height: 100dvh;
          display: flex; flex-direction: column;
          padding-top: env(safe-area-inset-top, 0px);
          font-family: 'Baloo 2', 'Trebuchet MS', system-ui, sans-serif;
          color: #fff;
          background: radial-gradient(120% 70% at 50% 25%, #5a3418 0%, #2b1608 55%, #120a04 100%);
          -webkit-tap-highlight-color: transparent;
        }

        /* ---------- tilted Ludo board scene ---------- */
        .lh-scene { position: absolute; inset: 0; z-index: -1; perspective: 700px; pointer-events: none;
          -webkit-mask-image: linear-gradient(#000 35%, transparent 80%); mask-image: linear-gradient(#000 35%, transparent 80%); }
        .lh-board {
          position: absolute; top: 2%; left: 50%; width: min(150%, 1300px); aspect-ratio: 1;
          transform: translateX(-50%) rotateX(58deg) rotateZ(-24deg);
          display: grid; grid-template: repeat(3, 1fr) / repeat(3, 1fr); gap: 5px; padding: 8px;
          border-radius: 18px; background: #5b3a1e; opacity: .6;
          box-shadow: 0 0 0 6px #8a4d20;
        }
        .lh-board div { border-radius: 10px; background: #f6e7bd; }
        .lh-board .c { background: radial-gradient(circle at 50% 50%, #fff 0 26%, transparent 27%), var(--c); }
        .lh-board .mid { background: conic-gradient(from 45deg, #3fa34d 0 25%, #fcc419 0 50%, #1e88e5 0 75%, #e53935 0); }
        .lh-board .t { background: repeating-linear-gradient(90deg, #f6e7bd 0 18px, #d9c28a 18px 20px); }

        /* ---------- top: player chip ---------- */
        .lh-top { display: flex; padding: 14px 16px 0; }
        .lh-chip {
          display: flex; align-items: center; gap: 10px; padding: 5px 16px 5px 5px; min-height: 48px;
          background: rgba(20,10,4,.55); border-radius: 999px;
          box-shadow: inset 0 0 0 1.5px rgba(255,220,130,.5), 0 4px 10px rgba(0,0,0,.35);
          backdrop-filter: blur(4px);
        }
        .lh-chip:focus-within { box-shadow: inset 0 0 0 2px var(--gold), 0 4px 10px rgba(0,0,0,.35); }
        .lh-avatar {
          flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center;
          font-family: 'Lilita One', sans-serif; font-size: 20px; color: #fff; text-shadow: 0 1px 0 rgba(0,0,0,.3);
          background: radial-gradient(circle at 35% 30%, #ff8a80, #e53935 55%, #8e1b1b);
          box-shadow: inset 0 0 0 2px rgba(255,255,255,.35), 0 2px 3px rgba(0,0,0,.4);
        }
        .lh-chip input {
          width: 9.5em; min-width: 0; padding: 4px 0; background: none; border: 0; outline: none;
          font: inherit; font-size: 17px; font-weight: 700; color: #fff;
        }
        .lh-chip input::placeholder { color: rgba(255,255,255,.5); }
        .lh-chip small { font-size: 13px; color: rgba(255,230,170,.8); }

        /* ---------- hero ---------- */
        .lh-hero { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 8px 16px; }
        .lh-title { margin: 0; font-family: 'Lilita One', 'Baloo 2', sans-serif; font-weight: 400; font-size: 72px; line-height: 1; letter-spacing: 3px; }
        .lh-title span {
          display: inline-block; color: var(--c);
          text-shadow: 0 1px 0 var(--d), 0 2px 0 var(--d), 0 3px 0 var(--d), 0 4px 0 var(--d), 0 5px 0 var(--d), 0 6px 0 var(--d), 0 12px 10px rgba(0,0,0,.5);
          -webkit-text-stroke: 1.5px rgba(255,255,255,.5); paint-order: stroke fill;
        }
        .lh-sub { margin: 4px 0 0; font-size: 16px; font-weight: 700; color: rgba(255,235,190,.85); }

        .lh-pawns { display: flex; gap: 14px; margin-top: 16px; }
        .lh-pawn { position: relative; display: block; width: 22px; height: 34px; transform: scale(1.15); filter: drop-shadow(0 4px 3px rgba(0,0,0,.55)); }
        .lh-pawn::before {
          content: ""; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 13px; height: 13px; border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, #fff 0 10%, color-mix(in srgb, var(--pc) 55%, #fff) 28%, var(--pc) 65%, var(--pd) 100%);
        }
        .lh-pawn::after {
          content: ""; position: absolute; bottom: 0; left: 0; right: 0; height: 24px; border-radius: 45% 45% 6px 6px / 85% 85% 6px 6px;
          background: linear-gradient(90deg, var(--pd) 0%, var(--pc) 28%, color-mix(in srgb, var(--pc) 55%, #fff) 45%, var(--pc) 62%, var(--pd) 100%);
          box-shadow: inset 0 -4px 0 rgba(0,0,0,.25);
        }

        /* ---------- bottom sheet: thumb zone ---------- */
        .lh-sheet {
          display: flex; flex-direction: column; gap: 12px;
          padding: 18px 16px calc(18px + env(safe-area-inset-bottom, 0px));
          border-radius: 28px 28px 0 0; color: var(--ink);
          background:
            repeating-linear-gradient(90deg, rgba(0,0,0,.09) 0 1px, transparent 1px 6px, rgba(255,255,255,.05) 6px 7px, transparent 7px 13px),
            linear-gradient(180deg, #b36a2f, #8a4d20 45%, #6b3a17);
          box-shadow: inset 0 3px 0 rgba(255,255,255,.3), inset 0 0 0 1.5px rgba(255,220,130,.35), 0 -10px 30px rgba(0,0,0,.45);
        }
        .lh button, .lh .lh-chip input { font-family: inherit; }
        .lh-seg { display: flex; padding: 4px; gap: 4px; border-radius: 16px; background: rgba(40,20,6,.65); box-shadow: inset 0 3px 6px rgba(0,0,0,.5); }
        .lh-seg button {
          flex: 1; min-height: 46px; border: 0; border-radius: 12px; cursor: pointer; background: transparent;
          font-family: 'Lilita One', sans-serif; font-size: 18px; letter-spacing: .3px; color: rgba(255,235,190,.7);
          transition: background .15s, color .15s;
        }
        .lh-seg button[aria-pressed="true"] {
          color: var(--ink); background: linear-gradient(180deg, #fff7d6, #f1d68a);
          box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.7), 0 2px 0 #8a6a1c, 0 4px 6px rgba(0,0,0,.3);
        }

        .lh-play {
          position: relative; overflow: hidden; min-height: 66px; border: 0; border-radius: 20px; cursor: pointer;
          font-family: 'Lilita One', sans-serif; font-size: 30px; letter-spacing: 1px; color: #4a3000; text-shadow: 0 1px 0 rgba(255,255,255,.6);
          background: linear-gradient(180deg, #fff1a8 0%, var(--gold) 45%, #e0a000 100%);
          box-shadow: inset 0 0 0 2px rgba(255,255,255,.55), inset 0 -4px 0 rgba(0,0,0,.12), 0 6px 0 var(--gold-d), 0 12px 18px rgba(0,0,0,.4);
          transition: transform .08s, box-shadow .08s;
        }
        .lh-play::before {
          content: ""; position: absolute; top: 0; bottom: 0; width: 40%; left: -60%; transform: skewX(-20deg);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.65), transparent);
          animation: lh-shine 3.6s ease-in-out 1s infinite;
        }
        @keyframes lh-shine { 0%, 55% { left: -60%; } 100% { left: 130%; } }
        .lh-play:active { transform: translateY(4px); box-shadow: inset 0 0 0 2px rgba(255,255,255,.55), 0 2px 0 var(--gold-d), 0 4px 8px rgba(0,0,0,.4); }

        .lh-note { margin: -2px 0 0; text-align: center; font-size: 13px; font-weight: 500; color: rgba(255,235,190,.85); }
        .lh-track { display: flex; align-items: center; gap: 10px; margin-top: 2px; }
        .lh-track span { font-family: 'Lilita One', sans-serif; font-size: 16px; color: #ffe9b0; white-space: nowrap; text-shadow: 0 1px 0 rgba(0,0,0,.4); }
        .lh-track::before, .lh-track::after {
          content: ""; flex: 1; height: 10px; border-radius: 3px; box-shadow: 0 0 0 2px #3a1f0c, 0 2px 3px rgba(0,0,0,.3);
          background: repeating-linear-gradient(90deg, #e53935 0 10px, transparent 10px 12px, #3fa34d 12px 22px, transparent 22px 24px, #fcc419 24px 34px, transparent 34px 36px, #1e88e5 36px 46px, transparent 46px 48px);
        }

        .lh-row { display: flex; gap: 10px; }
        .lh-row > * { flex: 1; min-width: 0; }
        .lh-sec {
          min-height: 50px; border: 0; border-radius: 14px; cursor: pointer;
          font-family: 'Lilita One', sans-serif; font-size: 17px; color: #fff; text-shadow: 0 1px 0 rgba(0,0,0,.3);
          background: linear-gradient(180deg, #62c06f, #3fa34d 55%, #2f8a3c);
          box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.25), 0 3px 0 #17531f, 0 6px 8px rgba(0,0,0,.25);
        }
        .lh-sec.blue { background: linear-gradient(180deg, #5eb0ff, #1e88e5 55%, #1670c4); box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.25), 0 3px 0 #0b3f8c, 0 6px 8px rgba(0,0,0,.25); }
        .lh-sec:active { transform: translateY(2px); }
        .lh-code {
          min-height: 50px; padding: 0 12px; border: 0; border-radius: 14px; outline: none; text-align: center;
          font: inherit; font-size: 20px; font-weight: 700; letter-spacing: 5px; text-transform: uppercase; color: var(--ink);
          background: linear-gradient(180deg, #f4e6c1, #fff9e6);
          box-shadow: inset 0 3px 6px rgba(70,40,0,.4), inset 0 0 0 2px #d6bd85;
        }
        .lh-code::placeholder { color: #b49c70; letter-spacing: 3px; }
        .lh-code:focus { box-shadow: inset 0 3px 6px rgba(70,40,0,.35), inset 0 0 0 3px #1e88e5; }
        .lh button:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }

        /* tablet / small laptop: centred column */
        @media (min-width: 600px) {
          .lh-top { padding: 24px 28px 0; }
          .lh-sheet { width: min(100% - 32px, 460px); margin: 0 auto 28px; border-radius: 28px; }
        }
        /* desktop: hero on the left, play card on the right, full screen */
        @media (min-width: 900px) {
          .lh { display: grid; grid-template-columns: minmax(0, 1fr) 460px; grid-template-rows: auto 1fr; padding-right: 6vw; }
          .lh-top { grid-column: 1 / -1; }
          .lh-hero { grid-column: 1; grid-row: 2; }
          .lh-sheet { grid-column: 2; grid-row: 2; align-self: center; width: auto; margin: 0; }
          .lh-title { font-size: 112px; } .lh-sub { font-size: 20px; }
          .lh-dice { transform: scale(1.7); margin: 20px 0 40px; } .lh-pawns { gap: 22px; margin-top: 28px; }
        }
        @media (max-height: 700px) {
          .lh-title { font-size: 54px; } .lh-pawns { margin-top: 8px; }
        }
        @media (prefers-reduced-motion: reduce) { .lh-seg button { transition: none; } .lh-play::before { animation: none; } }
      `}</style>

      <div className="lh-scene" aria-hidden="true">
        <div className="lh-board">
          <div className="c" style={{ "--c": "#e53935" }} /><div className="t" /><div className="c" style={{ "--c": "#3fa34d" }} />
          <div className="t" /><div className="mid" /><div className="t" />
          <div className="c" style={{ "--c": "#1e88e5" }} /><div className="t" /><div className="c" style={{ "--c": "#fcc419" }} />
        </div>
      </div>

      <header className="lh-top">
        <label className="lh-chip">
          <span className="lh-avatar" aria-hidden="true">{initial}</span>
          <input
            value={name}
            maxLength={15}
            placeholder="Your name"
            aria-label="Your name"
            enterKeyHint="done"
            onChange={(event) => onNameChange(event.target.value)}
          />
          <small aria-hidden="true">Edit</small>
        </label>
      </header>

      <main className="lh-hero">
        <HomeDice />
        <h1 className="lh-title" aria-label="Ludo">
          <span style={{ "--c": "#e53935", "--d": "#8e1b1b" }}>L</span>
          <span style={{ "--c": "#3fa34d", "--d": "#17531f" }}>u</span>
          <span style={{ "--c": "#fcc419", "--d": "#9a6f00" }}>d</span>
          <span style={{ "--c": "#1e88e5", "--d": "#0b3f8c" }}>o</span>
        </h1>
        <p className="lh-sub">Roll the dice. Race home.</p>
        <div className="lh-pawns"><Pawn k="red" /><Pawn k="green" /><Pawn k="yellow" /><Pawn k="blue" /></div>
      </main>

      <section className="lh-sheet">
        <button className="lh-play" onClick={() => onFindMatch(mode)}>Play now</button>
        <p className="lh-note">No one joins in 8 seconds? Bots take the empty seats.</p>

        <div className="lh-track"><span>Play with friends</span></div>
        <button className="lh-sec" onClick={() => onCreateRoom(mode)}>Create room</button>
        <div className="lh-row">
          <input
            className="lh-code"
            placeholder="CODE"
            aria-label="Room code"
            autoCapitalize="characters"
            autoComplete="off"
            value={joinCode}
            maxLength={5}
            onChange={(event) => onJoinCodeChange(event.target.value.toUpperCase())}
          />
          <button className="lh-sec blue" onClick={onJoinRoom}>Join room</button>
        </div>
      </section>
    </div>
  );
}