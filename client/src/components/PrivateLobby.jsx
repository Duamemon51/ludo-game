import { useEffect, useMemo, useState } from 'react';
import Bubble from './Bubble';

const CSS = `
  .pl-wrap {
    --purple-1: #7a2a9e;
    --purple-2: #4a1a7a;
    --purple-3: #2d0f55;
    --gold: #ffc83d;
    --gold-dark: #c98a0a;
    --orange-1: #ffb23e;
    --orange-2: #f08a1c;
    --orange-edge: #b8620a;
    --blue-1: #4a8cf0;
    --blue-2: #2a5cc4;
    --green-1: #4cd964;
    --green-2: #25a244;

    position: relative;
    width: min(100%, 420px);
    padding: 18px 14px 16px;
    border-radius: 24px;
    text-align: center;
    color: #fff;
    font-family: 'Baloo 2', system-ui, sans-serif;
    background:
      radial-gradient(circle at 50% -10%, rgba(255,255,255,.22), transparent 55%),
      linear-gradient(175deg, var(--purple-1) 0%, var(--purple-2) 55%, var(--purple-3) 100%);
    border: 2px solid rgba(255, 200, 61, .55);
    box-shadow:
      0 5px 0 #240a44,
      0 18px 32px rgba(20, 5, 50, .55),
      inset 0 1px 0 rgba(255,255,255,.25);
  }

  /* ---------- Heading + code ---------- */
  .pl-title {
    display: inline-block;
    margin: 0 0 12px;
    padding: 3px 16px;
    border-radius: 999px;
    background: rgba(0,0,0,.3);
    border: 1px solid rgba(255, 200, 61, .5);
    color: var(--gold);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .pl-code { display: flex; justify-content: center; gap: 8px; }
  .pl-code span {
    display: grid;
    place-items: center;
    width: 44px;
    height: 54px;
    border-radius: 13px;
    background: linear-gradient(180deg, #fff6d6 0%, var(--gold) 100%);
    color: #4a2400;
    font-size: 28px;
    font-weight: 800;
    box-shadow: 0 4px 0 var(--gold-dark), 0 10px 14px rgba(0,0,0,.35), inset 0 2px 0 rgba(255,255,255,.7);
  }
  .pl-wager {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
    padding: 9px 12px;
    border: 1px solid rgba(255, 200, 61, .4);
    border-radius: 12px;
    background: rgba(25, 6, 55, .45);
    color: rgba(255,255,255,.85);
    font-size: 13px;
    font-weight: 700;
  }
  .pl-wager > div { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
  .pl-wager strong { color: var(--gold); white-space: nowrap; }

  /* ---------- Invite ---------- */
  .pl-invite {
    margin-top: 18px;
    padding: 14px 12px;
    border-radius: 18px;
    background: rgba(25, 6, 55, .55);
    border: 1px solid rgba(255,255,255,.12);
    box-shadow: inset 0 2px 8px rgba(0,0,0,.35);
  }
  .pl-invite-title {
    margin: 0 0 10px;
    font-size: 15px;
    font-weight: 800;
    color: #fff;
    text-shadow: 0 2px 0 rgba(0,0,0,.3);
  }
  .pl-invite-actions { display: grid; grid-template-columns: minmax(0, 1fr) 54px; gap: 8px; align-items: center; }
  .pl-share-main {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 10px;
    border: 0;
    border-radius: 14px;
    background: linear-gradient(180deg, var(--blue-1), var(--blue-2));
    color: #fff;
    font: 800 16px 'Baloo 2', system-ui, sans-serif;
    text-shadow: 0 2px 0 rgba(0,0,0,.25);
    box-shadow: 0 4px 0 #1b3f8f, 0 10px 16px rgba(0,0,0,.35), inset 0 2px 0 rgba(255,255,255,.35);
    cursor: pointer;
    transition: transform .1s ease, box-shadow .1s ease;
  }
  .pl-share-main:active { transform: translateY(3px); box-shadow: 0 1px 0 #1b3f8f; }
  .pl-share-main svg { width: 20px; height: 20px; }
  .pl-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(18, 5, 38, .78);
    backdrop-filter: blur(5px);
  }
  .pl-modal {
    width: min(100%, 410px);
    max-height: min(85vh, 620px);
    max-height: min(85dvh, 620px);
    overflow-y: auto;
    padding: 20px;
    border: 2px solid rgba(255, 200, 61, .65);
    border-radius: 22px;
    color: #fff;
    background:
      radial-gradient(circle at 50% -10%, rgba(255,255,255,.2), transparent 55%),
      linear-gradient(175deg, var(--purple-1), var(--purple-2) 58%, var(--purple-3));
    box-shadow: 0 8px 0 #240a44, 0 24px 55px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.25);
  }
  .pl-modal-head { display: flex; align-items: flex-start; gap: 12px; }
  .pl-modal-head > div { flex: 1; min-width: 0; }
  .pl-modal-head h2 { margin: 0; color: var(--gold); font-size: 20px; line-height: 1.2; }
  .pl-modal-head p { margin: 4px 0 0; color: #e3d3f7; font-size: 13px; }
  .pl-modal-close {
    display: grid;
    flex: none;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 1px solid rgba(255,255,255,.35);
    border-radius: 50%;
    color: #fff;
    background: rgba(0,0,0,.22);
    font: 700 22px/1 system-ui, sans-serif;
    cursor: pointer;
  }
  .pl-modal-code {
    margin-top: 16px;
    border: 1px solid rgba(255,200,61,.45);
    border-radius: 14px;
    padding: 10px;
    color: var(--gold);
    background: rgba(0,0,0,.25);
    font-size: 24px;
    font-weight: 900;
    letter-spacing: 8px;
    text-align: center;
  }
  .pl-modal-link {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    border-radius: 12px;
    padding: 8px;
    background: rgba(0,0,0,.25);
  }
  .pl-modal-link span { flex: 1; min-width: 0; overflow-wrap: anywhere; color: #eee3fb; font-size: 12px; text-align: left; }
  .pl-modal-copy {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: none;
    border: 0;
    border-radius: 9px;
    padding: 8px 12px;
    color: #4a2400;
    background: linear-gradient(180deg, #ffe48a, var(--gold));
    font: 800 13px 'Baloo 2', system-ui, sans-serif;
    cursor: pointer;
  }
  .pl-modal-copy svg { width: 15px; height: 15px; }
  .pl-modal .pl-share-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 6px; margin-top: 16px; }

  .pl-share-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
    margin-top: 12px;
  }
  .pl-share-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 0;
    border: 0;
    background: none;
    color: #e3d3f7;
    font: 700 11px 'Baloo 2', system-ui, sans-serif;
    text-decoration: none;
    cursor: pointer;
  }
  .pl-share-icon {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: var(--bg);
    color: #fff;
    border: 2px solid rgba(255,255,255,.85);
    box-shadow: 0 3px 0 rgba(0,0,0,.35), 0 6px 10px rgba(0,0,0,.3);
    transition: transform .12s ease;
  }
  .pl-share-icon svg { width: 20px; height: 20px; }
  .pl-share-item:hover .pl-share-icon { transform: translateY(-2px); }
  .pl-share-item:active .pl-share-icon { transform: translateY(2px); }
  .pl-share-item:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; border-radius: 10px; }

  /* ---------- Players ---------- */
  .pl-count {
    margin: 20px 0 6px;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 1.5px;
    color: #e3d3f7;
  }
  .pl-count b {
    margin-left: 6px;
    padding: 1px 10px;
    border-radius: 999px;
    background: rgba(0,0,0,.35);
    border: 1px solid rgba(255, 200, 61, .6);
    color: var(--gold);
    font-size: 15px;
  }

  .pl-arena { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 22px 8px; padding: 10px 0 4px; }
  .pl-vs {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 3;
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    transform: translate(-50%, -62%);
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #ffe48a, var(--orange-2));
    border: 3px solid #fff;
    color: #5a2d00;
    font: 800 15px 'Lilita One', 'Baloo 2', sans-serif;
    box-shadow: 0 4px 0 var(--orange-edge), 0 8px 14px rgba(0,0,0,.4);
  }

  .pl-slot { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .pl-slot.joined { animation: pl-pop .35s cubic-bezier(.2, 1.3, .4, 1) both; }
  @keyframes pl-pop { from { transform: scale(.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }

  .pl-ring {
    position: relative;
    display: grid;
    place-items: center;
    width: 84px;
    height: 84px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 0 3px #fff, 0 6px 0 rgba(0,0,0,.3), 0 12px 18px rgba(0,0,0,.35);
    cursor: default;
  }
  .pl-ring:disabled { opacity: 1; }
  .pl-ring.me { cursor: pointer; box-shadow: 0 0 0 3px #fff, 0 0 0 6px var(--gold), 0 6px 0 rgba(0,0,0,.3), 0 12px 18px rgba(0,0,0,.35); }
  .pl-ring.me:active { transform: scale(.95); }
  .pl-ring:focus-visible { outline: 3px solid var(--gold); outline-offset: 5px; }

  .pl-avatar {
    display: grid;
    place-items: center;
    width: 70px;
    height: 70px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff, rgba(255,255,255,.78));
    color: var(--purple-3);
    font-size: 32px;
    font-weight: 800;
    box-shadow: inset 0 -4px 0 rgba(0,0,0,.12);
  }
  .pl-crown {
    position: absolute;
    top: -17px;
    left: 50%;
    transform: translateX(-50%) rotate(-6deg);
    font-size: 24px;
    filter: drop-shadow(0 2px 2px rgba(0,0,0,.45));
  }
  .pl-chat-badge {
    position: absolute;
    right: -4px;
    bottom: -2px;
    display: grid;
    place-items: center;
    width: 27px;
    height: 27px;
    border-radius: 50%;
    background: var(--gold);
    border: 2px solid #fff;
    font-size: 14px;
    box-shadow: 0 2px 6px rgba(0,0,0,.4);
  }
  .pl-name {
    max-width: 120px;
    padding: 3px 14px;
    border-radius: 999px;
    background: rgba(0,0,0,.35);
    border-bottom: 3px solid var(--c);
    font-size: 14px;
    font-weight: 800;
    text-shadow: 0 1px 0 rgba(0,0,0,.4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pl-you {
    margin-top: -2px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1.5px;
    color: var(--gold);
  }

  /* empty seat */
  .pl-ring.empty {
    background: rgba(255,255,255,.08);
    border: 3px dashed rgba(255,255,255,.4);
    box-shadow: none;
  }
  .pl-ring.empty .pl-avatar { background: transparent; color: rgba(255,255,255,.45); font-size: 30px; box-shadow: none; }
  .pl-ring.empty::after {
    content: '';
    position: absolute;
    inset: -6px;
    border-radius: 50%;
    border: 3px solid transparent;
    border-top-color: var(--c);
    animation: pl-spin 1.3s linear infinite;
  }
  @keyframes pl-spin { to { transform: rotate(360deg); } }
  .pl-wait { color: #cdb8ea; background: transparent; border-bottom-color: transparent; font-weight: 700; }

  /* ---------- Footer ---------- */
  .pl-hint { margin: 12px 0 0; color: #d6c4ee; font-size: 13px; font-weight: 700; }

  .pl-start {
    display: block;
    width: 100%;
    margin-top: 16px;
    padding: 12px;
    border: 0;
    border-radius: 18px;
    background: linear-gradient(180deg, var(--orange-1) 0%, var(--orange-2) 100%);
    color: #fff;
    font: 800 21px 'Baloo 2', system-ui, sans-serif;
    letter-spacing: 1px;
    text-shadow: 0 2px 0 rgba(120, 50, 0, .5);
    box-shadow: 0 6px 0 var(--orange-edge), 0 14px 22px rgba(0,0,0,.4), inset 0 2px 0 rgba(255,255,255,.45);
    cursor: pointer;
    transition: transform .1s ease, box-shadow .1s ease;
  }
  .pl-start:active:not(:disabled) { transform: translateY(4px); box-shadow: 0 2px 0 var(--orange-edge), 0 6px 10px rgba(0,0,0,.4); }
  .pl-start:disabled {
    background: linear-gradient(180deg, #8d6aa8, #6b4a88);
    box-shadow: 0 6px 0 #45285f, 0 12px 18px rgba(0,0,0,.3);
    text-shadow: none;
    color: #e3d3f7;
    font-size: 16px;
    cursor: not-allowed;
  }
  .pl-leave {
    margin-top: 14px;
    padding: 7px 22px;
    border: 2px solid rgba(255,255,255,.25);
    border-radius: 999px;
    background: rgba(0,0,0,.2);
    color: #ffb4b4;
    font: 800 14px 'Baloo 2', system-ui, sans-serif;
    cursor: pointer;
  }
  .pl-leave:hover { background: rgba(255, 90, 90, .18); }

  .pl-toast {
    position: absolute;
    left: 50%;
    top: 10px;
    z-index: 5;
    padding: 6px 16px;
    border-radius: 999px;
    background: var(--gold);
    color: #4a2400;
    font: 800 13px 'Baloo 2', sans-serif;
    box-shadow: 0 3px 0 var(--gold-dark), 0 8px 16px rgba(0,0,0,.4);
    animation: pl-toast 1.8s ease both;
  }
  @keyframes pl-toast {
    0% { opacity: 0; transform: translate(-50%, -8px); }
    12%, 80% { opacity: 1; transform: translate(-50%, 0); }
    100% { opacity: 0; }
  }

  @media (max-width: 600px) {
    .pl-wrap {
      width: 100%;
      max-height: calc(100vh - 16px);
      max-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 16px);
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 16px 12px 14px;
      border-radius: 20px;
    }
    .pl-invite { margin-top: 14px; padding: 12px 10px; }
    .pl-share-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 4px; }
    .pl-arena { gap: 16px 6px; }
    .pl-ring { width: 72px; height: 72px; }
    .pl-avatar { width: 60px; height: 60px; font-size: 28px; }
    .pl-start { margin-top: 12px; padding: 10px; font-size: 18px; }
    .pl-leave { margin-top: 10px; }
    .pl-modal { padding: 16px; border-radius: 18px; }
    .pl-modal-code { font-size: 21px; letter-spacing: 6px; }
  }
  @media (max-width: 360px) {
    .pl-code { gap: 6px; }
    .pl-code span { width: 38px; height: 48px; font-size: 24px; }
    .pl-ring { width: 64px; height: 64px; }
    .pl-avatar { width: 54px; height: 54px; font-size: 25px; }
    .pl-share-icon { width: 38px; height: 38px; }
    .pl-name { max-width: 100px; padding-inline: 8px; font-size: 12px; }
  }
  @media (prefers-reduced-motion: reduce) and (hover: hover) and (pointer: fine) {
    .pl-wrap *, .pl-wrap *::after { animation: none !important; transition: none !important; }
  }
`;

