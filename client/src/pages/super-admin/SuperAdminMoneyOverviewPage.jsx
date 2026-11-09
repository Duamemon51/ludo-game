export default function SuperAdminMoneyOverviewPage({ moneyStats, totalHeld, money }) {
  return (
    <>
      <div className="sa-heading"><div><p className="sa-eyebrow">PLATFORM FINANCE</p><h1>Money overview</h1><p className="sa-subtitle">Totals from recorded platform transactions.</p></div></div>
      <div className="sa-stats">
        <article className="sa-stat"><div className="sa-stat-label">Platform fee earned</div><div className="sa-stat-value">{money(moneyStats.platformFees)}</div></article>
        <article className="sa-stat"><div className="sa-stat-label">Total deposits</div><div className="sa-stat-value">{money(moneyStats.deposits)}</div></article>
        <article className="sa-stat"><div className="sa-stat-label">Total withdrawals</div><div className="sa-stat-value">{money(moneyStats.withdrawals)}</div></article>
        <article className="sa-stat"><div className="sa-stat-label">Balance held by Masters</div><div className="sa-stat-value">{money(totalHeld)}</div></article>
      </div>
    </>
  );
}
