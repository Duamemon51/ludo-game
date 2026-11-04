export default function GameExitButton({ onClick }) {
  return (
    <>
      <style>{`
        .game-exit-button {
          position: fixed;
          top: max(2px, env(safe-area-inset-top));
          right: max(8px, env(safe-area-inset-right));
          z-index: 35;
          padding: 4px;
        }
        .game-exit-button button {
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border: 2px solid #fff;
          border-radius: 8px; /* round ki jagah rounded-square */
          background: linear-gradient(180deg, #ff5a5a, #c62828);
          color: #fff;
          box-shadow: 0 3px 0 #8e1b1b, 0 6px 10px rgba(0, 0, 0, .35), inset 0 2px 0 rgba(255, 255, 255, .4);
          cursor: pointer;
          padding: 0;
        }
        .game-exit-button button:active {
          transform: translateY(2px);
          box-shadow: 0 1px 0 #8e1b1b;
        }
        @media (max-width: 600px) {
          .game-exit-button {
            top: 0;
            right: 0;
            padding: 0;
          }
          .game-exit-button button {
            width: 30px;
            height: 30px;
            border-radius: 8px; /* mobile par bhi same square look */
          }
        }
      `}</style>
      <div className="game-exit-button">
        <button type="button" onClick={onClick} aria-label="Leave game">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
            <path d="M10 17l-5-5 5-5" />
            <path d="M5 12h11" />
          </svg>
        </button>
      </div>
    </>
  );
}