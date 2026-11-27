import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { socket } from './socket';
import Board from './components/Board';
import PlayerPanel from './components/PlayerPanel';
import ChatSheet from './components/ChatSheet';
import PlayerHome from './components/PlayerHome';
import PrivateLobby from './components/PrivateLobby';
import MatchmakingScreen from './components/MatchmakingScreen';
import TournamentBracketScreen from './components/TournamentBracketScreen';
import LoginScreen from './components/LoginScreen';
import GameTopBar from './components/GameTopBar';
import DiceLoader from './components/DiceLoader';
import { signIn } from './authApi';

const MasterDashboard = lazy(() => import('./components/MasterDashboard'));
const SuperAdminDashboard = lazy(() => import('./components/SuperAdminDashboard'));

const AUTO_MOVE_SINGLE = true; // auto-play when only one token can move
const GAME_CHAT_ENABLED = false;
const TURN_SECONDS = 20;
const BUBBLE_MS = 4500;
const RECONNECT_NOTICE_DELAY_MS = 3000;
const RESULT_REVEAL_MS = 2600;
const TOURNAMENT_ROUND_LABELS = {
  1: 'Quarter-final',
  2: 'Semi-final',
  3: 'Final',
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const urlCode = (new URLSearchParams(window.location.search).get('room') || '').toUpperCase();
let uiAudioContext;

function unlockUiAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return Promise.resolve();
  uiAudioContext ||= new AudioContextClass();
  if (uiAudioContext.state === 'suspended') {
    return uiAudioContext.resume().catch((error) => {
      if (error.name !== 'NotAllowedError') {
        console.warn('Could not enable UI audio:', error);
      }
    });
  }
  return Promise.resolve();
}

