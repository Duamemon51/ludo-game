import { useEffect, useRef, useState } from 'react';
import { socket } from './socket';
import Board from './components/Board';
import PlayerPanel from './components/PlayerPanel';
import ChatSheet from './components/ChatSheet';
import Bubble from './components/Bubble';
import PlayerHome from './components/PlayerHome';
import MatchmakingScreen from './components/MatchmakingScreen';
import LoginScreen from './components/LoginScreen';
import MasterDashboard from './components/MasterDashboard';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import GameTopBar from './components/GameTopBar';
import { signIn } from './authApi';

const AUTO_MOVE_SINGLE = true; // auto-play when only one token can move
const GAME_CHAT_ENABLED = false;
const TURN_SECONDS = 20;
const BUBBLE_MS = 4500;
const RESULT_REVEAL_MS = 2600;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const urlCode = (new URLSearchParams(window.location.search).get('room') || '').toUpperCase();
let uiAudioContext;

function unlockUiAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return Promise.resolve();
  uiAudioContext ||= new AudioContextClass();
  if (uiAudioContext.state === 'suspended') {
    return uiAudioContext.resume().catch((error) => {
      console.warn('Could not enable UI audio:', error);
    });
  }
  return Promise.resolve();
}

function playMatchFoundChime() {
  unlockUiAudio()
    .then(() => {
      const context = uiAudioContext;
      if (!context || context.state !== 'running') {
        console.warn('Match-found chime unavailable: audio is not enabled.');
        return;
      }

      const start = context.currentTime;
      [659.25, 880].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const noteStart = start + index * 0.13;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, noteStart);
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.linearRampToValueAtTime(0.2, noteStart + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.42);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + 0.43);
      });
    })
    .catch((error) => {
      console.warn('Could not enable match-found chime:', error);
    });
}

// Where each color's panel sits (matches the board corners)
const SLOTS = {
  red: { vertical: 'top', side: 'left' },
  green: { vertical: 'top', side: 'right' },
  blue: { vertical: 'bottom', side: 'left' },
  yellow: { vertical: 'bottom', side: 'right' },
};
const BOARD_ROTATION = { red: -90, green: 90, blue: 0, yellow: 0 };
// Mobile seat angles progress counterclockwise, keeping adjacent turns to quarter-turns.
const MOBILE_BOARD_ROTATION = { red: -90, green: -180, yellow: -270, blue: -360 };
const MOBILE_LAYOUT_QUERY = '(max-width: 600px)';
const AUTH_STORAGE_KEY = 'ludo-auth-session';
const readAuthSession = () => {
  const savedSession = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!savedSession) return null;
  try {
    const session = JSON.parse(savedSession);
    if (session?.token && ['PLAYER', 'MASTER', 'SUPER_ADMIN'].includes(session.account?.role)) return session;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  return null;
};
const rotateSlot = ({ vertical, side }, degrees) => {
  let row = vertical === 'top' ? 0 : 1;
  let column = side === 'left' ? 0 : 1;
  const turns = ((degrees / 90) % 4 + 4) % 4;
  for (let turn = 0; turn < turns; turn += 1) [row, column] = [column, 1 - row];
  return { vertical: row === 0 ? 'top' : 'bottom', side: column === 0 ? 'left' : 'right' };
};

