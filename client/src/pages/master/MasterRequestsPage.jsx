import MasterRowActions from '../../components/MasterRowActions';

export default function MasterRequestsPage({ master, userWithdrawals, pendingUserRequests, formatAmount, openDialog }) {
  return (
    <>
      <div className="md-heading"><div><p className="md-eyebrow">USER WALLET REQUESTS</p><h1>User deposit and withdrawal requests</h1><p className="md-subtitle">Approve deposits and withdrawals for your users.</p></div></div>
      <section className="md-card"><div className="md-card-head"><h2>Requests from your users</h2><span>{pendingUserRequests.length} pending</span></div><div className="md-table-wrap"><table className="md-table"><thead><tr><th>Request ID</th><th>User</th><th>Type</th><th>Amount</th><th>Date</th><th>User balance</th><th>Status</th><th>Decision</th></tr></thead><tbody>
        {userWithdrawals.map((request) => <tr key={request.id}><td><strong>{request.id}</strong></td><td>{request.userName}</td><td>{request.type}</td><td>{formatAmount(request.amount)}</td><td>{request.date}</td><td>{formatAmount(request.userBalance)}</td><td><span className={`md-status ${request.status.toLowerCase()}`}>{request.status}</span></td><td>{request.status === 'Pending' ? <MasterRowActions label={`Decide on ${request.type.toLowerCase()} request from ${request.userName}`} actions={[{ label: 'Approve', tone: 'primary', disabled: master.status !== 'Active', onSelect: () => openDialog('resolve-user-request', null, request, 'Approved') }, { label: 'Reject', tone: 'danger', disabled: master.status !== 'Active', onSelect: () => openDialog('resolve-user-request', null, request, 'Rejected') }]} /> : request.reason || 'Reviewed'}</td></tr>)}
        {!userWithdrawals.length && <tr><td className="md-empty" colSpan="8">No wallet requests from users.</td></tr>}
      </tbody></table></div></section>
    </>
  );
}
