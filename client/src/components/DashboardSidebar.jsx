import { useEffect } from 'react';
import './DashboardSidebar.css';

function DiceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor" />
      <circle cx="8.5" cy="8.5" r="1.7" fill="var(--ds-bg-a)" />
      <circle cx="15.5" cy="8.5" r="1.7" fill="var(--ds-bg-a)" />
      <circle cx="12" cy="12" r="1.7" fill="var(--ds-bg-a)" />
      <circle cx="8.5" cy="15.5" r="1.7" fill="var(--ds-bg-a)" />
      <circle cx="15.5" cy="15.5" r="1.7" fill="var(--ds-bg-a)" />
    </svg>
  );
}

function NavigationIcon({ name }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    masters: <><path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>,
    requests: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5h6M9 10h6M9 14h6M9 18h3" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5a5.5 5.5 0 0 1 11 0V20zM16 5.5a3 3 0 0 1 0 5.8M17 14a4.5 4.5 0 0 1 3.5 4.4V20h-3" /></>,
    matches: <><path d="M8 4H4v3a5 5 0 0 0 5 5M16 4h4v3a5 5 0 0 1-5 5M8 3h8v7a4 4 0 0 1-8 0V3ZM12 14v4M8 21h8M9 18h6" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18M16 14h2M7 5V3h11" /></>,
    money: <><circle cx="12" cy="12" r="9" /><path d="M16 8.5c-.7-.8-1.8-1.2-3.2-1.2-1.5 0-2.7.7-2.7 1.8 0 2.8 6.2 1.1 6.2 4.5 0 1.3-1.3 2.2-3.2 2.2-1.5 0-2.8-.5-3.7-1.5M12 5.5v13" /></>,
    audit: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5" /><path d="M4 4v4.5h4.5M12 8v4l2.5 1.5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.7-1.4-2.4L7.3 15a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.7 1.4 2.4L19.3 13a7 7 0 0 1 .1 2Z" /></>,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      width="19"
      height="19"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.dashboard}
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export default function DashboardSidebar({
  variant,
  brandSubtitle,
  sectionLabel,
  ariaLabel,
  activeItem,
  navItems = [],
  onNavigate,
  accountName,
  accountLoginId,
  footer,
  onSignOut,
  open = false,
  onClose,
}) {
  const isMaster = variant === 'master';
  const navId = `dashboard-navigation-${isMaster ? 'master' : 'super'}`;

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, onClose]);

  return (
    <>
      {open && (
        <button
          type="button"
          className="ds__backdrop"
          aria-label="Close navigation menu"
          onClick={onClose}
        />
      )}
      <aside className={`ds ds--${isMaster ? 'master' : 'super'}${open ? ' is-open' : ''}`}>
        <div className="ds__brand">
          <span className="ds__logo"><DiceIcon /></span>
          <div className="ds__brand-text">
            <div className="ds__title">LUDO</div>
            <div className="ds__subtitle">{brandSubtitle}</div>
          </div>
        </div>

        {isMaster && (
          <div className="ds__account">
            <strong>{accountName || 'Master'}</strong>
            {accountLoginId && <span>{accountLoginId}</span>}
          </div>
        )}

        {sectionLabel && <div className="ds__label">{sectionLabel}</div>}

        <nav id={navId} className="ds__nav" aria-label={ariaLabel}>
          {navItems.map(({ label, icon, count }) => {
            const selected = activeItem === label;
            return (
              <button
                key={label}
                type="button"
                className={`ds__item${selected ? ' is-selected' : ''}`}
                aria-current={selected ? 'page' : undefined}
                onClick={() => {
                  onNavigate?.(label);
                  onClose?.();
                }}
              >
                <span className="ds__icon"><NavigationIcon name={icon} /></span>
                <span className="ds__item-label">{label}</span>
                {count > 0 && <span className="ds__count">{count}</span>}
              </button>
            );
          })}
        </nav>

        <div className="ds__bottom">
          {isMaster ? (
            <button type="button" className="ds__signout" onClick={onSignOut}>
              <LogoutIcon />
              <span>Sign out</span>
            </button>
          ) : (
            footer && <div className="ds__footer">{footer}</div>
          )}
        </div>
      </aside>
    </>
  );
}