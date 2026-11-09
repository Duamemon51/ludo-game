export default function SuperAdminWalletRequestsPage({ requests, masters, pendingCount, money, onOpenDialog }) {
  return (
    <>
      <div className="sa-heading"><div><p className="sa-eyebrow">MASTER WALLETS</p><h1>Master wallet requests</h1><p className="sa-subtitle">Approve deposits to credit a Master or withdrawals to debit their wallet.</p></div></div>
      <section className="sa-card"><div className="sa-card-head"><h2>All requests</h2><span>{pendingCount} pending</span></div><div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Request ID</th><th>Master</th><th>Type</th><th>Amount</th><th>Requested date</th><th>Current wallet</th><th>Status</th><th>Decision</th></tr></thead><tbody>
        {requests.map((request) => {
          const master = masters.find((item) => item.id === request.masterId);
          return <tr key={request.id}><td>{request.id}</td><td>{master?.name || 'Master'}</td><td>{request.type}</td><td><strong>{money(request.amount)}</strong></td><td>{request.date}</td><td>{money(master?.wallet || 0)}</td><td><span className={`sa-status ${request.status.toLowerCase()}`}>{request.status}</span></td><td>{request.status === 'Pending' ? <div className="sa-actions"><button type="button" className="sa-action primary" onClick={() => onOpenDialog('resolve-request', master, request, 'Approved')}>Approve</button><button type="button" className="sa-action danger" onClick={() => onOpenDialog('resolve-request', master, request, 'Rejected')}>Reject</button></div> : <span>{request.reason || 'Reviewed'}</span>}</td></tr>;
        })}
        {!requests.length && <tr><td colSpan="8" className="sa-empty">No wallet requests yet.</td></tr>}
      </tbody></table></div></section>
    </>
  );
}
