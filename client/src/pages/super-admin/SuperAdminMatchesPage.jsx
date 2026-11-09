export default function SuperAdminMatchesPage({ search, onSearchChange, matches, money }) {
  return (
    <>
      <div className="sa-heading"><div><p className="sa-eyebrow">GAME OVERSIGHT</p><h1>All matches</h1><p className="sa-subtitle">Search by match ID, user or Master.</p></div><input className="sa-search" aria-label="Search matches" placeholder="Search match, user or master..." value={search} onChange={(event) => onSearchChange(event.target.value)} /></div>
      <section className="sa-card"><div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Match ID</th><th>Master</th><th>Players</th><th>Bet</th><th>Platform fee</th><th>Payout</th><th>Winner</th><th>Result</th><th>Time</th></tr></thead><tbody>
        {matches.map((match) => <tr key={match.id}><td>{match.id}</td><td>{match.masterName}</td><td>{match.users.join(', ')}</td><td>{money(match.bet)}</td><td>{money(match.fee)}</td><td>{money(match.payout)}</td><td>{match.winner || '—'}</td><td>{match.result}</td><td>{match.date}</td></tr>)}
        {!matches.length && <tr><td colSpan="9" className="sa-empty">No matches found.</td></tr>}
      </tbody></table></div></section>
    </>
  );
}
