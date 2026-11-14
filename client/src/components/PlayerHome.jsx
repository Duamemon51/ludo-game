import { useState, useEffect, useCallback, useRef } from 'react';
import { playerRequest, PLAYER_SERVER_UNAVAILABLE } from '../playerApi';
import HomeGameCards from './HomeGameCards';

const PAWN_COLORS = ['#e53935', '#3fa34d', '#fcc419', '#1e88e5'];
const TOURNAMENT = { id: 'quick-1v1', name: 'Quick 1 vs 1' };
const TOURNAMENT_BETS = [300, 500, 1000, 2000, 3000, 4000, 5000];
const SHOW_TOURNAMENT_UI = false;

function Icon({ children }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const ICON_REFRESH = <><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>;
const ICON_CLOCK = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>;
const ICON_DOWN = <><path d="M12 5v14" /><path d="m5 12 7 7 7-7" /></>;
const ICON_UP = <><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>;

// Compact page header: round back icon, title, optional round icon action.
function PanelHead({ title, onBack, action, className = '' }) {
  return (
    <div className={`ph-head ${className}`}>
      <button type="button" className="ph-icon-btn" onClick={onBack} aria-label="Back">
        <Icon><path d="m15 18-6-6 6-6" /></Icon>
      </button>
      <h2>{title}</h2>
      {action ? (
        <button type="button" className="ph-icon-btn" onClick={action.onClick} aria-label={action.label} title={action.label}>
          <Icon>{action.icon}</Icon>
        </button>
      ) : <span className="ph-head-spacer" />}
    </div>
  );
}

// Real 15x15 Ludo board used as the 3D background scene.
const HOME = { red: '#e53935', green: '#3fa34d', yellow: '#fcc419', blue: '#1e88e5' };
const START = { '6,1': 'red', '1,8': 'green', '8,13': 'yellow', '13,6': 'blue' };

const LUDO_CELLS = (() => {
  const cells = [];
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      if (r >= 6 && r <= 8 && c >= 6 && c <= 8) continue; // center is drawn separately
      const quad =
        r < 6 && c < 6 ? 'red' :
        r < 6 && c > 8 ? 'green' :
        r > 8 && c > 8 ? 'yellow' :
        r > 8 && c < 6 ? 'blue' : null;
      let kind = 'path';
      let color = null;
      if (quad) {
        const lr = r < 6 ? r : r - 9;
        const lc = c < 6 ? c : c - 9;
        color = quad;
        if (lr >= 1 && lr <= 4 && lc >= 1 && lc <= 4) {
          kind = lr >= 2 && lr <= 3 && lc >= 2 && lc <= 3 ? 'spot' : 'inner';
        } else {
          kind = 'home';
        }
      } else if (r === 7 && c >= 1 && c <= 5) { kind = 'col'; color = 'red'; }
      else if (r === 7 && c >= 9 && c <= 13) { kind = 'col'; color = 'yellow'; }
      else if (c === 7 && r >= 1 && r <= 5) { kind = 'col'; color = 'green'; }
      else if (c === 7 && r >= 9 && r <= 13) { kind = 'col'; color = 'blue'; }
      else if (START[`${r},${c}`]) { kind = 'col'; color = START[`${r},${c}`]; }
      cells.push({ r, c, kind, color });
    }
  }
  return cells;
})();

function LudoBoard() {
  return (
    <div className="ph-board">
      {LUDO_CELLS.map(({ r, c, kind, color }) => (
        <i
          key={`${r}-${c}`}
          className={`lb lb-${kind}`}
          style={{ gridRow: r + 1, gridColumn: c + 1, ...(color ? { '--c': HOME[color] } : {}) }}
        />
      ))}
      <b className="lb-center" />
    </div>
  );
}

// Classifies a match row as win / loss / other using the result text first, then the amount.
function outcome(match) {
  const text = String(match.result || '').toLowerCase();
  if (/\b(win|won)\b/.test(text)) return 'win';
  if (/los/.test(text)) return 'loss';
  if (match.amount > 0) return 'win';
  if (match.amount < 0) return 'loss';
  return 'other';
}

function Avatar({ src, letter }) {
  return (
    <span className="ph-avatar" aria-hidden="true">
      {src ? <img src={src} alt="" /> : letter}
    </span>
  );
}

// Crops the picked photo to a centered square and shrinks it so it stays small to store.
function resizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Invalid image'));
    };
    img.src = url;
  });
}

