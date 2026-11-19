import MasterRowActions from '../../components/MasterRowActions';

const initials = (name = '') => name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase();

export default function MasterUsersPage({
  master, users, selectedUserId, displayedUser, formatAmount,
  availableUserBalance, openDialog, changeUserStatus, toggleBlock, setSelectedUserId,
}) {
  if (selectedUserId && displayedUser) {
    return (
      <>
        <div className="md-heading"><div><p className="md-eyebrow">USER HISTORY</p><h1>{displayedUser.name}</h1><p className="md-subtitle">Login ID: {displayedUser.loginId} · {displayedUser.status}</p></div><button type="button" className="md-action" onClick={() => setSelectedUserId('')}>← Users</button></div>
        <div className="md-stats"><div className="md-stat"><span>User wallet</span><strong>{formatAmount(displayedUser.wallet)}</strong></div><div className="md-stat"><span>Account status</span><strong>{displayedUser.status}</strong></div><div className="md-stat"><span>Matches</span><strong>{displayedUser.games?.length || 0}</strong></div></div>
        <section className="md-card"><div className="md-card-head"><h2>Wallet ledger</h2><span>Deposits, withdrawals, bets, wins and fees</span></div><div className="md-table-wrap"><table className="md-table"><thead><tr><th>Type</th><th>Amount</th><th>Balance after</th><th>Note</th><th>Date</th></tr></thead><tbody>
          {(displayedUser.ledger || []).map((entry) => <tr key={entry.id}><td>{entry.type}</td><td>{formatAmount(entry.amount)}</td><td>{formatAmount(entry.balanceAfter)}</td><td>{entry.note}</td><td>{entry.date}</td></tr>)}
          {!displayedUser.ledger?.length && <tr><td className="md-empty" colSpan="5">No wallet transactions.</td></tr>}
        </tbody></table></div></section>
        <section className="md-card"><div className="md-card-head"><h2>Match history</h2><span>Finished results are read-only</span></div><div className="md-table-wrap"><table className="md-table"><thead><tr><th>Match ID</th><th>Players</th><th>Bet</th><th>Fee</th><th>Result</th><th>Payout</th><th>Date</th></tr></thead><tbody>
          {(displayedUser.games || []).map((match) => <tr key={match.id}><td><strong>{match.id}</strong></td><td>{match.players}</td><td>{formatAmount(match.bet)}</td><td>{formatAmount(match.fee)}</td><td>{match.status === 'Live' ? 'In progress' : match.result}</td><td>{formatAmount(match.payout)}</td><td>{match.date}</td></tr>)}
          {!displayedUser.games?.length && <tr><td className="md-empty" colSpan="7">No match history yet.</td></tr>}
        </tbody></table></div></section>
      </>
    );
  }

  return (
    <>
      <div className="md-heading"><div><p className="md-eyebrow">YOUR ACCOUNTS</p><h1>Users</h1><p className="md-subtitle">Only users managed by your Master account are shown here.</p></div><button type="button" className="md-primary" disabled={master.status !== 'Active'} onClick={() => openDialog('create-user')}>+ Create user</button></div>
      <section className="md-card"><div className="md-card-head"><h2>Managed users</h2><span>{users.length} accounts · live data</span></div><div className="md-table-wrap"><table className="md-table"><thead><tr><th>User</th><th>Login ID</th><th>Status</th><th>Wallet</th><th>Last played</th><th>Created</th><th>Actions</th></tr></thead><tbody>
        {users.map((user) => <tr key={user.id}>
          <td><div className="md-user"><span className="md-user-avatar">{initials(user.name)}</span><span className="md-user-copy"><strong>{user.name}</strong><span>{user.phone || 'No phone'}</span></span></div></td>
          <td>{user.loginId}</td><td><span className={`md-status ${user.status.toLowerCase()}`}>{user.status}</span></td><td><span className="md-wallet">{formatAmount(user.wallet)}</span></td><td>{user.lastPlayed}</td><td>{user.createdAt}</td>
          <td><MasterRowActions label={`Actions for ${user.name}`} actions={[
            { label: 'Deposit', tone: 'primary', disabled: master.status !== 'Active' || user.status === 'Blocked', onSelect: () => openDialog('user-deposit', user) },
            { label: 'Withdraw', disabled: master.status !== 'Active' || user.status === 'Blocked' || availableUserBalance(user) <= 0, onSelect: () => openDialog('user-withdraw', user) },
            ...(user.status !== 'Blocked' ? [{ label: `Set ${user.status === 'Active' ? 'inactive' : 'active'}`, disabled: master.status !== 'Active' || user.gameState === 'Playing', onSelect: () => changeUserStatus(user, user.status === 'Active' ? 'INACTIVE' : 'ACTIVE') }] : []),
            { label: user.status === 'Blocked' ? 'Unblock' : 'Block', tone: user.status === 'Blocked' ? '' : 'danger', disabled: master.status !== 'Active' || user.gameState === 'Playing', onSelect: () => toggleBlock(user) },
            { label: 'Edit', disabled: master.status !== 'Active' || user.status === 'Blocked', onSelect: () => openDialog('edit-user', user) },
            { label: 'View history', onSelect: () => setSelectedUserId(user.id) },
          ]} /></td>
        </tr>)}
        {!users.length && <tr><td className="md-empty" colSpan="7">No users yet. Create a user to get started.</td></tr>}
      </tbody></table></div></section>
    </>
  );
}
