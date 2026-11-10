import SuperAdminRowActions from './SuperAdminRowActions';

export default function SuperAdminMastersPage({
  detailMaster,
  masters,
  requests,
  money,
  initials,
  onOpenDialog,
  onToggleMaster,
  onOpenMasterDetails,
  onToggleUser,
  onBack,
}) {
  if (detailMaster) {
    return (
      <>
        <div className="sa-heading"><div><p className="sa-eyebrow">MASTER DETAILS</p><h1>{detailMaster.name}</h1><p className="sa-subtitle">Login ID: {detailMaster.loginId} · Created {detailMaster.createdAt}</p></div><button type="button" className="sa-action" onClick={onBack}>← Masters</button></div>
        <div className="sa-stats"><article className="sa-stat"><div className="sa-stat-label">Wallet balance</div><div className="sa-stat-value">{money(detailMaster.wallet)}</div></article><article className="sa-stat"><div className="sa-stat-label">Users</div><div className="sa-stat-value">{detailMaster.users.length}</div></article><article className="sa-stat"><div className="sa-stat-label">Account status</div><div className="sa-stat-value">{detailMaster.status}</div></article></div>
        <section className="sa-card" style={{ marginTop: 14 }}><div className="sa-card-head"><h2>Wallet ledger</h2><span>Credits and debits · latest 200</span></div><div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Type</th><th>Amount</th><th>Balance after</th><th>By</th><th>Reason</th><th>Date</th></tr></thead><tbody>
          {detailMaster.ledger.map((row) => <tr key={row.id}><td>{row.type}</td><td>{money(row.amount)}</td><td>{money(row.balanceAfter)}</td><td>{row.actor}</td><td>{row.reason}</td><td>{row.date}</td></tr>)}
          {!detailMaster.ledger.length && <tr><td colSpan="6" className="sa-empty">No ledger entries yet.</td></tr>}
        </tbody></table></div></section>
        <section className="sa-card"><div className="sa-card-head"><h2>Users under this Master</h2><span>{detailMaster.users.length} users · read-only</span></div><div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>User</th><th>Login ID</th><th>Own status</th><th>Effective access</th><th>Wallet</th><th>Game</th><th>Action</th></tr></thead><tbody>
          {detailMaster.users.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.loginId}</td><td>{user.previousStatus}</td><td><span className={`sa-status ${detailMaster.status === 'Blocked' || user.status === 'Blocked' ? 'blocked' : user.status.toLowerCase()}`}>{detailMaster.status === 'Blocked' || user.status === 'Blocked' ? 'Blocked' : user.status}</span></td><td>{money(user.balance)}</td><td>{user.gameState}</td><td><SuperAdminRowActions actions={[{ label: user.status === 'Blocked' ? 'Unblock user' : 'Block user', tone: 'danger', onSelect: () => onToggleUser(user) }]} label={`Actions for ${user.name}`} /></td></tr>)}
        </tbody></table></div></section>
        <section className="sa-card"><div className="sa-card-head"><h2>Wallet request history</h2></div><div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Request ID</th><th>Type</th><th>Amount</th><th>Date</th><th>Status</th><th>Decision note</th></tr></thead><tbody>
          {requests.filter((request) => request.masterId === detailMaster.id).map((request) => <tr key={request.id}><td>{request.id}</td><td>{request.type}</td><td>{money(request.amount)}</td><td>{request.date}</td><td><span className={`sa-status ${request.status.toLowerCase()}`}>{request.status}</span></td><td>{request.reason || '—'}</td></tr>)}
          {!requests.some((request) => request.masterId === detailMaster.id) && <tr><td colSpan="6" className="sa-empty">No wallet requests.</td></tr>}
        </tbody></table></div></section>
      </>
    );
  }

  return (
    <>
      <div className="sa-heading"><div><p className="sa-eyebrow">ACCOUNT MANAGEMENT</p><h1>Masters</h1><p className="sa-subtitle">Create and manage the platform’s Master accounts.</p></div><button type="button" className="sa-primary" onClick={() => onOpenDialog('create-master')}>+ Create Master</button></div>
      <section className="sa-card">
        <div className="sa-card-head"><h2>All Masters</h2><span>{masters.length} accounts</span></div>
        <div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Master</th><th>Login ID</th><th>Status</th><th>Wallet balance</th><th>Users</th><th>Created</th><th>Actions</th></tr></thead><tbody>
          {masters.map((master) => <tr key={master.id}>
            <td><div className="sa-person"><span className="sa-person-avatar">{initials(master.name)}</span><span className="sa-person-copy"><strong>{master.name}</strong><span>{master.phone || 'No phone'}</span></span></div></td>
            <td>{master.loginId}</td><td><span className={`sa-status ${master.status.toLowerCase()}`}>{master.status}</span></td><td><strong>{money(master.wallet)}</strong></td><td>{master.users}</td><td>{master.createdAt}</td>
            <td><SuperAdminRowActions
              label={`Actions for ${master.name}`}
              actions={[
                { label: 'Add balance', tone: 'primary', onSelect: () => onOpenDialog('add', master) },
                { label: 'Deduct', onSelect: () => onOpenDialog('deduct', master) },
                { label: master.status === 'Active' ? 'Block' : 'Unblock', tone: 'danger', onSelect: () => onToggleMaster(master) },
                { label: 'View details', onSelect: () => onOpenMasterDetails(master.id) },
                { label: 'Edit', onSelect: () => onOpenDialog('edit-master', master) },
              ]}
            /></td>
          </tr>)}
        </tbody></table></div>
      </section>
    </>
  );
}