export default function App() {
  const [isMobileLayout, setIsMobileLayout] = useState(
    () => window.matchMedia(MOBILE_LAYOUT_QUERY).matches
  );
  const [connected, setConnected] = useState(socket.connected);
  const [status, setStatus] = useState('idle'); // idle | queued | lobby | playing | finishing | over
  const [authSession, setAuthSession] = useState(readAuthSession);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [homeView, setHomeView] = useState(() => (
    urlCode || authSession?.account.role === 'PLAYER' ? 'menu' : 'login'
  ));
  const [myColor, setMyColor] = useState(null);
  const [game, setGame] = useState(null);
  const [playerAvatar, setPlayerAvatar] = useState('');
  const [matchWinAmount, setMatchWinAmount] = useState(null);
  const [soundMuted, setSoundMuted] = useState(() => localStorage.getItem('ludo-sound-muted') === 'true');
  const [lobby, setLobby] = useState(null);
  const [bubbles, setBubbles] = useState({}); // key: color (in game) or socket id (in lobby)
  const [chatOpen, setChatOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [joinCode, setJoinCode] = useState(urlCode);
  const [notice, setNotice] = useState('');
  const [noticeDetails, setNoticeDetails] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [queueEnd, setQueueEnd] = useState(null);
  const [queueLeft, setQueueLeft] = useState(0);
  const [name, setName] = useState(
    () => localStorage.getItem('ludo-name') || 'Player' + Math.floor(100 + Math.random() * 900)
  );
  const autoJoined = useRef(false);
  const matchmakingRequestRef = useRef(null);
  const cancelledMatchmakingRef = useRef(false);
  const resultTimerRef = useRef(null);
  const noticeTimerRef = useRef(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const diceOptions = game?.diceOptions || (
    game?.dice != null ? [{ id: 0, value: game.dice, moves: game.validMoves || [] }] : []
  );
  const usableDiceOptions = diceOptions.filter((option) => option.moves.length > 0);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const updateLayout = (event) => setIsMobileLayout(event.matches);
    mediaQuery.addEventListener('change', updateLayout);
    return () => mediaQuery.removeEventListener('change', updateLayout);
  }, []);

  useEffect(() => {
    const clickSound = new Audio('/sounds/piece-move.mp3');
    clickSound.preload = 'auto';
    clickSound.volume = 1;
    clickSound.playbackRate = 1.8;

    const playButtonSound = (event) => {
      if (soundMuted) return;
      unlockUiAudio();
      const control = event.target.closest('button, [role="button"]');
      if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') return;
      if (control.matches('.gd')) return;
      clickSound.currentTime = 0;
      clickSound.play().catch((error) => {
        console.warn('Could not play button click sound:', error);
      });
    };
    const playKeyboardButtonSound = (event) => {
      if (event.key === 'Enter' || event.key === ' ') playButtonSound(event);
    };

    document.addEventListener('pointerdown', playButtonSound);
    document.addEventListener('keydown', playKeyboardButtonSound);
    return () => {
      document.removeEventListener('pointerdown', playButtonSound);
      document.removeEventListener('keydown', playKeyboardButtonSound);
      clickSound.pause();
    };
  }, [soundMuted]);

  const showNotice = (msg) => {
    const details = typeof msg === 'string'
      ? { title: 'Notice', message: msg, type: 'info' }
      : {
          title: msg?.title || 'Game update',
          message: msg?.message || '',
          type: msg?.type || 'info',
        };
    if (!details.message) return;
        clearTimeout(noticeTimerRef.current);
        setNoticeDetails(details);
        setNotice(details.message);
        noticeTimerRef.current = setTimeout(() => {
          setNotice('');
          setNoticeDetails(null);
          noticeTimerRef.current = null;
        }, 5000);
  };

  const handleSignIn = async ({ loginId, password }) => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const result = await signIn(loginId, password);
      const session = { token: result.token, account: result.account };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      setAuthSession(session);
      if (result.account.role === 'PLAYER') {
        setName(result.account.name);
        localStorage.setItem('ludo-name', result.account.name);
        setHomeView('menu');
        window.history.replaceState(null, '', '/');
      } else {
        const route = result.account.role === 'MASTER' ? '/master' : '/superadmin';
        window.history.replaceState(null, '', route);
      }
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuthSession(null);
    setLoginError('');
    setHomeView('login');
    window.history.replaceState(null, '', '/');
  };

  const toggleSound = () => {
    setSoundMuted((muted) => {
      const nextMuted = !muted;
      localStorage.setItem('ludo-sound-muted', String(nextMuted));
      return nextMuted;
    });
  };

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      socket.emit('resume_game'); // ask the server to put us back in our game, if any
    };
    const onDisconnect = () => {
      setConnected(false); // keep the board on screen while reconnecting
    };
    const onOffline = () => setConnected(socket.connected);
    const onOnline = () => {
      setConnected(socket.connected);
      if (!socket.connected) socket.connect();
    };
    const onPageVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!socket.connected) socket.connect();
    };
    const onNoGame = () => {
      if (statusRef.current === 'over' || statusRef.current === 'finishing') return;
      if (statusRef.current === 'playing') showNotice('Your game has ended.');
      setStatus('idle');
      setGame(null);
      setLobby(null);
    };
    const onQueued = ({ waitMs, requestId }) => {
      if (
        cancelledMatchmakingRef.current
        || (requestId && requestId !== matchmakingRequestRef.current)
      ) {
        socket.emit('cancel_match', { requestId });
        return;
      }
      setStatus('queued');
      setQueueEnd(Date.now() + waitMs);
    };
    const onLobby = (data) => {
      setLobby(data);
      setStatus('lobby');
    };
    const onMatch = ({ yourColor, requestId }) => {
      if (
        requestId
        && (cancelledMatchmakingRef.current || requestId !== matchmakingRequestRef.current)
      ) {
        socket.emit('cancel_match', { requestId });
        return;
      }
      setConnected(true);
      matchmakingRequestRef.current = null;
      cancelledMatchmakingRef.current = false;
      clearTimeout(resultTimerRef.current);
      playMatchFoundChime();
      setMyColor(yourColor);
      setHomeView('menu');
      setLobby(null);
      setBubbles({});
      setStatus('playing');
    };
    const onUpdate = (state) => {
      setConnected(true);
      setGame({
        ...state,
        localDeadline: state.timeLeftMs != null ? Date.now() + state.timeLeftMs : null,
      });
    };
    const onOver = () => {
      clearTimeout(resultTimerRef.current);
      setStatus('finishing');
      resultTimerRef.current = setTimeout(() => setStatus('over'), RESULT_REVEAL_MS);
    };
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
    window.addEventListener('focus', onPageVisible);
    document.addEventListener('visibilitychange', onPageVisible);
    socket.on('no_game', onNoGame);
    socket.on('queued', onQueued);
    socket.on('lobby_update', onLobby);
    socket.on('lobby_error', showNotice);
    socket.on('match_found', onMatch);
    socket.on('game_update', onUpdate);
    socket.on('notice', showNotice);
    socket.on('game_over', onOver);
    if (GAME_CHAT_ENABLED) socket.on('chat_message', onChat);
    if (socket.connected) socket.emit('resume_game'); // page was refreshed while already connected

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onPageVisible);
      document.removeEventListener('visibilitychange', onPageVisible);
      socket.off('no_game', onNoGame);
      socket.off('queued', onQueued);
      socket.off('lobby_update', onLobby);
      socket.off('lobby_error', showNotice);
      socket.off('match_found', onMatch);
      socket.off('game_update', onUpdate);
      socket.off('notice', showNotice);
      socket.off('game_over', onOver);
      if (GAME_CHAT_ENABLED) socket.off('chat_message', onChat);
      clearTimeout(resultTimerRef.current);
      clearTimeout(noticeTimerRef.current);
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
    if (game.turn !== myColor || game.phase !== 'move') return;
    if (game.seats?.some((seat) => seat.color === myColor && seat.isBot)) return;
    const options = (game.diceOptions || (
      game.dice != null ? [{ id: 0, value: game.dice, moves: game.validMoves || [] }] : []
    )).filter((option) => option.moves.length > 0);
    if (options.length !== 1) return;
    const [option] = options;
    if (option.moves.length !== 1) return;
    if (game.tokens[myColor]?.[option.moves[0]] === -1) return;
    const t = setTimeout(
      () => socket.emit('move_token', { tokenIdx: option.moves[0], diceId: option.id }),
      250
    );
    return () => clearTimeout(t);
  }, [game, status, myColor, connected]);

  const cleanName = () => {
    const clean = name.trim() || 'Player';
    localStorage.setItem('ludo-name', clean);
    return clean;
  };
  const findMatch = (bet, queueType = 'normal') => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    matchmakingRequestRef.current = requestId;
    cancelledMatchmakingRef.current = false;
    const numericBet = Number(bet);
    setMatchWinAmount(Number.isFinite(numericBet) && numericBet > 0
      ? Math.round(numericBet * 2 * 0.9)
      : null);
    socket.emit('find_match', { mode: 2, name: cleanName(), requestId, queueType });
  };
  const createRoom = (mode) => socket.emit('create_room', { mode, name: cleanName() });
  const joinRoom = () => {
    if (joinCode.trim().length < 3) return showNotice('Enter the room code first.');
    socket.emit('join_room', { code: joinCode.trim(), name: cleanName() });
  };
  const cancel = () => {
    cancelledMatchmakingRef.current = true;
    socket.emit('cancel_match', { requestId: matchmakingRequestRef.current });
    matchmakingRequestRef.current = null;
    setStatus('idle');
  };
  const leaveLobby = () => {
    socket.emit('leave_room');
    setLobby(null);
    setStatus('idle');
  };
  const reset = () => {
    clearTimeout(resultTimerRef.current);
    setGame(null);
    setMyColor(null);
    setStatus('idle');
  };
  const leaveGame = () => {
    if (!connected) return;
    setLeaving(true);
    socket.timeout(5000).emit('leave_game', (error, result) => {
      setLeaving(false);
      if (error || !result?.ok) {
        showNotice('Could not leave the game. Please try again.');
        return;
      }
      setLeaveOpen(false);
      reset();
    });
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

  const inGame = Boolean(game && ['playing', 'finishing', 'over'].includes(status));
  const homeScreen = connected && (status === 'idle' || status === 'queued');
  const boardRotation = (isMobileLayout ? MOBILE_BOARD_ROTATION : BOARD_ROTATION)[myColor] ?? 0;
  const panelSlots = Object.fromEntries(
    Object.entries(SLOTS).map(([color, slot]) => [color, rotateSlot(slot, boardRotation)])
  );
  const colorsInRow = (vertical) =>
    Object.entries(panelSlots)
      .filter(([, slot]) => slot.vertical === vertical)
      .sort(([, a], [, b]) => a.side.localeCompare(b.side))
      .map(([color]) => color);
  const myTurn = connected && status === 'playing' && game && game.turn === myColor;
  const canRoll = Boolean(myTurn && ['roll', 'bonus-roll', 'capture-roll'].includes(game.phase));
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
        vertical={panelSlots[color].vertical}
        side={panelSlots[color].side}
        active={active}
        isMe={color === myColor}
        pct={pct}
        dice={game.dice}
        diceRollId={game.dieRollId}
        rolledDice={game.rolledDice || []}
        rolledDiceIds={game.rolledDiceIds}
        usedDiceIds={game.usedDiceIds || []}
        canRoll={canRoll}
        onRoll={() => socket.emit(
          game.phase === 'bonus-roll'
            ? 'roll_bonus_dice'
            : game.phase === 'capture-roll'
              ? 'roll_capture_bonus'
              : 'roll_dice'
        )}
        soundMuted={soundMuted}
        onChat={() => setChatOpen(true)}
        chatEnabled={GAME_CHAT_ENABLED}
        bubble={bubbles[color]}
        avatar={color === myColor ? playerAvatar : ''}
      />
    );
  };

  const currentPath = window.location.pathname.replace(/\/+$/, '');
  if (currentPath === '/master') {
    if (authSession?.account.role !== 'MASTER') {
      return <LoginScreen onSignIn={handleSignIn} loading={loginLoading} error={loginError} />;
    }
    return (
      <MasterDashboard
        token={authSession.token}
        onBack={signOut}
      />
    );
  }

  if (currentPath === '/superadmin') {
    if (authSession?.account.role !== 'SUPER_ADMIN') {
      return <LoginScreen onSignIn={handleSignIn} loading={loginLoading} error={loginError} />;
    }
    return <SuperAdminDashboard token={authSession.token} onSignOut={signOut} />;
  }

  return (
    <div className={'app' + (homeScreen ? ' home-screen' : '') + (inGame ? ' in-game' : '') + (homeView === 'login' ? ' login-screen' : '')}>
      {notice && (
        <div className={`toast toast-${noticeDetails?.type || 'info'}`} role="status" aria-live="polite" inert={!connected && inGame}>
          <span className="toast-icon" aria-hidden="true">
            {noticeDetails?.type === 'success' ? '✓' : noticeDetails?.type === 'warning' ? '!' : 'i'}
          </span>
          <span className="toast-copy">
            <strong>{noticeDetails?.title || 'Notice'}</strong>
            <span>{noticeDetails?.message || notice}</span>
          </span>
          <button
            className="toast-close"
            type="button"
            aria-label="Dismiss notification"
            onClick={() => {
              clearTimeout(noticeTimerRef.current);
              noticeTimerRef.current = null;
              setNotice('');
              setNoticeDetails(null);
            }}
          >
            ×
          </button>
        </div>
      )}

      {!connected && !inGame && homeView !== 'master' && homeView !== 'login' && homeView !== 'menu' && <div className="card">Connecting to server...</div>}
      {!connected && inGame && (
        <div className="reconnect-overlay">
          <section className="reconnect-card" role="alertdialog" aria-modal="true" aria-labelledby="reconnect-title">
            <strong id="reconnect-title">Connection lost. Reconnecting…</strong>
          </section>
        </div>
      )}

      {status === 'idle' && homeView === 'login' && (
        <LoginScreen
          onSignIn={handleSignIn}
          loading={loginLoading}
          error={loginError}
        />
      )}

      {(status === 'idle' || status === 'queued') && homeView === 'menu' && (
        <PlayerHome
          name={name}
          onNameChange={setName}
          onAvatarChange={setPlayerAvatar}
          onFindMatch={findMatch}
          token={authSession.token}
          onSignOut={signOut}
          soundMuted={soundMuted}
          onToggleMute={toggleSound}
          connected={connected}
        />
      )}

      {status === 'queued' && <MatchmakingScreen secondsLeft={queueLeft} onCancel={cancel} />}

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
                    disabled={!isMe || !GAME_CHAT_ENABLED}
                    onClick={() => GAME_CHAT_ENABLED && setChatOpen(true)}
                  >
                    <span className="avatar">{p.name.charAt(0).toUpperCase()}</span>
                    {GAME_CHAT_ENABLED && isMe && <span className="chat-badge">💬</span>}
                  </button>
                  <div className="pname dark">
                    {p.name}
                    {p.id === lobby.hostId ? ' 👑' : ''}
                    {isMe ? ' (you)' : ''}
                  </div>
                  {GAME_CHAT_ENABLED && b && (
                    <Bubble key={b.id} text={b.text} vertical="bottom" side="center" />
                  )}
                </div>
              );
            })}
          </div>
          {GAME_CHAT_ENABLED && <p className="hint">Tap your avatar to chat 💬</p>}

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
        <div className="game" inert={!connected}>
          {status === 'playing' && (
            <GameTopBar
              onLeave={() => setLeaveOpen(true)}
              winAmount={matchWinAmount}
              soundMuted={soundMuted}
              onToggleMute={toggleSound}
            />
          )}

          <div className="prow prow-top">{colorsInRow('top').map(renderSlot)}</div>

          <Board
            tokens={game.tokens}
            captures={game.captures}
            lastMove={game.lastMove}
            celebrateWinner={status === 'finishing' ? game.winner : null}
            turn={status === 'playing' ? game.turn : null}
            myColor={myColor}
            rotation={boardRotation}
            movable={movable}
            diceOptions={diceOptions}
            rollId={game.rollId}
            soundMuted={soundMuted}
            onMove={(idx, diceId) => socket.emit('move_token', { tokenIdx: idx, diceId })}
          />

          <div className="prow prow-bottom">{colorsInRow('bottom').map(renderSlot)}</div>

        </div>
      )}

      {status === 'over' && game && (
        <div className={`overlay game-result ${game.winner === myColor ? 'victory' : 'defeat'}`} inert={!connected}>
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
        <div className="overlay" onClick={() => setLeaveOpen(false)} inert={!connected}>
          <div className="card center quit-card" onClick={(e) => e.stopPropagation()}>
            <div className="quit-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 21h14M7 21V4.8a1.8 1.8 0 0 1 1.45-1.76l7-1.4A1.8 1.8 0 0 1 17.6 3.4V21" />
                <path d="M13.5 11.5h.01" />
              </svg>
            </div>
            <h2>Quit game?</h2>
            <p className="hint">Agar aap quit karte hain to game khatam hoga aur opponent winner hoga.</p>
            <div className="quit-actions">
              <button className="btn quit-confirm" onClick={leaveGame} disabled={!connected || leaving}>
                {leaving ? 'Leaving...' : 'Quit'}
              </button>
              <button className="btn quit-stay" onClick={() => setLeaveOpen(false)}>Stay</button>
            </div>
          </div>
        </div>
      )}

      {GAME_CHAT_ENABLED && (
        <ChatSheet
          open={connected && chatOpen && (status === 'lobby' || status === 'playing')}
          onClose={() => setChatOpen(false)}
          onSend={sendChat}
        />
      )}
    </div>
  );
}