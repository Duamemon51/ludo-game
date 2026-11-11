import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminRequest } from '../adminApi';
import DashboardHeader from './DashboardHeader';
import DashboardSidebar from './DashboardSidebar';
import SuperAdminPageContent from '../pages/super-admin/SuperAdminPageContent';
import './SuperAdminDashboard.css';

const initialSettings = { minimumBet: 300, feePercent: 10, tournamentEnabled: true, tournamentEntry: 300 };
const navItems = ['Dashboard', 'Masters', 'Wallet requests', 'Users', 'All matches', 'Money overview', 'Audit log', 'Settings'];
const money = (value) => `${Number(value || 0).toLocaleString()} credits`;
const initials = (value) => value.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();

function SuperAdminDashboard({ token, onSignOut }) {
  const [page, setPage] = useState('Dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((open) => !open), []);
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [masters, setMasters] = useState([]);
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [audit, setAudit] = useState([]);
  const [dashboardStats, setDashboardStats] = useState({});
  const [moneyStats, setMoneyStats] = useState({});
  const [settings, setSettings] = useState(initialSettings);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [selectedUsersMasterId, setSelectedUsersMasterId] = useState('');
  const [dialog, setDialog] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshData = useCallback(async (authToken = token) => {
    setLoading(true);
    setLoadError('');
    try {
      const [dashboard, masterRows, withdrawalRows, userRows, matchRows, auditRows, settingRows, moneyRows, profile] = await Promise.all([
        adminRequest('/dashboard', { token: authToken }),
        adminRequest('/masters', { token: authToken }),
        adminRequest('/withdrawals', { token: authToken }),
        adminRequest('/users', { token: authToken }),
        adminRequest('/matches', { token: authToken }),
        adminRequest('/audit', { token: authToken }),
        adminRequest('/settings', { token: authToken }),
        adminRequest('/money', { token: authToken }),
        adminRequest('/auth/me', { token: authToken }),
      ]);
      const expandedMaster = detailId
        ? await adminRequest(`/masters/${detailId}`, { token: authToken })
        : null;
      setDashboardStats(dashboard);
      setMasters(masterRows);
      setDetailData(expandedMaster);
      setRequests(withdrawalRows);
      setUsers(userRows);
      setMatches(matchRows);
      setAudit(auditRows);
      setSettings(settingRows);
      setMoneyStats(moneyRows);
      setAdmin(profile.admin);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, [token, detailId]);

  useEffect(() => {
    if (token) refreshData(token);
  }, [token, refreshData]);

  useEffect(() => {
    const expireSession = () => {
      onSignOut();
    };
    window.addEventListener('superadmin:unauthorized', expireSession);
    return () => window.removeEventListener('superadmin:unauthorized', expireSession);
  }, [onSignOut]);

  const signOut = async () => {
    onSignOut();
    setAdmin(null);
    setDetailId(null);
    setDetailData(null);
    setMasters([]);
    setRequests([]);
    setUsers([]);
    setMatches([]);
    setAudit([]);
    setDetailId(null);
  };

  const detailMaster = detailData?.id === detailId ? detailData : null;
  const dialogMaster = dialog?.masterId ? masters.find((master) => master.id === dialog.masterId) : null;

  const openDialog = (action, master = null, request = null, decision = null) => {
    setDialog({ action, masterId: master?.id || request?.masterId || null, requestId: request?.id || null, decision });
    setForm({
      name: master?.name || '',
      loginId: master?.loginId || '',
      phone: master?.phone || '',
      startingBalance: '',
      amount: '',
      reason: '',
      password: '',
    });
    setError('');
  };

  const closeDialog = () => {
    setDialog(null);
    setError('');
  };

  const openMasterDetails = async (masterId) => {
    setDetailId(masterId);
    setDetailData(null);
    try {
      const details = await adminRequest(`/masters/${masterId}`, { token });
      setDetailData(details);
    } catch (requestError) {
      setNotice(requestError.message);
    }
  };

  const submitDialog = async (event) => {
    event.preventDefault();
    setError('');
    const value = Number(form.amount);

    try {
      if (dialog.action === 'create-master') {
        await adminRequest('/masters', {
          token,
          method: 'POST',
          body: {
            name: form.name,
            loginId: form.loginId,
            password: form.password,
            phone: form.phone,
            startingBalance: form.startingBalance || 0,
            reason: form.reason || 'Starting balance',
          },
        });
        setNotice('Master created.');
      } else if (dialog.action === 'edit-master') {
        await adminRequest(`/masters/${dialogMaster.id}`, {
          token,
          method: 'PATCH',
          body: { name: form.name, loginId: form.loginId, phone: form.phone },
        });
        setNotice('Master details saved.');
      } else if (dialog.action === 'resolve-request') {
        await adminRequest(`/withdrawals/${dialog.requestId}`, {
          token,
          method: 'PATCH',
          body: { decision: dialog.decision, reason: form.reason },
        });
        setNotice(`${requests.find((request) => request.id === dialog.requestId)?.type || 'Wallet'} request ${dialog.decision.toLowerCase()}.`);
      } else {
        if (!Number.isFinite(value) || value <= 0) {
          setError('Enter an amount greater than zero.');
          return;
        }
        await adminRequest(`/masters/${dialogMaster.id}/wallet`, {
          token,
          method: 'POST',
          body: { type: dialog.action, amount: value, reason: form.reason },
        });
        setNotice(`Master wallet ${dialog.action === 'add' ? 'credited' : 'debited'}.`);
      }
      closeDialog();
      await refreshData();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const toggleMaster = async (master) => {
    const status = master.status === 'Active' ? 'BLOCKED' : 'ACTIVE';
    try {
      await adminRequest(`/masters/${master.id}/status`, { token, method: 'PATCH', body: { status } });
      setNotice(`${master.name} ${status === 'BLOCKED' ? 'blocked' : 'unblocked'}.`);
      await refreshData();
    } catch (requestError) {
      setNotice(requestError.message);
    }
  };

  const toggleUser = async (user) => {
    const action = user.status === 'Blocked' ? 'unblock' : 'block';
    try {
      await adminRequest(`/users/${user.id}/status`, { token, method: 'PATCH', body: { action } });
      setNotice(`${user.name} ${action === 'block' ? 'blocked' : 'unblocked'}.`);
      await refreshData();
    } catch (requestError) {
      setNotice(requestError.message);
    }
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      const saved = await adminRequest('/settings', { token, method: 'PUT', body: settings });
      setSettings(saved);
      setNotice('Platform settings saved.');
    } catch (requestError) {
      setNotice(requestError.message);
    } finally {
      setSettingsSaving(false);
    }
  };

  const filteredMatches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return matches;
    return matches.filter((match) => {
      const master = masters.find((item) => item.id === match.masterId);
      return [match.id, match.users.join(' '), match.masterName || master?.name, match.winner]
        .some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [matches, masters, search]);

  const selectedUsersMaster = masters.find((master) => master.id === selectedUsersMasterId);
  const selectedMasterUsers = users.filter((user) => user.masterId === selectedUsersMasterId);
  const pendingCount = requests.filter((request) => request.status === 'Pending').length;
  const totalUsers = users.length;
  const totalHeld = moneyStats.totalHeld || 0;
  const feeToday = dashboardStats.platformFeeToday || 0;
  const matchesToday = dashboardStats.matchesToday || 0;
  const createChartPoints = (key) => {
    const values = dashboardStats.chart?.map((row) => row[key]) || [];
    if (!values.length || values.every((value) => value === 0)) return '';
    const max = Math.max(...values, 1);
    return values.map((value, index) => {
      const x = 10 + (index * 540) / Math.max(values.length - 1, 1);
      const y = 134 - (Number(value) / max) * 112;
      return `${x},${y}`;
    }).join(' ');
  };

  if (!admin) {
    return (
      <main className="sa-loading">
        <div>
          <p>{loadError || 'Loading Super Admin dashboard…'}</p>
          {loadError && <button type="button" className="sa-logout" onClick={() => refreshData()}>Retry</button>}
          <button type="button" className="sa-logout" onClick={signOut}>Sign out</button>
        </div>
      </main>
    );
  }

  return (
    <main className="sa-dashboard">

      <DashboardSidebar
        variant="superadmin"
        open={sidebarOpen}
        onClose={closeSidebar}
        brandSubtitle="SUPER ADMIN"
        sectionLabel="Administration"
        ariaLabel="Super Admin navigation"
        activeItem={page}
        navItems={navItems.map((label, index) => ({
          label,
          icon: ['dashboard', 'masters', 'requests', 'users', 'matches', 'money', 'audit', 'settings'][index],
          count: label === 'Wallet requests' ? pendingCount : 0,
        }))}
        onNavigate={(item) => {
          setPage(item);
          setNotice('');
          setDetailId(null);
        }}
      />

      <section className="sa-main">
        <DashboardHeader
          variant="superAdmin"
          breadcrumb="Super Admin"
          accountName={admin?.name}
          avatarText={initials(admin?.name || 'Super Admin')}
          avatarLabel="Super Admin"
          onProfile={() => {
            setPage('Settings');
            setSidebarOpen(false);
          }}
          onSignOut={signOut}
          menuOpen={sidebarOpen}
          onMenuToggle={toggleSidebar}
        />

        <div className="sa-content">
          {notice && <div className="sa-notice" role="status">{notice}</div>}
          {loadError && <div className="sa-notice" role="alert">{loadError} <button type="button" className="sa-action" onClick={() => refreshData()}>Retry</button></div>}
          {loading && <div className="sa-notice" role="status">Refreshing dashboard data…</div>}

          <SuperAdminPageContent
            page={page}
            dashboardStats={dashboardStats}
            totalUsers={totalUsers}
            matchesToday={matchesToday}
            feeToday={feeToday}
            pendingCount={pendingCount}
            requests={requests}
            masters={masters}
            moneyStats={moneyStats}
            totalHeld={totalHeld}
            money={money}
            createChartPoints={createChartPoints}
            onNavigate={setPage}
            detailMaster={detailMaster}
            initials={initials}
            onOpenDialog={openDialog}
            onToggleMaster={toggleMaster}
            onOpenMasterDetails={openMasterDetails}
            onToggleUser={toggleUser}
            onBackToMasters={() => setDetailId(null)}
            selectedMasterId={selectedUsersMasterId}
            onSelectMaster={setSelectedUsersMasterId}
            selectedMaster={selectedUsersMaster}
            selectedMasterUsers={selectedMasterUsers}
            search={search}
            onSearchChange={setSearch}
            filteredMatches={filteredMatches}
            audit={audit}
            settings={settings}
            setSettings={setSettings}
            settingsSaving={settingsSaving}
            onSaveSettings={saveSettings}
          />
        </div>
      </section>

      {dialog && (
        <div className="sa-form-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <form className="sa-form" onSubmit={submitDialog} aria-labelledby="sa-form-title">
            <h2 id="sa-form-title">
              {dialog.action === 'create-master' ? 'Create Master' :
                dialog.action === 'edit-master' ? 'Edit Master' :
                  dialog.action === 'add' ? `Add balance · ${dialogMaster?.name}` :
                    dialog.action === 'deduct' ? `Deduct balance · ${dialogMaster?.name}` :
                      `${dialog.decision} ${requests.find((request) => request.id === dialog.requestId)?.type?.toLowerCase() || 'wallet'} request`}
            </h2>
            <p>{dialog.action === 'resolve-request' ? dialog.decision === 'Rejected' ? 'A rejection reason is required and will appear in the request history.' : requests.find((request) => request.id === dialog.requestId)?.type === 'Deposit' ? 'Approve this request to credit the amount to the Master wallet.' : 'Approve this request to deduct the amount from the Master wallet.' : 'UI preview only. Changes are temporary and no real money is moved.'}</p>
            {dialog.action === 'create-master' || dialog.action === 'edit-master' ? (
              <div className="sa-form-fields">
                <label>Name<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={70} required autoFocus /></label>
                <label>Login ID<input value={form.loginId} onChange={(event) => setForm((current) => ({ ...current, loginId: event.target.value }))} maxLength={50} required /></label>
                {dialog.action === 'create-master' && <label>Password<input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required minLength={8} maxLength={200} autoComplete="new-password" /></label>}
                <label>Phone (optional)<input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} maxLength={30} /></label>
                {dialog.action === 'create-master' && <label>Starting balance<input type="number" min="0" step="0.01" value={form.startingBalance} onChange={(event) => setForm((current) => ({ ...current, startingBalance: event.target.value }))} /></label>}
                {dialog.action === 'create-master' && <label>Reason / note<input value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Optional opening balance note" /></label>}
              </div>
            ) : dialog.action === 'resolve-request' ? (
              <div className="sa-form-fields"><label>{dialog.decision === 'Rejected' ? 'Rejection reason' : 'Note (optional)'}<textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} required={dialog.decision === 'Rejected'} maxLength={500} autoFocus /></label></div>
            ) : (
              <div className="sa-form-fields">
                <label>Amount<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} required autoFocus /></label>
                <label>Reason / note<textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} required maxLength={500} /></label>
              </div>
            )}
            {error && <p className="sa-form-error" role="alert">{error}</p>}
            <div className="sa-form-actions"><button type="button" onClick={closeDialog}>Cancel</button><button type="submit">{dialog.action === 'create-master' ? 'Create Master' : dialog.action === 'edit-master' ? 'Save changes' : dialog.action === 'resolve-request' ? dialog.decision : 'Confirm'}</button></div>
          </form>
        </div>
      )}
    </main>
  );
}

export default SuperAdminDashboard;
