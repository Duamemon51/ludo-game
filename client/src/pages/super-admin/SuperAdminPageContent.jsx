import SuperAdminAuditLogPage from './SuperAdminAuditLogPage';
import SuperAdminDashboardPage from './SuperAdminDashboardPage';
import SuperAdminMastersPage from './SuperAdminMastersPage';
import SuperAdminMatchesPage from './SuperAdminMatchesPage';
import SuperAdminMoneyOverviewPage from './SuperAdminMoneyOverviewPage';
import SuperAdminSettingsPage from './SuperAdminSettingsPage';
import SuperAdminUsersPage from './SuperAdminUsersPage';
import SuperAdminWalletRequestsPage from './SuperAdminWalletRequestsPage';

export default function SuperAdminPageContent({
  page,
  dashboardStats,
  totalUsers,
  matchesToday,
  feeToday,
  pendingCount,
  requests,
  masters,
  moneyStats,
  totalHeld,
  money,
  createChartPoints,
  onNavigate,
  detailMaster,
  initials,
  onOpenDialog,
  onToggleMaster,
  onOpenMasterDetails,
  onToggleUser,
  onBackToMasters,
  selectedMasterId,
  onSelectMaster,
  selectedMaster,
  selectedMasterUsers,
  search,
  onSearchChange,
  filteredMatches,
  audit,
  settings,
  setSettings,
  settingsSaving,
  onSaveSettings,
}) {
  switch (page) {
    case 'Dashboard':
      return (
        <SuperAdminDashboardPage
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
          onViewWalletRequests={() => onNavigate('Wallet requests')}
        />
      );
    case 'Masters':
      return (
        <SuperAdminMastersPage
          detailMaster={detailMaster}
          masters={masters}
          requests={requests}
          money={money}
          initials={initials}
          onOpenDialog={onOpenDialog}
          onToggleMaster={onToggleMaster}
          onOpenMasterDetails={onOpenMasterDetails}
          onToggleUser={onToggleUser}
          onBack={onBackToMasters}
        />
      );
    case 'Wallet requests':
      return (
        <SuperAdminWalletRequestsPage
          requests={requests}
          masters={masters}
          pendingCount={pendingCount}
          money={money}
          onOpenDialog={onOpenDialog}
        />
      );
    case 'Users':
      return (
        <SuperAdminUsersPage
          masters={masters}
          selectedMasterId={selectedMasterId}
          onSelectMaster={onSelectMaster}
          selectedMaster={selectedMaster}
          selectedMasterUsers={selectedMasterUsers}
          totalUsers={totalUsers}
          onToggleUser={onToggleUser}
        />
      );
    case 'All matches':
      return (
        <SuperAdminMatchesPage
          search={search}
          onSearchChange={onSearchChange}
          matches={filteredMatches}
          money={money}
        />
      );
    case 'Money overview':
      return <SuperAdminMoneyOverviewPage moneyStats={moneyStats} totalHeld={totalHeld} money={money} />;
    case 'Audit log':
      return <SuperAdminAuditLogPage entries={audit} />;
    case 'Settings':
      return (
        <SuperAdminSettingsPage
          settings={settings}
          setSettings={setSettings}
          settingsSaving={settingsSaving}
          onSave={onSaveSettings}
        />
      );
    default:
      return null;
  }
}