// Ludo colours
const SEAT_COLORS = {
  2: ['#e53935', '#1e88e5'],
  4: ['#e53935', '#3fa34d', '#1e88e5', '#fcc419'],
};

/* ---------- Icons ---------- */
const Icon = ({ children, fill }) => (
  <svg
    viewBox="0 0 24 24"
    fill={fill ? 'currentColor' : 'none'}
    stroke={fill ? 'none' : 'currentColor'}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const ShareIcon = () => (
  <Icon>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
  </Icon>
);
const WhatsAppIcon = () => (
  <Icon>
    <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.6-5A8.5 8.5 0 1 1 21 11.5z" />
    <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a3.5 3.5 0 0 1-1.6-1.6l.8-1-1-2z" />
  </Icon>
);
const FacebookIcon = () => (
  <Icon fill>
    <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v8h4v-8h3l1-4h-4V8.5c0-.3.2-.5.5-.5z" />
  </Icon>
);
const TelegramIcon = () => (
  <Icon fill>
    <path d="M21.5 3.5 2.8 10.7c-.8.3-.8 1.4 0 1.7l4.6 1.5 1.8 5.5c.2.7 1.1.9 1.6.3l2.5-2.6 4.7 3.5c.6.4 1.4.1 1.6-.6L22.9 4.9c.2-.9-.6-1.7-1.4-1.4zM9.5 13.5l8.3-5.3-6.6 6.3-.3 3.2-1.4-4.2z" />
  </Icon>
);
const XIcon = () => (
  <Icon>
    <path d="M4 4l16 16M20 4 4 20" />
  </Icon>
);
const SmsIcon = () => (
  <Icon>
    <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Icon>
);
const CopyIcon = () => (
  <Icon>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </Icon>
);

/* Link nikalne ka helper: shareLink prop > whatsappLink ke text se > current page */
function extractShareData(whatsappLink, shareLink, code) {
  let text = '';
  try {
    text = new URL(whatsappLink).searchParams.get('text') || '';
  } catch {
    /* ignore */
  }
  const urlFromText = text.match(/https?:\/\/\S+/)?.[0];
  const url =
    shareLink ||
    urlFromText ||
    (typeof window !== 'undefined' ? window.location.href : '');
  const message = `Join my private table on Ludo! Room code: ${code}`;
  return { url, message };
}

export default function PrivateLobby({
  lobby,
  playerId,
  bubbles,
  chatEnabled,
  isHost,
  whatsappLink,
  shareLink,
  onCopyLink,
  onOpenChat,
  onStart,
  onLeave,
}) {
  const [toast, setToast] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const colors = SEAT_COLORS[lobby.mode] || SEAT_COLORS[4];
  const filled = lobby.players.length;
  const remaining = lobby.mode - filled;

  const { url, message } = useMemo(
    () => extractShareData(whatsappLink, shareLink, lobby.code),
    [whatsappLink, shareLink, lobby.code]
  );

  const fullText = `${message}\n${url}`;
  const enc = encodeURIComponent;

  useEffect(() => {
    if (!shareOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setShareOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [shareOpen]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  };

  const handleCopy = () => {
    onCopyLink?.();
    showToast('Link copied!');
    setShareOpen(false);
  };

  const targets = [
    { key: 'wa', label: 'WhatsApp', bg: '#25d366', icon: <WhatsAppIcon />, href: whatsappLink || `https://wa.me/?text=${enc(fullText)}` },
    { key: 'fb', label: 'Facebook', bg: '#1877f2', icon: <FacebookIcon />, href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}&quote=${enc(message)}` },
    { key: 'tg', label: 'Telegram', bg: '#229ed9', icon: <TelegramIcon />, href: `https://t.me/share/url?url=${enc(url)}&text=${enc(message)}` },
    { key: 'x', label: 'X', bg: '#111', icon: <XIcon />, href: `https://twitter.com/intent/tweet?text=${enc(message)}&url=${enc(url)}` },
    { key: 'sms', label: 'SMS', bg: '#f08a1c', icon: <SmsIcon />, href: `sms:?&body=${enc(fullText)}` },
  ];

  return (
    <>
      <style>{CSS}</style>
      <div className="pl-wrap">
        {toast && <div className="pl-toast" role="status">{toast}</div>}

        <h3 className="pl-title">Room code</h3>
        <div className="pl-code" aria-label={`Room code ${lobby.code}`}>
          {String(lobby.code).split('').map((ch, i) => (
            <span key={i}>{ch}</span>
          ))}
        </div>
        <div className="pl-wager">
          <div>
            <span>Bet per player</span>
            <strong>{Number(lobby.bet).toLocaleString()} credits</strong>
          </div>
          <div>
            <span>Total pot</span>
            <strong>{(Number(lobby.bet) * lobby.mode).toLocaleString()} credits</strong>
          </div>
        </div>

        {/* ---------- Invite / Share ---------- */}
        <div className="pl-invite">
          <p className="pl-invite-title">Invite friends</p>

          <div className="pl-invite-actions">
            <button type="button" className="pl-share-main" onClick={() => setShareOpen(true)}>
              <ShareIcon /> Share invite
            </button>
            <button type="button" className="pl-share-item" onClick={handleCopy}>
              <span className="pl-share-icon" style={{ '--bg': '#6b3fa0' }}><CopyIcon /></span>
              Copy
            </button>
          </div>

        </div>

        {shareOpen && (
          <div
            className="pl-modal-backdrop"
            onClick={(event) => {
              if (event.target === event.currentTarget) setShareOpen(false);
            }}
          >
            <section
              className="pl-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pl-modal-title"
              aria-describedby="pl-modal-description"
            >
              <div className="pl-modal-head">
                <div>
                  <h2 id="pl-modal-title">Share invite</h2>
                  <p id="pl-modal-description">Invite friends to join your private table.</p>
                </div>
                <button
                  type="button"
                  className="pl-modal-close"
                  aria-label="Close share dialog"
                  onClick={() => setShareOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="pl-modal-code">{lobby.code}</div>
              <div className="pl-modal-link">
                <span>{url}</span>
                <button type="button" className="pl-modal-copy" onClick={handleCopy}>
                  <CopyIcon /> Copy link
                </button>
              </div>
              <div className="pl-share-grid">
                {targets.map((target) => (
                  <a
                    key={target.key}
                    className="pl-share-item"
                    href={target.href}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <span className="pl-share-icon" style={{ '--bg': target.bg }}>{target.icon}</span>
                    {target.label}
                  </a>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ---------- Players ---------- */}
        <div className="pl-count">
          PLAYERS <b>{filled}/{lobby.mode}</b>
        </div>

        <div className="pl-arena">
          {lobby.mode === 2 && <div className="pl-vs" aria-hidden="true">VS</div>}

          {Array.from({ length: lobby.mode }, (_, index) => {
            const player = lobby.players[index];
            const color = colors[index % colors.length];

            if (!player) {
              return (
                <div key={`empty-${index}`} className="pl-slot" style={{ '--c': color }}>
                  <div className="pl-ring empty">
                    <span className="pl-avatar">👤</span>
                  </div>
                  <div className="pl-name pl-wait">Waiting for player…</div>
                </div>
              );
            }

            const isMe = player.id === playerId;
            const isLobbyHost = player.id === lobby.hostId;
            const bubble = bubbles[player.id];

            return (
              <div key={player.id} className="pl-slot joined" style={{ '--c': color }}>
                <button
                  type="button"
                  className={'pl-ring' + (isMe ? ' me' : '')}
                  disabled={!isMe || !chatEnabled}
                  onClick={() => chatEnabled && onOpenChat()}
                  aria-label={isMe && chatEnabled ? 'Open chat' : player.name}
                >
                  {isLobbyHost && <span className="pl-crown" aria-label="Host">👑</span>}
                  <span className="pl-avatar">{player.name.charAt(0).toUpperCase()}</span>
                  {chatEnabled && isMe && <span className="pl-chat-badge">💬</span>}
                </button>
                <div className="pl-name">{player.name}</div>
                {isMe && <div className="pl-you">YOU</div>}
                {chatEnabled && bubble && (
                  <Bubble key={bubble.id} text={bubble.text} vertical="bottom" side="center" />
                )}
              </div>
            );
          })}
        </div>

        {chatEnabled && <p className="pl-hint">Tap your avatar to chat 💬</p>}

        {isHost ? remaining === 0 && (
          <button
            type="button"
            className="pl-start"
            onClick={onStart}
          >
            START GAME
          </button>
        ) : (
          <p className="pl-hint">Waiting for the host to start…</p>
        )}

        <button type="button" className="pl-leave" onClick={onLeave}>
          Leave room
        </button>
      </div>
    </>
  );
}