export default function MatchmakingScreen({ secondsLeft, onCancel }) {
  return (
    <div className="matchmaking-overlay">
      <section
        className="matchmaking-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="matchmaking-title"
        aria-describedby="matchmaking-countdown"
      >
        <div className="matchmaking-spinner" aria-hidden="true" />
        <h2 id="matchmaking-title">Finding players</h2>
        <p id="matchmaking-countdown">Searching for an opponent · {secondsLeft}s</p>
        <button type="button" className="matchmaking-cancel" onClick={onCancel}>Cancel</button>
      </section>
      <style>{`
        .matchmaking-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(15, 8, 3, .64);
          backdrop-filter: blur(4px);
          animation: matchmaking-fade-in .18s ease-out;
        }
        .matchmaking-modal {
          display: flex;
          width: min(100%, 310px);
          flex-direction: column;
          align-items: center;
          gap: 10px;
          box-sizing: border-box;
          border: 1px solid #d5a928;
          border-radius: 22px;
          padding: 25px 22px 22px;
          color: #3b2412;
          background: linear-gradient(155deg, #fffdf5, #fbefcf 70%, #f1dfb2);
          box-shadow: inset 0 2px 0 #fff, 0 9px 0 #704217, 0 24px 55px #0008;
          text-align: center;
          animation: matchmaking-pop-in .22s cubic-bezier(.2, .8, .2, 1);
        }
        .matchmaking-spinner {
          width: 42px;
          height: 42px;
          border: 5px solid #ead8aa;
          border-top-color: #e0a000;
          border-right-color: #3fa34d;
          border-radius: 50%;
          animation: matchmaking-spin .5s linear infinite;
        }
        .matchmaking-modal h2 { margin: 3px 0 0; font-size: 21px; }
        .matchmaking-modal p { margin: 0 0 8px; color: #715637; font-size: 13px; }
        .matchmaking-cancel {
          width: 100%;
          min-height: 42px;
          border: 1px solid #b53a32;
          border-radius: 12px;
          color: #fff;
          background: linear-gradient(180deg, #ff6b66, #e53935 65%, #c62828);
          box-shadow: 0 3px 0 #8e1b1b;
          font: 800 15px system-ui, sans-serif;
          cursor: pointer;
        }
        .matchmaking-cancel:active { transform: translateY(2px); box-shadow: 0 1px 0 #8e1b1b; }
        @keyframes matchmaking-spin { to { transform: rotate(360deg); } }
        @keyframes matchmaking-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes matchmaking-pop-in { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @media (prefers-reduced-motion: reduce) {
          .matchmaking-overlay, .matchmaking-modal { animation: none; }
          .matchmaking-spinner { animation-duration: .5s; }
        }
      `}</style>
    </div>
  );
}
