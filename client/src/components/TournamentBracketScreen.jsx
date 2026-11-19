export default function TournamentBracketScreen({ matches, yourSlot }) {
  return (
    <div className="tournament-pool-overlay">
      <section
        className="tournament-pool"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tournament-pool-title"
      >
        <div className="tournament-pool-kicker">8-player knockout</div>
        <h1 id="tournament-pool-title">Tournament pool</h1>
        <p className="tournament-pool-subtitle">Quarter-finals · Matches start shortly</p>
        <div className="tournament-pool-grid">
          {matches.map((match) => {
            const isYourMatch = match.players.some((player) => player.slot === yourSlot);
            return (
              <article
                className={`tournament-pool-match${isYourMatch ? ' your-match' : ''}`}
                key={match.match}
              >
                <div className="tournament-pool-match-title">
                  <strong>Match {match.match}</strong>
                  {isYourMatch && <span>Your match</span>}
                </div>
                <div className="tournament-pool-player">{match.players[0].name}</div>
                <div className="tournament-pool-vs">VS</div>
                <div className="tournament-pool-player">{match.players[1].name}</div>
              </article>
            );
          })}
        </div>
        <div className="tournament-pool-starting" role="status">
          <span className="tournament-pool-spinner" aria-hidden="true" />
          Preparing matches
        </div>
      </section>
      <style>{`
        .tournament-pool-overlay {
          position: fixed;
          inset: 0;
          z-index: 120;
          display: grid;
          place-items: center;
          overflow-y: auto;
          padding: 18px;
          background: rgba(15, 8, 3, .72);
          backdrop-filter: blur(5px);
        }
        .tournament-pool {
          width: min(100%, 560px);
          max-height: calc(100dvh - max(24px, env(safe-area-inset-top)) - max(24px, env(safe-area-inset-bottom)));
          overflow-y: auto;
          overscroll-behavior: contain;
          box-sizing: border-box;
          border: 1px solid #d5a928;
          border-radius: 22px;
          padding: 22px;
          color: #3b2412;
          background: linear-gradient(155deg, #fffdf5, #fbefcf 70%, #f1dfb2);
          box-shadow: inset 0 2px 0 #fff, 0 9px 0 #704217, 0 24px 55px #0008;
          text-align: center;
          animation: tournament-pool-enter .2s ease-out;
        }
        .tournament-pool-kicker { color: #9a6f00; font-size: 11px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
        .tournament-pool h1 { margin: 3px 0 0; font: 400 28px/1.15 'Lilita One', 'Baloo 2', system-ui, sans-serif; }
        .tournament-pool-subtitle { margin: 5px 0 16px; color: #715637; font-size: 13px; font-weight: 700; }
        .tournament-pool-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; text-align: left; }
        .tournament-pool-match { min-width: 0; border: 1px solid #ead9aa; border-radius: 13px; padding: 10px; background: #fff9e9; }
        .tournament-pool-match.your-match { border-color: #d89a19; box-shadow: inset 0 0 0 1px #fcc41980, 0 0 0 2px #fcc41930; }
        .tournament-pool-match-title { display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-bottom: 7px; color: #806646; font-size: 11px; }
        .tournament-pool-match-title span { border-radius: 99px; padding: 2px 6px; color: #4a3000; background: #ffe49a; font-size: 9px; font-weight: 900; }
        .tournament-pool-player { overflow: hidden; border-radius: 7px; padding: 5px 7px; color: #3b2412; background: #f3e5c4; font-size: 13px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
        .tournament-pool-vs { margin: 3px 0; color: #9a6f00; font-size: 10px; font-weight: 900; text-align: center; }
        .tournament-pool-starting { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 15px; color: #715637; font-size: 12px; font-weight: 700; }
        .tournament-pool-spinner { width: 15px; height: 15px; border: 3px solid #ead8aa; border-top-color: #e0a000; border-radius: 50%; animation: tournament-pool-spin .7s linear infinite; }
        @keyframes tournament-pool-spin { to { transform: rotate(360deg); } }
        @keyframes tournament-pool-enter { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @media (max-width: 420px) {
          .tournament-pool-overlay {
            place-items: center;
            padding: max(8px, env(safe-area-inset-top)) 10px max(8px, env(safe-area-inset-bottom));
          }
          .tournament-pool {
            width: 100%;
            max-height: calc(100dvh - max(16px, env(safe-area-inset-top)) - max(16px, env(safe-area-inset-bottom)));
            border-radius: 18px;
            padding: 16px 12px;
          }
          .tournament-pool h1 { font-size: 25px; }
          .tournament-pool-subtitle { margin-bottom: 12px; font-size: 12px; }
          .tournament-pool-grid { gap: 7px; }
          .tournament-pool-match { padding: 7px; border-radius: 10px; }
          .tournament-pool-match-title { flex-wrap: wrap; font-size: 10px; }
          .tournament-pool-player {
            min-height: 30px;
            display: flex;
            align-items: center;
            overflow-wrap: anywhere;
            padding: 5px;
            font-size: 11px;
            white-space: normal;
          }
          .tournament-pool-starting { margin-top: 11px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .tournament-pool, .tournament-pool-spinner { animation: none; }
        }
      `}</style>
    </div>
  );
}
