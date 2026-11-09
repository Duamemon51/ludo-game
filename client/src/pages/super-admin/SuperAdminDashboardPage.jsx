const todayLabel = new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date());

const CHART_BASELINE = 134;

export default function SuperAdminDashboardPage({
  dashboardStats = {},
  totalUsers,
  matchesToday,
  feeToday,
  pendingCount,
  requests = [],
  masters = [],
  moneyStats = {},
  totalHeld,
  money,
  createChartPoints,
  onViewWalletRequests,
}) {
  const masterById = new Map(masters.map((master) => [master.id, master]));

  const stats = [
    { label: 'Total masters', value: dashboardStats.totalMasters || 0, note: `${dashboardStats.activeMasters || 0} active` },
    { label: 'Active masters', value: dashboardStats.activeMasters || 0, note: 'Current status' },
    { label: 'Total users', value: totalUsers, note: 'Across all Masters' },
    { label: 'Matches today', value: matchesToday, note: 'Recorded matches' },
    { label: 'Platform fee today', value: money(feeToday), note: 'Earned today' },
    { label: 'Pending wallet requests', value: pendingCount, note: 'Awaiting your decision', warn: pendingCount > 0 },
  ];

  const chartRows = dashboardStats.chart || [];
  const matchPoints = chartRows.length ? createChartPoints('matches') : '';
  const feePoints = chartRows.length ? createChartPoints('fee') : '';
  const hasChartData = Boolean(matchPoints || feePoints);

  // Close the matches line into an area shape for the soft fill
  let areaPoints = '';
  if (matchPoints) {
    const pairs = matchPoints.split(' ');
    const firstX = pairs[0].split(',')[0];
    const lastX = pairs[pairs.length - 1].split(',')[0];
    areaPoints = `${matchPoints} ${lastX},${CHART_BASELINE} ${firstX},${CHART_BASELINE}`;
  }

  const dayLabels = chartRows
    .map((row) => row.label ?? row.day ?? row.date)
    .filter(Boolean);

  const summaryRows = [
    ['Platform fee earned', moneyStats.platformFees],
    ['Total deposits', moneyStats.deposits],
    ['Total withdrawals', moneyStats.withdrawals],
    ['Balance held in master wallets', totalHeld],
  ];

  return (
    <>
      <div className="sa-heading">
        <div>
          <h1>Dashboard</h1>
          <p className="sa-subtitle">Platform activity and money overview · {todayLabel}</p>
        </div>
      </div>

      <div className="sa-stats">
        {stats.map(({ label, value, note, warn }) => (
          <article className={`sa-stat${warn ? ' sa-stat--warn' : ''}`} key={label}>
            <div className="sa-stat-label">{label}</div>
            <div className="sa-stat-value">{value}</div>
            <div className="sa-stat-note">
              {note}
              {warn && (
                <button type="button" className="sa-stat-link" onClick={onViewWalletRequests}>
                  Review
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="sa-grid-two">
        <section className="sa-card">
          <div className="sa-card-head">
            <h2>Matches and fee income</h2>
            <span>Last 7 days</span>
          </div>
          <div className="sa-chart-wrap">
            <svg
              className="sa-chart"
              viewBox="0 0 560 155"
              role="img"
              aria-label={hasChartData ? 'Daily matches and fee income for the last 7 days' : 'No match activity recorded yet'}
            >
              <defs>
                <linearGradient id="sa-area-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0e8a86" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#0e8a86" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[20, 58, 96, CHART_BASELINE].map((y) => (
                <line key={y} className="sa-chart-grid" x1="0" x2="560" y1={y} y2={y} />
              ))}
              {hasChartData ? (
                <>
                  {areaPoints && <polygon className="sa-chart-area" points={areaPoints} fill="url(#sa-area-fill)" />}
                  {matchPoints && <polyline className="sa-chart-matches" points={matchPoints} />}
                  {feePoints && <polyline className="sa-chart-fee" points={feePoints} />}
                </>
              ) : (
                <text className="sa-chart-empty" x="280" y="84" textAnchor="middle">
                  No match activity yet
                </text>
              )}
            </svg>
            {dayLabels.length > 0 && (
              <div className="sa-chart-days" aria-hidden="true">
                {dayLabels.map((label) => <span key={label}>{label}</span>)}
              </div>
            )}
            <div className="sa-chart-legend">
              <span><i className="sa-legend-dot" />Matches</span>
              <span><i className="sa-legend-dot fee" />Fee income</span>
            </div>
          </div>
        </section>

        <section className="sa-card">
          <div className="sa-card-head">
            <h2>Money overview</h2>
            <span>Credits</span>
          </div>
          <div className="sa-summary-list">
            {summaryRows.map(([label, value]) => (
              <div className="sa-summary-row" key={label}>
                <span>{label}</span>
                <strong>{money(value)}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="sa-card" style={{ marginTop: 14 }}>
        <div className="sa-card-head">
          <h2>Recent Master wallet requests</h2>
          <button type="button" className="sa-action primary" onClick={onViewWalletRequests}>
            Review all
          </button>
        </div>
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Master</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Requested</th>
                <th>Wallet balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.slice(0, 4).map((request) => {
                const master = masterById.get(request.masterId);
                return (
                  <tr key={request.id}>
                    <td><strong>{master?.name || 'Master'}</strong></td>
                    <td><span className={`sa-type sa-type--${String(request.type).toLowerCase()}`}>{request.type}</span></td>
                    <td>{money(request.amount)}</td>
                    <td>{request.date}</td>
                    <td>{money(master?.wallet || 0)}</td>
                    <td><span className={`sa-status ${request.status.toLowerCase()}`}>{request.status}</span></td>
                  </tr>
                );
              })}
              {!requests.length && (
                <tr><td className="sa-empty" colSpan="6">No wallet requests yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}