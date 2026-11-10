import { useEffect, useState } from 'react';

export default function SuperAdminAuditLogPage({ entries }) {
  const [selectedEntry, setSelectedEntry] = useState(null);

  useEffect(() => {
    if (!selectedEntry) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedEntry(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [selectedEntry]);

  return (
    <>
      <div className="sa-heading">
        <div>
          <p className="sa-eyebrow">ADMIN ACTIVITY</p>
          <h1>Audit log</h1>
          <p className="sa-subtitle">Append-only record of administrative actions.</p>
        </div>
      </div>
      <section className="sa-card">
        <div className="sa-audit-hint">Select a row to view its full details.</div>
        <div className="sa-audit-table-wrap">
          <table className="sa-table sa-audit-table">
            <thead>
              <tr>
                <th scope="col">Action ID</th>
                <th scope="col">Action</th>
                <th scope="col">Actor</th>
                <th scope="col" className="sa-audit-extra">Target</th>
                <th scope="col" className="sa-audit-extra">Details</th>
                <th scope="col">Date</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="sa-audit-row"
                  tabIndex={0}
                  role="button"
                  aria-label={`View audit entry ${entry.id}: ${entry.action}`}
                  onClick={() => setSelectedEntry(entry)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedEntry(entry);
                    }
                  }}
                >
                  <td>{entry.id}</td>
                  <td title={entry.action}>{entry.action}</td>
                  <td title={entry.actor}>{entry.actor}</td>
                  <td className="sa-audit-extra" title={entry.target}>{entry.target}</td>
                  <td className="sa-audit-extra" title={entry.detail}>{entry.detail}</td>
                  <td title={entry.date}>{entry.date}</td>
                </tr>
              ))}
              {!entries.length && (
                <tr><td colSpan="6" className="sa-empty">No audit activity yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedEntry && (
        <div
          className="sa-form-backdrop sa-audit-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedEntry(null);
          }}
        >
          <section className="sa-audit-dialog" role="dialog" aria-modal="true" aria-labelledby="sa-audit-title">
            <div className="sa-audit-dialog-head">
              <div>
                <p className="sa-eyebrow">AUDIT ENTRY</p>
                <h2 id="sa-audit-title">Action #{selectedEntry.id}</h2>
              </div>
              <button
                type="button"
                className="sa-audit-close"
                aria-label="Close audit entry details"
                autoFocus
                onClick={() => setSelectedEntry(null)}
              >
                ×
              </button>
            </div>
            <dl className="sa-audit-details">
              <div><dt>Action</dt><dd>{selectedEntry.action}</dd></div>
              <div><dt>Actor</dt><dd>{selectedEntry.actor}</dd></div>
              <div><dt>Target</dt><dd>{selectedEntry.target ?? '—'}</dd></div>
              <div><dt>Date</dt><dd>{selectedEntry.date}</dd></div>
              <div className="sa-audit-detail-text"><dt>Details</dt><dd>{selectedEntry.detail || '—'}</dd></div>
            </dl>
          </section>
        </div>
      )}
    </>
  );
}
