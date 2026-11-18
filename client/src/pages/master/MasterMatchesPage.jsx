export default function MasterMatchesPage({ matches, formatAmount }) {
  return (
    <>
      <div className="md-heading"><div><p className="md-eyebrow">MATCH RECORDS</p><h1>Matches</h1><p className="md-subtitle">Live and finished matches played by your users.</p></div></div>
      <section className="md-card">
        <div className="md-card-head"><h2>Users’ matches</h2><span>{matches.length} matches · live data</span></div>
        <div className="md-table-wrap"><table className="md-table"><thead><tr><th>Match ID</th><th>Players</th><th>Bet</th><th>Platform fee</th><th>Winner</th><th>Payout</th><th>Status</th><th>Time</th></tr></thead><tbody>
          {matches.map((match) => <tr key={match.id}><td><strong>{match.id}</strong></td><td>{match.players}</td><td>{formatAmount(match.bet)}</td><td>{formatAmount(match.fee)}</td><td>{match.winner || '—'}</td><td>{formatAmount(match.payout)}</td><td>{match.status}</td><td>{match.date} · {match.time}</td></tr>)}
          {!matches.length && <tr><td className="md-empty" colSpan="8">No matches recorded yet.</td></tr>}
        </tbody></table></div>
      </section>
    </>
  );
}
