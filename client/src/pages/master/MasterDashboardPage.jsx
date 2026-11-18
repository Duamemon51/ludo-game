export default function MasterDashboardPage({ stats, matches, matchCountToday, formatAmount, onViewMatches }) {
  const recentMatches = matches.slice(0, 5);
  return (
    <>
      <div className="md-heading"><div><p className="md-eyebrow">MASTER OVERVIEW</p><h1>Dashboard</h1><p className="md-subtitle">Live wallet, users and match activity from your account.</p></div></div>
      <div className="md-stats md-stats-five">
        <div className="md-stat"><span>My wallet balance</span><strong>{formatAmount(stats?.wallet)}</strong></div>
        <div className="md-stat"><span>Total users</span><strong>{stats?.totalUsers || 0}</strong></div>
        <div className="md-stat"><span>Active users</span><strong>{stats?.activeUsers || 0}</strong></div>
        <div className="md-stat"><span>Matches today</span><strong>{matchCountToday}</strong></div>
        <div className="md-stat"><span>Pending user withdrawals</span><strong>{stats?.pendingUserWithdrawals || 0}</strong><small>{formatAmount(stats?.pendingUserWithdrawalAmount)}</small></div>
      </div>
      <section className="md-card">
        <div className="md-card-head"><h2>Recent matches</h2><button type="button" className="md-action primary" onClick={onViewMatches}>View all matches</button></div>
        <div className="md-table-wrap"><table className="md-table"><thead><tr><th>Match ID</th><th>Players</th><th>Bet</th><th>Fee</th><th>Status</th><th>Winner</th><th>Time</th></tr></thead><tbody>
          {recentMatches.map((match) => <tr key={match.id}><td><strong>{match.id}</strong></td><td>{match.players}</td><td>{formatAmount(match.bet)}</td><td>{formatAmount(match.fee)}</td><td>{match.status}</td><td>{match.winner || '—'}</td><td>{match.date} · {match.time}</td></tr>)}
          {!recentMatches.length && <tr><td className="md-empty" colSpan="7">No matches recorded yet.</td></tr>}
        </tbody></table></div>
      </section>
    </>
  );
}
