export default function MasterWalletPage({
  master, stats, wallet, formatAmount, pendingMasterWithdrawals,
  availableMasterBalance, sendWithdrawalRequest, openDialog,
}) {
  const masterRequestRows = wallet.withdrawals;
  return (
    <>
      <div className="md-heading"><div><p className="md-eyebrow">MASTER WALLET</p><h1>My wallet</h1><p className="md-subtitle">Minimum withdrawal: 2,000 credits. Request a deposit or withdrawal from the Super Admin.</p></div><div className="md-actions"><button type="button" className="md-action primary" disabled={master.status !== 'Active'} onClick={() => openDialog('deposit-request')}>Request deposit</button><button type="button" className="md-primary" disabled={!sendWithdrawalRequest || availableMasterBalance < 2000} onClick={() => openDialog('withdraw-request')}>Request withdrawal</button></div></div>
      <section className="md-card"><div className="md-card-head"><h2>Wallet balance</h2><span>Admin review required</span></div><div className="md-balance"><div><span>Master wallet</span><strong>{formatAmount(stats.wallet)}</strong></div><div><span>Pending withdrawals</span><strong>{formatAmount(pendingMasterWithdrawals)}</strong></div><div><span>Available balance</span><strong>{formatAmount(availableMasterBalance)}</strong></div></div><p className="md-explainer">Pending withdrawals are held from your available balance. Deposit requests add funds only after Super Admin approval.</p></section>
      <section className="md-card"><div className="md-card-head"><h2>Wallet ledger</h2><span>All credits and debits</span></div><div className="md-table-wrap"><table className="md-table"><thead><tr><th>Type</th><th>Amount</th><th>Balance after</th><th>Note</th><th>Date</th></tr></thead><tbody>
        {wallet.ledger.map((entry) => <tr key={entry.id}><td>{entry.type}</td><td>{formatAmount(entry.amount)}</td><td>{formatAmount(entry.balanceAfter)}</td><td>{entry.note}</td><td>{entry.date}</td></tr>)}
        {!wallet.ledger.length && <tr><td className="md-empty" colSpan="5">No wallet transactions.</td></tr>}
      </tbody></table></div></section>
      <section className="md-card"><div className="md-card-head"><h2>Wallet request history</h2><span>Submitted to Super Admin</span></div><div className="md-table-wrap"><table className="md-table"><thead><tr><th>Request ID</th><th>Type</th><th>Amount</th><th>Status</th><th>Submitted</th><th>Review note</th></tr></thead><tbody>
        {masterRequestRows.map((request) => <tr key={request.id}><td><strong>{request.id}</strong></td><td>{request.type}</td><td>{formatAmount(request.amount)}</td><td><span className={`md-status ${request.status.toLowerCase()}`}>{request.status}</span></td><td>{request.date}</td><td>{request.reason || '—'}</td></tr>)}
        {!masterRequestRows.length && <tr><td className="md-empty" colSpan="6">No wallet requests yet.</td></tr>}
      </tbody></table></div></section>
    </>
  );
}
