import { useEffect, useRef, useState } from 'react';
import { socket } from './socket';
import Board from './components/Board';
import PlayerPanel from './components/PlayerPanel';
import ChatSheet from './components/ChatSheet';
import Bubble from './components/Bubble';

const AUTO_MOVE_SINGLE = true; // auto-play when only one token can move
const TURN_SECONDS = 20;
const BUBBLE_MS = 4500;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const urlCode = (new URLSearchParams(window.location.search).get('room') || '').toUpperCase();

// Where each color's panel sits (matches the board corners)
const SLOTS = {
  red: { vertical: 'top', side: 'left' },
  green: { vertical: 'top', side: 'right' },
  blue: { vertical: 'bottom', side: 'left' },
  yellow: { vertical: 'bottom', side: 'right' },
};

export default function App() {
  const [connected, setConnected] = useState(socket.connected && navigator.onLine);
  const [status, setStatus] = useState('idle'); // idle | queued | lobby | playing | over
  const [myColor, setMyColor] = useState(null);
  const [game, setGame] = useState(null);
  const [lobby, setLobby] = useState(null);
  const [bubbles, setBubbles] = useState({}); // key: color (in game) or socket id (in lobby)
  const [chatOpen, setChatOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [joinCode, setJoinCode] = useState(urlCode);
  const [notice, setNotice] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [queueEnd, setQueueEnd] = useState(null);
  const [queueLeft, setQueueLeft] = useState(0);
  const [name, setName] = useState(
    () => localStorage.getItem('ludo-name') || 'Player' + Math.floor(100 + Math.random() * 900)
  );
  const autoJoined = useRef(false);
  const statusRef = useRef(status);
  statusRef.current = status;
  const diceOptions = game?.diceOptions || (
    game?.dice != null ? [{ id: 0, value: game.dice, moves: game.validMoves || [] }] : []
  );
  const usableDiceOptions = diceOptions.filter((option) => option.moves.length > 0);

  const showNotice = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 5000);
  };

  useEffect(() => {
    const onConnect = () => {
      setConnected(navigator.onLine);
      if (navigator.onLine) socket.emit('resume_game'); // ask the server to put us back in our game, if any
    };
    const onDisconnect = () => setConnected(false); // keep the board on screen while reconnecting
    const onOffline = () => setConnected(false);
    const onOnline = () => {
      setConnected(socket.connected);
      if (socket.connected) socket.emit('resume_game');
    };
    const onNoGame = () => {
      if (statusRef.current === 'over') return; // keep the winner screen visible
      if (statusRef.current === 'playing') showNotice('Your game has ended.');
      setStatus('idle');
      setGame(null);
      setLobby(null);
    };
    const onQueued = ({ waitMs }) => {
      setStatus('queued');
      setQueueEnd(Date.now() + waitMs);
    };
    const onLobby = (data) => {
      setLobby(data);
      setStatus('lobby');
    };
    const onMatch = ({ yourColor }) => {
      setMyColor(yourColor);
      setLobby(null);
      setBubbles({});
      setStatus('playing');
    };
    const onUpdate = (state) =>
      setGame({
        ...state,
        localDeadline: state.timeLeftMs != null ? Date.now() + state.timeLeftMs : null,
      });
    const onOver = () => setStatus('over');
    const onChat = (m) => {
      const key = m.color || m.from;
      setBubbles((prev) => ({ ...prev, [key]: { id: m.id, text: m.text } }));
      setTimeout(
        () =>
          setBubbles((prev) => {
            if (prev[key]?.id !== m.id) return prev; // a newer message replaced it
            const next = { ...prev };
            delete next[key];
            return next;
          }),
        BUBBLE_MS
      );
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    socket.on('no_game', onNoGame);
    socket.on('queued', onQueued);
    socket.on('lobby_update', onLobby);
    socket.on('lobby_error', showNotice);
    socket.on('match_found', onMatch);
    socket.on('game_update', onUpdate);
    socket.on('notice', showNotice);
    socket.on('game_over', onOver);
    socket.on('chat_message', onChat);
    if (socket.connected && navigator.onLine) socket.emit('resume_game'); // page was refreshed while already connected

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      socket.off('no_game', onNoGame);
      socket.off('queued', onQueued);
      socket.off('lobby_update', onLobby);
      socket.off('lobby_error', showNotice);
      socket.off('match_found', onMatch);
      socket.off('game_update', onUpdate);
      socket.off('notice', showNotice);
      socket.off('game_over', onOver);
      socket.off('chat_message', onChat);
    };
  }, []);

  // Opened a shared link like /?room=ABCDE: join that room automatically
  useEffect(() => {
    if (connected && urlCode && !autoJoined.current) {
      autoJoined.current = true;
      socket.emit('join_room', { code: urlCode, name: name.trim() || 'Player' });
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back at the menu: clear bubbles and close the chat sheet
  useEffect(() => {
    if (status === 'idle') {
      setBubbles({});
      setChatOpen(false);
    }
  }, [status]);

  // Game over or left: close the quit popup
  useEffect(() => {
    if (status !== 'playing') setLeaveOpen(false);
  }, [status]);

  // Turn countdown
  useEffect(() => {
    if (!game?.localDeadline) {
      setSecondsLeft(null);
      return;
    }
    const tick = () =>
      setSecondsLeft(Math.max(0, Math.ceil((game.localDeadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [game]);

  // Matchmaking countdown
  useEffect(() => {
    if (status !== 'queued' || !queueEnd) return;
    const tick = () => setQueueLeft(Math.max(0, Math.ceil((queueEnd - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [status, queueEnd]);

  // Auto-play when there is exactly one possible move
  useEffect(() => {
    if (!AUTO_MOVE_SINGLE || !connected || status !== 'playing' || !game) return;
    if (game.turn !== myColor || game.phase !== 'move' || game.doubleRoll) return;
    const options = (game.diceOptions || (
      game.dice != null ? [{ id: 0, value: game.dice, moves: game.validMoves || [] }] : []
    )).filter((option) => option.moves.length > 0);
    if (options.length !== 1) return;
    const [option] = options;
    if (option.moves.length !== 1) return;
    const t = setTimeout(
      () => socket.emit('move_token', { tokenIdx: option.moves[0], diceId: option.id }),
      900
    );
    return () => clearTimeout(t);
  }, [game, status, myColor, connected]);

  const cleanName = () => {
    const clean = name.trim() || 'Player';
    localStorage.setItem('ludo-name', clean);
    return clean;
  };
  const findMatch = (mode) => socket.emit('find_match', { mode, name: cleanName() });
  const createRoom = (mode) => socket.emit('create_room', { mode, name: cleanName() });
  const joinRoom = () => {
    if (joinCode.trim().length < 3) return showNotice('Enter the room code first.');
    socket.emit('join_room', { code: joinCode.trim(), name: cleanName() });
  };
  const cancel = () => {
    socket.emit('cancel_match');
    setStatus('idle');
  };
  const leaveLobby = () => {
    socket.emit('leave_room');
    setLobby(null);
    setStatus('idle');
  };
  const reset = () => {
    setGame(null);
    setMyColor(null);
    setStatus('idle');
  };
  const leaveGame = () => {
    if (!connected) return;
    setLeaveOpen(false);
    socket.emit('leave_game');
    reset();
  };
  const sendChat = (text) => socket.emit('chat_message', { text });

  const shareLink = lobby ? `${window.location.origin}/?room=${lobby.code}` : '';
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      showNotice('Link copied!');
    } catch {
      showNotice('Could not copy. Share the code instead.');
    }
  };
  const whatsappLink = lobby
    ? 'https://wa.me/?text=' +
      encodeURIComponent(`Play Ludo with me! Room code: ${lobby.code}\n${shareLink}`)
    : '';

  const inGame = Boolean(game && (status === 'playing' || status === 'over'));
  const myTurn = connected && status === 'playing' && game && game.turn === myColor;
  const canRoll = Boolean(myTurn && (game.phase === 'roll' || game.phase === 'bonus-roll'));
  const movable = myTurn && game.phase === 'move'
    ? [...new Set(usableDiceOptions.flatMap((option) => option.moves))]
    : [];
  const isHost = lobby && lobby.hostId === socket.id;

  const renderSlot = (color) => {
    const seat = game.seats.find((s) => s.color === color);
    if (!seat) return <div key={color} />;
    const active = status === 'playing' && game.turn === color;
    const pct = !active ? 0 : secondsLeft === null ? 100 : Math.min(100, (secondsLeft / TURN_SECONDS) * 100);
    return (
      <PlayerPanel
        key={color}
        seat={seat}
        vertical={SLOTS[color].vertical}
        side={SLOTS[color].side}
        active={active}
        isMe={color === myColor}
        pct={pct}
        dice={game.dice}
        diceRollId={game.dieRollId}
        canRoll={canRoll}
        onRoll={() => socket.emit(game.phase === 'bonus-roll' ? 'roll_bonus_dice' : 'roll_dice')}
        onChat={() => setChatOpen(true)}
        bubble={bubbles[color]}
      />
    );
  };

  return (
    <div className={'app' + (inGame ? ' in-game' : '') + (inGame && game.seats.length === 4 ? ' four-player' : '')}>
      <h1 className="logo">LUDO</h1>
      {notice && <div className="toast">{notice}</div>}

      {!connected && !inGame && <div className="card">Connecting to server...</div>}
      {!connected && inGame && <div className="reconnect-banner">Connection lost. Reconnecting...</div>}

      {connected && status === 'idle' && (
        <div className="card">
          <label className="label">Your name</label>
          <input
            className="input"
            value={name}
            maxLength={15}
            onChange={(e) => setName(e.target.value)}
          />

          <button className="btn" onClick={() => findMatch(2)}>Play 1 vs 1 (online)</button>
          <button className="btn alt" onClick={() => findMatch(4)}>Play 4 players (online)</button>
          <p className="hint">If not enough players join in 8 seconds, bots fill the empty seats.</p>

          <hr className="divider" />
          <label className="label">Play with friends</label>
          <div className="row">
            <button className="btn green" onClick={() => createRoom(2)}>2-player room</button>
            <button className="btn green" onClick={() => createRoom(4)}>4-player room</button>
          </div>
          <div className="row">
            <input
              className="input code-input"
              placeholder="ROOM CODE"
              value={joinCode}
              maxLength={5}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            />
            <button className="btn dark" onClick={joinRoom}>Join</button>
          </div>
        </div>
      )}

      {status === 'queued' && (
        <div className="card center">
          <div className="spinner" />
          <p>Finding players... {queueLeft}s</p>
          <button className="btn alt" onClick={cancel}>Cancel</button>
        </div>
      )}

      {status === 'lobby' && lobby && (
        <div className="card center">
          <label className="label">Room code</label>
          <div className="code-box">{lobby.code}</div>
          <div className="row">
            <button className="btn dark" onClick={copyLink}>Copy link</button>
            <a className="btn green linkbtn" href={whatsappLink} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          </div>

          <div className="lobby-slots">
            {Array.from({ length: lobby.mode }, (_, i) => {
              const p = lobby.players[i];
              if (!p) {
                return (
                  <div key={i} className="lslot">
                    <div className="avatar-ring empty">
                      <span className="avatar ghost">🤖</span>
                    </div>
                    <div className="pname dark">Bot will join</div>
                  </div>
                );
              }
              const isMe = p.id === socket.id;
              const b = bubbles[p.id];
              return (
                <div key={p.id} className="lslot">
                  <button
                    type="button"
                    className={'avatar-ring' + (isMe ? ' me' : '')}
                    style={{ '--c': '#6366f1', '--pct': '100%' }}
                    disabled={!isMe}
                    onClick={() => setChatOpen(true)}
                  >
                    <span className="avatar">{p.name.charAt(0).toUpperCase()}</span>
                    {isMe && <span className="chat-badge">💬</span>}
                  </button>
                  <div className="pname dark">
                    {p.name}
                    {p.id === lobby.hostId ? ' 👑' : ''}
                    {isMe ? ' (you)' : ''}
                  </div>
                  {b && <Bubble key={b.id} text={b.text} vertical="bottom" side="center" />}
                </div>
              );
            })}
          </div>
          <p className="hint">Tap your avatar to chat 💬</p>

          {isHost ? (
            <button className="btn" onClick={() => socket.emit('start_room')}>
              Start game
            </button>
          ) : (
            <p className="hint">Waiting for the host to start...</p>
          )}
          <button className="btn alt" onClick={leaveLobby}>Leave room</button>
        </div>
      )}

      {inGame && (
        <div className="game">
          {status === 'playing' && (
            <div className="game-top">
              <button
                className="exit-btn"
              onClick={() => setLeaveOpen(true)}
              aria-label="Leave game"
            >
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
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
          )}

          <div className="prow">
            {renderSlot('red')}
            {renderSlot('green')}
          </div>

          <Board
            tokens={game.tokens}
            lastMove={game.lastMove}
            turn={status === 'playing' ? game.turn : null}
            myColor={myColor}
            movable={movable}
            diceOptions={diceOptions}
            rollId={game.rollId}
            onMove={(idx, diceId) => socket.emit('move_token', { tokenIdx: idx, diceId })}
          />

          <div className="prow">
            {renderSlot('blue')}
            {renderSlot('yellow')}
          </div>

        </div>
      )}

      {status === 'over' && game && (
        <div className={`overlay game-result ${game.winner === myColor ? 'victory' : 'defeat'}`}>
          {game.winner === myColor && (
            <div className="victory-confetti" aria-hidden="true">
              {Array.from({ length: 32 }, (_, i) => (
                <span
                  key={i}
                  style={{
                    '--x': `${(i * 37 + 11) % 100}vw`,
                    '--delay': `${(i % 8) * 90}ms`,
                    '--spin': `${360 + (i % 4) * 180}deg`,
                  }}
                />
              ))}
            </div>
          )}
          <div className={`card center result-card ${game.winner === myColor ? 'win' : 'loss'}`}>
            <div className="result-icon" aria-hidden="true">
              {game.winner === myColor ? '🏆' : '🎲'}
            </div>
            <span className="result-kicker">
              {game.winner === myColor ? 'CHAMPION' : 'GAME OVER'}
            </span>
            <h2>{game.winner === myColor ? 'You won!' : `${cap(game.winner)} wins`}</h2>
            <p>{game.winner === myColor ? 'Amazing game. You conquered the board!' : 'Better luck next game!'}</p>
            <button className="btn" onClick={reset}>Play again</button>
          </div>
        </div>
      )}

      {leaveOpen && status === 'playing' && (
        <div className="overlay" onClick={() => setLeaveOpen(false)}>
          <div className="card center quit-card" onClick={(e) => e.stopPropagation()}>
            <div className="quit-icon">🚪</div>
            <h2>Quit game?</h2>
            <p className="hint">Agar aap nikle to game haar jayega aur bot aapki jagah le lega.</p>
            <div className="row">
              <button className="btn alt" onClick={leaveGame} disabled={!connected}>Quit</button>
              <button className="btn green" onClick={() => setLeaveOpen(false)}>Stay</button>
            </div>
          </div>
        </div>
      )}

      <ChatSheet
        open={chatOpen && (status === 'lobby' || status === 'playing')}
        onClose={() => setChatOpen(false)}
        onSend={sendChat}
      />
    </div>
  );
}