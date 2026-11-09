import { useEffect, useRef, useState } from 'react';
import './DashboardHeader.css';

const DEFAULT_ACCOUNT_NAME = 'Super Admin';

function getInitials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function DiceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor" />
      <circle cx="8.5" cy="8.5" r="1.7" fill="var(--dh-bg-a)" />
      <circle cx="15.5" cy="8.5" r="1.7" fill="var(--dh-bg-a)" />
      <circle cx="12" cy="12" r="1.7" fill="var(--dh-bg-a)" />
      <circle cx="8.5" cy="15.5" r="1.7" fill="var(--dh-bg-a)" />
      <circle cx="15.5" cy="15.5" r="1.7" fill="var(--dh-bg-a)" />
    </svg>
  );
}

const iconProps = {
  viewBox: '0 0 24 24',
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

function UserIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg {...iconProps} width={16} height={16} className="dh__chevron">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export default function DashboardHeader({
  variant = 'superAdmin',
  breadcrumb,
  accountName,
  avatarText,
  avatarLabel,
  onProfile,
  onSignOut,
  menuOpen = false,
  onMenuToggle,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);

  const isMaster = variant === 'master';
  const name = accountName || (isMaster ? '' : DEFAULT_ACCOUNT_NAME);
  const initials = avatarText || (name ? getInitials(name) : '?');

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return undefined;

    const handlePointer = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const choose = (callback) => {
    setOpen(false);
    callback?.();
  };

  return (
    <header className={`dh dh--${isMaster ? 'master' : 'super'}`}>
      <div className="dh__left">
        <button
          type="button"
          className="dh__menu-toggle"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls={`dashboard-navigation-${isMaster ? 'master' : 'super'}`}
          onClick={onMenuToggle}
        >
          <span />
          <span />
          <span />
        </button>
        <span className="dh__logo"><DiceIcon /></span>
        <nav className="dh__crumb" aria-label="Breadcrumb">
          {breadcrumb}
        </nav>
      </div>

      <div className="dh__menu-wrap" ref={wrapRef}>
        <button
          ref={triggerRef}
          type="button"
          className="dh__user"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={avatarLabel || name || 'Account menu'}
          onClick={() => setOpen((value) => !value)}
          data-open={open}
        >
          <span className="dh__avatar">{initials}</span>
          {name && <span className="dh__name">{name}</span>}
          <ChevronIcon />
        </button>

        {open && (
          <div className="dh__menu" role="menu">
            {name && <div className="dh__menu-head">{name}</div>}
            <button
              type="button"
              role="menuitem"
              className="dh__item"
              onClick={() => choose(onProfile)}
            >
              <UserIcon />
              <span>Profile</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="dh__item dh__item--danger"
              onClick={() => choose(onSignOut)}
            >
              <LogoutIcon />
              <span>Sign out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}