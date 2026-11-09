export default function SuperAdminAuditLogPage({ entries }) {
  return (
    <>
      <div className="sa-heading"><div><p className="sa-eyebrow">ADMIN ACTIVITY</p><h1>Audit log</h1><p className="sa-subtitle">Append-only record of administrative actions.</p></div></div>
      <section className="sa-card"><div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Action ID</th><th>Action</th><th>Actor</th><th>Target</th><th>Details</th><th>Date</th></tr></thead><tbody>
        {entries.map((entry) => <tr key={entry.id}><td>{entry.id}</td><td>{entry.action}</td><td>{entry.actor}</td><td>{entry.target}</td><td>{entry.detail}</td><td>{entry.date}</td></tr>)}
      </tbody></table></div></section>
    </>
  );
}
