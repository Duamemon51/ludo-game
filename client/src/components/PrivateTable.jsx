import './HomeGameCards.css';

const CSS = `
  .ph-private-table .ph-icon-btn { width: 32px; height: 32px; }
  .ph-private-table .ph-icon-btn svg { width: 16px; height: 16px; }
  .ph-private-table > p { font-size: 12px; line-height: 1.35; }
  .ph-private-table form { margin-top: 14px; }
  .ph-private-join { display: flex; gap: 10px; }
  .ph-private-join input {
    min-width: 0;
    flex: 1;
    border: 1px solid #d5a928;
    border-radius: 12px;
    padding: 10px 12px;
    color: #3b2412;
    background: #fff9e6;
    font: 800 17px 'Baloo 2', system-ui, sans-serif;
    letter-spacing: 4px;
    text-align: center;
    text-transform: uppercase;
  }
  .ph-private-join input:focus-visible { outline: 3px solid #d89a19; outline-offset: 2px; }
  .ph-private-join .ph-primary { flex: 1; }
`;

const CODE_LENGTH = 5;
const PLAYER_MARKERS = {
  2: [
    { x: 50, y: 15, color: '#e53935' },
    { x: 50, y: 47, color: '#1e88e5' },
  ],
  4: [
    { x: 50, y: 15, color: '#e53935' },
    { x: 80, y: 31, color: '#3fa34d' },
    { x: 50, y: 47, color: '#1e88e5' },
    { x: 20, y: 31, color: '#fcc419' },
  ],
};

function TableIcon({ playerCount }) {
  return (
    <svg viewBox="0 6 100 74" fill="none" aria-hidden="true">
      <ellipse cx="50" cy="68" rx="39" ry="4" fill="#000" opacity=".2" />
      <path d="M50 9 92 31 50 53 8 31Z" fill="#f3e5c4" stroke="#fff3cc" strokeWidth="2" />
      <path d="M50 9v22H8Z" fill="#e53935" />
      <path d="M50 9 92 31H50Z" fill="#3fa34d" />
      <path d="M8 31h42v22Z" fill="#1e88e5" />
      <path d="M50 31h42L50 53Z" fill="#fcc419" />
      <path d="m50 21 19 10-19 10-19-10Z" fill="#fffdf5" stroke="#d7c18e" strokeWidth="1.5" />
      {PLAYER_MARKERS[playerCount].map(({ x, y, color }) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="4.5" fill={color} stroke="#fff" strokeWidth="1.5" />
      ))}
      <circle cx="50" cy="31" r="5" fill="#fff" stroke="#6840a0" strokeWidth="1.5" />
      <text x="50" y="33.5" textAnchor="middle" fontFamily="'Lilita One', sans-serif" fontSize="7" fill="#6840a0">
        {playerCount}
      </text>
    </svg>
  );
}

export default function PrivateTable({
  loading,
  active,
  connected,
  joinCode = '',
  bet,
  onBetChange,
  betOptions,
  availableBalance,
  feePercent = 10,
  onJoinCodeChange,
  onJoinRoom,
  onCreateRoom,
  onBack,
}) {
  const canJoin =
    !loading && active && connected && joinCode.trim().length === CODE_LENGTH;
  const feePerPlayer = Math.round((bet * feePercent / 100 + Number.EPSILON) * 100) / 100;
  const payoutFor = (playerCount) =>
    Math.round((bet * playerCount - feePerPlayer + Number.EPSILON) * 100) / 100;
  const canCreate = !loading && active && connected && bet <= availableBalance;

  const handleCodeChange = (event) => {
    // Sirf letters/numbers allow karo, uppercase me
    const cleaned = event.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, CODE_LENGTH);
    onJoinCodeChange(cleaned);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (canJoin) onJoinRoom();
  };

  return (
    <>
      <style>{CSS}</style>
      <section className="ph-panel ph-private-table">
        <div className="ph-head">
          <h2>Private table</h2>
          <button
            type="button"
            className="ph-icon-btn"
            onClick={onBack}
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 7l10 10M17 7L7 17" />
            </svg>
          </button>
        </div>

        <p>
          Create a private table for friends, or join one with its room code.
          4-player tables can start with 2 or more people; empty seats stay vacant.
          Winnings depend on the number of players who join.
        </p>

        <div className="ph-bet-selector" role="group" aria-label="Private table bet amount">
          <button
            type="button"
            className="ph-bet-step"
            aria-label="Decrease bet"
            disabled={bet === betOptions[0]}
            onClick={() => {
              const index = betOptions.indexOf(bet);
              if (index > 0) onBetChange(betOptions[index - 1]);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /></svg>
          </button>
          <output
            className={`ph-bet-value${bet > availableBalance ? ' unaffordable' : ''}`}
            aria-live="polite"
            aria-disabled={bet > availableBalance}
          >
            {bet.toLocaleString()} credits
          </output>
          <button
            type="button"
            className="ph-bet-step"
            aria-label="Increase bet"
            disabled={bet === betOptions[betOptions.length - 1]}
            onClick={() => {
              const index = betOptions.indexOf(bet);
              if (index >= 0 && index < betOptions.length - 1) {
                onBetChange(betOptions[index + 1]);
              }
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="ph-bet-hint">
          Bet per player · winner fee {feePercent}% · Available {availableBalance.toLocaleString()}
        </div>

        <div className="hg-cards hg-private-mode-cards">
          {[2, 4].map((playerCount) => (
            <button
              key={playerCount}
              type="button"
              className={`hg-card ${playerCount === 2 ? 'hg-duel' : 'hg-four-player'}`}
              disabled={!canCreate}
              aria-label={`Create a ${playerCount}-player private table`}
              onClick={() => onCreateRoom(playerCount, bet)}
            >
              <span className="hg-icon"><TableIcon playerCount={playerCount} /></span>
              <span className="hg-text">
                <strong>{playerCount} Players</strong>
                <small>
                  Win {playerCount === 4 ? 'up to ' : ''}
                  {payoutFor(playerCount).toLocaleString()}
                </small>
              </span>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="private-room-code">Join with room code</label>
          <div className="ph-private-join">
            <input
              id="private-room-code"
              type="text"
              placeholder="CODE"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={CODE_LENGTH}
              value={joinCode}
              onChange={handleCodeChange}
            />
            <button type="submit" className="ph-primary" disabled={!canJoin}>
              Join table
            </button>
          </div>
        </form>

        {!active && (
          <div className="ph-lock" role="alert">
            Your account is inactive. You cannot join or create a private table.
          </div>
        )}
        {!connected && (
          <div className="ph-lock" role="alert">
            Connect to the game server to use private tables.
          </div>
        )}
      </section>
    </>
  );
}