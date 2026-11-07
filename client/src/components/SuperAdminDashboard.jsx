import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminRequest } from '../adminApi';

const initialSettings = { minimumBet: 300, feePercent: 10, tournamentEnabled: true, tournamentEntry: 300 };
const navItems = ['Dashboard', 'Masters', 'Wallet requests', 'Users', 'All matches', 'Money overview', 'Audit log', 'Settings'];
const money = (value) => `${Number(value || 0).toLocaleString()} credits`;
const initials = (value) => value.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
const todayLabel = new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date());

function SuperAdminDashboard({ token, onSignOut }) {
  const [page, setPage] = useState('Dashboard');
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
      <style>{`
        .sa-dashboard {
          --sa-ink: #172033; --sa-muted: #8290a5; --sa-line: #e9edf4; --sa-blue: #536dfe;
          width: 100%; min-height: 100vh; min-height: 100dvh; display: flex;
          color: var(--sa-ink); background: #f5f7fb;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        }
        .sa-sidebar { width: 238px; flex: 0 0 238px; display: flex; flex-direction: column; padding: 23px 14px 16px; color: #d7dced; background: #151a2d; }
        .sa-brand { display: flex; align-items: center; gap: 10px; padding: 0 8px 26px; }
        .sa-brand-mark { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 11px; color: #fff; background: linear-gradient(145deg, #7a8cff, #4c5ee8); font-weight: 900; box-shadow: 0 5px 14px #536dfe59; }
        .sa-brand-title { color: #fff; font-size: 15px; font-weight: 850; letter-spacing: .5px; }
        .sa-brand-subtitle { margin-top: 2px; color: #8e98b1; font-size: 9px; font-weight: 750; letter-spacing: 1.4px; }
        .sa-nav-label { padding: 0 11px 9px; color: #78829c; font-size: 9px; font-weight: 850; letter-spacing: 1.4px; text-transform: uppercase; }
        .sa-nav { display: grid; gap: 4px; }
        .sa-nav button { width: 100%; min-height: 39px; display: flex; align-items: center; gap: 10px; padding: 0 10px; border: 0; border-radius: 9px; color: #aab3c9; background: transparent; text-align: left; font: inherit; font-size: 11px; font-weight: 680; cursor: pointer; }
        .sa-nav button:hover { color: #fff; background: #ffffff10; }
        .sa-nav button.selected { color: #fff; background: #293253; box-shadow: inset 3px 0 #8290ff; }
        .sa-nav-icon { width: 23px; height: 23px; display: grid; place-items: center; border-radius: 7px; color: #abb8ff; background: #8290ff20; font-size: 8px; font-weight: 900; }
        .sa-sidebar-foot { margin-top: auto; padding: 12px 9px 0; color: #7f8aa4; font-size: 9px; line-height: 1.55; }
        .sa-sidebar-foot strong { color: #dce2f1; }
        .sa-main { min-width: 0; flex: 1; }
        .sa-topbar { min-height: 65px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 28px; border-bottom: 1px solid var(--sa-line); background: #fff; }
        .sa-breadcrumb { color: var(--sa-muted); font-size: 11px; }
        .sa-breadcrumb strong { color: #29364c; }
        .sa-topright { display: flex; align-items: center; gap: 10px; }
        .sa-private { padding: 6px 9px; border: 1px solid #e8eaff; border-radius: 999px; color: #596be8; background: #f4f5ff; font-size: 9px; font-weight: 800; }
        .sa-avatar { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; color: #fff; background: linear-gradient(145deg, #ffbd72, #f07958); font-size: 10px; font-weight: 850; }
        .sa-logout { border: 1px solid #e4e8f0; border-radius: 8px; padding: 7px 10px; color: #53617a; background: #fff; font: inherit; font-size: 10px; font-weight: 750; cursor: pointer; }
        .sa-loading { min-height: 100vh; display: grid; place-items: center; color: #53617a; background: #f5f7fb; font: 600 14px system-ui, sans-serif; }
        .sa-content { width: min(100%, 1500px); margin: 0 auto; padding: 26px 28px 40px; }
        .sa-notice { margin-bottom: 14px; padding: 10px 12px; border: 1px solid #ccecdf; border-radius: 9px; color: #187c60; background: #effaf5; font-size: 10px; font-weight: 750; }
        .sa-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-bottom: 18px; }
        .sa-eyebrow { margin: 0 0 6px; color: #7383ff; font-size: 9px; font-weight: 850; letter-spacing: 1.5px; text-transform: uppercase; }
        .sa-heading h1 { margin: 0; font-size: clamp(22px, 2.8vw, 28px); letter-spacing: -.7px; }
        .sa-subtitle { margin: 6px 0 0; color: var(--sa-muted); font-size: 11px; }
        .sa-primary { min-height: 35px; padding: 0 11px; border: 1px solid var(--sa-blue); border-radius: 8px; color: #fff; background: var(--sa-blue); font: inherit; font-size: 10px; font-weight: 750; cursor: pointer; }
        .sa-primary:hover { background: #4058ed; }
        .sa-primary:disabled { opacity: .48; cursor: not-allowed; }
        .sa-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .sa-stat { min-width: 0; padding: 15px; border: 1px solid var(--sa-line); border-radius: 12px; background: #fff; box-shadow: 0 3px 12px #1a274608; }
        .sa-stat-label { color: var(--sa-muted); font-size: 10px; font-weight: 650; }
        .sa-stat-value { margin-top: 8px; color: #26334a; font-size: 21px; font-weight: 850; letter-spacing: -.5px; }
        .sa-stat-note { margin-top: 4px; color: #99a3b3; font-size: 9px; }
        .sa-grid-two { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(260px, .8fr); gap: 14px; margin-top: 14px; }
        .sa-card { min-width: 0; border: 1px solid var(--sa-line); border-radius: 12px; background: #fff; box-shadow: 0 3px 12px #1a274608; }
        .sa-card + .sa-card { margin-top: 14px; }
        .sa-card-head { min-height: 54px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 15px; border-bottom: 1px solid #f0f2f7; }
        .sa-card-head h2 { margin: 0; color: #26334a; font-size: 12px; font-weight: 800; }
        .sa-card-head span { color: var(--sa-muted); font-size: 9px; }
        .sa-chart-wrap { padding: 12px 15px 13px; }
        .sa-chart { width: 100%; height: 150px; }
        .sa-chart-grid { stroke: #edf0f6; stroke-width: 1; }
        .sa-chart-matches { fill: none; stroke: #6879f4; stroke-width: 2.8; stroke-linecap: round; stroke-linejoin: round; }
        .sa-chart-fee { fill: none; stroke: #18a77b; stroke-width: 2.8; stroke-linecap: round; stroke-linejoin: round; }
        .sa-chart-legend { display: flex; gap: 14px; color: #8995a8; font-size: 9px; }
        .sa-chart-legend span { display: inline-flex; align-items: center; gap: 5px; }
        .sa-legend-dot { width: 7px; height: 7px; border-radius: 50%; background: #6879f4; }
        .sa-legend-dot.fee { background: #18a77b; }
        .sa-summary-list { display: grid; padding: 5px 15px; }
        .sa-summary-row { min-height: 47px; display: flex; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 1px solid #f1f3f7; font-size: 10px; }
        .sa-summary-row:last-child { border-bottom: 0; }
        .sa-summary-row span { color: var(--sa-muted); }
        .sa-summary-row strong { color: #303e54; font-size: 10px; }
        .sa-table-wrap { overflow-x: auto; }
        .sa-table { width: 100%; border-collapse: collapse; text-align: left; }
        .sa-table th { padding: 10px 13px; color: #929db0; background: #fbfcfe; font-size: 8px; font-weight: 850; letter-spacing: .65px; text-transform: uppercase; white-space: nowrap; }
        .sa-table td { padding: 11px 13px; border-top: 1px solid #f1f3f7; color: #58647a; font-size: 9px; white-space: nowrap; }
        .sa-person { display: flex; align-items: center; gap: 7px; }
        .sa-person-avatar { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 8px; color: #fff; background: linear-gradient(145deg, #82a6ff, #5269ef); font-size: 8px; font-weight: 850; }
        .sa-person-copy strong { display: block; color: #38445a; font-size: 9px; }
        .sa-person-copy span { display: block; margin-top: 2px; color: #9aa4b4; font-size: 8px; }
        .sa-status { display: inline-flex; align-items: center; gap: 5px; padding: 4px 7px; border-radius: 999px; color: #15956e; background: #eaf8f2; font-size: 8px; font-weight: 850; }
        .sa-status::before { width: 5px; height: 5px; border-radius: 50%; background: currentColor; content: ""; }
        .sa-status.blocked, .sa-status.pending, .sa-status.rejected, .sa-status.lost { color: #bd4756; background: #fff0f1; }
        .sa-status.inactive { color: #b2782d; background: #fff5e6; }
        .sa-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; }
        .sa-action { min-height: 28px; padding: 0 8px; border: 1px solid #dfe4ee; border-radius: 7px; color: #5e6b82; background: #fff; font: inherit; font-size: 8px; font-weight: 750; cursor: pointer; }
        .sa-action:hover { background: #f7f8fc; }
        .sa-action.primary { color: #4e62e8; border-color: #dce1ff; background: #f6f7ff; }
        .sa-action.danger { color: #bd4756; border-color: #f2d5d9; }
        .sa-action:disabled { opacity: .45; cursor: not-allowed; }
        .sa-search { min-height: 34px; width: min(100%, 340px); padding: 0 10px; border: 1px solid #dfe4ee; border-radius: 8px; color: #27344a; background: #fff; font: inherit; font-size: 10px; }
        .sa-search:focus, .sa-form input:focus, .sa-form textarea:focus, .sa-form select:focus { border-color: #7181ff; outline: 3px solid #e9ecff; }
        .sa-empty { padding: 22px !important; color: #8995a8 !important; text-align: center; }
        .sa-subtabs { display: flex; gap: 5px; margin-bottom: 13px; padding: 4px; border: 1px solid var(--sa-line); border-radius: 9px; background: #fff; }
        .sa-subtabs button { min-height: 31px; padding: 0 11px; border: 0; border-radius: 7px; color: #68758a; background: transparent; font: inherit; font-size: 9px; font-weight: 750; cursor: pointer; }
        .sa-subtabs button.selected { color: #4e62e8; background: #eff1ff; }
        .sa-balance-row { display: flex; flex-wrap: wrap; gap: 12px 24px; padding: 15px; border-bottom: 1px solid #f0f2f7; }
        .sa-balance-row span { display: block; color: #8b97aa; font-size: 9px; }
        .sa-balance-row strong { display: block; margin-top: 5px; color: #29364c; font-size: 16px; }
        .sa-form-backdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 17px; background: #0f16208c; }
        .sa-form { width: min(100%, 430px); max-height: min(90dvh, 760px); overflow-y: auto; padding: 21px; border: 1px solid var(--sa-line); border-radius: 15px; background: #fff; box-shadow: 0 24px 70px #0a122047; }
        .sa-form h2 { margin: 0; color: #202b40; font-size: 17px; }
        .sa-form > p { margin: 6px 0 16px; color: #8290a5; font-size: 10px; line-height: 1.5; }
        .sa-form-fields { display: grid; gap: 10px; }
        .sa-form label { display: grid; gap: 5px; color: #526078; font-size: 9px; font-weight: 750; }
        .sa-form input, .sa-form textarea, .sa-form select { min-height: 38px; width: 100%; padding: 8px 10px; border: 1px solid #dfe4ee; border-radius: 8px; color: #27344a; background: #fff; font: inherit; font-size: 11px; }
        .sa-form textarea { min-height: 74px; resize: vertical; }
        .sa-form-error { margin: 10px 0 0 !important; color: #bc4351 !important; }
        .sa-form-actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 18px; }
        .sa-form-actions button { min-height: 35px; padding: 0 11px; border: 1px solid #dfe4ee; border-radius: 8px; color: #647087; background: #fff; font: inherit; font-size: 9px; font-weight: 750; cursor: pointer; }
        .sa-form-actions button[type="submit"] { color: #fff; border-color: var(--sa-blue); background: var(--sa-blue); }
        .sa-settings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 15px; }
        .sa-settings-card { padding: 15px; border: 1px solid var(--sa-line); border-radius: 10px; background: #fff; }
        .sa-settings-card h2 { margin: 0 0 12px; font-size: 12px; }
        .sa-switch-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 0; border-top: 1px solid #f1f3f7; color: #657187; font-size: 10px; }
        .sa-switch-row input { width: 16px; height: 16px; accent-color: var(--sa-blue); }
        @media (max-width: 1050px) { .sa-sidebar { width: 205px; flex-basis: 205px; } .sa-content { padding-right: 20px; padding-left: 20px; } .sa-topbar { padding-right: 20px; padding-left: 20px; } .sa-table th, .sa-table td { padding-right: 10px; padding-left: 10px; } }
        @media (max-width: 760px) {
          .sa-dashboard { flex-direction: column; }
          .sa-sidebar { width: 100%; flex: none; padding: 11px 13px; }
          .sa-brand { padding: 0 3px 10px; }
          .sa-brand-mark { width: 31px; height: 31px; }
          .sa-nav-label, .sa-sidebar-foot { display: none; }
          .sa-nav { display: flex; overflow-x: auto; gap: 4px; }
          .sa-nav button { width: auto; min-height: 36px; flex: 0 0 auto; gap: 6px; padding: 0 8px; font-size: 9px; }
          .sa-nav-icon { width: 21px; height: 21px; }
          .sa-topbar { min-height: 52px; padding: 0 12px; }
          .sa-content { padding: 19px 12px 28px; }
          .sa-grid-two { grid-template-columns: 1fr; }
          .sa-stats { gap: 8px; }
          .sa-stat { padding: 11px; }
          .sa-stat-value { font-size: 17px; }
          .sa-settings { grid-template-columns: 1fr; }
          .sa-heading { align-items: flex-start; }
        }
        @media (max-width: 430px) { .sa-private { display: none; } .sa-content { padding-right: 9px; padding-left: 9px; } .sa-table th, .sa-table td { padding-right: 9px; padding-left: 9px; } .sa-heading { flex-direction: column; } }
      `}</style>

      <aside className="sa-sidebar">
        <div className="sa-brand">
          <div className="sa-brand-mark">L</div>
          <div><div className="sa-brand-title">LUDO</div><div className="sa-brand-subtitle">SUPER ADMIN</div></div>
        </div>
        <div className="sa-nav-label">Administration</div>
        <nav className="sa-nav" aria-label="Super Admin navigation">
          {navItems.map((item, index) => (
            <button key={item} type="button" className={page === item ? 'selected' : ''} aria-current={page === item ? 'page' : undefined} onClick={() => { setPage(item); setNotice(''); setDetailId(null); }}>
              <span className="sa-nav-icon" aria-hidden="true">{['DB', 'MA', 'WR', 'US', 'GM', '₿', 'AL', 'ST'][index]}</span>{item}
              {item === 'Wallet requests' && pendingCount > 0 && <span style={{ marginLeft: 'auto', color: '#ffc476' }}>{pendingCount}</span>}
            </button>
          ))}
        </nav>
        <div className="sa-sidebar-foot"><strong>Owner account</strong><br />Single Super Admin · secured API</div>
      </aside>

      <section className="sa-main">
        <header className="sa-topbar">
          <div className="sa-breadcrumb">LUDO / Super Admin / <strong>{detailMaster ? detailMaster.name : page}</strong></div>
          <div className="sa-topright"><span className="sa-private">{admin?.name || 'Super Admin'}</span><button type="button" className="sa-logout" onClick={signOut}>Sign out</button><div className="sa-avatar" aria-label="Super Admin">SA</div></div>
        </header>

        <div className="sa-content">
          {notice && <div className="sa-notice" role="status">{notice}</div>}
          {loadError && <div className="sa-notice" role="alert">{loadError} <button type="button" className="sa-action" onClick={() => refreshData()}>Retry</button></div>}
          {loading && <div className="sa-notice" role="status">Refreshing dashboard data…</div>}

          {page === 'Dashboard' && (
            <>
              <div className="sa-heading"><div><p className="sa-eyebrow">OWNER OVERVIEW</p><h1>Dashboard</h1><p className="sa-subtitle">Platform activity and money overview · {todayLabel}</p></div></div>
              <div className="sa-stats">
                {[
                  ['Total masters', dashboardStats.totalMasters || 0, `${dashboardStats.activeMasters || 0} active`],
                  ['Active masters', dashboardStats.activeMasters || 0, 'Current status'],
                  ['Total users', totalUsers, 'Across all Masters'],
                  ['Matches today', matchesToday, 'Recorded matches'],
                  ['Platform fee today', money(feeToday), 'Earned today'],
                  ['Pending wallet requests', pendingCount, 'Awaiting your decision'],
                ].map(([label, value, note]) => <article className="sa-stat" key={label}><div className="sa-stat-label">{label}</div><div className="sa-stat-value">{value}</div><div className="sa-stat-note">{note}</div></article>)}
              </div>
              <div className="sa-grid-two">
                <section className="sa-card">
                  <div className="sa-card-head"><h2>Matches and fee income</h2><span>Last 7 days</span></div>
                  <div className="sa-chart-wrap">
                    <svg className="sa-chart" viewBox="0 0 560 155" role="img" aria-label="Daily matches and fee income">
                      {[20, 58, 96, 134].map((y) => <line key={y} className="sa-chart-grid" x1="0" x2="560" y1={y} y2={y} />)}
                      {dashboardStats.chart?.length > 0 && <>
                        <polyline className="sa-chart-matches" points={createChartPoints('matches')} />
                        <polyline className="sa-chart-fee" points={createChartPoints('fee')} />
                      </>}
                    </svg>
                    <div className="sa-chart-legend"><span><i className="sa-legend-dot" />Matches</span><span><i className="sa-legend-dot fee" />Fee income</span></div>
                  </div>
                </section>
                <section className="sa-card">
                  <div className="sa-card-head"><h2>Money overview</h2><span>Credits</span></div>
                  <div className="sa-summary-list">
                    <div className="sa-summary-row"><span>Platform fee earned</span><strong>{money(moneyStats.platformFees)}</strong></div>
                    <div className="sa-summary-row"><span>Total deposits</span><strong>{money(moneyStats.deposits)}</strong></div>
                    <div className="sa-summary-row"><span>Total withdrawals</span><strong>{money(moneyStats.withdrawals)}</strong></div>
                    <div className="sa-summary-row"><span>Balance held in master wallets</span><strong>{money(totalHeld)}</strong></div>
                  </div>
                </section>
              </div>
              <section className="sa-card" style={{ marginTop: 14 }}>
                <div className="sa-card-head"><h2>Recent Master wallet requests</h2><button type="button" className="sa-action primary" onClick={() => setPage('Wallet requests')}>Review all</button></div>
                <div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Master</th><th>Type</th><th>Amount</th><th>Requested</th><th>Wallet balance</th><th>Status</th></tr></thead><tbody>
                  {requests.slice(0, 4).map((request) => <tr key={request.id}><td>{masters.find((master) => master.id === request.masterId)?.name || 'Master'}</td><td>{request.type}</td><td>{money(request.amount)}</td><td>{request.date}</td><td>{money(masters.find((master) => master.id === request.masterId)?.wallet || 0)}</td><td><span className={`sa-status ${request.status.toLowerCase()}`}>{request.status}</span></td></tr>)}
                  {!requests.length && <tr><td className="sa-empty" colSpan="6">No wallet requests.</td></tr>}
                </tbody></table></div>
              </section>
            </>
          )}

          {page === 'Masters' && !detailMaster && (
            <>
              <div className="sa-heading"><div><p className="sa-eyebrow">ACCOUNT MANAGEMENT</p><h1>Masters</h1><p className="sa-subtitle">Create and manage the platform’s Master accounts.</p></div><button type="button" className="sa-primary" onClick={() => openDialog('create-master')}>+ Create Master</button></div>
              <section className="sa-card">
                <div className="sa-card-head"><h2>All Masters</h2><span>{masters.length} accounts</span></div>
                <div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Master</th><th>Login ID</th><th>Status</th><th>Wallet balance</th><th>Users</th><th>Created</th><th>Actions</th></tr></thead><tbody>
                  {masters.map((master) => <tr key={master.id}>
                    <td><div className="sa-person"><span className="sa-person-avatar">{initials(master.name)}</span><span className="sa-person-copy"><strong>{master.name}</strong><span>{master.phone || 'No phone'}</span></span></div></td>
                    <td>{master.loginId}</td><td><span className={`sa-status ${master.status.toLowerCase()}`}>{master.status}</span></td><td><strong>{money(master.wallet)}</strong></td><td>{master.users}</td><td>{master.createdAt}</td>
                    <td><div className="sa-actions">
                      <button type="button" className="sa-action primary" onClick={() => openDialog('add', master)}>Add balance</button>
                      <button type="button" className="sa-action" onClick={() => openDialog('deduct', master)}>Deduct</button>
                      <button type="button" className="sa-action danger" onClick={() => toggleMaster(master)}>{master.status === 'Active' ? 'Block' : 'Unblock'}</button>
                      <button type="button" className="sa-action" onClick={() => openMasterDetails(master.id)}>View details</button>
                      <button type="button" className="sa-action" onClick={() => openDialog('edit-master', master)}>Edit</button>
                    </div></td>
                  </tr>)}
                </tbody></table></div>
              </section>
            </>
          )}

          {page === 'Masters' && detailMaster && (
            <>
              <div className="sa-heading"><div><p className="sa-eyebrow">MASTER DETAILS</p><h1>{detailMaster.name}</h1><p className="sa-subtitle">Login ID: {detailMaster.loginId} · Created {detailMaster.createdAt}</p></div><button type="button" className="sa-action" onClick={() => setDetailId(null)}>← Masters</button></div>
              <div className="sa-stats"><article className="sa-stat"><div className="sa-stat-label">Wallet balance</div><div className="sa-stat-value">{money(detailMaster.wallet)}</div></article><article className="sa-stat"><div className="sa-stat-label">Users</div><div className="sa-stat-value">{detailMaster.users.length}</div></article><article className="sa-stat"><div className="sa-stat-label">Account status</div><div className="sa-stat-value">{detailMaster.status}</div></article></div>
              <section className="sa-card" style={{ marginTop: 14 }}><div className="sa-card-head"><h2>Wallet ledger</h2><span>Credits and debits · latest 200</span></div><div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Type</th><th>Amount</th><th>Balance after</th><th>By</th><th>Reason</th><th>Date</th></tr></thead><tbody>
                {detailMaster.ledger.map((row) => <tr key={row.id}><td>{row.type}</td><td>{money(row.amount)}</td><td>{money(row.balanceAfter)}</td><td>{row.actor}</td><td>{row.reason}</td><td>{row.date}</td></tr>)}
                {!detailMaster.ledger.length && <tr><td colSpan="6" className="sa-empty">No ledger entries yet.</td></tr>}
              </tbody></table></div></section>
              <section className="sa-card"><div className="sa-card-head"><h2>Users under this Master</h2><span>{detailMaster.users.length} users · read-only</span></div><div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>User</th><th>Login ID</th><th>Own status</th><th>Effective access</th><th>Wallet</th><th>Game</th><th>Action</th></tr></thead><tbody>
                {detailMaster.users.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.loginId}</td><td>{user.previousStatus}</td><td><span className={`sa-status ${detailMaster.status === 'Blocked' || user.status === 'Blocked' ? 'blocked' : user.status.toLowerCase()}`}>{detailMaster.status === 'Blocked' || user.status === 'Blocked' ? 'Blocked' : user.status}</span></td><td>{money(user.balance)}</td><td>{user.gameState}</td><td><button type="button" className="sa-action danger" onClick={() => toggleUser(user)}>{user.status === 'Blocked' ? 'Unblock user' : 'Block user'}</button></td></tr>)}
              </tbody></table></div></section>
              <section className="sa-card"><div className="sa-card-head"><h2>Wallet request history</h2></div><div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Request ID</th><th>Type</th><th>Amount</th><th>Date</th><th>Status</th><th>Decision note</th></tr></thead><tbody>
                {requests.filter((request) => request.masterId === detailMaster.id).map((request) => <tr key={request.id}><td>{request.id}</td><td>{request.type}</td><td>{money(request.amount)}</td><td>{request.date}</td><td><span className={`sa-status ${request.status.toLowerCase()}`}>{request.status}</span></td><td>{request.reason || '—'}</td></tr>)}
                {!requests.some((request) => request.masterId === detailMaster.id) && <tr><td colSpan="6" className="sa-empty">No wallet requests.</td></tr>}
              </tbody></table></div></section>
            </>
          )}

          {page === 'Wallet requests' && (
            <>
              <div className="sa-heading"><div><p className="sa-eyebrow">MASTER WALLETS</p><h1>Master wallet requests</h1><p className="sa-subtitle">Approve deposits to credit a Master or withdrawals to debit their wallet.</p></div></div>
              <section className="sa-card"><div className="sa-card-head"><h2>All requests</h2><span>{pendingCount} pending</span></div><div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Request ID</th><th>Master</th><th>Type</th><th>Amount</th><th>Requested date</th><th>Current wallet</th><th>Status</th><th>Decision</th></tr></thead><tbody>
                {requests.map((request) => {
                  const master = masters.find((item) => item.id === request.masterId);
                  return <tr key={request.id}><td>{request.id}</td><td>{master?.name || 'Master'}</td><td>{request.type}</td><td><strong>{money(request.amount)}</strong></td><td>{request.date}</td><td>{money(master?.wallet || 0)}</td><td><span className={`sa-status ${request.status.toLowerCase()}`}>{request.status}</span></td><td>{request.status === 'Pending' ? <div className="sa-actions"><button type="button" className="sa-action primary" onClick={() => openDialog('resolve-request', master, request, 'Approved')}>Approve</button><button type="button" className="sa-action danger" onClick={() => openDialog('resolve-request', master, request, 'Rejected')}>Reject</button></div> : <span>{request.reason || 'Reviewed'}</span>}</td></tr>;
                })}
                {!requests.length && <tr><td colSpan="8" className="sa-empty">No wallet requests yet.</td></tr>}
              </tbody></table></div></section>
            </>
          )}

          {page === 'Users' && (
            <>
              <div className="sa-heading"><div><p className="sa-eyebrow">PLATFORM ACCOUNTS</p><h1>Users by Master</h1><p className="sa-subtitle">Select a Master to view and manage their users.</p></div>
                <label style={{ display: 'grid', gap: 5, color: '#526078', fontSize: 10, fontWeight: 750 }}>
                  Select Master
                  <select className="sa-search" aria-label="Select Master" value={selectedUsersMasterId} onChange={(event) => setSelectedUsersMasterId(event.target.value)}>
                    <option value="">Choose a Master</option>
                    {masters.map((master) => <option key={master.id} value={master.id}>{master.name} ({master.loginId})</option>)}
                  </select>
                </label>
              </div>
              <section className="sa-card"><div className="sa-card-head"><h2>{selectedUsersMaster ? `${selectedUsersMaster.name}'s users` : 'Master users'}</h2><span>{selectedUsersMaster ? `${selectedMasterUsers.length} users · read-only profile` : `${totalUsers} users across all Masters`}</span></div><div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>User</th><th>Master</th><th>Own status</th><th>Effective status</th><th>Wallet</th><th>Game</th><th>Action</th></tr></thead><tbody>
                {!selectedUsersMasterId && <tr><td className="sa-empty" colSpan="7">Select a Master to see their users.</td></tr>}
                {selectedMasterUsers.map((user) => <tr key={user.id}><td>{user.name}<br /><span style={{ color: '#9aa4b4' }}>{user.loginId}</span></td><td>{user.masterName}</td><td>{user.previousStatus}</td><td><span className={`sa-status ${user.effectiveStatus.toLowerCase()}`}>{user.effectiveStatus}</span></td><td>{money(user.balance)}</td><td>{user.gameState}</td><td><button type="button" className="sa-action danger" onClick={() => toggleUser(user)}>{user.status === 'Blocked' ? 'Unblock' : 'Block user'}</button></td></tr>)}
                {selectedUsersMasterId && !selectedMasterUsers.length && <tr><td className="sa-empty" colSpan="7">This Master has no users yet.</td></tr>}
              </tbody></table></div></section>
            </>
          )}

          {page === 'All matches' && (
            <>
              <div className="sa-heading"><div><p className="sa-eyebrow">GAME OVERSIGHT</p><h1>All matches</h1><p className="sa-subtitle">Search by match ID, user or Master.</p></div><input className="sa-search" aria-label="Search matches" placeholder="Search match, user or master..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
              <section className="sa-card"><div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Match ID</th><th>Master</th><th>Players</th><th>Bet</th><th>Platform fee</th><th>Payout</th><th>Winner</th><th>Result</th><th>Time</th></tr></thead><tbody>
                {filteredMatches.map((match) => <tr key={match.id}><td>{match.id}</td><td>{match.masterName}</td><td>{match.users.join(', ')}</td><td>{money(match.bet)}</td><td>{money(match.fee)}</td><td>{money(match.payout)}</td><td>{match.winner || '—'}</td><td>{match.result}</td><td>{match.date}</td></tr>)}
                {!filteredMatches.length && <tr><td colSpan="9" className="sa-empty">No matches found.</td></tr>}
              </tbody></table></div></section>
            </>
          )}

          {page === 'Money overview' && (
            <>
              <div className="sa-heading"><div><p className="sa-eyebrow">PLATFORM FINANCE</p><h1>Money overview</h1><p className="sa-subtitle">Totals from recorded platform transactions.</p></div></div>
              <div className="sa-stats">
                <article className="sa-stat"><div className="sa-stat-label">Platform fee earned</div><div className="sa-stat-value">{money(moneyStats.platformFees)}</div></article>
                <article className="sa-stat"><div className="sa-stat-label">Total deposits</div><div className="sa-stat-value">{money(moneyStats.deposits)}</div></article>
                <article className="sa-stat"><div className="sa-stat-label">Total withdrawals</div><div className="sa-stat-value">{money(moneyStats.withdrawals)}</div></article>
                <article className="sa-stat"><div className="sa-stat-label">Balance held by Masters</div><div className="sa-stat-value">{money(totalHeld)}</div></article>
              </div>
            </>
          )}

          {page === 'Audit log' && (
            <>
              <div className="sa-heading"><div><p className="sa-eyebrow">ADMIN ACTIVITY</p><h1>Audit log</h1><p className="sa-subtitle">Append-only record of administrative actions.</p></div></div>
              <section className="sa-card"><div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Action ID</th><th>Action</th><th>Actor</th><th>Target</th><th>Details</th><th>Date</th></tr></thead><tbody>
                {audit.map((entry) => <tr key={entry.id}><td>{entry.id}</td><td>{entry.action}</td><td>{entry.actor}</td><td>{entry.target}</td><td>{entry.detail}</td><td>{entry.date}</td></tr>)}
              </tbody></table></div></section>
            </>
          )}

          {page === 'Settings' && (
            <>
              <div className="sa-heading"><div><p className="sa-eyebrow">PLATFORM RULES</p><h1>Settings</h1><p className="sa-subtitle">Configure minimum bet, platform fee and tournament mode.</p></div></div>
              <section className="sa-card"><div className="sa-card-head"><h2>Game settings</h2><span>Stored on the server</span></div>
                <div className="sa-settings">
                  <div className="sa-settings-card"><h2>Bet and platform fee</h2><div className="sa-form-fields">
                    <label>Minimum bet (credits)<input type="number" min="0" value={settings.minimumBet} onChange={(event) => setSettings((current) => ({ ...current, minimumBet: Number(event.target.value) }))} /></label>
                    <label>Platform fee (%)<input type="number" min="0" max="100" value={settings.feePercent} onChange={(event) => setSettings((current) => ({ ...current, feePercent: Number(event.target.value) }))} /></label>
                  </div></div>
                  <div className="sa-settings-card"><h2>Tournaments</h2>
                    <label className="sa-switch-row">Enable tournaments<input type="checkbox" checked={settings.tournamentEnabled} onChange={(event) => setSettings((current) => ({ ...current, tournamentEnabled: event.target.checked }))} /></label>
                    <div className="sa-form-fields"><label>Tournament entry (credits)<input type="number" min="0" value={settings.tournamentEntry} onChange={(event) => setSettings((current) => ({ ...current, tournamentEntry: Number(event.target.value) }))} /></label></div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 15px 15px' }}>
                  <button type="button" className="sa-primary" onClick={saveSettings} disabled={settingsSaving}>{settingsSaving ? 'Saving…' : 'Save settings'}</button>
                </div>
              </section>
            </>
          )}
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
                {dialog.action === 'create-master' && <label>Password<input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required minLength={8} /></label>}
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
