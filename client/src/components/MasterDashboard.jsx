import { useCallback, useEffect, useState } from 'react';
import { masterRequest } from '../masterApi';
import DashboardHeader from './DashboardHeader';
import DashboardSidebar from './DashboardSidebar';
import MasterRowActions from './MasterRowActions';

const pages = [
  ['Dashboard', 'dashboard'],
  ['Users', 'users'],
  ['User requests', 'requests'],
  ['My wallet', 'wallet'],
  ['Matches', 'matches'],
];
const formatAmount = (value) => `${Number(value || 0).toLocaleString()} credits`;
const initials = (name = '') => name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase();

async function loadMasterData(token) {
  const [profile, dashboard, users, userWithdrawals, wallet, matches] = await Promise.all([
    masterRequest('/me', { token }),
    masterRequest('/dashboard', { token }),
    masterRequest('/users', { token }),
    masterRequest('/user-withdrawals', { token }),
    masterRequest('/wallet', { token }),
    masterRequest('/matches', { token }),
  ]);
  return { profile, dashboard, users, userWithdrawals, wallet, matches };
}

function MasterDashboard({ token, onBack }) {
  const [activePage, setActivePage] = useState('Dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((open) => !open), []);
  const [master, setMaster] = useState(null);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [wallet, setWallet] = useState({ balance: 0, ledger: [], withdrawals: [] });
  const [userWithdrawals, setUserWithdrawals] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userDetails, setUserDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [requestSyncError, setRequestSyncError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);
  const [userName, setUserName] = useState('');
  const [userLoginId, setUserLoginId] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userStatus, setUserStatus] = useState('ACTIVE');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');

  const refreshData = useCallback(async () => {
    try {
      const data = await loadMasterData(token);
      setMaster(data.profile);
      setStats(data.dashboard);
      setUsers(data.users);
      setUserWithdrawals(data.userWithdrawals);
      setWallet(data.wallet);
      setMatches(data.matches);
      setLoadError('');
      setRequestSyncError('');
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    loadMasterData(token).then((data) => {
      if (!active) return;
      setMaster(data.profile);
      setStats(data.dashboard);
      setUsers(data.users);
      setUserWithdrawals(data.userWithdrawals);
      setWallet(data.wallet);
      setMatches(data.matches);
      setLoadError('');
      setRequestSyncError('');
    }).catch((error) => {
      if (active) setLoadError(error.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    let active = true;
    const refreshRequests = async () => {
      if (saving || document.visibilityState !== 'visible') return;
      try {
        const requests = await masterRequest('/user-withdrawals', { token });
        if (active) {
          setUserWithdrawals(requests);
          setRequestSyncError('');
        }
      } catch (error) {
        if (active) setRequestSyncError(error.message);
      }
    };

    const intervalId = window.setInterval(refreshRequests, 15000);
    document.addEventListener('visibilitychange', refreshRequests);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshRequests);
    };
  }, [saving, token]);

  useEffect(() => {
    const expireSession = () => onBack();
    window.addEventListener('master:unauthorized', expireSession);
    return () => window.removeEventListener('master:unauthorized', expireSession);
  }, [onBack]);

  useEffect(() => {
    if (!selectedUserId) return undefined;
    let active = true;
    masterRequest(`/users/${selectedUserId}`, { token })
      .then((details) => {
        if (active) setUserDetails(details);
      })
      .catch((error) => {
        if (active) setNotice(error.message);
      });
    return () => { active = false; };
  }, [selectedUserId, token]);

  const selectedUser = users.find((user) => user.id === selectedUserId);
  const displayedUser = selectedUser && userDetails?.id === selectedUserId
    ? { ...selectedUser, ...userDetails }
    : selectedUser;
  const pendingMasterWithdrawals = wallet.withdrawals
    .filter((request) => request.type === 'Withdrawal' && request.status === 'Pending')
    .reduce((sum, request) => sum + request.amount, 0);
  const availableMasterBalance = Math.max(0, (stats?.wallet || 0) - pendingMasterWithdrawals);
  const pendingUserRequests = userWithdrawals.filter((request) => request.status === 'Pending');
  const availableUserBalance = (user) => Math.max(0, user.wallet - (user.heldAmount || 0));
  const recentMatches = matches.slice(0, 5);
  const sendWithdrawalRequest = master?.status === 'Active' && availableMasterBalance > 0;
  const matchCountToday = stats?.matchesToday || 0;

  const openDialog = (action, user = null, request = null, decision = null) => {
    setDialog({ action, userId: user?.id || null, requestId: request?.id || null, requestType: request?.type || null, decision });
    setUserName(action === 'edit-user' ? user?.name || '' : '');
    setUserLoginId(action === 'edit-user' ? user?.loginId || '' : '');
    setUserPhone(action === 'edit-user' ? user?.phone || '' : '');
    setUserPassword('');
    setUserStatus(action === 'edit-user' ? user?.status?.toUpperCase() || 'ACTIVE' : 'ACTIVE');
    setAmount('');
    setReason('');
    setFormError('');
  };

  const closeDialog = () => {
    if (saving) return;
    setDialog(null);
    setFormError('');
  };

  const submitDialog = async (event) => {
    event.preventDefault();
    if (!dialog || saving) return;
    setFormError('');
    setSaving(true);
    try {
      if (dialog.action === 'create-user') {
        const created = await masterRequest('/users', {
          token,
          method: 'POST',
          body: {
            name: userName,
            loginId: userLoginId,
            password: userPassword,
            phone: userPhone,
            status: userStatus,
            startingDeposit: Number(amount || 0),
            note: reason,
          },
        });
        setNotice(`${created.name} created successfully.`);
      } else if (dialog.action === 'edit-user') {
        await masterRequest(`/users/${dialog.userId}`, {
          token,
          method: 'PATCH',
          body: {
            name: userName,
            loginId: userLoginId,
            phone: userPhone,
            status: userStatus,
            ...(userPassword ? { password: userPassword } : {}),
          },
        });
        setNotice(`${userName} updated successfully${userPassword ? ' with a password reset' : ''}.`);
      } else if (dialog.action === 'withdraw-request') {
        await masterRequest('/withdrawals', {
          token,
          method: 'POST',
          body: { type: 'withdrawal', amount: Number(amount) },
        });
        setNotice('Withdrawal request sent to the Super Admin.');
      } else if (dialog.action === 'deposit-request') {
        await masterRequest('/withdrawals', {
          token,
          method: 'POST',
          body: { type: 'deposit', amount: Number(amount) },
        });
        setNotice('Deposit request sent to the Super Admin.');
      } else if (dialog.action === 'resolve-user-request') {
        await masterRequest(`/user-withdrawals/${dialog.requestId}`, {
          token,
          method: 'PATCH',
          body: { decision: dialog.decision.toUpperCase(), reason },
        });
        setNotice(`User ${dialog.requestType.toLowerCase()} ${dialog.decision.toLowerCase()}.`);
      } else {
        const action = dialog.action === 'user-deposit' ? 'deposit' : 'withdraw';
        const user = users.find((item) => item.id === dialog.userId);
        await masterRequest(`/users/${dialog.userId}/wallet`, {
          token,
          method: 'POST',
          body: { type: action, amount: Number(amount), note: reason },
        });
        setNotice(`${formatAmount(Number(amount))} ${action === 'deposit' ? 'deposited to' : 'withdrawn from'} ${user?.name || 'user'} wallet.`);
      }
      setDialog(null);
      await refreshData();
      if (dialog.userId && selectedUserId === dialog.userId) {
        const detail = await masterRequest(`/users/${dialog.userId}`, { token });
        setUserDetails(detail);
      }
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const changeUserStatus = async (user, status) => {
    try {
      await masterRequest(`/users/${user.id}`, {
        token,
        method: 'PATCH',
        body: { name: user.name, loginId: user.loginId, phone: user.phone, status },
      });
      setNotice(`${user.name} set to ${status.toLowerCase()}.`);
      await refreshData();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const toggleBlock = async (user) => {
    try {
      const action = user.status === 'Blocked' ? 'unblock' : 'block';
      const result = await masterRequest(`/users/${user.id}/status`, {
        token,
        method: 'PATCH',
        body: { action },
      });
      setNotice(`${user.name} ${action === 'block' ? 'blocked' : `restored to ${result.status.toLowerCase()}`}.`);
      await refreshData();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const masterRequestRows = wallet.withdrawals;

  return (
    <main className="master-dashboard">
      <style>{`
        .master-dashboard { --md-ink:#172033;--md-muted:#8290a5;--md-line:#e9edf4;--md-blue:#536dfe;width:100%;min-width:0;min-height:100vh;min-height:100dvh;flex:1;align-self:stretch;display:flex;overflow-x:hidden;color:var(--md-ink);background:#f5f7fb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif }
        .md-sidebar{width:248px;flex:0 0 248px;display:flex;flex-direction:column;padding:26px 16px 18px;color:#d7dced;background:#151a2d}
        .md-brand{display:flex;align-items:center;gap:11px;padding:0 9px 30px}.md-brand-mark{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;color:#fff;background:linear-gradient(145deg,#7a8cff,#4c5ee8);font-size:15px;font-weight:900;box-shadow:0 5px 14px #536dfe59}.md-brand-name{color:#fff;font-size:16px;font-weight:800;letter-spacing:.5px}.md-brand-caption{margin-top:2px;color:#8e98b1;font-size:10px;font-weight:700;letter-spacing:1.4px}
        .md-master-card{margin:0 3px 25px;padding:12px;border:1px solid #ffffff14;border-radius:11px;background:#ffffff08}.md-master-card strong,.md-master-card span{display:block}.md-master-card strong{color:#fff;font-size:12px}.md-master-card span{margin-top:4px;color:#9aa5bd;font-size:10px}
        .md-nav-label{padding:0 12px 9px;color:#78829c;font-size:10px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase}.md-nav{display:grid;gap:5px}.md-nav button{width:100%;min-height:43px;display:flex;align-items:center;gap:11px;padding:0 11px;border:0;border-radius:9px;color:#aab3c9;background:transparent;text-align:left;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.md-nav button:hover{color:#fff;background:#ffffff12}.md-nav button.selected{color:#fff;background:#293253;box-shadow:inset 3px 0 #8290ff}.md-nav-icon{width:25px;height:25px;display:grid;place-items:center;border-radius:7px;color:#abb8ff;background:#8290ff21;font-size:9px;font-weight:900}
        .md-sidebar-bottom{margin-top:auto}.md-back{width:100%;min-height:36px;margin-top:11px;border:1px solid #ffffff29;border-radius:8px;color:#dce2f1;background:transparent;font:inherit;font-size:11px;font-weight:700;cursor:pointer}
        .md-main{min-width:0;flex:1}.md-topbar{min-height:72px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:0 32px;border-bottom:1px solid var(--md-line);background:#fff}.md-crumb{color:var(--md-muted);font-size:12px}.md-crumb strong{color:var(--md-ink)}.md-top-actions{display:flex;align-items:center;gap:11px}.md-back-top{min-height:33px;padding:0 10px;border:1px solid var(--md-line);border-radius:8px;color:#647087;background:#fff;font:inherit;font-size:10px;font-weight:750;cursor:pointer}.md-avatar{width:35px;height:35px;display:grid;place-items:center;border-radius:50%;color:#fff;background:linear-gradient(145deg,#72a8ff,#5269ef);font-size:11px;font-weight:850}
        .md-content{width:min(100%,1440px);min-width:0;box-sizing:border-box;margin:0 auto;padding:30px 32px 42px}.md-notice,.md-error-banner{margin-bottom:15px;padding:10px 13px;border:1px solid #ccecdf;border-radius:9px;color:#187c60;background:#effaf5;font-size:11px;font-weight:700;overflow-wrap:anywhere}.md-error-banner{border-color:#f2d5d9;color:#bd4756;background:#fff0f1}.md-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px}.md-heading>div{min-width:0}.md-eyebrow{margin:0 0 7px;color:#7383ff;font-size:10px;font-weight:850;letter-spacing:1.6px}.md-heading h1{margin:0;font-size:clamp(24px,3vw,29px);letter-spacing:-.7px;overflow-wrap:anywhere}.md-subtitle{margin:7px 0 0;color:var(--md-muted);font-size:12px;line-height:1.5}
        .md-primary{min-height:37px;padding:0 12px;border:1px solid var(--md-blue);border-radius:8px;color:#fff;background:var(--md-blue);font:inherit;font-size:10px;font-weight:750;cursor:pointer}.md-primary:hover{background:#4058ed}.md-primary:disabled,.md-action:disabled{opacity:.48;cursor:not-allowed}
        .md-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:17px}.md-stats-five{grid-template-columns:repeat(5,minmax(0,1fr))}.md-stat{padding:16px;border:1px solid var(--md-line);border-radius:12px;background:#fff}.md-stat span{display:block;color:var(--md-muted);font-size:10px;font-weight:650}.md-stat strong{display:block;margin-top:8px;color:#26334a;font-size:20px}.md-stat small{display:block;margin-top:4px;color:var(--md-muted);font-size:9px}
        .md-card{min-width:0;margin-top:16px;border:1px solid var(--md-line);border-radius:13px;background:#fff;box-shadow:0 3px 12px #1a274608}.md-card:first-of-type{margin-top:0}.md-card-head{min-height:57px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 16px;border-bottom:1px solid #f0f2f7}.md-card-head h2{margin:0;font-size:13px}.md-card-head span{color:var(--md-muted);font-size:10px}.md-table-wrap{width:100%;min-width:0;overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}.md-table{width:max-content;min-width:100%;border-collapse:collapse;text-align:left}.md-table th{padding:11px 15px;color:#929db0;background:#fbfcfe;font-size:9px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;white-space:nowrap}.md-table td{padding:12px 15px;border-top:1px solid #f1f3f7;color:#58647a;font-size:10px;white-space:nowrap}.md-user{display:flex;align-items:center;gap:8px}.md-user-avatar{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;color:#fff;background:linear-gradient(145deg,#82a6ff,#5269ef);font-size:9px;font-weight:850}.md-user-copy strong,.md-user-copy span{display:block}.md-user-copy strong{color:#38445a;font-size:10px}.md-user-copy span{margin-top:3px;color:#9aa4b4;font-size:9px}
        .md-status{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;color:#15956e;background:#eaf8f2;font-size:9px;font-weight:800}.md-status::before{width:5px;height:5px;border-radius:50%;background:currentColor;content:""}.md-status.inactive,.md-status.blocked,.md-status.cancelled,.md-status.pending,.md-status.rejected{color:#bd4756;background:#fff0f1}
        .md-action{min-height:29px;padding:0 8px;border:1px solid #dfe4ee;border-radius:7px;color:#5e6b82;background:#fff;font:inherit;font-size:9px;font-weight:750;cursor:pointer}.md-action:hover{background:#f7f8fc}.md-action.primary{color:#4e62e8;border-color:#dce1ff;background:#f6f7ff}.md-action.danger{color:#bd4756;border-color:#f2d5d9}.md-action:disabled{opacity:.48;cursor:not-allowed}.md-actions{display:flex;align-items:center;flex-wrap:wrap;gap:5px}.md-user-select{min-height:29px;padding:0 6px;border:1px solid #dfe4ee;border-radius:7px;color:#5e6b82;background:#fff;font:inherit;font-size:9px}.md-wallet{color:#313e55;font-size:11px;font-weight:800}
        .md-row-actions{display:flex;justify-content:center}.md-row-actions-trigger{display:grid;place-items:center;width:34px;height:34px;padding:0;border:1px solid transparent;border-radius:9px;color:#647087;background:transparent;cursor:pointer}.md-row-actions-trigger:hover,.md-row-actions-trigger[aria-expanded=true]{border-color:#dfe4ee;color:#4e62e8;background:#f6f7ff}.md-row-actions-trigger svg{fill:currentColor}.md-row-actions-trigger:focus-visible,.md-row-actions-item:focus-visible{outline:2px solid #536dfe;outline-offset:2px}.md-row-actions-menu{--md-ink:#172033;--md-line:#e9edf4;--md-blue:#536dfe;position:fixed;z-index:1000;min-width:176px;max-height:calc(100dvh - 16px);overflow-y:auto;padding:5px;border:1px solid var(--md-line);border-radius:11px;background:#fff;box-shadow:0 12px 32px #1720332e}.md-row-actions-item{display:flex;align-items:center;width:100%;min-height:38px;padding:8px 10px;border:0;border-radius:7px;color:var(--md-ink);background:transparent;font:inherit;font-size:11px;text-align:left;white-space:nowrap;cursor:pointer}.md-row-actions-item:hover{background:#f5f7fb}.md-row-actions-item.primary{color:#4e62e8}.md-row-actions-item.danger{color:#bd4756}.md-row-actions-item:disabled{opacity:.45;cursor:not-allowed}
        .md-balance{display:flex;flex-wrap:wrap;gap:18px;padding:16px}.md-balance span{display:block;color:#8b97aa;font-size:10px}.md-balance strong{display:block;margin-top:5px;color:#29364c;font-size:17px}.md-explainer{margin:0 16px 15px;padding:10px 12px;border:1px solid #f4e3c2;border-radius:8px;color:#916624;background:#fff9ec;font-size:10px;line-height:1.5}.md-empty{padding:25px!important;color:#8995a8!important;text-align:center}
        .md-dialog-backdrop{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:18px;background:#0f16208c}.md-dialog{width:min(100%,410px);max-height:90dvh;overflow-y:auto;padding:22px;border:1px solid var(--md-line);border-radius:15px;background:#fff;box-shadow:0 24px 70px #0a122047}.md-dialog h2{margin:0;color:#202b40;font-size:18px}.md-dialog>p{margin:7px 0 17px;color:#8290a5;font-size:11px;line-height:1.5}.md-fields{display:grid;gap:11px}.md-fields label{display:grid;gap:6px;color:#526078;font-size:10px;font-weight:750}.md-fields input,.md-fields select,.md-fields textarea{min-height:41px;width:100%;padding:0 10px;border:1px solid #dfe4ee;border-radius:8px;color:#27344a;background:#fff;font:inherit;font-size:12px}.md-fields textarea{min-height:72px;padding:9px 10px;resize:vertical}.md-error{margin:10px 0 0!important;color:#bc4351!important;font-size:11px}.md-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:19px}.md-dialog-actions button{min-height:37px;padding:0 12px;border:1px solid #dfe4ee;border-radius:8px;color:#647087;background:#fff;font:inherit;font-size:10px;font-weight:750;cursor:pointer}.md-dialog-actions button[type=submit]{color:#fff;border-color:var(--md-blue);background:var(--md-blue)}
        @media(max-width:1100px){.md-stats-five{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:900px){.md-content{padding:25px 20px 34px}.md-topbar{padding-right:20px;padding-left:20px}.md-stats-five{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:680px){.md-content{width:100%;padding:20px 12px 28px}.md-topbar{min-height:54px;padding:0 13px}.md-heading{align-items:flex-start;flex-wrap:wrap;gap:12px}.md-heading>.md-actions{width:100%;flex-wrap:wrap}.md-heading>.md-primary{max-width:100%}.md-stats,.md-stats-five{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.md-stat{min-width:0;padding:12px}.md-stat strong{font-size:16px;overflow-wrap:anywhere}.md-card-head{min-height:52px;padding:10px 12px;align-items:flex-start;flex-direction:column;justify-content:center;gap:4px}.md-actions{flex-wrap:wrap}.md-dialog-backdrop{align-items:end;padding:10px 10px max(10px,env(safe-area-inset-bottom))}.md-dialog{width:100%;max-height:min(88dvh,780px);padding:20px 16px;border-radius:18px}.md-dialog-actions{position:sticky;bottom:-20px;padding:12px 0 max(2px,env(safe-area-inset-bottom));background:#fff}.md-fields input,.md-fields select,.md-fields textarea{font-size:16px}}@media(max-width:420px){.md-content{padding-right:9px;padding-left:9px}.md-stats,.md-stats-five{grid-template-columns:1fr}.md-table th,.md-table td{padding:10px 9px}.md-balance{gap:14px;padding:13px}.md-dialog-actions{flex-direction:column-reverse}.md-dialog-actions button{width:100%}}
      `}</style>

      <DashboardSidebar
        variant="master"
        open={sidebarOpen}
        onClose={closeSidebar}
        brandSubtitle="MASTER PANEL"
        sectionLabel="Management"
        ariaLabel="Master panel"
        activeItem={activePage}
        navItems={pages.map(([label, icon]) => ({
          label,
          icon,
          count: label === 'User requests' ? pendingUserRequests.length : 0,
        }))}
        onNavigate={(label) => {
          setActivePage(label);
          setSelectedUserId('');
          setNotice('');
        }}
        accountName={master?.name}
        accountLoginId={master?.loginId}
        onSignOut={onBack}
      />

      <section className="md-main">
        <DashboardHeader
          variant="master"
          breadcrumb={<>Master panel <span aria-hidden="true">/</span> <strong>{activePage}</strong></>}
          avatarText={initials(master?.name)}
          avatarLabel="Master account"
          onSignOut={onBack}
          menuOpen={sidebarOpen}
          onMenuToggle={toggleSidebar}
        />
        <div className="md-content">
          {notice && <div className="md-notice" role="status">{notice}</div>}
          {loadError && <div className="md-error-banner" role="alert">{loadError} <button type="button" className="md-action" onClick={refreshData}>Retry</button></div>}
          {requestSyncError && <div className="md-error-banner" role="alert">Could not refresh user wallet requests: {requestSyncError}</div>}
          {loading && <section className="md-card"><div className="md-card-head"><h2>Loading Master data</h2></div><div className="md-balance">Connecting to your account…</div></section>}
          {!loading && master && (
            <>
              {activePage === 'Dashboard' && <>
                <div className="md-heading"><div><p className="md-eyebrow">MASTER OVERVIEW</p><h1>Dashboard</h1><p className="md-subtitle">Live wallet, users and match activity from your account.</p></div></div>
                <div className="md-stats md-stats-five">
                  <div className="md-stat"><span>My wallet balance</span><strong>{formatAmount(stats?.wallet)}</strong></div>
                  <div className="md-stat"><span>Total users</span><strong>{stats?.totalUsers || 0}</strong></div>
                  <div className="md-stat"><span>Active users</span><strong>{stats?.activeUsers || 0}</strong></div>
                  <div className="md-stat"><span>Matches today</span><strong>{matchCountToday}</strong></div>
                  <div className="md-stat"><span>Pending user withdrawals</span><strong>{stats?.pendingUserWithdrawals || 0}</strong><small>{formatAmount(stats?.pendingUserWithdrawalAmount)}</small></div>
                </div>
                <section className="md-card"><div className="md-card-head"><h2>Recent matches</h2><button type="button" className="md-action primary" onClick={() => setActivePage('Matches')}>View all matches</button></div><div className="md-table-wrap"><table className="md-table"><thead><tr><th>Match ID</th><th>Players</th><th>Bet</th><th>Fee</th><th>Status</th><th>Winner</th><th>Time</th></tr></thead><tbody>
                  {recentMatches.map((match) => <tr key={match.id}><td><strong>{match.id}</strong></td><td>{match.players}</td><td>{formatAmount(match.bet)}</td><td>{formatAmount(match.fee)}</td><td>{match.status}</td><td>{match.winner || '—'}</td><td>{match.date} · {match.time}</td></tr>)}
                  {!recentMatches.length && <tr><td className="md-empty" colSpan="7">No matches recorded yet.</td></tr>}
                </tbody></table></div></section>
              </>}

              {activePage === 'Users' && !selectedUser && <>
                <div className="md-heading"><div><p className="md-eyebrow">YOUR ACCOUNTS</p><h1>Users</h1><p className="md-subtitle">Only users managed by your Master account are shown here.</p></div><button type="button" className="md-primary" disabled={master.status !== 'Active'} onClick={() => openDialog('create-user')}>+ Create user</button></div>
                <section className="md-card"><div className="md-card-head"><h2>Managed users</h2><span>{users.length} accounts · live data</span></div><div className="md-table-wrap"><table className="md-table"><thead><tr><th>User</th><th>Login ID</th><th>Status</th><th>Wallet</th><th>Last played</th><th>Created</th><th>Actions</th></tr></thead><tbody>
                  {users.map((user) => <tr key={user.id}>
                    <td><div className="md-user"><span className="md-user-avatar">{initials(user.name)}</span><span className="md-user-copy"><strong>{user.name}</strong><span>{user.phone || 'No phone'}</span></span></div></td>
                    <td>{user.loginId}</td><td><span className={`md-status ${user.status.toLowerCase()}`}>{user.status}</span></td><td><span className="md-wallet">{formatAmount(user.wallet)}</span></td><td>{user.lastPlayed}</td><td>{user.createdAt}</td>
                    <td><MasterRowActions
                      label={`Actions for ${user.name}`}
                      actions={[
                        { label: 'Deposit', tone: 'primary', disabled: master.status !== 'Active' || user.status === 'Blocked', onSelect: () => openDialog('user-deposit', user) },
                        { label: 'Withdraw', disabled: master.status !== 'Active' || user.status === 'Blocked' || availableUserBalance(user) <= 0, onSelect: () => openDialog('user-withdraw', user) },
                        ...(user.status !== 'Blocked' ? [{
                          label: `Set ${user.status === 'Active' ? 'inactive' : 'active'}`,
                          disabled: master.status !== 'Active' || user.gameState === 'Playing',
                          onSelect: () => changeUserStatus(user, user.status === 'Active' ? 'INACTIVE' : 'ACTIVE'),
                        }] : []),
                        { label: user.status === 'Blocked' ? 'Unblock' : 'Block', tone: user.status === 'Blocked' ? '' : 'danger', disabled: master.status !== 'Active' || user.gameState === 'Playing', onSelect: () => toggleBlock(user) },
                        { label: 'Edit', disabled: master.status !== 'Active' || user.status === 'Blocked', onSelect: () => openDialog('edit-user', user) },
                        { label: 'View history', onSelect: () => setSelectedUserId(user.id) },
                      ]}
                    /></td>
                  </tr>)}
                  {!users.length && <tr><td className="md-empty" colSpan="7">No users yet. Create a user to get started.</td></tr>}
                </tbody></table></div></section>
              </>}

              {activePage === 'Users' && selectedUser && displayedUser && <>
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
              </>}

              {activePage === 'User requests' && <><div className="md-heading"><div><p className="md-eyebrow">USER WALLET REQUESTS</p><h1>User deposit and withdrawal requests</h1><p className="md-subtitle">Approve deposits to debit your Master wallet and credit the user, or approve withdrawals to do the reverse. Rejections require a reason.</p></div></div>
                <section className="md-card"><div className="md-card-head"><h2>Requests from your users</h2><span>{pendingUserRequests.length} pending</span></div><div className="md-table-wrap"><table className="md-table"><thead><tr><th>Request ID</th><th>User</th><th>Type</th><th>Amount</th><th>Date</th><th>User balance</th><th>Status</th><th>Decision</th></tr></thead><tbody>
                  {userWithdrawals.map((request) => <tr key={request.id}><td><strong>{request.id}</strong></td><td>{request.userName}</td><td>{request.type}</td><td>{formatAmount(request.amount)}</td><td>{request.date}</td><td>{formatAmount(request.userBalance)}</td><td><span className={`md-status ${request.status.toLowerCase()}`}>{request.status}</span></td><td>{request.status === 'Pending' ? <MasterRowActions label={`Decide on ${request.type.toLowerCase()} request from ${request.userName}`} actions={[{ label: 'Approve', tone: 'primary', disabled: master.status !== 'Active', onSelect: () => openDialog('resolve-user-request', null, request, 'Approved') }, { label: 'Reject', tone: 'danger', disabled: master.status !== 'Active', onSelect: () => openDialog('resolve-user-request', null, request, 'Rejected') }]} /> : request.reason || 'Reviewed'}</td></tr>)}
                  {!userWithdrawals.length && <tr><td className="md-empty" colSpan="8">No wallet requests from users.</td></tr>}
                </tbody></table></div></section>
              </>}

              {activePage === 'My wallet' && <><div className="md-heading"><div><p className="md-eyebrow">MASTER WALLET</p><h1>My wallet</h1><p className="md-subtitle">Request a deposit or withdrawal from the Super Admin.</p></div><div className="md-actions"><button type="button" className="md-action primary" disabled={master.status !== 'Active'} onClick={() => openDialog('deposit-request')}>Request deposit</button><button type="button" className="md-primary" disabled={!sendWithdrawalRequest} onClick={() => openDialog('withdraw-request')}>Request withdrawal</button></div></div>
                <section className="md-card"><div className="md-card-head"><h2>Wallet balance</h2><span>Admin review required</span></div><div className="md-balance"><div><span>Master wallet</span><strong>{formatAmount(stats.wallet)}</strong></div><div><span>Pending withdrawals</span><strong>{formatAmount(pendingMasterWithdrawals)}</strong></div><div><span>Available balance</span><strong>{formatAmount(availableMasterBalance)}</strong></div></div><p className="md-explainer">Pending withdrawals are held from your available balance. Deposit requests add funds only after Super Admin approval.</p></section>
                <section className="md-card"><div className="md-card-head"><h2>Wallet ledger</h2><span>All credits and debits</span></div><div className="md-table-wrap"><table className="md-table"><thead><tr><th>Type</th><th>Amount</th><th>Balance after</th><th>Note</th><th>Date</th></tr></thead><tbody>
                  {wallet.ledger.map((entry) => <tr key={entry.id}><td>{entry.type}</td><td>{formatAmount(entry.amount)}</td><td>{formatAmount(entry.balanceAfter)}</td><td>{entry.note}</td><td>{entry.date}</td></tr>)}
                  {!wallet.ledger.length && <tr><td className="md-empty" colSpan="5">No wallet transactions.</td></tr>}
                </tbody></table></div></section>
                <section className="md-card"><div className="md-card-head"><h2>Wallet request history</h2><span>Submitted to Super Admin</span></div><div className="md-table-wrap"><table className="md-table"><thead><tr><th>Request ID</th><th>Type</th><th>Amount</th><th>Status</th><th>Submitted</th><th>Review note</th></tr></thead><tbody>
                  {masterRequestRows.map((request) => <tr key={request.id}><td><strong>{request.id}</strong></td><td>{request.type}</td><td>{formatAmount(request.amount)}</td><td><span className={`md-status ${request.status.toLowerCase()}`}>{request.status}</span></td><td>{request.date}</td><td>{request.reason || '—'}</td></tr>)}
                  {!masterRequestRows.length && <tr><td className="md-empty" colSpan="6">No wallet requests yet.</td></tr>}
                </tbody></table></div></section>
              </>}

              {activePage === 'Matches' && <><div className="md-heading"><div><p className="md-eyebrow">MATCH RECORDS</p><h1>Matches</h1><p className="md-subtitle">Live and finished matches played by your users.</p></div></div>
                <section className="md-card"><div className="md-card-head"><h2>Users’ matches</h2><span>{matches.length} matches · live data</span></div><div className="md-table-wrap"><table className="md-table"><thead><tr><th>Match ID</th><th>Players</th><th>Bet</th><th>Platform fee</th><th>Winner</th><th>Payout</th><th>Status</th><th>Time</th></tr></thead><tbody>
                  {matches.map((match) => <tr key={match.id}><td><strong>{match.id}</strong></td><td>{match.players}</td><td>{formatAmount(match.bet)}</td><td>{formatAmount(match.fee)}</td><td>{match.winner || '—'}</td><td>{formatAmount(match.payout)}</td><td>{match.status}</td><td>{match.date} · {match.time}</td></tr>)}
                  {!matches.length && <tr><td className="md-empty" colSpan="8">No matches recorded yet.</td></tr>}
                </tbody></table></div></section>
              </>}
            </>
          )}
        </div>
      </section>

      {dialog && (
        <div className="md-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <form className="md-dialog" onSubmit={submitDialog} aria-labelledby="md-dialog-title">
            <h2 id="md-dialog-title">
              {dialog.action === 'create-user' ? 'Create user' :
                dialog.action === 'edit-user' ? `Edit ${userName}` :
                  dialog.action === 'withdraw-request' ? 'Request withdrawal from Super Admin' :
                    dialog.action === 'deposit-request' ? 'Request deposit from Super Admin' :
                      dialog.action === 'resolve-user-request' ? `${dialog.decision} user ${dialog.requestType?.toLowerCase()} request` :
                        `${dialog.action === 'user-deposit' ? 'Deposit to' : 'Withdraw from'} ${users.find((user) => user.id === dialog.userId)?.name || 'user'} wallet`}
            </h2>
            <p>{dialog.action === 'create-user' ? 'Create a user account under this Master.' : dialog.action === 'edit-user' ? 'Update this user’s account details and status.' : dialog.action === 'withdraw-request' ? 'This amount will be held from your available wallet balance while pending.' : dialog.action === 'deposit-request' ? 'The requested amount will be added to your Master wallet only after Super Admin approval.' : dialog.action === 'resolve-user-request' ? dialog.decision === 'Rejected' ? 'A reason is required and will be saved in request history.' : dialog.requestType === 'Deposit' ? 'Approve to debit your Master wallet and credit the user wallet.' : 'Approve to debit the user wallet and credit your Master wallet.' : 'Every wallet change is recorded on both wallets inside a database transaction.'}</p>
            {dialog.action === 'create-user' || dialog.action === 'edit-user' ? <div className="md-fields">
              <label>Name<input value={userName} onChange={(event) => setUserName(event.target.value)} required maxLength={100} autoFocus /></label>
              <label>Login ID or email<input value={userLoginId} onChange={(event) => setUserLoginId(event.target.value)} required maxLength={50} /></label>
              <label>{dialog.action === 'create-user' ? 'Password' : 'New password (optional)'}<input type="password" value={userPassword} onChange={(event) => setUserPassword(event.target.value)} required={dialog.action === 'create-user'} minLength={8} maxLength={200} autoComplete="new-password" placeholder={dialog.action === 'edit-user' ? 'Leave blank to keep current password' : ''} /></label>
              <label>Phone (optional)<input value={userPhone} onChange={(event) => setUserPhone(event.target.value)} maxLength={30} /></label>
              <label>Account status<select value={userStatus} onChange={(event) => setUserStatus(event.target.value)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
              {dialog.action === 'create-user' && <label>Starting deposit (optional)<input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>}
              {dialog.action === 'create-user' && Number(amount) > 0 && <label>Deposit note<input value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={500} /></label>}
              {dialog.action === 'create-user' && <span>Available Master wallet: {formatAmount(availableMasterBalance)}</span>}
            </div> : dialog.action === 'resolve-user-request' ? <div className="md-fields">
              {dialog.decision === 'Rejected' && <label>Rejection reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={500} autoFocus /></label>}
              {dialog.decision === 'Approved' && <><span>Request amount: {formatAmount(userWithdrawals.find((request) => request.id === dialog.requestId)?.amount)}</span>{dialog.requestType === 'Deposit' && <span>Available Master wallet: {formatAmount(availableMasterBalance)}</span>}</>}
            </div> : <div className="md-fields">
              <label>Amount in credits<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required autoFocus /></label>
              {dialog.action === 'user-deposit' && <span>Available Master wallet: {formatAmount(availableMasterBalance)}</span>}
              {dialog.action === 'user-withdraw' && <span>Available user wallet: {formatAmount(availableUserBalance(users.find((user) => user.id === dialog.userId) || { wallet: 0 }))}</span>}
              {(dialog.action === 'withdraw-request' || dialog.action === 'deposit-request') && <span>Current Master wallet: {formatAmount(stats?.wallet)}</span>}
              {dialog.action !== 'withdraw-request' && dialog.action !== 'deposit-request' && <label>Transaction note<textarea value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={500} /></label>}
            </div>}
            {formError && <p className="md-error" role="alert">{formError}</p>}
            <div className="md-dialog-actions"><button type="button" disabled={saving} onClick={closeDialog}>Cancel</button><button type="submit" disabled={saving}>{saving ? 'Saving…' : dialog.action === 'create-user' ? 'Create user' : dialog.action === 'edit-user' ? 'Save changes' : dialog.action === 'resolve-user-request' ? dialog.decision : dialog.action === 'user-deposit' ? 'Deposit' : dialog.action === 'user-withdraw' ? 'Withdraw' : dialog.action === 'deposit-request' ? 'Request deposit' : 'Request withdrawal'}</button></div>
          </form>
        </div>
      )}
    </main>
  );
}

export default MasterDashboard;