function playMatchFoundChime() {
  const context = uiAudioContext;
  if (!context || context.state !== 'running') return;

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
  const [showReconnectOverlay, setShowReconnectOverlay] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | queued | bracket | lobby | playing | finishing | over
  const [authSession, setAuthSession] = useState(readAuthSession);
  const [isResumingGame, setIsResumingGame] = useState(
    () => authSession?.account.role === 'PLAYER'
  );
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [homeView, setHomeView] = useState(() => (
    urlCode || authSession?.account.role === 'PLAYER' ? 'menu' : 'login'
  ));
  const [myColor, setMyColor] = useState(null);
  const [game, setGame] = useState(null);
  const [playerAvatar, setPlayerAvatar] = useState('');
  const [matchWinAmount, setMatchWinAmount] = useState(null);
  const [gameResult, setGameResult] = useState(null);
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
  const [matchmakingType, setMatchmakingType] = useState('normal');
  const [tournamentBracketPreview, setTournamentBracketPreview] = useState(null);
  const [tournamentRound, setTournamentRound] = useState(null);
  const [spectatorMatch, setSpectatorMatch] = useState(null);
  const [returnToTournament, setReturnToTournament] = useState(false);
  const [tournamentCountdown, setTournamentCountdown] = useState(null);
  const [name, setName] = useState(
    () => localStorage.getItem('ludo-name') || 'Player' + Math.floor(100 + Math.random() * 900)
  );
  const autoJoined = useRef(false);
  const matchmakingRequestRef = useRef(null);
  const spectatorMatchRef = useRef(null);
  const cancelledMatchmakingRef = useRef(false);
  const resultTimerRef = useRef(null);
  const leaveRequestRef = useRef(false);
  const pendingOverRef = useRef(null);
  const noticeTimerRef = useRef(null);
  const reconnectNoticeTimerRef = useRef(null);
  const myColorRef = useRef(null);
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
    if (!isResumingGame) return undefined;
    const timer = setTimeout(() => setIsResumingGame(false), 10000);
    return () => clearTimeout(timer);
  }, [isResumingGame]);

  useEffect(() => {
    const clickSound = new Audio('/sounds/piece-move.mp3');
    clickSound.preload = 'auto';
    clickSound.volume = 1;
    clickSound.playbackRate = 1.8;

    const playButtonSound = (event) => {
      if (soundMuted || !event.isTrusted || !(event.target instanceof Element)) return;
      if (event.target.closest('.sa-dashboard, .master-dashboard')) return;
      const control = event.target.closest('button, [role="button"]');
      if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') return;
      if (control.matches('.gd')) return;
      unlockUiAudio();
      clickSound.currentTime = 0;
      clickSound.play().catch((error) => {
        if (error.name !== 'NotAllowedError') {
          console.warn('Could not play button click sound:', error);
        }
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
      socket.disconnect();
      socket.connect();
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
    setReturnToTournament(false);
    setTournamentCountdown(null);
    setIsResumingGame(false);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    socket.disconnect();
    socket.connect();
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
    const clearReconnectNotice = () => {
      clearTimeout(reconnectNoticeTimerRef.current);
      reconnectNoticeTimerRef.current = null;
    };
    const scheduleReconnectNotice = () => {
      clearReconnectNotice();
      if (document.visibilityState !== 'visible' || navigator.onLine) return;
      reconnectNoticeTimerRef.current = setTimeout(() => {
        reconnectNoticeTimerRef.current = null;
        if (
          document.visibilityState === 'visible'
          && !navigator.onLine
          && ['playing', 'finishing', 'over', 'spectating'].includes(statusRef.current)
        ) {
          setShowReconnectOverlay(true);
        }
      }, RECONNECT_NOTICE_DELAY_MS);
    };
    const onConnect = () => {
      clearReconnectNotice();
      setShowReconnectOverlay(false);
      setConnected(true);
      if (spectatorMatchRef.current) {
        setIsResumingGame(false);
        socket.emit('watch_tournament_match', spectatorMatchRef.current);
      } else {
        if (readAuthSession()?.account.role === 'PLAYER') setIsResumingGame(true);
        socket.emit('resume_game');
      }
    };
    const onDisconnect = () => {
      setShowReconnectOverlay(false);
      setConnected(false); // keep the board on screen while reconnecting
      if (!navigator.onLine) scheduleReconnectNotice();
      else clearReconnectNotice();
    };
    const onOffline = () => {
      setConnected(false);
      scheduleReconnectNotice();
    };
    const onOnline = () => {
      clearReconnectNotice();
      setShowReconnectOverlay(false);
      setConnected(socket.connected);
      if (!socket.connected) socket.connect();
    };
    const onPageVisible = () => {
      if (document.visibilityState !== 'visible') {
        clearReconnectNotice();
        setShowReconnectOverlay(false);
        return;
      }
      if (!navigator.onLine) {
        setConnected(false);
        scheduleReconnectNotice();
        return;
      }
      if (!socket.connected) {
        socket.connect();
      } else {
        clearReconnectNotice();
        setShowReconnectOverlay(false);
        setConnected(true);
      }
    };
    const onNoGame = () => {
      setIsResumingGame(false);
      if (statusRef.current === 'over' || statusRef.current === 'finishing') return;
      if (statusRef.current === 'playing') showNotice('Your game has ended.');
      setTournamentCountdown(null);
      setStatus('idle');
      setGame(null);
      setLobby(null);
      setTournamentBracketPreview(null);
      spectatorMatchRef.current = null;
      setSpectatorMatch(null);
    };
    const onQueued = ({ waitMs, requestId, queueType }) => {
      if (
        cancelledMatchmakingRef.current
        || (requestId && requestId !== matchmakingRequestRef.current)
      ) {
        socket.emit('cancel_match', { requestId });
        return;
      }
      setStatus('queued');
      setMatchmakingType(queueType === 'tournament' ? 'tournament' : 'normal');
      setQueueEnd(Date.now() + waitMs);
    };
    const onTournamentBracket = (bracket) => {
      setTournamentCountdown(null);
      setTournamentBracketPreview(bracket);
      setStatus('bracket');
    };
    const onLobby = (data) => {
      setReturnToTournament(false);
      setLobby(data);
      setStatus('lobby');
    };
    const onMatch = ({ yourColor, requestId, wager, tournament }) => {
      if (
        requestId
        && (cancelledMatchmakingRef.current || requestId !== matchmakingRequestRef.current)
      ) {
        socket.emit('cancel_match', { requestId });
        return;
      }
      setConnected(true);
      setTournamentCountdown(null);
      matchmakingRequestRef.current = null;
      cancelledMatchmakingRef.current = false;
      setReturnToTournament(false);
      setMatchmakingType('normal');
      setTournamentBracketPreview(null);
      spectatorMatchRef.current = null;
      setSpectatorMatch(null);
      leaveRequestRef.current = false;
      pendingOverRef.current = null;
      clearTimeout(resultTimerRef.current);
      playMatchFoundChime();
      setMatchWinAmount(wager?.payout ?? (
        tournament?.round === 3 ? tournament.prizePool ?? null : null
      ));
      setTournamentRound(TOURNAMENT_ROUND_LABELS[tournament?.round] || null);
      myColorRef.current = yourColor;
      setMyColor(yourColor);
      setHomeView('menu');
      setLobby(null);
      setBubbles({});
      setStatus('playing');
    };
    const onTournamentWatchStarted = ({ tournamentId, roundNo, matchNo }) => {
      const match = { tournamentId, roundNo, matchNo };
      spectatorMatchRef.current = match;
      setSpectatorMatch(match);
      setTournamentRound(TOURNAMENT_ROUND_LABELS[roundNo] || null);
      setMatchWinAmount(null);
      myColorRef.current = null;
      setMyColor(null);
      setGameResult(null);
      setGame(null);
      setStatus('spectating');
    };
    const onTournamentWatchError = (message) => {
      if (statusRef.current === 'spectating') {
        spectatorMatchRef.current = null;
        setSpectatorMatch(null);
        setTournamentRound(null);
        setGame(null);
        setReturnToTournament(true);
        setStatus('idle');
      }
      showNotice(message);
    };
    const onTournamentCountdown = ({ seconds, round }) => {
      setTournamentRound(TOURNAMENT_ROUND_LABELS[round] || null);
      setTournamentCountdown(Math.max(1, Number(seconds) || 3));
    };
    const onTournamentUpdate = ({ message, status: tournamentStatus, round, participantStatus }) => {
      setIsResumingGame(false);
      if (participantStatus === 'WAITING' || tournamentStatus === 'COMPLETED') {
        setReturnToTournament(true);
      }
      if (!message) return;
      window.dispatchEvent(new Event('player:refresh'));
      showNotice({
        title: tournamentStatus === 'COMPLETED'
          ? 'Tournament complete'
          : round === 3 && ['ROUND_READY', 'ROUND_STARTED'].includes(tournamentStatus)
            ? 'Final starting'
            : tournamentStatus === 'WAITING'
              ? 'Waiting for other matches'
              : 'Tournament update',
        message,
        type: tournamentStatus === 'COMPLETED' ? 'success' : 'info',
      });
    };
    const onUpdate = (state) => {
      setConnected(true);
      setIsResumingGame(false);
      setGame({
        ...state,
        localDeadline: state.timeLeftMs != null ? Date.now() + state.timeLeftMs : null,
      });
    };
    const onMatchError = (message) => {
      matchmakingRequestRef.current = null;
      cancelledMatchmakingRef.current = false;
      setMatchmakingType('normal');
      setMatchWinAmount(null);
      setTournamentBracketPreview(null);
      setStatus('idle');
      showNotice(message);
    };
    const onOver = (result) => {
      if (statusRef.current === 'spectating') {
        spectatorMatchRef.current = null;
        setSpectatorMatch(null);
        setTournamentRound(null);
        setGame(null);
        setReturnToTournament(true);
        setStatus('idle');
        window.dispatchEvent(new Event('player:refresh'));
        showNotice('This match has ended.');
        return;
      }
      if (
        result?.tournament
        && (
          result.tournament.status === 'COMPLETED'
          || (
            result.winner === myColorRef.current
            && ['WAITING', 'ROUND_READY'].includes(result.tournament.status)
          )
        )
      ) {
        setReturnToTournament(true);
        window.dispatchEvent(new Event('player:refresh'));
      }
      if (leaveRequestRef.current) {
        pendingOverRef.current = result;
        return;
      }
      setGameResult(result);
      clearTimeout(resultTimerRef.current);
      setStatus('finishing');
      resultTimerRef.current = setTimeout(() => setStatus('over'), RESULT_REVEAL_MS);
    };
    const onSettlementError = (message) => showNotice(message);
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
    socket.on('tournament_bracket', onTournamentBracket);
    socket.on('tournament_watch_started', onTournamentWatchStarted);
    socket.on('tournament_watch_error', onTournamentWatchError);
    socket.on('tournament_countdown', onTournamentCountdown);
    socket.on('lobby_update', onLobby);
    socket.on('lobby_error', showNotice);
    socket.on('match_found', onMatch);
    socket.on('match_error', onMatchError);
    socket.on('game_update', onUpdate);
    socket.on('notice', showNotice);
    socket.on('settlement_error', onSettlementError);
    socket.on('game_over', onOver);
    socket.on('tournament_update', onTournamentUpdate);
    if (GAME_CHAT_ENABLED) socket.on('chat_message', onChat);
    if (socket.connected) {
      if (spectatorMatchRef.current) {
        socket.emit('watch_tournament_match', spectatorMatchRef.current);
      } else {
        socket.emit('resume_game');
      }
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onPageVisible);
      document.removeEventListener('visibilitychange', onPageVisible);
      socket.off('no_game', onNoGame);
      socket.off('queued', onQueued);
      socket.off('tournament_bracket', onTournamentBracket);
      socket.off('tournament_watch_started', onTournamentWatchStarted);
      socket.off('tournament_watch_error', onTournamentWatchError);
      socket.off('tournament_countdown', onTournamentCountdown);
      socket.off('lobby_update', onLobby);
      socket.off('lobby_error', showNotice);
      socket.off('match_found', onMatch);
      socket.off('match_error', onMatchError);
      socket.off('game_update', onUpdate);
      socket.off('notice', showNotice);
      socket.off('settlement_error', onSettlementError);
      socket.off('game_over', onOver);
      socket.off('tournament_update', onTournamentUpdate);
      if (GAME_CHAT_ENABLED) socket.off('chat_message', onChat);
      clearTimeout(resultTimerRef.current);
      clearTimeout(noticeTimerRef.current);
      clearReconnectNotice();
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

  useEffect(() => {
    if (!tournamentCountdown || tournamentCountdown <= 1) return undefined;
    const id = setTimeout(() => {
      setTournamentCountdown((current) => current > 1 ? current - 1 : current);
    }, 1000);
    return () => clearTimeout(id);
  }, [tournamentCountdown]);

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
    setGameResult(null);
    const numericBet = Number(bet);
    setMatchWinAmount(queueType === 'tournament'
      ? null
      : Number.isFinite(numericBet) && numericBet > 0
      ? Math.round(numericBet * 2 * 0.9)
      : null);
    socket.emit('find_match', { mode: 2, name: cleanName(), requestId, queueType, bet: numericBet });
  };
  const createRoom = (mode, bet) => socket.emit('create_room', { mode, bet, name: cleanName() });
  const joinRoom = () => {
    if (joinCode.trim().length !== 5) return showNotice('Enter the 5-character room code first.');
    socket.emit('join_room', { code: joinCode.trim(), name: cleanName() });
  };
  const cancel = () => {
    cancelledMatchmakingRef.current = true;
    socket.emit('cancel_match', { requestId: matchmakingRequestRef.current });
    matchmakingRequestRef.current = null;
    setMatchmakingType('normal');
    setStatus('idle');
  };
  const stopWatchingTournament = () => {
    socket.emit('stop_watching_tournament_match');
    spectatorMatchRef.current = null;
    setSpectatorMatch(null);
    setTournamentRound(null);
    setGame(null);
    setReturnToTournament(true);
    setStatus('idle');
    window.dispatchEvent(new Event('player:refresh'));
  };
  const leaveLobby = () => {
    socket.emit('leave_room');
    setLobby(null);
    setStatus('idle');
  };
  const reset = () => {
    clearTimeout(resultTimerRef.current);
    leaveRequestRef.current = false;
    pendingOverRef.current = null;
    setGame(null);
    setGameResult(null);
    setMatchWinAmount(null);
    setTournamentRound(null);
    setTournamentCountdown(null);
    spectatorMatchRef.current = null;
    setSpectatorMatch(null);
    setMyColor(null);
    myColorRef.current = null;
    setStatus('idle');
  };
  useEffect(() => {
    if (status !== 'over') return undefined;
    const timer = setTimeout(reset, 3000);
    return () => clearTimeout(timer);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isMobileLayout || status !== 'playing') return undefined;

    window.history.pushState({ ludoGameBackGuard: true }, '', window.location.href);
    const handleBack = () => {
      if (statusRef.current !== 'playing') return;
      setLeaveOpen(true);
      window.history.pushState({ ludoGameBackGuard: true }, '', window.location.href);
    };
    window.addEventListener('popstate', handleBack);

    return () => {
      window.removeEventListener('popstate', handleBack);
      if (window.history.state?.ludoGameBackGuard) window.history.back();
    };
  }, [isMobileLayout, status]);

  const leaveGame = () => {
    if (!connected) return;
    leaveRequestRef.current = true;
    pendingOverRef.current = null;
    setLeaving(true);
    socket.timeout(5000).emit('leave_game', (error, result) => {
      setLeaving(false);
      if (error || !result?.ok) {
        leaveRequestRef.current = false;
        showNotice('Could not leave the game. Please try again.');
        if (pendingOverRef.current) {
          setGameResult(pendingOverRef.current);
          pendingOverRef.current = null;
          clearTimeout(resultTimerRef.current);
          setStatus('finishing');
          resultTimerRef.current = setTimeout(() => setStatus('over'), RESULT_REVEAL_MS);
        }
        return;
      }
      setLeaveOpen(false);
      pendingOverRef.current = null;
      if (result.forfeited && result.winner) {
        setGame((current) => current ? { ...current, winner: result.winner } : current);
        setGameResult({ winner: result.winner, forfeited: true });
        clearTimeout(resultTimerRef.current);
        setStatus('over');
        return;
      }
      leaveRequestRef.current = false;
      if (result.winner) {
        setGame((current) => current ? { ...current, winner: result.winner } : current);
        setGameResult({ winner: result.winner });
        setStatus('finishing');
        clearTimeout(resultTimerRef.current);
        resultTimerRef.current = setTimeout(() => setStatus('over'), RESULT_REVEAL_MS);
        return;
      }
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

  const inGame = Boolean(game && ['playing', 'finishing', 'over', 'spectating'].includes(status));
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
        onDisableAutoMode={() => socket.emit('disable_auto_mode')}
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
      <Suspense fallback={<p role="status">Loading dashboard...</p>}>
        <MasterDashboard
          token={authSession.token}
          onBack={signOut}
        />
      </Suspense>
    );
  }

  if (currentPath === '/superadmin') {
    if (authSession?.account.role !== 'SUPER_ADMIN') {
      return <LoginScreen onSignIn={handleSignIn} loading={loginLoading} error={loginError} />;
    }
    return (
      <Suspense fallback={<p role="status">Loading dashboard...</p>}>
        <SuperAdminDashboard token={authSession.token} onSignOut={signOut} />
      </Suspense>
    );
  }

  return (
    <div className={'app' + (homeScreen ? ' home-screen' : '') + (inGame ? ' in-game' : '') + (status === 'lobby' ? ' lobby-screen' : '') + (homeView === 'login' ? ' login-screen' : '')}>
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
      {!connected && !navigator.onLine && inGame && showReconnectOverlay && (
        <div className="reconnect-overlay">
          <section className="reconnect-card" role="alertdialog" aria-modal="true" aria-labelledby="reconnect-title">
            <strong id="reconnect-title">Internet connection lost</strong>
            <DiceLoader label="Trying to reconnect..." />
          </section>
        </div>
      )}
      {isResumingGame && homeView === 'menu' && (
        <div className="reconnect-overlay resume-loader-overlay">
          <section className="reconnect-card resume-loader-card">
            <DiceLoader label="Restoring your game" showLabel={false} />
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
          onCreateRoom={createRoom}
          joinCode={joinCode}
          onJoinCodeChange={setJoinCode}
          onJoinRoom={joinRoom}
          initialPage={returnToTournament ? 'tournaments' : 'home'}
          onWatchTournamentMatch={(tournamentId, roundNo, matchNo) =>
            socket.emit('watch_tournament_match', { tournamentId, roundNo, matchNo })}
          token={authSession?.token}
          onSignOut={signOut}
          connected={connected}
          isResumingGame={isResumingGame}
        />
      )}

      {status === 'queued' && <MatchmakingScreen secondsLeft={queueLeft} queueType={matchmakingType} onCancel={cancel} />}
      {tournamentCountdown && (
        <div className="tournament-game-countdown" role="status" aria-live="assertive">
          <div className="tournament-game-countdown-card">
            <span>Your {tournamentRound ? `${tournamentRound} match` : 'tournament match'} starts in</span>
            <strong key={tournamentCountdown}>{tournamentCountdown}</strong>
          </div>
          <style>{`
            .tournament-game-countdown {
              position: fixed;
              inset: 0;
              z-index: 130;
              display: grid;
              place-items: center;
              background: rgba(15, 8, 3, .58);
              backdrop-filter: blur(4px);
            }
            .tournament-game-countdown-card {
              display: grid;
              justify-items: center;
              gap: 4px;
              width: 230px;
              border: 1px solid #d5a928;
              border-radius: 22px;
              padding: 18px 20px 14px;
              color: #3b2412;
              background: linear-gradient(155deg, #fffdf5, #fbefcf 70%, #f1dfb2);
              box-shadow: inset 0 2px 0 #fff, 0 9px 0 #704217, 0 20px 45px #0008;
              text-align: center;
            }
            .tournament-game-countdown-card span {
              font-size: 14px;
              font-weight: 800;
            }
            .tournament-game-countdown-card strong {
              display: grid;
              width: 86px;
              height: 86px;
              place-items: center;
              border: 4px solid #fff2a6;
              border-radius: 50%;
              color: #fff;
              background: linear-gradient(180deg, #ffca36, #e89b00);
              box-shadow: 0 5px 0 #9a6f00, 0 8px 18px #3b241266;
              font: 400 52px/1 'Lilita One', 'Baloo 2', system-ui, sans-serif;
              animation: tournament-countdown-pop .25s ease-out;
            }
            @keyframes tournament-countdown-pop {
              from { transform: scale(.72); opacity: .35; }
              to { transform: scale(1); opacity: 1; }
            }
            @media (max-width: 600px) {
              .tournament-game-countdown {
                padding:
                  max(12px, env(safe-area-inset-top))
                  12px
                  max(12px, env(safe-area-inset-bottom));
              }
              .tournament-game-countdown-card {
                width: min(230px, calc(100vw - 24px));
                max-width: 230px;
                box-sizing: border-box;
                border-radius: 18px;
                padding: 14px 16px 12px;
              }
              .tournament-game-countdown-card span {
                font-size: 13px;
              }
              .tournament-game-countdown-card strong {
                width: 72px;
                height: 72px;
                border-width: 3px;
                font-size: 44px;
              }
            }
            @media (max-height: 500px) and (orientation: landscape) {
              .tournament-game-countdown-card {
                width: 210px;
                padding: 10px 14px 8px;
              }
              .tournament-game-countdown-card strong {
                width: 58px;
                height: 58px;
                font-size: 36px;
              }
            }
            @media (prefers-reduced-motion: reduce) {
              .tournament-game-countdown-card strong { animation: none; }
            }
          `}</style>
        </div>
      )}
      {status === 'bracket' && tournamentBracketPreview && (
        <TournamentBracketScreen
          matches={tournamentBracketPreview.matches}
          yourSlot={tournamentBracketPreview.yourSlot}
        />
      )}

      {status === 'lobby' && lobby && (
        <PrivateLobby
          lobby={lobby}
          playerId={socket.id}
          bubbles={bubbles}
          chatEnabled={GAME_CHAT_ENABLED}
          isHost={isHost}
          whatsappLink={whatsappLink}
          onCopyLink={copyLink}
          onOpenChat={() => setChatOpen(true)}
          onStart={() => socket.emit('start_room')}
          onLeave={leaveLobby}
        />
      )}

      {inGame && (
        <>
          {status === 'spectating' && spectatorMatch && (
            <div
              className="spectator-top-bar"
              role="status"
              aria-label={`Watching ${tournamentRound} match ${spectatorMatch.matchNo}`}
            >
              <span className="spectator-label-wide">Watching {tournamentRound} · Match {spectatorMatch.matchNo}</span>
              <span className="spectator-label-compact">{tournamentRound} · Match {spectatorMatch.matchNo}</span>
              <button
                type="button"
                aria-label="Back to tournament bracket"
                onClick={stopWatchingTournament}
              >
                Back
              </button>
            </div>
          )}
          <div className="game" inert={!connected || status === 'spectating'}>
          {status === 'playing' && (
            <GameTopBar
              onLeave={() => setLeaveOpen(true)}
              winAmount={matchWinAmount}
              tournamentRound={tournamentRound}
              soundMuted={soundMuted}
              onToggleMute={toggleSound}
            />
          )}

          <div className="prow prow-top">{colorsInRow('top').map(renderSlot)}</div>

          <Board
            tokens={game.tokens}
            captures={game.captures}
            lastMove={game.lastMove}
            celebrateWinner={status === 'finishing'
              && (!tournamentRound || game.winner === myColor)
              ? game.winner
              : null}
            turn={status === 'playing' || status === 'spectating' ? game.turn : null}
            myColor={myColor}
            rotation={boardRotation}
            movable={movable}
            diceOptions={diceOptions}
            rollId={game.rollId}
            soundMuted={soundMuted}
            onMove={(idx, diceId) => {
              if (status === 'playing') {
                socket.emit('move_token', { tokenIdx: idx, diceId });
              }
            }}
          />

          <div className="prow prow-bottom">{colorsInRow('bottom').map(renderSlot)}</div>

        </div>
        </>
      )}

      {status === 'over' && game && (
        <div className={`overlay game-result ${game.winner === myColor && !gameResult?.cancelled && !gameResult?.forfeited ? 'victory' : 'defeat'}`} inert={!connected}>
          {game.winner === myColor && !gameResult?.cancelled && !gameResult?.forfeited && (
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
          <div className={`card center result-card ${game.winner === myColor && !gameResult?.cancelled && !gameResult?.forfeited ? 'win' : 'loss'}`}>
            <button
              className="result-close"
              type="button"
              aria-label="Close and return to home"
              onClick={reset}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m7 7 10 10M17 7 7 17" />
              </svg>
            </button>
            <div className="result-icon" aria-hidden="true">
              {gameResult?.cancelled || gameResult?.forfeited ? '↩' : game.winner === myColor ? '🏆' : '🎲'}
            </div>
            <span className="result-kicker">
              {gameResult?.forfeited ? 'YOU LEFT' : gameResult?.cancelled ? 'MATCH CANCELLED' : game.winner === myColor ? 'CHAMPION' : 'GAME OVER'}
            </span>
            <h2>{gameResult?.forfeited ? 'You left the game' : gameResult?.cancelled ? 'Match cancelled' : game.winner === myColor ? 'You won!' : `${cap(game.winner)} wins`}</h2>
            <p>{gameResult?.cancelled
              ? 'Your bet has been refunded. No platform fee was charged.'
              : gameResult?.forfeited ? 'Your opponent won by forfeit.'
              : game.winner === myColor ? 'Amazing game. You conquered the board!' : 'Better luck next game!'}</p>
            {gameResult?.wager && (
              <p>
                Bet: {gameResult.wager.bet.toLocaleString()} credits · Platform fee: {gameResult.wager.feePerPlayer.toLocaleString()} credits · {game.winner === myColor
                  ? `Payout: ${gameResult.wager.payout.toLocaleString()} credits`
                  : `Lost: ${gameResult.wager.bet.toLocaleString()} credits`}
              </p>
            )}
            {game.winner === myColor
              && !gameResult?.cancelled
              && (gameResult?.wager || gameResult?.tournament?.round === 3)
              && <DiceLoader label="Updating account balance" showLabel={false} />}
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
            <p className="hint">If you quit, the game will end and your opponent will win.</p>
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