export default function PlayerHome({
  name, onNameChange, onAvatarChange, onFindMatch, token, onSignOut, connected = true,
}) {
  const [page, setPage] = useState('home');
  const [bet, setBet] = useState(300);
  const [tournamentBet, setTournamentBet] = useState(300);
  const [profile, setProfile] = useState(null);
  const [wallet, setWallet] = useState({ balance: 0, heldAmount: 0, availableBalance: 0, ledger: [], requests: [] });
  const [matches, setMatches] = useState([]);
  const [tournament, setTournament] = useState({ enabled: false, entryFee: 300, feePercent: 10, mode: 'Quick 1 vs 1' });
  const [loading, setLoading] = useState(true);
  const [requestingWalletRequest, setRequestingWalletRequest] = useState(false);
  const [walletRequestOpen, setWalletRequestOpen] = useState(false);
  const [walletRequestType, setWalletRequestType] = useState('withdrawal');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState('all');
  const [historyPage, setHistoryPage] = useState(1);
  const [journeyPage, setJourneyPage] = useState(1);
  const [historyFilterOpen, setHistoryFilterOpen] = useState(false);
  const [avatar, setAvatar] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const fileInputRef = useRef(null);
  const historyFilterRef = useRef(null);
  const historyPageSize = 5;
  const journeyPageSize = 5;
  const avatarKey = `ludo-avatar:${profile?.id ?? profile?.name ?? name ?? 'player'}`;
  const loadPlayerAvatar = useCallback((playerProfile) => {
    const key = `ludo-avatar:${playerProfile?.id ?? playerProfile?.name ?? name ?? 'player'}`;
    let savedAvatar;
    try {
      savedAvatar = localStorage.getItem(key) || '';
    } catch {
      onAvatarChange?.('');
      setAvatar('');
      return;
    }
    setAvatar(savedAvatar);
    onAvatarChange?.(savedAvatar);
  }, [name, onAvatarChange]);
  const balance = wallet.balance;
  const availableBalance = wallet.availableBalance;
  const active = profile?.status === 'Active';
  const journeyPageCount = Math.max(1, Math.ceil(matches.length / journeyPageSize));
  const currentJourneyPage = Math.min(journeyPage, journeyPageCount);
  const visibleJourneyMatches = matches.slice(
    (currentJourneyPage - 1) * journeyPageSize,
    currentJourneyPage * journeyPageSize
  );
  // Cosmetic level: every 10 matches played = 1 level.
  const played = matches.length;
  const level = Math.floor(played / 10) + 1;
  const levelPct = (played % 10) * 10;
  const walletHistory = [
    ...wallet.requests.map((request) => ({
      id: `request-${request.id}`,
      source: 'request',
      type: request.type.toLowerCase(),
      label: `${request.type} request`,
      amount: request.amount,
      date: request.date,
      detail: request.reason,
      status: request.status,
    })),
    ...wallet.ledger.map((entry) => {
      const entryType = entry.type.toLowerCase();
      const type = ['deposit', 'add', 'credit'].includes(entryType)
        ? 'deposit'
        : ['withdraw', 'withdrawal', 'deduct', 'debit'].includes(entryType)
          ? 'withdrawal'
          : 'transaction';
      return {
        id: `transaction-${entry.id}`,
        source: 'transaction',
        type,
        label: entry.type,
        amount: entry.amount,
        date: entry.date,
        detail: entry.note,
        balanceAfter: entry.balanceAfter,
      };
    }),
  ]
    .filter((entry) => {
      if (historyTab === 'requests') return entry.source === 'request';
      if (historyTab === 'transactions') return entry.source === 'transaction';
      return historyTab === 'all' || entry.type === historyTab;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const historyPageCount = Math.max(1, Math.ceil(walletHistory.length / historyPageSize));
  const currentHistoryPage = Math.min(historyPage, historyPageCount);
  const visibleWalletHistory = walletHistory.slice(
    (currentHistoryPage - 1) * historyPageSize,
    currentHistoryPage * historyPageSize
  );
  const tournamentBetAmount = tournamentBet;
  const feePercent = Number(tournament.feePercent ?? 10);
  const roundCredits = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
  const feePerPlayer = roundCredits((bet * feePercent) / 100);
  const matchPlatformFee = roundCredits(feePerPlayer * 2);
  const matchPayout = roundCredits((bet * 2) - matchPlatformFee);
  const tournamentPot = Number.isSafeInteger(tournamentBetAmount) && tournamentBetAmount >= 0
    ? tournamentBetAmount * 2
    : 0;
  const tournamentFeePerPlayer = roundCredits((tournamentBetAmount * feePercent) / 100);
  const tournamentFee = roundCredits(tournamentFeePerPlayer * 2);
  const tournamentPayout = roundCredits(tournamentPot - tournamentFee);
  const validTournamentBet = TOURNAMENT_BETS.includes(tournamentBetAmount)
    && tournamentBetAmount <= availableBalance;

  const refreshPlayerData = useCallback(async () => {
    try {
      const [playerProfile, walletData, matchRows, tournamentSettings] = await Promise.all([
        playerRequest('/me', { token }),
        playerRequest('/wallet', { token }),
        playerRequest('/matches', { token }),
        playerRequest('/tournaments', { token }),
      ]);
      loadPlayerAvatar(playerProfile);
      setProfile(playerProfile);
      setWallet(walletData);
      setMatches(matchRows);
      setTournament(tournamentSettings);
      setLoadError('');
      onNameChange(playerProfile.name);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, [loadPlayerAvatar, token, onNameChange]);

  useEffect(() => {
    const expireSession = () => onSignOut();
    window.addEventListener('player:unauthorized', expireSession);
    return () => window.removeEventListener('player:unauthorized', expireSession);
  }, [onSignOut]);

  useEffect(() => {
    const refreshTimer = window.setInterval(refreshPlayerData, 30000);
    return () => window.clearInterval(refreshTimer);
  }, [refreshPlayerData]);

  useEffect(() => {
    let activeRequest = true;
    Promise.all([
      playerRequest('/me', { token }),
      playerRequest('/wallet', { token }),
      playerRequest('/matches', { token }),
      playerRequest('/tournaments', { token }),
    ]).then(([playerProfile, walletData, matchRows, tournamentSettings]) => {
      if (!activeRequest) return;
      loadPlayerAvatar(playerProfile);
      setProfile(playerProfile);
      setWallet(walletData);
      setMatches(matchRows);
      setTournament(tournamentSettings);
      setLoadError('');
      onNameChange(playerProfile.name);
    }).catch((error) => {
      if (activeRequest) setLoadError(error.message);
    }).finally(() => {
      if (activeRequest) setLoading(false);
    });
    return () => { activeRequest = false; };
  }, [loadPlayerAvatar, token, onNameChange]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  useEffect(() => {
    if (!historyFilterOpen) return;
    const closeOnOutsideClick = (event) => {
      if (!historyFilterRef.current?.contains(event.target)) setHistoryFilterOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setHistoryFilterOpen(false);
        historyFilterRef.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [historyFilterOpen]);

  const onPickAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.');
      return;
    }
    try {
      const dataUrl = await resizeImage(file, 160);
      localStorage.setItem(avatarKey, dataUrl);
      setAvatar(dataUrl);
      onAvatarChange?.(dataUrl);
      setAvatarError('');
    } catch {
      setAvatarError('Could not save this photo. Try a different image.');
    }
  };

  const removeAvatar = () => {
    try { localStorage.removeItem(avatarKey); } catch { /* storage unavailable */ }
    setAvatar('');
    onAvatarChange?.('');
    setAvatarError('');
  };

  const joinTournament = () => {
    if (!tournament.enabled || !active || !connected || !validTournamentBet) return;
    onFindMatch(tournamentBetAmount, 'tournament');
  };

  const openWalletRequest = (type) => {
    setWalletRequestType(type);
    setWithdrawAmount('');
    setMessage('');
    setWalletRequestOpen(true);
  };

  const submitWalletRequest = async (event) => {
    event.preventDefault();
    setRequestingWalletRequest(true);
    setMessage('');
    try {
      await playerRequest('/requests', {
        token,
        method: 'POST',
        body: { type: walletRequestType, amount: Number(withdrawAmount) },
      });
      setWithdrawAmount('');
      setWalletRequestOpen(false);
      setMessage(`${walletRequestType === 'deposit' ? 'Deposit' : 'Withdrawal'} request sent to your Master.`);
      await refreshPlayerData();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setRequestingWalletRequest(false);
    }
  };

  return (
    <main className="player-home">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lilita+One&family=Baloo+2:wght@500;700&display=swap');
        .player-home {
          --player-ink: #3b2412;
          --gold: #fcc419;
          position: relative;
          isolation: isolate;
          width: 100%;
          min-height: 100vh;
          min-height: 100dvh;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          padding: env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px);
          color: #fff;
          font-family: 'Baloo 2', 'Trebuchet MS', system-ui, sans-serif;
          background: radial-gradient(120% 70% at 50% 25%, #5a3418 0%, #2b1608 55%, #120a04 100%);
          -webkit-tap-highlight-color: transparent;
        }
        .player-home * { box-sizing: border-box; }
        .player-home button, .player-home input { font: inherit; }
        .player-home button { cursor: pointer; }
        .sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
        .ph-scene { position: absolute; inset: 0; z-index: -1; overflow: hidden; perspective: 700px; pointer-events: none; }

        /* real 15x15 Ludo board */
        .ph-board {
          position: absolute; top: -25%; left: 50%; width: min(115vw, 1050px); aspect-ratio: 1;
          transform: translateX(-50%) rotateX(58deg) rotateZ(-24deg);
          display: grid; grid-template: repeat(15, 1fr) / repeat(15, 1fr); gap: 2px; padding: 10px;
          border-radius: 18px; background: #5b3a1e; opacity: .6; box-shadow: 0 0 0 8px #8a4d20, 0 30px 60px #000a;
        }
        .lb { border-radius: 3px; background: #f6e7bd; box-shadow: inset 0 -2px 0 #0002; }
        .lb-home { background: var(--c); }
        .lb-inner { background: #fff; }
        .lb-spot { background: radial-gradient(circle at 50% 50%, var(--c) 0 58%, #fff 62%); }
        .lb-col { background: var(--c); }
        .lb-center {
          grid-area: 7 / 7 / 10 / 10; border-radius: 4px;
          background: conic-gradient(from -45deg at 50% 50%, #3fa34d 0 25%, #fcc419 0 50%, #1e88e5 0 75%, #e53935 0);
          box-shadow: inset 0 0 0 2px #fff8;
        }

        .ph-header { position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 14px 20px 0; }
        .ph-brand { display: flex; align-items: center; gap: 9px; min-height: 48px; border-radius: 999px; padding: 4px 16px 4px 4px; background: linear-gradient(180deg, #6b3a17f2, #43230fe6); box-shadow: inset 0 0 0 1.5px #fcc419b3, 0 4px 10px #0006; }
        .ph-avatar { position: relative; display: grid; place-items: center; width: 38px; height: 38px; flex: none; border-radius: 50%; font-family: 'Lilita One', sans-serif; font-size: 20px; background: radial-gradient(circle at 35% 28%, #ff9a90, #e53935 55%, #8e1b1b); box-shadow: 0 0 0 1.5px #fcc419b3; }
        .ph-name-wrap { display: flex; flex-direction: column; min-width: 0; line-height: 1; cursor: text; }
        .ph-name-wrap small { margin-bottom: 1px; color: #ffd269; font-size: 10px; font-weight: 700; opacity: .75; }
        .ph-edit { width: 14px; height: 14px; flex: none; color: #ffd269; opacity: .55; }
        .ph-brand:focus-within { box-shadow: inset 0 0 0 1.5px #fff3cc, 0 0 0 3px #fcc41959, 0 4px 10px #0006; }
        .ph-brand-name { color: #fff; font-family: 'Lilita One', sans-serif; font-size: 19px; letter-spacing: .04em; }
        .ph-brand-name span { color: #ffd269; }
        .ph-account { display: flex; align-items: center; gap: 10px; }
        .ph-name { display: block; width: 120px; min-width: 0; overflow: hidden; color: #fff3cc; font-family: 'Lilita One', 'Baloo 2', sans-serif; font-size: 18px; font-weight: 400; letter-spacing: .02em; line-height: 1.1; text-overflow: ellipsis; white-space: nowrap; }
        .ph-name::placeholder { color: #ffffff80; }
        .ph-wallet { border: 0; border-radius: 999px; padding: 5px 16px; color: #ffe9b0; background: linear-gradient(180deg, #6b3a17f2, #43230fe6); text-align: left; box-shadow: inset 0 0 0 1.5px #fcc419b3, 0 4px 10px #0006; }
        .ph-wallet strong { display: block; color: #ffd269; font-family: 'Lilita One', sans-serif; font-weight: 400; font-size: 18px; line-height: 1.05; }
        .ph-wallet small { font-size: 10px; font-weight: 700; opacity: .75; }
        .ph-wallet:active { transform: scale(.97); }
        .ph-menu-btn { display: none; width: 44px; height: 44px; border: 0; border-radius: 50%; place-items: center; color: #ffd269; background: linear-gradient(180deg, #6b3a17f2, #43230fe6); box-shadow: inset 0 0 0 1.5px #fcc419b3, 0 4px 10px #0006; }
        .ph-menu-btn:active { transform: scale(.94); }
        .ph-layout { position: relative; z-index: 1; flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(360px, 460px); align-items: center; gap: clamp(24px, 5vw, 76px); padding: 18px clamp(20px, 7vw, 110px) 30px; }
        .ph-layout-detail { grid-template-columns: minmax(0, 1fr); }
        .ph-layout-detail .ph-hero { display: none; }
        .ph-hero { display: flex; min-width: 0; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
        .ph-hero .lh-dice { margin: 8px 0 22px; transform: scale(1.35); }
        .ph-title { margin: 4px 0 0; font-family: 'Lilita One', 'Baloo 2', sans-serif; font-size: clamp(82px, 11vw, 140px); font-weight: 400; line-height: .95; letter-spacing: 3px; }
        .ph-title span { display: inline-block; color: var(--c); text-shadow: 0 1px 0 var(--d), 0 2px 0 var(--d), 0 3px 0 var(--d), 0 4px 0 var(--d), 0 5px 0 var(--d), 0 6px 0 var(--d), 0 12px 10px #0008; -webkit-text-stroke: 1.5px #ffffff80; paint-order: stroke fill; }
        .ph-subtitle { margin: 12px 0 0; color: #ffebbed9; font-size: clamp(16px, 2vw, 21px); font-weight: 700; }
        .ph-pawns { display: flex; gap: 18px; margin-top: 24px; }
        .ph-pawn { position: relative; display: block; width: 22px; height: 34px; transform: scale(1.15); filter: drop-shadow(0 4px 3px #0009); }
        .ph-pawn::before { content: ''; position: absolute; top: 0; left: 50%; width: 13px; height: 13px; transform: translateX(-50%); border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff 0 10%, color-mix(in srgb, var(--pawn) 55%, #fff) 28%, var(--pawn) 65%, var(--pawn-dark)); }
        .ph-pawn::after { content: ''; position: absolute; right: 0; bottom: 0; left: 0; height: 24px; border-radius: 45% 45% 6px 6px / 85% 85% 6px 6px; background: linear-gradient(90deg, var(--pawn-dark), var(--pawn) 28%, color-mix(in srgb, var(--pawn) 55%, #fff) 45%, var(--pawn) 62%, var(--pawn-dark)); box-shadow: inset 0 -4px 0 #0004; }
        .ph-status { margin: 12px 0 0; display: inline-flex; align-items: center; gap: 8px; border-radius: 99px; padding: 7px 12px; background: #ffffff18; font-size: 13px; }
        .ph-status i { width: 8px; height: 8px; border-radius: 50%; background: #5de29a; }
        .ph-status.blocked i { background: #ff6969; }
        .ph-sheet { display: flex; min-width: 0; flex-direction: column; gap: 12px; border-radius: 28px; padding: 22px; color: var(--player-ink); background: repeating-linear-gradient(90deg, #00000017 0 1px, transparent 1px 6px, #ffffff0d 6px 7px, transparent 7px 13px), linear-gradient(180deg, #b36a2f, #8a4d20 45%, #6b3a17); box-shadow: inset 0 3px 0 #ffffff4d, inset 0 0 0 1.5px #ffdc8259, 0 14px 35px #0008; }
        .ph-status-mobile { display: none; }
        .ph-server-warning { margin-top: 10px; border-radius: 12px; padding: 10px 13px; color: #ffe0ad; background: #ad652c55; font-size: 12px; }
        .ph-offline-overlay { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; background: #160b20c9; backdrop-filter: blur(5px); }
        .ph-offline-card { width: min(100%, 320px); padding: 24px; border: 1px solid #ffffff45; border-radius: 20px; color: #fff; background: linear-gradient(160deg, #55236f, #291038); box-shadow: 0 12px 35px #0009, inset 0 1px #ffffff30; text-align: center; }
        .ph-offline-card strong { display: block; font-size: 19px; }
        .ph-nav { display: flex; gap: 4px; padding: 4px; border-radius: 15px; background: #281406a6; box-shadow: inset 0 3px 6px #0008; }
        .ph-nav button { flex: 1; min-width: 0; border: 0; border-radius: 11px; padding: 9px 5px; color: #ffe9b0b3; background: transparent; font-family: 'Lilita One', sans-serif; font-size: 13px; }
        .ph-nav button.selected { color: var(--player-ink); background: linear-gradient(180deg, #fff7d6, #f1d68a); box-shadow: inset 0 0 0 1.5px #ffffffb3, 0 2px 0 #8a6a1c, 0 4px 6px #0005; }
        .ph-bottom-nav { display: none; }
        .ph-panel { border: 1.5px solid #ffdc8259; border-radius: 18px; padding: clamp(18px, 3vw, 24px); background: radial-gradient(120% 80% at 50% 0, #fffdf4, #fbefcf 65%, #f1dfb2); box-shadow: inset 0 4px 10px #3c1e0059; }
        .ph-panel-wallet { border-color: transparent; background: transparent; box-shadow: none; }
        .ph-panel h2 { margin: 0 0 8px; font-size: 23px; }
        .ph-panel p { color: #715637; }
        .ph-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 20px; }
        .ph-mode { min-height: 154px; text-align: left; border: 2px solid #9a6f0059; border-radius: 18px; padding: 18px; color: #3b2412; background: linear-gradient(150deg, #fff9e6, #ebd8a9); box-shadow: 0 4px 0 #97712d, 0 7px 12px #3b24122e; }
        .ph-mode:hover:not(:disabled) { border-color: #a56b06; transform: translateY(-2px); }
        .ph-mode:disabled { opacity: .55; cursor: not-allowed; }
        .ph-mode-icon { display: block; margin-bottom: 12px; font-size: 36px; }
        .ph-mode-icon svg { width: 1em; height: 1em; }
        .ph-mode strong { display: block; font-size: 22px; }
        .ph-mode small { display: block; margin-top: 7px; color: #715637; }
        .ph-lock { margin-top: 18px; border-radius: 12px; padding: 14px; color: #8d2929; background: #a52e2e1a; }
        .ph-bets { display: flex; gap: 10px; flex-wrap: wrap; margin: 18px 0; }
        .ph-bet { border: 1px solid #9a6f0080; border-radius: 10px; padding: 10px 18px; color: #3b2412; background: #fff9e6; }
        .ph-bet.selected { border-color: #a56b06; background: #ffe49a; }
        .ph-bet-input { display: flex; align-items: center; gap: 10px; max-width: 280px; margin: 12px 0; color: #715637; font-weight: 700; }
        .ph-bet-input input { width: 130px; min-height: 40px; box-sizing: border-box; border: 1px solid #9a6f0080; border-radius: 10px; padding: 8px 10px; color: #3b2412; background: #fff9e6; font: inherit; }
        .ph-bet-input input:focus-visible { outline: 3px solid #d89a19; outline-offset: 2px; }
        .ph-tournament-bet-content { width: min(100%, 420px); margin: 16px auto 0; color: #3b2412; }
        .ph-tournament-label { display: block; margin: 0 0 10px; color: #5e4322; font-size: 17px; font-weight: 800; text-align: center; }
        .ph-bet-selector { display: grid; grid-template-columns: 30px minmax(0, 1fr) 30px; align-items: center; gap: 10px; width: min(100%, 280px); margin: 0 auto 10px; }
        .ph-bet-step { display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 30px; height: 30px; margin: 0; padding: 0; border: 1px solid #c39729; border-radius: 50%; color: #55340b; background: linear-gradient(180deg, #fff1a8, #fcc419 65%, #e0a000); box-shadow: 0 2px 0 #9a6f00, 0 3px 7px #3b241225; cursor: pointer; }
        .ph-bet-step svg { display: block; flex: none; width: 19px; height: 19px; margin: 0; }
        .ph-bet-step:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
        .ph-bet-step:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 #9a6f00; }
        .ph-bet-step:disabled { opacity: .4; cursor: not-allowed; }
        .ph-bet-value { min-width: 0; border: 1px solid #9a6f0080; border-radius: 8px; padding: 9px 8px; color: #3b2412; background: linear-gradient(180deg, #fff9e6, #f3dfa9); box-shadow: inset 0 2px 6px #3b24121a, 0 1px 0 #fff; font: 800 18px/1.2 'Baloo 2', system-ui, sans-serif; text-align: center; }
        .ph-bet-value.unaffordable { color: #806f58; border-color: #c8bda7; background: #e9e1d3; opacity: .7; }
        .ph-bet-hint { margin: 0 0 16px; color: #927a55; font-size: 11px; text-align: center; }
        .ph-prize-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin: 0 0 16px; border: 1px solid #ead9aa; border-radius: 13px; padding: 12px 8px; background: #fff9e9; text-align: center; }
        .ph-prize-summary span { display: block; color: #8b7552; font-size: 10px; }
        .ph-prize-summary strong { display: block; margin-top: 3px; color: #4a3518; font-size: 13px; overflow-wrap: anywhere; }
        .ph-prize-summary .ph-prize-winner strong { color: #277447; }
        .ph-tournament-join { width: 100%; min-height: 46px; }
        .ph-tournament-error { margin: 10px 0 0; color: #a52e2e !important; font-size: 12px; }
        .ph-primary { border: 0; border-radius: 12px; padding: 12px 20px; color: #4a3000; background: linear-gradient(180deg, #fff1a8, #fcc419 55%, #e0a000); box-shadow: 0 4px 0 #9a6f00; font-weight: 800; }
        .ph-primary:disabled { opacity: .5; cursor: not-allowed; }
        .ph-back { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; border: 1px solid #d5a928; border-radius: 12px; padding: 8px 15px; color: #55340b; background: linear-gradient(180deg, #fff8df, #f3dfa9); box-shadow: inset 0 1px 0 #fff, 0 3px 0 #c39729, 0 5px 9px #3b241225; font-weight: 800; transition: transform .12s ease, box-shadow .12s ease, filter .12s ease; }
        .ph-back:hover { filter: brightness(1.04); transform: translateY(-1px); box-shadow: inset 0 1px 0 #fff, 0 4px 0 #c39729, 0 7px 12px #3b24122e; }
        .ph-back:active { transform: translateY(2px); box-shadow: inset 0 1px 0 #fff, 0 1px 0 #c39729; }
        .ph-back:focus-visible { outline: 3px solid #d89a19; outline-offset: 2px; }
        .ph-match-back { display: flex; width: fit-content; margin-left: auto; }
        .ph-mobile-back { display: none; }
        .ph-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 18px; }
        .ph-tournament { border: 1px solid #ffffff21; border-radius: 14px; padding: 16px; background: #ffffff09; }
        .ph-tournament h3 { margin: 0 0 8px; }
        .ph-tournament p { margin: 5px 0; font-size: 13px; }
        .ph-tournament button { margin-top: 10px; }
        .ph-tournament-panel > p { margin: 6px 0; }
        .ph-tournament-panel .ph-grid { margin-top: 8px; }
        .ph-rows { width: 100%; margin-top: 15px; border-collapse: collapse; }
        .ph-rows th, .ph-rows td { border-bottom: 1px solid #ffffff1b; padding: 12px 8px; text-align: left; font-size: 13px; }
        .ph-rows th { color: #ffd269; }
        .ph-muted { color: #806646; }
        .ph-message { margin: 12px 0 0; color: #ffd269 !important; }
        .ph-modal-backdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 16px; background: #100903c9; }
        .ph-modal { width: min(100%, 390px); border: 1px solid #ffffff30; border-radius: 18px; padding: 22px; background: #29190e; }
        .ph-modal input { width: 100%; margin: 12px 0; border: 1px solid #ffffff35; border-radius: 10px; padding: 11px; color: white; background: #ffffff10; }
        .ph-modal-actions { display: flex; gap: 10px; }

        /* mobile profile menu (only used on small screens) */
        .ph-scrim { position: fixed; inset: 0; z-index: 30; background: #0009; animation: ph-fade .18s ease-out; }
        .ph-menu { position: fixed; left: 0; right: 0; bottom: 0; z-index: 31; max-height: 88dvh; overflow: auto; padding: 10px 16px calc(20px + env(safe-area-inset-bottom, 0px)); border-radius: 28px 28px 0 0; color: #fff; background: repeating-linear-gradient(90deg, #00000017 0 1px, transparent 1px 6px, #ffffff0d 6px 7px, transparent 7px 13px), linear-gradient(180deg, #b36a2f, #8a4d20 45%, #6b3a17); box-shadow: inset 0 3px 0 #ffffff4d, 0 -10px 30px #0008; animation: ph-up .22s ease-out; }
        .ph-grab { width: 44px; height: 5px; margin: 0 auto 14px; border-radius: 3px; background: #ffebbe80; }
        .ph-menu-bal { display: flex; justify-content: space-between; align-items: center; padding: 14px; border-radius: 18px; background: #281406a6; box-shadow: inset 0 3px 6px #0008; }
        .ph-menu-bal small { display: block; font-size: 12px; color: #ffe6aacc; }
        .ph-menu-bal b { font-family: 'Lilita One', sans-serif; font-weight: 400; font-size: 28px; color: #ffd269; }
        .ph-menu-list { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
        .ph-menu-item { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 0 16px; border: 0; border-radius: 16px; text-align: left; color: #3b2412; background: linear-gradient(180deg, #fff7d6, #f1d68a); box-shadow: inset 0 0 0 1.5px #ffffffb3, 0 3px 0 #8a6a1c, 0 6px 8px #0004; font-family: 'Lilita One', sans-serif; font-size: 19px; }
        .ph-menu-item:active { transform: translateY(2px); }
        .ph-menu-item svg { width: 24px; height: 24px; flex: none; }
        .ph-menu-foot { margin-top: 14px; text-align: center; }
        .ph-menu-foot .ph-status { margin: 0; }
        @keyframes ph-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ph-up { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: none; } }

        /* Ludo Star style home: shared pieces (mobile-only parts hidden by default) */
        .ph-profile-card, .ph-quick { display: none; }
        .ph-nav-orb { display: contents; }
        .ph-miniboard { display: grid; grid-template: 1fr 1fr / 1fr 1fr; gap: 3px; width: 70px; height: 70px; padding: 5px; border-radius: 14px; background: #6b3a17; box-shadow: 0 0 0 2px #fcc419, 0 5px 0 #43230f, 0 9px 12px #0006; transform: rotate(-8deg); }
        .ph-miniboard i { position: relative; border-radius: 6px; background: var(--c); box-shadow: inset 0 -3px 0 #0003; }
        .ph-miniboard b { position: absolute; inset: 24%; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff 0 12%, color-mix(in srgb, var(--c) 55%, #fff) 30%, var(--c)); box-shadow: 0 2px 2px #0005; }

        /* profile photo */
        .ph-avatar { overflow: hidden; }
        .ph-avatar img { display: block; width: 100%; height: 100%; object-fit: cover; }
        .ph-menu-me { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
        .ph-menu-photo { position: relative; flex: none; width: 84px; height: 84px; padding: 0; border: 0; border-radius: 50%; background: none; }
        .ph-menu-photo .ph-avatar { width: 84px; height: 84px; font-size: 40px; box-shadow: 0 0 0 3px #fcc419, 0 6px 12px #0006; }
        .ph-menu-cam { position: absolute; right: -2px; bottom: -2px; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; color: #4a3000; background: linear-gradient(180deg, #fff1a8, #fcc419 60%, #e0a000); box-shadow: 0 0 0 2px #43230f, 0 2px 4px #0006; }
        .ph-menu-cam svg { width: 17px; height: 17px; }
        .ph-menu-me-info { display: flex; min-width: 0; flex-direction: column; align-items: flex-start; gap: 2px; }
        .ph-menu-me-info strong { max-width: 100%; overflow: hidden; color: #fff3cc; font-family: 'Lilita One', sans-serif; font-size: 22px; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
        .ph-link { border: 0; padding: 4px 0; color: #ffd269; background: none; font-size: 14px; font-weight: 800; text-decoration: underline; }

        /* journey match history */
        .ph-journey { margin-top: 14px; padding: 0; border-radius: 0; background: transparent; box-shadow: none; }
        .ph-journey-form { display: flex; align-items: center; gap: 6px; margin-top: 12px; }
        .ph-journey-form span { margin-right: auto; color: #ffe9b0; font-size: 12px; font-weight: 700; }
        .ph-journey-form em { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; color: #fff; font-family: 'Lilita One', sans-serif; font-size: 13px; font-style: normal; }
        .ph-journey-form .win { background: #3fa34d; }
        .ph-journey-form .loss { background: #e53935; }
        .ph-journey-form .other { background: #806646; }
        .ph-journey-matches { margin-top: 0; }
        .ph-panel .ph-journey { margin-top: 0; }
        .ph-panel .ph-journey-stats span, .ph-panel .ph-journey-form span { color: #715637; }

        /* responsive base */
        .player-home { overflow-x: hidden; overflow-y: auto; }
        .ph-layout, .ph-panel, .ph-grid, .ph-tournament { min-width: 0; max-width: 100%; }
        .ph-header { padding-left: max(20px, env(safe-area-inset-left, 0px)); padding-right: max(20px, env(safe-area-inset-right, 0px)); }
        .ph-grid { grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); }
        .ph-table-wrap { margin-top: 15px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .ph-table-wrap .ph-rows { margin-top: 0; min-width: 420px; }
        .ph-rows td { white-space: nowrap; }

        @media (max-width: 600px) {
          .player-home { height: 100vh; height: 100dvh; min-height: 0; overflow: hidden; }
          .ph-layout, .ph-layout-detail { width: 100%; min-width: 0; }
          .ph-panel { width: 100%; }
          .ph-grid { width: 100%; grid-template-columns: minmax(0, 1fr); }
          .ph-tournament { width: 100%; min-width: 0; overflow-x: clip; overflow-wrap: anywhere; }
          .ph-header { align-items: center; padding: 10px 12px 0; }
          .ph-brand { gap: 8px; padding-right: 12px; }
          .ph-brand-name { font-size: 15px; }
          .ph-avatar { width: 36px; height: 36px; font-size: 19px; }
          .ph-name { width: 96px; font-size: 17px; }
          .ph-wallet { display: block; padding: 4px 9px; }
          .ph-wallet strong { font-size: 15px; }
          .ph-wallet small { font-size: 8px; }
          .ph-menu-btn { display: grid; }
          .ph-layout { display: flex; flex-direction: column; align-items: stretch; gap: 14px; padding: 6px 12px 100px; }
          .ph-layout-detail { flex: 1 1 0; min-height: 0; gap: 0; overflow: hidden; padding-top: 14px; }
          .ph-layout-detail .ph-sheet { flex: 0 1 auto; min-height: 0; max-height: 100%; margin-top: 0; overflow-x: clip; overflow-y: auto; overscroll-behavior: contain; }
          .ph-board { top: -15vw; width: 170vw; opacity: .32; }
          .ph-hero { flex: 1; min-height: 190px; }
          .ph-hero .lh-dice { margin: 0 0 15px; transform: scale(.9); }
          .ph-title { font-size: clamp(68px, 18vw, 96px); }
          .ph-subtitle { margin-top: 6px; font-size: 15px; }
          .ph-pawns { display: none; }
          .ph-status-desktop { display: none; }

          /* bottom thumb-zone sheet; tabs, status and notice live in the profile menu */
          .ph-sheet { margin-top: auto; gap: 10px; padding: 14px; border-radius: 26px; }
          .ph-sheet > .ph-status-mobile, .ph-sheet > .ph-nav { display: none; }
          .ph-bottom-nav {
            position: fixed;
            right: 0;
            bottom: 0;
            left: 0;
            z-index: 15;
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 4px;
            padding: 8px 8px calc(8px + env(safe-area-inset-bottom, 0px));
            border-top: 1px solid #ffd26945;
            background: linear-gradient(180deg, #3a210ff2, #211105fa);
            box-shadow: 0 -8px 24px #0006, inset 0 1px 0 #ffffff12;
            backdrop-filter: blur(14px);
          }
          .ph-bottom-nav button {
            display: flex;
            min-width: 0;
            min-height: 54px;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 2px;
            border: 0;
            border-radius: 12px;
            color: #ffe9b0b3;
            background: transparent;
            font-size: 10px;
            font-weight: 800;
            line-height: 1.1;
          }
          .ph-bottom-nav button.selected {
            color: #ffd269;
            background: linear-gradient(180deg, #ffffff14, #ffffff08);
            box-shadow: inset 0 0 0 1px #ffd26935;
          }
          .ph-bottom-nav svg { width: 21px; height: 21px; }
          .ph-server-warning { margin-top: 0; padding: 8px 10px; font-size: 11px; }
          .ph-mobile-back { display: flex; width: fit-content; margin: 0 0 10px auto; }

          /* home: no cream panel, two light cards in one row */
          .ph-panel-home { padding: 0; border: 0; background: none; box-shadow: none; }
          .ph-panel-home > h2, .ph-panel-home > p { display: none; }
          .ph-panel-home .ph-cards { grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 0; }
          .ph-mode { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; min-height: 0; padding: 14px; border: 0; border-radius: 16px; transition: transform .08s; }
          .ph-mode:hover:not(:disabled) { transform: none; }
          .ph-mode:active:not(:disabled) { transform: scale(.97); }
          .ph-mode-icon { display: grid; place-items: center; width: 40px; height: 40px; margin: 0; border-radius: 12px; font-size: 24px; background: #ffffff59; }
          .ph-mode-text { display: block; min-width: 0; }
          .ph-mode strong { display: block; font-family: 'Lilita One', 'Baloo 2', sans-serif; font-weight: 400; font-size: 20px; line-height: 1.1; }
          .ph-mode small { margin-top: 2px; font-size: 12.5px; font-weight: 700; line-height: 1.2; opacity: .85; }
          .ph-rows th, .ph-rows td { padding: 9px 5px; font-size: 11px; }

          /* Ludo Star style home */
          .ph-profile-card { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; padding: 10px 12px; border-radius: 18px; background: #281406a6; box-shadow: inset 0 3px 6px #0008, inset 0 0 0 1.5px #fcc41966; }
          .ph-profile-card .ph-avatar { width: 46px; height: 46px; font-size: 24px; }
          .ph-pc-info { flex: 1; min-width: 0; }
          .ph-pc-info strong { display: block; overflow: hidden; color: #fff3cc; font-family: 'Lilita One', sans-serif; font-size: 18px; font-weight: 400; line-height: 1.1; text-overflow: ellipsis; white-space: nowrap; }
          .ph-pc-info small { color: #ffd269; font-size: 12px; font-weight: 700; }
          .ph-pc-stats { display: flex; gap: 6px; }
          .ph-pc-stats div { padding: 4px 10px; border-radius: 10px; background: #ffffff14; text-align: center; }
          .ph-pc-stats b { display: block; color: #ffd269; font-family: 'Lilita One', sans-serif; font-size: 16px; font-weight: 400; line-height: 1.1; }
          .ph-pc-stats span { color: #ffe9b0; font-size: 10px; font-weight: 700; opacity: .85; }

          .ph-panel-home .ph-cards { gap: 12px; }
          .ph-mode.ph-mode-big { align-items: center; justify-content: center; min-height: 168px; padding: 18px 8px 14px; text-align: center; border-radius: 22px; }
          .ph-mode-big .ph-mode-icon { width: auto; height: auto; margin: 0 0 6px; border-radius: 0; background: none; }
          .ph-mode-big .ph-mode-icon svg { width: 70px; height: 70px; filter: drop-shadow(0 4px 3px #3b24124d); }
          .ph-mode-tour .ph-mode-icon { color: #c98a00; }
          .ph-mode-big strong { font-size: 22px; }

          .ph-quick { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
          .ph-quick button { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 4px; border: 0; border-radius: 16px; color: #3b2412; background: linear-gradient(180deg, #fff7d6, #f1d68a); box-shadow: inset 0 0 0 1.5px #ffffffb3, 0 3px 0 #8a6a1c, 0 6px 8px #0004; font-family: 'Lilita One', sans-serif; font-size: 14px; }
          .ph-quick button:active:not(:disabled) { transform: translateY(2px); }
          .ph-quick button:disabled { opacity: .55; }
          .ph-quick svg { width: 26px; height: 26px; }

          /* bottom nav: 5 tabs, raised Home */
          .ph-bottom-nav { grid-template-columns: repeat(5, minmax(0, 1fr)); align-items: end; }
          .ph-bottom-nav .ph-nav-orb { display: grid; place-items: center; }
          .ph-bottom-nav .ph-nav-label { display: block; line-height: 1.2; white-space: nowrap; }
          .ph-bottom-nav button.ph-nav-home { min-height: 0; margin-top: -34px; padding: 0 0 2px; justify-content: flex-end; background: none; box-shadow: none; color: #ffd269; }
          .ph-nav-home .ph-nav-orb { width: 58px; height: 58px; border-radius: 50%; color: #4a3000; background: radial-gradient(circle at 35% 28%, #fff1a8, #fcc419 60%, #e0a000); box-shadow: 0 0 0 3px #43230f, 0 0 0 5px #fcc419b3, 0 6px 10px #0008; }
          .ph-nav-home .ph-nav-orb svg { width: 28px; height: 28px; }
          .ph-nav-home.selected .ph-nav-orb { filter: brightness(1.08); }

          /* bottom nav: floating wooden bar */
          .ph-bottom-nav { right: 10px; bottom: calc(8px + env(safe-area-inset-bottom, 0px)); left: 10px; gap: 2px; padding: 8px 6px; border: 0; border-radius: 26px; background: repeating-linear-gradient(90deg, #00000017 0 1px, transparent 1px 6px, #ffffff0d 6px 7px, transparent 7px 13px), linear-gradient(180deg, #b36a2f, #8a4d20 45%, #6b3a17); box-shadow: inset 0 3px 0 #ffffff4d, inset 0 0 0 1.5px #ffdc8259, 0 10px 24px #000a; backdrop-filter: none; }
          .ph-bottom-nav button { min-height: 52px; color: #ffe9b0; font-family: 'Lilita One', 'Baloo 2', sans-serif; font-size: 11px; font-weight: 400; letter-spacing: .02em; }
          .ph-bottom-nav .ph-nav-orb { width: 38px; height: 30px; border-radius: 12px; }
          .ph-bottom-nav button.selected:not(.ph-nav-home) { color: #fff3cc; background: none; box-shadow: none; }
          .ph-bottom-nav button.selected:not(.ph-nav-home) .ph-nav-orb { color: #4a3000; background: linear-gradient(180deg, #fff7d6, #f1d68a); box-shadow: inset 0 0 0 1.5px #ffffffb3, 0 2px 0 #8a6a1c, 0 4px 6px #0005; }
          .ph-bottom-nav button.ph-nav-home { position: relative; min-height: 52px; margin-top: -40px; padding: 0; color: #ffd269; }
          .ph-bottom-nav button.ph-nav-home .ph-nav-label { position: absolute; right: 0; bottom: 2px; left: 0; z-index: 1; color: #fff3cc; line-height: 1.2; text-align: center; text-shadow: 0 1px 3px #3b2412; }
          .ph-bottom-nav button.ph-nav-home .ph-nav-orb { position: absolute; bottom: 20px; left: 50%; width: 66px; height: 66px; transform: translateX(-50%); border-radius: 50%; color: #4a3000; background: radial-gradient(circle at 35% 28%, #fff1a8, #fcc419 60%, #e0a000); box-shadow: inset 0 3px 0 #fff9, 0 0 0 4px #6b3a17, 0 0 0 6px #fcc419, 0 8px 14px #000a; }
          .ph-bottom-nav button.ph-nav-home.selected .ph-nav-orb { box-shadow: inset 0 3px 0 #fff9, 0 0 0 4px #6b3a17, 0 0 0 6px #fcc419, 0 8px 14px #000a, 0 0 20px #fcc419b3; }
          .ph-bottom-nav button.ph-nav-home .ph-nav-orb svg { width: 32px; height: 32px; }

          /* home screen: compact hero + scrollable content so nothing hides behind the nav */
          .ph-layout:not(.ph-layout-detail) { align-items: center; justify-content: center; overflow-y: auto; overscroll-behavior: contain; padding-bottom: 110px; }
          .ph-layout:not(.ph-layout-detail) > .ph-hero,
          .ph-layout:not(.ph-layout-detail) > .ph-sheet { width: min(100%, 460px); }
          .ph-layout:not(.ph-layout-detail) .ph-hero { flex: 0 0 auto; min-height: 0; padding-top: 2px; }
          .ph-layout:not(.ph-layout-detail) .ph-hero .lh-dice { margin: -14px 0 -12px; transform: scale(.62); }
          .ph-layout:not(.ph-layout-detail) .ph-title { font-size: clamp(54px, 15vw, 70px); }
          .ph-layout:not(.ph-layout-detail) .ph-subtitle { margin-top: 2px; font-size: 13px; }
          .ph-layout:not(.ph-layout-detail) .ph-sheet { margin-top: 0; }
          .ph-sheet.ph-sheet-home { padding: 0; border-radius: 0; background: none; box-shadow: none; }
          .ph-mode.ph-mode-big { min-height: 138px; padding: 14px 8px 12px; }
          .ph-mode-big .ph-mode-icon svg, .ph-miniboard { width: 60px; height: 60px; }
        }
        @media (min-width: 601px) {
          .ph-scrim, .ph-menu { display: none; }
        }
        @media (min-width: 601px) and (max-width: 899px) {
          .ph-layout { grid-template-columns: minmax(0, 1fr) minmax(340px, 420px); gap: 24px; padding-right: 24px; padding-left: 24px; }
          .ph-title { font-size: clamp(76px, 12vw, 108px); }
          .ph-cards { grid-template-columns: 1fr; gap: 10px; margin-top: 12px; }
          .ph-mode { min-height: 120px; }
        }
        @media (max-height: 760px) and (min-width: 601px) {
          .ph-layout { padding-top: 8px; padding-bottom: 12px; }
          .ph-title { font-size: clamp(74px, 9vw, 112px); }
          .ph-hero .lh-dice { margin: 2px 0 12px; transform: scale(1.05); }
          .ph-pawns { margin-top: 16px; }
          .ph-panel { padding: 16px; }
          .ph-mode { min-height: 130px; padding: 14px; }
        }
        @media (max-width: 600px) {
          .ph-header { gap: 8px; padding-left: max(12px, env(safe-area-inset-left, 0px)); padding-right: max(12px, env(safe-area-inset-right, 0px)); }
          .ph-brand { flex: 1 1 auto; min-width: 0; }
          .ph-account { flex: none; gap: 6px; }
          .ph-name-wrap { min-width: 0; }
          .ph-name { width: clamp(64px, 23vw, 110px); font-size: 17px; }
          .ph-layout { padding-left: max(12px, env(safe-area-inset-left, 0px)); padding-right: max(12px, env(safe-area-inset-right, 0px)); }
          .ph-panel { padding: 16px; }
          .ph-panel-home { padding: 0; }
          .ph-panel h2 { font-size: 21px; }
          .ph-lock { margin-top: 12px; padding: 12px; font-size: 13px; }
          .ph-bets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 14px 0; }
          .ph-bet, .ph-back, .ph-primary { min-height: 44px; }
          .ph-primary { width: 100%; }
          .ph-mobile-back { min-height: 34px; padding: 5px 11px; font-size: 13px; }
          .ph-tournament { padding: 14px; }
          .ph-tournament-panel { padding: 15px; }
          .ph-tournament-panel > .ph-mobile-back { margin-bottom: 8px; }
          .ph-tournament-panel > p { margin: 5px 0; }
          .ph-tournament-panel .ph-grid { margin-top: 8px; }
          .ph-tournament-panel .ph-tournament { padding: 12px; }
          .ph-tournament-panel .ph-tournament p { margin: 4px 0; }
          .ph-tournament-panel .ph-tournament button { margin-top: 8px; }
          .ph-tournament-panel .ph-tournament .ph-muted { margin-top: 6px; }
          .ph-modal-backdrop { place-items: end center; padding: 0; }
          .ph-modal { width: 100%; border-radius: 24px 24px 0 0; padding: 20px 18px calc(20px + env(safe-area-inset-bottom, 0px)); }
          .ph-modal input { min-height: 46px; font-size: 16px; }
          .ph-modal-actions { flex-direction: column-reverse; }
          .ph-modal-actions .ph-back { min-height: 44px; background: #ffffff1f; color: #ffe9b0; }
          .ph-table-wrap .ph-rows { min-width: 380px; }
        }
        @media (max-width: 600px) and (max-height: 700px) {
          .ph-hero { min-height: 150px; }
          .ph-hero .lh-dice { margin-bottom: 6px; transform: scale(.75); }
          .ph-title { font-size: clamp(58px, 16vw, 78px); }
        }
        @media (max-width: 360px) {
          .ph-edit { display: none; }
          .ph-title { font-size: clamp(58px, 19vw, 76px); }
          .ph-hero .lh-dice { transform: scale(.78); }
          .ph-sheet { padding: 12px; }
          .ph-mode { padding: 12px; }
          .ph-mode strong { font-size: 18px; }
          .ph-mode small { font-size: 11.5px; }
          .ph-table-wrap .ph-rows { min-width: 340px; }
        }
        @media (max-width: 380px) {
          .ph-header { gap: 6px; }
          .ph-brand { gap: 6px; padding-right: 8px; }
          .ph-avatar { width: 32px; height: 32px; font-size: 17px; }
          .ph-name { width: clamp(58px, 27vw, 96px); font-size: 15px; }
          .ph-wallet { display: flex; align-items: center; justify-content: center; min-width: 52px; height: 36px; padding: 0 7px; }
          .ph-wallet small { display: none; }
          .ph-wallet strong { font-size: 14px; white-space: nowrap; }
          .ph-menu-btn { width: 36px; height: 36px; }
          .ph-menu-btn svg { width: 22px; height: 22px; }
        }
        @media (max-width: 600px) {
          .ph-layout:not(.ph-layout-detail) { align-items: center; }
          .ph-layout:not(.ph-layout-detail) > .ph-hero,
          .ph-layout:not(.ph-layout-detail) > .ph-sheet {
            align-self: center;
            width: min(100%, 460px);
            margin-right: auto;
            margin-left: auto;
          }
          .ph-layout:not(.ph-layout-detail) .ph-cards {
            width: 100%;
            margin-right: auto;
            margin-left: auto;
          }
        }
        @media (max-height: 500px) and (orientation: landscape) {
          .ph-header { padding-top: 8px; }
          .ph-layout { align-items: start; gap: 16px; padding: 6px max(16px, env(safe-area-inset-left, 0px)) 14px; }
          .ph-hero .lh-dice, .ph-pawns { display: none; }
          .ph-title { font-size: clamp(56px, 18vh, 84px); }
          .ph-subtitle { margin-top: 4px; font-size: 14px; }
          .ph-sheet { padding: 14px; }
          .ph-panel { padding: 14px; }
        }
        @media (prefers-reduced-motion: reduce) { .ph-menu, .ph-scrim { animation: none; } .ph-coin, .ph-plus { transition: none; } }

        /* colorful Ludo mode cards + bouncing title */
        .ph-mode-duel { background: linear-gradient(150deg, #ffe3df, #f4a79f); box-shadow: 0 4px 0 #a82a24, 0 7px 12px #3b24122e; }
        .ph-mode-tour { background: linear-gradient(150deg, #fff3b8, #f6cd45); box-shadow: 0 4px 0 #9a6f00, 0 7px 12px #3b24122e; }

        /* ===== Ludo Star style: purple theme ===== */
        .player-home { background: radial-gradient(120% 70% at 50% 20%, #8a2a7a 0%, #5a1b63 45%, #2a0b3a 100%); }
        .ph-board { opacity: .35; background: #4a1a5e; box-shadow: 0 0 0 8px #7b2f9e, 0 30px 60px #000a; }
        .ph-brand { background: linear-gradient(180deg, #7a2d86e6, #4b1659e6); box-shadow: inset 0 0 0 1.5px #ffffff40, 0 4px 10px #0006; }
        .ph-sheet, .ph-menu { background: linear-gradient(180deg, #7d2f8f, #5a1f6e 55%, #451552); box-shadow: inset 0 3px 0 #ffffff33, inset 0 0 0 1.5px #ffffff26, 0 14px 35px #0008; }
        .ph-nav { background: #2a0b3aa6; }
        .ph-server-warning { background: #2a0b3a88; color: #ffe0ad; }

        /* coin wallet pill */
        .ph-wallet { position: relative; display: flex; align-items: center; gap: 8px; min-width: 132px; height: 46px; padding: 5px 7px; border: 1px solid #ffe27a; background: linear-gradient(145deg, #8b3c9f, #511b68 55%, #351044); box-shadow: inset 0 1px 0 #ffffff45, inset 0 -3px 0 #17082180, 0 0 0 2px #351044, 0 5px 0 #240a35, 0 9px 14px #0006; transition: filter .15s, transform .15s, box-shadow .15s; }
        .ph-wallet:hover { filter: brightness(1.12); box-shadow: inset 0 1px 0 #ffffff55, inset 0 -3px 0 #17082180, 0 0 0 2px #351044, 0 5px 0 #240a35, 0 0 14px #fcc41980; }
        .ph-wallet:focus-visible { outline: 3px solid #fff1a8; outline-offset: 3px; }
        .ph-wallet small { display: none; }
        .ph-wallet strong { flex: 1; color: #fff5cf; font-family: 'Lilita One', sans-serif; font-size: 18px; font-weight: 400; text-align: center; text-shadow: 0 2px 2px #170821; white-space: nowrap; }
        .ph-coin { position: relative; display: grid; flex: none; place-items: center; width: 34px; height: 34px; border: 2px solid #a95b00; border-radius: 50%; color: #a34a00; background: radial-gradient(circle at 32% 23%, #fffbdc 0 5%, #ffe783 18%, #ffc629 48%, #e99408 78%, #b96600 100%); box-shadow: inset 0 0 0 2px #fff4ad, inset 0 -3px 0 #b86f00a6, 0 0 0 1px #ffe27a, 0 3px 5px #16091c99; transition: transform .45s cubic-bezier(.2,.8,.2,1); }
        .ph-coin::before { content: ''; position: absolute; inset: 4px; border: 1px solid #bd790b; border-radius: 50%; box-shadow: inset 0 1px 0 #fff8; }
        .ph-coin svg { position: relative; z-index: 1; width: 20px; height: 20px; filter: drop-shadow(0 1px 0 #fff8); }
        .ph-wallet:hover .ph-coin { transform: rotateY(180deg) rotate(-12deg); }
        .ph-plus { flex: none; display: grid; place-items: center; width: 27px; height: 27px; border: 1.5px solid #b4ffc0; border-radius: 50%; color: #fff; background: linear-gradient(180deg, #73e58c, #27a64c 60%, #168039); box-shadow: inset 0 1px 0 #ffffff70, 0 2px 0 #125b2b, 0 2px 4px #0007; font-family: 'Lilita One', sans-serif; font-size: 19px; line-height: 1; text-shadow: 0 1px 1px #145b2b; transition: transform .15s; }
        .ph-wallet:hover .ph-plus { transform: scale(1.08); }

        /* big glossy mode cards */
        .ph-mode { border: 0; color: #fff; }
        .ph-mode strong { color: #fff; text-transform: uppercase; letter-spacing: .02em; text-shadow: 0 2px 0 #0004; }
        .ph-mode small { color: #fff; opacity: .9; }
        .ph-mode-duel { background: linear-gradient(180deg, #ffc247, #f08a00); box-shadow: inset 0 0 0 3px #ffe08a, 0 5px 0 #a85a00, 0 10px 16px #0006; }
        .ph-mode-tour { background: linear-gradient(180deg, #9a6df0, #5b34b8); box-shadow: inset 0 0 0 3px #c3a6ff, 0 5px 0 #321a75, 0 10px 16px #0006; }
        .ph-mode-tour .ph-mode-icon { color: #ffd269; }

        @media (max-width: 600px) {
          .ph-wallet { min-width: 112px; }
          .ph-wallet strong { font-size: 16px; }

          /* bottom bar: dark purple, raised Home tab */
          .ph-bottom-nav {
            right: 0; left: 0; bottom: 0; gap: 0; align-items: end;
            padding: 6px 4px calc(6px + env(safe-area-inset-bottom, 0px));
            border: 0; border-top: 2px solid #ffffff26; border-radius: 0;
            background: linear-gradient(180deg, #5a1b63, #2a0b3a);
            box-shadow: 0 -6px 20px #0008;
          }
          .ph-bottom-nav button,
          .ph-bottom-nav button.selected:not(.ph-nav-home) {
            position: static; min-height: 56px; margin-top: 0; padding: 0; gap: 2px;
            justify-content: center; color: #e9c9ff; background: none; box-shadow: none;
            font-size: 11px; letter-spacing: .02em;
          }
          .ph-bottom-nav button .ph-nav-orb,
          .ph-bottom-nav button.ph-nav-home .ph-nav-orb,
          .ph-bottom-nav button.selected:not(.ph-nav-home) .ph-nav-orb,
          .ph-bottom-nav button.ph-nav-home.selected .ph-nav-orb {
            position: static; transform: none; width: auto; height: auto; border-radius: 0;
            color: inherit; background: none; box-shadow: none; filter: none;
          }
          .ph-bottom-nav svg { width: 28px; height: 28px; stroke-width: 2; }
          .ph-bottom-nav button.selected:not(.ph-nav-home) { color: #ffd269; }
          .ph-bottom-nav button.selected:not(.ph-nav-home) svg { filter: drop-shadow(0 0 6px #fcc419aa); }

          .ph-bottom-nav button.ph-nav-home,
          .ph-bottom-nav button.ph-nav-home.selected {
            position: relative; min-height: 80px; margin-top: -24px; padding-top: 4px;
            border: 2px solid #ffffff30; border-bottom: 0; border-radius: 22px 22px 0 0;
            color: #ffd269;
            background: linear-gradient(180deg, #a04bc0, #6a2287);
            box-shadow: inset 0 3px 0 #ffffff40, 0 -4px 12px #0006;
          }
          .ph-bottom-nav button.ph-nav-home .ph-nav-orb svg { width: 40px; height: 40px; filter: drop-shadow(0 2px 0 #0005); }
          .ph-bottom-nav button.ph-nav-home .ph-nav-label { position: static; color: #fff; font-size: 12px; text-shadow: none; }
        }

        /* compact headers, icon buttons, stat tiles and list rows */
        .ph-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .ph-head h2 { flex: 1; min-width: 0; margin: 0; font-size: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ph-head-spacer { flex: none; width: 38px; }
        .ph-icon-btn { flex: none; display: grid; place-items: center; width: 38px; height: 38px; padding: 0; border: 1px solid #d5a928; border-radius: 50%; color: #55340b; background: linear-gradient(180deg, #fff8df, #f3dfa9); box-shadow: inset 0 1px 0 #fff, 0 3px 0 #c39729, 0 5px 9px #3b241225; }
        .ph-icon-btn:active { transform: translateY(2px); box-shadow: inset 0 1px 0 #fff, 0 1px 0 #c39729; }
        .ph-icon-btn:focus-visible { outline: 3px solid #d89a19; outline-offset: 2px; }
        .ph-icon-btn svg { width: 20px; height: 20px; }
        .ph-icon-sm { display: inline-grid; width: 28px; height: 28px; margin-left: 6px; vertical-align: middle; }
        .ph-icon-sm svg { width: 16px; height: 16px; }

        .ph-stats3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
        .ph-stat { padding: 8px 4px; border-radius: 12px; background: #fff9e9; box-shadow: inset 0 0 0 1px #ead9aa; text-align: center; }
        .ph-stat span { display: block; color: #8b7552; font-size: 10px; font-weight: 700; }
        .ph-stat strong { display: block; color: #4a3518; font-family: 'Lilita One', sans-serif; font-size: 16px; font-weight: 400; overflow-wrap: anywhere; }
        .ph-stat.avail strong { color: #277447; }
        .ph-actions2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .ph-actions2 .ph-primary { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 42px; padding: 8px 10px; }
        .ph-actions2 svg { width: 18px; height: 18px; }
        .ph-panel .ph-hint { margin: 8px 0 0; color: #927a55; font-size: 11px; }
        .ph-section-title { margin: 14px 0 0; color: #715637; font-size: 13px; letter-spacing: .05em; text-transform: uppercase; }
        .ph-history-head, .ph-journey-panel-head { gap: 6px; margin-bottom: 10px; }
        .ph-history-head h2, .ph-journey-panel-head h2 { font-size: 18px; }
        .ph-history-head > .ph-icon-btn, .ph-journey-panel-head > .ph-icon-btn { width: 32px; height: 32px; box-shadow: inset 0 1px 0 #fff, 0 2px 0 #c39729; }
        .ph-history-head > .ph-icon-btn svg, .ph-journey-panel-head > .ph-icon-btn svg { width: 17px; height: 17px; }
        .ph-history-filter { position: relative; flex: none; }
        .ph-history-filter-trigger { display: flex; align-items: center; justify-content: space-between; gap: 5px; width: 88px; min-height: 34px; border: 1px solid #d7bc73; border-radius: 10px; padding: 4px 7px; color: #55340b; background: linear-gradient(145deg, #fffdf5, #f4e4b9); box-shadow: inset 0 1px 0 #fff, 0 2px 5px #5b3a1e1c; text-align: left; }
        .ph-history-filter-copy { overflow: hidden; color: #55340b; font: 700 11px/1.1 'Baloo 2', system-ui, sans-serif; text-overflow: ellipsis; white-space: nowrap; }
        .ph-history-filter-chevron { display: grid; flex: none; width: 18px; height: 18px; place-items: center; border-radius: 50%; color: #76500b; background: #e8d4a0; transition: transform .18s ease; }
        .ph-history-filter-chevron svg { width: 12px; height: 12px; }
        .ph-history-filter-trigger[aria-expanded="true"] .ph-history-filter-chevron { transform: rotate(180deg); }
        .ph-history-filter-trigger:focus-visible { outline: 2px solid #a56b06; outline-offset: 2px; }
        .ph-history-filter-menu { position: absolute; top: calc(100% + 5px); right: 0; z-index: 20; display: grid; width: 156px; gap: 3px; padding: 5px; border: 1px solid #d7bc73; border-radius: 12px; background: linear-gradient(160deg, #fffdf5, #f4e4b9); box-shadow: 0 8px 18px #29170745, inset 0 1px 0 #fff; animation: ph-filter-open .14s ease-out both; }
        .ph-history-filter-option { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 34px; border: 1px solid transparent; border-radius: 8px; padding: 5px 8px; color: #684d2e; background: transparent; font: 700 12px/1.2 'Baloo 2', system-ui, sans-serif; text-align: left; }
        .ph-history-filter-option:hover { border-color: #ead9aa; background: #fff9e9; }
        .ph-history-filter-option.selected { border-color: #e4c96f; color: #55340b; background: linear-gradient(180deg, #fff3c7, #f6e2a2); box-shadow: inset 0 1px 0 #fff; }
        .ph-history-filter-option svg { width: 16px; height: 16px; color: #8a6400; }
        .ph-history-filter-option:focus-visible { outline: 2px solid #a56b06; outline-offset: 1px; }
        @keyframes ph-filter-open { from { opacity: 0; transform: translateY(-4px) scale(.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .ph-history-results { display: flex; height: 230px; flex-direction: column; }
        .ph-history-list { height: 230px; gap: 5px; overflow: hidden; }
        .ph-history-item { flex: 0 0 42px; min-height: 42px; padding: 6px 8px; }
        .ph-history-item .ph-item-ico { width: 28px; height: 28px; }
        .ph-history-empty { display: grid; flex: 1; min-height: 230px; place-items: center; margin: 0; text-align: center; }
        .ph-history-pagination { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 34px; margin-top: 5px; }
        .ph-history-pagination button { display: inline-grid; width: 30px; height: 30px; place-items: center; border: 1px solid #ddc995; border-radius: 50%; padding: 0; color: #684d2e; background: linear-gradient(180deg, #fffdf5, #f3e4bd); box-shadow: 0 1px 3px #5b3a1e20, inset 0 1px 0 #fff; }
        .ph-history-pagination button:disabled { opacity: .4; cursor: not-allowed; box-shadow: inset 0 1px 0 #fff; }
        .ph-history-pagination button:not(:disabled):hover { border-color: #c9a95e; color: #55340b; background: #fff7df; }
        .ph-history-pagination button:not(:disabled):active { transform: scale(.94); }
        .ph-history-pagination button:focus-visible { outline: 2px solid #a56b06; outline-offset: 2px; }
        .ph-history-pagination button svg { width: 15px; height: 15px; }
        .ph-history-pagination span { min-width: 58px; color: #806646; font-size: 11px; font-weight: 700; text-align: center; }
        .ph-list { display: flex; flex-direction: column; gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; }
        .ph-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; background: #fff9e9; box-shadow: inset 0 0 0 1px #ead9aa; }
        .ph-item-ico { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; color: #fff; background: #806646; font-family: 'Lilita One', sans-serif; font-size: 14px; }
        .ph-item-ico.win { background: #3fa34d; }
        .ph-item-ico.loss { background: #e53935; }
        .ph-item-ico svg { width: 16px; height: 16px; }
        .ph-item-main { flex: 1; min-width: 0; }
        .ph-item-main b { display: block; overflow: hidden; color: #3b2412; font-size: 13px; text-overflow: ellipsis; text-transform: capitalize; white-space: nowrap; }
        .ph-item-main small { display: block; overflow: hidden; color: #8b7552; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
        .ph-item-amt { flex: none; color: #4a3518; font-family: 'Lilita One', sans-serif; font-size: 16px; text-align: right; }
        .ph-item-amt.pos { color: #277447; }
        .ph-item-amt.neg { color: #b3261e; }
        .ph-item-amt small { display: block; color: #8b7552; font-family: 'Baloo 2', sans-serif; font-size: 10px; font-weight: 700; text-transform: capitalize; }
        @media (max-width: 600px) {
          .ph-panel { padding: 14px; }
          .ph-actions2 .ph-primary { width: 100%; }
        }

        /* 3D mode icons */
        .ph-mode-icon svg { filter: drop-shadow(0 5px 3px #3b241255); }

        /* icons pop out of the top of the cards */
        .ph-cards, .ph-panel-home .ph-cards { margin-top: 56px; row-gap: 64px; }
        .ph-mode.ph-mode-big { position: relative; overflow: visible; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; min-height: 124px; padding: 66px 8px 14px; text-align: center; }
        .ph-mode.ph-mode-big .ph-mode-icon { position: absolute; top: -54px; left: 50%; display: block; width: 132px; height: 111px; margin: 0; border-radius: 0; background: none; transform: translateX(-50%); pointer-events: none; }
        .ph-mode.ph-mode-big .ph-mode-icon svg { display: block; width: 100%; height: 100%; filter: drop-shadow(0 8px 4px #0006); }
        @media (max-width: 360px) {
          .ph-mode.ph-mode-big .ph-mode-icon { width: 112px; height: 94px; top: -46px; }
          .ph-mode.ph-mode-big { padding-top: 58px; }
        }

        /* attractive top bar: level badge, name, progress bar, coin pill */
        .ph-header { gap: 10px; padding-top: 14px; }
        .ph-brand { flex: 1 1 auto; min-width: 0; max-width: 310px; gap: 10px; min-height: 60px; padding: 5px 14px 5px 7px; border-radius: 20px; background: linear-gradient(180deg, #6a2a86, #3d1456); box-shadow: inset 0 0 0 1.5px #ffffff40, 0 5px 0 #240a35, 0 9px 14px #0006; }
        .ph-ava-wrap { position: relative; flex: none; }
        .ph-ava-wrap .ph-avatar { width: 48px; height: 48px; font-size: 24px; box-shadow: 0 0 0 2.5px #fcc419, 0 3px 6px #0006; }
        .ph-level { position: absolute; top: -7px; left: -7px; display: grid; place-items: center; min-width: 22px; height: 22px; padding: 0 4px; border-radius: 50%; color: #4a3000; background: radial-gradient(circle at 35% 30%, #fff1a8, #fcc419 60%, #e0a000); box-shadow: 0 0 0 2px #3d1456, 0 2px 3px #0006; font-family: 'Lilita One', sans-serif; font-size: 13px; line-height: 1; }
        .ph-name-wrap { flex: 1; min-width: 0; gap: 4px; cursor: default; }
        .ph-name { width: auto; min-width: 0; color: #fff; font-size: 15px; letter-spacing: .05em; text-transform: uppercase; }
        .ph-xp { display: flex; align-items: center; }
        .ph-xp-star { flex: none; width: 21px; height: 21px; margin-right: -9px; position: relative; z-index: 1; filter: drop-shadow(0 1px 1px #0008); }
        .ph-xp-track { position: relative; display: flex; flex: 1; align-items: center; justify-content: center; height: 16px; overflow: hidden; border-radius: 99px; background: #1d0a2b; box-shadow: inset 0 2px 3px #000a, 0 0 0 1px #ffffff26; }
        .ph-xp-track i { position: absolute; top: 0; bottom: 0; left: 0; border-radius: inherit; background: linear-gradient(180deg, #ffe27a, #fcc419 55%, #e0a000); }
        .ph-xp-track b { position: relative; z-index: 1; padding-left: 8px; color: #fff; font-family: 'Lilita One', sans-serif; font-size: 11px; font-weight: 400; text-shadow: 0 1px 1px #000c; }
        .ph-wallet { min-width: 132px; }
        @media (max-width: 380px) {
          .ph-brand { padding-right: 10px; }
          .ph-ava-wrap .ph-avatar { width: 42px; height: 42px; font-size: 21px; }
          .ph-name { font-size: 13px; }
          .ph-wallet { min-width: 100px; height: 42px; padding: 4px 6px; }
          .ph-wallet strong { font-size: 15px; }
        }
      `}</style>

      <div className="ph-scene" aria-hidden="true">
        <LudoBoard />
      </div>
      <header className="ph-header">
        <div className="ph-brand">
          <div className="ph-ava-wrap">
            <Avatar src={avatar} letter={(profile?.name || name || 'P').trim().charAt(0).toUpperCase() || 'P'} />
            <span className="ph-level" aria-label={`Level ${level}`}>{level}</span>
          </div>
          <div className="ph-name-wrap">
            <span className="ph-name" aria-label="Player name">{profile?.name || name}</span>
            <div className="ph-xp" role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={10} aria-valuenow={played % 10}>
              <svg className="ph-xp-star" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3 6.5 7 .9-5.2 4.8 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.4l7-.9Z" fill="#fcc419" stroke="#b97a00" strokeWidth="1.5" strokeLinejoin="round" /></svg>
              <span className="ph-xp-track"><i style={{ width: `${levelPct}%` }} /><b>{played} / {level * 10}</b></span>
            </div>
          </div>
        </div>
        <div className="ph-account">
          <button type="button" className="ph-wallet" aria-label={`Available balance ${availableBalance.toLocaleString()}. Open wallet`} onClick={() => setPage('wallet')}>
            <span className="ph-coin" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="8" cy="8" r="6.1" fill="#e69a0a" stroke="#fff1a8" strokeWidth="1" />
                <circle cx="16" cy="16" r="6.1" fill="#ffc52e" stroke="#9e5700" strokeWidth="1.2" />
                <circle cx="16" cy="16" r="4.6" stroke="#fff1a8" strokeWidth=".8" />
                <path d="m16 12.6 1.05 2.15 2.38.35-1.72 1.68.4 2.37L16 18.03l-2.11 1.12.4-2.37-1.72-1.68 2.38-.35L16 12.6Z" fill="#fff3b0" stroke="#b56a00" strokeWidth=".55" strokeLinejoin="round" />
                <path d="M5.2 4.7 6.5 4" stroke="#fffbdc" strokeWidth="1.1" strokeLinecap="round" />
              </svg>
            </span>
            <small>AVAILABLE</small><strong>{availableBalance.toLocaleString()}</strong>
            <span className="ph-plus" aria-hidden="true">+</span>
          </button>
        </div>
      </header>

      <div className={`ph-layout${page === 'home' ? '' : ' ph-layout-detail'}`}>
        <section className="ph-hero">
          <h1 className="ph-title" aria-label="Ludo">
            <span style={{ '--c': '#e53935', '--d': '#8e1b1b' }}>L</span>
            <span style={{ '--c': '#3fa34d', '--d': '#17531f' }}>u</span>
            <span style={{ '--c': '#fcc419', '--d': '#9a6f00' }}>d</span>
            <span style={{ '--c': '#1e88e5', '--d': '#0b3f8c' }}>o</span>
          </h1>
          <p className="ph-subtitle">Roll the dice. Race home.</p>
          <div className="ph-pawns" aria-hidden="true">
            {PAWN_COLORS.map((color) => <span className="ph-pawn" key={color} style={{ '--pawn': color, '--pawn-dark': '#38210f' }} />)}
          </div>
          <div className={`ph-status ph-status-desktop${active ? '' : ' blocked'}`} role="status">
            <i />             Account: {profile?.status || 'Loading'}
          </div>
        </section>

        <div className={`ph-sheet${page === 'home' ? ' ph-sheet-home' : ''}`}>
          <div className={`ph-status ph-status-mobile${active ? '' : ' blocked'}`} role="status">
            <i /> Account: {profile?.status || 'Loading'}
          </div>
          {loading && <div className="ph-server-warning" role="status">Loading your account, wallet and history…</div>}
          {loadError && (connected || loadError !== PLAYER_SERVER_UNAVAILABLE) && <div className="ph-server-warning" role="alert">{loadError} <button type="button" className="ph-icon-btn ph-icon-sm" onClick={refreshPlayerData} aria-label="Retry" title="Retry"><Icon>{ICON_REFRESH}</Icon></button></div>}
          <nav className="ph-nav" aria-label="Player menu">
            {[
              ['home', 'Home'],
              ...(SHOW_TOURNAMENT_UI ? [['tournaments', 'Tournaments']] : []),
              ['wallet', 'Wallet'],
              ['history', 'History'],
              ['journey', 'Journey'],
            ].map(([id, label]) => (
              <button type="button" key={id} className={page === id ? 'selected' : ''} onClick={() => setPage(id)}>
                {label}
              </button>
            ))}
          </nav>

          {page === 'home' && (
            <section className="ph-panel ph-panel-home">
              <h2>Choose your game</h2>
              <p>{SHOW_TOURNAMENT_UI ? 'Play one-on-one or enter a tournament.' : 'Play one-on-one.'}</p>

              <HomeGameCards
                loading={loading}
                active={active}
                showTournament={SHOW_TOURNAMENT_UI}
                onChooseMatch={() => setPage('match')}
                onChooseTournament={() => setPage('tournaments')}
              />

              {!loading && !active && <div className="ph-lock">Your account is inactive. You can view your wallet and history, but cannot start a game.</div>}
            </section>
          )}

          {page === 'match' && (
            <section className="ph-panel">
              <PanelHead title="Choose your bet" onBack={() => setPage('home')} />
              <p>Minimum bet is 300. The platform receives {feePercent}% of each player’s bet.</p>
              <div className="ph-bet-selector" role="group" aria-label="Bet amount">
                <button
                  type="button"
                  className="ph-bet-step"
                  aria-label="Decrease bet"
                  disabled={bet === TOURNAMENT_BETS[0]}
                  onClick={() => {
                    const index = TOURNAMENT_BETS.indexOf(bet);
                    if (index > 0) setBet(TOURNAMENT_BETS[index - 1]);
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
                  disabled={bet === TOURNAMENT_BETS[TOURNAMENT_BETS.length - 1]}
                  onClick={() => {
                    const index = TOURNAMENT_BETS.indexOf(bet);
                    if (index >= 0 && index < TOURNAMENT_BETS.length - 1) {
                      setBet(TOURNAMENT_BETS[index + 1]);
                    }
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /></svg>
                </button>
              </div>
              <div className="ph-bet-hint">Choose a bet from 300 to 5,000 credits</div>
              <div className="ph-prize-summary" aria-live="polite">
                <div><span>Total pot</span><strong>{(bet * 2).toLocaleString()}</strong></div>
                <div><span>Platform fee ({feePercent}%)</span><strong>{feePerPlayer.toLocaleString()}</strong></div>
                <div className="ph-prize-winner"><span>Winner gets</span><strong>{matchPayout.toLocaleString()}</strong></div>
              </div>
              {!active && <div className="ph-lock">Your account is blocked. You cannot start a game.</div>}
              <button type="button" className="ph-primary" disabled={loading || !active || !connected || bet < 300 || bet > availableBalance} onClick={() => onFindMatch(bet, 'normal')}>
                Find opponent
              </button>
            </section>
          )}

          {SHOW_TOURNAMENT_UI && page === 'tournaments' && (
            <section className="ph-panel ph-tournament-panel">
              <PanelHead title="Quick 1 vs 1" onBack={() => setPage('home')} />
              <p>Choose your entry amount to join a single 1 vs 1 match.</p>
              <div className="ph-grid">
                <div className="ph-tournament-bet-content" key={TOURNAMENT.id}>
                  <span className="ph-tournament-label">Select your bet</span>
                  <div className="ph-bet-selector" role="group" aria-label="Tournament bet amount">
                    <button
                      type="button"
                      className="ph-bet-step"
                      aria-label="Decrease bet"
                      disabled={tournamentBetAmount === TOURNAMENT_BETS[0]}
                      onClick={() => {
                        const index = TOURNAMENT_BETS.indexOf(tournamentBetAmount);
                        if (index > 0) setTournamentBet(TOURNAMENT_BETS[index - 1]);
                      }}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /></svg>
                    </button>
                    <output
                      className={`ph-bet-value${!validTournamentBet ? ' unaffordable' : ''}`}
                      aria-live="polite"
                      aria-disabled={!validTournamentBet}
                    >
                      {tournamentBetAmount.toLocaleString()} credits
                    </output>
                    <button
                      type="button"
                      className="ph-bet-step"
                      aria-label="Increase bet"
                      disabled={tournamentBetAmount === TOURNAMENT_BETS[TOURNAMENT_BETS.length - 1]}
                      onClick={() => {
                        const index = TOURNAMENT_BETS.indexOf(tournamentBetAmount);
                        if (index >= 0 && index < TOURNAMENT_BETS.length - 1) {
                          setTournamentBet(TOURNAMENT_BETS[index + 1]);
                        }
                      }}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /></svg>
                    </button>
                  </div>
                  <div className="ph-bet-hint">
                    Choose a bet from 300 to 5,000 credits
                  </div>
                  <div className="ph-prize-summary" aria-live="polite">
                    <div><span>Total pot</span><strong>{tournamentPot.toLocaleString()}</strong></div>
                    <div><span>Platform fee ({feePercent}% each)</span><strong>{tournamentFee.toLocaleString()}</strong></div>
                    <div className="ph-prize-winner"><span>Winner gets</span><strong>{tournamentPayout.toLocaleString()}</strong></div>
                  </div>
                  <button
                    type="button"
                    className="ph-primary ph-tournament-join"
                    disabled={loading || !tournament.enabled || !active || !connected || !validTournamentBet}
                    onClick={joinTournament}
                  >
                    {tournament.enabled ? 'Join tournament' : 'Tournament unavailable'}
                  </button>
                </div>
              </div>
              {!active && <div className="ph-lock">Your account is inactive. You cannot join a tournament.</div>}
              {!connected && <div className="ph-lock">Connect to the game server to join.</div>}
            </section>
          )}

          {page === 'wallet' && (
            <section className="ph-panel ph-panel-wallet">
              <PanelHead title="Wallet" onBack={() => setPage('home')} action={{ label: 'Refresh', icon: ICON_REFRESH, onClick: refreshPlayerData }} />
              <div className="ph-stats3">
                <div className="ph-stat"><span>Balance</span><strong>{balance.toLocaleString()}</strong></div>
                <div className="ph-stat"><span>On hold</span><strong>{wallet.heldAmount.toLocaleString()}</strong></div>
                <div className="ph-stat avail"><span>Available</span><strong>{availableBalance.toLocaleString()}</strong></div>
              </div>
              <div className="ph-actions2">
                <button type="button" className="ph-primary" disabled={loading || !active} onClick={() => openWalletRequest('deposit')}><Icon>{ICON_DOWN}</Icon>Deposit</button>
                <button type="button" className="ph-primary" disabled={loading || !active || availableBalance <= 0} onClick={() => openWalletRequest('withdrawal')}><Icon>{ICON_UP}</Icon>Withdraw</button>
              </div>
              <p className="ph-hint">Deposits are approved by your Master. Pending withdrawals are held from your available balance.</p>
              {!active && <div className="ph-lock">Inactive accounts cannot request a withdrawal.</div>}
            </section>
          )}

          {page === 'history' && (
            <section className="ph-panel">
              <div className="ph-head ph-history-head">
                <button type="button" className="ph-icon-btn" onClick={() => setPage('home')} aria-label="Back">
                  <Icon><path d="m15 18-6-6 6-6" /></Icon>
                </button>
                <h2>History</h2>
                <div className="ph-history-filter" ref={historyFilterRef}>
                  <button
                    type="button"
                    className="ph-history-filter-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={historyFilterOpen}
                    aria-label={`History filter: ${historyTab === 'all' ? 'All activity' : historyTab}`}
                    onClick={() => setHistoryFilterOpen((open) => !open)}
                  >
                    <span className="ph-history-filter-copy">{{
                      all: 'All',
                      deposit: 'Deposits',
                      withdrawal: 'Withdrawals',
                      requests: 'Requests',
                      transactions: 'Transactions',
                    }[historyTab]}</span>
                    <span className="ph-history-filter-chevron" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                    </span>
                  </button>
                  {historyFilterOpen && (
                    <div className="ph-history-filter-menu" role="listbox" aria-label="Filter history">
                      {[
                        ['all', 'All activity'],
                        ['deposit', 'Deposits'],
                        ['withdrawal', 'Withdrawals'],
                        ['requests', 'Requests'],
                        ['transactions', 'Transactions'],
                      ].map(([value, label]) => (
                        <button
                          type="button"
                          role="option"
                          aria-selected={historyTab === value}
                          className={`ph-history-filter-option${historyTab === value ? ' selected' : ''}`}
                          key={value}
                          onClick={() => {
                            setHistoryTab(value);
                            setHistoryPage(1);
                            setHistoryFilterOpen(false);
                          }}
                        >
                          {label}
                          {historyTab === value && (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" className="ph-icon-btn" onClick={refreshPlayerData} aria-label="Refresh" title="Refresh">
                  <Icon>{ICON_REFRESH}</Icon>
                </button>
              </div>

              <div className="ph-history-results" aria-live="polite">
                {visibleWalletHistory.length ? (
                  <ul className="ph-list ph-history-list">
                    {visibleWalletHistory.map((entry) => (
                      <li className="ph-item ph-history-item" key={entry.id}>
                        <span className={`ph-item-ico ${entry.type === 'deposit' ? 'win' : entry.type === 'withdrawal' ? 'loss' : ''}`}><Icon>{entry.type === 'deposit' ? ICON_DOWN : ICON_UP}</Icon></span>
                        <div className="ph-item-main">
                          <b>{entry.label}</b>
                          <small>{entry.date}{entry.detail ? ` · ${entry.detail}` : ''}</small>
                        </div>
                        <div className={`ph-item-amt ${entry.amount > 0 ? 'pos' : entry.amount < 0 ? 'neg' : ''}`}>
                          {entry.amount > 0 ? '+' : ''}{entry.amount.toLocaleString()}
                          <small>{entry.status || (entry.balanceAfter == null ? '' : `Bal ${entry.balanceAfter.toLocaleString()}`)}</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ph-muted ph-history-empty">
                    {historyTab === 'deposit' ? 'No deposits yet.' : historyTab === 'withdrawal' ? 'No withdrawals yet.' : historyTab === 'requests' ? 'No requests yet.' : historyTab === 'transactions' ? 'No transactions yet.' : 'No deposits or withdrawals yet.'}
                  </p>
                )}
              </div>
              <div className="ph-history-pagination" aria-label="History pagination">
                <button type="button" aria-label="Previous page" disabled={currentHistoryPage === 1} onClick={() => setHistoryPage(currentHistoryPage - 1)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <span>Page {currentHistoryPage} of {historyPageCount}</span>
                <button type="button" aria-label="Next page" disabled={currentHistoryPage === historyPageCount} onClick={() => setHistoryPage(currentHistoryPage + 1)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                </button>
              </div>
            </section>
          )}

          {page === 'journey' && (
            <section className="ph-panel">
              <PanelHead className="ph-journey-panel-head" title="My Journey" onBack={() => setPage('home')} action={{ label: 'Transactions', icon: ICON_CLOCK, onClick: () => { setHistoryTab('all'); setPage('history'); } }} />
            <div className="ph-journey">
                <div className="ph-journey-matches">
                <div className="ph-history-results" aria-live="polite">
                  {visibleJourneyMatches.length ? (
                    <ul className="ph-list ph-history-list">
                      {visibleJourneyMatches.map((match, index) => {
                        const result = outcome(match);
                        const amount = Number(match.amount) || 0;
                        return (
                          <li className="ph-item ph-history-item" key={match.id || `${match.date}-${index}`}>
                            <span className={`ph-item-ico ${result}`} aria-label={result}>
                              {result === 'win' ? 'W' : result === 'loss' ? 'L' : '–'}
                            </span>
                            <div className="ph-item-main">
                              <b>{match.opponent || 'Match'}</b>
                              <small>{match.date} · {match.status}</small>
                            </div>
                            <div className={`ph-item-amt ${amount > 0 ? 'pos' : amount < 0 ? 'neg' : ''}`}>
                              {amount ? `${amount > 0 ? '+' : ''}${amount.toLocaleString()}` : '—'}
                              <small>{match.status}</small>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="ph-muted ph-history-empty">No matches yet. Play your first game to start your journey.</p>
                  )}
                </div>
                <div className="ph-history-pagination" aria-label="Match history pagination">
                    <button type="button" aria-label="Previous page" disabled={currentJourneyPage === 1} onClick={() => setJourneyPage(currentJourneyPage - 1)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
                    </button>
                      <span>Page {currentJourneyPage} of {journeyPageCount}</span>
                      <button type="button" aria-label="Next page" disabled={currentJourneyPage === journeyPageCount} onClick={() => setJourneyPage(currentJourneyPage + 1)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                      </button>
                  </div>
                  </div>
                </div>
                </section>
              )}

          {message && <p className="ph-message" role="status">{message}</p>}
        </div>
      </div>

      <nav className="ph-bottom-nav" aria-label="Player navigation">
        {[
          ['wallet', 'Wallet', <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M3 10h18M16 15h2M7 6V4a2 2 0 0 1 2-2h9" /></>],
          ['journey', 'Journey', <><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></>],
          ['home', 'Home', <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>],
          ['history', 'History', <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2M4 4l2 2" /></>],
          ['menu', 'Profile', <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4.5 4.2-6.5 8-6.5s7 2 8 6.5" /></>],
        ].map(([id, label, icon]) => (
          <button
            type="button"
            key={id}
            className={`${page === id ? 'selected' : ''}${id === 'home' ? ' ph-nav-home' : ''}`}
            aria-current={page === id ? 'page' : undefined}
            onClick={() => (id === 'menu' ? setMenuOpen(true) : setPage(id))}
          >
            <span className="ph-nav-orb">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {icon}
              </svg>
            </span>
            <span className="ph-nav-label">{label}</span>
          </button>
        ))}
      </nav>

      {menuOpen && (
        <>
          <div className="ph-scrim" onClick={() => setMenuOpen(false)} />
          <div className="ph-menu" role="dialog" aria-modal="true" aria-label="Profile menu">
            <div className="ph-grab" />
            <div className="ph-menu-me">
              <button type="button" className="ph-menu-photo" onClick={() => fileInputRef.current?.click()} aria-label="Change profile photo">
                <Avatar src={avatar} letter={(profile?.name || name || 'P').trim().charAt(0).toUpperCase() || 'P'} />
                <span className="ph-menu-cam" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
                </span>
              </button>
              <div className="ph-menu-me-info">
                <strong>{profile?.name || name}</strong>
                <button type="button" className="ph-link" onClick={() => fileInputRef.current?.click()}>{avatar ? 'Change photo' : 'Add photo'}</button>
                {avatar && <button type="button" className="ph-link" onClick={removeAvatar}>Remove photo</button>}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onPickAvatar} />
            </div>
            {avatarError && <p className="ph-message" role="alert">{avatarError}</p>}
            <div className="ph-menu-list">
              <button type="button" className="ph-menu-item" onClick={onSignOut}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6" /></svg>
                Log out
              </button>
            </div>
          </div>
        </>
      )}

      {walletRequestOpen && (
        <div className="ph-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setWalletRequestOpen(false)}>
          <form className="ph-modal" onSubmit={submitWalletRequest}>
            <h2>Request {walletRequestType}</h2>
            <p>{walletRequestType === 'withdrawal'
              ? `Available balance: ${availableBalance.toLocaleString()}`
              : 'Your Master will review this request and add funds to your wallet if approved.'}</p>
            <label htmlFor="wallet-request-amount">Amount</label>
            <input id="wallet-request-amount" type="number" min="0.01" step="0.01" max={walletRequestType === 'withdrawal' ? availableBalance : undefined} required value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} />
            <div className="ph-modal-actions">
              <button className="ph-primary" type="submit" disabled={requestingWalletRequest}>{requestingWalletRequest ? 'Submitting…' : 'Submit request'}</button>
              <button type="button" className="ph-back" onClick={() => setWalletRequestOpen(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      {!connected && (
        <div className="ph-offline-overlay">
          <section className="ph-offline-card" role="alertdialog" aria-modal="true" aria-labelledby="ph-offline-title">
            <strong id="ph-offline-title">Connection lost. Reconnecting…</strong>
          </section>
        </div>
      )}
    </main>
  );
}