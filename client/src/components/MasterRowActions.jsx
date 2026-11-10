import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function MasterRowActions({ actions, label }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuHeight = Math.min(actions.length * 38 + 8, window.innerHeight - 16);
      setPosition({
        top: rect.bottom + menuHeight + 8 <= window.innerHeight
          ? rect.bottom + 4
          : Math.max(8, rect.top - menuHeight - 4),
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    const closeOnOutsideClick = (event) => {
      if (!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    updatePosition();
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [actions.length, open]);

  return (
    <div className="md-row-actions">
      <button
        ref={triggerRef}
        type="button"
        className="md-row-actions-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && position && createPortal(
        <div ref={menuRef} className="md-row-actions-menu" role="menu" style={position}>
          {actions.map(({ label: actionLabel, onSelect, tone = '', disabled = false }) => (
            <button
              key={actionLabel}
              type="button"
              role="menuitem"
              className={`md-row-actions-item${tone ? ` ${tone}` : ''}`}
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                onSelect();
              }}
            >
              {actionLabel}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
