import SuperAdminRowActions from './SuperAdminRowActions';

export default function SuperAdminUsersPage({
  masters,
  selectedMasterId,
  onSelectMaster,
  selectedMaster,
  selectedMasterUsers,
  totalUsers,
  onToggleUser,
}) {
  return (
    <>
      <div className="sa-heading"><div><p className="sa-eyebrow">PLATFORM ACCOUNTS</p><h1>Users by Master</h1><p className="sa-subtitle">Select a Master to view and manage their users.</p></div>
        <label className="sa-master-select">Select Master
          <select className="sa-master-select-control" aria-label="Select Master" value={selectedMasterId} onChange={(event) => onSelectMaster(event.target.value)}>
            <option value="">Choose a Master</option>
            {masters.map((master) => <option key={master.id} value={master.id}>{master.name} ({master.loginId})</option>)}
          </select>
        </label>
      </div>
      <section className="sa-card"><div className="sa-card-head"><h2>{selectedMaster ? `${selectedMaster.name}'s users` : 'Master users'}</h2><span>{selectedMaster ? `${selectedMasterUsers.length} users · read-only profile` : `${totalUsers} users across all Masters`}</span></div><div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>User</th><th>Master</th><th>Own status</th><th>Effective status</th><th>Wallet</th><th>Game</th><th>Action</th></tr></thead><tbody>
        {!selectedMasterId && <tr><td className="sa-empty" colSpan="7">Select a Master to see their users.</td></tr>}
        {selectedMasterUsers.map((user) => <tr key={user.id}><td>{user.name}<br /><span className="sa-secondary-text">{user.loginId}</span></td><td>{user.masterName}</td><td>{user.previousStatus}</td><td><span className={`sa-status ${user.effectiveStatus.toLowerCase()}`}>{user.effectiveStatus}</span></td><td>{`${Number(user.balance || 0).toLocaleString()} credits`}</td><td>{user.gameState}</td><td><SuperAdminRowActions actions={[{ label: user.status === 'Blocked' ? 'Unblock' : 'Block user', tone: 'danger', onSelect: () => onToggleUser(user) }]} label={`Actions for ${user.name}`} /></td></tr>)}
        {selectedMasterId && !selectedMasterUsers.length && <tr><td className="sa-empty" colSpan="7">This Master has no users yet.</td></tr>}
      </tbody></table></div></section>
    </>
  );
}
