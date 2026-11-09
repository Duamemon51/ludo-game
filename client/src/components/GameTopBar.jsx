import { useState, useEffect, useRef } from 'react';
import './GameTopBar.css';

/* Dice face: 5 pips, beech wala laal */
const DiceIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle className="pip" cx="6.5" cy="6.5" r="2.1" />
    <circle className="pip" cx="17.5" cy="6.5" r="2.1" />
    <circle className="pip pip-mid" cx="12" cy="12" r="2.3" />
    <circle className="pip" cx="6.5" cy="17.5" r="2.1" />
    <circle className="pip" cx="17.5" cy="17.5" r="2.1" />
  </svg>
);

const TrophyIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 3h10v2h3a1 1 0 0 1 1 1v1a5 5 0 0 1-4.4 4.96A5.01 5.01 0 0 1 13 14.9V17h3a1 1 0 0 1 1 1v2H7v-2a1 1 0 0 1 1-1h3v-2.1a5.01 5.01 0 0 1-3.6-2.94A5 5 0 0 1 3 7V6a1 1 0 0 1 1-1h3V3Zm-2 4a3 3 0 0 0 2.2 2.9A8 8 0 0 1 7 7H5Zm14 0h-2a8 8 0 0 1-.2 2.9A3 3 0 0 0 19 7Z" />
  </svg>
);

const SpeakerIcon = ({ muted }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
    {muted ? (
      <>
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </>
    ) : (
      <>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </>
    )}
  </svg>
);

const LeaveIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 17l-5-5 5-5" />
    <path d="M5 12h11" />
  </svg>
);

export default function GameTopBar({ onLeave, winAmount, soundMuted, onToggleMute }) {
  const [showWinAmount, setShowWinAmount] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const barRef = useRef(null);

  // Bahar tap ya Esc par popups band
  useEffect(() => {
    if (!menuOpen && !showWinAmount) return;

    const closeAll = () => {
      setMenuOpen(false);
      setShowWinAmount(false);
    };
    const onPointerDown = (e) => {
      if (barRef.current && !barRef.current.contains(e.target)) closeAll();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') closeAll();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, showWinAmount]);

  // Ek time par ek hi popup
  const toggleMenu = () => {
    setShowWinAmount(false);
    setMenuOpen((open) => !open);
  };
  const toggleWin = () => {
    setMenuOpen(false);
    setShowWinAmount((visible) => !visible);
  };

  return (
    <div className="game-top-bar" ref={barRef}>
      {/* DICE = menu */}
      <button
        type="button"
        className="game-top-menu-trigger"
        onClick={toggleMenu}
        aria-label="Open game menu"
        aria-expanded={menuOpen}
      >
        <DiceIcon />
      </button>

      {/* WIN = brass coin + wooden plaque */}
      <button
        type="button"
        className="game-win-badge"
        aria-expanded={showWinAmount}
        onClick={toggleWin}
      >
        <span className="game-win-coin">
          <TrophyIcon />
        </span>
        WIN
      </button>

      <button
        type="button"
        className="game-top-sound-toggle"
        onClick={onToggleMute}
        aria-label={soundMuted ? 'Unmute sound' : 'Mute sound'}
        aria-pressed={soundMuted}
        title={soundMuted ? 'Unmute sound' : 'Mute sound'}
      >
        <SpeakerIcon muted={soundMuted} />
      </button>

      {menuOpen && (
        <div className="game-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="game-menu-leave"
            onClick={() => {
              setMenuOpen(false);
              onLeave?.();
            }}
          >
            <span className="token token-red">
              <LeaveIcon />
            </span>
            Leave game
          </button>
        </div>
      )}

      {showWinAmount && (
        <div className="game-win-prize" role="status">
          <div className="game-ticket">
            <div className="game-ticket-stub">
              <TrophyIcon />
              Prize
            </div>
            <div className="game-ticket-body">
              {winAmount == null ? (
                <span>Prize unavailable for this room</span>
              ) : (
                <>
                  <span>Winner prize</span>
                  <span>
                    <b>{winAmount.toLocaleString()}</b> credits
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}